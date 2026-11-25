import { access, readFile, stat } from "node:fs/promises";
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
import {
	defaults,
	formatResumePrompt,
	type PendingRecovery,
	parseGuardDurationMs,
	parseGuardUntilMs,
	Recovery,
	type Settings,
} from "./recovery.ts";
import {
	DISCOVER_EVENT,
	isDiscoverPayload,
	openAutoResumeSettingsPanel,
	SELF_PLUGIN_ID,
} from "./ui.ts";

const WAKE_GAP_THRESHOLD_MS = 30000;
const TICK_INTERVAL_MS = 250;
const CONFIG_CHECK_INTERVAL_MS = 1000;
const MAX_PROMPT_FILE_BYTES = 1024 * 1024;

async function stopFileExists(filePath: string): Promise<boolean> {
	try {
		await access(filePath);
		return true;
	} catch (err) {
		if (
			err instanceof Error &&
			"code" in err &&
			(err.code === "ENOENT" || err.code === "ENOTDIR")
		) {
			return false;
		}
		return true;
	}
}

async function readResumePromptFile(
	filePath: string,
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
	try {
		const info = await stat(filePath);
		if (!info.isFile()) {
			return {
				ok: false,
				error: `resumePromptFile is not a regular file: ${filePath}`,
			};
		}
		if (info.size > MAX_PROMPT_FILE_BYTES) {
			return {
				ok: false,
				error: `resumePromptFile exceeds ${MAX_PROMPT_FILE_BYTES} bytes: ${filePath}`,
			};
		}
		const raw = await readFile(filePath, "utf8");
		if (Buffer.byteLength(raw) > MAX_PROMPT_FILE_BYTES) {
			return {
				ok: false,
				error: `resumePromptFile exceeds ${MAX_PROMPT_FILE_BYTES} bytes: ${filePath}`,
			};
		}
		const normalized = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
		if (!normalized) {
			return {
				ok: false,
				error: `resumePromptFile is empty: ${filePath}`,
			};
		}
		return { ok: true, text: normalized };
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		return {
			ok: false,
			error: `Failed to read resumePromptFile (${filePath}): ${msg}`,
		};
	}
}

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
	let dispatching = false;
	let generation = 0;

	const syncStatus = (force = false, now = Date.now()) => {
		if (!ctx?.hasUI) return;
		const rendered = recovery.formatStatus(now);
		if (!force && lastRenderedStatus === rendered) return;
		lastRenderedStatus = rendered;
		ctx.ui.setStatus("auto-resume", rendered);
	};

	const formatStatusSummary = (now = Date.now()) => {
		const d = recovery.getDiagnostics(now);
		const totalLabel =
			d.maxTotalAttempts > 0
				? `${d.totalAttempts}/${d.maxTotalAttempts}`
				: String(d.totalAttempts);
		const parts = [
			`Auto Resume: ${d.status}`,
			`enabled=${recovery.settings.enabled}`,
			`attempts=${d.attempts}/${d.maxAttempts}`,
			`sessionTotal=${totalLabel}`,
		];
		if (d.guardUntilMs !== undefined) {
			const guardState =
				now >= d.guardUntilMs
					? `expired(${new Date(d.guardUntilMs).toISOString()})`
					: `until ${new Date(d.guardUntilMs).toISOString()}`;
			parts.push(`guard=${guardState}`);
		}
		if (d.stopFile) {
			parts.push(`stopFile=${d.stopFile}`);
		}
		if (d.lastError) {
			parts.push(`last=[${d.lastCause ?? "excluded"}] ${d.lastError}`);
		}
		parts.push(`config=${configPath}`);
		return `${parts.join("; ")}\nDefaults: ${JSON.stringify(defaults)}`;
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

	const sendRecoveryMessage = (
		targetCtx: ExtensionContext,
		promptTemplate: string,
		now: number,
		expectedAt: number,
	) => {
		const trigger = recovery.takeTrigger(
			now,
			targetCtx.isIdle() && !targetCtx.hasPendingMessages(),
			expectedAt,
		);
		if (!trigger) return;
		const prompt = formatResumePrompt(promptTemplate, trigger);
		try {
			pi.sendUserMessage(prompt);
			if (recovery.settings.notifyOnResume && targetCtx.hasUI) {
				targetCtx.ui.notify(
					`Auto Resume: resuming after ${trigger.cause} interruption (attempt ${trigger.attempt}/${trigger.maxAttempts}, session total ${trigger.totalAttempts}).`,
					"info",
				);
			}
		} catch {
			recovery.cancel();
			if (targetCtx.hasUI)
				targetCtx.ui.notify(
					"Auto Resume: continuation was not accepted.",
					"warning",
				);
		}
	};

	const dispatchAsync = async (
		due: PendingRecovery,
		targetCtx: ExtensionContext,
	) => {
		const revision = generation;
		dispatching = true;
		try {
			const stopFile = recovery.settings.stopFile;
			if (stopFile) {
				const stopped = await stopFileExists(stopFile);
				if (revision !== generation || ctx !== targetCtx) return;
				if (stopped) {
					recovery.cancelWithStatus("stopped by sentinel file");
					if (targetCtx.hasUI) {
						targetCtx.ui.notify(
							`Auto Resume: stopped by sentinel file (${stopFile}).`,
							"info",
						);
					}
					syncStatus();
					return;
				}
			}
			const promptFile = recovery.settings.resumePromptFile;
			let template = recovery.settings.resumePrompt;
			if (promptFile) {
				const loaded = await readResumePromptFile(promptFile);
				if (revision !== generation || ctx !== targetCtx) return;
				if (!loaded.ok) {
					recovery.cancelWithStatus("resumePromptFile unavailable or empty");
					if (targetCtx.hasUI) {
						targetCtx.ui.notify(`Auto Resume: ${loaded.error}`, "warning");
					}
					syncStatus();
					return;
				}
				template = loaded.text;
			}
			if (revision !== generation || ctx !== targetCtx) return;
			sendRecoveryMessage(targetCtx, template, Date.now(), due.at);
			syncStatus();
		} finally {
			if (revision === generation) {
				dispatching = false;
			}
		}
	};

	const tick = () => {
		if (!ctx) return;
		const now = Date.now();
		if (now - lastTick > WAKE_GAP_THRESHOLD_MS) recovery.woke();
		lastTick = now;
		if (!syncingConfig && now - lastConfigCheck >= CONFIG_CHECK_INTERVAL_MS) {
			lastConfigCheck = now;
			syncingConfig = syncConfig(ctx)
				.then(() => { })
				.finally(() => {
					syncingConfig = undefined;
				});
		}
		recovery.expireGuardrail(now);
		if (!dispatching) {
			const due = recovery.peekDue(
				now,
				ctx.isIdle() && !ctx.hasPendingMessages(),
			);
			if (due) {
				if (recovery.settings.stopFile || recovery.settings.resumePromptFile) {
					void dispatchAsync(due, ctx);
				} else {
					sendRecoveryMessage(ctx, recovery.settings.resumePrompt, now, due.at);
				}
			}
		}
		syncStatus(false, now);
	};

	const stop = () => {
		generation++;
		dispatching = false;
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
					`${recovery.formatStatus()} · enabled=${recovery.settings.enabled} · maxAttempts=${recovery.settings.maxAttempts}`,
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
		const pendingAt = recovery.getDiagnostics().pendingAt;
		if (pendingAt !== undefined && recovery.settings.stopFile) {
			const stopFile = recovery.settings.stopFile;
			const stopped = await stopFileExists(stopFile);
			if (revision !== generation) return;
			if (stopped && recovery.getDiagnostics().pendingAt === pendingAt) {
				recovery.cancelWithStatus("stopped by sentinel file");
				if (current.hasUI) {
					current.ui.notify(
						`Auto Resume: stopped by sentinel file (${stopFile}).`,
						"info",
					);
				}
			}
		}
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
				current.ui.notify(formatStatusSummary(), "info");
				return;
			}

			if (cmd.kind === "guard") {
				const now = Date.now();
				if (cmd.sub === "status") {
					const guardUntil = recovery.getGuardUntil();
					current.ui.notify(
						guardUntil === undefined
							? "Auto Resume Guardrail: none (session-only)"
							: now >= guardUntil
								? `Auto Resume Guardrail: expired at ${new Date(guardUntil).toISOString()}`
								: `Auto Resume Guardrail: active until ${new Date(guardUntil).toISOString()}`,
						"info",
					);
					return;
				}
				if (cmd.sub === "clear") {
					recovery.clearGuard();
					syncStatus();
					current.ui.notify("Auto Resume Guardrail: cleared.", "info");
					return;
				}
				if (cmd.sub === "duration") {
					const ms = parseGuardDurationMs(cmd.value ?? "");
					if (ms === undefined) {
						current.ui.notify(
							`Invalid duration "${cmd.value ?? ""}". Expected positive duration like 30m, 2h, 1h30m, or 300s.`,
							"error",
						);
						return;
					}
					const until = now + ms;
					recovery.setGuardUntil(until, now);
					syncStatus();
					current.ui.notify(
						`Auto Resume Guardrail: active until ${new Date(until).toISOString()} (session-only)`,
						"info",
					);
					return;
				}
				const until = parseGuardUntilMs(cmd.value ?? "");
				if (until === undefined || until <= now) {
					current.ui.notify(
						`Invalid or past timestamp "${cmd.value ?? ""}". Expected future ISO-8601 or YYYY-MM-DD HH:MM:SS.`,
						"error",
					);
					return;
				}
				recovery.setGuardUntil(until, now);
				syncStatus();
				current.ui.notify(
					`Auto Resume Guardrail: active until ${new Date(until).toISOString()} (session-only)`,
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
			current.ui.notify(formatStatusSummary(), "info");
		},
	});
}
