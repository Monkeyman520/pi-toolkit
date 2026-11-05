import { resolve } from "node:path";
import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { PressureMonitor } from "../extensions/pressure.ts";
import { recommend } from "../extensions/recommend.ts";
import { buildTasks, validateDeclaration } from "../extensions/tasks.ts";

const base = (id: string) => ({
	id,
	parentId: null,
	timestamp: "2026-11-05T00:00:00Z",
});
const user = (id = "u", text = "Implement the change"): SessionEntry => ({
	...base(id),
	type: "message",
	message: { role: "user", content: text, timestamp: 1 },
});
const note = (id: string, update: unknown): SessionEntry => ({
	...base(id),
	type: "custom",
	customType: "aco-task",
	data: { version: 1, origin: "command", update },
});
const assistant = (text: string): SessionEntry =>
	({
		...base("a"),
		type: "message",
		message: {
			role: "assistant",
			content: [{ type: "text", text }],
			timestamp: 1,
		},
	}) as SessionEntry;
const call = (id: string, name: string, args: unknown): SessionEntry =>
	({
		...base("c" + id),
		type: "message",
		message: {
			role: "assistant",
			content: [{ type: "toolCall", id, name, arguments: args }],
			timestamp: 1,
		},
	}) as SessionEntry;
const result = (
	id: string,
	name: string,
	error = false,
	details: unknown = {},
): SessionEntry =>
	({
		...base("r" + id),
		type: "message",
		message: {
			role: "toolResult",
			toolCallId: id,
			toolName: name,
			content: [{ type: "text", text: "SECRET_OUTPUT" }],
			isError: error,
			details,
			timestamp: 1,
		},
	}) as SessionEntry;
const pressure = (used: number) =>
	new PressureMonitor().observe(
		{ identity: "test", tokens: used, capacity: 100000 },
		{ historySize: 6, horizonTurns: 3, reserveTokens: 1000 },
	);
describe("active-branch task evidence", () => {
	it("exposes every TaskState field with unknown estimates instead of fabricated zeros", () => {
		const s = buildTasks([user()]);
		const t = s.tasks[0];
		expect(t).toMatchObject({
			taskId: "task:u",
			phase: null,
			status: "running",
			dependencies: [],
			requiredContextIds: ["entry:u"],
			estimatedFutureTokens: null,
			delegatable: null,
			writeConflictRisk: null,
		});
		expect(t.provenance.phase.origin).toBe("unknown");
		expect(s.references[0].protectedReasons).toContain(
			"user constraint/acceptance source",
		);
		expect(JSON.stringify(s)).not.toContain("SECRET_OUTPUT");
	});
	it("does not let assistant prose alone prove phase, plan completion, tests or task success", () => {
		const s = buildTasks([
			user(),
			assistant("Plan complete. Tests all passed. Implementation finished."),
		]);
		expect(s.tasks[0]).toMatchObject({
			phase: null,
			status: "running",
			planStatus: null,
			testState: "unknown",
		});
	});
	it("combines goal with actual finalized resource/test signals, keeping inference tentative", () => {
		const entries = [
			user(),
			call("w", "write", { path: "src/a.ts" }),
			result("w", "write"),
		];
		const t = buildTasks(entries).tasks[0];
		expect(t.phase).toBe("implement");
		expect(t.provenance.phase.origin).toBe("inferred");
		expect(t.modifiedResources).toContain("src/a.ts");
		const tested = buildTasks([
			...entries,
			call("t", "bash", { command: "npm test" }),
			result("t", "bash", false, { exitCode: 0 }),
		]);
		expect(tested.tasks[0]).toMatchObject({
			phase: "test",
			testState: "passed",
		});
		expect(tested.tasks[0].status).not.toBe("completed");
	});
	it("never turns a missing test exit code into a passing suite", () => {
		const s = buildTasks([
			user(),
			call("t", "bash", { command: "npm test" }),
			result("t", "bash"),
		]);
		expect(s.tasks[0].testState).toBe("unknown");
		expect(s.triggers).toContain("test-return");
	});
	it("retains declared meanings/provenance, plan transitions and context relationships", () => {
		const entries = [
			user(),
			note("d", {
				taskId: "impl",
				active: true,
				phase: "implement",
				status: "pending",
				dependencies: ["design"],
				requiredContextIds: ["protocol"],
				estimatedFutureTokens: 150000,
				delegatable: true,
				writeConflictRisk: 0.2,
				remainingSteps: 3,
				planStatus: "completed",
				references: [
					{
						id: "protocol",
						kind: "evidence",
						sourceEntryIds: ["u"],
						precisionSensitive: true,
					},
				],
			}),
		];
		const s = buildTasks(entries),
			t = s.tasks.find((t) => t.taskId === "impl");
		if (!t) throw Error("Expected task missing");
		expect(t).toMatchObject({
			phase: "implement",
			status: "pending",
			dependencies: ["design"],
			estimatedFutureTokens: 150000,
			delegatable: true,
			writeConflictRisk: 0.2,
			remainingSteps: 3,
			planStatus: "completed",
		});
		expect(t.provenance.phase.origin).toBe("command");
		expect(t.unresolvedDependencies).toContain("design");
		expect(s.triggers).toContain("plan-completed");
		expect(s.activeTaskId).toBe("impl");
	});
	it("rejects foreign source IDs, malformed data, dependency cycles and oversized declarations before commit", () => {
		const entries = [
			user(),
			note("d", { taskId: "a", active: true, dependencies: ["b"] }),
		];
		for (const update of [
			{ taskId: "b", dependencies: ["a"] },
			{
				taskId: "x",
				references: [
					{ id: "e", kind: "evidence", sourceEntryIds: ["other-branch"] },
				],
			},
			{ taskId: "x", estimatedFutureTokens: -1 },
			{ taskId: "x", phase: "magic" },
			{ taskId: "x", autoPrune: true },
			{ taskId: "x", title: "x".repeat(300) },
		])
			expect(() => validateDeclaration(update, entries)).toThrow();
	});
	it("rebuilds only supplied active branch and ignores malformed stored metadata visibly", () => {
		const branch = [
			user(),
			note("one", { taskId: "branch-one", active: true, phase: "review" }),
		];
		expect(buildTasks(branch).activeTaskId).toBe("branch-one");
		expect(
			buildTasks([
				user(),
				note("two", { taskId: "branch-two", active: true }),
			]).tasks.some((t) => t.taskId === "branch-one"),
		).toBe(false);
		const corrupt = buildTasks([
			user(),
			note("bad", { taskId: "x", phase: "magic" }),
		]);
		expect(corrupt.issues.length).toBeGreaterThan(0);
	});
	it("protects user/critical/transitive exact evidence despite completed planning and research flags", () => {
		const entries = [
			user(),
			call("e", "read", { path: "protocol.ts" }),
			result("e", "read"),
			note("d", {
				taskId: "impl",
				active: true,
				phase: "implement",
				planStatus: "completed",
				requiredContextIds: ["design"],
				references: [
					{
						id: "raw",
						kind: "evidence",
						sourceEntryIds: ["re"],
						precisionSensitive: true,
						completedResearch: true,
					},
					{
						id: "design",
						kind: "decision",
						sourceEntryIds: ["u"],
						dependencies: ["raw"],
					},
				],
			}),
		];
		const s = buildTasks(entries);
		expect(
			s.references.find((r) => r.id === "raw")?.protectedReasons.length,
		).toBeGreaterThan(0);
		expect(
			recommend(s, pressure(70000)).actions.flatMap((a) => a.referenceIds),
		).not.toContain("raw");
	});
	it("detects overlapping active writers even when a declaration claims zero risk", () => {
		const s = buildTasks([
			user(),
			note("a", {
				taskId: "a",
				active: true,
				writeResources: ["src/a.ts"],
				delegatable: true,
				writeConflictRisk: 0,
			}),
			note("b", { taskId: "b", writeResources: ["src/a.ts"] }),
		]);
		expect(s.tasks.find((t) => t.taskId === "a")?.conflictWith).toEqual(["b"]);
		expect(
			recommend(s, pressure(35000)).actions.some((a) => a.kind === "delegate"),
		).toBe(false);
	});
	it("reports coverage limits without silently claiming omitted context disposable", () => {
		const s = buildTasks(Array.from({ length: 300 }, (_, i) => user("u" + i)));
		expect(s.references.length).toBeLessThanOrEqual(256);
		expect(s.coverage).toBe("limited");
		expect(s.issues.length).toBeGreaterThan(0);
	});
});
describe("conditional proposals, not watermark actions", () => {
	it("prefers no-op for high occupancy but bounded near-complete review", () => {
		const s = buildTasks([
			user(),
			note("d", {
				taskId: "finish",
				active: true,
				phase: "review",
				remainingSteps: 1,
				estimatedFutureTokens: 1000,
			}),
		]);
		const r = recommend(s, pressure(85000));
		expect(r.kind).toBe("no-op");
		expect(r.reasons.join(" ")).toContain("remaining");
	});
	it("acts proactively only as a recommendation for low occupancy with a large future workload", () => {
		const s = buildTasks([
			user(),
			note("d", {
				taskId: "explore",
				active: true,
				phase: "explore",
				estimatedFutureTokens: 200000,
				delegatable: true,
				writeResources: [],
			}),
		]);
		const r = recommend(s, pressure(35000));
		expect(r.kind).toBe("proposal");
		expect(r.actions.some((a) => a.kind === "delegate")).toBe(true);
		expect(r.executed).toBe(false);
		expect(r.actions.every((a) => a.prerequisites.length > 0)).toBe(true);
		expect(r.estimatedSavings.kind).not.toBe("measured");
		expect(r.cost.modelTokens.value).toBeNull();
	});
	it("combines checkpoint/offload/prune suggestions without overriding protection or pretending recovery works", () => {
		const s = buildTasks([
			user(),
			call("e", "read", { path: "old.ts" }),
			result("e", "read"),
			note("d", {
				taskId: "work",
				active: true,
				planStatus: "completed",
				references: [
					{
						id: "research",
						kind: "evidence",
						sourceEntryIds: ["re"],
						completedResearch: true,
						estimatedTokens: 10000,
					},
				],
			}),
		]);
		const r = recommend(s, pressure(70000));
		expect(r.actions.map((a) => a.kind)).toEqual([
			"checkpoint",
			"offload",
			"prune",
		]);
		expect(
			r.actions.find((a) => a.kind === "prune")?.prerequisites.join(" "),
		).toContain("recovery");
		expect(r.recovery).toBe("unverified; no store/executor in V1");
	});
	it("uses no-op for insufficient data, not a fabricated optimal score or forced delegation", () => {
		const r = recommend(buildTasks([]), pressure(90000));
		expect(r.kind).toBe("no-op");
		expect(r.reasons.join(" ")).toContain("task");
		expect(r.executed).toBe(false);
	});
});

it("protects transitive source aliases and failed tests even when the tool error flag is false", () => {
	const s = buildTasks([
		user(),
		call("e", "read", { path: "p.ts" }),
		result("e", "read"),
		call("f", "bash", { command: "npm test" }),
		result("f", "bash", false, { exitCode: 1 }),
		note("d", {
			taskId: "i",
			active: true,
			requiredContextIds: ["source"],
			references: [
				{ id: "source", kind: "evidence", sourceEntryIds: ["re"] },
				{
					id: "alias",
					kind: "evidence",
					sourceEntryIds: ["re"],
					dependencies: ["leaf"],
				},
				{ id: "leaf", kind: "evidence", sourceEntryIds: ["rf"] },
				{
					id: "last",
					kind: "evidence",
					sourceEntryIds: ["rf"],
					completedResearch: true,
				},
			],
		}),
	]);
	expect(
		s.references.find((r) => r.id === "last")?.protectedReasons.length,
	).toBeGreaterThan(0);
	expect(
		s.references.find((r) => r.id === "entry:rf")?.precisionSensitive,
	).toBe(true);
});
it("propagates protection across repeated source aliases to a fixed point", () => {
	const s = buildTasks([
		user(),
		call("e", "read", { path: "p" }),
		result("e", "read"),
		call("f", "read", { path: "q" }),
		result("f", "read"),
		note("d", {
			taskId: "i",
			active: true,
			requiredContextIds: ["source"],
			references: [
				{ id: "source", kind: "evidence", sourceEntryIds: ["re"] },
				{
					id: "alias",
					kind: "evidence",
					sourceEntryIds: ["re"],
					dependencies: ["leaf"],
				},
				{ id: "leaf", kind: "evidence", sourceEntryIds: ["rf"] },
				{
					id: "last",
					kind: "evidence",
					sourceEntryIds: ["rf"],
					completedResearch: true,
				},
			],
		}),
	]);
	expect(
		s.references.find((r) => r.id === "last")?.protectedReasons.length,
	).toBeGreaterThan(0);
	expect(
		recommend(s, pressure(70000)).actions.flatMap((a) => a.referenceIds),
	).not.toContain("last");
});
it("uses successful plan-tool state and a resource touch, not prose, to reassess implementation", () => {
	const s = buildTasks([
		user("u", "Design the architecture"),
		call("p", "update_plan", {
			plan: [{ step: "design", status: "completed" }],
		}),
		result("p", "update_plan"),
		call("w", "edit", { path: "a.ts" }),
		result("w", "edit"),
		call("d", "delegate_status", {}),
		result("d", "delegate_status"),
	]);
	expect(s.tasks[0].phase).toBe("implement");
	expect(s.tasks[0].planStatus).toBe("completed");
	expect(s.triggers).toContain("plan-completed");
	expect(s.triggers).toContain("subagent-return");
});

it("compares normalized write paths and does not let declared zero risk hide a concrete overlap", () => {
	const s = buildTasks([
		user(),
		note("a", {
			taskId: "a",
			active: true,
			writeResources: ["src/../src/a.ts"],
			writeConflictRisk: 0,
		}),
		note("b", { taskId: "b", writeResources: ["src/a.ts"] }),
	]);
	const t = s.tasks.find((t) => t.taskId === "a");
	if (!t) throw Error("Expected task missing");
	expect(t.conflictWith).toEqual(["b"]);
	expect(t.writeConflictRisk).toBe(1);
	expect(t.provenance.writeConflictRisk.origin).toBe("inferred");
});

it("retains evidence required by a completed producer while an unfinished consumer depends on that task", () => {
	const s = buildTasks([
		user(),
		call("e", "read", { path: "protocol" }),
		result("e", "read"),
		note("p", {
			taskId: "design",
			status: "completed",
			requiredContextIds: ["raw"],
			references: [
				{
					id: "raw",
					kind: "evidence",
					sourceEntryIds: ["re"],
					completedResearch: true,
				},
			],
		}),
		note("c", {
			taskId: "implement",
			active: true,
			status: "running",
			dependencies: ["design"],
		}),
	]);
	expect(
		s.references.find((r) => r.id === "raw")?.protectedReasons.length,
	).toBeGreaterThan(0);
	expect(
		recommend(s, pressure(70000)).actions.flatMap((a) => a.referenceIds),
	).not.toContain("raw");
});

it("scopes relative/absolute write comparisons to the active session cwd", () => {
	const cwd = resolve("alternate-session");
	const s = buildTasks(
		[
			user(),
			note("a", { taskId: "a", active: true, writeResources: ["src/a.ts"] }),
			note("b", { taskId: "b", writeResources: [resolve(cwd, "src/a.ts")] }),
		],
		cwd,
	);
	expect(s.tasks.find((t) => t.taskId === "a")?.conflictWith).toEqual(["b"]);
});

it("marks resource attribution overflow incomplete instead of silently certifying independence", () => {
	const entries = [user()];
	for (let i = 0; i < 33; i++)
		entries.push(
			call("w" + i, "write", { path: "src/file" + i + ".ts" }),
			result("w" + i, "write"),
		);
	const s = buildTasks(entries);
	expect(s.tasks[0].modifiedResources).toHaveLength(32);
	expect(s.coverage).toBe("limited");
	expect(s.issues.join(" ")).toContain("Resource attribution");
});

it("repeated branch analysis cannot mutate persisted declaration arrays or poison later validation", () => {
	const branch = [
		user("goal"),
		note("declare", {
			taskId: "work",
			active: true,
			requiredContextIds: ["exact"],
			references: [{ id: "exact", kind: "evidence", sourceEntryIds: ["goal"] }],
		}),
		user("followup"),
	];
	const original = JSON.stringify(branch);
	buildTasks(branch);
	buildTasks(branch);
	expect(JSON.stringify(branch)).toBe(original);
	expect(buildTasks(branch).coverage).toBe("complete");
});
