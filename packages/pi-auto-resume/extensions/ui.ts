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
import type { AutoResumeConfigManager } from "./config.ts";
import { defaults, type Recovery, type Settings } from "./recovery.ts";

export const DISCOVER_EVENT = "pi-packages:ui:discover";
export const SELF_PLUGIN_ID = "pi-auto-resume";

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

export async function openAutoResumeSettingsPanel(params: {
	ctx: ExtensionContext;
	events: ExtensionAPI["events"];
	configManager: AutoResumeConfigManager;
	recovery: Recovery;
	onStateChanged: () => void;
	onReloadConfig: () => Promise<void>;
}): Promise<void> {
	const {
		ctx,
		events,
		configManager,
		recovery,
		onStateChanged,
		onReloadConfig,
	} = params;

	const otherPanels = discoverLoadedPanels(events).filter(
		(panel) => panel.id !== SELF_PLUGIN_ID,
	);

	const nextPanel = await ctx.ui.custom<PluginUiDescriptor | undefined>(
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
				const s = recovery.settings;
				const list: SettingItem[] = [
					{
						id: "session-toggle",
						label: "Session Auto-Resume (on/off)",
						description:
							"Enable or disable automatic continuation in the current session and persist to config",
						currentValue: s.enabled ? "on" : "off",
						values: ["on", "off"],
					},
					{
						id: "network",
						label: "Network / Timeout Recovery",
						description:
							"Resume tasks interrupted by network loss or request timeouts",
						currentValue: String(s.network),
						values: ["true", "false"],
					},
					{
						id: "throttle",
						label: "Rate-Limit / Throttling Recovery",
						description:
							"Resume tasks interrupted by temporary HTTP 429 rate limits",
						currentValue: String(s.throttle),
						values: ["true", "false"],
					},
					{
						id: "quota",
						label: "Subscription Quota Recovery",
						description:
							"Wait for concrete service reset time + safety delay before resuming",
						currentValue: String(s.quota),
						values: ["true", "false"],
					},
					{
						id: "wake",
						label: "Sleep / Wake Catch-up",
						description:
							"Reevaluate eligible interrupted work after the computer wakes from sleep",
						currentValue: String(s.wake),
						values: ["true", "false"],
					},
					{
						id: "retryDelayMs",
						label: "Retry Delay (ms)",
						description: `Minimum wait before network/throttling retry (default: ${defaults.retryDelayMs}ms)`,
						currentValue: String(s.retryDelayMs),
						values: ["1000", "5000", "10000", "30000", "60000"],
					},
					{
						id: "quotaDelayMs",
						label: "Post-Reset Safety Delay (ms)",
						description: `Additional delay after reported quota reset (default: ${defaults.quotaDelayMs}ms)`,
						currentValue: String(s.quotaDelayMs),
						values: ["0", "5000", "15000", "30000", "60000", "120000"],
					},
					{
						id: "maxAttempts",
						label: "Max Consecutive Attempts",
						description: `Maximum automatic retries per user prompt (default: ${defaults.maxAttempts})`,
						currentValue: String(s.maxAttempts),
						values: ["1", "2", "3", "5", "10", "20"],
					},
					{
						id: "action-stop",
						label: "Cancel Pending Recovery (stop)",
						description:
							"Immediately cancel any waiting recovery timer in this session",
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
									done(target);
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
					if (id === "action-stop") {
						recovery.cancel();
						feedbackMessage = "Cancelled pending recovery.";
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

					const key: keyof Settings =
						id === "session-toggle" ? "enabled" : (id as keyof Settings);
					void configManager.setOption(key, newValue, true).then((res) => {
						if (res.ok) {
							recovery.updateSettings(res.settings);
							if (id === "session-toggle") {
								recovery.setEnabled(Boolean(res.value));
							}
							syncListValues();
							feedbackMessage = `Saved ${res.key} = ${JSON.stringify(res.value)}`;
							onStateChanged();
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
				const s = recovery.settings;
				settingsList.updateValue("session-toggle", s.enabled ? "on" : "off");
				settingsList.updateValue("network", String(s.network));
				settingsList.updateValue("throttle", String(s.throttle));
				settingsList.updateValue("quota", String(s.quota));
				settingsList.updateValue("wake", String(s.wake));
				settingsList.updateValue("retryDelayMs", String(s.retryDelayMs));
				settingsList.updateValue("quotaDelayMs", String(s.quotaDelayMs));
				settingsList.updateValue("maxAttempts", String(s.maxAttempts));
			};

			const container = new Container();
			container.addChild(new DynamicBorder((str) => theme.fg("accent", str)));
			container.addChild({
				render(width: number): string[] {
					const w = Math.max(20, width);
					const s = recovery.settings;
					const headerLines = [
						truncateToWidth(
							`${theme.bold(theme.fg("accent", "Auto Resume · Status & Settings"))} · ${s.enabled ? theme.fg("success", "enabled") : theme.fg("warning", "disabled")}`,
							w,
						),
						truncateToWidth(
							`${theme.fg("dim", "Status:")} ${theme.fg("text", recovery.status)} · ${theme.fg("dim", `Config: ${configManager.configPath}`)}`,
							w,
						),
					];
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

	if (nextPanel) {
		await nextPanel.open(ctx);
	}
}
