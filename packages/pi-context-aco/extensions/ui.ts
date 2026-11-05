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
import { type Config, options, settingKey } from "./config.ts";

export async function openPanel(params: {
	ctx: ExtensionContext;
	events: ExtensionAPI["events"];
	config: Config;
	summary: () => string;
	recommendation: () => string;
	onUpdated: () => void;
	isCurrent: () => boolean;
}) {
	const { ctx, events, config, summary, recommendation, onUpdated, isCurrent } =
		params;
	const others = discoverLoadedPanels(events).filter(
		(p) => p.id !== "pi-context-aco",
	);
	const selected = await ctx.ui.custom<PluginUiDescriptor | undefined>(
		(tui, theme, _keys, done) => {
			let feedback = "";
			const items: SettingItem[] = Object.entries(options).map(
				([key, option]) => ({
					id: key,
					label: key,
					description: option.description,
					currentValue: String(config.settings[key as keyof typeof options]),
					values: [...option.values],
				}),
			);
			if (others.length)
				items.push(pluginSwitcherItem(others, theme, (target) => done(target)));
			const panel = createSettingsPanel({
				tui,
				theme,
				items,
				onCancel: () => done(undefined),
				onChange: (id, value) => {
					if (!isCurrent()) return;
					const key = settingKey(id);
					if (!key) return;
					feedback = "Saving…";
					tui.requestRender();
					void config
						.set(key, value)
						.then(() => {
							if (!isCurrent()) return;
							feedback = `Saved ${key}=${value}`;
							for (const k of Object.keys(options) as (keyof typeof options)[])
								panel.settingsList.updateValue(k, String(config.settings[k]));
							onUpdated();
							tui.requestRender();
						})
						.catch((error) => {
							if (!isCurrent()) return;
							feedback = `Not saved: ${error instanceof Error ? error.message : String(error)}`;
							for (const k of Object.keys(options) as (keyof typeof options)[])
								panel.settingsList.updateValue(k, String(config.settings[k]));
							tui.requestRender();
						});
				},
				renderHeader: (width) => [
					truncateToWidth(
						theme.fg("accent", "ACO · V1 Status & Settings"),
						width,
					),
					truncateToWidth(summary(), width),
					truncateToWidth(recommendation(), width),
					truncateToWidth(
						config.settings.mode === "compact"
							? "V3 requires confirmation or scoped /aco authorize; safety/budgets always apply"
							: config.settings.mode === "exact-prune"
								? "V2 recovery-gated pruning; V3 requires compact mode"
								: "V1 observation only; no strategy permission",
						width,
					),
					truncateToWidth(config.error ?? feedback, width),
					"",
				],
			});
			return panel.component;
		},
	);
	if (selected && isCurrent()) await selected.open(ctx);
}
