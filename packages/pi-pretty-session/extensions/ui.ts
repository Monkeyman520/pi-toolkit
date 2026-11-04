import {
	DynamicBorder,
	type ExtensionAPI,
	type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import {
	Container,
	type SelectItem,
	SelectList,
	type SettingItem,
	SettingsList,
	type SettingsListTheme,
	truncateToWidth,
} from "@earendil-works/pi-tui";
import {
	type ConfigManager,
	defaultConfig,
	type PrettySessionConfig,
} from "./config.ts";
import { formatContextLength } from "./display.ts";
import type { PrettySessionEntryData, SessionMetrics } from "./summarizer.ts";

export const DISCOVER_EVENT = "pi-packages:ui:discover";
export const SELF_PLUGIN_ID = "pi-pretty-session";

export interface PluginUiDescriptor {
	id: string;
	title: string;
	command: string;
	getSummary(): string;
	open(ctx: ExtensionContext): Promise<void>;
}

export interface PluginUiDiscoverPayload {
	register(descriptor: PluginUiDescriptor): void;
}

export function isDiscoverPayload(
	value: unknown,
): value is PluginUiDiscoverPayload {
	return (
		typeof value === "object" &&
		value !== null &&
		"register" in value &&
		typeof (value as { register?: unknown }).register === "function"
	);
}

export function discoverLoadedPanels(
	events: ExtensionAPI["events"],
): PluginUiDescriptor[] {
	const byId = new Map<string, PluginUiDescriptor>();
	events.emit(DISCOVER_EVENT, {
		register(descriptor: PluginUiDescriptor) {
			if (
				descriptor &&
				typeof descriptor.id === "string" &&
				typeof descriptor.title === "string" &&
				typeof descriptor.open === "function"
			) {
				byId.set(descriptor.id, descriptor);
			}
		},
	} satisfies PluginUiDiscoverPayload);
	return [...byId.values()];
}

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

			const listTheme: SettingsListTheme = {
				label: (text, selected) =>
					selected ? theme.fg("accent", text) : theme.fg("text", text),
				value: (text, selected) =>
					selected ? theme.fg("accent", text) : theme.fg("muted", text),
				description: (text) => theme.fg("dim", text),
				cursor: theme.fg("accent", "› "),
				hint: (text) => theme.fg("dim", text),
			};

			const buildItems = (): SettingItem[] => {
				const c = configManager.config;
				const modelChoices = [
					"default",
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
						values: ["true", "false"],
					},
					{
						id: "useLlm",
						label: "Use LLM Summarization (llm)",
						description:
							"Use isolated LLM completion for summaries (falls back to local heuristics when false)",
						currentValue: String(c.useLlm),
						values: ["true", "false"],
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
						values: ["true", "false"],
					},
					{
						id: "showWidget",
						label: "Show Session Widget (widget)",
						description:
							"Display live session & project overview widget near the editor",
						currentValue: String(c.showWidget),
						values: ["true", "false"],
					},
					{
						id: "widgetPlacement",
						label: "Widget Placement",
						description:
							"Position the session widget above or below the editor",
						currentValue: c.widgetPlacement,
						values: ["aboveEditor", "belowEditor"],
					},
					{
						id: "showStatus",
						label: "Show Footer Status (status)",
						description:
							"Display compact session metrics in the footer status bar",
						currentValue: String(c.showStatus),
						values: ["true", "false"],
					},
					{
						id: "summarizeOnCompact",
						label: "Summarize on Compaction (compact)",
						description:
							"Automatically refresh session summary when /compact completes",
						currentValue: String(c.summarizeOnCompact),
						values: ["true", "false"],
					},
					{
						id: "updateEveryTurns",
						label: "Update Every N Turns",
						description: `Re-summarize after every N completed turns (default: ${defaultConfig.updateEveryTurns})`,
						currentValue: String(c.updateEveryTurns),
						values: ["1", "2", "3", "5", "10"],
					},
					{
						id: "contextDeltaTokens",
						label: "Context Delta Threshold (tokens)",
						description: `Re-summarize when context grows by N tokens (default: ${defaultConfig.contextDeltaTokens})`,
						currentValue: String(c.contextDeltaTokens),
						values: ["2000", "4000", "8000", "16000", "32000"],
					},
					{
						id: "maxTitleLength",
						label: "Max Title Length",
						description: `Maximum characters for generated titles (default: ${defaultConfig.maxTitleLength})`,
						currentValue: String(c.maxTitleLength),
						values: ["40", "60", "80", "100"],
					},
					{
						id: "maxDescriptionLength",
						label: "Max Description Length",
						description: `Maximum characters for generated descriptions (default: ${defaultConfig.maxDescriptionLength})`,
						currentValue: String(c.maxDescriptionLength),
						values: ["100", "160", "220", "280"],
					},
					{
						id: "summaryTimeoutMs",
						label: "Summary Timeout (ms)",
						description: `Timeout for LLM summarization requests (default: ${defaultConfig.summaryTimeoutMs}ms)`,
						currentValue: String(c.summaryTimeoutMs),
						values: ["5000", "10000", "15000", "30000"],
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

				if (otherPanels.length > 0) {
					list.push({
						id: "switch-plugin",
						label: "Switch Installed Plugin",
						description:
							"Open another installed collection plugin's TUI settings panel",
						currentValue: `${otherPanels.length} installed`,
						submenu: (_cur, subDone) => {
							const selectItems: SelectItem[] = otherPanels.map((p) => ({
								value: p.id,
								label: `${p.title} (${p.command})`,
								description: p.getSummary(),
							}));
							const selectList = new SelectList(
								selectItems,
								Math.min(selectItems.length + 1, 8),
								{
									selectedPrefix: (t) => theme.fg("accent", t),
									selectedText: (t) => theme.fg("accent", t),
									description: (t) => theme.fg("muted", t),
									scrollInfo: (t) => theme.fg("dim", t),
									noMatch: (t) => theme.fg("warning", t),
								},
							);
							selectList.onSelect = (item) => {
								const target = otherPanels.find((p) => p.id === item.value);
								subDone();
								if (target) {
									done({ type: "switch_plugin", descriptor: target });
								}
							};
							selectList.onCancel = () => subDone();
							return selectList;
						},
					});
				}

				return list;
			};

			const items = buildItems();
			const settingsList = new SettingsList(
				items,
				Math.min(items.length + 2, 14),
				listTheme,
				(id, newValue) => {
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
				() => done(undefined),
				{ enableSearch: true },
			);

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

			const container = new Container();
			container.addChild(new DynamicBorder((str) => theme.fg("accent", str)));
			container.addChild({
				render(width: number): string[] {
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
				invalidate() {},
			});
			container.addChild(settingsList);
			container.addChild(new DynamicBorder((str) => theme.fg("accent", str)));

			return {
				capturesViewportInput: settingsList.capturesViewportInput,
				render(width: number) {
					return container.render(width);
				},
				invalidate() {
					container.invalidate();
				},
				handleInput(data: string) {
					settingsList.handleInput(data);
					tui.requestRender();
				},
			};
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
