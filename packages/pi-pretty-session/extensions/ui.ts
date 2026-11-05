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
import {
	type ConfigManager,
	configOptions,
	defaultConfig,
	type PrettySessionConfig,
} from "./config.ts";
import { formatContextLength } from "./display.ts";
import type { PrettySessionEntryData, SessionMetrics } from "./summarizer.ts";

export {
	DISCOVER_EVENT,
	discoverLoadedPanels,
	isDiscoverPayload,
	type PluginUiDescriptor,
	type PluginUiDiscoverPayload,
} from "pi-plugin-support/discovery";
export const SELF_PLUGIN_ID = "pi-pretty-session";

export type PrettySessionPanelAction =
	| { type: "switch_plugin"; descriptor: PluginUiDescriptor }
	| { type: "browse" }
	| { type: "summarize" }
	| { type: "unlock" }
	| undefined;

export async function openPrettySessionSettingsPanel(params: {
	ctx: ExtensionContext;
	events: ExtensionAPI["events"];
	configManager: ConfigManager;
	getMeta: () => PrettySessionEntryData | undefined;
	getMetrics: () => SessionMetrics;
	onConfigChanged: () => void;
	onReloadConfig: () => Promise<PrettySessionConfig>;
	onOpenBrowser?: () => Promise<void>;
	onSummarizeNow?: () => Promise<void>;
	onUnlockTitle?: () => Promise<void>;
}): Promise<void> {
	const {
		ctx,
		events,
		configManager,
		getMeta,
		getMetrics,
		onConfigChanged,
		onReloadConfig,
		onOpenBrowser,
		onSummarizeNow,
		onUnlockTitle,
	} = params;

	const otherPanels = discoverLoadedPanels(events).filter(
		(panel) => panel.id !== SELF_PLUGIN_ID,
	);

	const availableModels = (() => {
		try {
			const reg = ctx.modelRegistry as unknown as {
				getAvailable?: () => ReadonlyArray<{
					id: string;
					provider: string;
				}>;
			};
			return reg?.getAvailable?.() ?? [];
		} catch {
			return [];
		}
	})();

	const action = await ctx.ui.custom<PrettySessionPanelAction>(
		(tui, theme, _kb, done) => {
			let feedbackMessage: string | undefined;

			const buildItems = (): SettingItem[] => {
				const c = configManager.config;
				const modelChoices = [
					...configOptions.model.values,
					...(c.model ? [c.model] : []),
					...availableModels.map((m) => `${m.provider}/${m.id}`),
				];
				const uniqueModels = [...new Set(modelChoices)];

				const list: SettingItem[] = [
					{
						id: "enabled",
						label: "Auto-Summarize Enabled (auto)",
						description:
							"Automatically generate and update session title and description",
						currentValue: String(c.enabled),
						values: [...configOptions.enabled.values],
					},
					{
						id: "useLlm",
						label: "Use LLM Summarization (llm)",
						description:
							"Use isolated LLM completion for summaries (falls back to local heuristics when false)",
						currentValue: String(c.useLlm),
						values: [...configOptions.useLlm.values],
					},
					{
						id: "model",
						label: "Summarization Model Override",
						description:
							"Model used for LLM summarization ('default' uses the active session model)",
						currentValue: c.model ?? "default",
						values: uniqueModels,
					},
					{
						id: "protectManualName",
						label: "Protect Manual Titles (lock)",
						description:
							"Prevent automatic re-summarization from overwriting manual /name or /ps rename titles",
						currentValue: String(c.protectManualName),
						values: [...configOptions.protectManualName.values],
					},
					{
						id: "showWidget",
						label: "Show Session Widget (widget)",
						description:
							"Display live session & project overview widget near the editor",
						currentValue: String(c.showWidget),
						values: [...configOptions.showWidget.values],
					},
					{
						id: "widgetPlacement",
						label: "Widget Placement",
						description:
							"Position the session widget above or below the editor",
						currentValue: c.widgetPlacement,
						values: [...configOptions.widgetPlacement.values],
					},
					{
						id: "showStatus",
						label: "Show Footer Status (status)",
						description:
							"Display compact session metrics in the footer status bar",
						currentValue: String(c.showStatus),
						values: [...configOptions.showStatus.values],
					},
					{
						id: "summarizeOnCompact",
						label: "Summarize on Compaction (compact)",
						description:
							"Automatically refresh session summary when /compact completes",
						currentValue: String(c.summarizeOnCompact),
						values: [...configOptions.summarizeOnCompact.values],
					},
					{
						id: "updateEveryTurns",
						label: "Update Every N Turns",
						description: `Re-summarize after every N completed turns (default: ${defaultConfig.updateEveryTurns})`,
						currentValue: String(c.updateEveryTurns),
						values: [...configOptions.updateEveryTurns.values],
					},
					{
						id: "contextDeltaTokens",
						label: "Context Delta Threshold (tokens)",
						description: `Re-summarize when context grows by N tokens (default: ${defaultConfig.contextDeltaTokens})`,
						currentValue: String(c.contextDeltaTokens),
						values: [...configOptions.contextDeltaTokens.values],
					},
					{
						id: "maxTitleLength",
						label: "Max Title Length",
						description: `Maximum characters for generated titles (default: ${defaultConfig.maxTitleLength})`,
						currentValue: String(c.maxTitleLength),
						values: [...configOptions.maxTitleLength.values],
					},
					{
						id: "maxDescriptionLength",
						label: "Max Description Length",
						description: `Maximum characters for generated descriptions (default: ${defaultConfig.maxDescriptionLength})`,
						currentValue: String(c.maxDescriptionLength),
						values: [...configOptions.maxDescriptionLength.values],
					},
					{
						id: "summaryTimeoutMs",
						label: "Summary Timeout (ms)",
						description: `Timeout for LLM summarization requests (default: ${defaultConfig.summaryTimeoutMs}ms)`,
						currentValue: String(c.summaryTimeoutMs),
						values: [...configOptions.summaryTimeoutMs.values],
					},
					{
						id: "action-summarize",
						label: "Summarize Session Now",
						description:
							"Immediately generate/refresh the session title and description",
						currentValue: "press Enter",
						values: ["press Enter"],
					},
					{
						id: "action-unlock",
						label: "Unlock Manual Title",
						description:
							"Clear manual title lock so automatic summarization can update the title",
						currentValue: "press Enter",
						values: ["press Enter"],
					},
					{
						id: "action-browse",
						label: "Open Session Browser",
						description:
							"Open the interactive Pretty Session browser (/ps browse)",
						currentValue: "press Enter",
						values: ["press Enter"],
					},
					{
						id: "action-reload",
						label: "Reload Config File",
						description: `Reload settings from ${configManager.configPath}`,
						currentValue: "press Enter",
						values: ["press Enter"],
					},
				];

				if (otherPanels.length > 0)
					list.push(
						pluginSwitcherItem(otherPanels, theme, (target) =>
							done({ type: "switch_plugin", descriptor: target }),
						),
					);

				return list;
			};

			const items = buildItems();
			const { settingsList, component } = createSettingsPanel({
				tui,
				theme,
				items,
				onChange: (id, newValue) => {
					if (id === "action-summarize") {
						done({ type: "summarize" });
						return;
					}
					if (id === "action-unlock") {
						done({ type: "unlock" });
						return;
					}
					if (id === "action-browse") {
						done({ type: "browse" });
						return;
					}
					if (id === "action-reload") {
						feedbackMessage = "Reloading configuration from disk…";
						tui.requestRender();
						void onReloadConfig().then(() => {
							syncListValues();
							feedbackMessage =
								configManager.error ??
								"Reloaded pi-pretty-session.json from disk.";
							onConfigChanged();
							tui.requestRender();
						});
						return;
					}
					void configManager.setOption(id, newValue, true).then((res) => {
						if (res.ok) {
							syncListValues();
							feedbackMessage = `Saved ${res.key} = ${JSON.stringify(res.value ?? "default")}`;
							onConfigChanged();
						} else {
							feedbackMessage = res.error;
						}
						tui.requestRender();
					});
				},
				onCancel: () => done(undefined),
				renderHeader: (width: number) => {
					const w = Math.max(20, width);
					const meta = getMeta();
					const metrics = getMetrics();
					const title = meta?.title ?? "(unnamed current session)";
					const badge = meta
						? meta.manualLocked
							? "manual (locked)"
							: meta.source
						: "pending";
					const headerLines: string[] = [
						truncateToWidth(
							`${theme.bold(theme.fg("accent", "Pretty Session · Status & Settings"))} · ${theme.fg("warning", title)} [${badge}]`,
							w,
						),
						truncateToWidth(
							`${theme.fg("dim", "Context:")} ${theme.fg("text", formatContextLength(metrics))} · ${theme.fg("dim", `Turns: ${metrics.turnCount} · Config: ${configManager.configPath}`)}`,
							w,
						),
					];
					if (meta?.description) {
						headerLines.push(
							truncateToWidth(
								`${theme.fg("dim", "Summary:")} ${theme.fg("muted", meta.description)}`,
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
							truncateToWidth(theme.fg("accent", feedbackMessage), w),
						);
					}
					headerLines.push("");
					return headerLines;
				},
			});

			const syncListValues = () => {
				const c = configManager.config;
				settingsList.updateValue("enabled", String(c.enabled));
				settingsList.updateValue("useLlm", String(c.useLlm));
				settingsList.updateValue("model", c.model ?? "default");
				settingsList.updateValue(
					"protectManualName",
					String(c.protectManualName),
				);
				settingsList.updateValue("showWidget", String(c.showWidget));
				settingsList.updateValue("widgetPlacement", c.widgetPlacement);
				settingsList.updateValue("showStatus", String(c.showStatus));
				settingsList.updateValue(
					"summarizeOnCompact",
					String(c.summarizeOnCompact),
				);
				settingsList.updateValue(
					"updateEveryTurns",
					String(c.updateEveryTurns),
				);
				settingsList.updateValue(
					"contextDeltaTokens",
					String(c.contextDeltaTokens),
				);
				settingsList.updateValue("maxTitleLength", String(c.maxTitleLength));
				settingsList.updateValue(
					"maxDescriptionLength",
					String(c.maxDescriptionLength),
				);
				settingsList.updateValue(
					"summaryTimeoutMs",
					String(c.summaryTimeoutMs),
				);
			};

			return component;
		},
	);

	if (!action) return;
	if (action.type === "switch_plugin") {
		await action.descriptor.open(ctx);
	} else if (action.type === "browse") {
		await onOpenBrowser?.();
	} else if (action.type === "summarize") {
		await onSummarizeNow?.();
	} else if (action.type === "unlock") {
		await onUnlockTitle?.();
	}
}
