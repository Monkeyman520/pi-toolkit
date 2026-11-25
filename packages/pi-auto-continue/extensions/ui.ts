import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { type SettingItem, truncateToWidth } from "@earendil-works/pi-tui";
import {
	discoverLoadedPanels,
	type PluginUiDescriptor,
} from "pi-plugin-support/discovery";
import {
	createSettingsPanel,
	pluginSwitcherItem,
} from "pi-plugin-support/panels";
import { type AutoContinueConfigManager, configOptions } from "./config.ts";
import { type ContinueController, defaults, type Settings } from "./loop.ts";

export {
	DISCOVER_EVENT,
	discoverLoadedPanels,
	isDiscoverPayload,
	type PluginUiDescriptor,
	type PluginUiDiscoverPayload,
} from "pi-plugin-support/discovery";
export const SELF_PLUGIN_ID = "pi-auto-continue";

type PanelOutcome =
	| { kind: "switch"; panel: PluginUiDescriptor }
	| { kind: "add-queue-editor" }
	| undefined;

export async function openAutoContinueSettingsPanel(params: {
	ctx: ExtensionContext;
	events: ExtensionAPI["events"];
	configManager: AutoContinueConfigManager;
	controller: ContinueController;
	onStateChanged: () => void;
	onArmSession: () => { ok: true } | { ok: false; error: string };
	onDisarmSession: (reason: string) => void;
	onSendNextQueued: () =>
		| { ok: true; summary: string }
		| { ok: false; error: string };
	onAddQueuedViaEditor: () => Promise<void>;
	onClearQueue: () => number;
	onReloadConfig: () => Promise<void>;
}): Promise<void> {
	const {
		ctx,
		events,
		configManager,
		controller,
		onStateChanged,
		onArmSession,
		onDisarmSession,
		onSendNextQueued,
		onAddQueuedViaEditor,
		onClearQueue,
		onReloadConfig,
	} = params;

	const otherPanels = discoverLoadedPanels(events).filter(
		(panel) => panel.id !== SELF_PLUGIN_ID,
	);

	const outcome = await ctx.ui.custom<PanelOutcome>((tui, theme, _kb, done) => {
		let feedbackMessage: string | undefined;

		const buildItems = (): SettingItem[] => {
			const s = controller.defaultSettings;
			const list: SettingItem[] = [
				{
					id: "session-armed",
					label: "Session Auto-Continue (armed/disarmed)",
					description:
						"Arm or disarm continuation for this session only (never auto-arms future sessions)",
					currentValue: controller.isArmed() ? "armed" : "disarmed",
					values: ["armed", "disarmed"],
				},
				{
					id: "delayMs",
					label: "Buffer Delay (ms)",
					description: `Wait after normal completion before continuing (default: ${defaults.delayMs}ms)`,
					currentValue: String(s.delayMs),
					values: [...configOptions.delayMs.values],
				},
				{
					id: "maxRounds",
					label: "Max Rounds",
					description: `Maximum automatic rounds (0 = unlimited, default: ${defaults.maxRounds})`,
					currentValue: String(s.maxRounds),
					values: [...configOptions.maxRounds.values],
				},
				{
					id: "onError",
					label: "On Error Policy",
					description:
						"Behavior when assistant turn ends with an error (defer / wait-quota / stop)",
					currentValue: s.onError,
					values: [...configOptions.onError.values],
				},
				{
					id: "queueEmptyPolicy",
					label: "Queue Empty Policy",
					description:
						"Behavior after the continuation queue finishes draining (stop / continue)",
					currentValue: s.queueEmptyPolicy,
					values: [...configOptions.queueEmptyPolicy.values],
				},
				{
					id: "expandPromptTemplates",
					label: "Expand Prompt Templates",
					description:
						"Expand slash commands, skills, and prompt templates when dispatching",
					currentValue: String(s.expandPromptTemplates),
					values: [...configOptions.expandPromptTemplates.values],
				},
				{
					id: "quotaWait",
					label: "Quota Reset Wait",
					description:
						"Wait for concrete provider quota reset evidence before dispatching",
					currentValue: String(s.quotaWait),
					values: [...configOptions.quotaWait.values],
				},
				{
					id: "quotaDelayMs",
					label: "Post-Reset Safety Delay (ms)",
					description: `Safety buffer after reported quota reset (default: ${defaults.quotaDelayMs}ms)`,
					currentValue: String(s.quotaDelayMs),
					values: [...configOptions.quotaDelayMs.values],
				},
				{
					id: "pipeRequireFormat",
					label: "Pipe Require Format Tags",
					description:
						"Fail closed if promptPipe output lacks configured prefix/suffix tags",
					currentValue: String(s.pipeRequireFormat),
					values: [...configOptions.pipeRequireFormat.values],
				},
				{
					id: "pipeTimeoutMs",
					label: "Prompt Pipe Timeout (ms)",
					description: `Timeout for one-shot promptPipe command (default: ${defaults.pipeTimeoutMs}ms)`,
					currentValue: String(s.pipeTimeoutMs),
					values: [...configOptions.pipeTimeoutMs.values],
				},
				{
					id: "stopCommandTimeoutMs",
					label: "StopHook Timeout (ms)",
					description: `Timeout for one-shot stopCommand hook (default: ${defaults.stopCommandTimeoutMs}ms)`,
					currentValue: String(s.stopCommandTimeoutMs),
					values: [...configOptions.stopCommandTimeoutMs.values],
				},
				{
					id: "notifyOnContinue",
					label: "Notify on Continue",
					description:
						"Show a concise notification when an automatic round dispatches",
					currentValue: String(s.notifyOnContinue),
					values: [...configOptions.notifyOnContinue.values],
				},
				{
					id: "action-queue-send",
					label: "Send Next Queued Item",
					description:
						"Immediately send item #1 (idle: immediate, busy: followUp; overrides waits)",
					currentValue: "press Enter",
					values: ["press Enter"],
				},
				{
					id: "action-queue-add",
					label: "Add Queued Prompt (Editor)",
					description:
						"Open Pi multiline editor to append a prompt to the continuation queue",
					currentValue: "press Enter",
					values: ["press Enter"],
				},
				{
					id: "action-queue-clear",
					label: "Clear Queue",
					description: "Remove all items from the session continuation queue",
					currentValue: "press Enter",
					values: ["press Enter"],
				},
				{
					id: "action-stop",
					label: "Stop Auto-Continue",
					description:
						"Cancel any pending wait or external command and disarm (preserves queue)",
					currentValue: "press Enter",
					values: ["press Enter"],
				},
				{
					id: "action-reload",
					label: "Reload Config File",
					description: `Reload defaults from ${configManager.configPath}`,
					currentValue: "press Enter",
					values: ["press Enter"],
				},
			];

			if (otherPanels.length > 0) {
				list.push(
					pluginSwitcherItem(otherPanels, theme, (target) =>
						done({ kind: "switch", panel: target }),
					),
				);
			}

			return list;
		};

		const items = buildItems();
		const { settingsList, component } = createSettingsPanel({
			tui,
			theme,
			items,
			onChange: (id, newValue) => {
				if (id === "session-armed") {
					if (newValue === "armed") {
						const res = onArmSession();
						feedbackMessage = res.ok
							? "Armed auto-continue for this session."
							: res.error;
					} else {
						onDisarmSession("disarmed");
						feedbackMessage =
							"Disarmed auto-continue (queued items preserved).";
					}
					syncListValues();
					onStateChanged();
					tui.requestRender();
					return;
				}
				if (id === "action-queue-send") {
					const res = onSendNextQueued();
					feedbackMessage = res.ok ? res.summary : res.error;
					syncListValues();
					onStateChanged();
					tui.requestRender();
					return;
				}
				if (id === "action-queue-add") {
					done({ kind: "add-queue-editor" });
					return;
				}
				if (id === "action-queue-clear") {
					const count = onClearQueue();
					feedbackMessage =
						count > 0
							? `Cleared ${count} queued item${count === 1 ? "" : "s"}.`
							: "Queue is already empty.";
					syncListValues();
					onStateChanged();
					tui.requestRender();
					return;
				}
				if (id === "action-stop") {
					onDisarmSession("disarmed");
					feedbackMessage =
						"Stopped and disarmed auto-continue (queued items preserved).";
					syncListValues();
					onStateChanged();
					tui.requestRender();
					return;
				}
				if (id === "action-reload") {
					feedbackMessage = "Reloading configuration from disk…";
					tui.requestRender();
					void onReloadConfig().then(() => {
						syncListValues();
						feedbackMessage =
							configManager.error ?? "Reloaded configuration from disk.";
						onStateChanged();
						tui.requestRender();
					});
					return;
				}

				const key = id as keyof Settings;
				void configManager.setOption(key, newValue, true).then((res) => {
					if (res.ok) {
						controller.updateBaseSettings(res.settings);
						syncListValues();
						feedbackMessage = `Saved ${res.key} = ${JSON.stringify(res.value)}`;
						onStateChanged();
					} else {
						feedbackMessage = res.error;
					}
					tui.requestRender();
				});
			},
			onCancel: () => done(undefined),
			renderHeader: (width: number) => {
				const w = Math.max(20, width);
				const now = Date.now();
				const diag = controller.getDiagnostics(now);
				const roundsLabel =
					diag.maxRounds > 0
						? `${diag.rounds}/${diag.maxRounds}`
						: `${diag.rounds}/∞`;
				const badge = diag.armed
					? theme.fg("success", "armed")
					: theme.fg("warning", "disarmed");
				const headerLines = [
					truncateToWidth(
						`${theme.bold(theme.fg("accent", "Auto Continue · Status & Settings"))} · ${badge}`,
						w,
					),
					truncateToWidth(
						`${theme.fg("dim", "Status:")} ${theme.fg("text", diag.status)} · ${theme.fg("dim", `Rounds: ${roundsLabel}`)} · ${theme.fg("dim", `Queue: ${diag.queueLength}`)}`,
						w,
					),
					truncateToWidth(
						theme.fg(
							"dim",
							`Mode: ${diag.promptMode} · onError=${diag.onError} · queueEmpty=${diag.queueEmptyPolicy} · Config: ${configManager.configPath}`,
						),
						w,
					),
				];
				if (diag.queueHeadPreview) {
					headerLines.push(
						truncateToWidth(
							`${theme.fg("dim", "Queue Head:")} ${theme.fg("text", diag.queueHeadPreview)}`,
							w,
						),
					);
				}
				const activeStops: string[] = [];
				if (diag.deadlineMs !== undefined) {
					activeStops.push(`until ${new Date(diag.deadlineMs).toISOString()}`);
				}
				if (diag.stopFile) {
					activeStops.push(`stopFile=${diag.stopFile}`);
				}
				if (diag.stopCommand) {
					activeStops.push(`stopCmd=${diag.stopCommand}`);
				}
				if (activeStops.length > 0) {
					headerLines.push(
						truncateToWidth(
							`${theme.fg("dim", "Stop Hooks:")} ${theme.fg("muted", activeStops.join(" · "))}`,
							w,
						),
					);
				}
				if (diag.lastStopReason) {
					headerLines.push(
						truncateToWidth(
							`${theme.fg("dim", "Last Stop:")} ${theme.fg("muted", diag.lastStopReason)}`,
							w,
						),
					);
				}
				if (configManager.error) {
					headerLines.push(
						truncateToWidth(theme.fg("error", configManager.error), w),
					);
				}
				if (feedbackMessage) {
					headerLines.push(
						truncateToWidth(theme.fg("muted", feedbackMessage), w),
					);
				}
				headerLines.push("");
				return headerLines;
			},
		});

		const syncListValues = () => {
			const s = controller.defaultSettings;
			settingsList.updateValue(
				"session-armed",
				controller.isArmed() ? "armed" : "disarmed",
			);
			settingsList.updateValue("delayMs", String(s.delayMs));
			settingsList.updateValue("maxRounds", String(s.maxRounds));
			settingsList.updateValue("onError", s.onError);
			settingsList.updateValue("queueEmptyPolicy", s.queueEmptyPolicy);
			settingsList.updateValue(
				"expandPromptTemplates",
				String(s.expandPromptTemplates),
			);
			settingsList.updateValue("quotaWait", String(s.quotaWait));
			settingsList.updateValue("quotaDelayMs", String(s.quotaDelayMs));
			settingsList.updateValue(
				"pipeRequireFormat",
				String(s.pipeRequireFormat),
			);
			settingsList.updateValue("pipeTimeoutMs", String(s.pipeTimeoutMs));
			settingsList.updateValue(
				"stopCommandTimeoutMs",
				String(s.stopCommandTimeoutMs),
			);
			settingsList.updateValue("notifyOnContinue", String(s.notifyOnContinue));
		};

		return component;
	});

	if (outcome?.kind === "switch") {
		await outcome.panel.open(ctx);
	} else if (outcome?.kind === "add-queue-editor") {
		await onAddQueuedViaEditor();
	}
}
