import { visibleWidth } from "@earendil-works/pi-tui";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getDefaultConfig } from "../extensions/config-schema.ts";
import { createInitialState } from "../extensions/state.ts";
import { buildTreeIndex } from "../extensions/tree-index.ts";
import { SessionTreeComponent } from "../extensions/tui.ts";

afterEach(() => vi.useRealTimers());
describe("remediation: effective view settings", () => {
	it("hides details/context when toggled and makes layout observably compact", () => {
		const state = createInitialState("settings", { selectedEntryId: "u" });
		const component = new SessionTreeComponent({
			state,
			index: buildTreeIndex([
				{
					id: "u",
					parentId: null,
					type: "message",
					timestamp: "T0",
					message: { role: "user", content: "long visible prompt" },
				},
			]),
			tui: { requestRender() {} },
			theme: {},
			done() {},
		});
		expect(component.render(100).join("\n")).toContain("Selected:");
		component.handleInput("d");
		component.handleInput("c");
		const compact = component.render(100).join("\n");
		expect(compact).not.toContain("Selected:");
		expect(compact).not.toContain("Context:");
		component.dispose();
	});
	it("uses configured exact case-sensitive search and result limit", () => {
		vi.useFakeTimers();
		const cfg = getDefaultConfig();
		cfg.search.mode = "exact";
		cfg.search.caseSensitive = true;
		cfg.search.maxResults = 1;
		cfg.performance.searchDebounceMs = 0;
		const state = createInitialState("settings", { selectedEntryId: "one" });
		const component = new SessionTreeComponent({
			state,
			index: buildTreeIndex([
				{
					id: "one",
					parentId: null,
					type: "message",
					timestamp: "T0",
					message: { role: "user", content: "NEEDLE" },
				},
				{
					id: "two",
					parentId: "one",
					type: "message",
					timestamp: "T1",
					message: { role: "user", content: "needle" },
				},
			]),
			tui: { requestRender() {} },
			theme: {},
			done() {},
			config: cfg,
		});
		for (const key of ["/", ..."needle"]) component.handleInput(key);
		vi.runAllTimers();
		expect(state.searchResults.map((r) => r.id)).toEqual(["two"]);
		component.dispose();
	});
	it("keeps compound root/current markers and bounds every rendered line", () => {
		const state = createInitialState("view", {
			selectedEntryId: "u",
			sessionLeafId: "u",
		});
		const component = new SessionTreeComponent({
			state,
			index: buildTreeIndex([
				{
					id: "u",
					parentId: null,
					type: "message",
					timestamp: "T0",
					message: { role: "user", content: "wide text" },
				},
			]),
			tui: { requestRender() {} },
			theme: {},
			done() {},
		});
		expect(component.render(100).join("\n")).toMatch(/●.*◉/);
		for (const width of [12, 32])
			for (const line of component.render(width))
				expect(visibleWidth(line)).toBeLessThanOrEqual(width);
		component.dispose();
	});
	it("focuses the active branch even when it is already selected", () => {
		const index = buildTreeIndex([
			{ id: "r", parentId: null, type: "message", timestamp: "T0" },
			{ id: "a", parentId: "r", type: "message", timestamp: "T1" },
		]);
		const state = createInitialState("focus", {
			selectedEntryId: "a",
			sessionLeafId: "a",
			focusedPathIds: new Set(["r"]),
		});
		const component = new SessionTreeComponent({
			state,
			index,
			tui: { requestRender() {} },
			theme: {},
			done() {},
		});
		component.dispatch("branch.active");
		expect(state.focusedPathIds.has("a")).toBe(true);
		component.dispose();
	});
	it("does not schedule any estimation when context is disabled", () => {
		vi.useFakeTimers();
		const config = getDefaultConfig();
		config.context.enabled = false;
		const state = createInitialState("disabled", { selectedEntryId: "u" });
		const component = new SessionTreeComponent({
			state,
			index: buildTreeIndex([
				{
					id: "u",
					parentId: null,
					type: "message",
					timestamp: "T0",
					message: { role: "user", content: "text" },
				},
			]),
			config,
			tui: { requestRender() {} },
			theme: {},
			done() {},
		});
		component.render(120);
		expect(vi.getTimerCount()).toBe(0);
		component.dispose();
	});
	it("does not reset view choices or search toggles when unrelated configuration changes", () => {
		const state = createInitialState("preserve", { selectedEntryId: "u" });
		const component = new SessionTreeComponent({
			state,
			index: buildTreeIndex([
				{
					id: "u",
					parentId: null,
					type: "message",
					timestamp: "T0",
					message: { role: "user", content: "x" },
				},
			]),
			tui: { requestRender() {} },
			theme: {},
			done() {},
		});
		component.dispatch("filter.toggleAssistant");
		component.dispatch("search.toggleRegex");
		state.foldOptions.mode = "all";
		const config = getDefaultConfig();
		config.vimMode = false;
		component.applyConfiguration(config);
		expect(state.displayOptions.showAssistantNodes).toBe(true);
		expect(state.searchRegex).toBe(true);
		expect(state.foldOptions.mode).toBe("all");
		component.dispose();
	});
});
