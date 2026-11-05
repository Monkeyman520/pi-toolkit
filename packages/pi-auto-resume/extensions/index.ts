import { join } from "node:path";
import {
	type ExtensionAPI,
	type ExtensionContext,
	getAgentDir,
} from "@earendil-works/pi-coding-agent";
import {
	autoResumeUsage,
	getAutoResumeCompletions,
	parseAutoResumeArgs,
} from "./commands.ts";
import { AutoResumeConfigManager, CONFIG_FILE_NAME } from "./config.ts";
import { defaults, Recovery, type Settings } from "./recovery.ts";
import {
	DISCOVER_EVENT,
	isDiscoverPayload,
	openAutoResumeSettingsPanel,
	SELF_PLUGIN_ID,
} from "./ui.ts";

const WAKE_GAP_THRESHOLD_MS = 30000;
const TICK_INTERVAL_MS = 250;
const CONFIG_CHECK_INTERVAL_MS = 1000;

export default function (pi: ExtensionAPI) {
	const configPath = join(getAgentDir(), CONFIG_FILE_NAME);
	const configManager = new AutoResumeConfigManager(configPath);
	let recovery = new Recovery();
	let timer: ReturnType<typeof setInterval> | undefined;
	let unlisten: (() => void) | undefined;
	let unlistenDiscover: (() => void) | undefined;
	let ctx: ExtensionContext | undefined;
	let lastRenderedStatus: string | undefined;
	let lastTick = Date.now();
	let lastConfigCheck = 0;
	let syncingConfig: Promise<void> | undefined;
	let generation = 0;

	const syncStatus = (force = false) => {
		if (!ctx?.hasUI) return;
		if (!force && lastRenderedStatus === recovery.status) return;
		lastRenderedStatus = recovery.status;
		ctx.ui.setStatus("auto-resume", recovery.status);
	};

	const syncConfig = async (targetCtx = ctx, force = false) => {
		const revision = generation;
		const result = await configManager.reloadIfChanged(force);
		if (revision !== generation) return result;
		if (result.changed) {
			recovery.updateSettings(result.settings);
			syncStatus();
		}
		if (result.isNewError && result.error && targetCtx?.hasUI) {
			targetCtx.ui.notify(result.error, "error");
		}
		return result;
	};

	const openSettingsPanel = async (targetCtx: ExtensionContext) => {
		await openAutoResumeSettingsPanel({
			ctx: targetCtx,
			events: pi.events,
			configManager,
			recovery,
			onStateChanged: () => syncStatus(),
			onReloadConfig: async () => {
				await syncConfig(targetCtx, true);
			},
		});
	};

	const tick = () => {
		if (!ctx) return;
		const now = Date.now();
		if (now - lastTick > WAKE_GAP_THRESHOLD_MS) recovery.woke();
		lastTick = now;
		if (!syncingConfig && now - lastConfigCheck >= CONFIG_CHECK_INTERVAL_MS) {
			lastConfigCheck = now;
			syncingConfig = syncConfig(ctx)
				.then(() => {})
				.finally(() => {
					syncingConfig = undefined;
				});
		}
		if (recovery.take(now, ctx.isIdle() && !ctx.hasPendingMessages())) {
			try {
				pi.sendUserMessage(
					"Continue the interrupted task from where it stopped.",
				);
			} catch {
				recovery.cancel();
				if (ctx.hasUI)
					ctx.ui.notify(
						"Auto Resume: continuation was not accepted.",
						"warning",
					);
			}
		}
		syncStatus();
	};

	const stop = () => {
		generation++;
		if (timer) clearInterval(timer);
		timer = undefined;
		unlisten?.();
		unlisten = undefined;
		unlistenDiscover?.();
		unlistenDiscover = undefined;
		recovery.cancel();
		lastRenderedStatus = undefined;
		ctx = undefined;
	};

	pi.on("session_start", async (_event, current) => {
		stop();
		ctx = current;
		const revision = generation;
		const loaded = await configManager.reloadIfChanged(true);
		if (revision !== generation) return;
		if (loaded.error && current.hasUI) {
			current.ui.notify(loaded.error, "error");
		}
		recovery = new Recovery(loaded.settings);
		lastTick = Date.now();
		lastConfigCheck = lastTick;
		syncStatus(true);
		unlistenDiscover = pi.events.on(DISCOVER_EVENT, (payload: unknown) => {
			if (!isDiscoverPayload(payload)) return;
			payload.register({
				id: SELF_PLUGIN_ID,
				title: "Pi Auto Resume",
				command: "/auto-resume",
				getSummary: () =>
					`${recovery.status} · enabled=${recovery.settings.enabled} · maxAttempts=${recovery.settings.maxAttempts}`,
				open: openSettingsPanel,
			});
		});
		if (current.mode === "tui")
			unlisten = current.ui.onTerminalInput((data) => {
				if (data === "\u001b" || data === "\u0003") {
					recovery.cancel();
					syncStatus();
				}
				return undefined;
			});
		timer = setInterval(tick, TICK_INTERVAL_MS);
		timer.unref?.();
	});

	pi.on("session_shutdown", stop);
	pi.on("session_tree", () => {
		recovery.cancel();
		syncStatus();
	});
	pi.on("model_select", () => {
		recovery.cancel();
		syncStatus();
	});
	pi.on("input", (event) => {
		if (event.source !== "extension") {
			recovery.userInput();
			syncStatus();
		}
	});
	pi.on("agent_start", () => {
		recovery.running();
		syncStatus();
	});
	pi.on("before_provider_request", () => {
		recovery.recordRequestStart();
	});
	pi.on("after_provider_response", (event) => {
		recovery.recordProviderResponse(event.headers, event.status);
	});
	pi.on("message_end", (event) => {
		if (event.message.role !== "assistant") return;
		recovery.recordAssistantMessage(
			event.message.stopReason,
			event.message.errorMessage,
		);
	});
	pi.on("agent_settled", async (event, current) => {
		ctx = current;
		const revision = generation;
		await syncConfig(current);
		if (revision !== generation) return;
		recovery.settleTurn(Boolean(event.aborted), Date.now());
		syncStatus();
	});
	pi.registerCommand("auto-resume", {
		description:
			"Open interactive TUI settings panel, show status, stop pending recovery, toggle on/off, or update config",
		getArgumentCompletions: (prefix) =>
			getAutoResumeCompletions(prefix, recovery.settings),
		handler: async (args, current) => {
			ctx = current;
			await syncConfig(current);
			const cmd = parseAutoResumeArgs(args);

			if (cmd.kind === "help") {
				current.ui.notify(autoResumeUsage, "warning");
				return;
			}

			if (cmd.kind === "default") {
				if (current.mode === "tui") {
					await openSettingsPanel(current);
					return;
				}
				syncStatus();
				current.ui.notify(
					`Auto Resume: ${recovery.status}; enabled=${recovery.settings.enabled}; maxAttempts=${recovery.settings.maxAttempts}; config=${configPath}\nDefaults: ${JSON.stringify(defaults)}`,
					"info",
				);
				return;
			}

			if (cmd.kind === "config") {
				if (cmd.reload) {
					const reloaded = await syncConfig(current, true);
					current.ui.notify(
						reloaded.error ??
							`Auto Resume config reloaded: ${JSON.stringify(recovery.settings)}`,
						reloaded.error ? "error" : "info",
					);
					return;
				}
				if (!cmd.key) {
					if (current.mode === "tui") {
						await openSettingsPanel(current);
						return;
					}
					current.ui.notify(
						`Auto Resume Config (${configPath})\nActive: ${JSON.stringify(recovery.settings)}\nDefaults: ${JSON.stringify(defaults)}`,
						configManager.error ? "error" : "info",
					);
					return;
				}
				if (cmd.value === undefined) {
					const matchKey = Object.keys(recovery.settings).find(
						(k) => k.toLowerCase() === cmd.key?.toLowerCase(),
					) as keyof Settings | undefined;
					if (!matchKey) {
						current.ui.notify(
							`Unknown configuration key "${cmd.key}". Valid keys: ${Object.keys(defaults).join(", ")}.`,
							"error",
						);
						return;
					}
					current.ui.notify(
						`${matchKey} = ${JSON.stringify(recovery.settings[matchKey])} (config: ${configPath})`,
						"info",
					);
					return;
				}
				const updated = await configManager.setOption(cmd.key, cmd.value, true);
				if (!updated.ok) {
					current.ui.notify(updated.error, "error");
					return;
				}
				recovery.updateSettings(updated.settings);
				syncStatus();
				current.ui.notify(
					`Updated ${updated.key}=${JSON.stringify(updated.value)} in ${configPath}`,
					"info",
				);
				return;
			}

			if (cmd.kind === "stop") {
				recovery.cancel();
			} else if (cmd.kind === "off") {
				recovery.setEnabled(false);
			} else if (cmd.kind === "on") {
				if (configManager.error) {
					current.ui.notify(configManager.error, "error");
					return;
				}
				recovery.setEnabled(true);
			}
			syncStatus();
			current.ui.notify(
				`Auto Resume: ${recovery.status}; enabled=${recovery.settings.enabled}; maxAttempts=${recovery.settings.maxAttempts}; config=${configPath}\nDefaults: ${JSON.stringify(defaults)}`,
				"info",
			);
		},
	});
}
