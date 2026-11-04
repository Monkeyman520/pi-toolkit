import { join, resolve } from "node:path";
import {
	type ExtensionAPI,
	type ExtensionCommandContext,
	type ExtensionContext,
	getAgentDir,
} from "@earendil-works/pi-coding-agent";
import { loadEnrichedSessions, openPrettySessionBrowser } from "./browser.ts";
import { parsePrettySessionArgs, prettySessionUsage } from "./commands.ts";
import { CONFIG_FILE_NAME, ConfigManager } from "./config.ts";
import {
	formatConfigReport,
	formatProjectReport,
	formatSessionDashboard,
	formatSessionListReport,
	formatStatusLine,
	formatWidgetLines,
} from "./display.ts";
import { inspectProject, type ProjectInfo } from "./project.ts";
import {
	buildHeuristicSummary,
	CUSTOM_ENTRY_TYPE,
	computeSessionMetrics,
	evaluateSummaryTrigger,
	generateSessionSummary,
	type PrettySessionEntryData,
	reconstructMetadata,
	type SessionMetrics,
	type SummarySource,
	sanitizeSingleLine,
} from "./summarizer.ts";

const WIDGET_KEY = "pretty-session";
const STATUS_KEY = "pretty-session";
const PROJECT_CACHE_TTL_MS = 10_000;

export default function (pi: ExtensionAPI) {
	const configPath = join(getAgentDir(), CONFIG_FILE_NAME);
	const configManager = new ConfigManager(configPath);

	let currentCtx: ExtensionContext | undefined;
	let currentProject: ProjectInfo | undefined;
	let currentMetadata: PrettySessionEntryData | undefined;
	let isApplyingPluginName = false;
	let lastPluginSetTitle: string | undefined;
	let summaryAbort: AbortController | undefined;
	let watchTimer: ReturnType<typeof setInterval> | undefined;
	let lastStatusLine: string | undefined;
	let lastWidgetKey: string | undefined;

	function setNativeSessionName(title: string) {
		const sanitized = title
			.replace(/\p{Cc}/gu, " ")
			.replace(/\s+/g, " ")
			.trim();
		if (!sanitized) return;
		isApplyingPluginName = true;
		lastPluginSetTitle = sanitized;
		try {
			pi.setSessionName(sanitized);
		} finally {
			isApplyingPluginName = false;
		}
	}

	function getActiveEntries(ctx: ExtensionContext) {
		const branch = ctx.sessionManager.getBranch();
		return branch.length > 0 ? branch : ctx.sessionManager.getEntries();
	}

	function recomputeSessionState(ctx: ExtensionContext): {
		metrics: SessionMetrics;
		metadata: PrettySessionEntryData | undefined;
	} {
		const entries = getActiveEntries(ctx);
		const allEntries = ctx.sessionManager.getEntries();
		const header = ctx.sessionManager.getHeader();
		const metrics = computeSessionMetrics({
			entries,
			header,
			contextUsage: ctx.getContextUsage(),
			modelContextWindow: ctx.model?.contextWindow,
			sessionId: ctx.sessionManager.getSessionId(),
			sessionFile: ctx.sessionManager.getSessionFile(),
		});

		const metadataSourceEntries = entries.some(
			(e) => e.type === "custom" && e.customType === CUSTOM_ENTRY_TYPE,
		)
			? entries
			: allEntries;

		const metadata = reconstructMetadata(
			metadataSourceEntries,
			ctx.sessionManager.getSessionName(),
			metrics,
			currentProject,
		);

		currentMetadata = metadata;
		return { metrics, metadata };
	}

	function renderUI(
		ctx = currentCtx,
		precomputed?: {
			metrics: SessionMetrics;
			metadata: PrettySessionEntryData | undefined;
		},
	) {
		if (!ctx?.hasUI) return;
		const { metrics, metadata } = precomputed ?? recomputeSessionState(ctx);
		const config = configManager.config;

		const nextStatus = config.showStatus
			? formatStatusLine({
					meta: metadata,
					metrics,
					project: currentProject,
					config,
				})
			: undefined;
		if (nextStatus !== lastStatusLine) {
			lastStatusLine = nextStatus;
			ctx.ui.setStatus(STATUS_KEY, nextStatus);
		}

		if (config.showWidget) {
			const widgetLines = formatWidgetLines({
				meta: metadata,
				metrics,
				project: currentProject,
				config,
			});
			const nextWidgetKey = `${config.widgetPlacement}:${widgetLines.join("\n")}`;
			if (nextWidgetKey !== lastWidgetKey) {
				lastWidgetKey = nextWidgetKey;
				ctx.ui.setWidget(WIDGET_KEY, widgetLines, {
					placement: config.widgetPlacement,
				});
			}
		} else if (lastWidgetKey !== undefined) {
			lastWidgetKey = undefined;
			ctx.ui.setWidget(WIDGET_KEY, undefined);
		}
	}

	async function syncConfig(ctx = currentCtx, force = false) {
		const result = await configManager.reloadIfChanged(force);
		if (result.isNewError && result.error && ctx?.hasUI) {
			ctx.ui.notify(result.error, "error");
		}
		if (result.changed && ctx) {
			renderUI(ctx);
		}
		return result.config;
	}

	async function ensureProjectInfo(
		ctx: ExtensionContext,
		force = false,
	): Promise<ProjectInfo> {
		const resolvedCwd = resolve(ctx.cwd);
		if (
			!force &&
			currentProject &&
			currentProject.cwd === resolvedCwd &&
			Date.now() - currentProject.inspectedAt < PROJECT_CACHE_TTL_MS
		) {
			return currentProject;
		}
		const info = await inspectProject(ctx.cwd, {
			exec: (cmd, args, opts) => pi.exec(cmd, args, opts),
			sessionDir: ctx.sessionManager.getSessionDir(),
		});
		currentProject = info;
		return info;
	}

	function persistMetadata(
		ctx: ExtensionContext,
		params: {
			title: string;
			description: string;
			source: SummarySource;
			manualLocked: boolean;
			updateNativeName: boolean;
		},
	): PrettySessionEntryData {
		const { metrics } = recomputeSessionState(ctx);
		const cfg = configManager.config;
		const finalTitle = sanitizeSingleLine(params.title, cfg.maxTitleLength);
		const finalDesc = sanitizeSingleLine(
			params.description,
			cfg.maxDescriptionLength,
		);

		if (
			params.updateNativeName &&
			finalTitle &&
			ctx.sessionManager.getSessionName() !== finalTitle
		) {
			setNativeSessionName(finalTitle);
		}

		const data: PrettySessionEntryData = {
			version: 1,
			title: finalTitle,
			description: finalDesc,
			source: params.source,
			manualLocked: params.manualLocked,
			createdAt: metrics.createdAt,
			updatedAt: metrics.updatedAt,
			turnCount: metrics.turnCount,
			messageCount: metrics.messageCount,
			contextTokens: metrics.contextTokens,
			contextWindow: metrics.contextWindow,
			contextPercent: metrics.contextPercent,
			summarizedAtTurn: metrics.turnCount,
			summarizedAtTokens: metrics.contextTokens ?? 0,
			projectName: currentProject?.name,
			gitBranch: currentProject?.git.branch,
		};

		pi.appendEntry(CUSTOM_ENTRY_TYPE, data);
		currentMetadata = data;
		renderUI(ctx, { metrics, metadata: data });
		return data;
	}

	async function performSummarization(
		ctx: ExtensionContext,
		options: {
			updateTitle: boolean;
			manualOverride?: boolean;
		},
	): Promise<PrettySessionEntryData | undefined> {
		summaryAbort?.abort();
		const controller = new AbortController();
		summaryAbort = controller;

		try {
			const project = await ensureProjectInfo(ctx);
			const entries = getActiveEntries(ctx);
			const summary = await generateSessionSummary({
				entries,
				project,
				config: configManager.config,
				model: ctx.model,
				modelRegistry: ctx.modelRegistry,
				signal: controller.signal,
			});

			if (controller.signal.aborted || currentCtx !== ctx) {
				return undefined;
			}

			const preserveManualLock =
				!options.manualOverride &&
				Boolean(
					currentMetadata?.manualLocked &&
						configManager.config.protectManualName,
				);

			const titleToPersist = preserveManualLock
				? (currentMetadata?.title ??
					ctx.sessionManager.getSessionName() ??
					summary.title)
				: summary.title;

			const sourceToPersist: SummarySource = preserveManualLock
				? "manual"
				: summary.source;

			return persistMetadata(ctx, {
				title: titleToPersist,
				description: summary.description,
				source: sourceToPersist,
				manualLocked: preserveManualLock,
				updateNativeName: options.updateTitle && !preserveManualLock,
			});
		} finally {
			if (summaryAbort === controller) {
				summaryAbort = undefined;
			}
		}
	}

	async function maybeAutoSummarize(
		ctx: ExtensionContext,
		reason: "turn" | "compact",
	) {
		await syncConfig(ctx);
		await ensureProjectInfo(ctx);
		const { metrics, metadata } = recomputeSessionState(ctx);
		const decision = evaluateSummaryTrigger({
			config: configManager.config,
			metrics,
			current: metadata,
			reason,
		});

		if (decision.shouldSummarize) {
			await performSummarization(ctx, {
				updateTitle: decision.updateTitle,
			});
		} else {
			renderUI(ctx, { metrics, metadata });
		}
	}

	function stop() {
		if (watchTimer) {
			clearInterval(watchTimer);
			watchTimer = undefined;
		}
		summaryAbort?.abort();
		summaryAbort = undefined;
		lastStatusLine = undefined;
		lastWidgetKey = undefined;
		currentCtx = undefined;
	}

	pi.on("session_start", async (_event, ctx) => {
		stop();
		currentCtx = ctx;
		await syncConfig(ctx, true);
		await ensureProjectInfo(ctx, true);
		const state = recomputeSessionState(ctx);
		renderUI(ctx, state);

		watchTimer = setInterval(() => {
			if (currentCtx) {
				void syncConfig(currentCtx);
			}
		}, 1500);
		watchTimer.unref?.();
	});

	pi.on("session_shutdown", stop);

	pi.on("session_tree", async (_event, ctx) => {
		summaryAbort?.abort();
		summaryAbort = undefined;
		currentCtx = ctx;
		await syncConfig(ctx);
		const state = recomputeSessionState(ctx);
		renderUI(ctx, state);
	});

	pi.on("model_select", async (_event, ctx) => {
		currentCtx = ctx;
		await syncConfig(ctx);
		const state = recomputeSessionState(ctx);
		renderUI(ctx, state);
	});

	pi.on("session_info_changed", (event, ctx) => {
		currentCtx = ctx;
		if (isApplyingPluginName) return;
		const nextName = event.name?.trim();
		if (nextName && nextName === lastPluginSetTitle) return;
		lastPluginSetTitle = undefined;

		const { metadata } = recomputeSessionState(ctx);
		if (!nextName) {
			if (metadata) {
				currentMetadata = {
					...metadata,
					manualLocked: false,
				};
				pi.appendEntry(CUSTOM_ENTRY_TYPE, currentMetadata);
			}
			renderUI(ctx);
			return;
		}

		summaryAbort?.abort();
		summaryAbort = undefined;
		const fallbackDesc =
			metadata?.description ??
			buildHeuristicSummary(
				getActiveEntries(ctx),
				currentProject,
				configManager.config.maxTitleLength,
				configManager.config.maxDescriptionLength,
			).description;

		persistMetadata(ctx, {
			title: nextName,
			description: fallbackDesc,
			source: "manual",
			manualLocked: true,
			updateNativeName: false,
		});
	});

	pi.on("agent_settled", async (event, ctx) => {
		currentCtx = ctx;
		if (event.aborted) {
			renderUI(ctx);
			return;
		}
		await maybeAutoSummarize(ctx, "turn");
	});

	pi.on("session_compact", async (_event, ctx) => {
		currentCtx = ctx;
		await maybeAutoSummarize(ctx, "compact");
	});

	async function handleCommand(rawArgs: string, ctx: ExtensionCommandContext) {
		currentCtx = ctx;
		await syncConfig(ctx);
		const project = await ensureProjectInfo(ctx, true);
		const { metrics, metadata } = recomputeSessionState(ctx);
		const cmd = parsePrettySessionArgs(rawArgs);

		switch (cmd.kind) {
			case "help": {
				ctx.ui.notify(prettySessionUsage, "info");
				return;
			}
			case "info": {
				const lines = formatSessionDashboard({
					meta: metadata,
					metrics,
					project,
					config: configManager.config,
					configPath: configManager.configPath,
					configError: configManager.error,
				});
				renderUI(ctx);
				ctx.ui.notify(lines.join("\n"), "info");
				return;
			}
			case "project": {
				const lines = formatProjectReport(project);
				renderUI(ctx);
				ctx.ui.notify(lines.join("\n"), "info");
				return;
			}
			case "summarize": {
				const updated = await performSummarization(ctx, {
					updateTitle: true,
					manualOverride: true,
				});
				if (updated) {
					ctx.ui.notify(
						`Session summarized [${updated.source}]: ${updated.title}\n${updated.description}`,
						"info",
					);
				} else {
					ctx.ui.notify(
						"Summarization cancelled or session changed.",
						"warning",
					);
				}
				return;
			}
			case "rename": {
				let title = cmd.title;
				if (!title && ctx.mode === "tui") {
					const inputTitle = await ctx.ui.input(
						"Rename session",
						metadata?.title ?? ctx.sessionManager.getSessionName() ?? "",
					);
					title = inputTitle?.trim();
				}
				if (!title) {
					ctx.ui.notify(
						"Usage: /ps rename <title> [| <description>]",
						"warning",
					);
					return;
				}
				const desc =
					cmd.description ??
					metadata?.description ??
					buildHeuristicSummary(
						getActiveEntries(ctx),
						project,
						configManager.config.maxTitleLength,
						configManager.config.maxDescriptionLength,
					).description;

				summaryAbort?.abort();
				summaryAbort = undefined;
				const saved = persistMetadata(ctx, {
					title,
					description: desc,
					source: "manual",
					manualLocked: true,
					updateNativeName: true,
				});
				ctx.ui.notify(
					`Session renamed (manual lock active): ${saved.title}\n${saved.description}`,
					"info",
				);
				return;
			}
			case "unlock": {
				if (!metadata) {
					ctx.ui.notify("No manual session lock is active.", "info");
					return;
				}
				const unlocked = persistMetadata(ctx, {
					title: metadata.title,
					description: metadata.description,
					source: metadata.source === "manual" ? "heuristic" : metadata.source,
					manualLocked: false,
					updateNativeName: false,
				});
				ctx.ui.notify(
					`Manual title lock cleared for "${unlocked.title}". Dynamic updates enabled.`,
					"info",
				);
				return;
			}
			case "list": {
				const sessions = await loadEnrichedSessions({
					cwd: ctx.cwd,
					sessionDir: ctx.sessionManager.getSessionDir(),
					currentSessionFile: ctx.sessionManager.getSessionFile(),
					scope: cmd.scope,
				});
				const lines = formatSessionListReport(sessions, cmd.scope);
				ctx.ui.notify(lines.join("\n"), "info");
				return;
			}
			case "config": {
				if (cmd.reload) {
					const reloaded = await syncConfig(ctx, true);
					ctx.ui.notify(
						formatConfigReport(
							reloaded,
							configManager.configPath,
							configManager.error,
						).join("\n"),
						configManager.error ? "error" : "info",
					);
					return;
				}
				if (!cmd.key) {
					ctx.ui.notify(
						formatConfigReport(
							configManager.config,
							configManager.configPath,
							configManager.error,
						).join("\n"),
						"info",
					);
					return;
				}
				if (cmd.value === undefined) {
					const cfg = configManager.config;
					const matchKey = Object.keys(cfg).find(
						(k) => k.toLowerCase() === cmd.key?.toLowerCase(),
					) as keyof typeof cfg | undefined;
					if (!matchKey) {
						ctx.ui.notify(`Unknown configuration key "${cmd.key}".`, "error");
						return;
					}
					ctx.ui.notify(
						`${matchKey} = ${JSON.stringify(cfg[matchKey])} (config: ${configManager.configPath})`,
						"info",
					);
					return;
				}
				const updated = await configManager.setOption(cmd.key, cmd.value, true);
				if (!updated.ok) {
					ctx.ui.notify(updated.error, "error");
					return;
				}
				renderUI(ctx);
				ctx.ui.notify(
					`Updated ${updated.key}=${JSON.stringify(updated.value)} in ${configManager.configPath}`,
					"info",
				);
				return;
			}
			case "toggle": {
				const toggled = await configManager.toggleOption(cmd.target, true);
				if (!toggled.ok) {
					ctx.ui.notify(toggled.error, "error");
					return;
				}
				renderUI(ctx);
				ctx.ui.notify(
					`Toggled ${toggled.key}=${toggled.value} in ${configManager.configPath}`,
					"info",
				);
				return;
			}
			case "browse": {
				if (ctx.mode !== "tui") {
					const dashboard = formatSessionDashboard({
						meta: metadata,
						metrics,
						project,
						config: configManager.config,
						configPath: configManager.configPath,
						configError: configManager.error,
					});
					renderUI(ctx);
					ctx.ui.notify(dashboard.join("\n"), "info");
					return;
				}

				const action = await openPrettySessionBrowser({
					ctx,
					initialScope: cmd.scope,
					currentMeta: metadata,
					currentMetrics: metrics,
					project,
					config: configManager.config,
				});

				if (!action) return;

				if (action.type === "summarize") {
					await handleCommand("summarize", ctx);
				} else if (action.type === "toggle_widget") {
					await handleCommand("toggle widget", ctx);
				} else if (action.type === "rename") {
					await handleCommand(`rename ${action.title}`, ctx);
				} else if (action.type === "switch") {
					const targetTitle = action.title;
					const switched = await ctx.switchSession(action.sessionPath, {
						withSession: async (replacementCtx) => {
							replacementCtx.ui.notify(
								`Switched to session: ${targetTitle}`,
								"info",
							);
						},
					});
					if (switched.cancelled) {
						ctx.ui.notify("Session switch cancelled.", "info");
					}
				}
				return;
			}
		}
	}

	pi.registerCommand("pretty-session", {
		description:
			"Browse sessions with descriptions/metrics, view project info, auto-summarize, or update config",
		handler: handleCommand,
	});

	pi.registerCommand("ps", {
		description:
			"Short alias for /pretty-session (session browser, project info, summarize, rename, config)",
		handler: handleCommand,
	});
}
