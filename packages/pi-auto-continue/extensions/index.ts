import { join, resolve } from "node:path";
import {
	type ExtensionAPI,
	type ExtensionContext,
	getAgentDir,
} from "@earendil-works/pi-coding-agent";
import {
	autoContinueUsage,
	getAutoContinueCompletions,
	parseAutoContinueArgs,
} from "./commands.ts";
import { AutoContinueConfigManager, CONFIG_FILE_NAME } from "./config.ts";
import {
	ContinueController,
	defaults,
	type PendingRound,
	previewPromptText,
	type QueueItem,
	type Settings,
} from "./loop.ts";
import {
	formatDirectPrompt,
	readQueueImportFile,
	resolveContinuationPrompt,
} from "./prompts.ts";
import { evaluatePreDispatchStopHooks } from "./stop-hooks.ts";
import {
	DISCOVER_EVENT,
	isDiscoverPayload,
	openAutoContinueSettingsPanel,
	SELF_PLUGIN_ID,
} from "./ui.ts";

const TICK_INTERVAL_MS = 250;
const CONFIG_CHECK_INTERVAL_MS = 1000;

export type ImmediateDispatchResult =
	| {
			ok: true;
			item: QueueItem;
			deliveredAs: "immediate" | "followUp" | "steer";
	  }
	| { ok: false; error: string };

function resolveOptionalPath(cwd: string, rawPath: string): string {
	const trimmed = rawPath.trim();
	return trimmed ? resolve(cwd, trimmed) : "";
}

export default function (pi: ExtensionAPI) {
	const configPath = join(getAgentDir(), CONFIG_FILE_NAME);
	const configManager = new AutoContinueConfigManager(configPath);
	const controller = new ContinueController();

	let timer: ReturnType<typeof setInterval> | undefined;
	let unlistenTerminal: (() => void) | undefined;
	let unlistenDiscover: (() => void) | undefined;
	let ctx: ExtensionContext | undefined;
	let lastRenderedStatus: string | undefined;
	let lastConfigCheck = 0;
	let syncingConfig: Promise<void> | undefined;
	let dispatching = false;
	let activeAbort: AbortController | undefined;
	let sessionGeneration = 0;
	let dispatchGeneration = 0;

	const syncStatus = (force = false, now = Date.now()) => {
		if (!ctx?.hasUI) return;
		const rendered = controller.formatStatus(now);
		if (!force && lastRenderedStatus === rendered) return;
		lastRenderedStatus = rendered;
		ctx.ui.setStatus("auto-continue", rendered);
	};

	const abortInFlight = () => {
		dispatchGeneration++;
		if (activeAbort) {
			const current = activeAbort;
			activeAbort = undefined;
			current.abort();
		}
		dispatching = false;
		controller.setPhase(undefined);
	};

	const disarmSession = (reason: string) => {
		abortInFlight();
		controller.disarm(reason);
		syncStatus();
	};

	const formatStatusSummary = (now = Date.now()) => {
		const d = controller.getDiagnostics(now);
		const roundsLabel =
			d.maxRounds > 0 ? `${d.rounds}/${d.maxRounds}` : `${d.rounds}/unlimited`;
		const parts = [
			`Auto Continue: ${d.status}`,
			`armed=${d.armed}`,
			`rounds=${roundsLabel}`,
			`queue=${d.queueLength}`,
			`mode=${d.promptMode}`,
			`onError=${d.onError}`,
			`queueEmpty=${d.queueEmptyPolicy}`,
		];
		if (d.queueHeadPreview) {
			parts.push(`head="${d.queueHeadPreview}"`);
		}
		if (d.deadlineMs !== undefined) {
			parts.push(`until=${new Date(d.deadlineMs).toISOString()}`);
		}
		if (d.stopFile) {
			parts.push(`stopFile=${d.stopFile}`);
		}
		if (d.stopCommand) {
			parts.push(`stopCmd=${d.stopCommand}`);
		}
		if (d.lastStopReason) {
			parts.push(`lastStop=${d.lastStopReason}`);
		}
		parts.push(`config=${configPath}`);
		return parts.join("; ");
	};

	const formatQueueList = (): string => {
		const items = controller.listQueue();
		if (items.length === 0) {
			return "Auto Continue queue is empty.";
		}
		const lines = [`Auto Continue queue (${items.length}):`];
		for (let i = 0; i < items.length; i++) {
			const item = items[i];
			if (item) {
				lines.push(`  ${i + 1}. ${previewPromptText(item.text, 80)}`);
			}
		}
		return lines.join("\n");
	};

	const syncConfig = async (targetCtx = ctx, force = false) => {
		const revision = sessionGeneration;
		const result = await configManager.reloadIfChanged(force);
		if (revision !== sessionGeneration) return result;
		if (result.error) {
			if (controller.isArmed()) {
				disarmSession("blocked by invalid config");
			}
			if (result.isNewError && targetCtx?.hasUI) {
				targetCtx.ui.notify(result.error, "error");
			}
			syncStatus();
			return result;
		}
		if (result.changed) {
			controller.updateBaseSettings(result.settings);
			syncStatus();
		}
		return result;
	};

	const sendAutomaticRound = (
		targetCtx: ExtensionContext,
		resolvedPrompt: string | undefined,
		now: number,
		expectedAt: number,
		warning?: string,
	) => {
		const effective = controller.settings;
		const trigger = controller.takeRound(
			now,
			targetCtx.isIdle() && !targetCtx.hasPendingMessages(),
			expectedAt,
		);
		if (!trigger) return;

		const promptToSend =
			trigger.source === "queue" && trigger.queueItem
				? trigger.queueItem.text
				: (resolvedPrompt ??
					formatDirectPrompt(effective.prompt, {
						round: trigger.round,
						maxRounds: trigger.maxRounds,
					}));

		if (warning && targetCtx.hasUI) {
			targetCtx.ui.notify(`Auto Continue: ${warning}`, "warning");
		}

		try {
			pi.sendUserMessage(promptToSend, {
				expandPromptTemplates: effective.expandPromptTemplates,
			});
			if (effective.notifyOnContinue && targetCtx.hasUI) {
				const roundLabel =
					trigger.maxRounds > 0
						? `${trigger.round}/${trigger.maxRounds}`
						: `#${trigger.round}`;
				const detail =
					trigger.source === "queue"
						? `sending queued item (${roundLabel}, remaining: ${controller.queueLength()}): ${previewPromptText(promptToSend, 48)}`
						: `continuing round ${roundLabel}`;
				targetCtx.ui.notify(`Auto Continue: ${detail}`, "info");
			}
		} catch {
			controller.rollbackFailedDispatch(
				trigger.queueItem,
				"continuation was not accepted",
			);
			if (targetCtx.hasUI) {
				targetCtx.ui.notify(
					trigger.queueItem
						? "Auto Continue: message was not accepted; restored item to queue head and disarmed."
						: "Auto Continue: continuation was not accepted; disarmed.",
					"warning",
				);
			}
		}
	};

	const dispatchAsync = async (
		due: PendingRound,
		targetCtx: ExtensionContext,
	) => {
		const sessionRev = sessionGeneration;
		const dispatchRev = ++dispatchGeneration;
		const ac = new AbortController();
		activeAbort = ac;
		dispatching = true;

		const isStale = () =>
			sessionRev !== sessionGeneration ||
			dispatchRev !== dispatchGeneration ||
			ctx !== targetCtx ||
			ac.signal.aborted ||
			!controller.isArmed();

		try {
			if (configManager.error) {
				disarmSession("blocked by invalid config");
				if (targetCtx.hasUI) {
					targetCtx.ui.notify(configManager.error, "error");
				}
				return;
			}

			const effective = controller.settings;
			const resolvedStopFile = resolveOptionalPath(
				targetCtx.cwd,
				effective.stopFile,
			);
			if (resolvedStopFile || effective.stopCommand) {
				controller.setPhase("running stop hook...");
				syncStatus();
				const hookResult = await evaluatePreDispatchStopHooks({
					stopFile: resolvedStopFile,
					stopCommand: effective.stopCommand,
					stopCommandTimeoutMs: effective.stopCommandTimeoutMs,
					round: due.nextRound,
					maxRounds: effective.maxRounds,
					queueLength: controller.queueLength(),
					cwd: targetCtx.cwd,
					signal: ac.signal,
				});
				if (isStale()) return;
				if (hookResult.stop) {
					controller.disarm(hookResult.reason);
					if (targetCtx.hasUI) {
						const detail = hookResult.detail ? ` (${hookResult.detail})` : "";
						targetCtx.ui.notify(
							`Auto Continue: ${hookResult.reason}${detail}.`,
							"info",
						);
					}
					syncStatus();
					return;
				}
			}

			let resolvedPrompt: string | undefined;
			let warning: string | undefined;
			if (controller.queueLength() === 0) {
				if (effective.promptPipe) {
					controller.setPhase("running prompt pipe...");
					syncStatus();
				}
				const resolvedSettings: Settings = {
					...effective,
					promptFile: resolveOptionalPath(targetCtx.cwd, effective.promptFile),
				};
				const promptRes = await resolveContinuationPrompt({
					settings: resolvedSettings,
					round: due.nextRound,
					maxRounds: effective.maxRounds,
					queueLength: controller.queueLength(),
					cwd: targetCtx.cwd,
					signal: ac.signal,
				});
				if (isStale()) return;
				if (!promptRes.ok) {
					controller.disarm(promptRes.reason);
					if (targetCtx.hasUI) {
						targetCtx.ui.notify(`Auto Continue: ${promptRes.error}`, "warning");
					}
					syncStatus();
					return;
				}
				resolvedPrompt = promptRes.prompt;
				warning = promptRes.warning;
			}

			if (isStale()) return;
			controller.setPhase(undefined);
			sendAutomaticRound(
				targetCtx,
				resolvedPrompt,
				Date.now(),
				due.at,
				warning,
			);
			syncStatus();
		} finally {
			if (dispatchRev === dispatchGeneration) {
				dispatching = false;
				if (activeAbort === ac) activeAbort = undefined;
				controller.setPhase(undefined);
				syncStatus();
			}
		}
	};

	const dispatchQueuedNow = (
		targetCtx: ExtensionContext,
		oneBasedIndex: number,
		mode: "send" | "steer",
	): ImmediateDispatchResult => {
		abortInFlight();
		controller.cancelPendingWait();
		const item = controller.takeAt(oneBasedIndex);
		if (!item) {
			syncStatus();
			return {
				ok: false,
				error:
					controller.queueLength() === 0
						? "Continuation queue is empty."
						: `Invalid queue index ${oneBasedIndex}. Valid range: 1..${controller.queueLength()}.`,
			};
		}

		const isBusy = !targetCtx.isIdle() || targetCtx.hasPendingMessages();
		const options: {
			deliverAs?: "steer" | "followUp";
			expandPromptTemplates?: boolean;
		} = {
			expandPromptTemplates: controller.settings.expandPromptTemplates,
		};
		if (isBusy) {
			options.deliverAs = mode === "steer" ? "steer" : "followUp";
		}

		try {
			pi.sendUserMessage(item.text, options);
			syncStatus();
			return {
				ok: true,
				item,
				deliveredAs: options.deliverAs ?? "immediate",
			};
		} catch (err) {
			controller.restoreAt(oneBasedIndex - 1, item);
			syncStatus();
			const msg = err instanceof Error ? err.message : String(err);
			return {
				ok: false,
				error: `Failed to send queued item #${oneBasedIndex} (restored to queue): ${msg}`,
			};
		}
	};

	const addQueuedViaEditor = async (targetCtx: ExtensionContext) => {
		const edited = await targetCtx.ui.editor(
			"Auto Continue — Queue Prompt",
			"",
		);
		if (edited === undefined) {
			return;
		}
		const added = controller.enqueue(edited, Date.now());
		if (!added) {
			targetCtx.ui.notify(
				"Auto Continue: empty prompt ignored (not queued).",
				"warning",
			);
			return;
		}
		syncStatus();
		targetCtx.ui.notify(
			`Auto Continue: queued #${controller.queueLength()}: ${previewPromptText(added.text)}`,
			"info",
		);
	};

	const openSettingsPanel = async (targetCtx: ExtensionContext) => {
		await openAutoContinueSettingsPanel({
			ctx: targetCtx,
			events: pi.events,
			configManager,
			controller,
			onStateChanged: () => syncStatus(),
			onArmSession: () => {
				if (configManager.error) {
					return { ok: false, error: configManager.error };
				}
				abortInFlight();
				return controller.arm(
					{},
					Date.now(),
					targetCtx.isIdle() && !targetCtx.hasPendingMessages(),
				);
			},
			onDisarmSession: (reason) => disarmSession(reason),
			onSendNextQueued: () => {
				const res = dispatchQueuedNow(targetCtx, 1, "send");
				if (!res.ok) return res;
				return {
					ok: true,
					summary: `Sent queued item (${res.deliveredAs}): ${previewPromptText(res.item.text, 48)}`,
				};
			},
			onAddQueuedViaEditor: () => addQueuedViaEditor(targetCtx),
			onClearQueue: () => controller.clearQueue(),
			onReloadConfig: async () => {
				await syncConfig(targetCtx, true);
			},
		});
	};

	const tick = () => {
		if (!ctx) return;
		const now = Date.now();
		if (!syncingConfig && now - lastConfigCheck >= CONFIG_CHECK_INTERVAL_MS) {
			lastConfigCheck = now;
			syncingConfig = syncConfig(ctx)
				.then(() => {})
				.finally(() => {
					syncingConfig = undefined;
				});
		}
		controller.expireDeadline(now);
		if (!dispatching) {
			const due = controller.peekDue(
				now,
				ctx.isIdle() && !ctx.hasPendingMessages(),
			);
			if (due) {
				if (configManager.error) {
					disarmSession("blocked by invalid config");
					if (ctx.hasUI) ctx.ui.notify(configManager.error, "error");
				} else {
					const effective = controller.settings;
					const needsAsync = Boolean(
						effective.stopFile ||
							effective.stopCommand ||
							(controller.queueLength() === 0 &&
								(effective.promptPipe || effective.promptFile)),
					);
					if (needsAsync) {
						void dispatchAsync(due, ctx);
					} else {
						sendAutomaticRound(ctx, undefined, now, due.at);
					}
				}
			}
		}
		syncStatus(false, now);
	};

	const stopRuntime = () => {
		sessionGeneration++;
		abortInFlight();
		if (timer) clearInterval(timer);
		timer = undefined;
		unlistenTerminal?.();
		unlistenTerminal = undefined;
		unlistenDiscover?.();
		unlistenDiscover = undefined;
		controller.resetSession();
		lastRenderedStatus = undefined;
		ctx = undefined;
	};

	pi.on("session_start", async (_event, current) => {
		stopRuntime();
		ctx = current;
		const revision = sessionGeneration;
		const loaded = await configManager.reloadIfChanged(true);
		if (revision !== sessionGeneration) return;
		if (loaded.error && current.hasUI) {
			current.ui.notify(loaded.error, "error");
		}
		controller.resetSession();
		controller.updateBaseSettings(loaded.settings);
		lastConfigCheck = Date.now();
		syncStatus(true);
		unlistenDiscover = pi.events.on(DISCOVER_EVENT, (payload: unknown) => {
			if (!isDiscoverPayload(payload)) return;
			payload.register({
				id: SELF_PLUGIN_ID,
				title: "Pi Auto Continue",
				command: "/auto-continue",
				getSummary: () =>
					`${controller.formatStatus()} · queue=${controller.queueLength()} · mode=${controller.getPromptMode()}`,
				open: openSettingsPanel,
			});
		});
		if (current.mode === "tui") {
			unlistenTerminal = current.ui.onTerminalInput((data) => {
				if (data === "\u001b" || data === "\u0003") {
					if (controller.isArmed() || dispatching) {
						disarmSession("disarmed");
					}
				}
				return undefined;
			});
		}
		timer = setInterval(tick, TICK_INTERVAL_MS);
		timer.unref?.();
	});

	pi.on("session_shutdown", stopRuntime);
	pi.on("session_tree", () => {
		if (controller.isArmed() || dispatching) {
			disarmSession("disarmed (tree navigation)");
		}
	});
	pi.on("model_select", () => {
		if (controller.isArmed() || dispatching) {
			disarmSession("disarmed (model changed)");
		}
	});
	pi.on("input", (event) => {
		if (event.source !== "extension") {
			abortInFlight();
			controller.userInput();
			syncStatus();
		}
	});
	pi.on("agent_start", () => {
		abortInFlight();
		controller.running();
		syncStatus();
	});
	pi.on("before_provider_request", () => {
		controller.recordRequestStart();
	});
	pi.on("after_provider_response", (event) => {
		controller.recordProviderResponse(event.headers, event.status);
	});
	pi.on("message_end", (event) => {
		if (event.message.role !== "assistant") return;
		controller.recordAssistantMessage(
			event.message.stopReason,
			event.message.errorMessage,
		);
	});
	pi.on("agent_settled", async (event, current) => {
		ctx = current;
		const revision = sessionGeneration;
		await syncConfig(current);
		if (revision !== sessionGeneration) return;
		controller.settleTurn(Boolean(event.aborted), Date.now());
		syncStatus();
	});

	pi.registerCommand("auto-continue", {
		description:
			"Arm/disarm multi-round continuation, manage continuation queue, inspect status, or configure defaults",
		getArgumentCompletions: (prefix) =>
			getAutoContinueCompletions(prefix, controller.defaultSettings),
		handler: async (args, current) => {
			ctx = current;
			await syncConfig(current);
			const now = Date.now();
			const cmd = parseAutoContinueArgs(args, now);

			if (cmd.kind === "error") {
				current.ui.notify(cmd.error, "error");
				return;
			}

			if (cmd.kind === "help") {
				current.ui.notify(autoContinueUsage, "warning");
				return;
			}

			if (cmd.kind === "default") {
				if (current.mode === "tui") {
					await openSettingsPanel(current);
					return;
				}
				syncStatus();
				current.ui.notify(formatStatusSummary(now), "info");
				return;
			}

			if (cmd.kind === "status") {
				syncStatus();
				current.ui.notify(formatStatusSummary(now), "info");
				return;
			}

			if (cmd.kind === "stop") {
				disarmSession("disarmed");
				current.ui.notify(formatStatusSummary(now), "info");
				return;
			}

			if (cmd.kind === "start") {
				if (configManager.error) {
					current.ui.notify(configManager.error, "error");
					return;
				}
				abortInFlight();
				const armed = controller.arm(
					cmd.overrides,
					now,
					current.isIdle() && !current.hasPendingMessages(),
				);
				if (!armed.ok) {
					current.ui.notify(armed.error, "error");
					return;
				}
				syncStatus(true, now);
				current.ui.notify(formatStatusSummary(now), "info");
				return;
			}

			if (cmd.kind === "queue") {
				if (cmd.sub === "list") {
					current.ui.notify(formatQueueList(), "info");
					return;
				}
				if (cmd.sub === "add") {
					if (!cmd.text) {
						if (current.mode === "tui") {
							await addQueuedViaEditor(current);
							return;
						}
						current.ui.notify(
							"Usage: /auto-continue queue add <text> (in TUI mode, omit <text> to open multiline editor)",
							"error",
						);
						return;
					}
					const added = controller.enqueue(cmd.text, now);
					if (!added) {
						current.ui.notify(
							"Auto Continue: cannot queue empty text.",
							"error",
						);
						return;
					}
					syncStatus();
					current.ui.notify(
						`Auto Continue: queued #${controller.queueLength()}: ${previewPromptText(added.text)}`,
						"info",
					);
					return;
				}
				if (cmd.sub === "prepend") {
					const added = controller.prepend(cmd.text, now);
					if (!added) {
						current.ui.notify(
							"Auto Continue: cannot queue empty text.",
							"error",
						);
						return;
					}
					syncStatus();
					current.ui.notify(
						`Auto Continue: prepended #1 (total ${controller.queueLength()}): ${previewPromptText(added.text)}`,
						"info",
					);
					return;
				}
				if (cmd.sub === "remove") {
					const removed = controller.removeAt(cmd.index);
					if (!removed) {
						current.ui.notify(
							`Invalid queue index ${cmd.index}. Queue length: ${controller.queueLength()}.`,
							"error",
						);
						return;
					}
					if (!controller.isArmed() && dispatching) {
						abortInFlight();
					}
					syncStatus();
					current.ui.notify(
						`Auto Continue: removed #${cmd.index}: ${previewPromptText(removed.text)}`,
						"info",
					);
					return;
				}
				if (cmd.sub === "move") {
					const moved = controller.move(cmd.from, cmd.to);
					if (!moved) {
						current.ui.notify(
							`Invalid move positions ${cmd.from} -> ${cmd.to}. Queue length: ${controller.queueLength()}.`,
							"error",
						);
						return;
					}
					syncStatus();
					current.ui.notify(
						`Auto Continue: moved item #${cmd.from} -> #${cmd.to}: ${previewPromptText(moved.text)}`,
						"info",
					);
					return;
				}
				if (cmd.sub === "clear") {
					const cleared = controller.clearQueue();
					if (!controller.isArmed() && dispatching) {
						abortInFlight();
					}
					syncStatus();
					current.ui.notify(
						`Auto Continue: cleared ${cleared} queued item${cleared === 1 ? "" : "s"}.`,
						"info",
					);
					return;
				}
				if (cmd.sub === "import") {
					const targetPath = resolve(current.cwd, cmd.filePath);
					const loaded = await readQueueImportFile(targetPath);
					if (!loaded.ok) {
						current.ui.notify(loaded.error, "error");
						return;
					}
					for (const itemText of loaded.items) {
						controller.enqueue(itemText, now);
					}
					syncStatus();
					current.ui.notify(
						`Auto Continue: imported ${loaded.items.length} item${loaded.items.length === 1 ? "" : "s"} from ${cmd.filePath} (queue size: ${controller.queueLength()}).`,
						"info",
					);
					return;
				}
				if (cmd.sub === "send" || cmd.sub === "steer") {
					const res = dispatchQueuedNow(current, cmd.index, cmd.sub);
					if (!res.ok) {
						current.ui.notify(res.error, "error");
						return;
					}
					current.ui.notify(
						`Auto Continue: ${cmd.sub} #${cmd.index} (${res.deliveredAs}): ${previewPromptText(res.item.text)}`,
						"info",
					);
					return;
				}
			}

			if (cmd.kind === "config") {
				if (cmd.reload) {
					const reloaded = await syncConfig(current, true);
					current.ui.notify(
						reloaded.error ??
							`Auto Continue config reloaded: ${JSON.stringify(controller.defaultSettings)}`,
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
						`Auto Continue Config (${configPath})\nDefaults: ${JSON.stringify(controller.defaultSettings)}\nBuilt-in: ${JSON.stringify(defaults)}`,
						configManager.error ? "error" : "info",
					);
					return;
				}
				if (cmd.value === undefined) {
					const matchKey = (
						Object.keys(defaults) as Array<keyof Settings>
					).find((k) => k.toLowerCase() === cmd.key?.toLowerCase());
					if (!matchKey) {
						current.ui.notify(
							`Unknown configuration key "${cmd.key}". Valid keys: ${Object.keys(defaults).join(", ")}.`,
							"error",
						);
						return;
					}
					current.ui.notify(
						`${matchKey} = ${JSON.stringify(controller.defaultSettings[matchKey])} (config: ${configPath})`,
						"info",
					);
					return;
				}
				const updated = await configManager.setOption(cmd.key, cmd.value, true);
				if (!updated.ok) {
					current.ui.notify(updated.error, "error");
					return;
				}
				controller.updateBaseSettings(updated.settings);
				syncStatus();
				current.ui.notify(
					`Updated ${updated.key}=${JSON.stringify(updated.value)} in ${configPath}`,
					"info",
				);
			}
		},
	});
}
