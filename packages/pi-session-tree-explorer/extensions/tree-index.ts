import type { SessionEntry, TreeIndex } from "./types.ts";

/**
 * Build a read-only TreeIndex from a list of SessionEntry objects.
 * Guarantees O(N) indexing, deterministic session order preservation,
 * and safe cycle/missing-parent handling.
 */
export function buildTreeIndex(
	entries: readonly SessionEntry[],
	labels?: ReadonlyMap<string, string>,
): TreeIndex {
	const entryById = new Map<string, SessionEntry>();
	const displayLabelsById = new Map<string, string>();
	const parentById = new Map<string, string | null>();
	const childrenById = new Map<string, string[]>();
	const rootIds: string[] = [];

	// 1. Register all entries
	for (const entry of entries) {
		if (!entry || typeof entry.id !== "string") continue;
		entryById.set(entry.id, entry);
		const label = labels
			? labels.get(entry.id)
			: entry.type === "label"
				? undefined
				: entry.label;
		if (label) displayLabelsById.set(entry.id, label);
		else displayLabelsById.delete(entry.id);
		childrenById.set(entry.id, []);
	}

	// 2. Build parent-child relationships with missing parent resolution
	for (const entry of entryById.values()) {
		if (!entry || typeof entry.id !== "string") continue;
		const id = entry.id;
		const parentId = typeof entry.parentId === "string" ? entry.parentId : null;

		if (parentId === null || !entryById.has(parentId) || parentId === id) {
			// Null parent, missing parent, or self-cycle: treat as root
			parentById.set(id, null);
			rootIds.push(id);
		} else {
			parentById.set(id, parentId);
			const siblings = childrenById.get(parentId);
			if (siblings) {
				siblings.push(id);
			}
		}
	}

	// 3. Break any indirect cycles (A -> B -> A)
	const visitedGlobal = new Set<string>();
	for (const id of entryById.keys()) {
		if (visitedGlobal.has(id)) continue;

		const path: string[] = [];
		const pathSet = new Set<string>();
		let current: string | null = id;

		while (current !== null) {
			if (pathSet.has(current)) {
				// Cycle detected: detach 'current' from its parent
				const p = parentById.get(current);
				if (p) {
					const siblings = childrenById.get(p);
					if (siblings) {
						const idx = siblings.indexOf(current);
						if (idx !== -1) siblings.splice(idx, 1);
					}
				}
				parentById.set(current, null);
				if (!rootIds.includes(current)) {
					rootIds.push(current);
				}
				break;
			}

			if (visitedGlobal.has(current)) break;

			path.push(current);
			pathSet.add(current);
			current = parentById.get(current) ?? null;
		}

		for (const node of path) {
			visitedGlobal.add(node);
		}
	}

	// 4. Identify fork points and leaves
	const forkPointIds = new Set<string>();
	const leafIds = new Set<string>();

	for (const [id, children] of childrenById.entries()) {
		if (children.length > 1) {
			forkPointIds.add(id);
		}
		if (children.length === 0) {
			leafIds.add(id);
		}
	}

	// 5. Compute depths and preorder traversal
	const rawDepthById = new Map<string, number>();
	const turnDepthById = new Map<string, number>();
	const branchDepthById = new Map<string, number>();
	const preorderIds: string[] = [];

	function isUserMessage(entry: SessionEntry | undefined): boolean {
		return (
			entry?.type === "message" &&
			entry.message !== undefined &&
			entry.message.role === "user"
		);
	}

	interface StackFrame {
		id: string;
		rawDepth: number;
		turnDepth: number;
		branchDepth: number;
	}

	for (const rootId of rootIds) {
		const rootEntry = entryById.get(rootId);
		const initialTurn = isUserMessage(rootEntry) ? 1 : 0;

		const stack: StackFrame[] = [
			{
				id: rootId,
				rawDepth: 0,
				turnDepth: initialTurn,
				branchDepth: 0,
			},
		];

		while (stack.length > 0) {
			const frame = stack.pop();
			if (!frame) break;
			const { id, rawDepth, turnDepth, branchDepth } = frame;

			preorderIds.push(id);
			rawDepthById.set(id, rawDepth);
			turnDepthById.set(id, turnDepth);
			branchDepthById.set(id, branchDepth);

			const children = childrenById.get(id) ?? [];
			const isFork = children.length > 1;

			// Push in reverse order so children[0] is popped first
			for (let i = children.length - 1; i >= 0; i--) {
				const childId = children[i];
				const childEntry = entryById.get(childId);
				const childTurnDepth = isUserMessage(childEntry)
					? turnDepth + 1
					: turnDepth;
				const childBranchDepth = isFork ? branchDepth + 1 : branchDepth;

				stack.push({
					id: childId,
					rawDepth: rawDepth + 1,
					turnDepth: childTurnDepth,
					branchDepth: childBranchDepth,
				});
			}
		}
	}

	return {
		entryById,
		displayLabelsById,
		parentById,
		childrenById,
		rootIds,
		rawDepthById,
		turnDepthById,
		branchDepthById,
		forkPointIds,
		leafIds,
		preorderIds,
	};
}
