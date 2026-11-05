import type { Metric, Pressure } from "./pressure.ts";
import { unknown } from "./pressure.ts";
import type { TaskSnapshot } from "./tasks.ts";

export interface ProposalAction {
	kind: "checkpoint" | "offload" | "delegate" | "prune" | "compact";
	referenceIds: string[];
	prerequisites: string[];
	reason: string;
}
export function recommend(state: TaskSnapshot, pressure: Pressure) {
	const actions: ProposalAction[] = [],
		reasons: string[] = [],
		risks: string[] = [];
	const task = state.tasks.find((t) => t.taskId === state.activeTaskId);
	const used = pressure.usedTokens.value,
		capacity = pressure.capacity.value;
	const remaining = task?.estimatedFutureTokens ?? null;
	const future =
		used === null || remaining === null
			? null
			: used + remaining + pressure.settings.reserveTokens;
	const projected = Math.max(future ?? 0, pressure.projectedTokens.value ?? 0);
	const near =
		task &&
		task.remainingSteps !== null &&
		task.remainingSteps <= 1 &&
		task.phase === "review" &&
		future !== null &&
		capacity !== null &&
		future <= capacity;
	const complete = task?.status === "completed";
	if (!task)
		reasons.push(
			"No task evidence: keep context and request explicit task metadata.",
		);
	else if (complete || near)
		reasons.push(
			complete
				? "Task completion is declared, not verified; no context intervention proposed."
				: "Bounded remaining review work fits; continuity favors no-op even at high occupancy.",
		);
	else {
		const candidates = state.references.filter(
			(r) => r.completedResearch && !r.protectedReasons.length,
		);
		if (
			candidates.length &&
			state.coverage === "complete" &&
			!state.issues.length
		) {
			const ids = candidates.map((r) => r.id);
			actions.push({
				kind: "checkpoint",
				referenceIds: [],
				prerequisites: [
					"V2 store/checkpoint implementation",
					"verify active task state",
				],
				reason:
					"Retain decisions and current execution facts before any unloading.",
			});
			actions.push({
				kind: "offload",
				referenceIds: ids,
				prerequisites: [
					"verified persisted originals and scoped recall",
					"recheck active consumers",
				],
				reason:
					"Declared completed research has no known protected consumer; archive before considering removal.",
			});
			actions.push({
				kind: "prune",
				referenceIds: ids,
				prerequisites: [
					"verified recovery",
					"full dependency/equivalence and message-structure checks",
					"implemented executor",
				],
				reason:
					"Only a conditional exact-prune candidate after offload verification; not safe-to-delete evidence.",
			});
		}
		const pressureAhead = capacity !== null && projected > capacity;
		if (pressureAhead) {
			reasons.push(
				"Estimated upcoming work exceeds capacity including reserve, regardless of current occupancy.",
			);
			if (
				task.delegatable === true &&
				!task.conflictWith.length &&
				!task.unresolvedDependencies.length &&
				!state.issues.length &&
				state.coverage === "complete"
			) {
				actions.push({
					kind: "delegate",
					referenceIds: task.requiredContextIds,
					prerequisites: [
						"independence/allowed-resource verification",
						"user confirmation or applicable explicit authorization",
						"configured finite total-token/depth/concurrency budgets",
						"implemented delegation provider",
					],
					reason:
						"Declared independent work may isolate future main-agent context; no full-history copying.",
				});
			} else
				risks.push(
					"Delegation not recommended without resolved independence, dependencies and write conflicts.",
				);
			actions.push({
				kind: "compact",
				referenceIds: [],
				prerequisites: [
					"user confirmation or applicable explicit authorization",
					"verified recoverable sources and protected-dependency/summary validation",
					"budget and native-completion verification",
					"implemented compaction executor",
				],
				reason:
					"Fallback candidate only if continuity can be preserved; semantic loss and cache-prefix costs remain unknown.",
			});
		}
		if (task.planStatus === "completed")
			reasons.push(
				"Plan completion triggers reassessment, not permission to discard exact evidence.",
			);
		if (!actions.length)
			reasons.push(
				"No supported beneficial candidate; preserve working set and continue locally.",
			);
	}
	if (state.coverage === "limited" || state.issues.length)
		risks.push(
			"Incomplete/unresolved references: no claim that protected or unrepresented evidence is disposable.",
		);
	if (task?.conflictWith.length)
		risks.push("Overlapping active writers: " + task.conflictWith.join(", "));
	if (task?.testState === "failed")
		risks.push(
			"Reported test failure remains unresolved; a completion declaration is not acceptance.",
		);
	risks.push(
		"All V1 actions are suggestions only; recovery and execution are unavailable.",
	);
	const reclaim = actions
		.filter((a) => a.kind === "offload")
		.flatMap((a) => a.referenceIds);
	const refs = state.references.filter((r) => reclaim.includes(r.id));
	let savings: Metric = unknown(
		"semantic/delegation overhead and actual savings not measured",
	);
	if (refs.length && refs.every((r) => r.estimatedTokens !== null)) {
		const seen = new Set<string>();
		let n = 0;
		for (const r of refs) {
			if (r.sourceEntryIds.some((id) => seen.has(id))) continue;
			for (const id of r.sourceEntryIds) seen.add(id);
			n += r.estimatedTokens ?? 0;
		}
		savings = {
			kind: "estimated",
			value: n,
			source:
				"declared/reference text-size upper bound before replacement/coordination overhead",
		};
	} else if (actions.some((a) => a.kind === "delegate") && remaining !== null)
		savings = {
			kind: "estimated",
			value: remaining,
			source: "declared future-work ceiling, not observed savings",
		};
	return {
		kind: actions.length ? "proposal" : "no-op",
		executed: false,
		actions,
		reasons,
		risks,
		estimatedSavings: savings,
		continuity:
			"Preserve user constraints, critical decisions, unfinished tasks and active exact evidence; no verified equivalent is available in V1.",
		recovery: "unverified; no store/executor in V1",
		cost: {
			modelTokens: unknown(
				"no extra decision calls; future strategy tokens unknown",
			),
			latencyMs: unknown("future storage/summary/delegation latency unknown"),
			cache:
				"prefix invalidation cost unknown; avoid assuming token savings reduce total cost",
			coordination: "task handoff/shared-write overhead requires verification",
		},
		modelDecisionCalls: 0,
		projectedTaskTokens: future,
	};
}
export type Recommendation = ReturnType<typeof recommend>;
