import type {
	DisplayNode,
	ExplorerState,
	SessionEntry,
	TreeIndex,
} from "./types.ts";

function extractSummary(entry: SessionEntry): {
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
 * Build initial visible projection from TreeIndex.
 * In T0001, projects all indexed nodes in preorder.
 */
export function buildDisplayProjection(
	index: TreeIndex,
	state: ExplorerState,
): DisplayNode[] {
	const nodes: DisplayNode[] = [];

	for (const id of index.preorderIds) {
		const entry = index.entryById.get(id);
		if (!entry) continue;

		const { summaryText, role } = extractSummary(entry);
		const children = index.childrenById.get(id) ?? [];
		const isLeaf = children.length === 0;
		const isFork = children.length > 1;
		const isCurrentLeaf = id === state.sessionLeafId;
		const isSelected = id === state.selectedEntryId;

		nodes.push({
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
		});
	}

	return nodes;
}
