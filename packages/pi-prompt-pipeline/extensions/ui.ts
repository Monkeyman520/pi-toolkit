import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { type SettingItem, SettingsList } from "@earendil-works/pi-tui";
import type { LoadedConfig } from "./config.ts";
export const DISCOVER_EVENT = "pi-packages:ui:discover";
export interface Panel {
	id: string;
	title: string;
	command: string;
	getSummary(): string;
	open(ctx: ExtensionContext): Promise<void>;
}
export function registerDiscovery(payload: unknown, panel: Panel) {
	if (
		payload &&
		typeof payload === "object" &&
		"register" in payload &&
		typeof payload.register === "function"
	)
		payload.register(panel);
}
function panels(events: ExtensionAPI["events"]): Panel[] {
	const found = new Map<string, Panel>();
	events.emit(DISCOVER_EVENT, {
		register(panel: Panel) {
			if (
				panel &&
				typeof panel.id === "string" &&
				typeof panel.title === "string" &&
				typeof panel.open === "function" &&
				typeof panel.getSummary === "function"
			)
				found.set(panel.id, panel);
		},
	});
	return [...found.values()].filter((p) => p.id !== "pi-prompt-pipeline");
}
export type PanelChoice = { id: string; value: string } | undefined;
export async function settingsPanel(
	ctx: ExtensionContext,
	events: ExtensionAPI["events"],
	config: LoadedConfig,
	pending: string,
): Promise<PanelChoice> {
	const others = panels(events);
	const choice = await ctx.ui.custom<PanelChoice>((tui, theme, _kb, done) => {
		const items: SettingItem[] = [
			{
				id: "logging",
				label: "Logging",
				currentValue: config.logging,
				values: ["silent", "error", "info"],
			},
			{
				id: "antigravityCompat",
				label: "Antigravity compatibility preset",
				currentValue: String(config.antigravityCompat),
				values: ["false", "true"],
				description:
					"Opt-in agent intro/docs changes; not a guarantee against 429.",
			},
			...(
				[
					"agent.before",
					"agent.after",
					"request.before",
					"request.after",
				] as const
			).map((point) => ({
				id: point,
				label: `Persistent export ${point}`,
				currentValue: String(config.export.points.includes(point)),
				values: ["false", "true"],
			})),
			...others.map((p) => ({
				id: `panel:${p.id}`,
				label: p.title,
				currentValue: p.getSummary(),
				values: ["open"],
				description: p.command,
			})),
		];
		const list = new SettingsList(
			items,
			Math.min(items.length + 2, 14),
			{
				label: (s, selected) => theme.fg(selected ? "accent" : "text", s),
				value: (s, selected) => theme.fg(selected ? "accent" : "muted", s),
				description: (s) => theme.fg("dim", s),
				cursor: theme.fg("accent", "› "),
				hint: (s) => theme.fg("dim", s),
			},
			(id, value) => done({ id, value }),
			() => done(undefined),
			{ enableSearch: true },
		);
		return {
			capturesViewportInput: list.capturesViewportInput,
			render(width) {
				return [
					theme.fg("accent", "Prompt Pipeline"),
					theme.fg(
						"dim",
						`Rules: ${config.rules.length}; pending capture: ${pending}`,
					),
					theme.fg(
						"dim",
						"Writes global settings; trusted project values may override them.",
					),
					...list.render(width),
				];
			},
			invalidate() {
				list.invalidate();
			},
			handleInput(data) {
				list.handleInput(data);
				tui.requestRender();
			},
		};
	});
	if (choice?.id.startsWith("panel:")) {
		const panel = others.find((p) => p.id === choice.id.slice(6));
		if (panel) await panel.open(ctx);
		return;
	}
	return choice;
}
