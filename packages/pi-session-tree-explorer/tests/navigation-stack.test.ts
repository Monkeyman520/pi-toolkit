import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	createActionRegistry,
	getDefaultKeybindings,
} from "../extensions/actions.ts";
import { getDefaultConfig } from "../extensions/config-schema.ts";
import { validateKeymap } from "../extensions/keymap.ts";
import {
	buildBranchTipCandidates,
	findReachableBranchTips,
} from "../extensions/navigation.ts";
import {
	executeSessionIntent,
	NavigationHistory,
} from "../extensions/session-effects.ts";
import { createInitialState } from "../extensions/state.ts";
import { buildTreeIndex } from "../extensions/tree-index.ts";
import { SessionTreeComponent } from "../extensions/tui.ts";
import type { ExplorerResult, SessionEntry } from "../extensions/types.ts";

function buildBranchFixture(): SessionEntry[] {
	return [
		{
			type: "message",
			id: "root",
			parentId: null,
			timestamp: "T0",
			message: { role: "user", content: "Start refactoring" },
		},
		{
			type: "message",
			id: "fork",
			parentId: "root",
			timestamp: "T1",
			message: { role: "assistant", content: "Choose an approach" },
		},
		{
			type: "message",
			id: "b1-user",
			parentId: "fork",
			timestamp: "T2",
			message: { role: "user", content: "Try approach A" },
		},
		{
			type: "message",
			id: "b1-tip",
			parentId: "b1-user",
			timestamp: "T3",
			message: { role: "assistant", content: "Approach A finished" },
		},
		{
			type: "message",
			id: "b2-tip-user",
			parentId: "fork",
			timestamp: "T4",
			message: { role: "user", content: "Approach B prompt to edit" },
		},
		{
			type: "message",
			id: "single-branch",
			parentId: "root",
			timestamp: "T5",
			message: { role: "user", content: "Side check" },
		},
		{
			type: "message",
			id: "single-tip",
			parentId: "single-branch",
			timestamp: "T6",
			message: { role: "assistant", content: "Side check result" },
		},
	];
}

describe("T0001: Navigation History Stack, Branch Tip Navigation & Preview Decoupling", () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it("keeps default keybindings free of same-mode duplicates and invalid keys", () => {
		const diagnostics = validateKeymap(getDefaultKeybindings());
		expect(diagnostics.filter((d) => d.type === "duplicate")).toEqual([]);
		expect(diagnostics.filter((d) => d.type === "invalid")).toEqual([]);
	});

	it("decouples browsing and Tab/p preview from sessionLeafId and navigation", () => {
		const index = buildTreeIndex(buildBranchFixture());
		const state = createInitialState("preview-decouple", {
			selectedEntryId: "root",
			sessionLeafId: "b1-tip",
			focusedPathIds: new Set(["root", "fork", "b1-user", "b1-tip"]),
			foldOptions: {
				mode: "all",
				collapseInactiveBranches: false,
				collapseLinearPaths: false,
				rememberManualOverrides: false,
				maxExpandDepth: 0,
			},
		});
		const done = vi.fn();
		const comp = new SessionTreeComponent({
			tui: { requestRender() {} },
			theme: {},
			done,
			index,
			state,
			registry: createActionRegistry(),
		});

		comp.handleInput("j");
		expect(state.selectedEntryId).toBe("b1-user");
		expect(state.previewNodeId).toBe("b1-user");
		expect(state.sessionLeafId).toBe("b1-tip");
		expect(done).not.toHaveBeenCalled();

		// Tab enters preview without changing active leaf
		comp.handleInput("\t");
		expect(state.mode).toBe("preview");
		expect(state.previewNodeId).toBe("b1-user");
		expect(state.sessionLeafId).toBe("b1-tip");
		expect(done).not.toHaveBeenCalled();

		// Tab toggles back out of preview
		comp.handleInput("\t");
		expect(state.mode).toBe("normal");
		expect(state.previewNodeId).toBeNull();

		// p enters preview and p exits without mutating sessionLeafId
		comp.handleInput("p");
		expect(state.mode).toBe("preview");
		expect(state.previewNodeId).toBe("b1-user");
		comp.handleInput("p");
		expect(state.mode).toBe("normal");
		expect(state.sessionLeafId).toBe("b1-tip");
		expect(done).not.toHaveBeenCalled();
		comp.dispose();
	});

	it("pushes previous leafId on successful navigateTree and pops on restorePrevious", async () => {
		const history = new NavigationHistory();
		let activeLeafId = "b1-tip";
		const entries = buildBranchFixture();
		const byId = new Map(entries.map((e) => [e.id, e]));
		const navigateTree = vi.fn(async (targetId: string) => {
			activeLeafId = targetId;
			return { cancelled: false };
		});
		const ctx = {
			sessionManager: {
				getSessionId: () => "sess-1",
				getLeafId: () => activeLeafId,
				getEntry: (id: string) => byId.get(id),
			},
			isIdle: () => true,
			navigateTree,
		} as unknown as ExtensionCommandContext;
		const config = getDefaultConfig();

		// 1. Navigate from b1-tip -> single-tip pushes b1-tip
		const res1 = await executeSessionIntent({
			intent: { type: "navigate", entryId: "single-tip" },
			expectedSessionId: "sess-1",
			ctx,
			config,
			navigationHistory: history,
		});
		expect(res1.success).toBe(true);
		expect(activeLeafId).toBe("single-tip");
		expect(history.toArray()).toEqual(["b1-tip"]);

		// 2. Navigate from single-tip -> fork pushes single-tip
		const res2 = await executeSessionIntent({
			intent: { type: "navigate", entryId: "fork" },
			expectedSessionId: "sess-1",
			ctx,
			config,
			navigationHistory: history,
		});
		expect(res2.success).toBe(true);
		expect(history.toArray()).toEqual(["b1-tip", "single-tip"]);

		// 3. Cancelled navigation leaves stack unchanged
		navigateTree.mockResolvedValueOnce({ cancelled: true });
		const resCancelled = await executeSessionIntent({
			intent: { type: "navigate", entryId: "root" },
			expectedSessionId: "sess-1",
			ctx,
			config,
			navigationHistory: history,
		});
		expect(resCancelled.cancelled).toBe(true);
		expect(history.toArray()).toEqual(["b1-tip", "single-tip"]);

		// 4. Pressing 'r' in TUI restores previous leaf and executeSessionIntent pops stack
		const index = buildTreeIndex(entries);
		const state = createInitialState("sess-1", {
			selectedEntryId: "fork",
			sessionLeafId: "fork",
		});
		let emitted: ExplorerResult | undefined;
		const comp = new SessionTreeComponent({
			tui: { requestRender() {} },
			theme: {},
			done: (r) => {
				emitted = r;
			},
			index,
			state,
			navigationHistory: history,
		});
		comp.handleInput("r");
		expect(emitted).toEqual({
			type: "navigate",
			entryId: "single-tip",
			restore: true,
		});

		const resRestore = await executeSessionIntent({
			intent: emitted as ExplorerResult,
			expectedSessionId: "sess-1",
			ctx,
			config,
			navigationHistory: history,
		});
		expect(resRestore.success).toBe(true);
		expect(activeLeafId).toBe("single-tip");
		expect(history.toArray()).toEqual(["b1-tip"]);
	});

	it("notifies and stays open when pressing r with empty navigation history", () => {
		const index = buildTreeIndex(buildBranchFixture());
		const state = createInitialState("empty-hist", {
			selectedEntryId: "root",
			sessionLeafId: "b1-tip",
		});
		const done = vi.fn();
		const notify = vi.fn();
		const comp = new SessionTreeComponent({
			tui: { requestRender() {} },
			theme: {},
			done,
			index,
			state,
			navigationHistory: new NavigationHistory(),
			onNotify: notify,
		});

		comp.handleInput("r");
		expect(done).not.toHaveBeenCalled();
		expect(notify).toHaveBeenCalledWith(
			"No previous navigation history",
			"info",
		);
		comp.dispose();
	});

	it("discovers reachable tips and jumps directly when branch has a single assistant tip", () => {
		vi.useFakeTimers();
		const index = buildTreeIndex(buildBranchFixture());
		expect(findReachableBranchTips(index, "fork")).toEqual([
			"b1-tip",
			"b2-tip-user",
		]);
		expect(findReachableBranchTips(index, "single-branch")).toEqual([
			"single-tip",
		]);

		const state = createInitialState("single-tip-test", {
			selectedEntryId: "single-branch",
			sessionLeafId: "b1-tip",
			foldOptions: {
				mode: "all",
				collapseInactiveBranches: false,
				collapseLinearPaths: false,
				rememberManualOverrides: false,
				maxExpandDepth: 0,
			},
		});
		let emitted: ExplorerResult | undefined;
		const comp = new SessionTreeComponent({
			tui: { requestRender() {} },
			theme: {},
			done: (r) => {
				emitted = r;
			},
			index,
			state,
		});

		comp.handleInput("g");
		vi.advanceTimersByTime(900);
		expect(emitted).toEqual({ type: "navigate", entryId: "single-tip" });
	});

	it("opens tip picker on multi-tip subtree and requires user-prompt notice confirmation", () => {
		const index = buildTreeIndex(buildBranchFixture());
		const candidates = buildBranchTipCandidates(index, "fork", "b1-tip");
		expect(candidates.map((c) => c.entryId)).toEqual(["b1-tip", "b2-tip-user"]);
		expect(candidates[0].isUserPrompt).toBe(false);
		expect(candidates[0].isCurrentLeaf).toBe(true);
		expect(candidates[1].isUserPrompt).toBe(true);

		const state = createInitialState("multi-tip-test", {
			selectedEntryId: "fork",
			sessionLeafId: "b1-tip",
			displayOptions: {
				showAssistantNodes: true,
				showToolNodes: false,
				showThinkingNodes: false,
				showMetadataNodes: false,
				showCompactionNodes: true,
				depthMode: "turn",
				showDepth: true,
				maxMessageLength: 80,
				showNodeId: false,
				showTimestamps: false,
				layout: "normal",
				userOnly: false,
				branchOnly: false,
				labeledOnly: false,
			},
			foldOptions: {
				mode: "all",
				collapseInactiveBranches: false,
				collapseLinearPaths: false,
				rememberManualOverrides: false,
				maxExpandDepth: 0,
			},
		});
		const done = vi.fn();
		const notify = vi.fn();
		const comp = new SessionTreeComponent({
			tui: { requestRender() {} },
			theme: {},
			done,
			index,
			state,
			onNotify: notify,
		});

		comp.dispatch("branch.tip");
		const pickerView = comp.render(100).join("\n");
		expect(pickerView).toContain("SELECT BRANCH TIP (2 reachable)");
		expect(pickerView).toContain("b1-tip");
		expect(pickerView).toContain("b2-tip-user");
		expect(pickerView).toContain("[USER->restores prompt]");

		// Move to second tip (user message) and press Enter -> opens user-tip restoration notice
		comp.handleInput("j");
		comp.handleInput("\r");
		expect(done).not.toHaveBeenCalled();
		expect(notify).toHaveBeenCalledWith(
			expect.stringContaining("restore its prompt into the editor"),
			"warning",
		);
		const noticeView = comp.render(100).join("\n");
		expect(noticeView).toContain("USER MESSAGE TIP NOTICE");
		expect(noticeView).toContain("restore this prompt into the editor");

		// Cancelling returns cleanly without navigation
		comp.handleInput("n");
		expect(done).not.toHaveBeenCalled();

		// Confirming navigates to user tip
		comp.dispatch("branch.tip");
		comp.handleInput("j");
		comp.handleInput("\r");
		comp.handleInput("y");
		expect(done).toHaveBeenCalledWith({
			type: "navigate",
			entryId: "b2-tip-user",
		});
	});

	it("resolves virtual summary anchors for branch.tip and stays cycle-safe", () => {
		const entries = buildBranchFixture();
		const index = buildTreeIndex(entries);
		// Inject synthetic cycle into raw topology copy to verify guard
		const cyclicIndex = buildTreeIndex(entries);
		cyclicIndex.childrenById.set("b1-tip", ["b1-user"]);
		expect(findReachableBranchTips(cyclicIndex, "b1-user")).toEqual([]);

		// Collapsed inactive branch summary resolves anchor to find reachable tips
		const state = createInitialState("collapsed-tip", {
			selectedEntryId: "root",
			sessionLeafId: "single-tip",
			focusedPathIds: new Set(["root", "single-branch", "single-tip"]),
			foldOptions: {
				mode: "focused-only",
				collapseInactiveBranches: true,
				collapseLinearPaths: false,
				rememberManualOverrides: false,
				maxExpandDepth: 0,
			},
		});
		const comp = new SessionTreeComponent({
			tui: { requestRender() {} },
			theme: {},
			done: () => {},
			index,
			state,
		});
		const summary = comp.getVisibleNodes().find((n) => n.isVirtualSummary);
		expect(summary).toBeDefined();
		state.selectedEntryId = summary?.id ?? null;
		comp.dispatch("branch.tip");
		const pickerView = comp.render(100).join("\n");
		expect(pickerView).toContain("SELECT BRANCH TIP");
		expect(pickerView).toContain("b1-tip");
		expect(pickerView).toContain("b2-tip-user");
		comp.dispose();
	});

	it("notifies editor-prompt restoration after executeSessionIntent navigates to user entry", async () => {
		const entries = buildBranchFixture();
		const byId = new Map(entries.map((e) => [e.id, e]));
		const notify = vi.fn();
		const ctx = {
			sessionManager: {
				getSessionId: () => "sess-user-tip",
				getLeafId: () => "b1-tip",
				getEntry: (id: string) => byId.get(id),
			},
			isIdle: () => true,
			navigateTree: vi.fn(async () => ({ cancelled: false })),
		} as unknown as ExtensionCommandContext;
		const res = await executeSessionIntent({
			intent: { type: "navigate", entryId: "b2-tip-user" },
			expectedSessionId: "sess-user-tip",
			ctx,
			config: getDefaultConfig(),
			onNotify: notify,
		});
		expect(res.success).toBe(true);
		expect(notify).toHaveBeenCalledWith(
			expect.stringContaining("restored prompt into editor"),
			"info",
		);
	});
});
