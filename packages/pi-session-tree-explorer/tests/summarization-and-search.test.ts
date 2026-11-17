import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getDefaultConfig } from "../extensions/config-schema.ts";
import { defaultDisplayOptions } from "../extensions/display.ts";
import { buildSearchIndex, executeSearch } from "../extensions/search.ts";
import {
	computeBranchSummaryContext,
	executeSessionIntent,
} from "../extensions/session-effects.ts";
import { createInitialState } from "../extensions/state.ts";
import { buildTreeIndex } from "../extensions/tree-index.ts";
import { SessionTreeComponent } from "../extensions/tui.ts";
import type { ExplorerResult, SessionEntry } from "../extensions/types.ts";

function createForkSessionFixture(): SessionEntry[] {
	return [
		{
			type: "message",
			id: "root",
			parentId: null,
			timestamp: "T0",
			message: { role: "user", content: "Design database layer" },
		},
		{
			type: "message",
			id: "fork",
			parentId: "root",
			timestamp: "T1",
			message: { role: "assistant", content: "Let us compare ORMs." },
		},
		{
			type: "message",
			id: "b1-u",
			parentId: "fork",
			timestamp: "T2",
			message: { role: "user", content: "Explore Prisma adapter" },
		},
		{
			type: "message",
			id: "b1-tc",
			parentId: "b1-u",
			timestamp: "T3",
			message: {
				role: "assistant",
				content: [
					{
						type: "toolCall",
						name: "read",
						arguments: { path: "prisma/schema.prisma", flag: "strict_pool" },
					},
				],
			},
		},
		{
			type: "message",
			id: "b1-tr",
			parentId: "b1-tc",
			timestamp: "T4",
			message: {
				role: "toolResult",
				toolName: "read",
				content: 'datasource db { provider = "postgresql" }',
			},
		},
		{
			type: "message",
			id: "b1-tip",
			parentId: "b1-tr",
			timestamp: "T5",
			message: { role: "assistant", content: "Prisma schema verified." },
		},
		{
			type: "message",
			id: "b2-u",
			parentId: "fork",
			timestamp: "T6",
			message: { role: "user", content: "Explore Drizzle ORM" },
		},
		{
			type: "message",
			id: "b2-tip",
			parentId: "b2-u",
			timestamp: "T7",
			message: { role: "assistant", content: "Drizzle setup complete." },
		},
	];
}

describe("T0005: Interactive Native Summaries & Enhanced Search", () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it("computes branch summary context and offers No summary / Summarize / Custom prompt on cross-branch navigation", async () => {
		const entries = createForkSessionFixture();
		const index = buildTreeIndex(entries);

		const ctx = computeBranchSummaryContext(index, "b1-tip", "b2-tip");
		expect(ctx.isCrossBranch).toBe(true);
		expect(ctx.commonAncestorId).toBe("fork");
		expect(ctx.abandonedEntryCount).toBe(4);
		expect(ctx.abandonedTurnCount).toBe(1);

		const config = getDefaultConfig();
		config.session.promptSummary = true;
		config.display.showAssistantNodes = true;

		const state = createInitialState("summary-modal", {
			selectedEntryId: "b2-tip",

			sessionLeafId: "b1-tip",
			displayOptions: { ...defaultDisplayOptions(), ...config.display },
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
			config,
		});

		// Pressing Enter on cross-branch target opens summary selection modal
		comp.handleInput("\r");
		expect(emitted).toBeUndefined();
		const modalLines = comp.render(100).join("\n");
		expect(modalLines).toContain("BRANCH NAVIGATION SUMMARY");
		expect(modalLines).toContain("1: No summary");
		expect(modalLines).toContain("2: Summarize");
		expect(modalLines).toContain("3: Custom prompt");
		expect(modalLines).toContain("4 entries (1 turns)");

		// Option 1: No summary -> summarize: false
		comp.handleInput("1");
		expect(emitted).toEqual({
			type: "navigate",
			entryId: "b2-tip",
			summarize: false,
		});

		// Re-open and choose Option 3: Custom prompt -> enter instructions -> passes to ctx.navigateTree
		emitted = undefined;
		const comp2 = new SessionTreeComponent({
			tui: { requestRender() {} },
			theme: {},
			done: (r) => {
				emitted = r;
			},
			index,
			state,
			config,
		});
		comp2.handleInput("\r");
		comp2.handleInput("3");
		for (const ch of "Focus on schema migrations") comp2.handleInput(ch);
		comp2.handleInput("\r");
		expect(emitted).toEqual({
			type: "navigate",
			entryId: "b2-tip",
			summarize: true,
			customInstructions: "Focus on schema migrations",
		});

		const navigateTree = vi.fn(async () => ({ cancelled: false }));
		const byId = new Map(entries.map((e) => [e.id, e]));
		const res = await executeSessionIntent({
			intent: emitted as unknown as ExplorerResult,
			expectedSessionId: "summary-modal",
			ctx: {
				sessionManager: {
					getSessionId: () => "summary-modal",
					getLeafId: () => "b1-tip",
					getEntry: (id: string) => byId.get(id),
				},
				isIdle: () => true,
				navigateTree,
			} as unknown as ExtensionCommandContext,
			config,
		});
		expect(res.success).toBe(true);
		expect(navigateTree).toHaveBeenCalledWith("b2-tip", {
			summarize: true,
			customInstructions: "Focus on schema migrations",
		});
	});

	it("supports interactive ctx.ui.select fallback in executeSessionIntent when promptSummary is enabled", async () => {
		const entries = createForkSessionFixture();
		const byId = new Map(entries.map((e) => [e.id, e]));
		const navigateTree = vi.fn(async () => ({ cancelled: false }));
		const config = getDefaultConfig();
		config.session.promptSummary = true;

		const res = await executeSessionIntent({
			intent: { type: "navigate", entryId: "b2-tip" },
			expectedSessionId: "direct-prompt",
			ctx: {
				sessionManager: {
					getSessionId: () => "direct-prompt",
					getLeafId: () => "b1-tip",
					getEntry: (id: string) => byId.get(id),
					getEntries: () => entries,
				},
				isIdle: () => true,
				ui: {
					select: vi.fn(async () => "Custom prompt"),
					input: vi.fn(async () => "Keep ORM tradeoffs"),
				},
				navigateTree,
			} as unknown as ExtensionCommandContext,
			config,
		});
		expect(res.success).toBe(true);
		expect(navigateTree).toHaveBeenCalledWith("b2-tip", {
			summarize: true,
			customInstructions: "Keep ORM tradeoffs",
		});
	});

	it("indexes tool call names, arguments, and outputs, expands ancestor chain on accept, and highlights matches", () => {
		vi.useFakeTimers();
		const entries = createForkSessionFixture();
		const index = buildTreeIndex(entries);
		const docs = buildSearchIndex(index);

		// Search by tool argument value ("strict_pool")
		const argHits = executeSearch(
			"strict_pool",
			docs,
			{
				mode: "exact",
				scope: "all",
				caseSensitive: false,
				maxResults: 20,
			},
			index,
		);
		expect(argHits.map((r) => r.document.id)).toContain("b1-tc");

		// Search by toolResult output ("postgresql")
		const outHits = executeSearch(
			"postgresql",
			docs,
			{
				mode: "exact",
				scope: "all",
				caseSensitive: false,
				maxResults: 20,
			},
			index,
		);
		expect(outHits.map((r) => r.document.id)).toContain("b1-tr");

		// In TUI with collapsed inactive branch, accepting search hit reveals ancestor path & highlights match
		const state = createInitialState("search-reveal", {
			selectedEntryId: "b2-tip",
			sessionLeafId: "b2-tip",
			focusedPathIds: new Set(["root", "fork", "b2-u", "b2-tip"]),
			foldOptions: {
				mode: "focused-only",
				collapseInactiveBranches: true,
				collapseLinearPaths: false,
				rememberManualOverrides: false,
				maxExpandDepth: 0,
			},
		});
		const config = getDefaultConfig();
		config.performance.searchDebounceMs = 0;

		const comp = new SessionTreeComponent({
			tui: { requestRender() {} },
			theme: {},
			done: () => {},
			index,
			state,
			config,
		});

		// b1-u branch is initially collapsed into virtual:branch:b1-u
		expect(comp.getVisibleNodes().some((n) => n.id === "b1-tr")).toBe(false);

		// Search for "strict_pool" (hidden tool argument) and accept with Enter
		for (const ch of ["/", ..."strict_pool"]) comp.handleInput(ch);
		vi.runAllTimers();
		comp.handleInput("\r");

		expect(state.mode).toBe("normal");
		expect(state.selectedEntryId).toBe("b1-tc");
		expect(state.temporaryRevealedIds.has("b1-tc")).toBe(true);
		expect(state.temporaryRevealedIds.has("b1-u")).toBe(true);
		expect(comp.getVisibleNodes().some((n) => n.realId === "b1-tc")).toBe(true);
		// Tool-argument match row displays [hit] indicator
		expect(comp.render(120).join("\n")).toContain("[hit]");

		// Search for visible text "Drizzle" -> highlights substring with ANSI color
		comp.handleInput("\u001b");
		for (const ch of ["/", ..."Drizzle"]) comp.handleInput(ch);
		vi.runAllTimers();
		comp.handleInput("\r");
		expect(comp.render(120).join("\n")).toContain("\x1b[1;33mDrizzle\x1b[0m");
		comp.dispose();
	});
});
