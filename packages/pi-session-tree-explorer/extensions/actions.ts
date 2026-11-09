import {
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
} from "./navigation.ts";
import type { ActionContext, ActionDefinition } from "./types.ts";

function updateSelection(
	ctx: ActionContext,
	targetId: string | null,
	updateFocus = false,
) {
	if (!targetId || targetId === ctx.state.selectedEntryId) return;
	ctx.state.selectedEntryId = targetId;

	// Keep recent leaf updated if the selected node is a leaf
	if (ctx.index.leafIds.has(targetId)) {
		let current = targetId;
		while (current) {
			const p = ctx.index.parentById.get(current);
			if (p && (ctx.index.childrenById.get(p)?.length ?? 0) > 1) {
				ctx.state.recentLeafByBranch.set(current, targetId);
				break;
			}
			current = p ?? "";
		}
	}

	if (updateFocus) {
		ctx.state.focusedBranchId = targetId;
	}
	ctx.state.version++;
}

export function createActionRegistry(): Map<string, ActionDefinition> {
	const registry = new Map<string, ActionDefinition>();

	function register(action: ActionDefinition) {
		registry.set(action.id, action);
	}

	// 17 Node Actions
	register({
		id: "node.next",
		description: "Next visible row",
		defaultKeys: ["j", "down"],
		modes: ["normal"],
		execute: (ctx) => {
			const target = navNodeNext(ctx.state.selectedEntryId, ctx.visibleNodes);
			updateSelection(ctx, target);
		},
	});

	register({
		id: "node.prev",
		description: "Previous visible row",
		defaultKeys: ["k", "up"],
		modes: ["normal"],
		execute: (ctx) => {
			const target = navNodePrev(ctx.state.selectedEntryId, ctx.visibleNodes);
			updateSelection(ctx, target);
		},
	});

	register({
		id: "node.parent",
		description: "Nearest logical visible parent",
		defaultKeys: ["H"],
		modes: ["normal"],
		execute: (ctx) => {
			const target = navNodeParent(
				ctx.state.selectedEntryId,
				ctx.visibleNodes,
				ctx.index,
			);
			updateSelection(ctx, target);
		},
	});

	register({
		id: "node.firstChild",
		description: "First logical child",
		defaultKeys: ["L"],
		modes: ["normal"],
		execute: (ctx) => {
			const target = navNodeFirstChild(
				ctx.state.selectedEntryId,
				ctx.visibleNodes,
				ctx.index,
			);
			updateSelection(ctx, target);
		},
	});

	register({
		id: "node.lastChild",
		description: "Last logical child",
		defaultKeys: ["gL"],
		modes: ["normal"],
		execute: (ctx) => {
			const target = navNodeLastChild(
				ctx.state.selectedEntryId,
				ctx.visibleNodes,
				ctx.index,
			);
			updateSelection(ctx, target);
		},
	});

	register({
		id: "node.nextSibling",
		description: "Next logical sibling",
		defaultKeys: ["]s"],
		modes: ["normal"],
		execute: (ctx) => {
			const target = navNodeNextSibling(
				ctx.state.selectedEntryId,
				ctx.visibleNodes,
				ctx.index,
			);
			updateSelection(ctx, target);
		},
	});

	register({
		id: "node.prevSibling",
		description: "Previous logical sibling",
		defaultKeys: ["[s"],
		modes: ["normal"],
		execute: (ctx) => {
			const target = navNodePrevSibling(
				ctx.state.selectedEntryId,
				ctx.visibleNodes,
				ctx.index,
			);
			updateSelection(ctx, target);
		},
	});

	register({
		id: "node.firstSibling",
		description: "First logical sibling",
		defaultKeys: ["gs"],
		modes: ["normal"],
		execute: (ctx) => {
			const target = navNodeFirstSibling(
				ctx.state.selectedEntryId,
				ctx.visibleNodes,
				ctx.index,
			);
			updateSelection(ctx, target);
		},
	});

	register({
		id: "node.root",
		description: "Root of the current tree",
		defaultKeys: ["gg"],
		modes: ["normal"],
		execute: (ctx) => {
			const target = navNodeRoot(
				ctx.state.selectedEntryId,
				ctx.visibleNodes,
				ctx.index,
			);
			updateSelection(ctx, target);
		},
	});

	register({
		id: "node.last",
		description: "Last visible row",
		defaultKeys: ["G"],
		modes: ["normal"],
		execute: (ctx) => {
			const target = navNodeLast(ctx.state.selectedEntryId, ctx.visibleNodes);
			updateSelection(ctx, target);
		},
	});

	register({
		id: "node.current",
		description: "Reveal/select the real Session Leaf",
		defaultKeys: ["tab"],
		modes: ["normal"],
		execute: (ctx) => {
			const target = navNodeCurrent(ctx.visibleNodes, ctx.state.sessionLeafId);
			updateSelection(ctx, target);
		},
	});

	register({
		id: "node.pageDown",
		description: "Move down half a viewport",
		defaultKeys: ["ctrl+d"],
		modes: ["normal"],
		execute: (ctx) => {
			const target = navNodePageDown(
				ctx.state.selectedEntryId,
				ctx.visibleNodes,
				ctx.pageSize,
			);
			updateSelection(ctx, target);
		},
	});

	register({
		id: "node.pageUp",
		description: "Move up half a viewport",
		defaultKeys: ["ctrl+u"],
		modes: ["normal"],
		execute: (ctx) => {
			const target = navNodePageUp(
				ctx.state.selectedEntryId,
				ctx.visibleNodes,
				ctx.pageSize,
			);
			updateSelection(ctx, target);
		},
	});

	register({
		id: "node.nextLabel",
		description: "Next labeled node in current visible order",
		defaultKeys: ["]m"],
		modes: ["normal"],
		execute: (ctx) => {
			const target = navNodeNextLabel(
				ctx.state.selectedEntryId,
				ctx.visibleNodes,
			);
			updateSelection(ctx, target);
		},
	});

	register({
		id: "node.prevLabel",
		description: "Previous labeled node in current visible order",
		defaultKeys: ["[m"],
		modes: ["normal"],
		execute: (ctx) => {
			const target = navNodePrevLabel(
				ctx.state.selectedEntryId,
				ctx.visibleNodes,
			);
			updateSelection(ctx, target);
		},
	});

	register({
		id: "node.nextUser",
		description: "Next user node in current visible order",
		defaultKeys: ["]u"],
		modes: ["normal"],
		execute: (ctx) => {
			const target = navNodeNextUser(
				ctx.state.selectedEntryId,
				ctx.visibleNodes,
			);
			updateSelection(ctx, target);
		},
	});

	register({
		id: "node.prevUser",
		description: "Previous user node in current visible order",
		defaultKeys: ["[u"],
		modes: ["normal"],
		execute: (ctx) => {
			const target = navNodePrevUser(
				ctx.state.selectedEntryId,
				ctx.visibleNodes,
			);
			updateSelection(ctx, target);
		},
	});

	// 13 Branch Actions
	register({
		id: "branch.next",
		description: "Next sibling branch at nearest fork",
		defaultKeys: ["]b"],
		modes: ["normal"],
		execute: (ctx) => {
			const target = navBranchNext(ctx.state.selectedEntryId, ctx.index);
			updateSelection(ctx, target, true);
		},
	});

	register({
		id: "branch.prev",
		description: "Previous sibling branch at nearest fork",
		defaultKeys: ["[b"],
		modes: ["normal"],
		execute: (ctx) => {
			const target = navBranchPrev(ctx.state.selectedEntryId, ctx.index);
			updateSelection(ctx, target, true);
		},
	});

	register({
		id: "branch.parent",
		description: "Nearest fork defining the current branch",
		defaultKeys: ["gp"],
		modes: ["normal"],
		execute: (ctx) => {
			const target = navBranchParent(ctx.state.selectedEntryId, ctx.index);
			updateSelection(ctx, target);
		},
	});

	register({
		id: "branch.root",
		description: "That branch's starting child",
		defaultKeys: ["gb"],
		modes: ["normal"],
		execute: (ctx) => {
			const target = navBranchRoot(ctx.state.selectedEntryId, ctx.index);
			updateSelection(ctx, target, true);
		},
	});

	register({
		id: "branch.leaf",
		description: "Preferred leaf of that branch",
		defaultKeys: ["ge"],
		modes: ["normal"],
		execute: (ctx) => {
			const target = navBranchLeaf(
				ctx.state.selectedEntryId,
				ctx.index,
				ctx.state,
			);
			updateSelection(ctx, target);
		},
	});

	register({
		id: "branch.first",
		description: "First branch at the same fork",
		defaultKeys: ["g["],
		modes: ["normal"],
		execute: (ctx) => {
			const target = navBranchFirst(ctx.state.selectedEntryId, ctx.index);
			updateSelection(ctx, target, true);
		},
	});

	register({
		id: "branch.last",
		description: "Last branch at the same fork",
		defaultKeys: ["g]"],
		modes: ["normal"],
		execute: (ctx) => {
			const target = navBranchLast(ctx.state.selectedEntryId, ctx.index);
			updateSelection(ctx, target, true);
		},
	});

	register({
		id: "branch.nextFork",
		description: "Next raw fork in current Root's preorder",
		defaultKeys: ["]f"],
		modes: ["normal"],
		execute: (ctx) => {
			const target = navBranchNextFork(ctx.state.selectedEntryId, ctx.index);
			updateSelection(ctx, target);
		},
	});

	register({
		id: "branch.prevFork",
		description: "Previous raw fork in current Root's preorder",
		defaultKeys: ["[f"],
		modes: ["normal"],
		execute: (ctx) => {
			const target = navBranchPrevFork(ctx.state.selectedEntryId, ctx.index);
			updateSelection(ctx, target);
		},
	});

	register({
		id: "branch.active",
		description: "Focus/reveal the actual active branch",
		defaultKeys: ["ga"],
		modes: ["normal"],
		execute: (ctx) => {
			const target = navBranchActive(ctx.index, ctx.state);
			updateSelection(ctx, target, true);
		},
	});

	register({
		id: "branch.nextLeaf",
		description: "Next leaf within the branch's leaf set, in raw preorder",
		defaultKeys: ["]l"],
		modes: ["normal"],
		execute: (ctx) => {
			const target = navBranchNextLeaf(ctx.state.selectedEntryId, ctx.index);
			updateSelection(ctx, target);
		},
	});

	register({
		id: "branch.prevLeaf",
		description: "Previous leaf within that set, in raw preorder",
		defaultKeys: ["[l"],
		modes: ["normal"],
		execute: (ctx) => {
			const target = navBranchPrevLeaf(ctx.state.selectedEntryId, ctx.index);
			updateSelection(ctx, target);
		},
	});

	register({
		id: "branch.cycle",
		description: "Explicit cyclic sibling-branch switch",
		defaultKeys: [],
		modes: ["normal"],
		execute: (ctx) => {
			const target = navBranchCycle(ctx.state.selectedEntryId, ctx.index);
			updateSelection(ctx, target, true);
		},
	});

	// Session Close Action
	register({
		id: "session.close",
		description: "Close without session change",
		defaultKeys: ["q"],
		modes: ["normal", "search", "preview", "help"],
		execute: (ctx) => {
			ctx.close();
		},
	});

	return registry;
}
