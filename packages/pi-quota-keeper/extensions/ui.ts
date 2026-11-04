import { join } from "node:path";
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
import { getQuotaModelsForProvider } from "./commands.ts";
import {
	configOptions,
	executeQuotaConfigCommand,
	type QuotaKeeperConfig,
	type State,
} from "./coordination.ts";
import { formatQuotaView } from "./display.ts";

export const DISCOVER_EVENT = "pi-packages:ui:discover";
export const SELF_PLUGIN_ID = "pi-quota-keeper";

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

export async function openQuotaSettingsPanel(params: {
	ctx: ExtensionContext;
	events: ExtensionAPI["events"];
	dir: string;
	getState: () => State;
	getConfig: () => QuotaKeeperConfig;
	getOwnerActive: () => boolean;
	getProblem: () => string | undefined;
	onApplyConfig: (nextConfig: QuotaKeeperConfig) => Promise<boolean>;
	onRefreshNow: () => Promise<boolean>;
	onReloadConfig: () => Promise<QuotaKeeperConfig>;
}): Promise<void> {
	const {
		ctx,
		events,
		dir,
		getState,
		getConfig,
		getOwnerActive,
		getProblem,
		onApplyConfig,
		onRefreshNow,
		onReloadConfig,
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
					name?: string;
				}>;
			};
			return reg?.getAvailable?.() ?? [];
		} catch {
			return [];
		}
	})();

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

			const formatAccountWakeValue = (accountId: string): string => {
				const cfg = getConfig();
				if (!cfg.enabledAccounts.includes(accountId)) {
					return "disabled";
				}
				const model = cfg.models[accountId] ?? "no-model";
				const win = cfg.resetWindows[accountId];
				return win ? `enabled (${model} · ${win})` : `enabled (${model})`;
			};

			const collectAccountIds = (): Array<{
				id: string;
				provider: string;
				label: string;
				reason: string;
				windows: string[];
			}> => {
				const state = getState();
				const cfg = getConfig();
				const byId = new Map<
					string,
					{
						id: string;
						provider: string;
						label: string;
						reason: string;
						windows: string[];
					}
				>();
				for (const s of state.snapshots) {
					byId.set(s.id, {
						id: s.id,
						provider: s.provider,
						label: s.label,
						reason: s.activation.reason,
						windows: s.windows.map((w) => w.id),
					});
				}
				for (const enabledId of cfg.enabledAccounts) {
					if (!byId.has(enabledId)) {
						const prov = enabledId.split(":")[0] || "unknown";
						byId.set(enabledId, {
							id: enabledId,
							provider: prov,
							label: enabledId,
							reason: "Configured in pi-quota-keeper.json",
							windows: cfg.resetWindows[enabledId]
								? [cfg.resetWindows[enabledId]]
								: [],
						});
					}
				}
				return [...byId.values()];
			};

			const buildItems = (): SettingItem[] => {
				const cfg = getConfig();
				const list: SettingItem[] = [
					{
						id: "mode",
						label: "Schedule Mode",
						description:
							"reset: wait for service reset + delayMs · fixed: explicit 5-hour cadence",
						currentValue: cfg.mode,
						values: [...configOptions.mode.values],
					},
					{
						id: "delayMs",
						label: "Post-Reset Delay (ms)",
						description:
							"Delay after reported service reset before sending activation/wake-up (default: 30000ms)",
						currentValue: String(cfg.delayMs),
						values: [...configOptions.delayMs.values],
					},
					{
						id: "pollIntervalMs",
						label: "Poll Interval (ms)",
						description:
							"Owner quota polling cadence in milliseconds (default: 60000ms)",
						currentValue: String(cfg.pollIntervalMs),
						values: [...configOptions.pollIntervalMs.values],
					},
				];

				for (const acc of collectAccountIds()) {
					list.push({
						id: `account:${acc.id}`,
						label: `Wake-up: ${acc.id}`,
						description: `${acc.label} — ${acc.reason}`,
						currentValue: formatAccountWakeValue(acc.id),
						submenu: (_cur, subDone) => {
							const models = getQuotaModelsForProvider(
								acc.provider,
								{
									snapshots: getState().snapshots,
									config: getConfig(),
									models: availableModels,
								},
								acc.id,
							);
							const choiceTargets = new Map<
								string,
								| { kind: "disable" }
								| { kind: "enable"; modelId: string; winId?: string }
							>();
							const choices: SelectItem[] = [
								{
									value: "disable",
									label: "Disable wake-up",
									description: `Remove ${acc.id} from enabledAccounts`,
								},
							];
							choiceTargets.set("disable", { kind: "disable" });
							for (const m of models) {
								const key = `enable-model-${choices.length}`;
								choiceTargets.set(key, { kind: "enable", modelId: m });
								choices.push({
									value: key,
									label: `Enable with ${m}`,
									description: `Use model ${m} for ${acc.id}`,
								});
								for (const winId of acc.windows) {
									if (acc.windows.length > 1) {
										const winKey = `enable-win-${choices.length}`;
										choiceTargets.set(winKey, {
											kind: "enable",
											modelId: m,
											winId,
										});
										choices.push({
											value: winKey,
											label: `Enable with ${m} (window: ${winId})`,
											description: `Pin resetWindow=${winId}`,
										});
									}
								}
							}

							const selectList = new SelectList(
								choices,
								Math.min(choices.length + 1, 10),
								{
									selectedPrefix: (t) => theme.fg("accent", t),
									selectedText: (t) => theme.fg("accent", t),
									description: (t) => theme.fg("muted", t),
									scrollInfo: (t) => theme.fg("dim", t),
									noMatch: (t) => theme.fg("warning", t),
								},
							);
							selectList.onSelect = (item) => {
								subDone();
								const selectedChoice = choiceTargets.get(item.value);
								if (!selectedChoice) return;
								if (selectedChoice.kind === "disable") {
									void executeQuotaConfigCommand(dir, {
										kind: "disable",
										id: acc.id,
									}).then(async (res) => {
										if (res.ok) {
											await onApplyConfig(res.config);
											syncListValues();
											feedbackMessage = res.message;
										} else {
											feedbackMessage = res.error;
										}
										tui.requestRender();
									});
									return;
								}
								const { modelId, winId } = selectedChoice;
								void executeQuotaConfigCommand(dir, {
									kind: "enable",
									id: acc.id,
									model: modelId,
									...(winId ? { resetWindow: winId } : {}),
								}).then(async (res) => {
									if (res.ok) {
										await onApplyConfig(res.config);
										syncListValues();
										feedbackMessage = res.message;
									} else {
										feedbackMessage = res.error;
									}
									tui.requestRender();
								});
							};
							selectList.onCancel = () => subDone();
							return selectList;
						},
					});
				}

				list.push(
					{
						id: "action-refresh",
						label: "Refresh Quotas Now",
						description:
							"Request an immediate quota poll through the active maintenance owner",
						currentValue: "press Enter",
						values: ["press Enter"],
					},
					{
						id: "action-reload",
						label: "Reload Config File",
						description: `Reload settings from ${join(dir, "pi-quota-keeper.json")}`,
						currentValue: "press Enter",
						values: ["press Enter"],
					},
				);

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
					if (id === "action-refresh") {
						feedbackMessage = "Refreshing quotas through owner…";
						tui.requestRender();
						void onRefreshNow().then((ok) => {
							syncListValues();
							feedbackMessage = ok
								? "Quota state refreshed."
								: "Refresh not completed: owner unavailable or busy.";
							tui.requestRender();
						});
						return;
					}
					if (id === "action-reload") {
						feedbackMessage = "Reloading configuration from disk…";
						tui.requestRender();
						void onReloadConfig()
							.then(() => {
								syncListValues();
								feedbackMessage = "Reloaded pi-quota-keeper.json from disk.";
								tui.requestRender();
							})
							.catch((err: unknown) => {
								feedbackMessage =
									err instanceof Error
										? err.message
										: "Failed to reload config.";
								tui.requestRender();
							});
						return;
					}
					if (id !== "mode" && id !== "delayMs" && id !== "pollIntervalMs") {
						return;
					}
					void executeQuotaConfigCommand(dir, {
						kind: "config",
						key: id,
						value: newValue,
					}).then(async (res) => {
						if (res.ok) {
							await onApplyConfig(res.config);
							syncListValues();
							feedbackMessage = res.message;
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
				const cfg = getConfig();
				settingsList.updateValue("mode", cfg.mode);
				settingsList.updateValue("delayMs", String(cfg.delayMs));
				settingsList.updateValue("pollIntervalMs", String(cfg.pollIntervalMs));
				for (const acc of collectAccountIds()) {
					settingsList.updateValue(
						`account:${acc.id}`,
						formatAccountWakeValue(acc.id),
					);
				}
			};

			const container = new Container();
			container.addChild(new DynamicBorder((str) => theme.fg("accent", str)));
			container.addChild({
				render(width: number): string[] {
					const w = Math.max(20, width);
					const state = getState();
					const cfg = getConfig();
					const viewLines = formatQuotaView({
						snapshots: state.snapshots,
						ledger: state.ledger,
						schedule: state.schedule ?? cfg,
						owner: getOwnerActive(),
						problem: getProblem(),
						detailed: false,
					});
					const headerLines: string[] = [
						truncateToWidth(
							theme.bold(
								theme.fg("accent", "Quota Keeper · Quotas & Wake-up Settings"),
							),
							w,
						),
						...viewLines
							.slice(0, 12)
							.map((line) => truncateToWidth(theme.fg("muted", line), w)),
					];
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

	if (nextPanel) {
		await nextPanel.open(ctx);
	}
}
