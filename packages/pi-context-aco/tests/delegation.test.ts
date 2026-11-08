import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
	ExtensionContext,
	SessionEntry,
} from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it } from "vitest";
import { defaults } from "../extensions/config.ts";
import { Continuity } from "../extensions/continuity.ts";
import { Delegator } from "../extensions/delegation.ts";
import {
	type ChildResult,
	parentUsage,
} from "../extensions/delegation-contracts.ts";

const roots: string[] = [];
afterEach(async () => {
	await Promise.all(
		roots.splice(0).map((p) => rm(p, { recursive: true, force: true })),
	);
});
async function fixture() {
	const cwd = await mkdtemp(join(tmpdir(), "aco-delegate-"));
	roots.push(cwd);
	const branch = [
		{
			type: "message",
			id: "user",
			message: { role: "user", content: "PARENT_SECRET", timestamp: 1 },
		},
		...["parent", "child", "other"].map((taskId) => ({
			type: "custom",
			id: taskId,
			customType: "aco-task",
			data: {
				version: 1,
				origin: "command",
				update: {
					taskId,
					active: taskId === "parent",
					status: "pending",
					delegatable: true,
					writeConflictRisk: 0,
					writeResources: [],
					dependencies: [],
				},
			},
		})),
	] as SessionEntry[];
	const append = (customType: string, data: unknown) => {
		branch.push({
			type: "custom",
			id: "entry-" + branch.length,
			customType,
			data,
		} as SessionEntry);
	};
	let calls = 0;
	let answer: ChildResult = {
		conclusions: ["done"],
		deliverables: [],
		evidence: [],
		tests: ["not executed"],
		unresolvedIssues: [],
	};
	const ctx = {
		cwd,
		mode: "rpc",
		hasUI: true,
		ui: { confirm: async () => false },
		sessionManager: {
			getBranch: () => branch,
			getSessionId: () => "session",
			getSessionFile: () => join(cwd, "session.jsonl"),
		},
		model: { id: "test", provider: "fixture", maxTokens: 1000 },
		modelRegistry: {
			getProvider: () => ({}),
			streamSimple: (_m: unknown, context: unknown) => {
				calls++;
				expect(JSON.stringify(context)).not.toContain("PARENT_SECRET");
				return {
					result: async () => ({
						role: "assistant",
						content: [{ type: "text", text: JSON.stringify(answer) }],
						stopReason: "stop",
						usage: {
							input: 100,
							output: 20,
							cacheRead: 0,
							cacheWrite: 0,
							totalTokens: 120,
							cost: { total: 0 },
						},
					}),
				};
			},
		},
	} as unknown as ExtensionContext;
	const settings = { ...defaults, mode: "delegate" as const };
	let current = true;
	const continuity = new Continuity(join(cwd, "evidence"), append);
	const d = new Delegator(append, continuity, () =>
		current ? settings : undefined,
	);
	const contract = {
		taskId: "child",
		goal: "Independent inspection",
		constraints: ["read only"],
		acceptance: ["report"],
		resources: [],
		evidence: [],
	};
	const grant = () =>
		d.authorize(ctx, {
			operation: "delegate",
			taskIds: ["child", "other"],
			maxTokens: settings.maxDelegationTokens,
		});
	return {
		ctx,
		d,
		branch,
		append,
		continuity,
		contract,
		grant,
		settings,
		calls: () => calls,
		answer: (v: typeof answer) => {
			answer = v;
		},
		invalidate: () => {
			current = false;
			d.reset();
		},
	};
}
describe("authorized bounded delegation", () => {
	it.each(["error", "aborted"] as const)(
		"refuses an unfinished %s parent even with positive partial usage",
		async (stopReason) => {
			const f = await fixture();
			f.grant();
			f.branch.push({
				type: "message",
				id: "partial-positive",
				parentId: null,
				timestamp: new Date(1).toISOString(),
				message: {
					role: "assistant",
					api: "google-generative-ai",
					provider: "fixture",
					model: "test",
					timestamp: 1,
					stopReason,
					content: [],
					usage: {
						input: 96702,
						output: 151,
						cacheRead: 0,
						cacheWrite: 0,
						totalTokens: 96853,
						cost: {
							input: 0,
							output: 0,
							cacheRead: 0,
							cacheWrite: 0,
							total: 0,
						},
					},
				},
			} as SessionEntry);
			await expect(f.d.run(f.ctx, { tasks: [f.contract] })).rejects.toThrow(
				/Parent token usage unknown/,
			);
			expect(f.calls()).toBe(0);
			expect(f.d.report(f.ctx).reservedTokens).toBe(0);
			expect(
				f.branch.filter(
					(e) =>
						e.type === "custom" && e.customType === "aco-delegation-intent",
				),
			).toHaveLength(0);
		},
	);
	it("reconstructs legacy zero-usage failures as unknown without rewriting their records", async () => {
		const f = await fixture();
		f.grant();
		await f.d.run(f.ctx, { tasks: [f.contract] });
		const e = f.branch.find(
			(e) => e.type === "custom" && e.customType === "aco-delegation-result",
		);
		if (e?.type !== "custom" || !e.data || typeof e.data !== "object")
			throw Error("Missing result");
		Object.assign(e.data, {
			status: "failed",
			budgetVerified: true,
			tokens: 0,
			cost: 0,
			cacheRead: 0,
			cacheWrite: 0,
			providerUsage: {
				input: 0,
				output: 0,
				cacheRead: 0,
				cacheWrite: 0,
				totalTokens: 0,
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
			},
		});
		Object.freeze(e.data);
		expect(f.d.report(f.ctx).outcomes[0].tokens).toBeNull();
		expect(f.d.report(f.ctx).outcomes[0].budgetVerified).toBe(false);
		await expect(
			f.d.run(f.ctx, { tasks: [{ ...f.contract, taskId: "other" }] }),
		).rejects.toThrow(/unknown/);
		expect(f.calls()).toBe(1);
		expect((e.data as { tokens: number }).tokens).toBe(0);
	});
	it.each(["error", "aborted", "stop"])(
		"retains unknown usage and reservations for a zero-usage unsuccessful %s child",
		async (stopReason) => {
			const f = await fixture();
			f.grant();
			Object.assign(f.ctx.modelRegistry, {
				streamSimple: () => ({
					result: async () => ({
						role: "assistant",
						content: [],
						stopReason,
						usage: {
							input: 0,
							output: 0,
							cacheRead: 0,
							cacheWrite: 0,
							totalTokens: 0,
							cost: {
								input: 0,
								output: 0,
								cacheRead: 0,
								cacheWrite: 0,
								total: 0,
							},
						},
					}),
				}),
			});
			await f.d.run(f.ctx, { tasks: [f.contract] });
			const o = f.d.report(f.ctx).outcomes[0];
			expect(o.status).toBe("failed");
			expect(o.tokens).toBeNull();
			expect(o.cost).toBeNull();
			expect(o.cacheRead).toBeNull();
			expect(o.cacheWrite).toBeNull();
			expect(o.budgetVerified).toBe(false);
			expect(f.d.report(f.ctx).reservedTokens).toBeGreaterThan(0);
		},
	);
	it.each(["error", "aborted"])(
		"refuses SDK-normalized zero parent usage after %s before reservation",
		async (stopReason) => {
			const f = await fixture();
			f.grant();
			f.branch.push({
				type: "message",
				id: "failed-parent",
				message: {
					role: "assistant",
					content: [],
					stopReason,
					usage: {
						input: 0,
						output: 0,
						cacheRead: 0,
						cacheWrite: 0,
						totalTokens: 0,
						cost: {
							input: 0,
							output: 0,
							cacheRead: 0,
							cacheWrite: 0,
							total: 0,
						},
					},
				},
			} as unknown as SessionEntry);
			expect(() => parentUsage(f.branch)).toThrow(/Parent token usage unknown/);
			await expect(f.d.run(f.ctx, { tasks: [f.contract] })).rejects.toThrow(
				/Parent token usage unknown/,
			);
			expect(f.calls()).toBe(0);
			expect(f.d.report(f.ctx).reservedTokens).toBe(0);
			expect(
				f.branch.some(
					(e) =>
						e.type === "custom" && e.customType === "aco-delegation-intent",
				),
			).toBe(false);
		},
	);
	it("a present stream API without a registered provider reserves and launches nothing", async () => {
		const f = await fixture();
		f.grant();
		Object.assign(f.ctx.modelRegistry, { getProvider: () => undefined });
		expect((await f.d.run(f.ctx, { tasks: [f.contract] })).status).toBe(
			"recommendation",
		);
		expect(f.calls()).toBe(0);
		expect(f.d.report(f.ctx).reservedTokens).toBe(0);
		expect(f.d.report(f.ctx).outcomes).toEqual([]);
	});
	it("never dispatches from V1 or without noninteractive authority", async () => {
		const f = await fixture();
		expect((await f.d.run(f.ctx, { tasks: [f.contract] })).status).toBe(
			"recommendation",
		);
		expect(f.calls()).toBe(0);
		f.settings.mode = "observe" as "delegate";
		await expect(f.d.run(f.ctx, { tasks: [f.contract] })).rejects.toThrow(
			/mode/,
		);
	});
	it("isolates context, retains reservations and requires parent reconciliation", async () => {
		const f = await fixture();
		f.grant();
		const result = await f.d.run(f.ctx, { tasks: [f.contract] });
		expect(result.status).toBe("returned");
		expect(f.calls()).toBe(1);
		expect(f.d.report(f.ctx).outcomes[0].status).toBe("needs-verification");
		expect(f.d.report(f.ctx).reservedTokens).toBeGreaterThan(0);
		await expect(
			f.d.reconcile(f.ctx, {
				id: result.ids[0],
				accepted: true,
				verification: [],
			}),
		).rejects.toThrow(/verification/);
		await f.d.reconcile(f.ctx, {
			id: result.ids[0],
			accepted: true,
			verification: [
				"Parent independently reviewed acceptance; no executable tests for this inspection",
			],
		});
		expect(f.d.report(f.ctx).outcomes[0].status).toBe("verified");
		await expect(f.d.run(f.ctx, { tasks: [f.contract] })).rejects.toThrow(
			/attempt/,
		);
	});
	it("refuses zero depth and exhausted aggregate budget without a launch", async () => {
		const f = await fixture();
		f.grant();
		f.settings.maxDelegationDepth = 0;
		await expect(f.d.run(f.ctx, { tasks: [f.contract] })).rejects.toThrow(
			/depth/,
		);
		f.settings.maxDelegationDepth = 1;
		f.settings.maxDelegationTokens = 1;
		await expect(f.d.run(f.ctx, { tasks: [f.contract] })).rejects.toThrow(
			/budget/,
		);
		expect(f.calls()).toBe(0);
	});
	it("rejects overlapping staged writers and unresolved independence", async () => {
		const f = await fixture();
		f.grant();
		await writeFile(join(f.ctx.cwd, "a.txt"), "old");
		const child = f.branch.find((e) => e.id === "child");
		if (child?.type === "custom")
			(
				child.data as { update: { writeResources: string[] } }
			).update.writeResources = ["a.txt"];
		const task = (taskId: string) => ({
			...f.contract,
			taskId,
			resources: [{ path: "a.txt", write: taskId === "child" }],
		});
		await expect(
			f.d.run(f.ctx, { tasks: [task("child"), task("other")] }),
		).rejects.toThrow(/overlap/);
		const entry = f.branch.find((e) => e.id === "child");
		if (entry?.type === "custom")
			(
				entry.data as { update: { delegatable: boolean | null } }
			).update.delegatable = null;
		await expect(f.d.run(f.ctx, { tasks: [f.contract] })).rejects.toThrow(
			/independent/,
		);
		expect(f.calls()).toBe(0);
	});
	it("missing capability is recommendation, malformed result is failed and cannot reconcile", async () => {
		const f = await fixture();
		f.grant();
		const registry = f.ctx.modelRegistry;
		Object.assign(f.ctx, { modelRegistry: undefined });
		expect((await f.d.run(f.ctx, { tasks: [f.contract] })).status).toBe(
			"recommendation",
		);
		Object.assign(f.ctx, { modelRegistry: registry });
		f.answer({
			conclusions: [],
			deliverables: [],
			evidence: [],
			tests: [],
			unresolvedIssues: ["blocked"],
		});
		const r = await f.d.run(f.ctx, { tasks: [f.contract] });
		await expect(
			f.d.reconcile(f.ctx, {
				id: r.ids[0],
				accepted: true,
				verification: ["review"],
			}),
		).rejects.toThrow(/unresolved/);
	});

	it("requires TUI confirmation by default; denial never launches", async () => {
		const f = await fixture();
		Object.assign(f.ctx, { mode: "tui" });
		expect((await f.d.run(f.ctx, { tasks: [f.contract] })).status).toBe(
			"denied",
		);
		expect(f.calls()).toBe(0);
		Object.assign(f.ctx.ui, { confirm: async () => true });
		expect((await f.d.run(f.ctx, { tasks: [f.contract] })).status).toBe(
			"returned",
		);
	});
	it("rejects unknown parent accounting, coupling, excessive concurrency and foreign evidence", async () => {
		const f = await fixture();
		f.grant();
		f.settings.maxDelegationConcurrency = 1;
		await expect(
			f.d.run(f.ctx, {
				tasks: [f.contract, { ...f.contract, taskId: "other" }],
			}),
		).rejects.toThrow(/concurrency/);
		f.branch.push({
			type: "message",
			id: "unknown-usage",
			message: { role: "assistant", content: [] },
		} as unknown as SessionEntry);
		await expect(f.d.run(f.ctx, { tasks: [f.contract] })).rejects.toThrow(
			/Parent token usage unknown/,
		);
		f.branch.pop();
		await expect(
			f.d.run(f.ctx, {
				tasks: [
					{
						...f.contract,
						evidence: [
							{
								checkpointId: "00000000-0000-0000-0000-000000000000",
								segmentId: "user",
							},
						],
					},
				],
			}),
		).rejects.toThrow(/denied/);
		expect(f.calls()).toBe(0);
	});
	it("malformed and over-budget children remain failed, reservations survive a fresh executor", async () => {
		const f = await fixture();
		f.grant();
		Object.assign(f.ctx.modelRegistry, {
			streamSimple: () => ({
				result: async () => ({
					content: [{ type: "text", text: "not-json" }],
					stopReason: "stop",
					usage: { totalTokens: 100, output: 10 },
				}),
			}),
		});
		const result = await f.d.run(f.ctx, { tasks: [f.contract] });
		expect(result.outcomes?.[0].status).toBe("failed");
		const next = new Delegator(f.append, f.continuity, () => f.settings);
		expect(next.report(f.ctx).reservedTokens).toBe(
			f.d.report(f.ctx).reservedTokens,
		);
		await expect(
			next.reconcile(f.ctx, {
				id: result.ids[0],
				accepted: true,
				verification: ["review"],
			}),
		).rejects.toThrow(/returned unfinished/);
	});
	it("revokes owned work without a stale result append, preserving an interrupted intent", async () => {
		const f = await fixture();
		f.grant();
		let started!: () => void, release!: (value: unknown) => void;
		const ready = new Promise<void>((r) => {
			started = r;
		});
		let childSignal: AbortSignal | undefined;
		Object.assign(f.ctx.modelRegistry, {
			streamSimple: (
				_model: unknown,
				_context: unknown,
				options: { signal: AbortSignal },
			) => {
				childSignal = options.signal;
				started();
				return {
					result: () =>
						new Promise((r) => {
							release = r;
						}),
				};
			},
		});
		const pending = f.d.run(f.ctx, { tasks: [f.contract] });
		await ready;
		f.invalidate();
		expect(childSignal?.aborted).toBe(true);
		release({
			content: [],
			stopReason: "stop",
			usage: { totalTokens: 10, output: 1 },
		});
		await expect(pending).rejects.toThrow(/cancelled/);
		expect(f.d.report(f.ctx).outcomes[0].status).toBe("interrupted");
		expect(
			f.branch.filter(
				(e) => e.type === "custom" && e.customType === "aco-delegation-result",
			),
		).toHaveLength(0);
	});
	it("partial intent persistence launches nothing and never loses the reservation", async () => {
		const f = await fixture();
		let n = 0;
		const d = new Delegator(
			(type, data) => {
				if (++n === 2) throw Error("disk full");
				f.append(type, data);
			},
			f.continuity,
			() => f.settings,
		);
		d.authorize(f.ctx, {
			operation: "delegate",
			taskIds: ["child", "other"],
			maxTokens: 200000,
		});
		await expect(
			d.run(f.ctx, { tasks: [f.contract, { ...f.contract, taskId: "other" }] }),
		).rejects.toThrow(/disk full/);
		expect(f.calls()).toBe(0);
		expect(d.report(f.ctx).outcomes[0].status).toBe("interrupted");
		expect(d.report(f.ctx).reservedTokens).toBeGreaterThan(0);
	});
	it("checks deliverable scope and independently checks applied bytes at reconciliation", async () => {
		const f = await fixture();
		f.grant();
		f.answer({
			conclusions: ["done"],
			deliverables: [{ path: "secret.txt", content: "unauthorized" }],
			tests: [],
			evidence: [],
			unresolvedIssues: [],
		});
		expect(
			(await f.d.run(f.ctx, { tasks: [f.contract] })).outcomes?.[0].status,
		).toBe("failed");
		const g = await fixture();
		await writeFile(join(g.ctx.cwd, "a.txt"), "old");
		const child = g.branch.find((e) => e.id === "child");
		if (child?.type === "custom")
			(
				child.data as { update: { writeResources: string[] } }
			).update.writeResources = ["a.txt"];
		g.grant();
		g.answer({
			conclusions: ["done"],
			deliverables: [{ path: "a.txt", content: "new" }],
			tests: ["not executed"],
			evidence: [],
			unresolvedIssues: [],
		});
		const result = await g.d.run(g.ctx, {
			tasks: [{ ...g.contract, resources: [{ path: "a.txt", write: true }] }],
		});
		await expect(
			g.d.reconcile(g.ctx, {
				id: result.ids[0],
				accepted: true,
				verification: ["checked"],
			}),
		).rejects.toThrow(/resource\/deliverable/);
		await writeFile(join(g.ctx.cwd, "a.txt"), "new");
		expect(
			(
				await g.d.reconcile(g.ctx, {
					id: result.ids[0],
					accepted: true,
					verification: ["independently checked"],
				})
			).accepted,
		).toBe(true);
	});

	it("blocks later children when a provider reports unknown usage or overruns its reservation", async () => {
		for (const totalTokens of [null, 9999999]) {
			const f = await fixture();
			f.grant();
			Object.assign(f.ctx.modelRegistry, {
				streamSimple: () => ({
					result: async () => ({
						content: [],
						stopReason: "stop",
						usage: { totalTokens, output: 10 },
					}),
				}),
			});
			const result = await f.d.run(f.ctx, { tasks: [f.contract] });
			expect(result.outcomes?.[0].status).toBe("failed");
			await expect(
				f.d.run(f.ctx, { tasks: [{ ...f.contract, taskId: "other" }] }),
			).rejects.toThrow(/accounting/);
		}
	});

	it("explicit cancellation persists unfinished state and does not wait for an uncooperative provider", async () => {
		const f = await fixture();
		f.grant();
		let started!: () => void;
		const ready = new Promise<void>((r) => {
			started = r;
		});
		Object.assign(f.ctx.modelRegistry, {
			streamSimple: () => {
				started();
				return { result: () => new Promise(() => {}) };
			},
		});
		const run = f.d.run(f.ctx, { tasks: [f.contract] });
		await ready;
		f.d.reset(f.ctx);
		await expect(run).rejects.toThrow(/cancelled/);
		expect(f.d.report(f.ctx).outcomes[0].status).toBe("cancelled");
		expect(f.d.report(f.ctx).active).toBe(0);
	});

	it("does not trust output-cap violations or orphan reservations on the next dispatch", async () => {
		const f = await fixture();
		f.grant();
		Object.assign(f.ctx.modelRegistry, {
			streamSimple: () => ({
				result: async () => ({
					content: [],
					stopReason: "stop",
					usage: { totalTokens: 4000, output: 3000 },
				}),
			}),
		});
		await f.d.run(f.ctx, { tasks: [f.contract] });
		await expect(
			f.d.run(f.ctx, { tasks: [{ ...f.contract, taskId: "other" }] }),
		).rejects.toThrow(/accounting/);
	});

	it("rechecks historical evidence during parent acceptance, not just at dispatch", async () => {
		const f = await fixture();
		f.branch.push({
			type: "message",
			id: "allowed",
			message: { role: "user", content: "ALLOWED_EVIDENCE", timestamp: 1 },
		} as SessionEntry);
		const checkpoint = await f.continuity.checkpoint(
			f.ctx,
			{ sourceEntryIds: ["allowed"] },
			() => true,
		);
		f.grant();
		const result = await f.d.run(f.ctx, {
			tasks: [
				{
					...f.contract,
					evidence: [
						{ checkpointId: checkpoint.checkpointId, segmentId: "allowed" },
					],
				},
			],
		});
		expect(result.outcomes?.[0].status).toBe("needs-verification");
		await rm(join(f.ctx.cwd, "evidence"), { recursive: true, force: true });
		await expect(
			f.d.reconcile(f.ctx, {
				id: result.ids[0],
				accepted: true,
				verification: ["review"],
			}),
		).rejects.toThrow();
		expect(f.d.report(f.ctx).outcomes[0].status).toBe("needs-verification");
	});

	it("includes parent summary, cache/coordination usage and nested reported tool tokens", () => {
		const entries = [
			{ type: "usage", usage: { totalTokens: 10 } },
			{ type: "compaction", usage: { totalTokens: 20 } },
			{ type: "branch_summary", usage: { totalTokens: 5 } },
			{
				type: "message",
				message: { role: "toolResult", usage: { totalTokens: 5 } },
			},
		] as unknown as SessionEntry[];
		expect(parentUsage(entries)).toBe(40);
		expect(() =>
			parentUsage([{ type: "compaction" }] as SessionEntry[]),
		).toThrow(/unknown/);
	});
});
