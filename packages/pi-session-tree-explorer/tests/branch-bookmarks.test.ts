import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	computeSessionStatistics,
	formatSessionStatisticsLines,
} from "../extensions/inspection-view.ts";
import { createInitialState } from "../extensions/state.ts";
import { buildTreeIndex } from "../extensions/tree-index.ts";
import { SessionTreeComponent } from "../extensions/tui.ts";
import type { ExplorerResult, SessionEntry } from "../extensions/types.ts";
import {
	getViewStateFilePath,
	loadViewState,
	saveViewState,
} from "../extensions/view-state.ts";

function buildBookmarkFixture(): SessionEntry[] {
	return [
		{
			type: "message",
			id: "root",
			parentId: null,
			timestamp: "2026-11-13T10:00:00Z",
			message: { role: "user", content: "Initial baseline task" },
		},
		{
			type: "message",
			id: "fork",
			parentId: "root",
			timestamp: "2026-11-13T10:01:00Z",
			message: {
				role: "assistant",
				content: "Splitting into approaches.",
				usage: { totalTokens: 120 },
			},
		},
		{
			type: "message",
			id: "a-start",
			parentId: "fork",
			timestamp: "2026-11-13T10:02:00Z",
			message: { role: "user", content: "Approach A start" },
		},
		{
			type: "message",
			id: "a-tc",
			parentId: "a-start",
			timestamp: "2026-11-13T10:03:00Z",
			message: {
				role: "assistant",
				content: [
					{
						id: "c1",
						type: "toolCall",
						name: "read",
						arguments: { path: "a.ts" },
					},
					{
						id: "c2",
						type: "toolCall",
						name: "bash",
						arguments: { cmd: "test" },
					},
				],
				usage: { totalTokens: 250 },
			},
		},
		{
			type: "message",
			id: "a-tr1",
			parentId: "a-tc",
			timestamp: "2026-11-13T10:04:00Z",
			message: {
				role: "toolResult",
				toolCallId: "c1",
				toolName: "read",
				content: "ok",
				isError: false,
			},
		},
		{
			type: "message",
			id: "a-tip",
			parentId: "a-tr1",
			timestamp: "2026-11-13T10:05:00Z",
			message: {
				role: "toolResult",
				toolCallId: "c2",
				toolName: "bash",
				content: "failed test",
				isError: true,
			},
		},
		{
			type: "message",
			id: "b-start",
			parentId: "fork",
			timestamp: "2026-11-13T10:06:00Z",
			message: { role: "user", content: "Approach B start" },
		},
		{
			type: "message",
			id: "b-tip",
			parentId: "b-start",
			timestamp: "2026-11-13T10:07:00Z",
			message: {
				role: "assistant",
				content: "Approach B succeeded.",
				usage: { totalTokens: 180 },
			},
		},
	];
}

describe("T0007: Branch Bookmarks & Session Statistics", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), "pi-stree-bookmarks-"));
	});

	afterEach(async () => {
		await rm(tempDir, { recursive: true, force: true });
	});

	it("tags branches with custom bookmarks, renders ★ [bookmark] in Outline, and jumps via branch switcher", () => {
		const index = buildTreeIndex(buildBookmarkFixture());
		const state = createInitialState("bm-tui", {
			selectedEntryId: "a-start",
			sessionLeafId: "b-tip",
			focusedPathIds: new Set(["root", "fork", "b-start", "b-tip"]),
			displayOptions: {
				showAssistantNodes: true,
				showToolNodes: true,
				showThinkingNodes: false,
				showMetadataNodes: false,
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

		let emitted: ExplorerResult | undefined;
		const comp = new SessionTreeComponent({
			tui: { requestRender() {}, terminal: { rows: 24, columns: 100 } },
			theme: {},
			done: (r) => {
				emitted = r;
			},
			index,
			state,
		});

		// Bookmark selected branch a-start as "approach-a" using 'B'
		comp.handleInput("B");
		expect(comp.render(100).join("\n")).toContain("BOOKMARK BRANCH [a-start]");
		for (const ch of "approach-a") comp.handleInput(ch);
		comp.handleInput("\r");

		expect(state.branchBookmarks).toEqual({ "a-start": "approach-a" });
		expect(comp.render(100).join("\n")).toContain("★[approach-a]");

		// Open branch switcher ('gB') -> lists bookmarked branch resolving to its tip a-tip
		comp.dispatch("branch.bookmarks");
		const switcherView = comp.render(110).join("\n");
		expect(switcherView).toContain("BRANCH SWITCHER");
		expect(switcherView).toContain("★ [approach-a]");
		expect(switcherView).toContain("-> a-tip");

		// Press Enter on bookmarked branch -> navigates directly to tip a-tip
		comp.handleInput("\r");
		expect(emitted).toEqual({ type: "navigate", entryId: "a-tip" });
	});

	it("persists bookmarks cleanly under schema v2 and filters stale bookmark IDs on load", async () => {
		const index = buildTreeIndex(buildBookmarkFixture());
		const state = createInitialState("bm-persist", {
			branchBookmarks: {
				"a-start": "approach-a",
				"b-tip": "baseline",
				"stale-deleted-entry": "gone",
			},
		});

		await saveViewState(tempDir, "bm-persist", state);
		const filePath = getViewStateFilePath(tempDir, "bm-persist");
		const raw = JSON.parse(await readFile(filePath, "utf8"));
		expect(raw.version).toBe(2);
		expect(raw.branchBookmarks).toEqual({
			"a-start": "approach-a",
			"b-tip": "baseline",
			"stale-deleted-entry": "gone",
		});

		const loaded = await loadViewState(tempDir, "bm-persist", index, true);
		expect(loaded?.branchBookmarks).toEqual({
			"a-start": "approach-a",
			"b-tip": "baseline",
		});
	});

	it("computes and renders accurate session statistics in view.stats modal", () => {
		const index = buildTreeIndex(buildBookmarkFixture());
		const state = createInitialState("stats-sess", {
			selectedEntryId: "root",
			sessionLeafId: "b-tip",
			branchBookmarks: { "a-start": "failed-test", "b-tip": "baseline" },
		});

		const stats = computeSessionStatistics(index, state);
		expect(stats.totalNodes).toBe(8);
		expect(stats.turnCount).toBe(3);
		expect(stats.assistantCount).toBe(3);
		expect(stats.forkCount).toBe(1);
		expect(stats.leafCount).toBe(2);
		expect(stats.branchCount).toBe(2);
		expect(stats.totalToolCalls).toBe(2);
		expect(stats.toolErrors).toBe(1);
		expect(stats.toolDistribution).toEqual({ read: 1, bash: 1 });
		expect(stats.reportedTotalTokens).toBe(550);
		expect(stats.estimatedTotalTokens).toBeGreaterThan(0);
		expect(stats.bookmarkedBranches).toBe(2);

		const formatted = formatSessionStatisticsLines(stats, 100).join("\n");
		expect(formatted).toContain("Total Nodes: 8");
		expect(formatted).toContain("Tool Calls: 2 (Errors: 1)");
		expect(formatted).toContain("read: 1");
		expect(formatted).toContain("bash: 1");

		const comp = new SessionTreeComponent({
			tui: { requestRender() {}, terminal: { rows: 24, columns: 100 } },
			theme: {},
			done: vi.fn(),
			index,
			state,
		});
		comp.handleInput("S");
		const statsScreen = comp.render(100).join("\n");
		expect(statsScreen).toContain("SESSION STATISTICS");
		expect(statsScreen).toContain("Total Nodes: 8");
		expect(statsScreen).toContain("Bookmarked Branches: 2");
		comp.handleInput("q");
		expect(comp.render(100).join("\n")).not.toContain("SESSION STATISTICS");
		comp.dispose();
	});
});
