import { DynamicBorder, type Theme } from "@earendil-works/pi-coding-agent";
import {
	type Component,
	Container,
	type SelectItem,
	SelectList,
	type SettingItem,
	SettingsList,
	type SettingsListTheme,
	type TUI,
} from "@earendil-works/pi-tui";
import type { PluginUiDescriptor } from "./discovery.ts";

type PanelTheme = Pick<Theme, "fg">;
export function selectListTheme(theme: PanelTheme) {
	return {
		selectedPrefix: (text: string) => theme.fg("accent", text),
		selectedText: (text: string) => theme.fg("accent", text),
		description: (text: string) => theme.fg("muted", text),
		scrollInfo: (text: string) => theme.fg("dim", text),
		noMatch: (text: string) => theme.fg("warning", text),
	};
}

/** Callers provide only the other currently loaded panels; no catalog or registration is retained. */
export function pluginSwitcherItem(
	panels: readonly PluginUiDescriptor[],
	theme: PanelTheme,
	onSelect: (target: PluginUiDescriptor) => void,
): SettingItem {
	return {
		id: "switch-plugin",
		label: "Switch Installed Plugin",
		description:
			"Open another installed collection plugin's TUI settings panel",
		currentValue: `${panels.length} installed`,
		submenu: (_current, subDone) => {
			const items: SelectItem[] = panels.map((panel) => ({
				value: panel.id,
				label: `${panel.title} (${panel.command})`,
				description: panel.getSummary(),
			}));
			const list = new SelectList(
				items,
				Math.min(items.length + 1, 8),
				selectListTheme(theme),
			);
			list.onSelect = (item) => {
				const target = panels.find((panel) => panel.id === item.value);
				subDone();
				if (target) onSelect(target);
			};
			list.onCancel = () => subDone();
			return list;
		},
	};
}

export interface SettingsPanelOptions {
	tui: Pick<TUI, "requestRender">;
	theme: PanelTheme;
	items: SettingItem[];
	onChange: (id: string, value: string) => void;
	onCancel: () => void;
	renderHeader: (width: number) => string[];
}

/** No lifecycle ownership: the invoking custom UI owns this component and all domain callbacks. */
export function createSettingsPanel(options: SettingsPanelOptions): {
	settingsList: SettingsList;
	component: Component;
} {
	const { tui, theme, items, onChange, onCancel, renderHeader } = options;
	const listTheme: SettingsListTheme = {
		label: (text, selected) =>
			selected ? theme.fg("accent", text) : theme.fg("text", text),
		value: (text, selected) =>
			selected ? theme.fg("accent", text) : theme.fg("muted", text),
		description: (text) => theme.fg("dim", text),
		cursor: theme.fg("accent", "› "),
		hint: (text) => theme.fg("dim", text),
	};
	const settingsList = new SettingsList(
		items,
		Math.min(items.length + 2, 14),
		listTheme,
		onChange,
		onCancel,
		{ enableSearch: true },
	);
	const container = new Container();
	container.addChild(new DynamicBorder((text) => theme.fg("accent", text)));
	container.addChild({ render: renderHeader, invalidate() {} });
	container.addChild(settingsList);
	container.addChild(new DynamicBorder((text) => theme.fg("accent", text)));
	const component: Component = {
		capturesViewportInput: settingsList.capturesViewportInput,
		render: (width) => container.render(width),
		invalidate: () => container.invalidate(),
		handleInput: (data) => {
			settingsList.handleInput(data);
			tui.requestRender();
		},
	};
	return { settingsList, component };
}
