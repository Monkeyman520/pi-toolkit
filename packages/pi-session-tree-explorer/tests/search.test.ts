import { describe, expect, it } from "vitest";
import { createActionRegistry } from "../extensions/actions.ts";
import { buildDisplayProjection } from "../extensions/display.ts";
import {
	buildSearchIndex,
	executeSearch,
	extractFullText,
} from "../extensions/search.ts";
import { createInitialState } from "../extensions/state.ts";
import { buildTreeIndex } from "../extensions/tree-index.ts";
import type { ActionContext, SessionEntry } from "../extensions/types.ts";

describe("T0004: Full-Text Search, Ranking & Reversible Reveals", () => {
	function createSearchFixture() {
		const longPrompt =
			"This is a very long user prompt that exceeds the usual 80-character line truncation limit and contains secret_keyword_xyz deep inside the text.";

		const entries: SessionEntry[] = [
			{
				type: "message",
				id: "root",
				parentId: null,
				timestamp: "T0",
				message: { role: "system", content: "System instructions" },
			},
			{
				type: "message",
				id: "user1",
				parentId: "root",
				timestamp: "T1",
				label: "auth-flow",
				message: { role: "user", content: longPrompt },
			},
			{
				type: "message",
				id: "asst1",
				parentId: "user1",
				timestamp: "T2",
				message: {
					role: "assistant",
					model: "claude-3-5-sonnet",
					content: "Assistant response about authentication and tokens.",
				},
			},
			{
				type: "message",
				id: "tool1",
				parentId: "asst1",
				timestamp: "T3",
				message: {
					role: "toolResult",
					toolName: "database_query",
					toolCallId: "call_999",
					content: "SELECT * FROM users WHERE active = true",
				},
			},
			{
				type: "compaction",
				id: "comp1",
				parentId: "tool1",
				timestamp: "T4",
				summary:
					"Compacted user discussion regarding database schema and auth.",
				firstKeptEntryId: "tool1",
			},
			{
				type: "message",
				id: "user2_branchA",
				parentId: "comp1",
				timestamp: "T5",
				message: { role: "user", content: "Branch A: Implement token refresh" },
			},
			{
				type: "message",
				id: "user2_branchB",
				parentId: "comp1",
				timestamp: "T6",
				message: {
					role: "user",
					content: "Branch B: Implement OAuth2 fallback",
				},
			},
		];

		const index = buildTreeIndex(entries);
		const state = createInitialState("search-session", {
			selectedEntryId: "root",
			sessionLeafId: "user2_branchA",
			focusedBranchId: "user2_branchA",
			focusedPathIds: new Set([
				"root",
				"user1",
				"asst1",
				"tool1",
				"comp1",
				"user2_branchA",
			]),
		});

		return { entries, index, state };
	}

	it("extracts full text including tool names, IDs, and long text beyond row truncation", () => {
		const { entries } = createSearchFixture();
		const toolEntry = entries[3];
		const full = extractFullText(toolEntry);
		expect(full).toContain("database_query");
		expect(full).toContain("call_999");
		expect(full).toContain("SELECT * FROM users");

		const userEntry = entries[1];
		expect(extractFullText(userEntry)).toContain("secret_keyword_xyz");
	});

	it("executes fuzzy, exact, and regex search modes", () => {
		const { index } = createSearchFixture();
		const docs = buildSearchIndex(index);

		// 1. Fuzzy mode (default) finds match beyond truncation
		const fuzzyResults = executeSearch(
			"secret_keyword",
			docs,
			{
				mode: "fuzzy",
				scope: "all",
				caseSensitive: false,
				maxResults: 10,
			},
			index,
		);
		expect(fuzzyResults.length).toBeGreaterThan(0);
		expect(fuzzyResults[0].document.id).toBe("user1");

		// 2. Exact mode matches substring
		const exactResults = executeSearch(
			"token refresh",
			docs,
			{
				mode: "exact",
				scope: "all",
				caseSensitive: false,
				maxResults: 10,
			},
			index,
		);
		expect(exactResults.length).toBe(1);
		expect(exactResults[0].document.id).toBe("user2_branchA");

		// 3. Regex mode matches pattern
		const regexResults = executeSearch(
			"OAuth[0-9]+",
			docs,
			{
				mode: "regex",
				scope: "all",
				caseSensitive: false,
				maxResults: 10,
			},
			index,
		);
		expect(regexResults.length).toBe(1);
		expect(regexResults[0].document.id).toBe("user2_branchB");
	});

	it("ranks exact label matches higher than full text matches", () => {
		const { index } = createSearchFixture();
		const docs = buildSearchIndex(index);

		// 'auth' matches label 'auth-flow' on user1, and content in asst1 and comp1
		const results = executeSearch(
			"auth",
			docs,
			{
				mode: "fuzzy",
				scope: "all",
				caseSensitive: false,
				maxResults: 10,
			},
			index,
		);
		expect(results.length).toBeGreaterThan(1);
		// user1 with label 'auth-flow' should be top result due to label bonus
		expect(results[0].document.id).toBe("user1");
	});

	it("restricts search to focused-subtree when scope is focused-subtree", () => {
		const { index } = createSearchFixture();
		const docs = buildSearchIndex(index);

		// user2_branchB is on Branch B, user2_branchA is on Branch A
		const allResults = executeSearch(
			"OAuth2",
			docs,
			{
				mode: "fuzzy",
				scope: "all",
				caseSensitive: false,
				maxResults: 10,
			},
			index,
		);
		expect(allResults.length).toBe(1);
		expect(allResults[0].document.id).toBe("user2_branchB");

		// Scoped to Branch A only
		const scopedResults = executeSearch(
			"OAuth2",
			docs,
			{
				mode: "fuzzy",
				scope: "focused-subtree",
				focusedBranchId: "user2_branchA",
				caseSensitive: false,
				maxResults: 10,
			},
			index,
		);
		expect(scopedResults.length).toBe(0); // Excluded!
	});

	it("manages reversible search reveal: cancel restores snapshot, accept keeps reveal, normal Esc clears", () => {
		const { index, state } = createSearchFixture();
		state.displayOptions.showAssistantNodes = false;
		state.foldOptions.mode = "focused-only";

		// Branch B (user2_branchB) is initially collapsed into virtual summary
		let visible = buildDisplayProjection(index, state);
		expect(visible.some((n) => n.id === "user2_branchB")).toBe(false);
		expect(visible.some((n) => n.id === "virtual:branch:user2_branchB")).toBe(
			true,
		);

		const registry = createActionRegistry();
		const ctx: ActionContext = {
			state,
			index,
			visibleNodes: visible,
			close: () => {},
			reproject: () => {
				ctx.visibleNodes = buildDisplayProjection(index, state);
			},
		};

		// 1. Open search mode
		registry.get("search.open")?.execute(ctx);
		expect(state.mode).toBe("search");
		expect(state.searchSnapshot).toBeDefined();

		// Simulate finding user2_branchB
		state.searchQuery = "OAuth2";
		state.searchResults = [{ id: "user2_branchB", score: 100 }];
		state.searchResultIndex = 0;

		// 2. Cancel search (Esc while in search mode)
		registry.get("search.clear")?.execute(ctx);
		expect(state.mode).toBe("normal");
		expect(state.searchQuery).toBe("");
		// Restored to pre-search state
		visible = buildDisplayProjection(index, state);
		expect(visible.some((n) => n.id === "user2_branchB")).toBe(false);
		expect(visible.some((n) => n.id === "virtual:branch:user2_branchB")).toBe(
			true,
		);

		// 3. Open search again and accept
		registry.get("search.open")?.execute(ctx);
		state.searchQuery = "OAuth2";
		state.searchResults = [{ id: "user2_branchB", score: 100 }];
		state.searchResultIndex = 0;

		registry.get("search.accept")?.execute(ctx);
		expect(state.mode).toBe("normal");
		expect(state.selectedEntryId).toBe("user2_branchB");
		// Path was temporarily revealed!
		expect(state.temporaryRevealedIds.has("user2_branchB")).toBe(true);

		visible = buildDisplayProjection(index, state);
		expect(visible.some((n) => n.id === "user2_branchB")).toBe(true);

		// 4. Clear search in normal mode (Esc in normal mode)
		registry.get("search.clear")?.execute(ctx);
		expect(state.searchQuery).toBe("");
		expect(state.temporaryRevealedIds.size).toBe(0);

		// After clearing, user2_branchB is collapsed again, and selection falls back to nearest visible ancestor!
		visible = buildDisplayProjection(index, state);
		expect(visible.some((n) => n.id === "user2_branchB")).toBe(false);
		expect(visible.some((n) => n.id === state.selectedEntryId)).toBe(true);
		expect(state.selectedEntryId).toBe("comp1"); // nearest visible ancestor!
	});

	it("temporarily reveals hidden assistant nodes upon search match without permanently modifying displayOptions", () => {
		const { index, state } = createSearchFixture();
		state.displayOptions.showAssistantNodes = false; // Assistant nodes hidden

		let visible = buildDisplayProjection(index, state);
		expect(visible.some((n) => n.id === "asst1")).toBe(false);

		const registry = createActionRegistry();
		const ctx: ActionContext = {
			state,
			index,
			visibleNodes: visible,
			close: () => {},
			reproject: () => {
				ctx.visibleNodes = buildDisplayProjection(index, state);
			},
		};

		// Open search and find asst1
		registry.get("search.open")?.execute(ctx);
		state.searchQuery = "tokens";
		state.searchResults = [{ id: "asst1", score: 100 }];
		state.searchResultIndex = 0;

		// Accept search result
		registry.get("search.accept")?.execute(ctx);
		expect(state.selectedEntryId).toBe("asst1");

		visible = buildDisplayProjection(index, state);
		// asst1 is temporarily rendered as a real entry!
		const asstNode = visible.find((n) => n.id === "asst1");
		expect(asstNode).toBeDefined();
		expect(asstNode?.isVirtual).toBe(false);

		// Underlying displayOptions remains false!
		expect(state.displayOptions.showAssistantNodes).toBe(false);
	});
});
