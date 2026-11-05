import { createHash, randomUUID } from "node:crypto";
import {
	buildSessionProjection,
	type CompactionEntry,
	type ExtensionAPI,
	type ExtensionContext,
	type SessionBeforeCompactEvent,
	type SessionBoundaryDraft,
	type TurnEndEvent,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { Check } from "typebox/value";
import { actionDrafts, reconcileActions } from "./actions.ts";
import type { Settings } from "./config.ts";
import type { Continuity, VerifiedCheckpoint } from "./continuity.ts";
import { Permissions } from "./permissions.ts";
import {
	latestEdits,
	legalMessages,
	validateEdits,
	verifiedOriginal,
} from "./prune.ts";
import {
	generateSummary,
	type SummarySource,
	verifySummary,
} from "./summary.ts";
import { buildTasks } from "./tasks.ts";

const requestSchema = Type.Object(
	{
		sourceEntryIds: Type.Array(Type.String({ minLength: 1, maxLength: 128 }), {
			minItems: 1,
			maxItems: 1,
			uniqueItems: true,
		}),
		summary: Type.Optional(Type.String({ maxLength: 131072 })),
	},
	{ additionalProperties: false },
);
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const estimate = (value: unknown) =>
	Math.ceil(JSON.stringify(value).length / 4);
type Runtime = { owner: object; settings: Settings };
type Outcome = {
	id?: string;
	operation: string;
	status: string;
	error?: string;
	[key: string]: unknown;
};
type PendingLocal = {
	id: string;
	ids: string[];
	guard: () => void;
	summary: string;
	before: number;
	after: number;
};
type PendingNative = {
	id: string;
	ids: string[];
	guard: () => void;
	summary?: string;
	firstKeptEntryId?: string;
	started: number;
};
const taskKey = (ctx: ExtensionContext) =>
	JSON.stringify([
		ctx.cwd,
		ctx.sessionManager.getSessionId(),
		buildTasks(ctx.sessionManager.getBranch(), ctx.cwd).activeTaskId,
	]);

/** ACO-owned higher-impact actions only. No provider/model calls or host-global compaction interception. */
export class Compactor {
	readonly permissions = new Permissions();
	private pi: ExtensionAPI;
	private continuity: Continuity;
	private runtime: () => Runtime | undefined;
	private local?: PendingLocal;
	private pendingNative?: PendingNative;
	private issuedNative = new Set<string>();
	private working = false;
	private last?: Outcome;
	constructor(
		pi: ExtensionAPI,
		continuity: Continuity,
		runtime: () => Runtime | undefined,
	) {
		this.pi = pi;
		this.continuity = continuity;
		this.runtime = runtime;
		pi.on("turn_end", (event, ctx) => this.boundary(event, ctx));
		pi.on("agent_settled", (_event, ctx) => {
			if (
				this.last?.operation === "semantic" &&
				this.last.status === "proposed"
			) {
				const actual = reconcileActions(ctx.sessionManager.getBranch()).find(
					(a) => a.id === this.last?.id,
				);
				this.last = {
					...this.last,
					status: actual?.status ?? "not-committed",
					hostEstimatedTokensAfter: ctx.getContextUsage?.()?.tokens ?? null,
					executed: actual?.success ?? false,
				};
			}
		});
		pi.on("session_before_compact", (event, ctx) =>
			this.beforeNative(event, ctx),
		);
		pi.on("session_compact", (event, ctx) => {
			this.observeNative(event.compactionEntry, ctx);
		});
		pi.on("session_compact_failed", (event, ctx) => {
			if (this.pendingNative)
				this.finishNative(
					ctx,
					event.aborted ? "cancelled" : "failed",
					event.errorMessage ?? "Native compaction cancelled",
				);
		});
	}
	private record(outcome: Outcome) {
		this.last = outcome;
		return outcome;
	}
	reset() {
		this.permissions.reset();
		if (this.local || this.pendingNative)
			this.last = {
				operation: this.local ? "semantic" : "native",
				status: "cancelled",
				error: "Session/tree/reload or authorization reset",
			};
		else this.last = undefined;
		this.local = undefined;
		this.pendingNative = undefined;
	}
	report(ctx: ExtensionContext) {
		const branch = ctx.sessionManager.getBranch();
		const observed =
			this.last?.operation === "semantic"
				? reconcileActions(branch).find((a) => a.id === this.last?.id)
				: undefined;
		const last = observed
			? { ...this.last, status: observed.status, executed: observed.success }
			: this.last;
		return {
			last: last ?? null,
			localPending: this.local?.ids ?? [],
			nativePending: this.pendingNative?.id ?? null,
			permissions: this.permissions.inspect(ctx),
			actions: reconcileActions(branch),
			nativeHistory: branch
				.filter(
					(e) =>
						e.type === "custom" &&
						(e.customType === "aco-native-intent" ||
							e.customType === "aco-native-outcome"),
				)
				.map((e) => (e.type === "custom" ? e.data : null)),
			verification:
				"Only exact extractive text/tool-call representations; arbitrary paraphrases and multimodal summaries are unsupported",
			cacheImpact:
				"Prefix-cache disruption possible; aggregate provider/cache costs unavailable unless reported",
		};
	}
	private enabled() {
		const r = this.runtime();
		if (!r?.settings.enabled || r.settings.mode !== "compact")
			throw Error("V3 compact mode must be explicitly enabled");
		return r;
	}
	private guard(ctx: ExtensionContext, strict = false) {
		const runtime = this.enabled(),
			owner = runtime.owner,
			settings = JSON.stringify(runtime.settings),
			key = taskKey(ctx);
		const anchor = ctx.sessionManager.getBranch().at(-1)?.id;
		const branchKey = JSON.stringify(
			ctx.sessionManager.getBranch().map((e) => e.id),
		);
		const model = JSON.stringify([
			ctx.model?.provider,
			ctx.model?.id,
			ctx.model?.contextWindow,
		]);
		const permission = this.permissions.guard();
		return () => {
			permission();
			const r = this.enabled();
			if (
				r.owner !== owner ||
				JSON.stringify(r.settings) !== settings ||
				taskKey(ctx) !== key ||
				JSON.stringify([
					ctx.model?.provider,
					ctx.model?.id,
					ctx.model?.contextWindow,
				]) !== model ||
				!ctx.sessionManager.getBranch().some((e) => e.id === anchor) ||
				(strict &&
					JSON.stringify(ctx.sessionManager.getBranch().map((e) => e.id)) !==
						branchKey)
			)
				throw Error(
					"ACO stale task/session/branch/configuration/model; action cancelled",
				);
		};
	}
	private async checkpoint(
		ctx: ExtensionContext,
		ids: string[],
		check: () => void,
	) {
		const branch = ctx.sessionManager.getBranch();
		const snapshot = buildTasks(branch, ctx.cwd);
		if (snapshot.coverage !== "complete" || snapshot.issues.length)
			throw Error(
				`Task/dependency analysis incomplete (${snapshot.coverage}): ${snapshot.issues.join("; ")}`,
			);
		if (reconcileActions(branch).some((a) => !a.success))
			throw Error(
				"Unresolved partial context action; restore/inspect before dependent work",
			);
		const intents = branch.filter(
			(e) => e.type === "custom" && e.customType === "aco-native-intent",
		);
		const outcomes = new Set(
			branch.flatMap((e) =>
				e.type === "custom" &&
				e.customType === "aco-native-outcome" &&
				e.data &&
				typeof e.data === "object" &&
				"id" in e.data
					? [e.data.id]
					: [],
			),
		);
		if (
			intents.some(
				(e) =>
					e.type === "custom" &&
					e.data &&
					typeof e.data === "object" &&
					"id" in e.data &&
					!outcomes.has(e.data.id) &&
					e.data.id !== this.pendingNative?.id,
			)
		)
			throw Error(
				"Interrupted native compaction intent requires explicit inspection/tree recovery; no blind retry",
			);
		const checkpoints = await this.continuity.getActiveCheckpoints(ctx);
		check();
		const checkpoint = checkpoints.find((c) =>
			ids.every((id) => verifiedOriginal(id, branch, [c])),
		);
		if (!checkpoint)
			throw Error(
				"Verified active-task checkpoint covering every source is required; inaccessible originals cannot authorize compaction",
			);
		return checkpoint;
	}
	private provenance(
		checkpoint: VerifiedCheckpoint,
		ids: string[],
		previousSummary?: string,
	) {
		const raw = checkpoint.originals.get("continuity");
		if (!raw) throw Error("Verified task continuity is unavailable");
		return {
			checkpointId: checkpoint.id,
			sourceEntryIds: ids,
			historical: true,
			continuity: JSON.parse(raw),
			...(previousSummary === undefined ? {} : { previousSummary }),
		};
	}
	private budget(ctx: ExtensionContext, input: number, output: number) {
		const { settings } = this.enabled();
		const window = ctx.model?.contextWindow;
		const usage = ctx.getContextUsage?.();
		if (
			input > settings.maxCompactInputTokens ||
			output > settings.maxSummaryTokens ||
			!Number.isFinite(input) ||
			!Number.isFinite(output) ||
			output < 1
		)
			throw Error("Compaction input/summary budget exceeded");
		if (
			!window ||
			usage?.tokens == null ||
			Math.max(0, usage.tokens - input) + output + settings.reserveTokens >
				window
		)
			throw Error(
				"Current model capacity/remaining-context budget cannot be verified",
			);
	}
	private sourceMessages(
		ctx: ExtensionContext,
		ids: string[],
		local: boolean,
	): SummarySource[] {
		const projection = buildSessionProjection(ctx.sessionManager.getBranch());
		const sources: SummarySource[] = [];
		for (const id of ids) {
			const projected = projection.entries.find((e) => e.sourceEntry.id === id);
			if (projected?.messages.length !== 1)
				throw Error(
					"Source is not a unique visible active-branch contribution",
				);
			const message = projected.messages[0];
			if (
				local &&
				(message.role !== "toolResult" ||
					!Array.isArray(message.content) ||
					message.content.some((b) => b.type !== "text"))
			)
				throw Error(
					"Local replacement supports only complete text tool-result bodies",
				);
			sources.push({
				id,
				message: structuredClone(message) as unknown as Record<string, unknown>,
			});
		}
		return sources;
	}
	private start() {
		this.enabled();
		if (
			this.last?.stateUncertain === true ||
			this.last?.outcomePersisted === false
		)
			throw Error(
				"Uncertain prior native state; inspect and recover via tree before dependent actions",
			);
		if (this.working || this.local || this.pendingNative)
			throw Error("ACO compaction action already pending");
		this.working = true;
	}
	async summarize(ctx: ExtensionContext, raw: unknown) {
		if (!Check(requestSchema, raw))
			throw Error("Invalid semantic summary request");
		this.start();
		const started = performance.now();
		try {
			const strict = this.guard(ctx, true),
				ids = raw.sourceEntryIds;
			if (ids.some((id) => latestEdits(ctx.sessionManager.getBranch()).has(id)))
				throw Error(
					"Local source is already edited; restore before replacing again",
				);
			const sources = this.sourceMessages(ctx, ids, true);
			const before = estimate(sources);
			this.budget(ctx, before, this.enabled().settings.maxSummaryTokens);
			const authorization = await this.permissions.allow(
				ctx,
				"semantic",
				ids,
				before,
				this.enabled().settings.maxSummaryTokens,
			);
			strict();
			if (authorization === "recommendation" || authorization === "denied")
				return this.record({
					operation: "semantic",
					status: authorization,
					sourceEntryIds: ids,
					executed: false,
				});
			const processingStarted = performance.now();
			const checkpoint = await this.checkpoint(ctx, ids, strict);
			const provenance = this.provenance(checkpoint, ids);
			const summary = raw.summary ?? generateSummary(sources, provenance);
			if (!verifySummary(summary, sources, provenance))
				throw Error(
					"Semantic equivalence verification failed; original representation retained",
				);
			const after = Math.ceil(summary.length / 4);
			this.budget(ctx, before, after);
			if (after >= before)
				throw Error(
					"Verified summary has no estimated context benefit; original retained",
				);
			const id = randomUUID();
			this.local = {
				id,
				ids: [...ids],
				summary,
				guard: this.guard(ctx),
				before,
				after,
			};
			return this.record({
				id,
				operation: "semantic",
				status: "scheduled",
				authorization,
				sourceEntryIds: ids,
				checkpointId: checkpoint.id,
				beforeEstimatedTokens: before,
				afterEstimatedTokens: after,
				managementMs: performance.now() - processingStarted,
				latencyMs: performance.now() - started,
				managementScope:
					"checkpoint readback, generation, verification and guards; excludes confirmation wait",
				hostEstimatedTokensBefore: ctx.getContextUsage()?.tokens ?? null,
				modelCalls: 0,
				modelTokens: 0,
				providerUsage: null,
				executed: false,
			});
		} finally {
			this.working = false;
		}
	}
	private async boundary(event: TurnEndEvent, ctx: ExtensionContext) {
		const pending = this.local;
		if (!pending || event.outcome !== "completed") return;
		try {
			pending.guard();
			const check = this.guard(ctx, true);
			const checkpoint = await this.checkpoint(ctx, pending.ids, check);
			pending.guard();
			const sources = this.sourceMessages(ctx, pending.ids, true);
			if (
				!verifySummary(
					pending.summary,
					sources,
					this.provenance(checkpoint, pending.ids),
				)
			)
				throw Error("Summary/source verification changed");
			this.budget(ctx, pending.before, pending.after);
			// Each selected message keeps its complete tool identity/error/details metadata.
			// A single result per request prevents duplicating a combined summary across protocol messages.
			if (pending.ids.length !== 1)
				throw Error(
					"Local replacement currently requires one complete tool result",
				);
			const drafts: SessionBoundaryDraft[] = [
				{
					type: "context_edit",
					targetId: pending.ids[0],
					replacement: { content: [{ type: "text", text: pending.summary }] },
				},
			];
			if (
				event.entries.some(
					(d) => d.type === "context_edit" && pending.ids.includes(d.targetId),
				) ||
				!validateEdits(ctx.sessionManager.getBranch(), [
					...event.entries,
					...drafts,
				])
			)
				throw Error("Conflicting or structurally invalid boundary proposal");
			check();
			this.local = undefined;
			this.last = {
				...this.last,
				operation: "semantic",
				status: "proposed",
				executed: false,
			};
			return {
				entries: [
					...event.entries,
					...actionDrafts(
						"semantic",
						drafts,
						[checkpoint.id],
						pending.before,
						pending.after,
						pending.id,
					),
				],
			};
		} catch (error) {
			this.local = undefined;
			this.last = {
				...this.last,
				operation: "semantic",
				status: "cancelled",
				error: error instanceof Error ? error.message : String(error),
				executed: false,
			};
		}
	}
	async native(ctx: ExtensionContext) {
		this.start();
		try {
			if (
				typeof ctx.compact !== "function" ||
				(typeof ctx.isIdle === "function" && !ctx.isIdle())
			)
				throw Error("Native compaction unavailable or agent is busy");
			const check = this.guard(ctx, true);
			const projection = buildSessionProjection(ctx.sessionManager.getBranch());
			const ids = projection.entries
				.filter((e) => e.messages.length)
				.map((e) => e.sourceEntry.id);
			if (!ids.length || ids.length > 64)
				throw Error(
					"Native checkpoint scope exceeds 1–64 visible source entries",
				);
			if (!legalMessages(projection.messages))
				throw Error("Native input has invalid tool relationships");
			const before = estimate(projection.messages);
			this.budget(ctx, before, this.enabled().settings.maxSummaryTokens);
			const authorization = await this.permissions.allow(
				ctx,
				"native",
				ids,
				before,
				this.enabled().settings.maxSummaryTokens,
			);
			check();
			if (authorization === "recommendation" || authorization === "denied")
				return this.record({
					operation: "native",
					status: authorization,
					sourceEntryIds: ids,
					executed: false,
				});
			const checkpoint = await this.checkpoint(ctx, ids, check);
			if (this.issuedNative.size >= 64)
				throw Error(
					"Native attempt limit reached; reload after checking outcomes",
				);
			const id = randomUUID(),
				anchorId = ctx.sessionManager.getBranch().at(-1)?.id;
			this.pi.appendEntry("aco-native-intent", {
				version: 1,
				id,
				sourceEntryIds: ids,
				checkpointId: checkpoint.id,
				anchorId,
				scope: taskKey(ctx),
			});
			this.pendingNative = {
				id,
				ids,
				guard: this.guard(ctx),
				started: performance.now(),
			};
			this.issuedNative.add(id);
			this.last = {
				id,
				operation: "native",
				status: "requested",
				authorization,
				checkpointId: checkpoint.id,
				anchorId,
				executed: false,
			};
			ctx.compact({
				customInstructions: `aco-native:${id}`,
				onComplete: () => {
					if (!this.pendingNative || this.pendingNative.id !== id) return;
					const actual = ctx.sessionManager
						.getBranch()
						.filter((e) => e.type === "compaction")
						.at(-1);
					if (actual?.type === "compaction") this.observeNative(actual, ctx);
					else
						this.finishNative(
							ctx,
							"failed",
							"Native callback had no persisted compaction",
						);
				},
				onError: (error) => {
					if (this.pendingNative?.id === id)
						this.finishNative(ctx, "failed", error.message);
				},
			});
			return this.last;
		} catch (error) {
			if (this.pendingNative)
				this.finishNative(
					ctx,
					"failed",
					error instanceof Error ? error.message : String(error),
				);
			throw error;
		} finally {
			this.working = false;
		}
	}
	private async beforeNative(
		event: SessionBeforeCompactEvent,
		ctx: ExtensionContext,
	) {
		const pending = this.pendingNative;
		if (!pending || event.customInstructions !== `aco-native:${pending.id}`) {
			if (
				event.customInstructions?.startsWith("aco-native:") &&
				this.issuedNative.has(event.customInstructions.slice(11))
			)
				return { cancel: true };
			return;
		}
		try {
			const processingStarted = performance.now();
			pending.guard();
			if (event.signal.aborted) throw Error("Native compaction cancelled");
			const check = this.guard(ctx, true);
			const checkpoint = await this.checkpoint(ctx, pending.ids, check);
			pending.guard();
			const messages = [
				...event.preparation.messagesToSummarize,
				...event.preparation.turnPrefixMessages,
			];
			const projection = buildSessionProjection(ctx.sessionManager.getBranch());
			const sources: SummarySource[] = messages.map((message) => {
				const entries = projection.entries.filter((e) =>
					e.messages.some((m) => JSON.stringify(m) === JSON.stringify(message)),
				);
				if (
					entries.length !== 1 ||
					!pending.ids.includes(entries[0].sourceEntry.id)
				)
					throw Error(
						"Native prefix source/provenance is ambiguous or outside authorization",
					);
				return {
					id: entries[0].sourceEntry.id,
					message: structuredClone(message) as unknown as Record<
						string,
						unknown
					>,
				};
			});
			if (!sources.length || !legalMessages(messages))
				throw Error(
					"Native prefix cannot be verified as a complete legal sequence",
				);
			const provenance = this.provenance(
				checkpoint,
				sources.map((s) => s.id),
				event.preparation.previousSummary,
			);
			const summary = generateSummary(sources, provenance);
			if (!verifySummary(summary, sources, provenance))
				throw Error("Native summary equivalence verification failed");
			const before =
					estimate(messages) +
					(event.preparation.previousSummary?.length ?? 0) / 4,
				after = Math.ceil(summary.length / 4);
			this.budget(ctx, before, after);
			if (after >= before)
				throw Error("Native prefix summary has no estimated context benefit");
			check();
			if (event.signal.aborted) throw Error("Native compaction cancelled");
			pending.summary = summary;
			pending.firstKeptEntryId = event.preparation.firstKeptEntryId;
			this.last = {
				...this.last,
				operation: "native",
				status: "prepared",
				managementMs: performance.now() - processingStarted,
				managementScope:
					"native hook recovery readback, deterministic generation/verification and guards",
				beforeEstimatedTokens: before,
				afterEstimatedTokens: after,
				modelCalls: 0,
				modelTokens: 0,
				providerUsage: null,
			};
			return {
				compaction: {
					summary,
					firstKeptEntryId: pending.firstKeptEntryId,
					tokensBefore: event.preparation.tokensBefore,
					details: {
						acoActionId: pending.id,
						summaryDigest: hash(summary),
						checkpointId: checkpoint.id,
						sourceEntryIds: sources.map((s) => s.id),
					},
				},
			};
		} catch (error) {
			this.finishNative(
				ctx,
				event.signal?.aborted ? "cancelled" : "failed",
				error instanceof Error ? error.message : String(error),
			);
			return { cancel: true };
		}
	}
	private observeNative(entry: CompactionEntry, ctx: ExtensionContext) {
		const pending = this.pendingNative;
		if (!pending) return;
		try {
			pending.guard();
			const details = entry.details as { acoActionId?: string } | undefined;
			if (
				!pending.summary ||
				entry.summary !== pending.summary ||
				entry.firstKeptEntryId !== pending.firstKeptEntryId ||
				details?.acoActionId !== pending.id
			)
				throw Error(
					"Persisted native compaction differs from verified ACO proposal; dependent actions stopped",
				);
			this.last = {
				...this.last,
				operation: "native",
				status: "committed",
				compactionEntryId: entry.id,
				hostEstimatedTokensBefore: entry.tokensBefore,
				hostEstimatedTokensAfter: ctx.getContextUsage()?.tokens ?? null,
				providerUsage: entry.usage ?? null,
			};
			this.finishNative(ctx, "committed");
		} catch (error) {
			this.finishNative(
				ctx,
				"failed",
				error instanceof Error ? error.message : String(error),
			);
		}
	}
	private finishNative(ctx: ExtensionContext, status: string, error?: string) {
		const pending = this.pendingNative;
		if (!pending) return;
		this.pendingNative = undefined;
		const branch = ctx.sessionManager.getBranch();
		const intentIndex = branch.findIndex(
			(e) =>
				e.type === "custom" &&
				e.customType === "aco-native-intent" &&
				e.data &&
				typeof e.data === "object" &&
				"id" in e.data &&
				e.data.id === pending.id,
		);
		const observedCompactionIds =
			intentIndex < 0
				? []
				: branch
						.slice(intentIndex + 1)
						.filter((e) => e.type === "compaction")
						.map((e) => e.id);
		this.last = {
			...this.last,
			id: pending.id,
			operation: "native",
			status,
			error,
			observedCompactionIds,
			stateUncertain:
				status !== "committed" && observedCompactionIds.length > 0,
			executed: status === "committed",
			latencyMs: performance.now() - pending.started,
			recovery:
				"Verified checkpoint recall and pre-compaction /tree anchor; raw history preserved",
		};
		try {
			pending.guard();
			this.pi.appendEntry("aco-native-outcome", { version: 1, ...this.last });
		} catch {
			// Never write completion metadata into a replacement session or claim persistence.
			this.last = { ...this.last, outcomePersisted: false };
		}
	}
}
