import { describe, expect, it } from "vitest";
import { createActionRegistry } from "../extensions/actions.ts";
import { buildDisplayProjection } from "../extensions/display.ts";
import { createInitialState } from "../extensions/state.ts";
import { buildTreeIndex } from "../extensions/tree-index.ts";
import type { ActionContext, SessionEntry } from "../extensions/types.ts";

describe("Action Registry & Browsing Invariants", () => {
	it("registers all 17 node actions, 13 branch actions, and session.close", () => {
		const registry = createActionRegistry();

		const expectedNodeActions = [
			"node.next",
			"node.prev",
			"node.parent",
			"node.firstChild",
			"node.lastChild",
			"node.nextSibling",
			"node.prevSibling",
			"node.firstSibling",
			"node.root",
			"node.last",
			"node.current",
			"node.pageDown",
			"node.pageUp",
			"node.nextLabel",
			"node.prevLabel",
			"node.nextUser",
			"node.prevUser",
		];

		const expectedBranchActions = [
			"branch.next",
			"branch.prev",
			"branch.parent",
			"branch.root",
			"branch.leaf",
			"branch.first",
			"branch.last",
			"branch.nextFork",
			"branch.prevFork",
			"branch.active",
			"branch.nextLeaf",
			"branch.prevLeaf",
			"branch.cycle",
		];

		for (const id of expectedNodeActions) {
			expect(registry.has(id), `Missing node action: ${id}`).toBe(true);
		}

		for (const id of expectedBranchActions) {
			expect(registry.has(id), `Missing branch action: ${id}`).toBe(true);
		}

		expect(registry.has("session.close")).toBe(true);
		expect(registry.size).toBe(52);
	});

	it("executes actions updating ExplorerState in memory without mutating session entries", () => {
		const entries: SessionEntry[] = [
			{ type: "message", id: "root", parentId: null, timestamp: "T0" },
			{ type: "message", id: "child1", parentId: "root", timestamp: "T1" },
			{ type: "message", id: "child2", parentId: "root", timestamp: "T2" },
		];
		// Freeze entries to prove immutability
		const rawSnapshot = JSON.stringify(entries);

		const index = buildTreeIndex(entries);
		const state = createInitialState("test-sess", {
			selectedEntryId: "root",
			sessionLeafId: "child2",
			focusedPathIds: new Set(["root", "child2"]),
			foldOptions: {
				mode: "all",
				collapseInactiveBranches: false,
				collapseLinearPaths: false,
				rememberManualOverrides: false,
				maxExpandDepth: 0,
			},
		});

		const visibleNodes = buildDisplayProjection(index, state);
		let closed = false;

		const ctx: ActionContext = {
			state,
			index,
			visibleNodes,
			close: () => {
				closed = true;
			},
		};

		const registry = createActionRegistry();

		// Execute node.next
		registry.get("node.next")?.execute(ctx);
		expect(state.selectedEntryId).toBe("child1");

		// Execute node.next again
		registry.get("node.next")?.execute(ctx);
		expect(state.selectedEntryId).toBe("child2");

		// Execute node.parent
		registry.get("node.parent")?.execute(ctx);
		expect(state.selectedEntryId).toBe("root");

		// Execute session.close
		registry.get("session.close")?.execute(ctx);
		expect(closed).toBe(true);

		// Verify session entries remain completely untouched!
		expect(JSON.stringify(entries)).toBe(rawSnapshot);
		expect(state.sessionLeafId).toBe("child2"); // Real leaf did not change!
	});
});
