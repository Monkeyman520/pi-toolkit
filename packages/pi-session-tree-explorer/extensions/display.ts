import type {
	DisplayNode,
	DisplayOptions,
	ExplorerState,
	FoldOptions,
	SessionEntry,
	TreeIndex,
} from "./types.ts";

export function defaultDisplayOptions(): DisplayOptions {
	return {
		showAssistantNodes: false,
		showToolNodes: false,
		showThinkingNodes: false,
		showMetadataNodes: false,
		showCompactionNodes: true,
		userOnly: false,
		branchOnly: false,
		labeledOnly: false,
		depthMode: "turn",
		showDepth: true,
		maxMessageLength: 80,
		showNodeId: false,
		showTimestamps: false,
		layout: "normal",
	};
}

export function defaultFoldOptions(): FoldOptions {
	return {
		mode: "focused-only",
		collapseInactiveBranches: true,
		collapseLinearPaths: false,
		rememberManualOverrides: true,
		maxExpandDepth: 0,
	};
}

export function extractSummary(entry: SessionEntry): {
	summaryText: string;
	role?: string;
} {
	if (entry.type === "message" && entry.message) {
		const role = entry.message.role;
		let text = "";
		const content = entry.message.content;
		if (typeof content === "string") {
			text = content;
		} else if (Array.isArray(content)) {
			for (const block of content) {
				if (typeof block === "string") {
					text += block;
				} else if (
					block &&
					typeof block === "object" &&
					"text" in block &&
					typeof (block as { text: unknown }).text === "string"
				) {
					text += (block as { text: string }).text;
				}
			}
		}

		const clean = text.replace(/\s+/g, " ").trim();
		if (role === "user") {
			return { summaryText: clean || "(empty prompt)", role };
		}
		if (role === "assistant") {
			const model = entry.message.model ? `[${entry.message.model}] ` : "";
			return { summaryText: `${model}${clean || "(response)"}`, role };
		}
		if (role === "toolResult") {
			const tool = entry.message.toolName
				? `[${entry.message.toolName}] `
				: "[Tool] ";
			return { summaryText: `${tool}${clean || "(result)"}`, role };
		}
		if (role === "system") {
			return { summaryText: `[System] ${clean || "(system prompt)"}`, role };
		}
		return { summaryText: clean || `[${role}]`, role };
	}

	if (entry.type === "model_change") {
		return { summaryText: `[Model Change: ${entry.modelId ?? "unknown"}]` };
	}
	if (entry.type === "thinking_level_change") {
		return {
			summaryText: `[Thinking Level: ${entry.thinkingLevel ?? "unknown"}]`,
		};
	}
	if (entry.type === "usage") {
		return { summaryText: `[Usage: ${entry.kind ?? "usage"}]` };
	}
	if (entry.type === "compaction") {
		const s = entry.summary
			? `: ${entry.summary.replace(/\s+/g, " ").slice(0, 40)}`
			: "";
		return { summaryText: `[Compaction${s}]` };
	}
	if (entry.type === "context_edit") {
		return { summaryText: `[Context Edit: ${entry.targetId ?? ""}]` };
	}
	if (entry.type === "branch_summary") {
		const s = entry.summary
			? `: ${entry.summary.replace(/\s+/g, " ").slice(0, 40)}`
			: "";
		return { summaryText: `[Branch Summary${s}]` };
	}
	if (entry.type === "custom") {
		return { summaryText: `[Custom: ${entry.customType ?? "custom"}]` };
	}
	if (entry.type === "custom_message") {
		return {
			summaryText: `[Custom Message: ${entry.customType ?? "custom"}]`,
			role: "user",
		};
	}
	if (entry.type === "label") {
		return { summaryText: `[Label: ${entry.label ?? ""}]` };
	}
	if (entry.type === "session_info") {
		return { summaryText: `[Session: ${entry.name ?? ""}]` };
	}

	return { summaryText: `[${entry.type}]` };
}

/**
 * Check whether a node satisfies current display filtering options.
 */
export function isNodeVisible(
	entry: SessionEntry,
	index: TreeIndex,
	display: DisplayOptions,
	isTemporaryRevealed: boolean,
): boolean {
	if (isTemporaryRevealed) {
		return true;
	}

	// Message type toggles
	if (entry.type === "message" && entry.message) {
		const role = entry.message.role;
		if (role === "assistant" && !display.showAssistantNodes) return false;
		if (role === "toolResult" && !display.showToolNodes) return false;
		if (role === "system" && !display.showMetadataNodes) return false;
	} else if (entry.type === "compaction") {
		if (!display.showCompactionNodes) return false;
	} else if (
		entry.type === "model_change" ||
		entry.type === "thinking_level_change" ||
		entry.type === "usage" ||
		entry.type === "session_info" ||
		entry.type === "custom"
	) {
		if (!display.showMetadataNodes) return false;
	}

	// Intersecting constraints
	if (display.userOnly) {
		const isUser =
			(entry.type === "message" && entry.message?.role === "user") ||
			entry.type === "custom_message";
		if (!isUser) return false;
	}

	if (display.branchOnly) {
		const isBranchSummary = entry.type === "branch_summary";
		const isFork = index.forkPointIds.has(entry.id);
		if (!isBranchSummary && !isFork) return false;
	}

	if (display.labeledOnly) {
		if (!entry.label) return false;
	}

	return true;
}

export function countSubtreeDescendants(id: string, index: TreeIndex): number {
	let count = 0;
	const stack: string[] = [id];
	while (stack.length > 0) {
		const cur = stack.pop();
		if (!cur) break;
		const children = index.childrenById.get(cur) ?? [];
		count += children.length;
		for (const c of children) {
			stack.push(c);
		}
	}
	return count;
}

export function countSubtreeForks(id: string, index: TreeIndex): number {
	let forks = 0;
	const stack: string[] = [id];
	while (stack.length > 0) {
		const cur = stack.pop();
		if (!cur) break;
		const children = index.childrenById.get(cur) ?? [];
		if (children.length > 1) {
			forks++;
		}
		for (const c of children) {
			stack.push(c);
		}
	}
	return forks;
}

/**
 * Determine whether a node should be collapsed based on precedence:
 * Temporary Reveal > Manual Overrides > Configured Policy > Default
 */
export function isNodeCollapsed(
	nodeId: string,
	index: TreeIndex,
	state: ExplorerState,
): boolean {
	// 1. Temporary search reveal precedence (expanded)
	if (state.temporaryRevealedIds.size > 0) {
		if (state.temporaryRevealedIds.has(nodeId)) {
			return false;
		}
		if (isSubtreeRevealed(nodeId, index, state.temporaryRevealedIds)) {
			return false;
		}
	}

	// 2. Manual overrides
	if (state.manualCollapsedIds.has(nodeId)) {
		return true;
	}
	if (state.manualExpandedIds.has(nodeId)) {
		return false;
	}

	// 3. Configured policy
	const mode = state.foldOptions.mode;
	if (mode === "all" || mode === "manual") {
		return false;
	}

	if (mode === "depth-limited") {
		const rawDepth = index.rawDepthById.get(nodeId) ?? 0;
		return rawDepth >= state.foldOptions.maxExpandDepth;
	}

	if (mode === "focused-only" || mode === "active-only") {
		const parentId = index.parentById.get(nodeId);
		if (!parentId) {
			return false;
		}

		// If parent is a fork point
		const siblings = index.childrenById.get(parentId) ?? [];
		if (siblings.length > 1) {
			// Check if this branch is on the target path
			const targetPath =
				mode === "active-only"
					? getActivePathIds(index, state.sessionLeafId)
					: state.focusedPathIds;

			const isBranchFocused = targetPath.has(nodeId);

			if (!isBranchFocused) {
				return true;
			}
		}
	}

	return false;
}

function isSubtreeRevealed(
	id: string,
	index: TreeIndex,
	revealed: Set<string>,
): boolean {
	if (revealed.size === 0) return false;
	const stack: string[] = [id];
	while (stack.length > 0) {
		const cur = stack.pop();
		if (!cur) break;
		const children = index.childrenById.get(cur) ?? [];
		for (const c of children) {
			if (revealed.has(c)) return true;
			stack.push(c);
		}
	}
	return false;
}

function getActivePathIds(
	index: TreeIndex,
	leafId: string | null,
): Set<string> {
	const set = new Set<string>();
	let cur = leafId;
	while (cur) {
		set.add(cur);
		cur = index.parentById.get(cur) ?? null;
	}
	return set;
}

/**
 * Build visible projection with fold and filter semantics applied.
 */
export function buildDisplayProjection(
	index: TreeIndex,
	state: ExplorerState,
): DisplayNode[] {
	const nodes: DisplayNode[] = [];

	interface ProcessFrame {
		id: string;
		nearestVisibleParentId: string | null;
	}

	const stack: ProcessFrame[] = [];

	// Push roots in reverse order
	for (let i = index.rootIds.length - 1; i >= 0; i--) {
		stack.push({ id: index.rootIds[i], nearestVisibleParentId: null });
	}

	while (stack.length > 0) {
		const frame = stack.pop();
		if (!frame) break;
		const { id, nearestVisibleParentId } = frame;

		const entry = index.entryById.get(id);
		if (!entry) continue;

		const isTemporary = state.temporaryRevealedIds.has(id);
		const visible = isNodeVisible(
			entry,
			index,
			state.displayOptions,
			isTemporary,
		);

		const children = index.childrenById.get(id) ?? [];
		const isFork = children.length > 1;
		const isLeaf = children.length === 0;
		const isCurrentLeaf = id === state.sessionLeafId;
		const isSelected = id === state.selectedEntryId;
		const collapsed = isNodeCollapsed(id, index, state);

		if (visible) {
			const { summaryText, role } = extractSummary(entry);
			const node: DisplayNode = {
				id,
				realId: id,
				isVirtual: false,
				kind: entry.type,
				role,
				summaryText,
				timestamp: entry.timestamp,
				rawDepth: index.rawDepthById.get(id) ?? 0,
				turnDepth: index.turnDepthById.get(id) ?? 0,
				branchDepth: index.branchDepthById.get(id) ?? 0,
				hasChildren: children.length > 0,
				isLeaf,
				isFork,
				isCurrentLeaf,
				isSelected,
				label: typeof entry.label === "string" ? entry.label : undefined,
				visibleParentId: nearestVisibleParentId,
				isCollapsed: collapsed,
				isExpanded: !collapsed,
			};
			nodes.push(node);

			if (collapsed) {
				continue;
			}

			// To preserve exact preorder child processing:
			for (const childId of children) {
				const isChildBranchCollapsed =
					isFork && isNodeCollapsed(childId, index, state);

				if (isChildBranchCollapsed) {
					const childEntry = index.entryById.get(childId);
					const childSummary = childEntry
						? extractSummary(childEntry).summaryText
						: "(branch)";
					const descCount = countSubtreeDescendants(childId, index) + 1;
					const forkCount = countSubtreeForks(childId, index);
					const virtualId = `virtual:branch:${childId}`;

					nodes.push({
						id: virtualId,
						realId: null,
						isVirtual: true,
						isVirtualSummary: true,
						anchorEntryId: childId,
						kind: "collapsed_branch",
						summaryText: `▸ ${childSummary} [${descCount} nodes${forkCount > 0 ? `, ${forkCount} forks` : ""}]`,
						timestamp: childEntry?.timestamp ?? entry.timestamp,
						rawDepth: index.rawDepthById.get(childId) ?? 0,
						turnDepth: index.turnDepthById.get(childId) ?? 0,
						branchDepth: index.branchDepthById.get(childId) ?? 0,
						hasChildren: false,
						isLeaf: false,
						isFork: false,
						isCurrentLeaf: false,
						isSelected: virtualId === state.selectedEntryId,
						visibleParentId: id,
						isCollapsed: true,
						isExpanded: false,
						virtualDescendantCount: descCount,
						virtualForkCount: forkCount,
					});
				}
			}

			for (let i = children.length - 1; i >= 0; i--) {
				const childId = children[i];
				const isChildBranchCollapsed =
					isFork && isNodeCollapsed(childId, index, state);
				if (!isChildBranchCollapsed) {
					stack.push({ id: childId, nearestVisibleParentId: id });
				}
			}
		} else {
			for (let i = children.length - 1; i >= 0; i--) {
				stack.push({ id: children[i], nearestVisibleParentId });
			}
		}
	}

	return nodes;
}
