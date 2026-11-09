import { copyToClipboard } from "./clipboard.ts";
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
import { extractFullText } from "./search.ts";
import type {
	ActionContext,
	ActionDefinition,
	ExplorerState,
	TreeIndex,
} from "./types.ts";

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
		"fold.toggle": ["space"],
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

		// Search actions
		"search.open": ["/"],
		"search.next": ["n"],
		"search.prev": ["N"],
		"search.clear": ["esc"],
		"search.accept": ["enter"],
		"search.toggleRegex": [],
		"search.toggleScope": [],

		// View actions
		"view.toggleDetails": ["d"],
		"view.toggleContext": ["c"],
		"view.cycleDepthMode": ["D"],
		"view.cycleLayout": ["C"],
		"view.help": ["?"],
		"view.toggleVim": [],
		"view.reloadConfig": [],
		"view.reset": [],

		// Session actions
		"session.navigate": ["enter"],
		"session.fork": ["f"],
		"session.forkBefore": ["F"],
		"session.preview": ["p"],
		"session.copyId": ["yi"],
		"session.copyContent": ["yy"],
		"session.setLabel": ["m"],
		"session.refresh": ["r"],
		"session.close": ["q", "esc"],
	};
}

function revealPathToRoot(
	nodeId: string,
	index: TreeIndex,
	state: ExplorerState,
) {
	let cur: string | null = nodeId;
	while (cur) {
		state.temporaryRevealedIds.add(cur);
		cur = index.parentById.get(cur) ?? null;
	}
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
		id: "view.toggleDetails",
		description: "Toggle selection details region",
		defaultKeys: ["d"],
		modes: ["normal"],
		execute: (ctx) => {
			ctx.state.showDetails = !ctx.state.showDetails;
			ctx.state.version++;
		},
	});

	register({
		id: "view.toggleContext",
		description: "Toggle context columns visibility",
		defaultKeys: ["c"],
		modes: ["normal"],
		execute: (ctx) => {
			ctx.state.showContext = !ctx.state.showContext;
			ctx.state.version++;
			ctx.reproject?.();
		},
	});

	register({
		id: "view.cycleDepthMode",
		description: "Cycle depth display mode (turn -> raw -> branch)",
		defaultKeys: ["D"],
		modes: ["normal"],
		execute: (ctx) => {
			const cur = ctx.state.displayOptions.depthMode;
			const next = cur === "turn" ? "raw" : cur === "raw" ? "branch" : "turn";
			ctx.state.displayOptions.depthMode = next;
			ctx.state.version++;
			ctx.reproject?.();
		},
	});

	register({
		id: "view.cycleLayout",
		description: "Cycle layout density (normal <-> compact)",
		defaultKeys: ["C"],
		modes: ["normal"],
		execute: (ctx) => {
			ctx.state.displayOptions.layout =
				ctx.state.displayOptions.layout === "normal" ? "compact" : "normal";
			ctx.state.version++;
			ctx.reproject?.();
		},
	});

	register({
		id: "view.reset",
		description: "Reset view options to defaults",
		defaultKeys: [],
		modes: ["normal"],
		execute: (ctx) => {
			ctx.state.displayOptions.depthMode = "turn";
			ctx.state.displayOptions.layout = "normal";
			ctx.state.showDetails = true;
			ctx.state.showContext = true;
			ctx.state.version++;
			ctx.reproject?.();
		},
	});

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

	// 7 Search Actions
	register({
		id: "search.open",
		description: "Open search mode",
		defaultKeys: ["/"],
		modes: ["normal"],
		execute: (ctx) => {
			ctx.state.searchSnapshot = {
				searchQuery: ctx.state.searchQuery,
				selectedEntryId: ctx.state.selectedEntryId,
				temporaryRevealedIds: new Set(ctx.state.temporaryRevealedIds),
				manualExpandedIds: new Set(ctx.state.manualExpandedIds),
				manualCollapsedIds: new Set(ctx.state.manualCollapsedIds),
			};
			ctx.state.mode = "search";
			ctx.state.version++;
			ctx.reproject?.();
		},
	});

	register({
		id: "search.next",
		description: "Next search match",
		defaultKeys: ["n"],
		modes: ["normal", "search"],
		execute: (ctx) => {
			if (ctx.state.searchResults.length === 0) return;
			const nextIdx =
				(ctx.state.searchResultIndex + 1) % ctx.state.searchResults.length;
			ctx.state.searchResultIndex = nextIdx;
			const targetId = ctx.state.searchResults[nextIdx].id;
			revealPathToRoot(targetId, ctx.index, ctx.state);
			ctx.state.selectedEntryId = targetId;
			ctx.state.version++;
			ctx.reproject?.();
		},
	});

	register({
		id: "search.prev",
		description: "Previous search match",
		defaultKeys: ["N"],
		modes: ["normal", "search"],
		execute: (ctx) => {
			if (ctx.state.searchResults.length === 0) return;
			const prevIdx =
				(ctx.state.searchResultIndex - 1 + ctx.state.searchResults.length) %
				ctx.state.searchResults.length;
			ctx.state.searchResultIndex = prevIdx;
			const targetId = ctx.state.searchResults[prevIdx].id;
			revealPathToRoot(targetId, ctx.index, ctx.state);
			ctx.state.selectedEntryId = targetId;
			ctx.state.version++;
			ctx.reproject?.();
		},
	});

	register({
		id: "search.clear",
		description: "Clear search query and temporary reveals",
		defaultKeys: ["esc"],
		modes: ["normal", "search"],
		execute: (ctx) => {
			if (ctx.state.mode === "search") {
				// Cancel search: restore pre-search snapshot
				if (ctx.state.searchSnapshot) {
					ctx.state.searchQuery = ctx.state.searchSnapshot.searchQuery;
					ctx.state.selectedEntryId = ctx.state.searchSnapshot.selectedEntryId;
					ctx.state.temporaryRevealedIds = new Set(
						ctx.state.searchSnapshot.temporaryRevealedIds,
					);
					ctx.state.manualExpandedIds = new Set(
						ctx.state.searchSnapshot.manualExpandedIds,
					);
					ctx.state.manualCollapsedIds = new Set(
						ctx.state.searchSnapshot.manualCollapsedIds,
					);
					ctx.state.searchSnapshot = undefined;
				}
				ctx.state.mode = "normal";
			} else {
				// Normal mode Esc: clear query and temporary reveals
				ctx.state.searchQuery = "";
				ctx.state.temporaryRevealedIds.clear();

				// If current selection became hidden, fall back to nearest visible ancestor
				ctx.reproject?.();
				const current = ctx.state.selectedEntryId;
				if (current && !ctx.visibleNodes.some((n) => n.id === current)) {
					let ancestor = ctx.index.parentById.get(current);
					while (ancestor) {
						if (ctx.visibleNodes.some((n) => n.id === ancestor)) {
							ctx.state.selectedEntryId = ancestor;
							break;
						}
						ancestor = ctx.index.parentById.get(ancestor) ?? null;
					}
					if (
						!ctx.state.selectedEntryId ||
						!ctx.visibleNodes.some((n) => n.id === ctx.state.selectedEntryId)
					) {
						ctx.state.selectedEntryId = ctx.visibleNodes[0]?.id ?? null;
					}
				}
			}
			ctx.state.version++;
			ctx.reproject?.();
		},
	});

	register({
		id: "search.accept",
		description:
			"Select highlighted match and exit search mode without navigating",
		defaultKeys: ["enter"],
		modes: ["search"],
		execute: (ctx) => {
			if (
				ctx.state.searchResults.length > 0 &&
				ctx.state.searchResultIndex >= 0
			) {
				const match = ctx.state.searchResults[ctx.state.searchResultIndex];
				if (match) {
					revealPathToRoot(match.id, ctx.index, ctx.state);
					ctx.state.selectedEntryId = match.id;
				}
			}
			ctx.state.mode = "normal";
			ctx.state.searchSnapshot = undefined; // Accepted
			ctx.state.version++;
			ctx.reproject?.();
		},
	});

	register({
		id: "search.toggleRegex",
		description: "Toggle regex search mode",
		defaultKeys: [],
		modes: ["normal", "search"],
		execute: (ctx) => {
			ctx.state.searchRegex = !ctx.state.searchRegex;
			ctx.state.version++;
		},
	});

	register({
		id: "search.toggleScope",
		description: "Toggle search scope between all entries and focused subtree",
		defaultKeys: [],
		modes: ["normal", "search"],
		execute: (ctx) => {
			ctx.state.searchScope =
				ctx.state.searchScope === "all" ? "focused-subtree" : "all";
			ctx.state.version++;
		},
	});

	// Session Inspection & Metadata Actions (Spec R08)
	register({
		id: "session.navigate",
		description: "Navigate to selected entry in current session",
		defaultKeys: ["enter"],
		modes: ["normal"],
		execute: (ctx) => {
			const sel = ctx.state.selectedEntryId;
			if (!sel) return;
			if (sel.startsWith("virtual:branch:")) {
				const anchorId = sel.replace("virtual:branch:", "");
				ctx.state.manualExpandedIds.add(anchorId);
				ctx.state.manualCollapsedIds.delete(anchorId);
				updateSelection(ctx, anchorId);
				ctx.state.version++;
				ctx.reproject?.();
				return;
			}
			ctx.navigate?.(sel);
		},
	});

	register({
		id: "session.fork",
		description: "Fork independent session at selected entry",
		defaultKeys: ["f"],
		modes: ["normal"],
		execute: (ctx) => {
			const sel = ctx.state.selectedEntryId;
			if (!sel || sel.startsWith("virtual:branch:")) {
				ctx.notify?.(
					"Cannot fork from virtual branch summary. Expand branch first.",
					"warning",
				);
				return;
			}
			ctx.fork?.(sel, "at");
		},
	});

	register({
		id: "session.forkBefore",
		description: "Fork before selected user entry and restore prompt",
		defaultKeys: ["F"],
		modes: ["normal"],
		execute: (ctx) => {
			const sel = ctx.state.selectedEntryId;
			if (!sel || sel.startsWith("virtual:branch:")) {
				ctx.notify?.(
					"Cannot fork from virtual branch summary. Expand branch first.",
					"warning",
				);
				return;
			}
			ctx.fork?.(sel, "before");
		},
	});

	register({
		id: "session.preview",
		description: "Preview complete node content",
		defaultKeys: ["p"],
		modes: ["normal", "preview"],
		execute: (ctx) => {
			if (ctx.state.mode === "preview") {
				ctx.state.mode = "normal";
				ctx.state.previewNodeId = null;
			} else {
				ctx.state.previewNodeId = ctx.state.selectedEntryId;
				ctx.state.mode = "preview";
			}
			ctx.state.version++;
		},
	});

	register({
		id: "session.copyId",
		description: "Copy Entry ID to clipboard",
		defaultKeys: ["yi"],
		modes: ["normal"],
		execute: (ctx) => {
			const sel = ctx.state.selectedEntryId;
			if (!sel || sel.startsWith("virtual:branch:")) {
				ctx.notify?.("Cannot copy virtual branch summary ID", "warning");
				return;
			}
			const res = copyToClipboard(sel);
			if (res.success) {
				ctx.notify?.(`Copied Entry ID: ${sel}`, "info");
			} else {
				ctx.notify?.(
					`Clipboard copy failed: ${res.error ?? "unknown error"}`,
					"warning",
				);
			}
		},
	});

	register({
		id: "session.copyContent",
		description: "Copy node text content to clipboard",
		defaultKeys: ["yy"],
		modes: ["normal"],
		execute: (ctx) => {
			const sel = ctx.state.selectedEntryId;
			if (!sel || sel.startsWith("virtual:branch:")) {
				ctx.notify?.("Cannot copy virtual branch summary content", "warning");
				return;
			}
			const entry = ctx.index.entryById.get(sel);
			if (!entry) return;

			const fullText = extractFullText(entry);
			const res = copyToClipboard(fullText);
			if (res.success) {
				ctx.notify?.("Copied node content to clipboard", "info");
			} else {
				ctx.notify?.(
					`Clipboard copy failed: ${res.error ?? "unknown error"}`,
					"warning",
				);
			}
		},
	});

	register({
		id: "session.setLabel",
		description: "Set or clear entry bookmark label",
		defaultKeys: ["m"],
		modes: ["normal"],
		execute: async (ctx) => {
			const sel = ctx.state.selectedEntryId;
			if (!sel || sel.startsWith("virtual:branch:")) {
				ctx.notify?.("Cannot label virtual branch summary", "warning");
				return;
			}
			const entry = ctx.index.entryById.get(sel);
			if (!entry) return;

			// Toggle or edit label
			const currentLabel = entry.label;
			const nextLabel = currentLabel ? undefined : "bookmark";
			entry.label = nextLabel;
			await ctx.setLabel?.(sel, nextLabel);
			ctx.state.version++;
			ctx.reproject?.();
			ctx.notify?.(
				nextLabel
					? `Labeled '${nextLabel}' on ${sel}`
					: `Cleared label on ${sel}`,
				"info",
			);
		},
	});

	register({
		id: "session.refresh",
		description: "Refresh session entries from host",
		defaultKeys: ["r"],
		modes: ["normal"],
		execute: async (ctx) => {
			await ctx.refresh?.();
			ctx.state.version++;
			ctx.reproject?.();
			ctx.notify?.("Refreshed session tree.", "info");
		},
	});

	register({
		id: "session.close",
		description: "Close without session change",
		defaultKeys: ["q", "esc"],
		modes: ["normal", "search", "preview", "help"],
		execute: (ctx) => {
			if (ctx.state.mode === "preview") {
				ctx.state.mode = "normal";
				ctx.state.previewNodeId = null;
				ctx.state.version++;
				return;
			}
			if (ctx.state.mode === "help") {
				ctx.state.mode = "normal";
				ctx.state.version++;
				return;
			}
			if (ctx.state.mode === "search") {
				// Cancel search via search.clear
				const action = createActionRegistry().get("search.clear");
				action?.execute(ctx);
				return;
			}
			ctx.close();
		},
	});

	return registry;
}
