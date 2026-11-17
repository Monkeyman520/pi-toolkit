import { truncateToWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import { estimateMessageTokens } from "./context-metrics.ts";
import { extractContentText } from "./search.ts";
import type {
	ContextMetrics,
	DisplayNode,
	ExplorerState,
	InspectionScroll,
	SessionEntry,
	SessionStatistics,
	TreeIndex,
} from "./types.ts";
/** Line-window rendering for the existing inline component (no layout-node SDK dependency). */
export class InspectionView {
	private identity = "";
	private contentKey = "";
	private lines: string[] = [];
	private offset = 0;
	private viewport = 1;
	private maxOffset = 0;
	public reset() {
		this.identity = "";
		this.contentKey = "";
		this.lines = [];
		this.offset = 0;
		this.maxOffset = 0;
	}
	public scroll(move: InspectionScroll) {
		const next =
			move === "first"
				? 0
				: move === "last"
					? this.maxOffset
					: this.offset +
						(move === "up"
							? -1
							: move === "down"
								? 1
								: move === "pageUp"
									? -this.viewport
									: this.viewport);
		this.offset = Math.max(0, Math.min(this.maxOffset, next));
	}
	public render(options: {
		identity: string;
		contentKey: string;
		width: number;
		height: number;
		title: string;
		footer: string;
		body: () => string[];
	}): string[] {
		const { identity, contentKey, width, title, footer } = options,
			height = Math.max(1, Math.floor(options.height));
		if (identity !== this.identity) {
			this.reset();
			this.identity = identity;
		}
		if (contentKey !== this.contentKey) {
			this.lines = options.body();
			this.contentKey = contentKey;
		}
		const chrome = height >= 5 ? 4 : height >= 3 ? 2 : height === 2 ? 1 : 0;
		this.viewport = Math.max(1, height - chrome);
		this.maxOffset = Math.max(0, this.lines.length - this.viewport);
		this.offset = Math.min(this.offset, this.maxOffset);
		const body = this.lines.slice(this.offset, this.offset + this.viewport);
		const end = Math.min(this.lines.length, this.offset + this.viewport);
		const hint = `[${this.lines.length ? this.offset + 1 : 0}-${end}/${this.lines.length}] ${footer}`;
		const divider = "─".repeat(width);
		const output =
			height >= 5
				? [title, divider, ...body, divider, hint]
				: height >= 3
					? [title, ...body, hint]
					: height === 2
						? [...body, hint]
						: body;
		return output.map((line) => truncateToWidth(line, width));
	}
}

export function extractFilesChangedFromEntry(entry: SessionEntry): string[] {
	const files: string[] = [];
	const seen = new Set<string>();
	const pushPath = (val: unknown) => {
		if (typeof val === "string" && val.trim() && !seen.has(val)) {
			seen.add(val);
			files.push(val);
		}
	};

	const content = entry.message?.content;
	if (Array.isArray(content)) {
		for (const block of content) {
			if (
				block &&
				typeof block === "object" &&
				"type" in block &&
				(block as { type?: unknown }).type === "toolCall" &&
				"arguments" in block
			) {
				const args = (block as { arguments?: unknown }).arguments;
				if (args && typeof args === "object") {
					const rec = args as Record<string, unknown>;
					pushPath(rec.path);
					pushPath(rec.file_path);
					pushPath(rec.filePath);
					if (Array.isArray(rec.paths)) {
						for (const p of rec.paths) pushPath(p);
					}
				}
			}
		}
	}
	return files;
}

function summarizeToolArgs(args: unknown): string {
	if (!args || typeof args !== "object") return "";
	const entries = Object.entries(args as Record<string, unknown>);
	if (entries.length === 0) return "";
	return entries
		.slice(0, 3)
		.map(([k, v]) => {
			const str = typeof v === "string" ? v : JSON.stringify(v);
			return `${k}=${str.slice(0, 24)}`;
		})
		.join(", ");
}

export function formatRichPreviewLines(options: {
	node?: DisplayNode;
	entry?: SessionEntry;
	index: TreeIndex;
	width: number;
	metrics?: ContextMetrics;
	metricsBadge?: string;
}): string[] {
	const { node, entry, index, metrics, metricsBadge } = options;
	const wrapWidth = Math.max(10, options.width);
	const lines: string[] = [];
	const pushWrapped = (text: string) => {
		for (const paragraph of text.split("\n")) {
			for (const line of wrapTextWithAnsi(paragraph || " ", wrapWidth)) {
				lines.push(line);
			}
		}
	};

	if (node?.kind === "virtual-tool-group" && node.toolGroup) {
		pushWrapped(
			`[TOOL GROUP] ${node.toolGroup.count} calls · ${node.toolGroup.statusSummary}`,
		);
		pushWrapped(
			`Turn: D${node.turnDepth} · Tools: ${node.toolGroup.toolNames.join(", ")}`,
		);
		pushWrapped("Invocations:");
		for (const id of node.toolGroup.entryIds) {
			const item = index.entryById.get(id);
			if (!item) continue;
			if (item.message?.role === "toolResult") {
				const tool = item.message.toolName ?? "tool";
				const status = item.message.isError ? "err" : "ok";
				const snippet = extractContentText(item)
					.replace(/\s+/g, " ")
					.trim()
					.slice(0, 80);
				pushWrapped(`  [${tool}] (${status}) ${snippet}`);
			} else if (
				item.message?.role === "assistant" &&
				Array.isArray(item.message.content)
			) {
				for (const block of item.message.content) {
					if (
						block &&
						typeof block === "object" &&
						"type" in block &&
						(block as { type?: unknown }).type === "toolCall"
					) {
						const b = block as { name?: unknown; arguments?: unknown };
						const name = typeof b.name === "string" ? b.name : "tool";
						const argStr = summarizeToolArgs(b.arguments);
						pushWrapped(`  → ${name}(${argStr})`);
					}
				}
			}
		}
		return lines;
	}

	if (!entry) {
		if (node?.isVirtualSummary) {
			pushWrapped(`[VIRTUAL SUMMARY] ${node.kind}`);
			pushWrapped(
				`Anchor: ${node.anchorEntryId ?? "none"} · Descendants: ${node.virtualDescendantCount ?? 0} · Forks: ${node.virtualForkCount ?? 0}`,
			);
			pushWrapped("Press Enter or l to expand in Outline.");
			return lines;
		}
		return [`Virtual branch summary or missing node: ${node?.id ?? ""}`];
	}

	const role = entry.message?.role ?? entry.type;
	const isTip = index.leafIds.has(entry.id);
	const isCurrent = node?.isCurrentLeaf ?? false;
	const turnDepth = index.turnDepthById.get(entry.id) ?? 0;
	const headerParts = [
		`[${role.toUpperCase()}]`,
		isCurrent ? "CURRENT" : "",
		isTip ? "Branch tip" : "",
		`D${turnDepth}`,
		`${entry.timestamp}`,
	].filter(Boolean);
	pushWrapped(headerParts.join(" · "));

	const bookmark = index.displayLabelsById.get(entry.id);
	if (bookmark) pushWrapped(`Label: ${bookmark}`);

	const model = entry.message?.model ?? metrics?.modelId;
	if (model || metricsBadge) {
		pushWrapped(`Model: ${model ?? "n/a"} · Context: ${metricsBadge ?? "—"}`);
	}

	if (entry.message?.toolName) {
		const status = entry.message.isError ? "err" : "ok";
		pushWrapped(`Tool: ${entry.message.toolName} (${status})`);
	}

	if (Array.isArray(entry.message?.content)) {
		for (const block of entry.message.content) {
			if (
				block &&
				typeof block === "object" &&
				"type" in block &&
				(block as { type?: unknown }).type === "toolCall"
			) {
				const b = block as { name?: unknown; arguments?: unknown };
				const name = typeof b.name === "string" ? b.name : "tool";
				const argStr = summarizeToolArgs(b.arguments);
				pushWrapped(`Tool call: ${name}(${argStr})`);
			}
		}
	}

	const filesChanged = extractFilesChangedFromEntry(entry);
	if (filesChanged.length > 0) {
		pushWrapped(`Files changed: ${filesChanged.join(", ")}`);
	}

	pushWrapped("Full Content:");
	pushWrapped(extractContentText(entry));
	return lines;
}

export function computeSessionStatistics(
	index: TreeIndex,
	state?: Pick<ExplorerState, "branchBookmarks">,
): SessionStatistics {
	let turnCount = 0;
	let assistantCount = 0;
	let totalToolCalls = 0;
	let toolErrors = 0;
	let estimatedTotalTokens = 0;
	let reportedTotalTokens = 0;
	const toolDistribution: Record<string, number> = {};
	const countedToolCallIds = new Set<string>();

	for (const entry of index.entryById.values()) {
		if (entry.type === "message" && entry.message) {
			estimatedTotalTokens += estimateMessageTokens(entry.message);
			const role = entry.message.role;
			if (role === "user") {
				turnCount++;
			} else if (role === "assistant") {
				assistantCount++;
				if (typeof entry.message.usage?.totalTokens === "number") {
					reportedTotalTokens += entry.message.usage.totalTokens;
				}
				if (Array.isArray(entry.message.content)) {
					for (const block of entry.message.content) {
						if (
							block &&
							typeof block === "object" &&
							"type" in block &&
							(block as { type?: unknown }).type === "toolCall"
						) {
							const b = block as { id?: unknown; name?: unknown };
							const name = typeof b.name === "string" ? b.name : "tool";
							if (typeof b.id === "string") countedToolCallIds.add(b.id);
							totalToolCalls++;
							toolDistribution[name] = (toolDistribution[name] ?? 0) + 1;
						}
					}
				}
			} else if (role === "toolResult") {
				if (entry.message.isError) toolErrors++;
				const callId = entry.message.toolCallId;
				if (!callId || !countedToolCallIds.has(callId)) {
					const name = entry.message.toolName ?? "tool";
					totalToolCalls++;
					toolDistribution[name] = (toolDistribution[name] ?? 0) + 1;
				}
			}
		} else if (entry.type === "custom_message") {
			turnCount++;
		}
	}

	const bookmarkedIds = new Set<string>(index.displayLabelsById.keys());
	if (state?.branchBookmarks) {
		for (const id of Object.keys(state.branchBookmarks)) {
			if (index.entryById.has(id)) bookmarkedIds.add(id);
		}
	}

	return {
		totalNodes: index.entryById.size,
		turnCount,
		assistantCount,
		branchCount: Math.max(index.rootIds.length, index.leafIds.size),
		forkCount: index.forkPointIds.size,
		leafCount: index.leafIds.size,
		totalToolCalls,
		toolErrors,
		toolDistribution,
		estimatedTotalTokens,
		reportedTotalTokens,
		bookmarkedBranches: bookmarkedIds.size,
	};
}

export function formatSessionStatisticsLines(
	stats: SessionStatistics,
	width: number,
): string[] {
	const wrapWidth = Math.max(20, width);
	const lines: string[] = [];
	const push = (text: string) => {
		for (const line of wrapTextWithAnsi(text || " ", wrapWidth)) {
			lines.push(line);
		}
	};

	push(
		`Total Nodes: ${stats.totalNodes} · User Turns: ${stats.turnCount} · Assistant Turns: ${stats.assistantCount}`,
	);
	push(
		`Branches / Tips: ${stats.branchCount} (Leaves: ${stats.leafCount}, Forks: ${stats.forkCount})`,
	);
	push(`Bookmarked Branches: ${stats.bookmarkedBranches}`);
	push(
		`Estimated Tokens (all entries): ~${stats.estimatedTotalTokens} · Reported Assistant Usage Sum: ${stats.reportedTotalTokens}`,
	);
	lines.push("─".repeat(wrapWidth));
	push(`Tool Calls: ${stats.totalToolCalls} (Errors: ${stats.toolErrors})`);
	const tools = Object.entries(stats.toolDistribution).sort(
		(a, b) => b[1] - a[1],
	);
	if (tools.length === 0) {
		push("  (no tool invocations recorded)");
	} else {
		for (const [name, count] of tools) {
			push(`  ${name}: ${count}`);
		}
	}
	return lines;
}
