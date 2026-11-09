import { defaultDisplayOptions, defaultFoldOptions } from "./display.ts";
import {
	findNearestBranch,
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
		// Recompute focused path IDs up to root
		ctx.state.focusedPathIds.clear();
		let cur: string | null = targetId;
		while (cur) {
			ctx.state.focusedPathIds.add(cur);
			cur = ctx.index.parentById.get(cur) ?? null;
		}
	}
	ctx.state.version++;
}

export function getDefaultKeybindings(): Record<string, string[]> {
	return {
		// Node actions
		"node.next": ["j", "down"],
		"node.prev": ["k", "up"],
		"node.parent": ["H"],
		"node.firstChild": ["L"],
		"node.lastChild": ["gL"],
		"node.nextSibling": ["]s"],
		"node.prevSibling": ["[s"],
		"node.firstSibling": ["gs"],
		"node.root": ["gg"],
		"node.last": ["G"],
		"node.current": ["tab"],
		"node.pageDown": ["ctrl+d"],
		"node.pageUp": ["ctrl+u"],
		"node.nextLabel": ["]m"],
		"node.prevLabel": ["[m"],
		"node.nextUser": ["]u"],
		"node.prevUser": ["[u"],

		// Branch actions
		"branch.next": ["]b"],
		"branch.prev": ["[b"],
		"branch.parent": ["gp"],
		"branch.root": ["gb"],
		"branch.leaf": ["ge"],
		"branch.first": ["g["],
		"branch.last": ["g]"],
		"branch.nextFork": ["]f"],
		"branch.prevFork": ["[f"],
		"branch.active": ["ga"],
		"branch.nextLeaf": ["]l"],
		"branch.prevLeaf": ["[l"],
		"branch.cycle": [],

		// Fold actions
		"fold.toggle": ["space", "enter"],
		"fold.expand": ["l"],
		"fold.collapse": ["h"],
		"fold.expandAll": ["zR"],
		"fold.collapseAll": ["zM"],
		"fold.activeOnly": ["za"],
		"fold.focusedOnly": ["zs"],
		"fold.collapseSiblings": ["zc"],
		"fold.increaseDepth": ["z+"],
		"fold.decreaseDepth": ["z-"],
		"fold.restoreDefault": ["zr"],

		// Filter actions
		"filter.toggleAssistant": [],
		"filter.toggleTools": [],
		"filter.toggleThinking": [],
		"filter.toggleMetadata": [],
		"filter.userOnly": [],
		"filter.branchOnly": [],
		"filter.labeledOnly": [],
		"filter.reset": [],

		// View actions
		"view.toggleVim": [],
		"view.help": ["?"],

		// Session actions
		"session.close": ["q", "esc"],
	};
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

	// 11 Fold Actions
	register({
		id: "fold.toggle",
		description: "Toggle selected subtree",
		defaultKeys: ["space", "enter"],
		modes: ["normal"],
		execute: (ctx) => {
			const sel = ctx.state.selectedEntryId;
			if (!sel) return;

			// Virtual summary expand
			if (sel.startsWith("virtual:branch:")) {
				const anchorId = sel.replace("virtual:branch:", "");
				ctx.state.manualExpandedIds.add(anchorId);
				ctx.state.manualCollapsedIds.delete(anchorId);
				updateSelection(ctx, anchorId);
				ctx.state.version++;
				ctx.reproject?.();
				return;
			}

			// Regular node toggle
			if (ctx.state.manualCollapsedIds.has(sel)) {
				ctx.state.manualCollapsedIds.delete(sel);
				ctx.state.manualExpandedIds.add(sel);
			} else {
				ctx.state.manualExpandedIds.delete(sel);
				ctx.state.manualCollapsedIds.add(sel);
			}
			ctx.state.version++;
			ctx.reproject?.();
		},
	});

	register({
		id: "fold.expand",
		description: "Expand selected subtree",
		defaultKeys: ["l"],
		modes: ["normal"],
		execute: (ctx) => {
			const sel = ctx.state.selectedEntryId;
			if (!sel) return;
			const target = sel.startsWith("virtual:branch:")
				? sel.replace("virtual:branch:", "")
				: sel;
			ctx.state.manualCollapsedIds.delete(target);
			ctx.state.manualExpandedIds.add(target);
			if (target !== sel) {
				updateSelection(ctx, target);
			}
			ctx.state.version++;
			ctx.reproject?.();
		},
	});

	register({
		id: "fold.collapse",
		description: "Collapse selected subtree",
		defaultKeys: ["h"],
		modes: ["normal"],
		execute: (ctx) => {
			const sel = ctx.state.selectedEntryId;
			if (!sel) return;

			// If it's a leaf or has no children, collapse visible parent
			const children = ctx.index.childrenById.get(sel) ?? [];
			if (children.length === 0) {
				const p = navNodeParent(sel, ctx.visibleNodes, ctx.index);
				if (p && p !== sel) {
					ctx.state.manualExpandedIds.delete(p);
					ctx.state.manualCollapsedIds.add(p);
					updateSelection(ctx, p);
				}
			} else {
				ctx.state.manualExpandedIds.delete(sel);
				ctx.state.manualCollapsedIds.add(sel);
			}
			ctx.state.version++;
			ctx.reproject?.();
		},
	});

	register({
		id: "fold.expandAll",
		description: "Expand all subtrees",
		defaultKeys: ["zR"],
		modes: ["normal"],
		execute: (ctx) => {
			ctx.state.manualCollapsedIds.clear();
			ctx.state.foldOptions.mode = "all";
			ctx.state.version++;
			ctx.reproject?.();
		},
	});

	register({
		id: "fold.collapseAll",
		description: "Collapse all subtrees",
		defaultKeys: ["zM"],
		modes: ["normal"],
		execute: (ctx) => {
			ctx.state.manualExpandedIds.clear();
			ctx.state.foldOptions.mode = "depth-limited";
			ctx.state.foldOptions.maxExpandDepth = 0;
			ctx.state.version++;
			ctx.reproject?.();
		},
	});

	register({
		id: "fold.activeOnly",
		description: "Expand only the actual active path",
		defaultKeys: ["za"],
		modes: ["normal"],
		execute: (ctx) => {
			ctx.state.manualExpandedIds.clear();
			ctx.state.manualCollapsedIds.clear();
			ctx.state.foldOptions.mode = "active-only";
			ctx.state.version++;
			ctx.reproject?.();
		},
	});

	register({
		id: "fold.focusedOnly",
		description: "Expand only the focused path",
		defaultKeys: ["zs"],
		modes: ["normal"],
		execute: (ctx) => {
			ctx.state.manualExpandedIds.clear();
			ctx.state.manualCollapsedIds.clear();
			ctx.state.foldOptions.mode = "focused-only";
			ctx.state.version++;
			ctx.reproject?.();
		},
	});

	register({
		id: "fold.collapseSiblings",
		description: "Collapse other sibling branches",
		defaultKeys: ["zc"],
		modes: ["normal"],
		execute: (ctx) => {
			const sel = ctx.state.selectedEntryId;
			if (!sel) return;
			const branch = findNearestBranch(sel, ctx.index);
			if (!branch) return;

			for (const sibId of branch.siblingBranchIds) {
				if (sibId !== branch.branchRootId) {
					ctx.state.manualCollapsedIds.add(sibId);
					ctx.state.manualExpandedIds.delete(sibId);
				}
			}
			ctx.state.version++;
			ctx.reproject?.();
		},
	});

	register({
		id: "fold.increaseDepth",
		description: "Increase global expansion depth",
		defaultKeys: ["z+"],
		modes: ["normal"],
		execute: (ctx) => {
			ctx.state.foldOptions.mode = "depth-limited";
			ctx.state.foldOptions.maxExpandDepth++;
			ctx.state.version++;
			ctx.reproject?.();
		},
	});

	register({
		id: "fold.decreaseDepth",
		description: "Decrease global expansion depth",
		defaultKeys: ["z-"],
		modes: ["normal"],
		execute: (ctx) => {
			ctx.state.foldOptions.mode = "depth-limited";
			ctx.state.foldOptions.maxExpandDepth = Math.max(
				0,
				ctx.state.foldOptions.maxExpandDepth - 1,
			);
			ctx.state.version++;
			ctx.reproject?.();
		},
	});

	register({
		id: "fold.restoreDefault",
		description: "Restore configured fold policy",
		defaultKeys: ["zr"],
		modes: ["normal"],
		execute: (ctx) => {
			ctx.state.manualCollapsedIds.clear();
			ctx.state.manualExpandedIds.clear();
			ctx.state.foldOptions = defaultFoldOptions();
			ctx.state.version++;
			ctx.reproject?.();
		},
	});

	// 8 Filter Actions
	register({
		id: "filter.toggleAssistant",
		description: "Toggle assistant-node visibility",
		defaultKeys: [],
		modes: ["normal"],
		execute: (ctx) => {
			ctx.state.displayOptions.showAssistantNodes =
				!ctx.state.displayOptions.showAssistantNodes;
			ctx.state.version++;
			ctx.reproject?.();
		},
	});

	register({
		id: "filter.toggleTools",
		description: "Toggle tool-result visibility",
		defaultKeys: [],
		modes: ["normal"],
		execute: (ctx) => {
			ctx.state.displayOptions.showToolNodes =
				!ctx.state.displayOptions.showToolNodes;
			ctx.state.version++;
			ctx.reproject?.();
		},
	});

	register({
		id: "filter.toggleThinking",
		description: "Toggle thinking-content visibility",
		defaultKeys: [],
		modes: ["normal"],
		execute: (ctx) => {
			ctx.state.displayOptions.showThinkingNodes =
				!ctx.state.displayOptions.showThinkingNodes;
			ctx.state.version++;
			ctx.reproject?.();
		},
	});

	register({
		id: "filter.toggleMetadata",
		description: "Toggle metadata-node visibility",
		defaultKeys: [],
		modes: ["normal"],
		execute: (ctx) => {
			ctx.state.displayOptions.showMetadataNodes =
				!ctx.state.displayOptions.showMetadataNodes;
			ctx.state.version++;
			ctx.reproject?.();
		},
	});

	register({
		id: "filter.userOnly",
		description: "Toggle user-only constraint",
		defaultKeys: [],
		modes: ["normal"],
		execute: (ctx) => {
			ctx.state.displayOptions.userOnly = !ctx.state.displayOptions.userOnly;
			ctx.state.version++;
			ctx.reproject?.();
		},
	});

	register({
		id: "filter.branchOnly",
		description: "Toggle branch-summary/fork-point constraint",
		defaultKeys: [],
		modes: ["normal"],
		execute: (ctx) => {
			ctx.state.displayOptions.branchOnly =
				!ctx.state.displayOptions.branchOnly;
			ctx.state.version++;
			ctx.reproject?.();
		},
	});

	register({
		id: "filter.labeledOnly",
		description: "Toggle labeled-only constraint",
		defaultKeys: [],
		modes: ["normal"],
		execute: (ctx) => {
			ctx.state.displayOptions.labeledOnly =
				!ctx.state.displayOptions.labeledOnly;
			ctx.state.version++;
			ctx.reproject?.();
		},
	});

	register({
		id: "filter.reset",
		description: "Restore configured filtering defaults",
		defaultKeys: [],
		modes: ["normal"],
		execute: (ctx) => {
			ctx.state.displayOptions = defaultDisplayOptions();
			ctx.state.version++;
			ctx.reproject?.();
		},
	});

	// View Actions
	register({
		id: "view.toggleVim",
		description: "Toggle Vim navigation mode",
		defaultKeys: [],
		modes: ["normal"],
		execute: (ctx) => {
			ctx.state.vimMode = !ctx.state.vimMode;
			ctx.state.version++;
		},
	});

	register({
		id: "view.help",
		description: "Show shortcut help panel",
		defaultKeys: ["?"],
		modes: ["normal", "help"],
		execute: (ctx) => {
			ctx.state.mode = ctx.state.mode === "help" ? "normal" : "help";
			ctx.state.version++;
		},
	});

	register({
		id: "view.reloadConfig",
		description: "Reload configuration from disk safely",
		defaultKeys: [],
		modes: ["normal"],
		execute: async (ctx) => {
			ctx.state.version++;
			ctx.reproject?.();
		},
	});

	// Session Close Action
	register({
		id: "session.close",
		description: "Close without session change",
		defaultKeys: ["q", "esc"],
		modes: ["normal", "search", "preview", "help"],
		execute: (ctx) => {
			if (ctx.state.mode === "help") {
				ctx.state.mode = "normal";
				ctx.state.version++;
				return;
			}
			ctx.close();
		},
	});

	return registry;
}
