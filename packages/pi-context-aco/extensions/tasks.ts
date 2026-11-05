import { resolve } from "node:path";
import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import { type Static, type TSchema, Type } from "typebox";
import { Check } from "typebox/value";
import { textTokens } from "./pressure.ts";

const resourceKey = (path: string, cwd: string) => {
	const resolved = resolve(cwd, path.replaceAll("\\", "/"));
	return process.platform === "win32" ? resolved.toLowerCase() : resolved;
};

const id = () =>
	Type.String({
		minLength: 1,
		maxLength: 128,
		pattern: "^[A-Za-z0-9][A-Za-z0-9:._/-]*$",
	});
const ids = () => Type.Array(id(), { maxItems: 32, uniqueItems: true });
const phaseSchema = Type.Union(
	["explore", "plan", "implement", "test", "review"].map((x) =>
		Type.Literal(x),
	),
);
const statusSchema = Type.Union(
	["pending", "running", "completed", "blocked"].map((x) => Type.Literal(x)),
);
export type SegmentCategory =
	| "user-constraint"
	| "acceptance-criteria"
	| "decision"
	| "active-evidence"
	| "completed-research"
	| "reproducible-data"
	| "redundant-content"
	| "execution-state";

export const categorySchema = Type.Union([
	Type.Literal("user-constraint"),
	Type.Literal("acceptance-criteria"),
	Type.Literal("decision"),
	Type.Literal("active-evidence"),
	Type.Literal("completed-research"),
	Type.Literal("reproducible-data"),
	Type.Literal("redundant-content"),
	Type.Literal("execution-state"),
]);
const nullable = <T extends TSchema>(s: T) => Type.Union([s, Type.Null()]);
export const declarationSchema = Type.Object(
	{
		taskId: id(),
		active: Type.Optional(Type.Boolean()),
		title: Type.Optional(Type.String({ maxLength: 256 })),
		phase: Type.Optional(Type.Union([phaseSchema, Type.Null()])),
		status: Type.Optional(statusSchema),
		dependencies: Type.Optional(ids()),
		requiredContextIds: Type.Optional(ids()),
		estimatedFutureTokens: Type.Optional(
			nullable(Type.Integer({ minimum: 0, maximum: 100000000 })),
		),
		delegatable: Type.Optional(Type.Union([Type.Boolean(), Type.Null()])),
		writeConflictRisk: Type.Optional(
			nullable(Type.Number({ minimum: 0, maximum: 1 })),
		),
		writeResources: Type.Optional(
			Type.Array(Type.String({ minLength: 1, maxLength: 512 }), {
				maxItems: 32,
				uniqueItems: true,
			}),
		),
		remainingSteps: Type.Optional(
			nullable(Type.Integer({ minimum: 0, maximum: 100000 })),
		),
		planStatus: Type.Optional(statusSchema),
		references: Type.Optional(
			Type.Array(
				Type.Object(
					{
						id: id(),
						kind: Type.Union(
							[
								"constraint",
								"decision",
								"evidence",
								"artifact",
								"checkpoint",
							].map((x) => Type.Literal(x)),
						),
						category: Type.Optional(categorySchema),
						sourceEntryIds: Type.Array(id(), {
							minItems: 1,
							maxItems: 32,
							uniqueItems: true,
						}),
						dependencies: Type.Optional(ids()),
						pinned: Type.Optional(Type.Boolean()),
						precisionSensitive: Type.Optional(Type.Boolean()),
						completedResearch: Type.Optional(Type.Boolean()),
						redundant: Type.Optional(Type.Boolean()),
						reproducibleData: Type.Optional(Type.Boolean()),
						summary: Type.Optional(Type.String({ maxLength: 1024 })),
						relevance: Type.Optional(
							Type.Union(["high", "medium", "low"].map((x) => Type.Literal(x))),
						),
						estimatedTokens: Type.Optional(
							nullable(Type.Integer({ minimum: 0, maximum: 100000000 })),
						),
						equivalentRepresentation: Type.Optional(
							Type.Object(
								{
									verified: Type.Boolean(),
									targetId: Type.Optional(id()),
									description: Type.Optional(Type.String({ maxLength: 1024 })),
								},
								{ additionalProperties: false },
							),
						),
					},
					{ additionalProperties: false },
				),
				{ maxItems: 32 },
			),
		),
	},
	{ additionalProperties: false },
);
export type Declaration = Static<typeof declarationSchema>;
export type Phase = "explore" | "plan" | "implement" | "test" | "review";
export type Status = "pending" | "running" | "completed" | "blocked";
export interface Provenance {
	origin: "unknown" | "inferred" | "command" | "tool";
	sourceEntryIds: string[];
	reason: string;
}
interface Signal {
	family: "goal" | "plan" | "tool" | "resource" | "test";
	event: string;
	phase: Phase | null;
	sourceEntryId: string;
}
export interface Task {
	taskId: string;
	title: string;
	phase: Phase | null;
	status: Status;
	dependencies: string[];
	requiredContextIds: string[];
	estimatedFutureTokens: number | null;
	delegatable: boolean | null;
	writeConflictRisk: number | null;
	writeResources: string[];
	remainingSteps: number | null;
	planStatus: Status | null;
	testState: "passed" | "failed" | "unknown";
	modifiedResources: string[];
	conflictWith: string[];
	unresolvedDependencies: string[];
	provenance: Record<string, Provenance>;
	signals: Signal[];
}
export interface StorageReference {
	checkpointId: string;
	segmentId: string;
	verified: boolean;
}
export interface EquivalentRepresentation {
	verified: boolean;
	targetId?: string;
	description?: string;
}
export interface Reference {
	id: string;
	kind: "constraint" | "decision" | "evidence" | "artifact" | "checkpoint";
	category: SegmentCategory;
	sourceEntryIds: string[];
	dependencies: string[];
	pinned: boolean;
	precisionSensitive: boolean;
	completedResearch: boolean;
	redundant: boolean;
	reproducibleData: boolean;
	estimatedTokens: number | null;
	protectedReasons: string[];
	taskId: string | null;
	summary: string | null;
	storage: StorageReference | null;
	relevance: "high" | "medium" | "low";
	recoverability: "unverified" | "recoverable" | "non-recoverable";
	activeConsumers: string[];
	equivalentRepresentation: EquivalentRepresentation | null;
}
export interface TaskSnapshot {
	activeTaskId: string | null;
	tasks: Task[];
	references: Reference[];
	issues: string[];
	coverage: "complete" | "limited";
	triggers: string[];
	sourceCount: number;
}
const unknown = (): Provenance => ({
	origin: "unknown",
	sourceEntryIds: [],
	reason: "not established",
});
const prov = (
	origin: Provenance["origin"],
	source: string,
	reason: string,
): Provenance => ({ origin, sourceEntryIds: [source], reason });
function newTask(taskId: string): Task {
	return {
		taskId,
		title: "Observed task",
		phase: null,
		status: "pending",
		dependencies: [],
		requiredContextIds: [],
		estimatedFutureTokens: null,
		delegatable: null,
		writeConflictRisk: null,
		writeResources: [],
		remainingSteps: null,
		planStatus: null,
		testState: "unknown",
		modifiedResources: [],
		conflictWith: [],
		unresolvedDependencies: [],
		provenance: Object.fromEntries(
			[
				"title",
				"phase",
				"status",
				"dependencies",
				"requiredContextIds",
				"estimatedFutureTokens",
				"delegatable",
				"writeConflictRisk",
				"writeResources",
				"remainingSteps",
				"planStatus",
				"testState",
				"modifiedResources",
			].map((key) => [key, unknown()]),
		),
		signals: [],
	};
}
function object(v: unknown): Record<string, unknown> {
	return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}
function text(message: unknown): string {
	const c = object(message).content;
	return typeof c === "string"
		? c
		: Array.isArray(c)
			? c
					.filter((b) => b?.type === "text")
					.map((b) => b.text)
					.join("\n")
			: "";
}
function hint(s: string): Phase | null {
	if (/review|审查|评审/i.test(s)) return "review";
	if (/test|测试/i.test(s)) return "test";
	if (/implement|build|实现|开发/i.test(s)) return "implement";
	if (/plan|design|architecture|设计|架构|规划/i.test(s)) return "plan";
	if (/explor|analy[sz]|research|inspect|分析|调研/i.test(s)) return "explore";
	return null;
}
function signal(t: Task, s: Signal) {
	t.signals.push(s);
	t.signals = t.signals.slice(-64);
}
function cycles(tasks: Map<string, Task>) {
	const visiting = new Set<string>(),
		done = new Set<string>();
	const visit = (id: string) => {
		if (visiting.has(id)) throw Error("Task dependency cycle");
		if (done.has(id) || !tasks.has(id)) return;
		visiting.add(id);
		for (const dep of tasks.get(id)?.dependencies ?? []) visit(dep);
		visiting.delete(id);
		done.add(id);
	};
	for (const id of tasks.keys()) visit(id);
}
function apply(
	tasks: Map<string, Task>,
	refs: Map<string, Reference>,
	raw: unknown,
	origin: "command" | "tool",
	source: string,
	sourceIds: Set<string>,
	userIds: Set<string>,
) {
	if (!Check(declarationSchema, raw))
		throw Error("Invalid task declaration schema");
	const update = raw as Declaration;
	const nextTasks = new Map(structuredClone([...tasks])),
		nextRefs = new Map(structuredClone([...refs]));
	if (!nextTasks.has(update.taskId) && nextTasks.size >= 64)
		throw Error("Task capacity reached");
	const t = nextTasks.get(update.taskId) ?? newTask(update.taskId);
	for (const key of [
		"title",
		"phase",
		"status",
		"dependencies",
		"requiredContextIds",
		"estimatedFutureTokens",
		"delegatable",
		"writeConflictRisk",
		"writeResources",
		"remainingSteps",
		"planStatus",
	] as const) {
		if (update[key] === undefined) continue;
		Object.assign(t, { [key]: structuredClone(update[key]) });
		t.provenance[key] = prov(
			origin,
			source,
			"explicit declaration; not independently verified",
		);
	}
	if (update.planStatus === "completed")
		signal(t, {
			family: "plan",
			event: "plan-completed",
			phase: "plan",
			sourceEntryId: source,
		});
	for (const r of update.references ?? []) {
		if (r.sourceEntryIds.some((id) => !sourceIds.has(id)))
			throw Error("Source entry is outside the active branch");
		if (!nextRefs.has(r.id) && nextRefs.size >= 256)
			throw Error("Context reference capacity reached");
		const previous = nextRefs.get(r.id);
		if (
			new Set([...(previous?.sourceEntryIds ?? []), ...r.sourceEntryIds]).size >
				128 ||
			new Set([...(previous?.dependencies ?? []), ...(r.dependencies ?? [])])
				.size > 128
		)
			throw Error("Reference relationship capacity reached");
		const category: SegmentCategory =
			r.category ??
			previous?.category ??
			(r.completedResearch
				? "completed-research"
				: r.redundant
					? "redundant-content"
					: r.reproducibleData
						? "reproducible-data"
						: r.kind === "constraint"
							? "user-constraint"
							: r.kind === "decision"
								? "decision"
								: "active-evidence");
		nextRefs.set(r.id, {
			id: r.id,
			kind: previous?.pinned ? previous.kind : r.kind,
			category,
			sourceEntryIds: [
				...new Set([...(previous?.sourceEntryIds ?? []), ...r.sourceEntryIds]),
			],
			dependencies: [
				...new Set([
					...(previous?.dependencies ?? []),
					...(r.dependencies ?? []),
				]),
			],
			pinned: Boolean(
				previous?.pinned ||
					r.pinned ||
					r.kind === "constraint" ||
					r.kind === "decision" ||
					category === "user-constraint" ||
					category === "acceptance-criteria" ||
					r.sourceEntryIds.some((id) => userIds.has(id)),
			),
			precisionSensitive: Boolean(
				previous?.precisionSensitive || r.precisionSensitive,
			),
			completedResearch:
				r.completedResearch ?? previous?.completedResearch ?? false,
			redundant: r.redundant ?? previous?.redundant ?? false,
			reproducibleData:
				r.reproducibleData ?? previous?.reproducibleData ?? false,
			estimatedTokens: r.estimatedTokens ?? previous?.estimatedTokens ?? null,
			protectedReasons: [],
			taskId: update.taskId ?? previous?.taskId ?? null,
			summary: r.summary ?? previous?.summary ?? null,
			storage: previous?.storage ?? null,
			relevance:
				r.relevance ??
				previous?.relevance ??
				(r.kind === "constraint" || r.kind === "decision" ? "high" : "medium"),
			recoverability: previous?.recoverability ?? "unverified",
			activeConsumers: [],
			equivalentRepresentation:
				r.equivalentRepresentation ??
				previous?.equivalentRepresentation ??
				null,
		});
	}
	nextTasks.set(t.taskId, t);
	cycles(nextTasks);
	return {
		tasks: nextTasks,
		refs: nextRefs,
		active: update.active ? t.taskId : null,
	};
}
export function linkCheckpoints(
	snapshot: TaskSnapshot,
	receipts: readonly {
		id: string;
		segmentIds?: string[];
		sources?: { id: string }[];
	}[],
) {
	for (const r of snapshot.references) {
		r.storage = null;
		r.recoverability = "unverified";
		for (const ckpt of receipts) {
			const segmentIds =
				ckpt.segmentIds ?? ckpt.sources?.map((s) => s.id) ?? [];
			if (
				r.sourceEntryIds.length > 0 &&
				r.sourceEntryIds.every((id) => segmentIds.includes(id))
			) {
				r.storage = {
					checkpointId: ckpt.id,
					segmentId: r.sourceEntryIds[0],
					verified: true,
				};
				r.recoverability = "recoverable";
				break;
			}
		}
	}
}
export function buildTasks(
	entries: readonly SessionEntry[],
	cwd = process.cwd(),
	receipts?: readonly {
		id: string;
		segmentIds?: string[];
		sources?: { id: string }[];
	}[],
): TaskSnapshot {
	let tasks = new Map<string, Task>(),
		refs = new Map<string, Reference>(),
		active: string | null = null,
		limited = false;
	const issues: string[] = [],
		triggers = new Set<string>(),
		calls = new Map<string, { name: string; args: Record<string, unknown> }>();
	const sourceIds = new Set(entries.map((e) => e.id)),
		userIds = new Set(
			entries
				.filter((e) => e.type === "message" && e.message.role === "user")
				.map((e) => e.id),
		);
	const issue = (s: string) => {
		if (!issues.includes(s) && issues.length < 32) issues.push(s);
	};
	const reference = (
		entry: SessionEntry,
		pinned: boolean,
		precision = false,
		kind: Reference["kind"] = pinned && !precision ? "constraint" : "evidence",
		category: SegmentCategory = pinned && !precision
			? "user-constraint"
			: precision
				? "active-evidence"
				: "execution-state",
		taskId: string | null = active,
	) => {
		if (refs.size >= 256) {
			limited = true;
			issue(
				"Context reference capacity reached; protection coverage is incomplete",
			);
			return;
		}
		const message = entry.type === "message" ? entry.message : undefined;
		const content = object(message).content;
		const estimate =
			typeof content === "string"
				? Math.ceil(content.length / 4)
				: textTokens(message);
		refs.set("entry:" + entry.id, {
			id: "entry:" + entry.id,
			kind,
			category,
			sourceEntryIds: [entry.id],
			dependencies: [],
			pinned,
			precisionSensitive: precision,
			completedResearch: false,
			redundant: false,
			reproducibleData: category === "reproducible-data",
			estimatedTokens: estimate,
			protectedReasons: [],
			taskId,
			summary: null,
			storage: null,
			relevance: pinned || precision ? "high" : "medium",
			recoverability: "unverified",
			activeConsumers: [],
			equivalentRepresentation: null,
		});
	};
	for (const entry of entries) {
		if (entry.type === "custom" && entry.customType === "aco-task") {
			const data = object(entry.data);
			try {
				if (
					data.version !== 1 ||
					(data.origin !== "command" && data.origin !== "tool")
				)
					throw Error("Unsupported task metadata");
				const next = apply(
					tasks,
					refs,
					data.update,
					data.origin,
					entry.id,
					sourceIds,
					userIds,
				);
				tasks = next.tasks;
				refs = next.refs;
				if (next.active && next.active !== active) {
					active = next.active;
					triggers.add("task-switch");
				}
				active ??= tasks.keys().next().value ?? null;
				if ((data.update as Declaration).planStatus === "completed")
					triggers.add("plan-completed");
			} catch (error) {
				issue(error instanceof Error ? error.message : "Invalid task metadata");
				limited = true;
			}
			continue;
		}
		if (entry.type !== "message") continue;
		const m = entry.message;
		if (m.role === "user") {
			if (!active) {
				active = "task:" + entry.id;
				const t = newTask(active);
				t.status = "running";
				t.provenance.status = prov(
					"inferred",
					entry.id,
					"user intent observed; task success not established",
				);
				tasks.set(active, t);
			}
			reference(entry, true, false, "constraint", "user-constraint", active);
			const t = tasks.get(active);
			if (!t) {
				limited = true;
				issue("Active task missing");
				continue;
			}
			if (t.requiredContextIds.length < 256)
				t.requiredContextIds.push("entry:" + entry.id);
			signal(t, {
				family: "goal",
				event: "user-intent",
				phase: hint(text(m).slice(0, 8192)),
				sourceEntryId: entry.id,
			});
		} else if (m.role === "assistant") {
			let hasToolCalls = false;
			for (const block of m.content) {
				if (block.type !== "toolCall") continue;
				hasToolCalls = true;
				if (calls.size >= 256) {
					limited = true;
					issue("Tool attribution capacity reached");
					break;
				}
				calls.set(block.id, {
					name: block.name,
					args: object(block.arguments),
				});
			}
			if (hasToolCalls) {
				reference(entry, false, false, "evidence", "execution-state", active);
			}
		} else if (m.role === "toolResult" && active) {
			if (m.toolName === "aco_task") {
				if (m.isError)
					reference(entry, true, true, "evidence", "active-evidence", active);
				continue;
			}
			const t = tasks.get(active);
			if (!t) {
				limited = true;
				issue("Active task missing");
				continue;
			}
			const c = calls.get(m.toolCallId);
			calls.delete(m.toolCallId);
			const args = c?.args ?? {},
				name = m.toolName;
			const path =
				typeof args.path === "string"
					? args.path
					: typeof args.file_path === "string"
						? args.file_path
						: null;
			const command = typeof args.command === "string" ? args.command : "";
			const test =
				/test|vitest|pytest|jest/.test(name) ||
				/\b(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:test|typecheck)\b|\b(?:vitest|pytest|jest)\b|\b(?:go|cargo)\s+test\b/.test(
					command,
				);
			if (test) {
				reference(
					entry,
					m.isError,
					m.isError,
					"evidence",
					"active-evidence",
					active,
				);
				const details = object(m.details),
					structured = object(object(m).structuredContent);
				const code =
					details.exitCode ??
					details.exit_code ??
					structured.exitCode ??
					structured.exit_code;
				t.testState = m.isError
					? "failed"
					: typeof code === "number" && Number.isInteger(code)
						? code === 0
							? "passed"
							: "failed"
						: "unknown";
				if (t.testState === "failed") {
					const r = refs.get("entry:" + entry.id);
					if (r) {
						r.pinned = true;
						r.precisionSensitive = true;
					}
				}
				signal(t, {
					family: "test",
					event: "test-return",
					phase: "test",
					sourceEntryId: entry.id,
				});
				triggers.add("test-return");
			} else if (/delegate|subagent/.test(name)) {
				reference(
					entry,
					m.isError,
					m.isError,
					"evidence",
					"active-evidence",
					active,
				);
				signal(t, {
					family: "tool",
					event: "subagent-return",
					phase: null,
					sourceEntryId: entry.id,
				});
				triggers.add("subagent-return");
			} else if (
				!m.isError &&
				/^(write|edit|replace|replace_match|insert|move|copy)$/.test(name) &&
				path
			) {
				reference(entry, false, false, "artifact", "execution-state", active);
				if (!t.modifiedResources.includes(path)) {
					if (t.modifiedResources.length >= 32 || path.length > 512) {
						limited = true;
						issue(
							"Resource attribution capacity reached; write conflicts may be incomplete",
						);
					} else t.modifiedResources.push(path);
				}
				signal(t, {
					family: "resource",
					event: "resource-touch",
					phase: "implement",
					sourceEntryId: entry.id,
				});
				triggers.add("resource-change");
			} else if (
				!m.isError &&
				(/plan|todo/.test(name) ||
					(path && /(?:^|[/\\])(?:plans?[/\\]|plan\.md$)/i.test(path)))
			) {
				reference(entry, false, false, "artifact", "execution-state", active);
				signal(t, {
					family: "plan",
					event: "plan-observed",
					phase: "plan",
					sourceEntryId: entry.id,
				});
				const plan = args.plan;
				if (Array.isArray(plan) && plan.length && plan.length <= 64) {
					t.remainingSteps = plan.filter(
						(p) => object(p).status !== "completed",
					).length;
					t.planStatus = t.remainingSteps === 0 ? "completed" : "running";
					t.provenance.planStatus = prov(
						"inferred",
						entry.id,
						"successful tool-reported plan state",
					);
					t.provenance.remainingSteps = prov(
						"inferred",
						entry.id,
						"successful tool-reported remaining plan steps",
					);
					if (t.planStatus === "completed") triggers.add("plan-completed");
				}
			} else if (!m.isError && /read|grep|search|find/.test(name)) {
				reference(entry, false, false, "evidence", "reproducible-data", active);
				signal(t, {
					family: "tool",
					event: "exploration",
					phase: "explore",
					sourceEntryId: entry.id,
				});
			} else {
				reference(
					entry,
					m.isError,
					m.isError,
					"evidence",
					"active-evidence",
					active,
				);
			}
		}
	}
	for (const t of tasks.values()) {
		if (!t.provenance.phase || t.provenance.phase.origin === "unknown") {
			const signals = t.signals;
			let phase: Phase | null = null,
				basis: Signal[] = [];
			for (let i = signals.length - 1; i >= 0; i--) {
				const s = signals[i];
				if (!s.phase) continue;
				const other = signals
					.slice(0, i)
					.reverse()
					.find(
						(x) =>
							x.family !== s.family &&
							(x.phase === s.phase ||
								(s.family === "test" && x.family === "resource") ||
								(s.family === "resource" && x.family === "plan")),
					);
				if (other) {
					phase = s.phase;
					basis = [other, s];
					break;
				}
			}
			t.phase = phase;
			t.provenance.phase = phase
				? {
						origin: "inferred",
						sourceEntryIds: basis.map((s) => s.sourceEntryId),
						reason:
							"tentative: corroborated independent signal families, not assistant prose",
					}
				: unknown();
		}
		t.unresolvedDependencies = t.dependencies.filter((id) => !tasks.has(id));
		if (t.unresolvedDependencies.length)
			issue("Unresolved task dependencies for " + t.taskId);
		for (const id of t.requiredContextIds)
			if (!refs.has(id)) issue("Unresolved context reference " + id);
	}
	for (const t of tasks.values()) {
		if (t.status === "completed") continue;
		const resources = new Set(
			[...t.writeResources, ...t.modifiedResources].map((p) =>
				resourceKey(p, cwd),
			),
		);
		for (const other of tasks.values()) {
			if (t === other || other.status === "completed") continue;
			if (
				[...other.writeResources, ...other.modifiedResources].some((p) =>
					resources.has(resourceKey(p, cwd)),
				)
			)
				t.conflictWith.push(other.taskId);
		}
	}
	for (const t of tasks.values())
		if (t.conflictWith.length) {
			t.writeConflictRisk = 1;
			t.provenance.writeConflictRisk = {
				origin: "inferred",
				sourceEntryIds: t.provenance.writeResources?.sourceEntryIds ?? [],
				reason:
					"concrete normalized resource overlap; 1 is an overlap indicator, not calibrated probability",
			};
		}

	// Active consumers: compute which active tasks or pinned decisions depend on each reference
	const addConsumer = (
		refId: string,
		consumer: string,
		seen = new Set<string>(),
	) => {
		if (seen.has(refId)) return;
		seen.add(refId);
		const r = refs.get(refId);
		if (!r) return;
		if (!r.activeConsumers.includes(consumer)) r.activeConsumers.push(consumer);
		for (const dep of r.dependencies) addConsumer(dep, consumer, seen);
	};
	for (const t of tasks.values()) {
		if (t.status !== "completed") {
			for (const refId of t.requiredContextIds) {
				addConsumer(refId, t.taskId);
			}
		}
	}
	for (const r of refs.values()) {
		if (
			(r.kind === "decision" || r.category === "decision") &&
			(r.pinned || r.activeConsumers.length > 0)
		) {
			for (const dep of r.dependencies) {
				addConsumer(dep, r.id);
			}
		}
	}

	const protect = (id: string, reason: string, seen = new Set<string>()) => {
		if (seen.has(id)) return;
		seen.add(id);
		const r = refs.get(id);
		if (!r) {
			issue("Unresolved protected reference " + id);
			return;
		}
		if (!r.protectedReasons.includes(reason)) r.protectedReasons.push(reason);
		for (const dep of r.dependencies)
			protect(dep, "dependency of protected " + r.id, seen);
	};
	for (const r of refs.values()) {
		if (r.sourceEntryIds.some((id) => userIds.has(id)))
			protect(r.id, "user constraint/acceptance source");
		if (r.pinned) protect(r.id, "pinned constraint/critical decision");
		if (r.precisionSensitive)
			protect(r.id, "precision-sensitive protocol/error evidence");
		if (r.activeConsumers.length > 0)
			protect(
				r.id,
				"active consumer dependency: " + r.activeConsumers.join(", "),
			);
	}
	const protectTask = (
		id: string,
		consumer: string,
		seen = new Set<string>(),
	) => {
		if (seen.has(id)) return;
		seen.add(id);
		const t = tasks.get(id);
		if (!t) return;
		for (const ref of t.requiredContextIds)
			protect(ref, "unfinished task/dependency " + consumer);
		for (const dep of t.dependencies) protectTask(dep, consumer, seen);
	};
	for (const t of tasks.values())
		if (t.status !== "completed") protectTask(t.taskId, t.taskId);
	let changed = true;
	while (changed) {
		changed = false;
		const protectedSources = new Set(
			[...refs.values()]
				.filter((r) => r.protectedReasons.length)
				.flatMap((r) => r.sourceEntryIds),
		);
		for (const r of refs.values())
			if (
				!r.protectedReasons.length &&
				r.sourceEntryIds.some((id) => protectedSources.has(id))
			) {
				protect(r.id, "shares protected source");
				changed = true;
			}
	}
	const snapshot: TaskSnapshot = {
		activeTaskId: active,
		tasks: [...tasks.values()],
		references: [...refs.values()],
		issues,
		coverage: limited ? "limited" : "complete",
		triggers: [...triggers],
		sourceCount: entries.length,
	};
	if (receipts?.length) {
		linkCheckpoints(snapshot, receipts);
	}
	return snapshot;
}
export function validateDeclaration(
	raw: unknown,
	entries: readonly SessionEntry[],
	cwd = process.cwd(),
): Declaration {
	const state = buildTasks(entries, cwd);
	if (state.coverage === "limited")
		throw Error("Incomplete branch analysis; declaration not committed");
	const users = new Set(
		entries
			.filter((e) => e.type === "message" && e.message.role === "user")
			.map((e) => e.id),
	);
	apply(
		new Map(state.tasks.map((t) => [t.taskId, t])),
		new Map(state.references.map((r) => [r.id, r])),
		raw,
		"command",
		"pending",
		new Set(entries.map((e) => e.id)),
		users,
	);
	return raw as Declaration;
}
