import { copyToClipboard } from "./clipboard.ts";
import {
	defaultDisplayOptions,
	defaultFoldOptions,
	expandDisplaySelection,
	rawTargetForSelection,
} from "./display.ts";
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
import { extractContentText } from "./search.ts";
import { transitionSearch } from "./search-state.ts";
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
	if (!targetId) return;
	const explicitRawJump =
		updateFocus ||
		ctx.actionId?.startsWith("branch.") ||
		ctx.actionId === "node.current" ||
		ctx.actionId === "node.root";
	if (
		explicitRawJump &&
		ctx.navigationOptions?.autoRevealTarget !== false &&
		!ctx.visibleNodes.some((n) => n.id === targetId) &&
		ctx.index.entryById.has(targetId)
	)
		revealPathToRoot(targetId, ctx.index, ctx.state);
	ctx.state.selectedEntryId = targetId;

	// Keep recent leaf updated if the selected node is a leaf
	if (ctx.index.leafIds.has(targetId)) {
		let current = targetId;
		while (current) {
			const p = ctx.index.parentById.get(current);
			if (p && (ctx.index.childrenById.get(p)?.length ?? 0) > 1) {
				ctx.state.recentLeafByBranch.set(current, targetId);
			}
			current = p ?? "";
		}
	}

	const focusPolicy =
		ctx.navigationOptions?.focusFollowsSelection ?? "branch-actions";
	if (
		focusPolicy === "always" ||
		(focusPolicy === "branch-actions" &&
			(updateFocus || ctx.actionId?.startsWith("branch.")))
	) {
		const focusTarget = rawTargetForSelection(
			targetId,
			ctx.visibleNodes,
			ctx.index,
		);
		if (focusTarget) {
			ctx.state.focusedBranchId = focusTarget;
			ctx.state.focusedPathIds.clear();
			let cur: string | null = focusTarget;
			while (cur) {
				ctx.state.focusedPathIds.add(cur);
				cur = ctx.index.parentById.get(cur) ?? null;
			}
		}
	}
	ctx.state.version++;
}

export function getDefaultKeybindings(): Record<string, string[]> {
	return Object.fromEntries(
		[...createActionRegistry().values()].map((action) => [
			action.id,
			[...action.defaultKeys],
		]),
	);
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
		defaultKeys: ["H", "left"],
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
		defaultKeys: ["L", "right"],
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
				rawTargetForSelection(
					ctx.state.selectedEntryId,
					ctx.visibleNodes,
					ctx.index,
				),
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
			const target = navBranchNext(
				rawTargetForSelection(
					ctx.state.selectedEntryId,
					ctx.visibleNodes,
					ctx.index,
				),
				ctx.index,
				ctx.navigationOptions?.branchWrap,
			);
			updateSelection(ctx, target, true);
		},
	});

	register({
		id: "branch.prev",
		description: "Previous sibling branch at nearest fork",
		defaultKeys: ["[b"],
		modes: ["normal"],
		execute: (ctx) => {
			const target = navBranchPrev(
				rawTargetForSelection(
					ctx.state.selectedEntryId,
					ctx.visibleNodes,
					ctx.index,
				),
				ctx.index,
				ctx.navigationOptions?.branchWrap,
			);
			updateSelection(ctx, target, true);
		},
	});

	register({
		id: "branch.parent",
		description: "Nearest fork defining the current branch",
		defaultKeys: ["gp"],
		modes: ["normal"],
		execute: (ctx) => {
			const target = navBranchParent(
				rawTargetForSelection(
					ctx.state.selectedEntryId,
					ctx.visibleNodes,
					ctx.index,
				),
				ctx.index,
			);
			updateSelection(ctx, target);
		},
	});

	register({
		id: "branch.root",
		description: "That branch's starting child",
		defaultKeys: ["gb"],
		modes: ["normal"],
		execute: (ctx) => {
			const target = navBranchRoot(
				rawTargetForSelection(
					ctx.state.selectedEntryId,
					ctx.visibleNodes,
					ctx.index,
				),
				ctx.index,
			);
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
				rawTargetForSelection(
					ctx.state.selectedEntryId,
					ctx.visibleNodes,
					ctx.index,
				),
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
			const target = navBranchFirst(
				rawTargetForSelection(
					ctx.state.selectedEntryId,
					ctx.visibleNodes,
					ctx.index,
				),
				ctx.index,
			);
			updateSelection(ctx, target, true);
		},
	});

	register({
		id: "branch.last",
		description: "Last branch at the same fork",
		defaultKeys: ["g]"],
		modes: ["normal"],
		execute: (ctx) => {
			const target = navBranchLast(
				rawTargetForSelection(
					ctx.state.selectedEntryId,
					ctx.visibleNodes,
					ctx.index,
				),
				ctx.index,
			);
			updateSelection(ctx, target, true);
		},
	});

	register({
		id: "branch.nextFork",
		description: "Next raw fork in current Root's preorder",
		defaultKeys: ["]f"],
		modes: ["normal"],
		execute: (ctx) => {
			const target = navBranchNextFork(
				rawTargetForSelection(
					ctx.state.selectedEntryId,
					ctx.visibleNodes,
					ctx.index,
				),
				ctx.index,
			);
			updateSelection(ctx, target);
		},
	});

	register({
		id: "branch.prevFork",
		description: "Previous raw fork in current Root's preorder",
		defaultKeys: ["[f"],
		modes: ["normal"],
		execute: (ctx) => {
			const target = navBranchPrevFork(
				rawTargetForSelection(
					ctx.state.selectedEntryId,
					ctx.visibleNodes,
					ctx.index,
				),
				ctx.index,
			);
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
			const target = navBranchNextLeaf(
				rawTargetForSelection(
					ctx.state.selectedEntryId,
					ctx.visibleNodes,
					ctx.index,
				),
				ctx.index,
			);
			updateSelection(ctx, target);
		},
	});

	register({
		id: "branch.prevLeaf",
		description: "Previous leaf within that set, in raw preorder",
		defaultKeys: ["[l"],
		modes: ["normal"],
		execute: (ctx) => {
			const target = navBranchPrevLeaf(
				rawTargetForSelection(
					ctx.state.selectedEntryId,
					ctx.visibleNodes,
					ctx.index,
				),
				ctx.index,
			);
			updateSelection(ctx, target);
		},
	});

	register({
		id: "branch.cycle",
		description: "Explicit cyclic sibling-branch switch",
		defaultKeys: [],
		modes: ["normal"],
		execute: (ctx) => {
			const target = navBranchCycle(
				rawTargetForSelection(
					ctx.state.selectedEntryId,
					ctx.visibleNodes,
					ctx.index,
				),
				ctx.index,
			);
			updateSelection(ctx, target, true);
		},
	});
	// 11 Fold Actions
	register({
		id: "fold.toggle",
		description: "Toggle selected subtree",
		defaultKeys: ["space"],
		modes: ["normal"],
		execute: (ctx) => {
			const sel = ctx.state.selectedEntryId;
			if (!sel) return;

			// Virtual summary expand
			if (ctx.visibleNodes.find((n) => n.id === sel)?.isVirtual) {
				const anchorId = expandDisplaySelection(
					sel,
					ctx.visibleNodes,
					ctx.index,
					ctx.state,
				);
				if (!anchorId) return;
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
			const target = expandDisplaySelection(
				sel,
				ctx.visibleNodes,
				ctx.index,
				ctx.state,
			);
			if (!target) return;
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
			const sel = rawTargetForSelection(
				ctx.state.selectedEntryId,
				ctx.visibleNodes,
				ctx.index,
			);
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
			ctx.state.foldOptions = {
				...(ctx.defaults?.fold ?? defaultFoldOptions()),
			};
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
			ctx.state.displayOptions = {
				...(ctx.defaults?.display ?? defaultDisplayOptions()),
			};
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
			ctx.state.displayOptions.depthMode =
				ctx.defaults?.display.depthMode ?? "turn";
			ctx.state.displayOptions.layout =
				ctx.defaults?.display.layout ?? "normal";
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

	for (const [id, keys, move] of [
		["view.scrollUp", ["up"], "up"],
		["view.scrollDown", ["down"], "down"],
		["view.pageUp", ["pageup", "ctrl+u"], "pageUp"],
		["view.pageDown", ["pagedown", "ctrl+d"], "pageDown"],
		["view.firstLine", ["home"], "first"],
		["view.lastLine", ["end"], "last"],
	] as const)
		register({
			id,
			description: `Scroll inspection: ${move}`,
			defaultKeys: [...keys],
			modes: ["help", "preview"],
			execute: (ctx) => ctx.scrollInspection?.(move),
		});
	register({
		id: "view.settings",
		description: "Open Explorer settings",
		defaultKeys: ["s"],
		modes: ["help"],
		execute: async (ctx) => {
			await ctx.openSettings?.();
		},
	});
	register({
		id: "view.reloadConfig",
		description: "Reload configuration from disk safely",
		defaultKeys: [],
		modes: ["normal"],
		execute: async (ctx) => {
			await ctx.reloadConfig?.();
			ctx.state.version++;
			ctx.reproject?.();
		},
	});

	// Session Close Action

	// Search transitions live with the query lifecycle, not the view or key parser.
	for (const action of [
		{
			id: "search.open",
			description: "Open search mode",
			defaultKeys: ["/"],
			modes: ["normal"],
		},
		{
			id: "search.next",
			description: "Next search match",
			defaultKeys: ["n"],
			modes: ["normal", "search"],
			modeKeys: { search: ["down", "ctrl+n"] },
		},
		{
			id: "search.prev",
			description: "Previous search match",
			defaultKeys: ["N"],
			modes: ["normal", "search"],
			modeKeys: { search: ["up", "ctrl+p"] },
		},
		{
			id: "search.clear",
			description: "Clear search query and temporary reveals",
			defaultKeys: ["esc"],
			modes: ["normal", "search"],
		},
		{
			id: "search.accept",
			description: "Accept result without Navigate",
			defaultKeys: ["enter"],
			modes: ["search"],
		},
		{
			id: "search.toggleRegex",
			description: "Toggle regex search",
			defaultKeys: [],
			modes: ["normal", "search"],
		},
		{
			id: "search.toggleScope",
			description: "Toggle all/focused-subtree search",
			defaultKeys: [],
			modes: ["normal", "search"],
		},
	] satisfies Array<Omit<ActionDefinition, "execute">>)
		register({
			...action,
			execute: (ctx) => {
				if (ctx.searchAction) ctx.searchAction(action.id);
				else transitionSearch(ctx, action.id);
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
			if (ctx.visibleNodes.find((n) => n.id === sel)?.isVirtual) {
				const anchorId = expandDisplaySelection(
					sel,
					ctx.visibleNodes,
					ctx.index,
					ctx.state,
				);
				if (!anchorId) return;
				ctx.state.manualExpandedIds.add(anchorId);
				ctx.state.manualCollapsedIds.delete(anchorId);
				updateSelection(ctx, anchorId);
				ctx.state.version++;
				ctx.reproject?.();
				return;
			}
			if (rawTargetForSelection(sel, ctx.visibleNodes, ctx.index) !== sel) {
				ctx.notify?.(
					"Target is no longer available; refresh the tree.",
					"warning",
				);
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
			if (
				!sel ||
				rawTargetForSelection(sel, ctx.visibleNodes, ctx.index) !== sel
			) {
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
			if (
				!sel ||
				rawTargetForSelection(sel, ctx.visibleNodes, ctx.index) !== sel
			) {
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
			if (
				!sel ||
				rawTargetForSelection(sel, ctx.visibleNodes, ctx.index) !== sel
			) {
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
			if (
				!sel ||
				rawTargetForSelection(sel, ctx.visibleNodes, ctx.index) !== sel
			) {
				ctx.notify?.("Cannot copy virtual branch summary content", "warning");
				return;
			}
			const entry = ctx.index.entryById.get(sel);
			if (!entry) return;

			const fullText = extractContentText(entry);
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
			if (
				!sel ||
				rawTargetForSelection(sel, ctx.visibleNodes, ctx.index) !== sel
			) {
				ctx.notify?.("Cannot label virtual branch summary", "warning");
				return;
			}
			const entry = ctx.index.entryById.get(sel);
			if (!entry) return;

			// Toggle or edit label
			const currentLabel = ctx.index.displayLabelsById.get(sel);
			const edit = ctx.editLabel
				? await ctx.editLabel(sel, currentLabel)
				: { label: currentLabel ? undefined : "bookmark" };
			if (edit === null || (ctx.isCurrent && !ctx.isCurrent())) return;
			const nextLabel = edit.label;
			if (!ctx.setLabel) {
				ctx.notify?.("Host label API unavailable", "warning");
				return;
			}
			await ctx.setLabel(sel, nextLabel);
			if (ctx.isCurrent && !ctx.isCurrent()) return;
			if (ctx.refresh) await ctx.refresh();
			else if (nextLabel) ctx.index.displayLabelsById.set(sel, nextLabel);
			else ctx.index.displayLabelsById.delete(sel);
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
			if (ctx.isCurrent && !ctx.isCurrent()) return;
			ctx.state.version++;
			ctx.reproject?.();
			ctx.notify?.("Refreshed session tree.", "info");
		},
	});

	register({
		id: "session.close",
		description: "Close without session change",
		defaultKeys: ["q"],
		modeKeys: { preview: ["q", "esc"], help: ["q", "esc"], search: [] },
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
