import { describe, expect, it } from "vitest";
import { buildDisplayProjection } from "../extensions/display.ts";
import {
	findNearestBranch,
	getBranchLeaves,
	navBranchActive,
	navBranchCycle,
	navBranchFirst,
	navBranchLast,
	navBranchLeaf,
	navBranchNext,
	navBranchNextFork,
	navBranchNextLeaf,
	navBranchParent,
	navBranchPrev,
	navBranchPrevFork,
	navBranchPrevLeaf,
	navBranchRoot,
	navNodeCurrent,
	navNodeFirstChild,
	navNodeFirstSibling,
	navNodeLast,
	navNodeLastChild,
	navNodeNext,
	navNodeNextLabel,
	navNodeNextSibling,
	navNodeNextUser,
	navNodePageDown,
	navNodePageUp,
	navNodeParent,
	navNodePrev,
	navNodePrevLabel,
	navNodePrevSibling,
	navNodePrevUser,
	navNodeRoot,
	resolveBranchLeaf,
} from "../extensions/navigation.ts";
import { buildTreeIndex } from "../extensions/tree-index.ts";
import type { ExplorerState, SessionEntry } from "../extensions/types.ts";

function createMockState(override: Partial<ExplorerState> = {}): ExplorerState {
	return {
		sessionId: "test-session",
		selectedEntryId: null,
		sessionLeafId: null,
		focusedBranchId: null,
		focusedPathIds: new Set<string>(),
		mode: "normal",
		searchQuery: "",
		recentLeafByBranch: new Map<string, string>(),
		scrollOffset: 0,
		version: 1,
		...override,
	};
}

describe("Navigation & Branch Semantics", () => {
	// Standard normative fixture from Spec 0008:
	// Root
	// └─ A
	//    ├─ B1
	//    │  └─ C1
	//    │     └─ D1
	//    ├─ B2
	//    │  └─ C2
	//    │     └─ D2
	//    └─ B3
	//       └─ C3
	function createNormativeFixture() {
		const entries: SessionEntry[] = [
			{
				type: "message",
				id: "Root",
				parentId: null,
				timestamp: "2026-11-09T00:00:00Z",
				message: { role: "system", content: "sys" },
			},
			{
				type: "message",
				id: "A",
				parentId: "Root",
				timestamp: "2026-11-09T00:00:01Z",
				message: { role: "user", content: "A" },
			},
			{
				type: "message",
				id: "B1",
				parentId: "A",
				timestamp: "2026-11-09T00:00:02Z",
				message: { role: "assistant", content: "B1" },
			},
			{
				type: "message",
				id: "C1",
				parentId: "B1",
				timestamp: "2026-11-09T00:00:03Z",
				message: { role: "user", content: "C1" },
			},
			{
				type: "message",
				id: "D1",
				parentId: "C1",
				timestamp: "2026-11-09T00:00:04Z",
				message: { role: "assistant", content: "D1" },
			},
			{
				type: "message",
				id: "B2",
				parentId: "A",
				timestamp: "2026-11-09T00:00:05Z",
				message: { role: "assistant", content: "B2" },
			},
			{
				type: "message",
				id: "C2",
				parentId: "B2",
				timestamp: "2026-11-09T00:00:06Z",
				message: { role: "user", content: "C2" },
			},
			{
				type: "message",
				id: "D2",
				parentId: "C2",
				timestamp: "2026-11-09T00:00:07Z",
				message: { role: "assistant", content: "D2" },
			},
			{
				type: "message",
				id: "B3",
				parentId: "A",
				timestamp: "2026-11-09T00:00:08Z",
				message: { role: "assistant", content: "B3" },
			},
			{
				type: "message",
				id: "C3",
				parentId: "B3",
				timestamp: "2026-11-09T00:00:09Z",
				message: { role: "user", content: "C3" },
			},
		];
		const index = buildTreeIndex(entries);
		const state = createMockState({ selectedEntryId: "D1" });
		const visibleNodes = buildDisplayProjection(index, state);
		return { index, state, visibleNodes };
	}

	describe("Normative D1 / C2 test cases from Spec 0008", () => {
		it("satisfies all actions when D1 is selected", () => {
			const { index, state, visibleNodes } = createNormativeFixture();

			expect(navNodeParent("D1", visibleNodes, index)).toBe("C1");
			expect(navNodeNextSibling("D1", visibleNodes, index)).toBe("D1");
			expect(navBranchParent("D1", index)).toBe("A");
			expect(navBranchRoot("D1", index)).toBe("B1");
			expect(navBranchNext("D1", index)).toBe("B2");
			expect(navBranchPrev("D1", index)).toBe("D1");
			expect(navBranchLeaf("D1", index, state)).toBe("D1");
		});

		it("satisfies all actions when C2 is selected", () => {
			const { index, state, visibleNodes } = createNormativeFixture();

			expect(navNodeParent("C2", visibleNodes, index)).toBe("B2");
			expect(navBranchParent("C2", index)).toBe("A");
			expect(navBranchRoot("C2", index)).toBe("B2");
			expect(navBranchNext("C2", index)).toBe("B3");
			expect(navBranchPrev("C2", index)).toBe("B1");
			expect(navBranchLeaf("C2", index, state)).toBe("D2");
		});
	});

	describe("17 Node Navigation Actions", () => {
		it("exercises node.next, node.prev, node.root, and node.last", () => {
			const { index, visibleNodes } = createNormativeFixture();

			expect(navNodeNext("Root", visibleNodes)).toBe("A");
			expect(navNodePrev("A", visibleNodes)).toBe("Root");
			expect(navNodePrev("Root", visibleNodes)).toBe("Root"); // Boundary
			expect(navNodeLast("Root", visibleNodes)).toBe("C3");
			expect(navNodeNext("C3", visibleNodes)).toBe("C3"); // Boundary
			expect(navNodeRoot("D2", visibleNodes, index)).toBe("Root");
		});

		it("exercises node.firstChild and node.lastChild", () => {
			const { index, visibleNodes } = createNormativeFixture();

			expect(navNodeFirstChild("A", visibleNodes, index)).toBe("B1");
			expect(navNodeLastChild("A", visibleNodes, index)).toBe("B3");
			// Leaf node has no children, returns itself
			expect(navNodeFirstChild("D1", visibleNodes, index)).toBe("D1");
			expect(navNodeLastChild("D1", visibleNodes, index)).toBe("D1");
		});

		it("exercises node.nextSibling, node.prevSibling, and node.firstSibling", () => {
			const { index, visibleNodes } = createNormativeFixture();

			expect(navNodeNextSibling("B1", visibleNodes, index)).toBe("B2");
			expect(navNodeNextSibling("B2", visibleNodes, index)).toBe("B3");
			expect(navNodeNextSibling("B3", visibleNodes, index)).toBe("B3"); // Last sibling

			expect(navNodePrevSibling("B3", visibleNodes, index)).toBe("B2");
			expect(navNodePrevSibling("B2", visibleNodes, index)).toBe("B1");
			expect(navNodePrevSibling("B1", visibleNodes, index)).toBe("B1"); // First sibling

			expect(navNodeFirstSibling("B3", visibleNodes, index)).toBe("B1");
		});

		it("exercises node.pageDown and node.pageUp", () => {
			const { visibleNodes } = createNormativeFixture();

			const next = navNodePageDown("Root", visibleNodes, 6);
			expect(next).toBe("C1"); // Root + 3
			const prev = navNodePageUp(next, visibleNodes, 6);
			expect(prev).toBe("Root");
		});

		it("exercises node.current", () => {
			const { visibleNodes } = createNormativeFixture();
			expect(navNodeCurrent(visibleNodes, "D2")).toBe("D2");
			expect(navNodeCurrent(visibleNodes, null)).toBe("Root");
		});

		it("exercises node.nextLabel and node.prevLabel", () => {
			const entries: SessionEntry[] = [
				{ type: "message", id: "1", parentId: null, timestamp: "T1" },
				{
					type: "message",
					id: "2",
					parentId: "1",
					timestamp: "T2",
					label: "bm1",
				},
				{ type: "message", id: "3", parentId: "2", timestamp: "T3" },
				{
					type: "message",
					id: "4",
					parentId: "3",
					timestamp: "T4",
					label: "bm2",
				},
			];
			const index = buildTreeIndex(entries);
			const state = createMockState();
			const visibleNodes = buildDisplayProjection(index, state);

			expect(navNodeNextLabel("1", visibleNodes)).toBe("2");
			expect(navNodeNextLabel("2", visibleNodes)).toBe("4");
			expect(navNodeNextLabel("4", visibleNodes)).toBe("4"); // Boundary

			expect(navNodePrevLabel("4", visibleNodes)).toBe("2");
			expect(navNodePrevLabel("2", visibleNodes)).toBe("2"); // Boundary
		});

		it("exercises node.nextUser and node.prevUser", () => {
			const { visibleNodes } = createNormativeFixture();
			// User nodes in fixture: A, C1, C2, C3
			expect(navNodeNextUser("Root", visibleNodes)).toBe("A");
			expect(navNodeNextUser("A", visibleNodes)).toBe("C1");
			expect(navNodeNextUser("C1", visibleNodes)).toBe("C2");
			expect(navNodeNextUser("C2", visibleNodes)).toBe("C3");
			expect(navNodeNextUser("C3", visibleNodes)).toBe("C3"); // Boundary

			expect(navNodePrevUser("C3", visibleNodes)).toBe("C2");
			expect(navNodePrevUser("C2", visibleNodes)).toBe("C1");
			expect(navNodePrevUser("C1", visibleNodes)).toBe("A");
			expect(navNodePrevUser("A", visibleNodes)).toBe("A"); // Boundary
		});
	});

	describe("13 Branch Navigation Actions", () => {
		it("exercises branch.first, branch.last, and branch.cycle", () => {
			const { index } = createNormativeFixture();

			expect(navBranchFirst("D1", index)).toBe("B1");
			expect(navBranchLast("D1", index)).toBe("B3");

			expect(navBranchCycle("D1", index)).toBe("B2");
			expect(navBranchCycle("B2", index)).toBe("B3");
			expect(navBranchCycle("B3", index)).toBe("B1"); // Cycles back to first
		});

		it("exercises branch.nextFork and branch.prevFork within current Root", () => {
			const entries: SessionEntry[] = [
				{ type: "message", id: "Root", parentId: null, timestamp: "T0" },
				{ type: "message", id: "Fork1", parentId: "Root", timestamp: "T1" },
				{
					type: "message",
					id: "F1_Child1",
					parentId: "Fork1",
					timestamp: "T2",
				},
				{
					type: "message",
					id: "Fork2",
					parentId: "F1_Child1",
					timestamp: "T3",
				},
				{ type: "message", id: "LeafA", parentId: "Fork2", timestamp: "T4" },
				{ type: "message", id: "LeafB", parentId: "Fork2", timestamp: "T5" },
				{
					type: "message",
					id: "F1_Child2",
					parentId: "Fork1",
					timestamp: "T6",
				},
			];
			const index = buildTreeIndex(entries);

			expect(index.forkPointIds.has("Fork1")).toBe(true);
			expect(index.forkPointIds.has("Fork2")).toBe(true);

			expect(navBranchNextFork("Fork1", index)).toBe("Fork2");
			expect(navBranchNextFork("Fork2", index)).toBe("Fork2"); // Boundary

			expect(navBranchPrevFork("Fork2", index)).toBe("Fork1");
			expect(navBranchPrevFork("Fork1", index)).toBe("Fork1"); // Boundary
		});

		it("exercises branch.nextLeaf and branch.prevLeaf within branch leaf set", () => {
			const entries: SessionEntry[] = [
				{ type: "message", id: "Fork", parentId: null, timestamp: "T0" },
				{ type: "message", id: "Branch1", parentId: "Fork", timestamp: "T1" },
				{
					type: "message",
					id: "SubFork",
					parentId: "Branch1",
					timestamp: "T2",
				},
				{ type: "message", id: "Leaf1A", parentId: "SubFork", timestamp: "T3" },
				{ type: "message", id: "Leaf1B", parentId: "SubFork", timestamp: "T4" },
				{ type: "message", id: "Branch2", parentId: "Fork", timestamp: "T5" },
			];
			const index = buildTreeIndex(entries);

			expect(getBranchLeaves("Branch1", index)).toEqual(["Leaf1A", "Leaf1B"]);
			expect(navBranchNextLeaf("Leaf1A", index)).toBe("Leaf1B");
			expect(navBranchNextLeaf("Leaf1B", index)).toBe("Leaf1B"); // Boundary

			expect(navBranchPrevLeaf("Leaf1B", index)).toBe("Leaf1A");
			expect(navBranchPrevLeaf("Leaf1A", index)).toBe("Leaf1A"); // Boundary
		});

		it("exercises branch.active", () => {
			const { index, state } = createNormativeFixture();
			state.sessionLeafId = "D2";
			expect(navBranchActive(index, state)).toBe("D2");
		});
	});

	describe("Boundary and Special Rules", () => {
		it("selected fork node is located relative to its own ancestors, not entering its child", () => {
			const entries: SessionEntry[] = [
				{ type: "message", id: "Root", parentId: null, timestamp: "T0" },
				{ type: "message", id: "A", parentId: "Root", timestamp: "T1" },
				{ type: "message", id: "B1", parentId: "A", timestamp: "T2" },
				{ type: "message", id: "B2", parentId: "A", timestamp: "T3" },
			];
			const index = buildTreeIndex(entries);

			const branch = findNearestBranch("A", index);
			expect(branch).toBeNull();
			expect(navBranchNext("A", index)).toBe("A");
		});

		it("handles nested forks: nearest fork takes precedence over outer fork", () => {
			const entries: SessionEntry[] = [
				{ type: "message", id: "OuterFork", parentId: null, timestamp: "T0" },
				{
					type: "message",
					id: "InnerFork",
					parentId: "OuterFork",
					timestamp: "T1",
				},
				{
					type: "message",
					id: "Leaf1",
					parentId: "InnerFork",
					timestamp: "T2",
				},
				{
					type: "message",
					id: "Leaf2",
					parentId: "InnerFork",
					timestamp: "T3",
				},
				{
					type: "message",
					id: "Other",
					parentId: "OuterFork",
					timestamp: "T4",
				},
			];
			const index = buildTreeIndex(entries);

			const branch = findNearestBranch("Leaf1", index);
			expect(branch).not.toBeNull();
			expect(branch?.forkPointId).toBe("InnerFork");
			expect(branch?.branchRootId).toBe("Leaf1");
			expect(navBranchNext("Leaf1", index)).toBe("Leaf2");

			expect(navBranchNext("Leaf2", index)).toBe("Leaf2");
		});

		it("does not rotate sibling branches across multiple roots", () => {
			const entries: SessionEntry[] = [
				{ type: "message", id: "Root1", parentId: null, timestamp: "T0" },
				{ type: "message", id: "R1_A", parentId: "Root1", timestamp: "T1" },
				{ type: "message", id: "Root2", parentId: null, timestamp: "T2" },
				{ type: "message", id: "R2_A", parentId: "Root2", timestamp: "T3" },
			];
			const index = buildTreeIndex(entries);

			expect(navBranchNext("Root1", index)).toBe("Root1");
			expect(navBranchNext("R1_A", index)).toBe("R1_A");
		});

		it("resolves branch.leaf with priorities: focused path > recent visit > last session order", () => {
			const entries: SessionEntry[] = [
				{ type: "message", id: "Fork", parentId: null, timestamp: "T0" },
				{ type: "message", id: "Branch", parentId: "Fork", timestamp: "T1" },
				{ type: "message", id: "Leaf1", parentId: "Branch", timestamp: "T2" },
				{ type: "message", id: "Leaf2", parentId: "Branch", timestamp: "T3" },
				{ type: "message", id: "Leaf3", parentId: "Branch", timestamp: "T4" },
			];
			const index = buildTreeIndex(entries);

			// 1. Focused path preference
			const state1 = createMockState({ focusedPathIds: new Set(["Leaf2"]) });
			expect(resolveBranchLeaf("Branch", index, state1)).toBe("Leaf2");

			// 2. Recent visit preference when not on focused path
			const state2 = createMockState({
				recentLeafByBranch: new Map([["Branch", "Leaf1"]]),
			});
			expect(resolveBranchLeaf("Branch", index, state2)).toBe("Leaf1");

			// 3. Last leaf in session order fallback
			const state3 = createMockState();
			expect(resolveBranchLeaf("Branch", index, state3)).toBe("Leaf3");
		});
	});
});
