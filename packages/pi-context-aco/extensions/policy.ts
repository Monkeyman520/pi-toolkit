import type { CompositionStep } from "./composition.ts";
import type { Pressure } from "./pressure.ts";
import { recommend } from "./recommend.ts";
import type { TaskSnapshot } from "./tasks.ts";

interface Candidate {
	id: string;
	steps: CompositionStep[];
	reason: string;
	estimatedSavings: number | null;
	continuity: string;
	recovery: string;
	risk: string;
	overhead: string;
	cache: string;
}
export interface Decision {
	selected: string;
	candidates: Candidate[];
	triggers: string[];
	taskKey: string;
	projectedTokens: number | null;
	modelDecisionCalls: 0;
	predictionComparison: {
		previousProjectedTokens: number | null;
		observedHostEstimatedTokens: number | null;
		error: number | null;
		scope: string;
	};
	selectionPolicy: string;
}
export function decide(
	state: TaskSnapshot,
	pressure: Pressure,
	previous?: Decision,
	unavailableSources: ReadonlySet<string> = new Set(),
): Decision {
	const proposal = recommend(state, pressure);
	const task = state.tasks.find((t) => t.taskId === state.activeTaskId);
	const taskKey = JSON.stringify([
		state.activeTaskId,
		state.tasks.map((t) => [
			t.taskId,
			t.phase,
			t.status,
			t.planStatus,
			t.remainingSteps,
			t.estimatedFutureTokens,
			t.conflictWith,
			t.unresolvedDependencies,
		]),
		state.references.map((r) => [
			r.id,
			r.completedResearch,
			r.protectedReasons,
		]),
		state.issues,
	]);
	const capacity = pressure.capacity.value;
	const projected =
		Math.max(
			proposal.projectedTaskTokens ?? 0,
			pressure.projectedTokens.value ?? 0,
		) || null;
	const growth =
		capacity !== null && projected !== null && projected > capacity;
	const triggers: string[] = [];
	if (!previous) triggers.push("initial");
	if (previous && previous.taskKey !== taskKey) triggers.push("task-change");
	if (growth && (!previous || projected !== previous.projectedTokens))
		triggers.push("forecast-deterioration");
	if (
		state.issues.length ||
		task?.conflictWith.length ||
		task?.unresolvedDependencies.length
	)
		triggers.push("semantic-conflict");
	const candidates: Candidate[] = [
		{
			id: "no-op",
			steps: [],
			reason: proposal.reasons.join(" "),
			estimatedSavings: 0,
			continuity:
				"Retain the current working set; task completion is not inferred",
			recovery: "No unloading",
			risk: growth
				? "Upcoming work may exceed capacity"
				: "No supported intervention benefit",
			overhead: "Zero additional decision model calls",
			cache: "Prefix preserved; future cache metrics unknown",
		},
	];
	const cache =
		"Prefix changes may invalidate cache; read/write/new-input cost unknown until provider reports";
	const ids = [
		...new Set(
			proposal.actions
				.filter((a) => a.kind === "prune")
				.flatMap((a) => a.referenceIds)
				.flatMap(
					(id) =>
						state.references.find((r) => r.id === id)?.sourceEntryIds ?? [],
				)
				.filter((id) => !unavailableSources.has(id)),
		),
	];
	if (ids.length && ids.length <= 64)
		candidates.push({
			id: "exact",
			steps: [
				{ kind: "checkpoint", request: { sourceEntryIds: ids } },
				{ kind: "prune", request: { sourceEntryIds: ids } },
			],
			reason:
				"Completed redundant research has no known protected consumer; verify recovery before exact unloading",
			estimatedSavings: proposal.estimatedSavings.value,
			continuity: "Dependency and legal-exchange checks at execution",
			recovery: "Verified scoped originals and task checkpoint required",
			risk: "Stale declarations, unavailable recovery, repeated reads",
			overhead:
				"Archive/readback and boundary latency; no decision model calls",
			cache,
		});
	if (proposal.actions.some((a) => a.kind === "delegate"))
		candidates.push({
			id: "delegate",
			steps: [],
			reason:
				"Independent future work can be isolated; explicit minimal child contract still required",
			estimatedSavings: task?.estimatedFutureTokens ?? null,
			continuity: "Parent must verify and reconcile child results",
			recovery: "Scoped necessary evidence only",
			risk: "Coordination/shared-resource/child failure",
			overhead:
				"Child input/output plus parent and coordination costs; no full-parent history",
			cache,
		});
	if (proposal.actions.some((a) => a.kind === "compact"))
		candidates.push({
			id: "compact",
			steps: [],
			reason:
				"Forecast does not fit; bounded local/native proposal needs explicit sources and independent authority",
			estimatedSavings: null,
			continuity:
				"Protected exact content and extractive verification remain mandatory",
			recovery: "Verified original checkpoint before replacement",
			risk: "Unsupported summaries or cache disruption",
			overhead:
				"Readback/verification/native boundary latency; provider gaps remain unknown",
			cache,
		});
	// Compare task-specific capacity fit, not an occupancy tier or a fixed strategy order.
	const exact = candidates.find((c) => c.id === "exact");
	const needed =
		growth && projected !== null && capacity !== null
			? projected - capacity
			: 0;
	const exactFits =
		exact?.estimatedSavings !== null &&
		exact?.estimatedSavings !== undefined &&
		exact.estimatedSavings >= needed;
	const selected =
		proposal.kind === "no-op"
			? "no-op"
			: !growth && exact
				? "exact"
				: growth && exactFits
					? "exact"
					: growth && candidates.some((c) => c.id === "delegate")
						? "delegate"
						: growth && candidates.some((c) => c.id === "compact")
							? "compact"
							: (exact?.id ?? "no-op");
	const observed = pressure.usedTokens.value,
		prior = previous?.projectedTokens ?? null;
	return {
		selected,
		candidates,
		triggers,
		taskKey,
		projectedTokens: projected,
		modelDecisionCalls: 0,
		predictionComparison: {
			previousProjectedTokens: prior,
			observedHostEstimatedTokens: observed,
			error: prior === null || observed === null ? null : observed - prior,
			scope:
				"Next assessment host estimate versus prior horizon projection; not a matched-horizon accuracy score or provider token measurement",
		},
		selectionPolicy:
			"Uncalibrated task-fit/continuity and estimated capacity relief versus child isolation; alternatives exposed, weights not asserted optimal",
	};
}
