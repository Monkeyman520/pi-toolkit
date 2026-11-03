import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { Owner, readState, writeState } from "../extensions/coordination.ts";
import type { Snapshot } from "../extensions/providers.ts";
import {
	type ActivationConfig,
	dueActivation,
	type Ledger,
} from "../extensions/schedule.ts";

const owners: Owner[] = [];
const dirs: string[] = [];
afterEach(async () => {
	await Promise.all(owners.splice(0).map((x) => x.close()));
	await Promise.all(
		dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })),
	);
});
async function scope() {
	const d = await mkdtemp(join(tmpdir(), "quota-test-"));
	dirs.push(d);
	return d;
}
async function owner(d: string, refresh?: () => Promise<void>) {
	const o = new Owner(d, refresh);
	owners.push(o);
	return o;
}
describe("OS-owned maintenance", () => {
	it("allows exactly one owner and transfers ownership after close", async () => {
		const d = await scope(),
			a = await owner(d),
			b = await owner(d);
		const result = await Promise.all([a.acquire(), b.acquire()]);
		expect(result.filter(Boolean)).toHaveLength(1);
		const leader = a.active ? a : b,
			follower = a.active ? b : a;
		await leader.close();
		expect(await follower.acquire()).toBe(true);
	});
	it("does not merge separate account directories", async () => {
		const a = await owner(await scope()),
			b = await owner(await scope());
		expect(await a.acquire()).toBe(true);
		expect(await b.acquire()).toBe(true);
	});
	it("keeps one OS owner even if time jumps beyond a stale lease", async () => {
		const d = await scope(),
			a = await owner(d),
			b = await owner(d);
		expect(await a.acquire()).toBe(true);
		expect(await b.acquire()).toBe(false);
		await a.close();
	});
	it("atomically persists state and refuses to treat corrupt ledger as empty", async () => {
		const d = await scope();
		await writeState(d, { version: 1, snapshots: [], ledger: {} });
		expect(await readState(d)).toEqual({
			version: 1,
			snapshots: [],
			ledger: {},
		});
		await writeFile(join(d, "pi-quota-keeper-state.json"), "{corrupt");
		await expect(readState(d)).rejects.toThrow("refusing activation");
	});
});

describe("single-owner manual refresh", () => {
	it("routes follower refresh to the owner without transferring ownership", async () => {
		const d = await scope();
		let calls = 0;
		const leader = await owner(d, async () => {
			calls++;
		});
		const follower = await owner(d);
		expect(await leader.acquire()).toBe(true);
		expect(await follower.acquire()).toBe(false);
		expect(await follower.requestRefresh()).toBe(true);
		expect(calls).toBe(1);
		expect(leader.active).toBe(true);
		expect(follower.active).toBe(false);
	});
	it("coalesces concurrent local requests and permits a later refresh", async () => {
		const d = await scope();
		let calls = 0;
		let release!: () => void;
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		const leader = await owner(d, async () => {
			calls++;
			await gate;
		});
		await leader.acquire();
		const first = leader.requestRefresh(),
			second = leader.requestRefresh();
		release();
		expect(await Promise.all([first, second])).toEqual([true, true]);
		expect(calls).toBe(1);
		expect(await leader.requestRefresh()).toBe(true);
		expect(calls).toBe(2);
	});
	it("returns failure for a missing owner, absent callback or cancellation without fetching", async () => {
		const d = await scope();
		const follower = await owner(d);
		expect(await follower.requestRefresh()).toBe(false);
		await follower.acquire();
		expect(await follower.requestRefresh()).toBe(false);
		const controller = new AbortController();
		controller.abort();
		expect(await follower.requestRefresh(controller.signal)).toBe(false);
	});
	it("does not forward refresh between separate account directories", async () => {
		let calls = 0;
		const leader = await owner(await scope(), async () => {
			calls++;
		});
		await leader.acquire();
		const other = await owner(await scope());
		expect(await other.requestRefresh()).toBe(false);
		expect(calls).toBe(0);
	});
	it("does not claim success on callback failure and clears its in-flight state", async () => {
		const d = await scope();
		let calls = 0;
		const leader = await owner(d, async () => {
			if (++calls === 1) throw new Error("fixture");
		});
		await leader.acquire();
		expect(await leader.requestRefresh()).toBe(false);
		expect(await leader.requestRefresh()).toBe(true);
		expect(leader.active).toBe(true);
	});

	it("rejects a wrong private refresh token instead of trusting knowledge of the scope", async () => {
		const d = await scope();
		let calls = 0;
		const leader = await owner(d, async () => {
			calls++;
		});
		await leader.acquire();
		const follower = await owner(d);
		const file = join(d, ".pi-quota-keeper-refresh-token");
		const token = await readFile(file, "utf8");
		await writeFile(file, "0".repeat(64));
		expect(await follower.requestRefresh()).toBe(false);
		expect(calls).toBe(0);
		await writeFile(file, token);
		expect(await follower.requestRefresh()).toBe(true);
		expect(calls).toBe(1);
	});
	it("closes pending refresh clients before transferring ownership", async () => {
		const d = await scope();
		let release!: () => void;
		let started!: () => void;
		const gate = new Promise<void>((r) => {
			release = r;
		});
		const ready = new Promise<void>((r) => {
			started = r;
		});
		const leader = await owner(d, async () => {
			started();
			await gate;
		});
		await leader.acquire();
		const follower = await owner(d);
		const request = follower.requestRefresh();
		await ready;
		await leader.close();
		expect(await request).toBe(false);
		release();
		expect(await follower.acquire()).toBe(true);
	});

	it("replaces a stale authorization token after ownership transfer without treating it as a lease", async () => {
		const d = await scope();
		let calls = 0;
		const first = await owner(d, async () => {});
		await first.acquire();
		const file = join(d, ".pi-quota-keeper-refresh-token");
		const stale = await readFile(file, "utf8");
		await first.close();
		await writeFile(file, stale);
		const successor = await owner(d, async () => {
			calls++;
		});
		expect(await successor.acquire()).toBe(true);
		expect((await readFile(file, "utf8")) !== stale).toBe(true);
		const client = await owner(d);
		expect(await client.requestRefresh()).toBe(true);
		expect(calls).toBe(1);
	});
});
const config: ActivationConfig = {
	mode: "reset",
	delayMs: 30,
	enabledAccounts: ["a"],
};
const snapshot: Snapshot = {
	id: "a",
	provider: "anthropic",
	label: "Claude",
	fetchedAt: 0,
	status: "available",
	windows: [{ id: "five_hour", remainingPercent: 10, resetAt: 1000 }],
	activation: { supported: true, reason: "qualified" },
};
describe("capability-gated schedule", () => {
	it("requires capability AND account opt-in", () => {
		expect(
			dueActivation(
				{
					...snapshot,
					activation: { supported: false, reason: "not supported" },
				},
				config,
				{},
				0,
			),
		).toBeUndefined();
		expect(
			dueActivation(snapshot, { ...config, enabledAccounts: [] }, {}, 0),
		).toBeUndefined();
	});
	it("does not send before real reset plus delay and reuses the persisted due time", () => {
		const ledger: Ledger = {};
		expect(dueActivation(snapshot, config, ledger, 0)).toBeUndefined();
		expect(dueActivation(snapshot, config, ledger, 1029)).toBeUndefined();
		expect(dueActivation(snapshot, config, ledger, 1030)).toMatchObject({
			id: "a",
			cycle: "reset:1000",
		});
		ledger.a.attempted = "reset:1000";
		expect(dueActivation(snapshot, config, ledger, 2000)).toBeUndefined();
	});
	it("does not replay missed windows or repeat on takeover", () => {
		const ledger: Ledger = {};
		dueActivation(snapshot, config, ledger, 0);
		const now = 1000 + 20 * 3600000;
		const current = {
			...snapshot,
			windows: [
				{ id: "five_hour", resetAt: now + 10000, remainingPercent: 70 },
			],
		};
		expect(dueActivation(current, config, ledger, now)).toBeUndefined();
		expect(ledger.a.resetAt).toBe(now + 10000);
	});
	it("does not activate a window already started by real work", () => {
		const ledger: Ledger = {};
		dueActivation(snapshot, config, ledger, 0);
		expect(
			dueActivation(
				{
					...snapshot,
					windows: [{ id: "five_hour", resetAt: 20000, remainingPercent: 90 }],
				},
				config,
				ledger,
				1100,
			),
		).toBeUndefined();
	});
	it("fixed mode is explicit and suppresses duplicate ticks", () => {
		const c: ActivationConfig = { ...config, mode: "fixed" };
		const ledger: Ledger = {};
		expect(dueActivation(snapshot, c, ledger, 0)).toBeUndefined();
		const d = dueActivation(snapshot, c, ledger, 5 * 3600000);
		expect(d).toMatchObject({ id: "a" });
		if (d) ledger.a.attempted = d.cycle;
		expect(dueActivation(snapshot, c, ledger, 5 * 3600000 + 1)).toBeUndefined();
	});
	it("never activates an unavailable or stale snapshot", () => {
		expect(
			dueActivation({ ...snapshot, status: "unavailable" }, config, {}, 2000),
		).toBeUndefined();
	});
});
