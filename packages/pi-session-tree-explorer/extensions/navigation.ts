import type {
	BranchLocation,
	DisplayNode,
	ExplorerState,
	TreeIndex,
} from "./types.ts";

/**
 * Find the nearest fork above nodeId and the branch location.
 * Implements Nearest Fork strategy.
 */
export function findNearestBranch(
	nodeId: string,
	index: TreeIndex,
): BranchLocation | null {
	let current = nodeId;

	while (true) {
		const parent = index.parentById.get(current);
		if (parent === undefined || parent === null) {
			return null;
		}

		const siblings = index.childrenById.get(parent) ?? [];
		if (siblings.length > 1) {
			return {
				forkPointId: parent,
				branchRootId: current,
				siblingBranchIds: siblings,
				currentIndex: siblings.indexOf(current),
			};
		}

		current = parent;
	}
}

/**
 * Get all leaf node IDs under a branch root in preorder traversal.
 */
export function getBranchLeaves(
	branchRootId: string,
	index: TreeIndex,
): string[] {
	const leaves: string[] = [];

	function collect(id: string) {
		const children = index.childrenById.get(id) ?? [];
		if (children.length === 0) {
			leaves.push(id);
			return;
		}
		for (const childId of children) {
			collect(childId);
		}
	}

	collect(branchRootId);
	return leaves;
}

/**
 * Pick preferred leaf of a branch:
 * 1. Leaf on focused path
 * 2. Most recently visited leaf
 * 3. Last leaf in original session entry order
 */
export function resolveBranchLeaf(
	branchRootId: string,
	index: TreeIndex,
	state: ExplorerState,
): string {
	const leaves = getBranchLeaves(branchRootId, index);
	if (leaves.length === 0) {
		return branchRootId;
	}

	// 1. Focused path leaf
	for (const leaf of leaves) {
		if (state.focusedPathIds.has(leaf)) {
			return leaf;
		}
	}

	// 2. Most recently visited leaf
	const recent = state.recentLeafByBranch.get(branchRootId);
	if (recent && leaves.includes(recent)) {
		return recent;
	}

	// 3. Last leaf in original session entry order
	const allEntries = Array.from(index.entryById.keys());
	let latestLeaf = leaves[0];
	let latestIdx = allEntries.indexOf(latestLeaf);

	for (let i = 1; i < leaves.length; i++) {
		const leaf = leaves[i];
		const idx = allEntries.indexOf(leaf);
		if (idx > latestIdx) {
			latestIdx = idx;
			latestLeaf = leaf;
		}
	}

	return latestLeaf;
}

/**
 * Find the root ID for any node in the tree.
 */
export function findRootForNode(
	nodeId: string,
	index: TreeIndex,
): string | null {
	let current: string | null = nodeId;
	while (current !== null) {
		const parent = index.parentById.get(current);
		if (parent === null || parent === undefined) {
			return current;
		}
		current = parent;
	}
	return null;
}

// -------------------------------------------------------------
// 17 Node Actions
// -------------------------------------------------------------

function findIndex(id: string | null, nodes: DisplayNode[]): number {
	if (!id) return -1;
	return nodes.findIndex((n) => n.id === id);
}

function getVisibleParentId(
	nodeId: string,
	nodes: DisplayNode[],
	index: TreeIndex,
): string | null {
	const node = nodes.find((n) => n.id === nodeId);
	if (node) return node.visibleParentId;
	let parent = index.parentById.get(nodeId);
	const visible = new Set(nodes.map((n) => n.id));
	while (parent) {
		if (visible.has(parent)) return parent;
		parent = index.parentById.get(parent) ?? null;
	}
	return null;
}

export function navNodeNext(
	selectedId: string | null,
	nodes: DisplayNode[],
): string | null {
	if (nodes.length === 0) return null;
	const idx = findIndex(selectedId, nodes);
	if (idx === -1) return nodes[0].id;
	if (idx < nodes.length - 1) {
		return nodes[idx + 1].id;
	}
	return selectedId;
}

export function navNodePrev(
	selectedId: string | null,
	nodes: DisplayNode[],
): string | null {
	if (nodes.length === 0) return null;
	const idx = findIndex(selectedId, nodes);
	if (idx === -1) return nodes[0].id;
	if (idx > 0) {
		return nodes[idx - 1].id;
	}
	return selectedId;
}

export function navNodeParent(
	selectedId: string | null,
	nodes: DisplayNode[],
	index: TreeIndex,
): string | null {
	if (!selectedId || nodes.length === 0) return selectedId;
	const p = getVisibleParentId(selectedId, nodes, index);
	return p ?? selectedId;
}

export function navNodeFirstChild(
	selectedId: string | null,
	nodes: DisplayNode[],
	_index: TreeIndex,
): string | null {
	if (!selectedId || nodes.length === 0) return selectedId;
	const child = nodes.find((n) => n.visibleParentId === selectedId);
	return child ? child.id : selectedId;
}

export function navNodeLastChild(
	selectedId: string | null,
	nodes: DisplayNode[],
	_index: TreeIndex,
): string | null {
	if (!selectedId || nodes.length === 0) return selectedId;
	const children = nodes.filter((n) => n.visibleParentId === selectedId);
	return children.length > 0 ? children[children.length - 1].id : selectedId;
}

export function navNodeNextSibling(
	selectedId: string | null,
	nodes: DisplayNode[],
	index: TreeIndex,
): string | null {
	if (!selectedId || nodes.length === 0) return selectedId;
	const p = getVisibleParentId(selectedId, nodes, index);
	const siblings = nodes.filter((n) => n.visibleParentId === p);
	const idx = siblings.findIndex((n) => n.id === selectedId);
	if (idx !== -1 && idx < siblings.length - 1) {
		return siblings[idx + 1].id;
	}
	return selectedId;
}

export function navNodePrevSibling(
	selectedId: string | null,
	nodes: DisplayNode[],
	index: TreeIndex,
): string | null {
	if (!selectedId || nodes.length === 0) return selectedId;
	const p = getVisibleParentId(selectedId, nodes, index);
	const siblings = nodes.filter((n) => n.visibleParentId === p);
	const idx = siblings.findIndex((n) => n.id === selectedId);
	if (idx > 0) {
		return siblings[idx - 1].id;
	}
	return selectedId;
}

export function navNodeFirstSibling(
	selectedId: string | null,
	nodes: DisplayNode[],
	index: TreeIndex,
): string | null {
	if (!selectedId || nodes.length === 0) return selectedId;
	const p = getVisibleParentId(selectedId, nodes, index);
	const siblings = nodes.filter((n) => n.visibleParentId === p);
	return siblings.length > 0 ? siblings[0].id : selectedId;
}

export function navNodeRoot(
	selectedId: string | null,
	nodes: DisplayNode[],
	index: TreeIndex,
): string | null {
	if (nodes.length === 0) return null;
	if (!selectedId) return nodes[0].id;
	const rootId = findRootForNode(selectedId, index);
	if (rootId && nodes.some((n) => n.id === rootId)) {
		return rootId;
	}
	return nodes[0].id;
}

export function navNodeLast(
	_selectedId: string | null,
	nodes: DisplayNode[],
): string | null {
	if (nodes.length === 0) return null;
	return nodes[nodes.length - 1].id;
}

export function navNodeCurrent(
	visibleNodes: DisplayNode[],
	sessionLeafId: string | null,
): string | null {
	if (!sessionLeafId) {
		return visibleNodes.length > 0 ? visibleNodes[0].id : null;
	}
	const exists = visibleNodes.some((n) => n.id === sessionLeafId);
	return exists ? sessionLeafId : sessionLeafId;
}

export function navNodePageDown(
	selectedId: string | null,
	nodes: DisplayNode[],
	pageSize = 20,
): string | null {
	if (nodes.length === 0) return null;
	const idx = findIndex(selectedId, nodes);
	if (idx === -1) return nodes[0].id;
	const step = Math.max(1, Math.floor(pageSize / 2));
	const nextIdx = Math.min(nodes.length - 1, idx + step);
	return nodes[nextIdx].id;
}

export function navNodePageUp(
	selectedId: string | null,
	nodes: DisplayNode[],
	pageSize = 20,
): string | null {
	if (nodes.length === 0) return null;
	const idx = findIndex(selectedId, nodes);
	if (idx === -1) return nodes[0].id;
	const step = Math.max(1, Math.floor(pageSize / 2));
	const prevIdx = Math.max(0, idx - step);
	return nodes[prevIdx].id;
}

export function navNodeNextLabel(
	selectedId: string | null,
	nodes: DisplayNode[],
): string | null {
	if (nodes.length === 0) return null;
	const idx = findIndex(selectedId, nodes);
	const start = idx === -1 ? 0 : idx + 1;
	for (let i = start; i < nodes.length; i++) {
		if (nodes[i].label) {
			return nodes[i].id;
		}
	}
	return selectedId;
}

export function navNodePrevLabel(
	selectedId: string | null,
	nodes: DisplayNode[],
): string | null {
	if (nodes.length === 0) return null;
	const idx = findIndex(selectedId, nodes);
	const start = idx === -1 ? nodes.length - 1 : idx - 1;
	for (let i = start; i >= 0; i--) {
		if (nodes[i].label) {
			return nodes[i].id;
		}
	}
	return selectedId;
}

export function navNodeNextUser(
	selectedId: string | null,
	nodes: DisplayNode[],
): string | null {
	if (nodes.length === 0) return null;
	const idx = findIndex(selectedId, nodes);
	const start = idx === -1 ? 0 : idx + 1;
	for (let i = start; i < nodes.length; i++) {
		if (nodes[i].role === "user") {
			return nodes[i].id;
		}
	}
	return selectedId;
}

export function navNodePrevUser(
	selectedId: string | null,
	nodes: DisplayNode[],
): string | null {
	if (nodes.length === 0) return null;
	const idx = findIndex(selectedId, nodes);
	const start = idx === -1 ? nodes.length - 1 : idx - 1;
	for (let i = start; i >= 0; i--) {
		if (nodes[i].role === "user") {
			return nodes[i].id;
		}
	}
	return selectedId;
}

// -------------------------------------------------------------
// 13 Branch Actions
// -------------------------------------------------------------

export function navBranchNext(
	selectedId: string | null,
	index: TreeIndex,
	wrap = false,
): string | null {
	if (!selectedId) return null;
	const branch = findNearestBranch(selectedId, index);
	if (!branch) return selectedId;

	const nextBranchId = branch.siblingBranchIds[branch.currentIndex + 1];
	return nextBranchId ?? (wrap ? branch.siblingBranchIds[0] : selectedId);
}

export function navBranchPrev(
	selectedId: string | null,
	index: TreeIndex,
	wrap = false,
): string | null {
	if (!selectedId) return null;
	const branch = findNearestBranch(selectedId, index);
	if (!branch) return selectedId;

	const prevBranchId = branch.siblingBranchIds[branch.currentIndex - 1];
	return (
		prevBranchId ??
		(wrap ? (branch.siblingBranchIds.at(-1) ?? selectedId) : selectedId)
	);
}

export function navBranchParent(
	selectedId: string | null,
	index: TreeIndex,
): string | null {
	if (!selectedId) return null;
	const branch = findNearestBranch(selectedId, index);
	if (!branch) return selectedId;

	return branch.forkPointId;
}

export function navBranchRoot(
	selectedId: string | null,
	index: TreeIndex,
): string | null {
	if (!selectedId) return null;
	const branch = findNearestBranch(selectedId, index);
	if (!branch) return selectedId;

	return branch.branchRootId;
}

export function navBranchLeaf(
	selectedId: string | null,
	index: TreeIndex,
	state: ExplorerState,
): string | null {
	if (!selectedId) return null;
	const branch = findNearestBranch(selectedId, index);
	if (!branch) {
		// If not inside a multi-branch fork, find leaves under current node's root
		const rootId = findRootForNode(selectedId, index);
		return rootId ? resolveBranchLeaf(rootId, index, state) : selectedId;
	}

	return resolveBranchLeaf(branch.branchRootId, index, state);
}

export function navBranchFirst(
	selectedId: string | null,
	index: TreeIndex,
): string | null {
	if (!selectedId) return null;
	const branch = findNearestBranch(selectedId, index);
	if (!branch) return selectedId;

	return branch.siblingBranchIds[0] ?? selectedId;
}

export function navBranchLast(
	selectedId: string | null,
	index: TreeIndex,
): string | null {
	if (!selectedId) return null;
	const branch = findNearestBranch(selectedId, index);
	if (!branch) return selectedId;

	return (
		branch.siblingBranchIds[branch.siblingBranchIds.length - 1] ?? selectedId
	);
}

export function navBranchNextFork(
	selectedId: string | null,
	index: TreeIndex,
): string | null {
	if (!selectedId) return null;
	const rootId = findRootForNode(selectedId, index);
	if (!rootId) return selectedId;

	// Collect forks belonging to current Root in preorder
	const rootForks = index.preorderIds.filter(
		(id) => index.forkPointIds.has(id) && findRootForNode(id, index) === rootId,
	);
	if (rootForks.length === 0) return selectedId;

	const curPreorderIdx = index.preorderIds.indexOf(selectedId);
	for (const forkId of rootForks) {
		if (index.preorderIds.indexOf(forkId) > curPreorderIdx) {
			return forkId;
		}
	}
	return selectedId;
}

export function navBranchPrevFork(
	selectedId: string | null,
	index: TreeIndex,
): string | null {
	if (!selectedId) return null;
	const rootId = findRootForNode(selectedId, index);
	if (!rootId) return selectedId;

	const rootForks = index.preorderIds.filter(
		(id) => index.forkPointIds.has(id) && findRootForNode(id, index) === rootId,
	);
	if (rootForks.length === 0) return selectedId;

	const curPreorderIdx = index.preorderIds.indexOf(selectedId);
	for (let i = rootForks.length - 1; i >= 0; i--) {
		const forkId = rootForks[i];
		if (index.preorderIds.indexOf(forkId) < curPreorderIdx) {
			return forkId;
		}
	}
	return selectedId;
}

export function navBranchActive(
	index: TreeIndex,
	state: ExplorerState,
): string | null {
	if (state.sessionLeafId && index.entryById.has(state.sessionLeafId)) {
		return state.sessionLeafId;
	}
	return state.selectedEntryId;
}

function findBranchWithLeaves(
	selectedId: string,
	index: TreeIndex,
): string | null {
	let current: string | null = selectedId;
	let fallbackRoot: string | null = null;

	while (current) {
		const branch = findNearestBranch(current, index);
		if (!branch) {
			fallbackRoot = findRootForNode(current, index);
			break;
		}
		const leaves = getBranchLeaves(branch.branchRootId, index);
		if (leaves.length > 1) {
			return branch.branchRootId;
		}
		if (!fallbackRoot) {
			fallbackRoot = branch.branchRootId;
		}
		current = branch.forkPointId;
	}

	return fallbackRoot;
}

export function navBranchNextLeaf(
	selectedId: string | null,
	index: TreeIndex,
): string | null {
	if (!selectedId) return null;
	const branchRoot = findBranchWithLeaves(selectedId, index);
	if (!branchRoot) return selectedId;

	const leaves = getBranchLeaves(branchRoot, index);
	if (leaves.length === 0) return selectedId;

	const idx = leaves.indexOf(selectedId);
	if (idx !== -1 && idx < leaves.length - 1) {
		return leaves[idx + 1];
	}
	if (idx === -1) {
		const curPreorderIdx = index.preorderIds.indexOf(selectedId);
		for (const leaf of leaves) {
			if (index.preorderIds.indexOf(leaf) > curPreorderIdx) {
				return leaf;
			}
		}
	}
	return selectedId;
}

export function navBranchPrevLeaf(
	selectedId: string | null,
	index: TreeIndex,
): string | null {
	if (!selectedId) return null;
	const branchRoot = findBranchWithLeaves(selectedId, index);
	if (!branchRoot) return selectedId;

	const leaves = getBranchLeaves(branchRoot, index);
	if (leaves.length === 0) return selectedId;

	const idx = leaves.indexOf(selectedId);
	if (idx > 0) {
		return leaves[idx - 1];
	}
	if (idx === -1) {
		const curPreorderIdx = index.preorderIds.indexOf(selectedId);
		for (let i = leaves.length - 1; i >= 0; i--) {
			const leaf = leaves[i];
			if (index.preorderIds.indexOf(leaf) < curPreorderIdx) {
				return leaf;
			}
		}
	}
	return selectedId;
}

export function navBranchCycle(
	selectedId: string | null,
	index: TreeIndex,
): string | null {
	if (!selectedId) return null;
	const branch = findNearestBranch(selectedId, index);
	if (!branch) return selectedId;

	const nextIdx = (branch.currentIndex + 1) % branch.siblingBranchIds.length;
	return branch.siblingBranchIds[nextIdx] ?? selectedId;
}
