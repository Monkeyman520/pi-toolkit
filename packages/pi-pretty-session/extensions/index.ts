import { join } from "node:path";
import {
	type ExtensionAPI,
	type ExtensionCommandContext,
	type ExtensionContext,
	getAgentDir,
} from "@earendil-works/pi-coding-agent";
import { loadEnrichedSessions, openPrettySessionBrowser } from "./browser.ts";
import {
	getPrettySessionCompletions,
	parsePrettySessionArgs,
	prettySessionUsage,
} from "./commands.ts";
import { CONFIG_FILE_NAME, ConfigManager, toggleAliases } from "./config.ts";
import {
	formatConfigReport,
	formatProjectReport,
	formatSessionDashboard,
	formatSessionListReport,
	formatStatusLine,
	formatWidgetLines,
} from "./display.ts";
import { SessionState } from "./session-state.ts";
import type { PrettySessionEntryData, SessionMetrics } from "./summarizer.ts";
import {
	DISCOVER_EVENT,
	isDiscoverPayload,
	openPrettySessionSettingsPanel,
	SELF_PLUGIN_ID,
} from "./ui.ts";

const WIDGET_KEY = "pretty-session";
const STATUS_KEY = "pretty-session";

export default function (pi: ExtensionAPI) {
	const configPath = join(getAgentDir(), CONFIG_FILE_NAME);
	const configManager = new ConfigManager(configPath);
	const session = new SessionState(pi, configManager, (ctx, state) =>
		renderUI(ctx, state),
	);

	let watchTimer: ReturnType<typeof setInterval> | undefined;
	let unlistenDiscover: (() => void) | undefined;
	let lastStatusLine: string | undefined;
	let lastWidgetKey: string | undefined;

	function renderUI(
		ctx = session.context,
		precomputed?: {
			metrics: SessionMetrics;
			metadata: PrettySessionEntryData | undefined;
		},
	) {
		if (!ctx?.hasUI || !session.isCurrent(ctx)) return;
		const { metrics, metadata } = precomputed ?? session.recompute(ctx);
		const config = configManager.config;

		const nextStatus = config.showStatus
			? formatStatusLine({
					meta: metadata,
					metrics,
					project: session.project,
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
				project: session.project,
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

	async function syncConfig(ctx = session.context, force = false) {
		const result = await configManager.reloadIfChanged(force);
		if (result.isNewError && result.error && ctx?.hasUI) {
			ctx.ui.notify(result.error, "error");
		}
		if (result.changed && ctx) {
			renderUI(ctx);
		}
		return result.config;
	}

	async function openSettingsPanel(targetCtx: ExtensionContext) {
		const revision = session.revision;
		await syncConfig(targetCtx);
		await session.inspect(targetCtx);
		if (!session.isCurrent(targetCtx, revision)) return;
		session.recompute(targetCtx);
		await openPrettySessionSettingsPanel({
			ctx: targetCtx,
			events: pi.events,
			configManager,
			getMeta: () => session.metadata,
			getMetrics: () => session.recompute(targetCtx).metrics,
			onConfigChanged: () => renderUI(targetCtx),
			onReloadConfig: () => syncConfig(targetCtx, true),
			onOpenBrowser: async () => {
				await handleCommand("browse", targetCtx as ExtensionCommandContext);
			},
			onSummarizeNow: async () => {
				await handleCommand("summarize", targetCtx as ExtensionCommandContext);
			},
			onUnlockTitle: async () => {
				await handleCommand("unlock", targetCtx as ExtensionCommandContext);
			},
		});
	}

	function stop() {
		if (watchTimer) {
			clearInterval(watchTimer);
			watchTimer = undefined;
		}
		unlistenDiscover?.();
		unlistenDiscover = undefined;
		lastStatusLine = undefined;
		lastWidgetKey = undefined;
		session.stop();
	}

	pi.on("session_start", async (_event, ctx) => {
		stop();
		session.attach(ctx);
		const revision = session.revision;
		await syncConfig(ctx, true);
		await session.inspect(ctx, true);
		if (!session.isCurrent(ctx, revision)) return;
		const state = session.recompute(ctx);
		renderUI(ctx, state);

		unlistenDiscover = pi.events.on(DISCOVER_EVENT, (payload: unknown) => {
			if (!isDiscoverPayload(payload)) return;
			payload.register({
				id: SELF_PLUGIN_ID,
				title: "Pi Pretty Session",
				command: "/pretty-session (/ps)",
				getSummary: () => {
					const title = session.metadata?.title ?? "(unnamed session)";
					return `${title} · auto=${configManager.config.enabled} · widget=${configManager.config.showWidget}`;
				},
				open: openSettingsPanel,
			});
		});

		watchTimer = setInterval(() => {
			if (session.context) {
				void syncConfig(session.context);
			}
		}, 1500);
		watchTimer.unref?.();
	});

	pi.on("session_shutdown", stop);

	pi.on("session_tree", async (_event, ctx) => {
		session.navigate(ctx);
		await syncConfig(ctx);
		const state = session.recompute(ctx);
		renderUI(ctx, state);
	});

	pi.on("model_select", async (_event, ctx) => {
		session.attach(ctx);
		await syncConfig(ctx);
		const state = session.recompute(ctx);
		renderUI(ctx, state);
	});

	pi.on("session_info_changed", (event, ctx) =>
		session.nameChanged(event.name, ctx),
	);

	pi.on("agent_settled", async (event, ctx) => {
		session.attach(ctx);
		if (event.aborted) {
			renderUI(ctx);
			return;
		}
		const revision = session.revision;
		await syncConfig(ctx);
		if (!session.isCurrent(ctx, revision)) return;
		await session.autoSummarize(ctx, "turn");
	});

	pi.on("session_compact", async (_event, ctx) => {
		session.attach(ctx);
		const revision = session.revision;
		await syncConfig(ctx);
		if (!session.isCurrent(ctx, revision)) return;
		await session.autoSummarize(ctx, "compact");
	});

	async function handleCommand(rawArgs: string, ctx: ExtensionCommandContext) {
		session.attach(ctx);
		const revision = session.revision;
		await syncConfig(ctx);
		const project = await session.inspect(ctx, true);
		if (!session.isCurrent(ctx, revision)) return;
		const { metrics, metadata } = session.recompute(ctx);
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
				const updated = await session.summarize(ctx, {
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
				const saved = session.rename(ctx, title, cmd.description, revision);
				if (!saved) return;
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
				const unlocked = session.unlock(ctx);
				if (!unlocked) return;
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
					if (ctx.mode === "tui") {
						await openSettingsPanel(ctx);
						return;
					}
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
					const lowerKey = (cmd.key ?? "").toLowerCase();
					const matchKey =
						(toggleAliases[lowerKey] as keyof typeof cfg | undefined) ??
						(Object.keys(cfg).find((k) => k.toLowerCase() === lowerKey) as
							| keyof typeof cfg
							| undefined);
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
				} else if (action.type === "open_settings") {
					await openSettingsPanel(ctx);
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

	const getCompletions = (prefix: string) => {
		const models = (() => {
			try {
				const reg = session.context?.modelRegistry as unknown as {
					getAvailable?: () => ReadonlyArray<{ id: string; provider: string }>;
				};
				return reg?.getAvailable?.() ?? [];
			} catch {
				return [];
			}
		})();
		return getPrettySessionCompletions(prefix, {
			config: configManager.config,
			models,
		});
	};

	pi.registerCommand("pretty-session", {
		description:
			"Browse sessions with descriptions/metrics, open TUI settings panel, view project info, auto-summarize, or update config",
		getArgumentCompletions: getCompletions,
		handler: handleCommand,
	});

	pi.registerCommand("ps", {
		description:
			"Short alias for /pretty-session (session browser, TUI settings panel, project info, summarize, rename, config)",
		getArgumentCompletions: getCompletions,
		handler: handleCommand,
	});
}
