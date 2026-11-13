import { describe, expect, it, vi } from "vitest";
import {
	createActionRegistry,
	getDefaultKeybindings,
} from "../extensions/actions.ts";
import { getDefaultConfig } from "../extensions/config-schema.ts";
import { KeyResolver, validateKeymap } from "../extensions/keymap.ts";
import { createInitialState } from "../extensions/state.ts";
import { buildTreeIndex } from "../extensions/tree-index.ts";
import { SessionTreeComponent } from "../extensions/tui.ts";

function fixture() {
	const state = createInitialState("input", {
		selectedEntryId: "u",
		sessionLeafId: "u",
	});
	const done = vi.fn();
	const component = new SessionTreeComponent({
		state,
		index: buildTreeIndex([
			{
				id: "u",
				parentId: null,
				type: "message",
				timestamp: "T0",
				message: { role: "user", content: "needle" },
			},
		]),
		tui: { requestRender() {} },
		theme: {},
		done,
	});
	return { state, done, component };
}
describe("remediation: authoritative input", () => {
	it("does not fork or navigate from Preview or Help, including direct dispatch", () => {
		const { component, done } = fixture();
		component.handleInput("p");
		component.handleInput("f");
		component.dispatch("session.navigate");
		expect(done).not.toHaveBeenCalled();
		component.handleInput("p");
		component.handleInput("?");
		component.handleInput("f");
		expect(done).not.toHaveBeenCalled();
	});
	it("clears an accepted query on normal Escape rather than closing", () => {
		const { component, state, done } = fixture();
		state.searchQuery = "needle";
		state.temporaryRevealedIds.add("u");
		component.handleInput("\u001b");
		expect(state.searchQuery).toBe("");
		expect(state.temporaryRevealedIds.size).toBe(0);
		expect(done).not.toHaveBeenCalled();
	});
	it("derives defaults from the catalog without same-mode duplicates", () => {
		const registry = createActionRegistry(),
			bindings = getDefaultKeybindings();
		for (const action of registry.values())
			expect(bindings[action.id]).toEqual(action.defaultKeys);
		expect(
			validateKeymap(bindings).filter((d) => d.type === "duplicate"),
		).toEqual([]);
	});
	it("resets prefixes on mode change", () => {
		const resolver = new KeyResolver({
			bindings: { "node.root": ["gg"], "search.open": ["/"] },
			vimMode: true,
		});
		expect(resolver.handleInput("g", "normal").type).toBe("prefix");
		resolver.handleInput("x", "search");
		expect(resolver.handleInput("g", "normal").type).toBe("prefix");
		resolver.reset();
	});
	it("reports invalid modifier descriptions and accepts printable Unicode search text", () => {
		expect(
			validateKeymap({ "node.next": ["ctrl+bad"] }).some(
				(d) => d.type === "invalid",
			),
		).toBe(true);
		const resolver = new KeyResolver({
			bindings: getDefaultKeybindings(),
			vimMode: true,
		});
		expect(resolver.handleInput("你好🙂", "search")).toEqual({
			type: "text",
			text: "你好🙂",
		});
	});
	it("resolves named keys, modifier aliases and explicit search remaps through the same registry", () => {
		const named = new KeyResolver({
			bindings: { "node.root": ["home"], "node.next": ["shift+a"] },
			vimMode: true,
		});
		expect(named.handleInput("\u001b[H", "normal")).toEqual({
			type: "action",
			actionId: "node.root",
		});
		expect(named.handleInput("A", "normal")).toEqual({
			type: "action",
			actionId: "node.next",
		});
		const search = new KeyResolver({
			bindings: { "search.clear": ["x"] },
			vimMode: true,
		});
		expect(search.handleInput("x", "search")).toEqual({
			type: "action",
			actionId: "search.clear",
		});
	});
	it("shows effective rather than stale default footer hints", () => {
		const { component } = fixture();
		const config = getDefaultConfig();
		config.keybindings["session.navigate"] = ["ctrl+g"];
		component.applyConfiguration(config);
		const rendered = component.render(140).join("\n");
		expect(rendered).toContain("ctrl+g Go");
		expect(rendered).not.toContain("Enter Go");
		component.dispose();
	});
	it("routes the settings shortcut through mode-qualified configurable Actions", async () => {
		const config = getDefaultConfig();
		config.keybindings["view.settings"] = ["ctrl+s"];
		const open = vi.fn(async () => config),
			component = new SessionTreeComponent({
				state: createInitialState("settings", { selectedEntryId: "u" }),
				index: buildTreeIndex([
					{
						id: "u",
						parentId: null,
						type: "message",
						timestamp: "T0",
						message: { role: "user", content: "x" },
					},
				]),
				config,
				onOpenSettings: open,
				tui: { requestRender() {} },
				theme: {},
				done() {},
			});
		component.dispatch("view.settings");
		expect(open).not.toHaveBeenCalled();
		component.handleInput("?");
		component.handleInput("s");
		expect(open).not.toHaveBeenCalled();
		component.handleInput("\u0013");
		await component.whenSettled();
		expect(open).toHaveBeenCalledOnce();
		expect(component.render(180).join("\n")).toContain("ctrl+s Settings");
		component.dispose();
	});
});
