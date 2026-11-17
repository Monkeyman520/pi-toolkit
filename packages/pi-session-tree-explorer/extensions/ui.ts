import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import {
	type SettingItem,
	truncateToWidth,
	visibleWidth,
} from "@earendil-works/pi-tui";
import {
	DISCOVER_EVENT,
	discoverLoadedPanels,
	isDiscoverPayload,
	type PluginUiDescriptor,
} from "pi-plugin-support/discovery";
import {
	createSettingsPanel,
	pluginSwitcherItem,
} from "pi-plugin-support/panels";
import type { ConfigManager } from "./config.ts";

export const SELF_PLUGIN_ID = "pi-session-tree-explorer";

export interface ResponsiveLayoutMetrics {
	mode: "dual-pane" | "single-pane";
	totalWidth: number;
	outlineWidth: number;
	previewWidth: number;
}

export function computeResponsiveLayout(
	columns: number,
): ResponsiveLayoutMetrics {
	const totalWidth = Math.max(1, Math.floor(columns));
	if (totalWidth >= 100) {
		const outlineWidth = Math.floor(totalWidth * 0.6);
		const previewWidth = Math.max(1, totalWidth - outlineWidth - 1);
		return {
			mode: "dual-pane",
			totalWidth,
			outlineWidth,
			previewWidth,
		};
	}
	return {
		mode: "single-pane",
		totalWidth,
		outlineWidth: totalWidth,
		previewWidth: totalWidth,
	};
}

export function padToWidth(line: string, width: number): string {
	const safeWidth = Math.max(1, Math.floor(width));
	const truncated = truncateToWidth(line, safeWidth);
	const w = visibleWidth(truncated);
	return w < safeWidth ? `${truncated}${" ".repeat(safeWidth - w)}` : truncated;
}

export function renderDualPane(
	leftLines: string[],
	rightLines: string[],
	layout: ResponsiveLayoutMetrics,
): string[] {
	const height = Math.max(leftLines.length, rightLines.length);
	const combined: string[] = [];
	for (let i = 0; i < height; i++) {
		const left = padToWidth(leftLines[i] ?? "", layout.outlineWidth);
		const right = padToWidth(rightLines[i] ?? "", layout.previewWidth);
		combined.push(truncateToWidth(`${left}│${right}`, layout.totalWidth));
	}
	return combined;
}
export async function openSessionTreeSettingsPanel(params: {
	ctx: ExtensionContext;
	events: ExtensionAPI["events"];
	configManager: ConfigManager;
	onConfigChanged?: () => void;
}): Promise<void> {
	const { ctx, events, configManager, onConfigChanged } = params;
	const config = configManager.getConfig();
	let pending: Promise<unknown> = Promise.resolve();

	// Installed-only discovery over pi.events per ADR 0004/0005
	const loadedPanels = discoverLoadedPanels(events);
	const siblingPanels = loadedPanels.filter((p) => p.id !== SELF_PLUGIN_ID);

	const items: SettingItem[] = [
		{
			id: "vimMode",
			label: "Vim Navigation Mode",
			description:
				"Enable Vim keys (j, k, H, L, etc.) vs arrow-only navigation",
			currentValue: String(config.vimMode),
			values: ["true", "false"],
		},
		{
			id: "fold.mode",
			label: "Fold Policy Mode",
			description: "Default branch folding behavior in Explorer",
			currentValue: config.fold.mode,
			values: [
				"focused-only",
				"smart",
				"all",
				"active-only",
				"depth-limited",
				"manual",
			],
		},
		{
			id: "display.showAssistantNodes",
			label: "Show Assistant Messages",
			description: "Display model responses in tree (default false)",
			currentValue: String(config.display.showAssistantNodes),
			values: ["true", "false"],
		},
		{
			id: "display.showToolNodes",
			label: "Show Tool Result Nodes",
			description: "Display tool result outputs in tree (default false)",
			currentValue: String(config.display.showToolNodes),
			values: ["true", "false"],
		},
		{
			id: "display.showThinkingNodes",
			label: "Show Thinking Content",
			description: "Display model reasoning/thinking text (default false)",
			currentValue: String(config.display.showThinkingNodes),
			values: ["true", "false"],
		},
		{
			id: "display.depthMode",
			label: "Depth Metric Mode",
			description:
				"Depth calculation display (turn user count, raw edges, branch forks)",
			currentValue: config.display.depthMode,
			values: ["turn", "raw", "branch"],
		},
		{
			id: "display.showDepth",
			label: "Show Depth Badges",
			description: "Display depth column (D0, D1, D2...) in tree rows",
			currentValue: String(config.display.showDepth),
			values: ["true", "false"],
		},
	];

	if (siblingPanels.length > 0) {
		items.push(
			pluginSwitcherItem(
				siblingPanels,
				{ fg: (_color, text) => text },
				async (target: PluginUiDescriptor) => {
					await target.open(ctx);
				},
			),
		);
	}

	await ctx.ui.custom<void>((tui, theme, _kb, done) => {
		const { component } = createSettingsPanel({
			tui,
			theme,
			items,
			onChange: (id: string, newValue: string) => {
				let parsedVal: unknown = newValue;
				if (newValue === "true") parsedVal = true;
				else if (newValue === "false") parsedVal = false;

				pending = configManager
					.updateSetting(id, parsedVal)
					.then(() => {
						onConfigChanged?.();
					})
					.catch((error) => ctx.ui.notify(String(error), "error"));
			},
			onCancel: () => done(undefined),
			renderHeader: (_width: number) => [
				"SESSION TREE EXPLORER - SETTINGS",
				`Config: ${configManager.getGlobalPath()}`,
			],
		});
		return component;
	});
	await pending;
}

export { DISCOVER_EVENT, isDiscoverPayload, type PluginUiDescriptor };
