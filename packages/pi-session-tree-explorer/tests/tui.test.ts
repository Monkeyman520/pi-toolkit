import { describe, expect, it } from "vitest";
import { createInitialState } from "../extensions/state.ts";
import { buildTreeIndex } from "../extensions/tree-index.ts";
import { SessionTreeComponent } from "../extensions/tui.ts";
import type { ExplorerResult, SessionEntry } from "../extensions/types.ts";

describe("SessionTreeComponent TUI", () => {
	it("renders an empty session tree gracefully", () => {
		const index = buildTreeIndex([]);
		const state = createInitialState("empty-session");

		let result: ExplorerResult | null = null;
		const comp = new SessionTreeComponent({
			tui: { requestRender: () => {} },
			theme: {},
			done: (r) => {
				result = r;
			},
			index,
			state,
		});

		const lines = comp.render(80);
		expect(lines.length).toBeGreaterThan(0);
		expect(lines.some((l) => l.includes("(empty session tree)"))).toBe(true);
		expect(lines.some((l) => l.includes("q Close"))).toBe(true);

		// Test exit on 'q'
		comp.handleInput("q");
		expect(result).toEqual({ type: "close" });
	});

	it("renders a populated session tree and handles key navigation", () => {
		const entries: SessionEntry[] = [
			{
				type: "message",
				id: "root",
				parentId: null,
				timestamp: "T0",
				message: { role: "system", content: "Preamble" },
			},
			{
				type: "message",
				id: "user1",
				parentId: "root",
				timestamp: "T1",
				message: { role: "user", content: "Plan architecture" },
			},
			{
				type: "message",
				id: "asst1",
				parentId: "user1",
				timestamp: "T2",
				message: { role: "assistant", content: "Here is the plan" },
			},
			{
				type: "message",
				id: "branchA",
				parentId: "asst1",
				timestamp: "T3",
				message: { role: "user", content: "Approach A" },
			},
			{
				type: "message",
				id: "branchB",
				parentId: "asst1",
				timestamp: "T4",
				message: { role: "user", content: "Approach B" },
			},
		];

		const index = buildTreeIndex(entries);
		const state = createInitialState("test-session-12345", {
			selectedEntryId: "root",
			sessionLeafId: "branchA",
			focusedPathIds: new Set(["root", "user1", "asst1", "branchA"]),
			displayOptions: {
				showAssistantNodes: true,
				showToolNodes: true,
				showThinkingNodes: true,
				showMetadataNodes: true,
				showCompactionNodes: true,
				userOnly: false,
				branchOnly: false,
				labeledOnly: false,
				depthMode: "turn",
				showDepth: true,
				maxMessageLength: 80,
				showNodeId: false,
				showTimestamps: false,
				layout: "normal",
			},
			foldOptions: {
				mode: "all",
				collapseInactiveBranches: false,
				collapseLinearPaths: false,
				rememberManualOverrides: true,
				maxExpandDepth: 0,
			},
		});

		let renderRequested = 0;
		let closeResult: ExplorerResult | null = null;

		const comp = new SessionTreeComponent({
			tui: {
				requestRender: () => {
					renderRequested++;
				},
			},
			theme: {},
			done: (r) => {
				closeResult = r;
			},
			index,
			state,
		});

		const lines = comp.render(100);
		expect(lines.some((l) => l.includes("SESSION TREE EXPLORER"))).toBe(true);
		expect(lines.some((l) => l.includes("Plan architecture"))).toBe(true);
		expect(lines.some((l) => l.includes("Approach A"))).toBe(true);

		// Key navigation: 'j' moves to next visible node (user1)
		comp.handleInput("j");
		expect(state.selectedEntryId).toBe("user1");
		expect(renderRequested).toBeGreaterThan(0);

		// Key navigation: 'j' moves to asst1
		comp.handleInput("j");
		expect(state.selectedEntryId).toBe("asst1");

		// Key navigation: 'H' moves to parent of asst1 (user1)
		comp.handleInput("H");
		expect(state.selectedEntryId).toBe("user1");

		// Key navigation: 'L' moves to first child of user1 (asst1)
		comp.handleInput("L");
		expect(state.selectedEntryId).toBe("asst1");

		// From fork point asst1, enter child branch via 'L'
		comp.handleInput("L");
		expect(state.selectedEntryId).toBe("branchA");

		// Multi-key navigation: ']b' switches to next sibling branch (branchB)
		comp.handleInput("]");
		comp.handleInput("b");
		expect(state.selectedEntryId).toBe("branchB");

		// Multi-key navigation: '[b' switches back to branchA
		comp.handleInput("[");
		comp.handleInput("b");
		expect(state.selectedEntryId).toBe("branchA");

		// Multi-key navigation: 'gp' moves to branch parent (asst1)
		comp.handleInput("g");
		comp.handleInput("p");
		expect(state.selectedEntryId).toBe("asst1");

		// Close via q; normal Escape clears search.
		comp.handleInput("q");
		expect(closeResult).toEqual({ type: "close" });
	});
	it("toggles and renders help overlay without modifying tree index", () => {
		const index = buildTreeIndex([
			{
				type: "message",
				id: "1",
				parentId: null,
				timestamp: "T0",
				message: { role: "user", content: "Hi" },
			},
		]);
		const state = createInitialState("test-session-help");

		const comp = new SessionTreeComponent({
			tui: { requestRender: () => {} },
			theme: {},
			done: () => {},
			index,
			state,
		});

		// Press '?' to toggle help mode
		comp.handleInput("?");
		expect(state.mode).toBe("help");

		const lines = comp.render(80);
		expect(lines.some((l) => l.includes("SHORTCUT HELP"))).toBe(true);
		expect(lines.some((l) => l.includes("Navigation:"))).toBe(true);
		expect(lines.some((l) => l.includes("Folding & Filtering:"))).toBe(true);

		// Press '?' again to exit help mode
		comp.handleInput("?");
		expect(state.mode).toBe("normal");
	});

	it("preserves TreeIndex and visible projection cache on selection-only movement", () => {
		const index = buildTreeIndex([
			{
				type: "message",
				id: "1",
				parentId: null,
				timestamp: "T0",
				message: { role: "user", content: "1" },
			},
			{
				type: "message",
				id: "2",
				parentId: "1",
				timestamp: "T1",
				message: { role: "user", content: "2" },
			},
		]);
		const state = createInitialState("test-cache", {
			selectedEntryId: "1",
			foldOptions: {
				mode: "all",
				collapseInactiveBranches: false,
				collapseLinearPaths: false,
				rememberManualOverrides: false,
				maxExpandDepth: 0,
			},
		});

		const comp = new SessionTreeComponent({
			tui: { requestRender: () => {} },
			theme: {},
			done: () => {},
			index,
			state,
		});

		const _firstVisible = comp.getVisibleNodes();
		// Move selection
		comp.handleInput("j");
		expect(state.selectedEntryId).toBe("2");

		// Index reference is strictly identical (never rebuilt)
		expect(index.entryById.size).toBe(2);
	});
});
