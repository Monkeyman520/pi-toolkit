import type {
	DisplayNode,
	DisplayOptions,
	ExplorerState,
	FoldOptions,
	SessionEntry,
	ToolGroupInfo,
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

export function extractSummary(
	entry: SessionEntry,
	showThinking = false,
): {
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

		if (showThinking && Array.isArray(content))
			for (const block of content)
				if (
					block &&
					typeof block === "object" &&
					"thinking" in block &&
					typeof block.thinking === "string"
				)
					text += ` ${block.thinking}`;
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
		entry.type === "label" ||
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
		if (!index.displayLabelsById.has(entry.id)) return false;
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

export function countTotalTurns(index: TreeIndex): number {
	let turns = 0;
	for (const entry of index.entryById.values()) {
		if (
			(entry.type === "message" && entry.message?.role === "user") ||
			entry.type === "custom_message"
		) {
			turns++;
		}
	}
	return turns;
}

export function isToolEntry(entry: SessionEntry): boolean {
	if (entry.type !== "message" || !entry.message) return false;
	if (entry.message.role === "toolResult") return true;
	if (
		entry.message.role === "assistant" &&
		Array.isArray(entry.message.content)
	) {
		let hasToolCall = false;
		let hasText = false;
		for (const block of entry.message.content) {
			if (block && typeof block === "object" && "type" in block) {
				const t = (block as { type?: unknown }).type;
				if (t === "toolCall") hasToolCall = true;
				else if (
					t === "text" &&
					"text" in block &&
					typeof (block as { text?: unknown }).text === "string" &&
					(block as { text: string }).text.trim().length > 0
				) {
					hasText = true;
				}
			}
		}
		return hasToolCall && !hasText;
	}
	return false;
}

function extractToolNamesFromEntry(entry: SessionEntry): string[] {
	const names: string[] = [];
	if (entry.message?.role === "toolResult") {
		if (entry.message.toolName) names.push(entry.message.toolName);
		return names.length > 0 ? names : ["tool"];
	}
	if (
		entry.message?.role === "assistant" &&
		Array.isArray(entry.message.content)
	) {
		for (const block of entry.message.content) {
			if (
				block &&
				typeof block === "object" &&
				"type" in block &&
				(block as { type?: unknown }).type === "toolCall" &&
				"name" in block &&
				typeof (block as { name?: unknown }).name === "string"
			) {
				names.push((block as { name: string }).name);
			}
		}
	}
	return names;
}

function computeToolGroupInfo(entries: SessionEntry[]): {
	toolNames: string[];
	count: number;
	statusSummary: string;
} {
	const seen = new Set<string>();
	const toolNames: string[] = [];
	let toolResultCount = 0;
	let toolCallCount = 0;
	let errorCount = 0;

	for (const entry of entries) {
		for (const name of extractToolNamesFromEntry(entry)) {
			if (!seen.has(name)) {
				seen.add(name);
				toolNames.push(name);
			}
		}
		if (entry.message?.role === "toolResult") {
			toolResultCount++;
			if (entry.message.isError) errorCount++;
		} else if (
			entry.message?.role === "assistant" &&
			Array.isArray(entry.message.content)
		) {
			for (const block of entry.message.content) {
				if (
					block &&
					typeof block === "object" &&
					"type" in block &&
					(block as { type?: unknown }).type === "toolCall"
				) {
					toolCallCount++;
				}
			}
		}
	}

	const count =
		toolResultCount > 0
			? toolResultCount
			: Math.max(toolCallCount, entries.length);
	const okCount = Math.max(0, count - errorCount);
	const statusSummary =
		errorCount > 0 ? `${okCount} ok, ${errorCount} err` : `${count} ok`;
	return {
		toolNames: toolNames.length > 0 ? toolNames : ["tool"],
		count,
		statusSummary,
	};
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

	if (mode === "focused-only" || mode === "active-only" || mode === "smart") {
		if (mode === "smart" && countTotalTurns(index) < 20) {
			return false;
		}
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
	summaryFor: typeof extractSummary = extractSummary,
): DisplayNode[] {
	const nodes: DisplayNode[] = [];
	const activePath = getActivePathIds(index, state.sessionLeafId);
	const totalTurns = countTotalTurns(index);
	const isSmartMode = state.foldOptions.mode === "smart";
	const isLongSmart = isSmartMode && totalTurns >= 20;
	const revealedAncestors = new Set<string>();
	for (const id of state.temporaryRevealedIds) {
		let cur: string | null = id;
		while (cur && !revealedAncestors.has(cur)) {
			revealedAncestors.add(cur);
			cur = index.parentById.get(cur) ?? null;
		}
	}
	const collapsed = (id: string) => {
		if (revealedAncestors.has(id)) return false;
		if (state.manualCollapsedIds.has(id)) return true;
		if (state.manualExpandedIds.has(id)) return false;
		const mode = state.foldOptions.mode;
		if (mode === "depth-limited")
			return (
				(index.rawDepthById.get(id) ?? 0) >= state.foldOptions.maxExpandDepth
			);
		if (mode === "smart") {
			if (!isLongSmart || !state.foldOptions.collapseInactiveBranches)
				return false;
			const parent = index.parentById.get(id);
			return (
				!!parent &&
				(index.childrenById.get(parent)?.length ?? 0) > 1 &&
				!state.focusedPathIds.has(id)
			);
		}
		if (
			(mode === "focused-only" || mode === "active-only") &&
			state.foldOptions.collapseInactiveBranches
		) {
			const parent = index.parentById.get(id);
			return (
				!!parent &&
				(index.childrenById.get(parent)?.length ?? 0) > 1 &&
				!(mode === "active-only" ? activePath : state.focusedPathIds).has(id)
			);
		}
		return false;
	};
	const stack: Array<{
		id: string;
		parent: string | null;
		asSummary: boolean;
	}> = [];
	for (let i = index.rootIds.length - 1; i >= 0; i--)
		stack.push({ id: index.rootIds[i], parent: null, asSummary: false });
	while (stack.length) {
		const frame = stack.pop();
		if (!frame) break;
		const { id, parent } = frame;
		const entry = index.entryById.get(id);
		if (!entry) continue;
		const toolAggregationActive =
			!state.displayOptions.userOnly &&
			!state.displayOptions.branchOnly &&
			!state.displayOptions.labeledOnly &&
			(state.displayOptions.showToolNodes || isSmartMode);
		if (toolAggregationActive && !frame.asSummary && !collapsed(id)) {
			const span: string[] = [];
			const spanEntries: SessionEntry[] = [];
			let curTool: string | undefined = id;
			while (curTool) {
				const item = index.entryById.get(curTool);
				const itemChildren: string[] = index.childrenById.get(curTool) ?? [];
				if (
					!item ||
					!isToolEntry(item) ||
					index.parentById.get(curTool) == null ||
					itemChildren.length > 1 ||
					index.displayLabelsById.has(curTool) ||
					curTool === state.sessionLeafId ||
					collapsed(curTool)
				) {
					break;
				}
				span.push(curTool);
				spanEntries.push(item);
				curTool = itemChildren.length === 1 ? itemChildren[0] : undefined;
			}
			const minToolSpan =
				isSmartMode && !state.displayOptions.showToolNodes ? 1 : 2;
			if (span.length >= minToolSpan) {
				const virtualId = `virtual:tool-group:${id}`;
				const hasReveal = span.some(
					(s) => state.temporaryRevealedIds.has(s) || revealedAncestors.has(s),
				);
				const isExpanded =
					!state.manualCollapsedIds.has(virtualId) &&
					(state.manualExpandedIds.has(virtualId) || hasReveal);
				const meta = computeToolGroupInfo(spanEntries);
				const toolGroup: ToolGroupInfo = {
					toolNames: meta.toolNames,
					count: meta.count,
					statusSummary: meta.statusSummary,
					isExpanded,
					entryIds: span,
				};
				const groupRawDepth = index.rawDepthById.get(id) ?? 0;
				nodes.push({
					id: virtualId,
					realId: null,
					isVirtual: true,
					isVirtualSummary: true,
					anchorEntryId: id,
					compressedEntryIds: span,
					kind: "virtual-tool-group",
					summaryText: `${isExpanded ? "▾" : "▸"} [Tools ×${meta.count}] ${meta.toolNames.join(", ")}`,
					timestamp: entry.timestamp,
					rawDepth: groupRawDepth,
					turnDepth: index.turnDepthById.get(id) ?? 0,
					branchDepth: index.branchDepthById.get(id) ?? 0,
					hasChildren: true,
					isLeaf: false,
					isFork: false,
					isCurrentLeaf: false,
					isSelected: state.selectedEntryId === virtualId,
					visibleParentId: parent,
					isCollapsed: !isExpanded,
					isExpanded,
					virtualDescendantCount: span.length,
					virtualForkCount: 0,
					toolGroup,
				});
				if (isExpanded) {
					for (let sIdx = 0; sIdx < span.length; sIdx++) {
						const spanId = span[sIdx];
						const spanEntry = spanEntries[sIdx];
						const { summaryText: childSummary, role: childRole } = summaryFor(
							spanEntry,
							state.displayOptions.showThinkingNodes,
						);
						nodes.push({
							id: spanId,
							realId: spanId,
							isVirtual: false,
							kind: spanEntry.type,
							role: childRole,
							summaryText: childSummary,
							timestamp: spanEntry.timestamp,
							rawDepth: groupRawDepth + 1,
							turnDepth: index.turnDepthById.get(spanId) ?? 0,
							branchDepth: index.branchDepthById.get(spanId) ?? 0,
							hasChildren: false,
							isLeaf: (index.childrenById.get(spanId)?.length ?? 0) === 0,
							isFork: false,
							isCurrentLeaf: spanId === state.sessionLeafId,
							isSelected: spanId === state.selectedEntryId,
							label:
								state.branchBookmarks?.[spanId] ??
								index.displayLabelsById.get(spanId),
							visibleParentId: virtualId,
							isCollapsed: false,
							isExpanded: true,
						});
					}
				}
				const lastId = span[span.length - 1];
				const lastChildren = index.childrenById.get(lastId) ?? [];
				for (let i = lastChildren.length - 1; i >= 0; i--) {
					stack.push({
						id: lastChildren[i],
						parent: virtualId,
						asSummary: lastChildren.length > 1,
					});
				}
				continue;
			}
		}
		if (state.foldOptions.collapseLinearPaths) {
			const eligible = (candidate: string) => {
				const item = index.entryById.get(candidate);
				return (
					!!item &&
					index.parentById.get(candidate) != null &&
					(index.childrenById.get(candidate)?.length ?? 0) === 1 &&
					!index.displayLabelsById.has(candidate) &&
					!state.branchBookmarks?.[candidate] &&
					candidate !== state.selectedEntryId &&
					candidate !== state.sessionLeafId &&
					!state.manualExpandedIds.has(candidate) &&
					!revealedAncestors.has(candidate) &&
					!collapsed(candidate) &&
					isNodeVisible(item, index, state.displayOptions, false)
				);
			};
			const span: string[] = [];
			let next: string = id;
			while (eligible(next)) {
				span.push(next);
				next = (index.childrenById.get(next) ?? [])[0];
			}
			if (span.length >= 2) {
				const virtualId = `virtual:linear:${id}`;
				nodes.push({
					id: virtualId,
					realId: null,
					isVirtual: true,
					isVirtualSummary: true,
					anchorEntryId: id,
					compressedEntryIds: span,
					kind: "compressed_path",
					summaryText: `▸ Linear path [${span.length} entries]`,
					timestamp: entry.timestamp,
					rawDepth: index.rawDepthById.get(id) ?? 0,
					turnDepth: index.turnDepthById.get(id) ?? 0,
					branchDepth: index.branchDepthById.get(id) ?? 0,
					hasChildren: true,
					isLeaf: false,
					isFork: false,
					isCurrentLeaf: false,
					isSelected: state.selectedEntryId === virtualId,
					visibleParentId: parent,
					isCollapsed: true,
					isExpanded: false,
					virtualDescendantCount: span.length,
					virtualForkCount: 0,
				});
				stack.push({ id: next, parent: virtualId, asSummary: false });
				continue;
			}
		}
		const children = index.childrenById.get(id) ?? [];
		const smartEffectiveDisplay: DisplayOptions =
			isSmartMode &&
			!state.displayOptions.userOnly &&
			!state.displayOptions.branchOnly &&
			!state.displayOptions.labeledOnly
				? { ...state.displayOptions, showAssistantNodes: true }
				: state.displayOptions;
		const visible = isNodeVisible(
			entry,
			index,
			smartEffectiveDisplay,
			state.temporaryRevealedIds.has(id),
		);
		const folded = collapsed(id);
		const summary = folded && (frame.asSummary || !visible);
		const summaryId = `virtual:branch:${id}`;
		const { summaryText, role } = summaryFor(
			entry,
			state.displayOptions.showThinkingNodes,
		);
		if (summary || visible) {
			const count = summary
				? countSubtreeDescendants(id, index) + 1
				: undefined;
			const forks = summary ? countSubtreeForks(id, index) : undefined;
			nodes.push({
				id: summary ? summaryId : id,
				realId: summary ? null : id,
				isVirtual: summary,
				isVirtualSummary: summary,
				anchorEntryId: summary ? id : undefined,
				kind: summary ? "collapsed_branch" : entry.type,
				role: summary ? undefined : role,
				summaryText: summary
					? `▸ ${summaryText} [${count} nodes${forks ? `, ${forks} forks` : ""}]`
					: summaryText,
				timestamp: entry.timestamp,
				rawDepth: index.rawDepthById.get(id) ?? 0,
				turnDepth: index.turnDepthById.get(id) ?? 0,
				branchDepth: index.branchDepthById.get(id) ?? 0,
				hasChildren: !summary && children.length > 0,
				isLeaf: !summary && children.length === 0,
				isFork: !summary && children.length > 1,
				isCurrentLeaf: !summary && id === state.sessionLeafId,
				isSelected: (summary ? summaryId : id) === state.selectedEntryId,
				label: state.branchBookmarks?.[id] ?? index.displayLabelsById.get(id),
				visibleParentId: parent,
				isCollapsed: folded,
				isExpanded: !folded,
				virtualDescendantCount: count,
				virtualForkCount: forks,
			});
			if (folded) continue;
		}
		for (let i = children.length - 1; i >= 0; i--)
			stack.push({
				id: children[i],
				parent: visible ? id : parent,
				asSummary: children.length > 1,
			});
	}
	return nodes;
}

/** Resolve only IDs present in the raw index or explicit projected anchors. */
export function rawTargetForSelection(
	id: string | null,
	nodes: DisplayNode[],
	index: TreeIndex,
): string | null {
	if (!id) return null;
	const node = nodes.find((n) => n.id === id);
	if (node?.isVirtual)
		return node.anchorEntryId && index.entryById.has(node.anchorEntryId)
			? node.anchorEntryId
			: null;
	return index.entryById.has(id) ? id : null;
}
export function reconcileSelection(
	index: TreeIndex,
	state: ExplorerState,
	nodes: DisplayNode[],
): void {
	if (nodes.some((n) => n.id === state.selectedEntryId)) return;
	let cur = state.selectedEntryId
		? index.parentById.get(state.selectedEntryId)
		: null;
	while (cur) {
		if (nodes.some((n) => n.id === cur)) {
			state.selectedEntryId = cur;
			return;
		}
		cur = index.parentById.get(cur) ?? null;
	}
	state.selectedEntryId = nodes[0]?.id ?? null;
}
/** Keep a hidden raw choice inside its subtree before falling back to ancestry. */
export function resolveDisplayTarget(
	id: string | null,
	index: TreeIndex,
	nodes: DisplayNode[],
): string | null {
	if (id && nodes.some((n) => n.id === id)) return id;
	if (id && index.entryById.has(id)) {
		const rows = new Map(nodes.map((n) => [n.id, n]));
		const anchors = new Map(
			nodes.flatMap((n) =>
				n.isVirtual
					? (n.compressedEntryIds ?? [n.anchorEntryId])
							.filter((id): id is string => !!id)
							.map((id) => [id, n.id] as const)
					: [],
			),
		);
		const stack = [id];
		while (stack.length) {
			const current = stack.pop();
			if (!current) break;
			if (rows.has(current)) return current;
			const summary = anchors.get(current);
			if (summary) return summary;
			const children = index.childrenById.get(current) ?? [];
			for (let i = children.length - 1; i >= 0; i--) stack.push(children[i]);
		}
		let current = index.parentById.get(id);
		while (current) {
			if (rows.has(current)) return current;
			const summary = anchors.get(current);
			if (summary) return summary;
			current = index.parentById.get(current) ?? null;
		}
	}
	return nodes[0]?.id ?? null;
}
/** Expand precisely the real IDs owned by the selected projected summary. */
export function expandDisplaySelection(
	id: string,
	nodes: DisplayNode[],
	index: TreeIndex,
	state: ExplorerState,
): string | null {
	const target = rawTargetForSelection(id, nodes, index);
	if (!target) return null;
	const span = nodes.find((n) => n.id === id)?.compressedEntryIds ?? [target];
	for (const realId of span)
		if (index.entryById.has(realId)) {
			state.manualExpandedIds.add(realId);
			state.manualCollapsedIds.delete(realId);
		}
	return target;
}
