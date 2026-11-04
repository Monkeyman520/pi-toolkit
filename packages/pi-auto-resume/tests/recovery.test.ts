import { mkdtemp, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	AutoResumeConfigManager,
	CONFIG_FILE_NAME,
} from "../extensions/config.ts";
import {
	classify,
	defaults,
	Recovery,
	resetTime,
} from "../extensions/recovery.ts";

describe("restricted recovery", () => {
	it.each([
		"context window exceeded",
		"maximum output tokens exceeded",
		"invalid api key",
		"permission denied",
		"some unrelated error",
	])("excludes %s", (error) => {
		expect(
			classify(error, error === "some unrelated error" ? undefined : 429),
		).toBeUndefined();
	});
	it.each([
		["fetch failed", "network"],
		["ETIMEDOUT", "network"],
		["rate limit exceeded", "throttle"],
		["subscription usage limit reached", "quota"],
	])("recognizes %s", (error, kind) => {
		expect(classify(error)).toBe(kind);
	});
	it("does not confuse a quota message with a generic 429", () => {
		expect(classify("subscription quota exhausted", 429)).toBe("quota");
	});
	it("uses only concrete reset evidence and handles case-insensitive headers and empty values safely", () => {
		expect(resetTime({ "retry-after": "12" }, "", 1000)).toBe(13000);
		expect(resetTime({ "Retry-After": "15" }, "", 1000)).toBe(16000);
		expect(resetTime({ "X-RateLimit-Reset": "2000000000" }, "", 0)).toBe(
			2000000000000,
		);
		expect(resetTime({ "retry-after": "   " }, "", 1000)).toBeUndefined();
		expect(resetTime({ "x-ratelimit-reset": "   " }, "", 1000)).toBeUndefined();
		expect(resetTime({}, '{"resets_at":2000000000}', 0)).toBe(2000000000000);
		expect(resetTime({}, '{"reset_at":2000000000}', 0)).toBe(2000000000000);
		expect(resetTime({}, "quota exhausted", 1000)).toBeUndefined();
	});
	it("continues an interrupted task only after its due time and only once", () => {
		const r = new Recovery({ retryDelayMs: 1000 });
		r.failed("fetch failed", {}, 0);
		expect(r.take(999, true)).toBe(false);
		expect(r.take(1000, false)).toBe(false);
		expect(r.take(1000, true)).toBe(true);
		expect(r.take(2000, true)).toBe(false);
	});
	it("does not retry unknown subscription resets", () => {
		const r = new Recovery();
		r.failed("subscription quota exhausted", {}, 0);
		expect(r.take(1000000000, true)).toBe(false);
		expect(r.status).toContain("reset time unavailable");
	});
	it("waits for reset plus configured safety delay", () => {
		const r = new Recovery({ quotaDelayMs: 30 });
		r.failed("subscription quota exhausted", { "retry-after": "10" }, 1000);
		expect(r.take(11029, true)).toBe(false);
		expect(r.take(11030, true)).toBe(true);
	});
	it("honors category controls, setEnabled transitions, and bounded attempts", () => {
		const disabled = new Recovery({ network: false });
		disabled.failed("fetch failed", {}, 0);
		expect(disabled.take(50000, true)).toBe(false);
		const r = new Recovery({ maxAttempts: 1, retryDelayMs: 1 });
		r.failed("fetch failed", {}, 0);
		expect(r.take(1, true)).toBe(true);
		r.failed("fetch failed", {}, 2);
		expect(r.take(100, true)).toBe(false);
		r.userInput();
		r.failed("fetch failed", {}, 200);
		expect(r.take(201, true)).toBe(true);
		r.failed("fetch failed", {}, 300);
		r.setEnabled(false);
		expect(r.status).toBe("disabled");
		expect(r.take(400, true)).toBe(false);
		r.setEnabled(true);
		expect(r.status).toBe("idle");
	});
	it("encapsulates staged provider/message failures and clears them on cancellation", () => {
		const r = new Recovery({ retryDelayMs: 500 });
		r.recordRequestStart();
		r.recordProviderResponse({ "Retry-After": "2" }, 429);
		r.recordAssistantMessage("error", "rate limit exceeded");
		r.settleTurn(false, 1000);
		expect(r.take(2999, true)).toBe(false);
		expect(r.take(3000, true)).toBe(true);

		r.recordRequestStart();
		r.recordProviderResponse({}, 500);
		r.recordAssistantMessage("error", "fetch failed");
		r.cancel();
		r.settleTurn(false, 4000);
		expect(r.take(10000, true)).toBe(false);
	});
	it("cancels pending work after explicit stop, normal completion, host recovery, or session change", () => {
		for (const action of ["cancel", "completed", "running"] as const) {
			const r = new Recovery({ retryDelayMs: 1 });
			r.failed("fetch failed", {}, 0);
			r[action]();
			expect(r.take(10000, true)).toBe(false);
		}
	});
	it("reevaluates one pending task after sleep without activating an idle session", () => {
		const r = new Recovery({ retryDelayMs: 1 });
		expect(r.take(9999999, true)).toBe(false);
		r.failed("fetch failed", {}, 0);
		expect(r.take(9999999, true)).toBe(true);
		expect(r.take(9999999, true)).toBe(false);
	});
	it("can disable wake catch-up", () => {
		const r = new Recovery({ retryDelayMs: 1, wake: false });
		r.failed("fetch failed", {}, 0);
		r.woke();
		expect(r.take(9999999, true)).toBe(false);
	});
	it("hot-reloads settings, fails closed on invalid JSON, and persists /auto-resume config updates", async () => {
		const dir = await mkdtemp(join(tmpdir(), "pi-auto-resume-cfg-"));
		try {
			const cfgPath = join(dir, CONFIG_FILE_NAME);
			const mgr = new AutoResumeConfigManager(cfgPath);
			const initial = await mgr.reloadIfChanged();
			expect(initial.settings).toEqual(defaults);

			await writeFile(
				cfgPath,
				JSON.stringify({ maxAttempts: 4, retryDelayMs: 500 }),
				"utf8",
			);
			const reloaded = await mgr.reloadIfChanged();
			expect(reloaded.changed).toBe(true);
			expect(reloaded.settings.maxAttempts).toBe(4);
			expect(reloaded.settings.retryDelayMs).toBe(500);

			// Fail closed on invalid configuration
			await writeFile(cfgPath, JSON.stringify({ unknownField: true }), "utf8");
			const bad = await mgr.reloadIfChanged();
			expect(bad.error).toContain("invalid/unreadable");
			expect(bad.isNewError).toBe(true);
			expect(bad.settings.enabled).toBe(false);

			// Deleting file reverts to defaults
			await unlink(cfgPath);
			const reverted = await mgr.reloadIfChanged();
			expect(reverted.error).toBeUndefined();
			expect(reverted.settings).toEqual(defaults);

			// Persist option via setOption
			const setRes = await mgr.setOption("maxAttempts", "7", true);
			expect(setRes.ok).toBe(true);
			expect(mgr.settings.maxAttempts).toBe(7);

			const mgr2 = new AutoResumeConfigManager(cfgPath);
			const loaded2 = await mgr2.reloadIfChanged();
			expect(loaded2.settings.maxAttempts).toBe(7);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});
});
