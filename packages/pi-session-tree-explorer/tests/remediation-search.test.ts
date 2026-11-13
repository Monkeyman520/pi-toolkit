import { afterEach, describe, expect, it, vi } from "vitest";
import {
	buildSearchIndex,
	executeSearch,
	extractContentText,
	extractFullText,
} from "../extensions/search.ts";
import { createInitialState } from "../extensions/state.ts";
import { buildTreeIndex } from "../extensions/tree-index.ts";
import { SessionTreeComponent } from "../extensions/tui.ts";

afterEach(() => vi.useRealTimers());
describe("remediation: keyboard search", () => {
	it("types, accepts and clears a hidden full-text hit without navigation", () => {
		vi.useFakeTimers();
		const index = buildTreeIndex([
			{
				id: "u",
				parentId: null,
				type: "message",
				timestamp: "T0",
				message: { role: "user", content: "root" },
			},
			{
				id: "a",
				parentId: "u",
				type: "message",
				timestamp: "T1",
				message: { role: "assistant", content: "hidden needle beyond summary" },
			},
		]);
		const state = createInitialState("search", { selectedEntryId: "u" }),
			done = vi.fn();
		const component = new SessionTreeComponent({
			state,
			index,
			tui: { requestRender() {} },
			theme: {},
			done,
		});
		for (const key of ["/", ..."needle"]) component.handleInput(key);
		vi.advanceTimersByTime(100);
		expect(state.searchResults.map((r) => r.id)).toEqual(["a"]);
		expect(component.render(100).join("\n")).toContain("hidden needle");
		component.handleInput("\r");
		expect(state.mode).toBe("normal");
		expect(done).not.toHaveBeenCalled();
		component.handleInput("\u001b");
		expect(state.searchQuery).toBe("");
		expect(state.selectedEntryId).toBe("u");
		expect(component.getVisibleNodes().some((n) => n.id === "a")).toBe(false);
		component.dispose();
	});
	it("cancels pending queries and restores prior result identity", () => {
		vi.useFakeTimers();
		const index = buildTreeIndex([
			{
				id: "u",
				parentId: null,
				type: "message",
				timestamp: "T0",
				message: { role: "user", content: "old" },
			},
		]);
		const state = createInitialState("search", { selectedEntryId: "u" });
		const component = new SessionTreeComponent({
			state,
			index,
			tui: { requestRender() {} },
			theme: {},
			done() {},
		});
		for (const key of ["/", ..."old"]) component.handleInput(key);
		vi.advanceTimersByTime(100);
		component.handleInput("\r");
		for (const key of ["/", ..."new"]) component.handleInput(key);
		component.handleInput("\u001b");
		vi.runAllTimers();
		expect(state.searchQuery).toBe("old");
		expect(state.searchResults.map((r) => r.id)).toEqual(["u"]);
		component.dispose();
	});
});
describe("search index complexity", () => {
	it("derives branch roots with bounded parent lookups rather than walking every ancestor", () => {
		const entries = Array.from({ length: 1000 }, (_, i) => ({
			id: `n${i}`,
			parentId: i ? `n${i - 1}` : null,
			type: "message",
			timestamp: "T0",
			message: { role: "user", content: "text" },
		}));
		const index = buildTreeIndex(entries);
		const parent = vi.spyOn(index.parentById, "get");
		expect(buildSearchIndex(index)).toHaveLength(1000);
		expect(parent.mock.calls.length).toBeLessThan(entries.length * 4);
	});
	it("indexes deep focused subtrees iteratively and retains thinking/tool argument text", () => {
		const entries = Array.from({ length: 20000 }, (_, i) => ({
			id: `deep${i}`,
			parentId: i ? `deep${i - 1}` : null,
			type: "message",
			timestamp: "T0",
			message: { role: "user", content: "needle" },
		}));
		const index = buildTreeIndex(entries);
		expect(
			executeSearch(
				"needle",
				buildSearchIndex(index),
				{
					mode: "exact",
					scope: "focused-subtree",
					focusedBranchId: "deep0",
					caseSensitive: false,
					maxResults: 10,
				},
				index,
			),
		).toHaveLength(10);
		const entry = {
			id: "private-id",
			parentId: null,
			type: "message",
			timestamp: "T0",
			message: {
				role: "assistant",
				content: [
					{ type: "thinking", thinking: "reasoning needle" },
					{
						type: "toolCall",
						name: "lookup",
						arguments: { symbol: "argument needle" },
					},
					{ type: "text", text: "answer" },
				],
			},
		};
		const text = extractContentText(entry);
		expect(text).toContain("reasoning needle");
		expect(text).toContain("argument needle");
		expect(text).not.toContain("private-id");
		expect(extractFullText(entry)).toContain("reasoning needle");
	});
});
