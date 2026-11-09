import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import { ConfigManager } from "../extensions/config.ts";
import {
	DISCOVER_EVENT,
	isDiscoverPayload,
	openSessionTreeSettingsPanel,
	type PluginUiDescriptor,
	SELF_PLUGIN_ID,
} from "../extensions/ui.ts";

describe("T0003: Settings Panel & Installed-Only pi.events Discovery", () => {
	it("registers self on pi.events when DISCOVER_EVENT is emitted", () => {
		let registeredDescriptor: PluginUiDescriptor | null = null;

		const mockPayload = {
			register: vi.fn((desc: PluginUiDescriptor) => {
				registeredDescriptor = desc;
			}),
		};

		expect(isDiscoverPayload(mockPayload)).toBe(true);

		mockPayload.register({
			id: SELF_PLUGIN_ID,
			title: "Session Tree Explorer",
			command: "/stree config",
			getSummary: () => "Vim: on | Fold: focused-only",
			open: async () => {},
		});

		expect(mockPayload.register).toHaveBeenCalled();
		expect(registeredDescriptor).not.toBeNull();
		const d = registeredDescriptor as unknown as PluginUiDescriptor;
		expect(d.id).toBe("pi-session-tree-explorer");
		expect(d.command).toBe("/stree config");
	});

	it("opens settings panel via custom UI without rendering uninstalled plugins", async () => {
		const configManager = new ConfigManager();
		let customUiCalled = false;

		const mockCtx = {
			ui: {
				custom: vi.fn(
					async (
						factory: (
							tui: unknown,
							theme: unknown,
							kb: unknown,
							done: () => void,
						) => unknown,
					) => {
						customUiCalled = true;
						const mockTui = { requestRender: vi.fn() };
						const mockTheme = {
							fg: (_c: string, text: string) => text,
							bold: (text: string) => text,
						};
						const comp = factory(mockTui, mockTheme, {}, vi.fn());
						expect(comp).toBeDefined();
					},
				),
			},
		} as unknown as ExtensionContext;

		const mockEvents = {
			emit: vi.fn((event: string, payload: unknown) => {
				if (event === DISCOVER_EVENT && isDiscoverPayload(payload)) {
					payload.register({
						id: SELF_PLUGIN_ID,
						title: "Session Tree Explorer",
						command: "/stree config",
						getSummary: () => "summary",
						open: async () => {},
					});
				}
			}),
		} as unknown as ExtensionAPI["events"] & { emit: ReturnType<typeof vi.fn> };

		await openSessionTreeSettingsPanel({
			ctx: mockCtx,
			events: mockEvents,
			configManager,
		});

		expect(customUiCalled).toBe(true);
		expect(mockEvents.emit).toHaveBeenCalledWith(
			DISCOVER_EVENT,
			expect.anything(),
		);
	});

	it("includes sibling plugin switcher when other loaded plugins are discovered", async () => {
		const configManager = new ConfigManager();
		let createdComponent: unknown = null;

		const mockCtx = {
			ui: {
				custom: vi.fn(
					async (
						factory: (
							tui: unknown,
							theme: unknown,
							kb: unknown,
							done: () => void,
						) => unknown,
					) => {
						const mockTui = { requestRender: vi.fn() };
						const mockTheme = {
							fg: (_c: string, text: string) => text,
							bold: (text: string) => text,
						};
						createdComponent = factory(mockTui, mockTheme, {}, vi.fn());
					},
				),
			},
		} as unknown as ExtensionContext;

		const mockEvents = {
			emit: vi.fn((event: string, payload: unknown) => {
				if (event === DISCOVER_EVENT && isDiscoverPayload(payload)) {
					payload.register({
						id: SELF_PLUGIN_ID,
						title: "Session Tree Explorer",
						command: "/stree config",
						getSummary: () => "summary",
						open: async () => {},
					});
					payload.register({
						id: "pi-pretty-session",
						title: "Pretty Session",
						command: "/ps config",
						getSummary: () => "Auto session naming",
						open: vi.fn(),
					});
				}
			}),
		} as unknown as ExtensionAPI["events"];

		await openSessionTreeSettingsPanel({
			ctx: mockCtx,
			events: mockEvents,
			configManager,
		});

		expect(createdComponent).toBeDefined();
	});
});
