import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { decide } from "../extensions/policy.ts";
import { PressureMonitor } from "../extensions/pressure.ts";
import { buildTasks } from "../extensions/tasks.ts";

const branch = (update: unknown): SessionEntry[] => [
	{
		type: "message",
		id: "u",
		parentId: null,
		timestamp: "",
		message: { role: "user", content: "Implement compatibility", timestamp: 0 },
	},
	{
		type: "custom",
		customType: "aco-task",
		id: "d",
		parentId: "u",
		timestamp: "",
		data: { version: 1, origin: "command", update },
	},
];
const pressure = (used: number) =>
	new PressureMonitor().observe(
		{ identity: "m", tokens: used, capacity: 100000 },
		{ historySize: 6, horizonTurns: 3, reserveTokens: 1000 },
	);
describe("rules-first adaptive candidates", () => {
	it("prefers no-op for bounded high occupancy review, not for low occupancy impending growth", () => {
		const near = decide(
			buildTasks(
				branch({
					taskId: "t",
					active: true,
					phase: "review",
					remainingSteps: 1,
					estimatedFutureTokens: 1000,
				}),
			),
			pressure(95000),
		);
		expect(near.selected).toBe("no-op");
		const growth = decide(
			buildTasks(
				branch({
					taskId: "t",
					active: true,
					phase: "explore",
					remainingSteps: 5,
					estimatedFutureTokens: 120000,
				}),
			),
			pressure(5000),
		);
		expect(growth.selected).not.toBe("no-op");
		expect(growth.triggers).toContain("forecast-deterioration");
		expect(growth.modelDecisionCalls).toBe(0);
	});
	it("exposes phase changes/conflicts and compares prior prediction without inventing savings", () => {
		const p = pressure(5000);
		const first = decide(
			buildTasks(branch({ taskId: "t", active: true, phase: "explore" })),
			p,
		);
		const next = decide(
			buildTasks(branch({ taskId: "t", active: true, phase: "implement" })),
			pressure(6000),
			first,
		);
		expect(next.triggers).toContain("task-change");
		expect(next.predictionComparison).toMatchObject({
			previousProjectedTokens: p.projectedTokens.value,
			observedHostEstimatedTokens: 6000,
		});
		expect(next.candidates.every((c) => c.cache.includes("unknown"))).toBe(
			true,
		);
	});
	it("selects recoverable candidates for completed research but excludes edited sources and protected consumers", () => {
		const entries = branch({
			taskId: "t",
			active: true,
			phase: "implement",
			planStatus: "completed",
			references: [
				{
					id: "old",
					kind: "evidence",
					sourceEntryIds: ["r"],
					completedResearch: true,
					estimatedTokens: 200,
				},
			],
		});
		entries.splice(1, 0, {
			type: "message",
			id: "r",
			parentId: "u",
			timestamp: "",
			message: {
				role: "toolResult",
				toolCallId: "c",
				toolName: "read",
				content: [{ type: "text", text: "old research" }],
				isError: false,
				timestamp: 0,
			},
		});
		const state = buildTasks(entries);
		const selected = decide(state, pressure(5000));
		expect(selected.selected).toBe("exact");
		expect(
			selected.candidates
				.find((c) => c.id === "exact")
				?.steps.map((s) => s.kind),
		).toEqual(["checkpoint", "prune"]);
		expect(
			decide(state, pressure(5000), selected, new Set(["r"])).selected,
		).toBe("no-op");
		const conflicted = buildTasks(
			branch({
				taskId: "t",
				active: true,
				phase: "implement",
				dependencies: ["missing"],
				estimatedFutureTokens: 120000,
				delegatable: true,
				writeConflictRisk: 1,
			}),
		);
		const conflict = decide(conflicted, pressure(5000));
		expect(conflict.triggers).toContain("semantic-conflict");
		expect(conflict.candidates.some((c) => c.id === "delegate")).toBe(false);
	});
	it("changes strategy order when task-specific forecast relief changes", () => {
		const entries = branch({
			taskId: "t",
			active: true,
			phase: "explore",
			estimatedFutureTokens: 120000,
			delegatable: true,
			writeConflictRisk: 0,
			references: [
				{
					id: "historical",
					kind: "evidence",
					sourceEntryIds: ["old"],
					completedResearch: true,
					estimatedTokens: 2000,
				},
			],
		});
		entries.splice(1, 0, {
			type: "message",
			id: "old",
			parentId: "u",
			timestamp: "",
			message: {
				role: "toolResult",
				toolCallId: "c",
				toolName: "read",
				content: [{ type: "text", text: "old research" }],
				isError: false,
				timestamp: 0,
			},
		});
		const snapshot = buildTasks(entries);
		expect(decide(snapshot, pressure(5000)).selected).toBe("delegate");
		const historical = snapshot.references.find((r) => r.id === "historical");
		if (!historical) throw Error("Missing historical reference");
		historical.estimatedTokens = 40000;
		expect(decide(snapshot, pressure(5000)).selected).toBe("exact");
	});
});
