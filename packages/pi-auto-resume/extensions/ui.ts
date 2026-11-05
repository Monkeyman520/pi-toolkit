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
import { type AutoResumeConfigManager, configOptions } from "./config.ts";
import { defaults, type Recovery, type Settings } from "./recovery.ts";

export {
	DISCOVER_EVENT,
	discoverLoadedPanels,
	isDiscoverPayload,
	type PluginUiDescriptor,
	type PluginUiDiscoverPayload,
} from "pi-plugin-support/discovery";
export const SELF_PLUGIN_ID = "pi-auto-resume";

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
						values: [...configOptions.network.values],
					},
					{
						id: "throttle",
						label: "Rate-Limit / Throttling Recovery",
						description:
							"Resume tasks interrupted by temporary HTTP 429 rate limits",
						currentValue: String(s.throttle),
						values: [...configOptions.throttle.values],
					},
					{
						id: "quota",
						label: "Subscription Quota Recovery",
						description:
							"Wait for concrete service reset time + safety delay before resuming",
						currentValue: String(s.quota),
						values: [...configOptions.quota.values],
					},
					{
						id: "wake",
						label: "Sleep / Wake Catch-up",
						description:
							"Reevaluate eligible interrupted work after the computer wakes from sleep",
						currentValue: String(s.wake),
						values: [...configOptions.wake.values],
					},
					{
						id: "retryDelayMs",
						label: "Retry Delay (ms)",
						description: `Minimum wait before network/throttling retry (default: ${defaults.retryDelayMs}ms)`,
						currentValue: String(s.retryDelayMs),
						values: [...configOptions.retryDelayMs.values],
					},
					{
						id: "quotaDelayMs",
						label: "Post-Reset Safety Delay (ms)",
						description: `Additional delay after reported quota reset (default: ${defaults.quotaDelayMs}ms)`,
						currentValue: String(s.quotaDelayMs),
						values: [...configOptions.quotaDelayMs.values],
					},
					{
						id: "maxAttempts",
						label: "Max Consecutive Attempts",
						description: `Maximum automatic retries per user prompt (default: ${defaults.maxAttempts})`,
						currentValue: String(s.maxAttempts),
						values: [...configOptions.maxAttempts.values],
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

				if (otherPanels.length > 0)
					list.push(
						pluginSwitcherItem(otherPanels, theme, (target) => done(target)),
					);

				return list;
			};

			const items = buildItems();
			const { settingsList, component } = createSettingsPanel({
				tui,
				theme,
				items,
				onChange: (id, newValue) => {
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
				onCancel: () => done(undefined),
				renderHeader: (width: number) => {
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
			});

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

			return component;
		},
	);

	if (nextPanel) {
		await nextPanel.open(ctx);
	}
}
