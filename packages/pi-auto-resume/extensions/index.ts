import { join } from "node:path";
import {
	type ExtensionAPI,
	type ExtensionContext,
	getAgentDir,
} from "@earendil-works/pi-coding-agent";
import { AutoResumeConfigManager, CONFIG_FILE_NAME } from "./config.ts";
import { defaults, Recovery, type Settings } from "./recovery.ts";

const WAKE_GAP_THRESHOLD_MS = 30000;
const TICK_INTERVAL_MS = 250;
const CONFIG_CHECK_INTERVAL_MS = 1000;

export default function (pi: ExtensionAPI) {
	const configPath = join(getAgentDir(), CONFIG_FILE_NAME);
	const configManager = new AutoResumeConfigManager(configPath);
	let recovery = new Recovery();
	let timer: ReturnType<typeof setInterval> | undefined;
	let unlisten: (() => void) | undefined;
	let ctx: ExtensionContext | undefined;
	let lastRenderedStatus: string | undefined;
	let lastTick = Date.now();
	let lastConfigCheck = 0;
	let syncingConfig: Promise<void> | undefined;

	const syncStatus = (force = false) => {
		if (!ctx?.hasUI) return;
		if (!force && lastRenderedStatus === recovery.status) return;
		lastRenderedStatus = recovery.status;
		ctx.ui.setStatus("auto-resume", recovery.status);
	};

	const syncConfig = async (targetCtx = ctx, force = false) => {
		const result = await configManager.reloadIfChanged(force);
		if (result.changed) {
			recovery.updateSettings(result.settings);
			syncStatus();
		}
		if (result.isNewError && result.error && targetCtx?.hasUI) {
			targetCtx.ui.notify(result.error, "error");
		}
		return result;
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
		if (timer) clearInterval(timer);
		timer = undefined;
		unlisten?.();
		unlisten = undefined;
		recovery.cancel();
		lastRenderedStatus = undefined;
		ctx = undefined;
	};

	pi.on("session_start", async (_event, current) => {
		stop();
		ctx = current;
		const loaded = await configManager.reloadIfChanged(true);
		if (loaded.error && current.hasUI) {
			current.ui.notify(loaded.error, "error");
		}
		recovery = new Recovery(loaded.settings);
		lastTick = Date.now();
		lastConfigCheck = lastTick;
		syncStatus(true);
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
		await syncConfig(current);
		recovery.settleTurn(Boolean(event.aborted), Date.now());
		syncStatus();
	});
	pi.registerCommand("auto-resume", {
		description:
			"Show status; stop pending recovery; on/off for this session; or view/update config",
		handler: async (args, current) => {
			ctx = current;
			await syncConfig(current);
			const trimmed = args.trim();
			const parts = trimmed ? trimmed.split(/\s+/) : [];
			const sub = (parts[0] ?? "").toLowerCase();

			if (sub === "config" || sub === "cfg" || sub === "set") {
				const keyArg = parts[1];
				const valArg = parts.slice(2).join(" ");
				if (!keyArg) {
					current.ui.notify(
						`Auto Resume Config (${configPath})\nActive: ${JSON.stringify(recovery.settings)}\nDefaults: ${JSON.stringify(defaults)}`,
						configManager.error ? "error" : "info",
					);
					return;
				}
				if (keyArg.toLowerCase() === "reload" && !valArg) {
					const reloaded = await syncConfig(current, true);
					current.ui.notify(
						reloaded.error ??
							`Auto Resume config reloaded: ${JSON.stringify(recovery.settings)}`,
						reloaded.error ? "error" : "info",
					);
					return;
				}
				if (!valArg) {
					const matchKey = Object.keys(recovery.settings).find(
						(k) => k.toLowerCase() === keyArg.toLowerCase(),
					) as keyof Settings | undefined;
					if (!matchKey) {
						current.ui.notify(
							`Unknown configuration key "${keyArg}". Valid keys: ${Object.keys(defaults).join(", ")}.`,
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
				const updated = await configManager.setOption(keyArg, valArg, true);
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

			if (sub === "stop" && parts.length === 1) {
				recovery.cancel();
			} else if (sub === "off" && parts.length === 1) {
				recovery.setEnabled(false);
			} else if (sub === "on" && parts.length === 1) {
				if (configManager.error) {
					current.ui.notify(configManager.error, "error");
					return;
				}
				recovery.setEnabled(true);
			} else if (sub !== "" && sub !== "status") {
				current.ui.notify(
					"Usage: /auto-resume [status | stop | on | off | config [reload | <key> [value]]]",
					"warning",
				);
				return;
			}
			syncStatus();
			current.ui.notify(
				`Auto Resume: ${recovery.status}; enabled=${recovery.settings.enabled}; maxAttempts=${recovery.settings.maxAttempts}; config=${configPath}\nDefaults: ${JSON.stringify(defaults)}`,
				"info",
			);
		},
	});
}
