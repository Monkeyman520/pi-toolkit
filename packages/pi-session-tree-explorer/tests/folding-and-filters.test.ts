import { describe, expect, it } from "vitest";
import { createActionRegistry } from "../extensions/actions.ts";
import { buildDisplayProjection } from "../extensions/display.ts";
import { createInitialState } from "../extensions/state.ts";
import { buildTreeIndex } from "../extensions/tree-index.ts";
import type { ActionContext, SessionEntry } from "../extensions/types.ts";

describe("T0002: Folding and Composable Filters", () => {
	// Fixture with hidden assistant chain and branching:
	// Root (user)
	// └─ Asst1 (assistant)
	//    └─ User2 (user)
	//       └─ Asst2 (assistant)
	//          ├─ User3A (user, labeled)
	//          │  └─ Asst3A (assistant)
	//          └─ User3B (user)
	//             └─ Asst3B (assistant)
	function createFixture() {
		const entries: SessionEntry[] = [
			{
				type: "message",
				id: "root",
				parentId: null,
				timestamp: "T0",
				message: { role: "user", content: "Prompt 1" },
			},
			{
				type: "message",
				id: "asst1",
				parentId: "root",
				timestamp: "T1",
				message: { role: "assistant", content: "Reply 1" },
			},
			{
				type: "message",
				id: "user2",
				parentId: "asst1",
				timestamp: "T2",
				message: { role: "user", content: "Prompt 2" },
			},
			{
				type: "message",
				id: "asst2",
				parentId: "user2",
				timestamp: "T3",
				message: { role: "assistant", content: "Reply 2" },
			},
			{
				type: "message",
				id: "user3A",
				parentId: "asst2",
				timestamp: "T4",
				label: "bmA",
				message: { role: "user", content: "Branch A" },
			},
			{
				type: "message",
				id: "asst3A",
				parentId: "user3A",
				timestamp: "T5",
				message: { role: "assistant", content: "Reply A" },
			},
			{
				type: "message",
				id: "user3B",
				parentId: "asst2",
				timestamp: "T6",
				message: { role: "user", content: "Branch B" },
			},
			{
				type: "message",
				id: "asst3B",
				parentId: "user3B",
				timestamp: "T7",
				message: { role: "assistant", content: "Reply B" },
			},
		];
		const index = buildTreeIndex(entries);
		const state = createInitialState("test-session", {
			selectedEntryId: "root",
			sessionLeafId: "asst3A",
			focusedPathIds: new Set([
				"root",
				"asst1",
				"user2",
				"asst2",
				"user3A",
				"asst3A",
			]),
		});
		return { entries, index, state };
	}

	it("reconnects visible parent when assistant nodes are hidden without altering real parentId", () => {
		const { index, state } = createFixture();
		state.displayOptions.showAssistantNodes = false;
		state.foldOptions.mode = "all";

		const visible = buildDisplayProjection(index, state);
		const visibleIds = visible.map((n) => n.id);

		// Only users are visible
		expect(visibleIds).toEqual(["root", "user2", "user3A", "user3B"]);

		// Logical visible parent of user2 should be root (since asst1 is hidden!)
		const nodeUser2 = visible.find((n) => n.id === "user2");
		expect(nodeUser2).toBeDefined();
		if (!nodeUser2) return;
		expect(nodeUser2.visibleParentId).toBe("root");

		// Real parentId in tree index remains unchanged!
		expect(index.parentById.get("user2")).toBe("asst1");

		// Logical visible parent of user3A and user3B should be user2 (since asst2 is hidden!)
		const nodeUser3A = visible.find((n) => n.id === "user3A");
		expect(nodeUser3A).toBeDefined();
		if (!nodeUser3A) return;
		expect(nodeUser3A.visibleParentId).toBe("user2");
		expect(index.parentById.get("user3A")).toBe("asst2");
	});

	it("focused-only mode focuses active path and collapses inactive sibling branches into virtual summaries", () => {
		const { index, state } = createFixture();
		state.displayOptions.showAssistantNodes = true;
		state.foldOptions.mode = "focused-only";

		const visible = buildDisplayProjection(index, state);
		const visibleIds = visible.map((n) => n.id);

		// Focused branch is Branch A (user3A, asst3A)
		expect(visibleIds).toContain("user3A");
		expect(visibleIds).toContain("asst3A");

		// Branch B (user3B) is not on focused path, so it appears as a virtual collapsed summary!
		const virtualBranchB = visible.find(
			(n) => n.id === "virtual:branch:user3B",
		);
		expect(virtualBranchB).toBeDefined();
		expect(virtualBranchB?.isVirtual).toBe(true);
		expect(virtualBranchB?.isVirtualSummary).toBe(true);
		expect(virtualBranchB?.anchorEntryId).toBe("user3B");
		expect(virtualBranchB?.virtualDescendantCount).toBe(2); // user3B + asst3B
		expect(virtualBranchB?.summaryText).toContain("Branch B");
	});

	it("Enter or fold.toggle expands virtual branch summaries without navigating", () => {
		const { index, state } = createFixture();
		state.displayOptions.showAssistantNodes = true;
		state.foldOptions.mode = "focused-only";

		let visible = buildDisplayProjection(index, state);
		expect(visible.some((n) => n.id === "virtual:branch:user3B")).toBe(true);

		state.selectedEntryId = "virtual:branch:user3B";

		const registry = createActionRegistry();
		const ctx: ActionContext = {
			state,
			index,
			visibleNodes: visible,
			close: () => {},
			reproject: () => {
				visible = buildDisplayProjection(index, state);
			},
		};

		// Dispatch fold.toggle on virtual summary row
		registry.get("fold.toggle")?.execute(ctx);

		// Virtual summary is now expanded; real entry user3B is selected!
		expect(state.selectedEntryId).toBe("user3B");
		expect(state.manualExpandedIds.has("user3B")).toBe(true);

		const updatedVisible = buildDisplayProjection(index, state);
		expect(updatedVisible.some((n) => n.id === "user3B")).toBe(true);
		expect(updatedVisible.some((n) => n.id === "asst3B")).toBe(true);
		expect(updatedVisible.some((n) => n.id === "virtual:branch:user3B")).toBe(
			false,
		);
	});

	it("verifies fold precedence: search reveal > manual overrides > policy > default", () => {
		const { index, state } = createFixture();
		state.displayOptions.showAssistantNodes = true;

		// 1. Policy (focused-only): user3B is collapsed by policy
		state.foldOptions.mode = "focused-only";
		let visible = buildDisplayProjection(index, state);
		expect(visible.some((n) => n.id === "virtual:branch:user3B")).toBe(true);

		// 2. Manual override: expand user3B manually -> overrides policy
		state.manualExpandedIds.add("user3B");
		visible = buildDisplayProjection(index, state);
		expect(visible.some((n) => n.id === "user3B")).toBe(true);

		// 3. Manual override: collapse user3A manually (becomes virtual summary because its parent asst2 is a fork!)
		state.manualCollapsedIds.add("user3A");
		visible = buildDisplayProjection(index, state);
		expect(visible.some((n) => n.id === "virtual:branch:user3A")).toBe(true);

		// 4. Temporary search reveal: reveal asst3A -> overrides manual collapse on user3A!
		state.temporaryRevealedIds.add("asst3A");
		visible = buildDisplayProjection(index, state);
		// user3A and asst3A must be revealed/expanded because child asst3A is temporarily revealed
		expect(visible.some((n) => n.id === "user3A")).toBe(true);
		expect(visible.some((n) => n.id === "asst3A")).toBe(true);
		expect(visible.some((n) => n.id === "virtual:branch:user3A")).toBe(false);

		// 5. Remove temporary reveal: restores underlying manual collapse state!
		state.temporaryRevealedIds.clear();
		visible = buildDisplayProjection(index, state);
		expect(visible.some((n) => n.id === "virtual:branch:user3A")).toBe(true);
	});

	it("supports all fold modes: all, active-only, depth-limited, manual", () => {
		const { index, state } = createFixture();
		state.displayOptions.showAssistantNodes = true;

		// 'all' mode: everything expanded
		state.foldOptions.mode = "all";
		let visible = buildDisplayProjection(index, state);
		expect(visible.length).toBe(8);

		// 'active-only' mode: active leaf is asst3A
		state.sessionLeafId = "asst3A";
		state.foldOptions.mode = "active-only";
		visible = buildDisplayProjection(index, state);
		expect(visible.some((n) => n.id === "user3A")).toBe(true);
		expect(visible.some((n) => n.id === "virtual:branch:user3B")).toBe(true);

		// 'depth-limited' mode: maxExpandDepth = 1
		state.foldOptions.mode = "depth-limited";
		state.foldOptions.maxExpandDepth = 1;
		visible = buildDisplayProjection(index, state);
		const maxDepth = Math.max(...visible.map((n) => n.rawDepth));
		expect(maxDepth).toBeLessThanOrEqual(1);

		// 'manual' mode: only manual overrides apply
		state.foldOptions.mode = "manual";
		state.manualCollapsedIds.add("user2");
		visible = buildDisplayProjection(index, state);
		expect(visible.find((n) => n.id === "user2")?.isCollapsed).toBe(true);
	});

	it("intersects composable filters: userOnly, branchOnly, labeledOnly", () => {
		const { index, state } = createFixture();
		state.displayOptions.showAssistantNodes = true;
		state.foldOptions.mode = "all";

		// 1. userOnly filter: only user messages survive
		state.displayOptions.userOnly = true;
		let visible = buildDisplayProjection(index, state);
		expect(visible.every((n) => n.role === "user")).toBe(true);
		expect(visible.map((n) => n.id)).toEqual([
			"root",
			"user2",
			"user3A",
			"user3B",
		]);

		// 2. labeledOnly intersecting: only labeled nodes survive
		state.displayOptions.labeledOnly = true;
		visible = buildDisplayProjection(index, state);
		expect(visible.map((n) => n.id)).toEqual(["user3A"]);

		// 3. branchOnly intersecting: user3A is not a fork point or branch summary
		state.displayOptions.branchOnly = true;
		visible = buildDisplayProjection(index, state);
		// Unsatisfiable combination produces empty state
		expect(visible.length).toBe(0);

		// 4. filter.reset restores defaults
		const registry = createActionRegistry();
		registry.get("filter.reset")?.execute({
			state,
			index,
			visibleNodes: visible,
			close: () => {},
		});
		expect(state.displayOptions.userOnly).toBe(false);
		expect(state.displayOptions.labeledOnly).toBe(false);
		expect(state.displayOptions.branchOnly).toBe(false);
	});

	it("executes all 11 fold actions and updates state correctly", () => {
		const { index, state } = createFixture();
		state.displayOptions.showAssistantNodes = true;
		state.foldOptions.mode = "all";

		const registry = createActionRegistry();
		const ctx: ActionContext = {
			state,
			index,
			visibleNodes: buildDisplayProjection(index, state),
			close: () => {},
			reproject: () => {
				ctx.visibleNodes = buildDisplayProjection(index, state);
			},
		};

		state.selectedEntryId = "user2";

		// fold.collapse
		registry.get("fold.collapse")?.execute(ctx);
		expect(state.manualCollapsedIds.has("user2")).toBe(true);

		// fold.expand
		registry.get("fold.expand")?.execute(ctx);
		expect(state.manualExpandedIds.has("user2")).toBe(true);

		// fold.expandAll
		registry.get("fold.expandAll")?.execute(ctx);
		expect(state.foldOptions.mode).toBe("all");

		// fold.collapseAll
		registry.get("fold.collapseAll")?.execute(ctx);
		expect(state.foldOptions.mode).toBe("depth-limited");
		expect(state.foldOptions.maxExpandDepth).toBe(0);

		// fold.increaseDepth & fold.decreaseDepth
		registry.get("fold.increaseDepth")?.execute(ctx);
		expect(state.foldOptions.maxExpandDepth).toBe(1);
		registry.get("fold.decreaseDepth")?.execute(ctx);
		expect(state.foldOptions.maxExpandDepth).toBe(0);

		// fold.activeOnly & fold.focusedOnly
		registry.get("fold.activeOnly")?.execute(ctx);
		expect(state.foldOptions.mode).toBe("active-only");
		registry.get("fold.focusedOnly")?.execute(ctx);
		expect(state.foldOptions.mode).toBe("focused-only");

		// fold.collapseSiblings
		state.selectedEntryId = "user3A";
		registry.get("fold.collapseSiblings")?.execute(ctx);
		expect(state.manualCollapsedIds.has("user3B")).toBe(true);

		// fold.restoreDefault
		registry.get("fold.restoreDefault")?.execute(ctx);
		expect(state.foldOptions.mode).toBe("focused-only");
		expect(state.manualCollapsedIds.size).toBe(0);
	});
});
