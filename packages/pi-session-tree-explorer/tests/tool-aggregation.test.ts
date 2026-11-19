import { describe, expect, it, mock } from "bun:test";
import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { Check } from "typebox/value";
import { createActionRegistry } from "../extensions/actions.ts";
import { SessionTreeConfigSchema } from "../extensions/config-schema.ts";
import {
	buildDisplayProjection,
	isNodeCollapsed,
} from "../extensions/display.ts";
import { buildSearchIndex, executeSearch } from "../extensions/search.ts";
import { executeSessionIntent } from "../extensions/session-effects.ts";
import { createInitialState } from "../extensions/state.ts";
import { buildTreeIndex } from "../extensions/tree-index.ts";
import { SessionTreeComponent } from "../extensions/tui.ts";
import type { SessionEntry } from "../extensions/types.ts";

function buildToolChainFixture(): SessionEntry[] {
	return [
		{
			type: "message",
			id: "u1",
			parentId: null,
			timestamp: "T0",
			message: { role: "user", content: "Investigate auth module" },
		},
		{
			type: "message",
			id: "a1",
			parentId: "u1",
			timestamp: "T1",
			message: {
				role: "assistant",
				content: [{ type: "text", text: "Let me inspect the codebase." }],
			},
		},
		{
			type: "message",
			id: "tc1",
			parentId: "a1",
			timestamp: "T2",
			message: {
				role: "assistant",
				content: [{ type: "toolCall", name: "read" }],
			},
		},
		{
			type: "message",
			id: "tr1",
			parentId: "tc1",
			timestamp: "T3",
			message: {
				role: "toolResult",
				toolName: "read",
				content: "auth.ts contents",
				isError: false,
			},
		},
		{
			type: "message",
			id: "tr2",
			parentId: "tr1",
			timestamp: "T4",
			message: {
				role: "toolResult",
				toolName: "grep",
				content: "tokenValidator matches",
				isError: false,
			},
		},
		{
			type: "message",
			id: "tr3",
			parentId: "tr2",
			timestamp: "T5",
			message: {
				role: "toolResult",
				toolName: "bash",
				content: "npm test failed with exit 1",
				isError: true,
			},
		},
		{
			type: "message",
			id: "a2",
			parentId: "tr3",
			timestamp: "T6",
			message: { role: "assistant", content: "Found the auth bug." },
		},
	];
}

describe("T0003: Tool Call Aggregation & Smart Fold Mode", () => {
	it("accepts fold.mode = 'smart' in TypeBox config schema", () => {
		expect(
			Check(SessionTreeConfigSchema, {
				fold: { mode: "smart" },
			}),
		).toBe(true);
	});

	it("collapses consecutive tool calls into a single virtual [Tools ×N] line with metadata", () => {
		const index = buildTreeIndex(buildToolChainFixture());
		const state = createInitialState("tool-agg", {
			selectedEntryId: "u1",
			sessionLeafId: "a2",
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

		const nodes = buildDisplayProjection(index, state);
		const ids = nodes.map((n) => n.id);
		expect(ids).toEqual(["u1", "a1", "virtual:tool-group:tc1", "a2"]);

		const group = nodes.find((n) => n.id === "virtual:tool-group:tc1");
		expect(group).toBeDefined();
		expect(group?.isVirtual).toBe(true);
		expect(group?.kind).toBe("virtual-tool-group");
		expect(group?.summaryText).toBe("▸ [Tools ×3] read, grep, bash");
		expect(group?.toolGroup).toEqual({
			toolNames: ["read", "grep", "bash"],
			count: 3,
			statusSummary: "2 ok, 1 err",
			isExpanded: false,
			entryIds: ["tc1", "tr1", "tr2", "tr3"],
		});
		expect(nodes.find((n) => n.id === "a2")?.visibleParentId).toBe(
			"virtual:tool-group:tc1",
		);
	});

	it("toggles and expands/collapses virtual:tool-group in-place with Enter, l, and h without navigating", async () => {
		const entries = buildToolChainFixture();
		const index = buildTreeIndex(entries);
		const state = createInitialState("tool-toggle", {
			selectedEntryId: "virtual:tool-group:tc1",
			sessionLeafId: "a2",
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
		const done = mock();
		const comp = new SessionTreeComponent({
			tui: { requestRender() {} },
			theme: {},
			done,
			index,
			state,
		});

		// Enter expands in-place without calling done / navigate
		comp.handleInput("\r");
		expect(done).not.toHaveBeenCalled();
		const expanded = comp.getVisibleNodes();
		expect(expanded.map((n) => n.id)).toEqual([
			"u1",
			"a1",
			"virtual:tool-group:tc1",
			"tc1",
			"tr1",
			"tr2",
			"tr3",
			"a2",
		]);
		const header = expanded.find((n) => n.id === "virtual:tool-group:tc1");
		expect(header?.isExpanded).toBe(true);
		expect(header?.summaryText).toBe("▾ [Tools ×3] read, grep, bash");
		expect(expanded.find((n) => n.id === "tr2")?.visibleParentId).toBe(
			"virtual:tool-group:tc1",
		);

		// Enter again collapses in-place
		comp.handleInput("\r");
		expect(done).not.toHaveBeenCalled();
		expect(comp.getVisibleNodes().map((n) => n.id)).toEqual([
			"u1",
			"a1",
			"virtual:tool-group:tc1",
			"a2",
		]);

		// l expands, h collapses
		comp.handleInput("l");
		expect(comp.getVisibleNodes().some((n) => n.id === "tr2")).toBe(true);
		comp.handleInput("h");
		expect(comp.getVisibleNodes().some((n) => n.id === "tr2")).toBe(false);

		// Virtual tool-group ID cannot be passed to host navigation/fork
		const rejectRes = await executeSessionIntent({
			intent: { type: "navigate", entryId: "virtual:tool-group:tc1" },
			ctx: {
				sessionManager: {
					getSessionId: () => "tool-toggle",
					getEntry: () => undefined,
				},
				isIdle: () => true,
			} as unknown as ExtensionCommandContext,
			config: {
				...{
					vimMode: true,
					navigation: {
						initialFocus: "active",
						branchNavigationScope: "nearest-fork",
						branchWrap: false,
						focusFollowsSelection: "branch-actions",
						autoRevealTarget: true,
						skipHiddenNodes: true,
					},
					display: state.displayOptions,
					fold: state.foldOptions,
					search: {
						mode: "fuzzy",
						scope: "all",
						includeHiddenNodes: true,
						autoExpandMatches: true,
						preserveFoldState: true,
						caseSensitive: false,
						maxResults: 100,
					},
					context: {
						enabled: true,
						showTokens: true,
						showPercentage: true,
						showModel: false,
						estimateHistorical: true,
						showEstimateMarker: true,
						lazyEvaluation: true,
						cacheSize: 512,
					},
					session: {
						forkPosition: "at",
						navigateSummarize: false,
						confirmFork: false,
						busyBehavior: "reject",
					},
					performance: {
						virtualRendering: true,
						renderOverscan: 20,
						searchDebounceMs: 40,
					},
					keybindings: {},
				},
			},
		});
		expect(rejectRes.success).toBe(false);
		expect(rejectRes.error).toContain("virtual summary");
		comp.dispose();
	});

	it("preserves raw topology, entry IDs, and raw searchability of aggregated tool entries", () => {
		const entries = buildToolChainFixture();
		const index = buildTreeIndex(entries);
		expect(index.parentById.get("tr2")).toBe("tr1");
		expect(index.parentById.get("a2")).toBe("tr3");
		expect(index.rawDepthById.get("tr3")).toBe(5);

		const docs = buildSearchIndex(index);
		const results = executeSearch(
			"tokenValidator",
			docs,
			{
				mode: "exact",
				scope: "all",
				caseSensitive: false,
				maxResults: 20,
			},
			index,
		);
		expect(results.map((r) => r.document.id)).toContain("tr2");
	});

	it("implements smart fold mode for short (<20 turns) and long (>=20 turns) sessions", () => {
		// Short session (< 20 turns) with fork and tools: both branches stay expanded, tools aggregate
		const shortEntries: SessionEntry[] = [
			...buildToolChainFixture(),
			{
				type: "message",
				id: "alt-u",
				parentId: "u1",
				timestamp: "T7",
				message: { role: "user", content: "Alternative branch" },
			},
			{
				type: "message",
				id: "alt-a",
				parentId: "alt-u",
				timestamp: "T8",
				message: { role: "assistant", content: "Alternative reply" },
			},
		];
		const shortIndex = buildTreeIndex(shortEntries);
		const shortState = createInitialState("smart-short", {
			selectedEntryId: "a2",
			sessionLeafId: "a2",
			focusedPathIds: new Set(["u1", "a1", "tc1", "tr1", "tr2", "tr3", "a2"]),
			foldOptions: {
				mode: "smart",
				collapseInactiveBranches: true,
				collapseLinearPaths: false,
				rememberManualOverrides: true,
				maxExpandDepth: 0,
			},
		});

		const shortNodes = buildDisplayProjection(shortIndex, shortState);
		expect(shortNodes.map((n) => n.id)).toEqual([
			"u1",
			"a1",
			"virtual:tool-group:tc1",
			"a2",
			"alt-u",
			"alt-a",
		]);
		expect(isNodeCollapsed("alt-u", shortIndex, shortState)).toBe(false);

		// Long session (>= 20 turns) with fork and tools: tools aggregate and inactive branch folds
		const longEntries: SessionEntry[] = [];
		let parent: string | null = null;
		for (let i = 0; i < 20; i++) {
			const uid = `u${i}`;
			const aid = `a${i}`;
			longEntries.push({
				type: "message",
				id: uid,
				parentId: parent,
				timestamp: `T${i * 2}`,
				message: { role: "user", content: `Turn ${i}` },
			});
			longEntries.push({
				type: "message",
				id: aid,
				parentId: uid,
				timestamp: `T${i * 2 + 1}`,
				message: { role: "assistant", content: `Answer ${i}` },
			});
			parent = aid;
		}
		// Add consecutive tool chain at end of active path + an inactive fork branch off u0
		longEntries.push(
			{
				type: "message",
				id: "long-t1",
				parentId: parent,
				timestamp: "T50",
				message: { role: "toolResult", toolName: "read", content: "file1" },
			},
			{
				type: "message",
				id: "long-t2",
				parentId: "long-t1",
				timestamp: "T51",
				message: { role: "toolResult", toolName: "bash", content: "ok" },
			},
			{
				type: "message",
				id: "long-final",
				parentId: "long-t2",
				timestamp: "T52",
				message: { role: "assistant", content: "Final summary" },
			},
			{
				type: "message",
				id: "side-u",
				parentId: "u0",
				timestamp: "T53",
				message: { role: "user", content: "Side branch" },
			},
			{
				type: "message",
				id: "side-a",
				parentId: "side-u",
				timestamp: "T54",
				message: { role: "assistant", content: "Side result" },
			},
		);

		const longIndex = buildTreeIndex(longEntries);
		const longFocused = new Set<string>();
		let cur: string | null = "long-final";
		while (cur) {
			longFocused.add(cur);
			cur = longIndex.parentById.get(cur) ?? null;
		}
		const longState = createInitialState("smart-long", {
			selectedEntryId: "long-final",
			sessionLeafId: "long-final",
			focusedPathIds: longFocused,
			foldOptions: {
				mode: "focused-only",
				collapseInactiveBranches: true,
				collapseLinearPaths: false,
				rememberManualOverrides: true,
				maxExpandDepth: 0,
			},
		});

		// Switch via fold.smart action
		const registry = createActionRegistry();
		registry.get("fold.smart")?.execute({
			state: longState,
			index: longIndex,
			visibleNodes: [],
			close: () => {},
		});
		expect(longState.foldOptions.mode).toBe("smart");

		const longNodes = buildDisplayProjection(longIndex, longState);
		expect(longNodes.some((n) => n.id === "virtual:tool-group:long-t1")).toBe(
			true,
		);
		expect(longNodes.some((n) => n.id === "virtual:branch:side-u")).toBe(true);
		expect(longNodes.some((n) => n.id === "u0")).toBe(true);
		expect(longNodes.some((n) => n.id === "long-final")).toBe(true);
		expect(isNodeCollapsed("side-u", longIndex, longState)).toBe(true);
	});
});
