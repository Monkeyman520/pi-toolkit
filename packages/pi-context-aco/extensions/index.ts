import { dirname, join } from "node:path";
import {
	type ExtensionAPI,
	type ExtensionContext,
	getAgentDir,
} from "@earendil-works/pi-coding-agent";
import { DISCOVER_EVENT, isDiscoverPayload } from "pi-plugin-support/discovery";
import { actionDrafts, reconcileActions } from "./actions.ts";
import { complete, parse, usage } from "./commands.ts";
import { Compactor } from "./compaction.ts";
import { Config, settingKey } from "./config.ts";
import { Continuity, recallSchema } from "./continuity.ts";
import { Delegator } from "./delegation.ts";
import {
	type Metric,
	type Pressure,
	PressureMonitor,
	textTokens,
	unknown,
} from "./pressure.ts";
import {
	type AgentMessage,
	type ContextProjectionResult,
	createPruneBoundaryDrafts,
	createRestoreBoundaryDrafts,
	evaluatePruneCandidates,
	latestEdits,
	type PruneExecutionOutcome,
	projectRequestContext,
	reconcileBranchPrunes,
} from "./prune.ts";
import { type Recommendation, recommend } from "./recommend.ts";
import {
	buildTasks,
	declarationSchema,
	linkCheckpoints,
	type TaskSnapshot,
	validateDeclaration,
} from "./tasks.ts";
import { openPanel } from "./ui.ts";

function object(value: unknown): Record<string, unknown> {
	return value && typeof value === "object"
		? (value as Record<string, unknown>)
		: {};
}
function reported(value: unknown): Metric {
	return typeof value === "number" && Number.isFinite(value) && value >= 0
		? {
				kind: "measured",
				value,
				source:
					"provider-reported last assistant response, not aggregate session cost",
			}
		: unknown("provider usage metric unavailable");
}
function providerUsage(message: unknown) {
	const m = object(message),
		u = m.role === "assistant" ? object(m.usage) : {},
		cost = object(u.cost);
	return {
		input: reported(u.input),
		output: reported(u.output),
		cacheRead: reported(u.cacheRead),
		cacheWrite: reported(u.cacheWrite),
		totalTokens: reported(u.totalTokens),
		costInput: reported(cost.input),
		costOutput: reported(cost.output),
		costCacheRead: reported(cost.cacheRead),
		costCacheWrite: reported(cost.cacheWrite),
		costTotal: reported(cost.total),
	};
}
type ProviderUsage = ReturnType<typeof providerUsage>;
interface Trace {
	assessment?: {
		reassessments: number;
		taskCount: number;
		protectedReferenceCount: number;
		kind: string;
		actions: string[];
		analysisMs: number;
	};
	timestamp: number;
	event: string;
	pressure: Pressure;
	providerUsage: ProviderUsage;
	samplingMs: number;
}
interface State {
	tasks: TaskSnapshot;
	recommendation?: Recommendation;
	assessmentKey: string;
	analysis: {
		reassessments: number;
		modelCalls: number;
		samplingMs: number;
		trigger: string;
	};
	declarationCalls: number;
	ctx: ExtensionContext;
	config: Config;
	monitor: PressureMonitor;
	pressure?: Pressure;
	traces: Trace[];
	providerUsage: ProviderUsage;
	capabilities: string[];
	running: boolean;
	samplingMs: number;
	unlisten?: () => void;
	traceError?: string;
	lastProjection?: ContextProjectionResult;
	pruneOutcome?: PruneExecutionOutcome;
	pendingRestores: string[];
	omittedEntries: string[];
	contextUnlisten?: () => void;
}

export default function contextMonitor(
	pi: ExtensionAPI,
	configPath = join(getAgentDir(), "pi-context-aco.json"),
) {
	let active: State | undefined;
	const continuity = new Continuity(
		join(dirname(configPath), "pi-context-aco", "evidence"),
		(type, data) => pi.appendEntry(type, data),
	);

	const delegator = new Delegator(
		(type, data) => pi.appendEntry(type, data),
		continuity,
		() => active?.config.settings,
	);
	const compactor = new Compactor(pi, continuity, () =>
		active ? { owner: active, settings: active.config.settings } : undefined,
	);
	function assess(s: State, ctx: ExtensionContext, event: string) {
		if (!s.pressure) return;
		const branch =
			typeof ctx.sessionManager?.getBranch === "function"
				? ctx.sessionManager.getBranch()
				: [];
		const source = branch.filter(
			(e) => e.type !== "custom" || e.customType !== "aco-monitor",
		);
		const key = JSON.stringify([
			ctx.sessionManager?.getSessionId?.(),
			source.length,
			source.at(-1)?.id,
			s.pressure.projectedTokens.value,
			s.pressure.usedTokens.value,
			s.config.settings.reserveTokens,
		]);
		if (key === s.assessmentKey) return;
		const start = performance.now();
		s.tasks = buildTasks(source, ctx.cwd);
		if (typeof ctx.sessionManager?.getBranch !== "function") {
			s.tasks.coverage = "limited";
			s.tasks.issues.push("active branch unavailable");
		}
		s.recommendation = recommend(s.tasks, s.pressure);
		s.analysis = {
			reassessments: s.analysis.reassessments + 1,
			modelCalls: 0,
			samplingMs: performance.now() - start,
			trigger: event,
		};
		s.assessmentKey = key;
	}
	function declare(
		s: State,
		ctx: ExtensionContext,
		raw: unknown,
		origin: "command" | "tool",
	) {
		if (
			active !== s ||
			ctx.sessionManager.getSessionId() !== s.ctx.sessionManager.getSessionId()
		)
			throw Error("ACO session changed; declaration not committed");
		if (!s.config.settings.enabled)
			throw Error("ACO observation disabled; declaration not committed");
		if (
			typeof pi.appendEntry !== "function" ||
			typeof ctx.sessionManager?.getBranch !== "function"
		)
			throw Error("Task persistence/active branch unavailable");
		const update = validateDeclaration(
			raw,
			ctx.sessionManager.getBranch(),
			ctx.cwd,
		);
		if (JSON.stringify(update).length > 32768)
			throw Error("Task declaration too large");
		delegator.reset(ctx);
		pi.appendEntry("aco-task", { version: 1, origin, update });
		if (origin === "tool") s.declarationCalls++;
		observe(s, ctx, "declaration");
		return update;
	}
	function reading(s: State, ctx: ExtensionContext) {
		s.capabilities = [];
		let tokens: number | null | undefined = null;
		let window = ctx.model?.contextWindow;
		if (typeof ctx.getContextUsage === "function") {
			try {
				const usage = ctx.getContextUsage();
				tokens = usage?.tokens;
				window ??= usage?.contextWindow;
			} catch {
				s.capabilities.push("getContextUsage failed");
			}
		} else s.capabilities.push("getContextUsage unavailable");
		let structural = "none";
		if (typeof ctx.sessionManager?.getBranch === "function") {
			const branch = ctx.sessionManager.getBranch();
			for (let i = branch.length - 1; i >= 0; i--) {
				if (
					branch[i].type === "context_edit" ||
					branch[i].type === "compaction"
				) {
					structural = branch[i].id;
					break;
				}
			}
		} else {
			s.capabilities.push("getBranch unavailable; growth comparison disabled");
			s.monitor.reset("projection unavailable");
		}
		const session =
			typeof ctx.sessionManager?.getSessionId === "function"
				? ctx.sessionManager.getSessionId()
				: "unknown";
		return {
			tokens,
			capacity: window,
			identity: `${session}:${ctx.model?.provider ?? "unknown"}/${ctx.model?.id ?? "unknown"}:${structural}`,
		};
	}
	const brief = (s: State) => {
		const p = s.pressure;
		const value =
			p?.usedTokens.value == null
				? "unknown"
				: Math.round(p.usedTokens.value).toLocaleString("en-US");
		const future =
			p?.projectedUsage.value == null
				? "unknown"
				: `${(p.projectedUsage.value * 100).toFixed(1)}%`;
		const strat =
			s.config.settings.mode === "exact-prune"
				? "exact-pruning active"
				: s.config.settings.mode === "delegate"
					? "bounded delegation proposals"
					: "strategies unavailable";
		return `V2 ${s.config.settings.mode} ${s.config.settings.enabled ? "on" : "off"} · context ${value} est · projected ${future} est · ${s.recommendation?.kind ?? "no-op"} · ${strat}`;
	};
	function observe(
		s: State,
		ctx: ExtensionContext,
		event: string,
		completed = false,
		trace = true,
	) {
		if (active !== s) return;
		const start = performance.now();
		s.ctx = ctx;
		s.pressure = s.monitor.observe(
			reading(s, ctx),
			s.config.settings,
			completed,
		);
		s.samplingMs = performance.now() - start;
		assess(s, ctx, event);
		if (trace) {
			const entry: Trace = {
				timestamp: Date.now(),
				event,
				pressure: s.pressure,
				assessment: {
					reassessments: s.analysis.reassessments,
					taskCount: s.tasks.tasks.length,
					protectedReferenceCount: s.tasks.references.filter(
						(r) => r.protectedReasons.length,
					).length,
					kind: s.recommendation?.kind ?? "no-op",
					actions: s.recommendation?.actions.map((a) => a.kind) ?? [],
					analysisMs: s.analysis.samplingMs,
				},
				providerUsage: s.providerUsage,
				samplingMs: s.samplingMs,
			};
			s.traces.push(entry);
			if (s.traces.length > 50) s.traces.shift();
			if (event === "turn_end" && s.config.settings.persistTraces) {
				if (typeof pi.appendEntry !== "function")
					s.traceError = "appendEntry unavailable; trace not persisted";
				else
					try {
						pi.appendEntry("aco-monitor", entry);
						s.traceError = undefined;
					} catch {
						s.traceError = "trace persistence failed; no strategy was executed";
					}
			}
		}
		if (ctx.hasUI) ctx.ui.setStatus("aco", `ACO · ${brief(s)}`);
	}
	function executionGuard(s: State, ctx: ExtensionContext) {
		const fingerprint = () =>
			JSON.stringify([
				ctx.sessionManager.getSessionId(),
				ctx.sessionManager.getBranch().map((e) => e.id),
				s.config.settings,
			]);
		const key = fingerprint();
		return () => {
			if (active !== s || !s.config.settings.enabled || fingerprint() !== key)
				throw Error(
					"ACO session/task/branch/configuration changed; action cancelled",
				);
		};
	}
	async function verifiedRecovery(s: State, ctx: ExtensionContext) {
		const check = executionGuard(s, ctx);
		const checkpoints = await continuity.getActiveCheckpoints(
			ctx,
			() => active === s,
		);
		check();
		s.tasks = buildTasks(ctx.sessionManager.getBranch(), ctx.cwd);
		linkCheckpoints(s.tasks, checkpoints);
		return checkpoints;
	}
	function syncHooks(s: State) {
		if (s.config.settings.enabled && s.config.settings.mode === "exact-prune") {
			if (!s.contextUnlisten)
				s.contextUnlisten = pi.on("context", async (event, ctx) => {
					if (
						active !== s ||
						!s.config.settings.enabled ||
						s.config.settings.mode !== "exact-prune"
					)
						return;
					try {
						if (s.pendingRestores.length) return;
						const checkpoints = await verifiedRecovery(s, ctx);
						const branch = ctx.sessionManager.getBranch();
						if (reconcileActions(branch).some((a) => !a.success)) return;
						const result = evaluatePruneCandidates(
							s.tasks,
							branch,
							checkpoints,
							{
								mode: s.config.settings.mode,
								maxPruneTokens: s.config.settings.maxPruneTokens,
							},
						);
						const candidates = result.eligible.filter(
							(c) =>
								!s.pendingRestores.includes(c.sourceEntryId) &&
								(!c.pairedEntryId ||
									!s.pendingRestores.includes(c.pairedEntryId)),
						);
						if (!candidates.length) return;
						const projection = projectRequestContext(
							event.messages as unknown as AgentMessage[],
							candidates,
							branch,
						);
						if (projection.reclaimedTokens > 0) {
							s.lastProjection = projection;
							return {
								messages:
									projection.messages as unknown as typeof event.messages,
							};
						}
					} catch {
						return;
					}
				});
		} else {
			s.contextUnlisten?.();
			s.contextUnlisten = undefined;
		}
	}

	function stop() {
		delegator.reset();
		compactor.reset();
		continuity.invalidate();
		const old = active;
		active = undefined;
		old?.unlisten?.();
		old?.contextUnlisten?.();
		if (old?.ctx.hasUI) old.ctx.ui.setStatus("aco", undefined);
	}
	const update = (s: State, ctx: ExtensionContext) => {
		if (active !== s) return;
		delegator.reset(ctx);
		s.monitor.reset("configuration changed");
		syncHooks(s);
		observe(s, ctx, "configuration");
	};
	const panel = (s: State, ctx: ExtensionContext) =>
		openPanel({
			ctx,
			events: pi.events,
			config: s.config,
			summary: () => brief(s),
			recommendation: () =>
				s.recommendation?.reasons[0] ?? "Task evidence unknown; no-op",
			onUpdated: () => update(s, ctx),
			isCurrent: () => active === s,
		});
	function report(s: State, ctx: ExtensionContext, includeTraces = false) {
		observe(s, ctx, "status", false, false);
		const isExactPrune = s.config.settings.mode === "exact-prune";
		const delegation = delegator.report(ctx);
		return {
			stage:
				"V1 + V2 recovery/T0003 + V2 exact-pruning/T0004 + V3 scoped extractive/native compaction/T0005 + V4 bounded delegation/T0006",
			compaction: compactor.report(ctx),
			delegation,
			mode:
				s.config.settings.mode === "delegate"
					? "delegate"
					: s.config.settings.mode === "compact"
						? "compact"
						: isExactPrune
							? "exact-prune"
							: "observe-only",
			sampling: s.config.settings.enabled
				? "enabled"
				: "disabled; event snapshots may be stale",
			authorizedStrategies: !s.config.settings.enabled
				? []
				: s.config.settings.mode === "delegate"
					? delegation.authority.length
						? ["delegate"]
						: []
					: isExactPrune
						? ["exact-prune"]
						: s.config.settings.mode === "compact"
							? [
									...new Set(
										compactor.permissions.inspect(ctx).map((g) => g.operation),
									),
								]
							: [],
			availableStrategies:
				s.config.settings.mode === "delegate"
					? ["delegate"]
					: s.config.settings.mode === "compact"
						? ["semantic", "native"]
						: isExactPrune
							? ["exact-prune"]
							: [],
			strategyExecution:
				s.config.settings.mode === "delegate"
					? "V4 explicit bounded independent children; confirmation/scoped authorization required; staged deliverables, parent verification"
					: s.config.settings.mode === "compact"
						? "V3 explicit proposals only; confirmation or scoped automation and independent safety verification required; delegation unavailable"
						: isExactPrune
							? "V2 recovery-gated exact pruning; compaction requires separate compact mode"
							: "V1 observation-only; no ACO strategy execution",
			evidence:
				"explicit local checkpoint and bounded historical recall available; /aco evidence re-verifies active-task receipts",
			tasks: {
				...s.tasks,
				delegation: delegation.outcomes.map((o) => ({
					id: o.id,
					taskId: o.taskId,
					parentTaskId: o.parentTaskId,
					checkpoints: o.checkpoints,
					status: o.status,
				})),
			},
			recommendation: s.recommendation,
			pruning: {
				mode: s.config.settings.mode,
				maxPruneTokens: s.config.settings.maxPruneTokens,
				lastProjection: s.lastProjection ?? null,
				lastExecution:
					reconcileActions(ctx.sessionManager.getBranch()).at(-1) ??
					s.pruneOutcome ??
					null,
				actions: reconcileActions(ctx.sessionManager.getBranch()),
				omittedEntries: [...latestEdits(ctx.sessionManager.getBranch())]
					.filter(([, replacement]) => replacement === null)
					.map(([id]) => id),
			},
			analysis: {
				...s.analysis,
				declarationCalls: s.declarationCalls,
				declarationTokenCost:
					"not separately attributable; ordinary tool loadout/results use parent context",
			},
			running: s.running,
			settings: s.config.settings,
			configurationError: s.config.error ?? null,
			traceError: s.traceError ?? null,
			capabilities: s.capabilities,
			pressure: s.pressure,
			providerUsage: s.providerUsage,
			management: {
				modelCalls: 0,
				modelTokens: 0,
				samplingMs: s.samplingMs,
				samplingScope:
					"local sample calculation only; excludes UI/config/persistence time",
			},
			...(includeTraces ? { traces: s.traces } : {}),
		};
	}
	pi.on("session_start", async (_event, ctx) => {
		stop();
		const s: State = {
			ctx,
			config: new Config(configPath),
			monitor: new PressureMonitor(),
			tasks: buildTasks([]),
			assessmentKey: "",
			analysis: {
				reassessments: 0,
				modelCalls: 0,
				samplingMs: 0,
				trigger: "startup",
			},
			declarationCalls: 0,
			traces: [],
			providerUsage: providerUsage(undefined),
			capabilities: [],
			running: false,
			samplingMs: 0,
			pendingRestores: [],
			omittedEntries: [],
		};
		active = s;
		await s.config.reload();
		if (active !== s) return;
		syncHooks(s);
		observe(s, ctx, "session_start");
		const recovery = await continuity.reconcile(ctx);
		if (active !== s) return;

		const branch =
			typeof ctx.sessionManager?.getBranch === "function"
				? ctx.sessionManager.getBranch()
				: [];
		let checkpoints: Awaited<ReturnType<typeof verifiedRecovery>> = [];
		try {
			checkpoints = await verifiedRecovery(s, ctx);
		} catch {}
		if (active !== s) return;
		const prunes = reconcileBranchPrunes(branch, checkpoints);
		s.omittedEntries = prunes.omittedTargetIds;
		if (prunes.unverifiedTargetIds.length > 0) {
			ctx.ui.notify(
				`ACO: Unverified context_edit entries found on branch (${prunes.unverifiedTargetIds.join(", ")}); no recovery receipt.`,
				"warning",
			);
		}

		if (
			recovery.checkpoints.some((c) => c.status !== "verified") ||
			(recovery.issues.length && recovery.scope)
		)
			ctx.ui.notify(
				"ACO recovery has incomplete/invalid evidence; inspect /aco evidence. No content unloaded.",
				"warning",
			);
		s.unlisten = pi.events.on(DISCOVER_EVENT, (payload: unknown) => {
			if (!isDiscoverPayload(payload)) return;
			payload.register({
				id: "pi-context-aco",
				title: "Pi Context ACO",
				command: "/aco",
				getSummary: () => brief(s),
				open: async (target) => {
					if (active === s) await panel(s, target);
				},
			});
		});
		if (s.config.error) ctx.ui.notify(s.config.error, "error");
	});
	pi.on("session_shutdown", () => {
		stop();
	});
	const reset = (reason: string, ctx: ExtensionContext) => {
		const s = active;
		if (!s) return;
		s.monitor.reset(reason);
		observe(s, ctx, reason);
	};
	pi.on("model_select", (_event, ctx) => {
		delegator.reset(ctx);
		reset("model_select", ctx);
	});
	pi.on("session_compact", (_event, ctx) => {
		reset("session_compact", ctx);
	});
	pi.on("session_tree", async (_event, ctx) => {
		const s = active;
		if (!s) return;
		continuity.invalidate();
		compactor.reset();
		delegator.reset();
		reset("session_tree", ctx);
		const recovery = await continuity.reconcile(ctx);
		if (
			active !== s ||
			ctx.sessionManager.getSessionId() !== s.ctx.sessionManager.getSessionId()
		)
			return;

		const branch =
			typeof ctx.sessionManager?.getBranch === "function"
				? ctx.sessionManager.getBranch()
				: [];
		let checkpoints: Awaited<ReturnType<typeof verifiedRecovery>> = [];
		try {
			checkpoints = await verifiedRecovery(s, ctx);
		} catch {}
		if (active !== s) return;
		const prunes = reconcileBranchPrunes(branch, checkpoints);
		s.omittedEntries = prunes.omittedTargetIds;
		s.lastProjection = undefined;
		s.pendingRestores = [];

		if (recovery.checkpoints.some((c) => c.status !== "verified"))
			ctx.ui.notify(
				"ACO branch recovery has incomplete/invalid evidence; inspect /aco evidence.",
				"warning",
			);
	});
	pi.on("turn_start", (_event, ctx) => {
		const s = active;
		if (s?.config.settings.enabled) observe(s, ctx, "turn_start");
	});
	pi.on("tool_execution_start", (event, ctx) => {
		const s = active;
		if (!s?.config.settings.enabled) return;
		const args = object(event.args);
		s.monitor.startTool(
			event.toolCallId,
			event.toolName,
			typeof args.limit === "number" ? args.limit : undefined,
		);
		observe(s, ctx, "tool_execution_start");
	});
	pi.on("tool_execution_end", (event, ctx) => {
		const s = active;
		if (!s?.config.settings.enabled) return;
		s.monitor.finishTool(
			event.toolCallId,
			event.toolName,
			textTokens(event.result),
			event.isError,
			event.durationMs,
		);
		observe(s, ctx, "tool_execution_end");
	});

	pi.on("turn_end", async (event, ctx) => {
		const s = active;
		if (!s?.config.settings.enabled) return;
		s.providerUsage = providerUsage(event.message);
		observe(s, ctx, "turn_end", true);
		if (
			s.config.settings.mode === "observe" ||
			(event.outcome && event.outcome !== "completed")
		)
			return;
		try {
			const check = executionGuard(s, ctx);
			const checkpoints = await verifiedRecovery(s, ctx);
			check();
			const branch = ctx.sessionManager.getBranch();
			if (s.pendingRestores.length) {
				const targets = [...s.pendingRestores];
				const own: import("@earendil-works/pi-coding-agent").SessionBoundaryDraft[] =
					[];
				for (const id of targets) {
					const restore = await createRestoreBoundaryDrafts(
						id,
						branch,
						checkpoints,
						[...event.entries, ...own],
					);
					check();
					if (restore.error) {
						s.pendingRestores = [];
						ctx.ui.notify(`ACO restore refused: ${restore.error}`, "error");
						return;
					}
					own.splice(
						0,
						own.length,
						...restore.drafts.slice(event.entries.length),
					);
				}
				s.pendingRestores = [];
				return {
					entries: [
						...event.entries,
						...actionDrafts(
							"restore",
							own,
							checkpoints.map((c) => c.id),
							0,
							0,
						),
					],
				};
			}
			if (s.config.settings.mode !== "exact-prune") return;
			if (reconcileActions(branch).some((a) => !a.success)) return;
			const evaluation = evaluatePruneCandidates(s.tasks, branch, checkpoints, {
				mode: s.config.settings.mode,
				maxPruneTokens: s.config.settings.maxPruneTokens,
			});
			const prune = createPruneBoundaryDrafts(
				evaluation.eligible,
				branch,
				event.entries,
			);
			if (!prune.prunedTargetIds.length) return;
			s.pruneOutcome = {
				success: false,
				status: "proposed",
				mode: "durable-edit",
				targetIds: prune.prunedTargetIds,
				beforeTokens: prune.beforeTokens,
				afterTokens: prune.afterTokens,
				reclaimedTokens: prune.reclaimedTokens,
				timestamp: Date.now(),
			};
			return {
				entries: [
					...event.entries,
					...actionDrafts(
						"prune",
						prune.drafts.slice(event.entries.length),
						checkpoints.map((c) => c.id),
						prune.beforeTokens,
						prune.afterTokens,
					),
				],
			};
		} catch (error) {
			if (active === s)
				ctx.ui.notify(
					`ACO edit cancelled: ${error instanceof Error ? error.message : String(error)}`,
					"warning",
				);
		}
	});

	pi.on("agent_start", () => {
		if (active) active.running = true;
	});
	pi.on("agent_settled", (_event, ctx) => {
		const s = active;
		if (!s) return;
		s.running = false;
		if (s.config.settings.enabled) observe(s, ctx, "agent_settled");
	});
	if (typeof pi.registerTool === "function")
		pi.registerTool({
			name: "aco_task",
			label: "ACO Task Declaration",
			description:
				"Declare task state/requirements and protected source references as metadata. Claims remain declarations, not verified facts. V1 only recommends; cannot prune, compact, offload, delegate or grant authority. Use only when task/plan/dependencies change, not every turn.",
			parameters: declarationSchema,
			annotations: {
				readOnlyHint: false,
				destructiveHint: false,
				idempotentHint: false,
				openWorldHint: false,
			},
			async execute(_id, params, signal, _onUpdate, ctx) {
				const s = active;
				if (!s || signal?.aborted)
					throw Error("ACO session unavailable or cancelled");
				const update = declare(s, ctx, params, "tool");
				return {
					content: [
						{
							type: "text",
							text: JSON.stringify({
								recorded: true,
								taskId: update.taskId,
								executed: false,
								recommendation: s.recommendation,
							}),
						},
					],
					details: {
						recorded: true,
						taskId: update.taskId,
						operation: "metadata-only",
					},
				};
			},
		});
	if (typeof pi.registerTool === "function")
		pi.registerTool({
			name: "aco_recall",
			label: "ACO Historical Recall",
			description:
				"Recall one verified historical evidence segment. Requires an active task/branch receipt, not just an ID. Entire JSON text is bounded by budgetBytes (512–32768 UTF-8 bytes, not exact tokens); paginate with nextOffset. Historical bytes do not prove current workspace facts. No automatic injection or context pruning.",
			parameters: recallSchema,
			annotations: {
				readOnlyHint: true,
				destructiveHint: false,
				idempotentHint: true,
				openWorldHint: false,
			},
			async execute(_id, params, signal, _onUpdate, ctx) {
				const s = active;
				if (!s?.config.settings.enabled || signal?.aborted)
					throw Error("ACO unavailable, disabled or cancelled");
				const text = await continuity.recall(
					ctx,
					params,
					() => active === s && s.config.settings.enabled && !signal?.aborted,
				);
				return {
					content: [{ type: "text", text }],
					details: { historical: true },
				};
			},
		});
	pi.registerCommand("aco", {
		description:
			"ACO monitor, explicit local recovery and exact pruning control",
		getArgumentCompletions: (prefix) =>
			active ? complete(prefix, active.config.settings) : null,
		handler: async (args, ctx) => {
			const s = active;
			if (!s) {
				ctx.ui.notify(
					"ACO session not active; no strategies executed",
					"warning",
				);
				return;
			}
			const cmd = parse(args);

			if (
				cmd.kind === "delegate" ||
				cmd.kind === "delegation" ||
				cmd.kind === "reconcile"
			) {
				try {
					const result =
						cmd.kind === "delegate"
							? await delegator.run(ctx, JSON.parse(cmd.json))
							: cmd.kind === "reconcile"
								? await delegator.reconcile(ctx, JSON.parse(cmd.json))
								: delegator.report(ctx);
					if (active === s) ctx.ui.notify(JSON.stringify(result), "info");
				} catch (error) {
					if (active === s)
						ctx.ui.notify("ACO delegation refused: " + String(error), "error");
				}
				return;
			}
			if (
				cmd.kind === "checkpoint" ||
				cmd.kind === "recall" ||
				cmd.kind === "evidence"
			) {
				try {
					if (!s.config.settings.enabled)
						throw Error("ACO disabled; evidence operation refused");
					const current = () => active === s && s.config.settings.enabled;
					const value =
						cmd.kind === "checkpoint"
							? JSON.stringify(
									await continuity.checkpoint(
										ctx,
										JSON.parse(cmd.json),
										current,
									),
								)
							: cmd.kind === "recall"
								? await continuity.recall(ctx, JSON.parse(cmd.json), current)
								: JSON.stringify(await continuity.reconcile(ctx));
					if (current()) ctx.ui.notify(value, "info");
				} catch (error) {
					if (active === s)
						ctx.ui.notify(
							`ACO: ${error instanceof Error ? error.message : String(error)}; no content unloaded`,
							"error",
						);
				}
				return;
			}

			if (
				cmd.kind === "summarize" ||
				cmd.kind === "compact" ||
				cmd.kind === "compaction" ||
				cmd.kind === "authorize" ||
				cmd.kind === "revoke"
			) {
				try {
					let result: unknown;
					if (cmd.kind === "summarize")
						result = await compactor.summarize(ctx, JSON.parse(cmd.json));
					else if (cmd.kind === "compact") result = await compactor.native(ctx);
					else if (cmd.kind === "authorize")
						result = {
							authorized:
								JSON.parse(cmd.json)?.operation === "delegate"
									? delegator.authorize(ctx, JSON.parse(cmd.json))
									: compactor.permissions.grant(ctx, JSON.parse(cmd.json)),
							persistent: false,
						};
					else if (cmd.kind === "revoke") {
						delegator.reset(ctx);
						compactor.reset();
						result = { revoked: true };
					} else result = compactor.report(ctx);
					if (active === s) ctx.ui.notify(JSON.stringify(result), "info");
				} catch (error) {
					if (active === s)
						ctx.ui.notify(
							`ACO action/authorization refused: ${error instanceof Error ? error.message : String(error)}`,
							"error",
						);
				}
				return;
			}
			if (cmd.kind === "prune" || cmd.kind === "restore") {
				try {
					if (!s.config.settings.enabled) throw Error("ACO disabled");
					const checkpoints = await verifiedRecovery(s, ctx);
					const branch = ctx.sessionManager.getBranch();
					if (cmd.kind === "prune") {
						const result = evaluatePruneCandidates(
							s.tasks,
							branch,
							checkpoints,
							{
								mode: s.config.settings.mode,
								maxPruneTokens: s.config.settings.maxPruneTokens,
							},
						);
						ctx.ui.notify(
							JSON.stringify({
								...result,
								mode: s.config.settings.mode,
								lastProjection: s.lastProjection ?? null,
								actions: reconcileActions(branch),
							}),
							"info",
						);
					} else if (cmd.kind === "restore") {
						if (s.config.settings.mode === "observe")
							throw Error("V1 observe mode cannot restore context");
						const restore = await createRestoreBoundaryDrafts(
							cmd.targetId,
							branch,
							checkpoints,
						);
						if (restore.error) throw Error(restore.error);
						// Store only the requested root: the boundary expands its legal exchange again.
						if (!s.pendingRestores.includes(cmd.targetId))
							s.pendingRestores.push(cmd.targetId);
						ctx.ui.notify(
							JSON.stringify({
								restored: false,
								scheduled: true,
								targetIds: restore.restoredTargetIds,
								message:
									"Restoration scheduled for the next completed turn boundary; not yet committed",
							}),
							"info",
						);
					}
				} catch (error) {
					if (active === s)
						ctx.ui.notify(
							`ACO: ${error instanceof Error ? error.message : String(error)}`,
							"error",
						);
				}
				return;
			}

			if (cmd.kind === "declare") {
				try {
					const update = declare(s, ctx, JSON.parse(cmd.json), "command");
					ctx.ui.notify(
						JSON.stringify({
							recorded: true,
							taskId: update.taskId,
							executed: false,
						}),
						"info",
					);
				} catch (error) {
					ctx.ui.notify(
						`ACO: ${error instanceof Error ? error.message : String(error)}`,
						"error",
					);
				}
				return;
			}
			if (cmd.kind === "tasks" || cmd.kind === "recommend") {
				const value = report(s, ctx);
				ctx.ui.notify(
					JSON.stringify(
						cmd.kind === "tasks" ? value.tasks : value.recommendation,
					),
					"info",
				);
				return;
			}
			try {
				if (cmd.kind === "panel") {
					if (ctx.mode === "tui") await panel(s, ctx);
					else ctx.ui.notify(JSON.stringify(report(s, ctx), null, 2), "info");
				} else if (cmd.kind === "help") ctx.ui.notify(usage, "info");
				else if (cmd.kind === "set") {
					await s.config.set(cmd.key, cmd.value);
					if (active !== s) return;
					update(s, ctx);
					ctx.ui.notify(
						`ACO saved ${cmd.key}=${cmd.value}; ${s.config.settings.mode}`,
						"info",
					);
				} else if (cmd.kind === "reload") {
					await s.config.reload();
					if (active !== s) return;
					update(s, ctx);
					ctx.ui.notify(
						s.config.error ??
							`ACO configuration reloaded; ${s.config.settings.mode}`,
						s.config.error ? "error" : "info",
					);
				} else if (cmd.kind === "get") {
					const key = settingKey(cmd.key);
					ctx.ui.notify(
						key
							? `${key}=${s.config.settings[key]}`
							: `Unknown configuration key: ${cmd.key}`,
						key ? "info" : "error",
					);
				} else if (cmd.kind === "trace")
					ctx.ui.notify(JSON.stringify(report(s, ctx, true)), "info");
				else
					ctx.ui.notify(
						`${brief(s)}\n${JSON.stringify(report(s, ctx), null, 2)}`,
						"info",
					);
			} catch (error) {
				if (active === s)
					ctx.ui.notify(
						`ACO: ${error instanceof Error ? error.message : String(error)}`,
						"error",
					);
			}
		},
	});
}
