import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { wrapTextWithAnsi } from "@earendil-works/pi-tui";
import { estimateMessageTokens } from "./context-metrics.ts";
import { extractSummary } from "./display.ts";
import { extractFilesChangedFromEntry } from "./inspection-view.ts";
import type { SessionEntry, TreeIndex } from "./types.ts";

const execFileAsync = promisify(execFile);

export interface BranchToolSummary {
	total: number;
	errorCount: number;
	byTool: Record<string, number>;
}

export interface BranchSegmentMetrics {
	tipId: string;
	label: string;
	nodeCount: number;
	turnCount: number;
	assistantCount: number;
	toolCalls: BranchToolSummary;
	estimatedTokens: number;
	outcomeStatus: "completed" | "error" | "user-pending" | "other";
	outcomeSummary: string;
	filesTouched: string[];
	userTurnSummaries: string[];
}

export interface TopologyBranchDiff {
	commonAncestorId: string | null;
	commonAncestorSummary: string;
	branchA: BranchSegmentMetrics;
	branchB: BranchSegmentMetrics;
	turnDelta: number;
	nodeDelta: number;
	toolCallDelta: number;
	tokenDelta: number;
}

export interface WorkspaceGitDiff {
	available: boolean;
	reason?: string;
	statLines: string[];
	changedFiles: string[];
}

export interface BranchDiffResult {
	topology: TopologyBranchDiff;
	gitDiff: WorkspaceGitDiff;
}

export function findCommonAncestor(
	index: TreeIndex,
	entryAId: string,
	entryBId: string,
): string | null {
	const ancestorsA = new Set<string>();
	let cur: string | null = entryAId;
	const guardA = new Set<string>();
	while (cur && !guardA.has(cur)) {
		guardA.add(cur);
		ancestorsA.add(cur);
		cur = index.parentById.get(cur) ?? null;
	}

	cur = entryBId;
	const guardB = new Set<string>();
	while (cur && !guardB.has(cur)) {
		guardB.add(cur);
		if (ancestorsA.has(cur)) {
			return cur;
		}
		cur = index.parentById.get(cur) ?? null;
	}

	return null;
}

function collectSegmentFromAncestor(
	index: TreeIndex,
	tipId: string,
	stopExclusiveId: string | null,
): string[] {
	const reversed: string[] = [];
	let cur: string | null = tipId;
	const visited = new Set<string>();
	while (cur && cur !== stopExclusiveId && !visited.has(cur)) {
		visited.add(cur);
		reversed.push(cur);
		cur = index.parentById.get(cur) ?? null;
	}
	return reversed.reverse();
}

function summarizeSegment(
	index: TreeIndex,
	segmentIds: string[],
	tipId: string,
): BranchSegmentMetrics {
	let turnCount = 0;
	let assistantCount = 0;
	let toolTotal = 0;
	let errorCount = 0;
	let estimatedTokens = 0;
	const byTool: Record<string, number> = {};
	const countedToolCallIds = new Set<string>();
	const filesTouched: string[] = [];
	const seenFiles = new Set<string>();
	const userTurnSummaries: string[] = [];

	for (const id of segmentIds) {
		const entry = index.entryById.get(id);
		if (!entry) continue;

		if (entry.type === "message" && entry.message) {
			estimatedTokens += estimateMessageTokens(entry.message);
			const role = entry.message.role;
			if (role === "user") {
				turnCount++;
				userTurnSummaries.push(
					extractSummary(entry, false).summaryText.slice(0, 72),
				);
			} else if (role === "assistant") {
				assistantCount++;
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
							if (typeof b.id === "string") {
								countedToolCallIds.add(b.id);
							}
							toolTotal++;
							byTool[name] = (byTool[name] ?? 0) + 1;
						}
					}
				}
			} else if (role === "toolResult") {
				if (entry.message.isError) errorCount++;
				const callId = entry.message.toolCallId;
				if (!callId || !countedToolCallIds.has(callId)) {
					const name = entry.message.toolName ?? "tool";
					toolTotal++;
					byTool[name] = (byTool[name] ?? 0) + 1;
				}
			}
		} else if (entry.type === "custom_message") {
			turnCount++;
			userTurnSummaries.push(
				extractSummary(entry, false).summaryText.slice(0, 72),
			);
		}

		for (const file of extractFilesChangedFromEntry(entry)) {
			if (!seenFiles.has(file)) {
				seenFiles.add(file);
				filesTouched.push(file);
			}
		}
	}

	const tipEntry = index.entryById.get(tipId);
	const tipLabel = index.displayLabelsById.get(tipId);
	const firstSegmentLabel = segmentIds[0]
		? index.displayLabelsById.get(segmentIds[0])
		: undefined;
	const outcomeSummary = tipEntry
		? extractSummary(tipEntry, false).summaryText.slice(0, 80)
		: tipId;

	let outcomeStatus: BranchSegmentMetrics["outcomeStatus"] = "other";
	if (
		tipEntry?.message?.isError ||
		(errorCount > 0 && tipEntry?.message?.role === "toolResult")
	) {
		outcomeStatus = "error";
	} else if (
		(tipEntry?.type === "message" && tipEntry.message?.role === "user") ||
		tipEntry?.type === "custom_message"
	) {
		outcomeStatus = "user-pending";
	} else if (
		tipEntry?.type === "message" &&
		tipEntry.message?.role === "assistant"
	) {
		outcomeStatus = "completed";
	}

	return {
		tipId,
		label: tipLabel ?? firstSegmentLabel ?? outcomeSummary.slice(0, 32),
		nodeCount: segmentIds.length,
		turnCount,
		assistantCount,
		toolCalls: {
			total: toolTotal,
			errorCount,
			byTool,
		},
		estimatedTokens,
		outcomeStatus,
		outcomeSummary,
		filesTouched,
		userTurnSummaries,
	};
}

export function computeTopologyBranchDiff(
	index: TreeIndex,
	branchAId: string,
	branchBId: string,
): TopologyBranchDiff {
	const commonAncestorId = findCommonAncestor(index, branchAId, branchBId);
	const ancestorEntry = commonAncestorId
		? index.entryById.get(commonAncestorId)
		: undefined;
	const commonAncestorSummary = ancestorEntry
		? extractSummary(ancestorEntry, false).summaryText.slice(0, 72)
		: "None (separate roots)";

	const segmentA = collectSegmentFromAncestor(
		index,
		branchAId,
		commonAncestorId,
	);
	const segmentB = collectSegmentFromAncestor(
		index,
		branchBId,
		commonAncestorId,
	);

	const branchA = summarizeSegment(index, segmentA, branchAId);
	const branchB = summarizeSegment(index, segmentB, branchBId);

	return {
		commonAncestorId,
		commonAncestorSummary,
		branchA,
		branchB,
		turnDelta: branchB.turnCount - branchA.turnCount,
		nodeDelta: branchB.nodeCount - branchA.nodeCount,
		toolCallDelta: branchB.toolCalls.total - branchA.toolCalls.total,
		tokenDelta: branchB.estimatedTokens - branchA.estimatedTokens,
	};
}

export async function computeWorkspaceGitDiff(
	cwd?: string,
): Promise<WorkspaceGitDiff> {
	if (!cwd) {
		return {
			available: false,
			reason:
				"Workspace file diff unavailable (outside git repository or uncommitted changes)",
			statLines: [],
			changedFiles: [],
		};
	}

	const opts = { cwd, timeout: 3000, windowsHide: true };
	try {
		const inside = await execFileAsync(
			"git",
			["rev-parse", "--is-inside-work-tree"],
			opts,
		);
		if (inside.stdout.trim() !== "true") {
			return {
				available: false,
				reason:
					"Workspace file diff unavailable (outside git repository or uncommitted changes)",
				statLines: [],
				changedFiles: [],
			};
		}

		let statOut = "";
		try {
			const diffHead = await execFileAsync(
				"git",
				["diff", "--stat", "HEAD"],
				opts,
			);
			statOut = diffHead.stdout;
		} catch {
			const diffWork = await execFileAsync("git", ["diff", "--stat"], opts);
			statOut = diffWork.stdout;
		}

		const statusRes = await execFileAsync("git", ["status", "--short"], opts);
		const changedFiles = statusRes.stdout
			.split(/\r?\n/)
			.map((l) => l.trimEnd())
			.filter(Boolean);
		const statLines = statOut
			.split(/\r?\n/)
			.map((l) => l.trimEnd())
			.filter(Boolean);

		return {
			available: true,
			statLines,
			changedFiles,
		};
	} catch {
		return {
			available: false,
			reason:
				"Workspace file diff unavailable (outside git repository or uncommitted changes)",
			statLines: [],
			changedFiles: [],
		};
	}
}

export async function compareBranches(params: {
	index: TreeIndex;
	branchAId: string;
	branchBId: string;
	cwd?: string;
}): Promise<BranchDiffResult> {
	const topology = computeTopologyBranchDiff(
		params.index,
		params.branchAId,
		params.branchBId,
	);
	const gitDiff = await computeWorkspaceGitDiff(params.cwd);
	return { topology, gitDiff };
}

function formatToolBreakdown(summary: BranchToolSummary): string {
	const entries = Object.entries(summary.byTool);
	if (entries.length === 0) return "none";
	const parts = entries.map(([name, count]) => `${count} ${name}`);
	return `${parts.join(", ")} (total ${summary.total}, ${summary.errorCount} err)`;
}

function formatDelta(n: number): string {
	return n > 0 ? `+${n}` : String(n);
}

export function formatBranchDiffLines(
	diff: BranchDiffResult,
	width: number,
): string[] {
	const wrapWidth = Math.max(20, width);
	const lines: string[] = [];
	const pushWrapped = (text: string) => {
		for (const line of wrapTextWithAnsi(text || " ", wrapWidth)) {
			lines.push(line);
		}
	};

	const { topology, gitDiff } = diff;
	const { branchA, branchB } = topology;

	pushWrapped(
		`Common Ancestor: ${topology.commonAncestorId ?? "none"} (${topology.commonAncestorSummary})`,
	);
	pushWrapped(
		`Delta (B vs A): Turns ${formatDelta(topology.turnDelta)} · Nodes ${formatDelta(topology.nodeDelta)} · Tools ${formatDelta(topology.toolCallDelta)} · Est. Tokens ${formatDelta(topology.tokenDelta)}`,
	);
	lines.push("─".repeat(wrapWidth));

	for (const [tag, seg] of [
		["Branch A", branchA],
		["Branch B", branchB],
	] as const) {
		pushWrapped(
			`${tag}: ${seg.tipId} [${seg.outcomeStatus}]${seg.label ? ` (${seg.label})` : ""}`,
		);
		pushWrapped(
			`  Turns: ${seg.turnCount} · Nodes: ${seg.nodeCount} · Est. Tokens: ~${seg.estimatedTokens}`,
		);
		pushWrapped(`  Tools: ${formatToolBreakdown(seg.toolCalls)}`);
		pushWrapped(`  Outcome: ${seg.outcomeSummary}`);
		if (seg.userTurnSummaries.length > 0) {
			pushWrapped(`  User turns: ${seg.userTurnSummaries.join(" -> ")}`);
		}
		if (seg.filesTouched.length > 0) {
			pushWrapped(`  Files in tool calls: ${seg.filesTouched.join(", ")}`);
		}
	}

	lines.push("─".repeat(wrapWidth));
	pushWrapped("Workspace Git Diff:");
	if (!gitDiff.available) {
		pushWrapped(`  ${gitDiff.reason ?? "Workspace file diff unavailable"}`);
	} else if (
		gitDiff.statLines.length === 0 &&
		gitDiff.changedFiles.length === 0
	) {
		pushWrapped("  Working tree clean (no uncommitted workspace changes)");
	} else {
		for (const stat of gitDiff.statLines) {
			pushWrapped(`  ${stat}`);
		}
		if (gitDiff.statLines.length === 0) {
			for (const file of gitDiff.changedFiles) {
				pushWrapped(`  ${file}`);
			}
		}
	}

	return lines;
}

export interface DiffBranchOption {
	entryId: string;
	label: string;
	turnDepth: number;
	preview: string;
	isCurrentLeaf: boolean;
}

export function buildDiffBranchOptions(
	index: TreeIndex,
	sessionLeafId: string | null,
	selectedEntryId: string | null,
): DiffBranchOption[] {
	const ids = new Set<string>(index.leafIds);
	if (sessionLeafId && index.entryById.has(sessionLeafId)) {
		ids.add(sessionLeafId);
	}
	if (selectedEntryId && index.entryById.has(selectedEntryId)) {
		ids.add(selectedEntryId);
	}
	const options: DiffBranchOption[] = [];
	for (const id of ids) {
		const entry: SessionEntry | undefined = index.entryById.get(id);
		if (!entry) continue;
		const label = index.displayLabelsById.get(id) ?? "";
		const preview = extractSummary(entry, false).summaryText.slice(0, 60);
		options.push({
			entryId: id,
			label,
			turnDepth: index.turnDepthById.get(id) ?? 0,
			preview,
			isCurrentLeaf: id === sessionLeafId,
		});
	}
	return options;
}
