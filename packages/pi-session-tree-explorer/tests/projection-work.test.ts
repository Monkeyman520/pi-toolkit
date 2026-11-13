import { describe, expect, it, vi } from "vitest";
import { createInitialState } from "../extensions/state.ts";
import { buildTreeIndex } from "../extensions/tree-index.ts";
import { SessionTreeComponent } from "../extensions/tui.ts";

describe("affected projection work", () => {
	it("keeps the projection across branch focus changes when the fold policy does not use focus", () => {
		const index = buildTreeIndex(
			[
				["r", null],
				["a", "r"],
				["b", "r"],
			].map(([id, parentId]) => ({
				id: id ?? "",
				parentId: parentId ?? null,
				type: "message",
				timestamp: "T0",
				message: { role: "user", content: id },
			})),
		);
		const state = createInitialState("focus", {
			selectedEntryId: "a",
			focusedPathIds: new Set(["r", "a"]),
		});
		state.foldOptions.mode = "all";
		const component = new SessionTreeComponent({
			state,
			index,
			tui: { requestRender() {} },
			theme: {},
			done() {},
		});
		const first = component.getVisibleNodes();
		component.handleInput("]");
		component.handleInput("b");
		expect(state.selectedEntryId).toBe("b");
		expect(state.focusedPathIds.has("b")).toBe(true);
		expect(component.getVisibleNodes()).toBe(first);
		component.dispose();
	});
	it("reuses immutable summaries across reprojection but invalidates them with snapshot revision", () => {
		const message = {
				role: "user",
				get content() {
					return "stable content";
				},
			},
			read = vi.spyOn(message, "content", "get");
		const index = buildTreeIndex([
				{ id: "r", parentId: null, type: "message", timestamp: "T0", message },
			]),
			state = createInitialState("summary", { selectedEntryId: "r" });
		const component = new SessionTreeComponent({
			state,
			index,
			tui: { requestRender() {} },
			theme: {},
			done() {},
		});
		component.getVisibleNodes();
		read.mockClear();
		state.displayOptions.depthMode = "raw";
		component.getVisibleNodes();
		expect(read).not.toHaveBeenCalled();
		index.entryById.set("r", {
			id: "r",
			parentId: null,
			type: "message",
			timestamp: "T0",
			message: { role: "user", content: "changed content" },
		});
		component.replaceSnapshot({
			sessionId: "summary",
			leafId: "r",
			revision: 2,
			index,
		});
		expect(component.getVisibleNodes()[0].summaryText).toBe("changed content");
		component.dispose();
	});
	it("still updates focus-sensitive folds and independently caches thinking summaries", () => {
		const index = buildTreeIndex([
			{
				id: "r",
				parentId: null,
				type: "message",
				timestamp: "T0",
				message: { role: "user", content: "root" },
			},
			{
				id: "a",
				parentId: "r",
				type: "message",
				timestamp: "T0",
				message: {
					role: "assistant",
					content: [
						{ type: "text", text: "answer" },
						{ type: "thinking", thinking: "reasoning" },
					],
				},
			},
			{
				id: "b",
				parentId: "r",
				type: "message",
				timestamp: "T0",
				message: { role: "user", content: "branch" },
			},
		]);
		const state = createInitialState("sensitive", {
			selectedEntryId: "a",
			focusedPathIds: new Set(["r", "a"]),
		});
		state.displayOptions.showAssistantNodes = true;
		const component = new SessionTreeComponent({
			state,
			index,
			tui: { requestRender() {} },
			theme: {},
			done() {},
		});
		const first = component.getVisibleNodes();
		state.displayOptions.showThinkingNodes = true;
		expect(
			component.getVisibleNodes().find((n) => n.realId === "a")?.summaryText,
		).toContain("reasoning");
		state.displayOptions.showThinkingNodes = false;
		expect(
			component.getVisibleNodes().find((n) => n.realId === "a")?.summaryText,
		).not.toContain("reasoning");
		component.handleInput("]");
		component.handleInput("b");
		const next = component.getVisibleNodes();
		expect(next).not.toBe(first);
		expect(next.some((n) => n.anchorEntryId === "a")).toBe(true);
		expect(state.selectedEntryId).toBe("b");
		component.dispose();
	});
});
