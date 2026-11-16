import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { expect, it } from "vitest";
import { loadConfig } from "../extensions/config.ts";
import { settingsPanel } from "../extensions/ui.ts";

it("renders actual SettingsList and handles keyboard choice; discovers only loaded panels", async () => {
	const config = await loadConfig(
		"unused-test-agent",
		"unused-test-cwd",
		false,
	);
	let frame: string[] = [];
	const events = {
		emit: (_name: string, payload: { register: (panel: unknown) => void }) => {
			payload.register({
				id: "loaded",
				title: "Loaded Plugin",
				command: "/loaded config",
				getSummary: () => "active",
				open: async () => {},
			});
		},
	} as unknown as ExtensionAPI["events"];
	const ctx = {
		ui: {
			custom: async (
				factory: (
					tui: { requestRender(): void },
					theme: { fg(color: string, text: string): string },
					kb: object,
					done: (value: unknown) => void,
				) => {
					render(width: number): string[];
					handleInput(data: string): void;
				},
			) =>
				new Promise((resolve) => {
					const component = factory(
						{ requestRender: () => {} },
						{ fg: (_color: string, s: string) => s },
						{},
						resolve,
					);
					frame = component.render(120);
					component.handleInput("\r");
				}),
		},
	} as unknown as ExtensionContext;
	expect(await settingsPanel(ctx, events, config, "agent before")).toEqual({
		id: "logging",
		value: "info",
	});
	expect(frame.join("\n")).toContain("Loaded Plugin");
	expect(frame.join("\n")).not.toContain("Auto Resume");
	expect(frame.join("\n")).toContain("agent before");
});
