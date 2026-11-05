import { createEventBus } from "@earendil-works/pi-coding-agent";
import { expect, it, vi } from "vitest";
import {
	DISCOVER_EVENT,
	discoverLoadedPanels,
	isDiscoverPayload,
} from "../src/discovery.ts";
import { createSettingsPanel, pluginSwitcherItem } from "../src/panels.ts";

const theme = { fg: (_token: string, text: string) => text };
it("interoperates with a baseline registration and removes only its caller subscription", () => {
	const bus = createEventBus();
	const first = bus.on(DISCOVER_EVENT, (payload) => {
		if (isDiscoverPayload(payload))
			payload.register({
				id: "a",
				title: "A",
				command: "/a",
				getSummary: () => "live",
				open: async () => {},
			});
	});
	const second = bus.on("pi-packages:ui:discover", (payload: unknown) => {
		(payload as { register: (value: unknown) => void }).register({
			id: "b",
			title: "B",
			command: "/b",
			getSummary: () => "live",
			open: async () => {},
		});
	});
	expect(discoverLoadedPanels(bus).map((panel) => panel.id)).toEqual([
		"a",
		"b",
	]);
	first();
	first();
	expect(discoverLoadedPanels(bus).map((panel) => panel.id)).toEqual(["b"]);
	second();
});
it("keeps panel callbacks, navigation, reload and values isolated per invocation", () => {
	const a = vi.fn(),
		b = vi.fn(),
		close = vi.fn(),
		tui = { requestRender: vi.fn() };
	const make = (onChange: typeof a) =>
		createSettingsPanel({
			tui,
			theme,
			items: [
				{
					id: "toggle",
					label: "Toggle",
					currentValue: "true",
					values: ["true", "false"],
				},
				{ id: "reload", label: "Reload", currentValue: "run", values: ["run"] },
			],
			onChange,
			onCancel: close,
			renderHeader: () => ["Fixture"],
		});
	const one = make(a),
		two = make(b);
	one.component.handleInput?.("\r");
	expect(a).toHaveBeenCalledWith("toggle", "false");
	expect(b).not.toHaveBeenCalled();
	one.settingsList.updateValue("toggle", "false");
	expect(two.component.render(80).join("\n")).toContain("true");
	one.component.handleInput?.("\x1b[B");
	one.component.handleInput?.("\r");
	expect(a).toHaveBeenLastCalledWith("reload", "run");
	one.component.handleInput?.("\x1b");
	expect(close).toHaveBeenCalled();
});
it("builds a switcher only for supplied loaded panels and opens the selected descriptor", async () => {
	const open = vi.fn(async () => {}),
		select = vi.fn();
	const item = pluginSwitcherItem(
		[
			{
				id: "peer",
				title: "Peer",
				command: "/peer",
				getSummary: () => "active",
				open,
			},
		],
		theme,
		select,
	);
	const done = vi.fn();
	const submenu = item.submenu?.("", done);
	submenu?.handleInput?.("\r");
	expect(done).toHaveBeenCalled();
	expect(select).toHaveBeenCalledWith(
		expect.objectContaining({ id: "peer", open }),
	);
});
