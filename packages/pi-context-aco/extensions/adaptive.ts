import { createHash, randomUUID } from "node:crypto";
import type {
	ExtensionAPI,
	ExtensionContext,
	TurnEndEvent,
} from "@earendil-works/pi-coding-agent";
import { actionDrafts, reconcileActions } from "./actions.ts";
import type { Compactor } from "./compaction.ts";
import {
	Composer,
	type CompositionAdapter,
	type CompositionStep,
	type StepResult,
} from "./composition.ts";
import type { Settings } from "./config.ts";
import type { Continuity } from "./continuity.ts";
import type { Delegator } from "./delegation.ts";
import {
	createPruneBoundaryDrafts,
	evaluatePruneCandidates,
	latestEdits,
} from "./prune.ts";
import { buildTasks } from "./tasks.ts";

type Runtime = { owner: object; settings: Settings };
type Prune = {
	id: string;
	ids: string[];
	check: () => void;
	status: string;
	error?: string;
};
const object = (v: unknown): Record<string, unknown> =>
	v && typeof v === "object" ? (v as Record<string, unknown>) : {};
/** Adapts actual executors; never mints authority or treats scheduling as commit. */
export class Adaptive {
	private composer = new Composer();
	private prune?: Prune;
	private readonly pi: ExtensionAPI;
	private readonly continuity: Continuity;
	private readonly compactor: Compactor;
	private readonly delegator: Delegator;
	private readonly runtime: () => Runtime | undefined;
	constructor(
		pi: ExtensionAPI,
		continuity: Continuity,
		compactor: Compactor,
		delegator: Delegator,
		runtime: () => Runtime | undefined,
	) {
		this.pi = pi;
		this.continuity = continuity;
		this.compactor = compactor;
		this.delegator = delegator;
		this.runtime = runtime;
		pi.on("turn_end", (event, ctx) => this.boundary(event, ctx));
		pi.on("session_compact", (event) => {
			const run = this.composer.report();
			const current = run?.results.at(-1);
			const own =
				run?.status === "pending" &&
				run.steps[run.results.length - 1]?.kind === "native" &&
				object(current?.evidence).id ===
					object(event.compactionEntry.details).acoActionId;
			if (!own) this.cancel("External compaction changed the working set");
		});
	}
	cancel(reason: string) {
		const run = this.composer.report();
		if (run?.status === "pending" || run?.status === "running") {
			this.compactor.reset();
			this.delegator.reset();
		}
		this.composer.cancel(reason);
		this.prune = undefined;
	}
	report() {
		return this.composer.report();
	}
	private enabled() {
		const r = this.runtime();
		if (!r?.settings.enabled || r.settings.mode !== "adaptive")
			throw Error("Adaptive mode must be explicitly enabled");
		return r;
	}
	private guard(ctx: ExtensionContext) {
		const r = this.enabled(),
			branch = ctx.sessionManager.getBranch(),
			anchor = branch.at(-1)?.id;
		const key = () =>
			JSON.stringify([
				ctx.cwd,
				ctx.sessionManager.getSessionId(),
				ctx.model?.provider,
				ctx.model?.id,
				ctx.model?.contextWindow,
				this.enabled().settings,
				ctx.sessionManager
					.getBranch()
					.flatMap((e) =>
						e.type === "custom" && e.customType === "aco-task"
							? [[e.id, e.data]]
							: [],
					),
			]);
		const initial = key();
		return () => {
			if (
				this.enabled().owner !== r.owner ||
				key() !== initial ||
				!ctx.sessionManager.getBranch().some((e) => e.id === anchor)
			)
				throw Error("Stale composition task/branch/configuration/model");
		};
	}
	private async safety(ctx: ExtensionContext) {
		const check = this.guard(ctx),
			branch = ctx.sessionManager.getBranch();
		if (reconcileActions(branch).some((a) => !a.success))
			throw Error("Unresolved partial context action; recovery required");
		const run = this.composer.report();
		const ownNativeId =
			run?.status === "pending" &&
			run.steps[run.results.length - 1]?.kind === "native"
				? object(run.results.at(-1)?.evidence).id
				: undefined;
		const nativeOutcomes = new Map(
			branch.flatMap((e) =>
				e.type === "custom" && e.customType === "aco-native-outcome"
					? [[object(e.data).id, object(e.data)] as const]
					: [],
			),
		);
		if (
			branch.some(
				(e) =>
					e.type === "custom" &&
					e.customType === "aco-native-intent" &&
					((!nativeOutcomes.has(object(e.data).id) &&
						object(e.data).id !== ownNativeId) ||
						nativeOutcomes.get(object(e.data).id)?.stateUncertain === true),
			)
		)
			throw Error(
				"Interrupted/uncertain native action; inspect recovery before composing",
			);
		const checkpoints = await this.continuity.getActiveCheckpoints(ctx);
		check();
		return checkpoints;
	}
	private adapter(ctx: ExtensionContext): CompositionAdapter {
		return {
			guard: () => this.guard(ctx),
			execute: async (step) => {
				await this.safety(ctx);
				if (step.kind === "checkpoint" || step.kind === "offload") {
					const check = this.guard(ctx);
					const evidence = await this.continuity.checkpoint(
						ctx,
						step.request,
						() => {
							check();
							return true;
						},
					);
					check();
					return { status: "complete", evidence };
				}
				if (step.kind === "prune") {
					if (this.prune?.status === "scheduled")
						throw Error("Prune already scheduled");
					const branch = ctx.sessionManager.getBranch(),
						checkpoints = await this.safety(ctx);
					const evaluation = evaluatePruneCandidates(
						buildTasks(branch, ctx.cwd),
						branch,
						checkpoints,
						this.enabled().settings,
					);
					const ids = step.request.sourceEntryIds;
					if (
						ids.some(
							(id) => !evaluation.eligible.some((c) => c.sourceEntryId === id),
						)
					)
						throw Error(
							"Requested prune unavailable, unsafe, unrecoverable or over budget",
						);
					this.prune = {
						id: randomUUID(),
						ids: [...ids],
						check: this.guard(ctx),
						status: "scheduled",
					};
					return {
						status: "pending",
						evidence: {
							id: this.prune.id,
							operation: "prune",
							sourceEntryIds: ids,
						},
					};
				}
				const result =
					step.kind === "semantic"
						? await this.compactor.summarize(ctx, step.request)
						: step.kind === "native"
							? await this.compactor.native(ctx)
							: await this.delegator.run(ctx, step.request);
				const evidence = object(result);
				return {
					status: ["scheduled", "requested", "prepared", "returned"].includes(
						String(evidence.status),
					)
						? "pending"
						: evidence.status === "committed"
							? "complete"
							: "blocked",
					evidence,
				};
			},
			inspect: async (step, previous) => this.inspect(ctx, step, previous),
		};
	}
	async start(ctx: ExtensionContext, raw: unknown) {
		if (
			this.compactor.report(ctx).localPending.length ||
			this.compactor.report(ctx).nativePending ||
			this.delegator.report(ctx).active
		)
			throw Error("Another executor is pending");
		const check = this.guard(ctx);
		const result = await this.composer.start(raw, this.adapter(ctx));
		try {
			check();
		} catch {
			return result;
		}
		this.record(ctx);
		return result;
	}
	async advance(ctx: ExtensionContext) {
		const check = this.guard(ctx);
		const result = await this.composer.advance(this.adapter(ctx));
		try {
			check();
		} catch {
			return result;
		}
		this.record(ctx);
		return result;
	}
	private record(ctx: ExtensionContext) {
		this.enabled();
		const run = this.composer.report();
		// Native preparation reads a strict branch snapshot asynchronously. Its own durable
		// intent is the pending receipt; do not invalidate it with coordinator metadata.
		if (
			run?.status === "pending" &&
			run.steps[run.results.length - 1]?.kind === "native"
		)
			return;
		if (run)
			this.pi.appendEntry("aco-composition", {
				version: 1,
				id: run.id,
				status: run.status,
				steps: run.steps.map((s) => s.kind),
				results: run.results.map((r) => ({
					status: r.status,
					latencyMs: r.latencyMs,
				})),
				sessionId: ctx.sessionManager.getSessionId(),
				error: run.error,
			});
	}
	private async inspect(
		ctx: ExtensionContext,
		step: CompositionStep,
		previous: StepResult,
	): Promise<StepResult> {
		await this.safety(ctx);
		const receipt = object(previous.evidence);
		if (step.kind === "prune") {
			const action = reconcileActions(ctx.sessionManager.getBranch()).find(
				(a) => a.id === receipt.id,
			);
			if (action)
				return {
					status:
						action.success &&
						action.targets.every(
							(t) =>
								latestEdits(ctx.sessionManager.getBranch()).get(t.id) === null,
						)
							? "complete"
							: "blocked",
					evidence: action,
				};
			return {
				status:
					this.prune &&
					this.prune.id === receipt.id &&
					this.prune.status === "scheduled"
						? "pending"
						: "blocked",
				evidence: this.prune
					? { ...receipt, status: this.prune.status, error: this.prune.error }
					: "Prune not observed",
			};
		}
		if (step.kind === "delegate") {
			const ids = Array.isArray(receipt.ids) ? receipt.ids : [];
			const outcomes = this.delegator
				.report(ctx)
				.outcomes.filter((o) => ids.includes(o.id));
			return {
				status:
					!ids.length ||
					outcomes.length !== ids.length ||
					outcomes.some((o) =>
						["failed", "cancelled", "interrupted", "rejected"].includes(
							o.status,
						),
					)
						? "blocked"
						: outcomes.every((o) => o.status === "verified")
							? "complete"
							: "pending",
				evidence: { ...receipt, outcomes },
			};
		}
		if (step.kind === "semantic") {
			const branch = ctx.sessionManager.getBranch();
			const action = reconcileActions(branch).find((a) => a.id === receipt.id);
			if (
				action?.success &&
				action.targets.some(
					(t) =>
						createHash("sha256")
							.update(
								JSON.stringify(latestEdits(branch).get(t.id)) ?? "undefined",
							)
							.digest("hex") !== t.digest,
				)
			)
				return {
					status: "blocked",
					evidence: "Semantic result was superseded; dependent work stopped",
				};
		}
		if (
			step.kind === "native" &&
			receipt.compactionEntryId &&
			ctx.sessionManager
				.getBranch()
				.filter((e) => e.type === "compaction")
				.at(-1)?.id !== receipt.compactionEntryId
		)
			return { status: "blocked", evidence: "Native result was superseded" };
		const outcome = this.compactor.report(ctx).last;
		return {
			status:
				!outcome || outcome.id !== receipt.id
					? "blocked"
					: outcome.status === "committed"
						? "complete"
						: ["scheduled", "requested", "prepared", "proposed"].includes(
									outcome.status,
								)
							? "pending"
							: "blocked",
			evidence: outcome,
		};
	}
	private async boundary(event: TurnEndEvent, ctx: ExtensionContext) {
		const pending = this.prune;
		if (pending?.status !== "scheduled" || event.outcome !== "completed")
			return;
		try {
			pending.check();
			const checkpoints = await this.safety(ctx);
			pending.check();
			const branch = ctx.sessionManager.getBranch();
			const evaluation = evaluatePruneCandidates(
				buildTasks(branch, ctx.cwd),
				branch,
				checkpoints,
				this.enabled().settings,
			);
			const candidates = evaluation.eligible.filter((c) =>
				pending.ids.includes(c.sourceEntryId),
			);
			if (
				pending.ids.some(
					(id) => !candidates.some((c) => c.sourceEntryId === id),
				)
			)
				throw Error("Prune prerequisites changed");
			const result = createPruneBoundaryDrafts(
				candidates,
				branch,
				event.entries,
			);
			if (!result.prunedTargetIds.length)
				throw Error("Conflicting/invalid prune boundary");
			pending.check();
			pending.status = "proposed";
			return {
				entries: [
					...event.entries,
					...actionDrafts(
						"prune",
						result.drafts.slice(event.entries.length),
						checkpoints.map((c) => c.id),
						result.beforeTokens,
						result.afterTokens,
						pending.id,
					),
				],
			};
		} catch (error) {
			pending.status = "blocked";
			pending.error = String(error);
			this.composer.cancel(String(error));
		}
	}
}
