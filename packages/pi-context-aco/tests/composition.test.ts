import { describe, expect, it } from "vitest";
import { Composer, type StepResult } from "../extensions/composition.ts";

const checkpoint = { kind: "checkpoint", request: { sourceEntryIds: ["r"] } };
const prune = { kind: "prune", request: { sourceEntryIds: ["r"] } };
describe("ordered composition", () => {
	it("waits for observed commit before dependent authority checks", async () => {
		const calls: string[] = [];
		let observed: StepResult = { status: "pending", evidence: "not committed" };
		const c = new Composer();
		const adapter = {
			guard: () => () => {},
			execute: async (step: { kind: string }): Promise<StepResult> => {
				calls.push(step.kind);
				return step.kind === "checkpoint"
					? { status: "complete", evidence: "readback verified" }
					: step.kind === "prune"
						? { status: "pending", evidence: { id: "edit" } }
						: {
								status: "blocked",
								evidence: "semantic requires independent confirmation",
							};
			},
			inspect: async () => observed,
		};
		expect(
			(
				await c.start(
					{
						steps: [
							checkpoint,
							prune,
							{ kind: "semantic", request: { sourceEntryIds: ["other"] } },
						],
					},
					adapter,
				)
			).status,
		).toBe("pending");
		expect(calls).toEqual(["checkpoint", "prune"]);
		await c.advance(adapter);
		expect(calls).toHaveLength(2);
		observed = { status: "complete", evidence: "persisted edit verified" };
		expect((await c.advance(adapter)).status).toBe("blocked");
		expect(calls).toEqual(["checkpoint", "prune", "semantic"]);
		expect(c.report()?.results.map((r) => r.status)).toEqual([
			"complete",
			"complete",
			"blocked",
		]);
		await expect(c.advance(adapter)).rejects.toThrow(/No pending/);
	});
	it("stops failures and stale state without retrying or claiming rollback", async () => {
		const c = new Composer();
		let stale = false,
			effects = 0;
		const adapter = {
			guard: () => () => {
				if (stale) throw Error("stale branch");
			},
			execute: async (): Promise<StepResult> => {
				effects++;
				return { status: "pending", evidence: "edit" };
			},
			inspect: async (): Promise<StepResult> => ({
				status: "complete",
				evidence: "commit",
			}),
		};
		await c.start({ steps: [prune, checkpoint] }, adapter);
		stale = true;
		expect((await c.advance(adapter)).status).toBe("blocked");
		expect(effects).toBe(1);
	});
	it("rejects overlap, empty/oversized/invalid steps and cancels runtime scheduling", async () => {
		const c = new Composer();
		const adapter = {
			guard: () => () => {},
			execute: async (): Promise<StepResult> => ({
				status: "pending",
				evidence: "child needs parent verification",
			}),
			inspect: async (): Promise<StepResult> => ({
				status: "pending",
				evidence: "child",
			}),
		};
		await expect(c.start({ steps: [] }, adapter)).rejects.toThrow(/Invalid/);
		await expect(
			c.start({ steps: [{ kind: "grant" }] }, adapter),
		).rejects.toThrow(/Invalid/);
		await c.start({ steps: [prune] }, adapter);
		await expect(c.start({ steps: [checkpoint] }, adapter)).rejects.toThrow(
			/pending/,
		);
		c.cancel("revoke");
		expect(c.report()?.status).toBe("blocked");
		expect(new Composer().report()).toBeNull();
	});
	it("does not launch downstream work when cancelled during an awaited executor", async () => {
		const c = new Composer();
		let finish: (r: StepResult) => void = () => {};
		let entered: () => void = () => {};
		const ready = new Promise<void>((resolve) => {
			entered = resolve;
		});
		let effects = 0;
		const adapter = {
			guard: () => () => {},
			execute: async (): Promise<StepResult> => {
				effects++;
				entered();
				return new Promise((resolve) => {
					finish = resolve;
				});
			},
			inspect: async (): Promise<StepResult> => ({
				status: "complete",
				evidence: "commit",
			}),
		};
		const running = c.start({ steps: [checkpoint, prune] }, adapter);
		await ready;
		c.cancel("shutdown");
		finish({ status: "complete", evidence: "old checkpoint" });
		expect((await running).status).toBe("blocked");
		expect(effects).toBe(1);
	});
});
