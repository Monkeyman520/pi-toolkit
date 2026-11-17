import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import type { SessionTreeConfig } from "./config-schema.ts";
import { buildTreeIndex } from "./tree-index.ts";
import type {
	BranchSummaryContext,
	ExplorerResult,
	SessionEntry,
	TreeIndex,
} from "./types.ts";

export function isPromptRestoringEntry(
	entry: Pick<SessionEntry, "type" | "message"> | undefined,
): boolean {
	if (!entry) return false;
	return (
		(entry.type === "message" && entry.message?.role === "user") ||
		entry.type === "custom_message"
	);
}

function entryShortLabel(
	entry: SessionEntry | undefined,
	fallbackId: string,
): string {
	if (!entry) return fallbackId;
	const content = entry.message?.content;
	if (typeof content === "string" && content.trim()) {
		return content.replace(/\s+/g, " ").trim().slice(0, 48);
	}
	if (Array.isArray(content)) {
		for (const block of content) {
			if (
				block &&
				typeof block === "object" &&
				"text" in block &&
				typeof (block as { text?: unknown }).text === "string" &&
				(block as { text: string }).text.trim()
			) {
				return (block as { text: string }).text
					.replace(/\s+/g, " ")
					.trim()
					.slice(0, 48);
			}
		}
	}
	return fallbackId;
}

export function computeBranchSummaryContext(
	index: TreeIndex,
	sourceLeafId: string | null,
	targetId: string,
): BranchSummaryContext {
	if (!sourceLeafId || sourceLeafId === targetId) {
		return {
			sourceLeafId,
			targetId,
			commonAncestorId: sourceLeafId,
			sourceBranchLabel: sourceLeafId ?? "none",
			targetBranchLabel: entryShortLabel(
				index.entryById.get(targetId),
				targetId,
			),
			abandonedEntryCount: 0,
			abandonedTurnCount: 0,
			isCrossBranch: false,
		};
	}

	const sourceAncestors = new Set<string>();
	let cur: string | null = sourceLeafId;
	while (cur) {
		sourceAncestors.add(cur);
		cur = index.parentById.get(cur) ?? null;
	}

	let commonAncestorId: string | null = null;
	cur = targetId;
	while (cur) {
		if (sourceAncestors.has(cur)) {
			commonAncestorId = cur;
			break;
		}
		cur = index.parentById.get(cur) ?? null;
	}

	let abandonedEntryCount = 0;
	let abandonedTurnCount = 0;
	cur = sourceLeafId;
	while (cur && cur !== commonAncestorId) {
		abandonedEntryCount++;
		const entry = index.entryById.get(cur);
		if (
			(entry?.type === "message" && entry.message?.role === "user") ||
			entry?.type === "custom_message"
		) {
			abandonedTurnCount++;
		}
		cur = index.parentById.get(cur) ?? null;
	}

	const isCrossBranch =
		commonAncestorId !== sourceLeafId && commonAncestorId !== targetId;

	return {
		sourceLeafId,
		targetId,
		commonAncestorId,
		sourceBranchLabel: entryShortLabel(
			index.entryById.get(sourceLeafId),
			sourceLeafId,
		),
		targetBranchLabel: entryShortLabel(index.entryById.get(targetId), targetId),
		abandonedEntryCount,
		abandonedTurnCount,
		isCrossBranch,
	};
}

/**
 * In-memory LIFO stack tracking prior active session leaf IDs across navigation jumps.
 */
export class NavigationHistory {
	private stack: string[] = [];

	public push(leafId: string | null | undefined): void {
		if (!leafId) return;
		if (this.stack[this.stack.length - 1] === leafId) return;
		this.stack.push(leafId);
	}

	public pop(): string | undefined {
		return this.stack.pop();
	}

	public peek(): string | undefined {
		return this.stack[this.stack.length - 1];
	}

	public isEmpty(): boolean {
		return this.stack.length === 0;
	}

	public get size(): number {
		return this.stack.length;
	}

	public clear(): void {
		this.stack.length = 0;
	}

	public toArray(): string[] {
		return [...this.stack];
	}
}

export { NavigationHistory as NavigationHistoryStack };

export interface SessionEffectResult {
	success: boolean;
	cancelled?: boolean;
	error?: string;
}
export interface ExecuteSessionIntentOptions {
	intent: ExplorerResult;
	expectedSessionId?: string;
	ctx: ExtensionCommandContext;
	config: SessionTreeConfig;
	navigationHistory?: NavigationHistory;
	onNotify?: (message: string, type?: "info" | "warning" | "error") => void;
	onReplacementCleanup?: () => void;
}
/** Called only after custom UI completion. The host remains authoritative after every preflight. */
export async function executeSessionIntent(
	options: ExecuteSessionIntentOptions,
): Promise<SessionEffectResult> {
	const {
		intent,
		ctx,
		config,
		navigationHistory,
		onNotify,
		onReplacementCleanup,
	} = options;
	if (intent.type === "close") return { success: true };
	const reject = (
		message: string,
		type: "warning" | "error" = "warning",
	): SessionEffectResult => {
		onNotify?.(message, type);
		return { success: false, error: message };
	};
	const cancelled = (message: string): SessionEffectResult => {
		onNotify?.(message, "info");
		return { success: false, cancelled: true };
	};
	const entryId = intent.entryId;
	if (!entryId || entryId.startsWith("virtual:"))
		return reject(
			"Cannot navigate or fork a virtual summary. Expand it first.",
		);
	const validateTarget = (): string | undefined => {
		if (
			options.expectedSessionId &&
			ctx.sessionManager.getSessionId() !== options.expectedSessionId
		)
			return "Session changed while the Explorer was open; reopen before modifying history.";
		const entry = ctx.sessionManager.getEntry(entryId);
		if (!entry)
			return `Target entry '${entryId}' no longer exists in current session.`;
		if (
			intent.type === "fork" &&
			intent.position === "before" &&
			!(
				(entry.type === "message" && entry.message?.role === "user") ||
				entry.type === "custom_message"
			)
		)
			return "Fork Before is only available for user messages. Use 'f' to fork at this entry.";
		return undefined;
	};
	try {
		const initialError = validateTarget();
		if (initialError) return reject(initialError);
		if (!ctx.isIdle()) {
			if (config.session.busyBehavior !== "wait")
				return reject(
					"Wait for the current response or compaction to finish before modifying the session.",
				);
			if (
				!(await ctx.ui.confirm(
					"Wait for session?",
					"Wait for the running response, then revalidate this session operation?",
				))
			)
				return cancelled("Waiting was cancelled.");
			onNotify?.(
				"Waiting for the current response to finish before revalidating the session operation.",
				"info",
			);
			await ctx.waitForIdle();
		}
		const readyError = validateTarget();
		if (readyError) return reject(readyError);
		if (!ctx.isIdle())
			return reject(
				"Session remains busy; retry after the response or compaction finishes.",
			);
		if (intent.type === "navigate") {
			const previousLeafId = ctx.sessionManager.getLeafId?.() ?? null;
			const targetEntry = ctx.sessionManager.getEntry(entryId) as
				| SessionEntry
				| undefined;
			let summarize = intent.summarize;
			let customInstructions = intent.customInstructions;
			if (
				summarize === undefined &&
				!intent.restore &&
				config.session.promptSummary &&
				typeof ctx.ui?.select === "function"
			) {
				const rawEntries = (ctx.sessionManager.getEntries?.() ??
					[]) as SessionEntry[];
				const index = buildTreeIndex(rawEntries);
				const summaryCtx = computeBranchSummaryContext(
					index,
					previousLeafId,
					entryId,
				);
				if (summaryCtx.isCrossBranch) {
					const choice = await ctx.ui.select(
						`Switch branch (${summaryCtx.abandonedEntryCount} entries / ${summaryCtx.abandonedTurnCount} turns to summarize)`,
						["No summary", "Summarize", "Custom prompt"],
					);
					if (choice === undefined) {
						return cancelled("Branch navigation cancelled.");
					}
					if (choice === "No summary") {
						summarize = false;
					} else if (choice === "Summarize") {
						summarize = true;
					} else if (choice === "Custom prompt") {
						const promptText = await ctx.ui.input?.(
							"Custom branch summary instructions",
							"",
						);
						if (promptText === undefined) {
							return cancelled("Branch navigation cancelled.");
						}
						summarize = true;
						customInstructions = promptText.trim() || undefined;
					}
				}
			}
			const result = await ctx.navigateTree(entryId, {
				summarize: summarize ?? config.session.navigateSummarize,
				...(customInstructions ? { customInstructions } : {}),
			});
			if (result?.cancelled)
				return cancelled("Navigation was cancelled by an extension.");
			if (intent.restore) {
				navigationHistory?.pop();
			} else if (previousLeafId && previousLeafId !== entryId) {
				navigationHistory?.push(previousLeafId);
			}
			if (isPromptRestoringEntry(targetEntry)) {
				onNotify?.(
					`Navigated to parent of user entry ${entryId} and restored prompt into editor.`,
					"info",
				);
			} else {
				onNotify?.(`Navigated session tree to ${entryId}.`, "info");
			}
			return { success: true };
		}
		if (
			config.session.confirmFork &&
			!(await ctx.ui.confirm(
				"Confirm Fork",
				`Create an independent session forking ${intent.position} '${entryId}'?`,
			))
		)
			return cancelled("Fork was cancelled.");
		const finalError = validateTarget();
		if (finalError) return reject(finalError);
		if (!ctx.isIdle())
			return reject("Session or safety state changed during confirmation.");
		const result = await ctx.fork(entryId, {
			position: intent.position,
			withSession: async (replacementCtx) => {
				onReplacementCleanup?.();
				replacementCtx.ui.notify(
					`Created and switched to independent forked session (${intent.position} ${entryId}).`,
					"info",
				);
			},
		});
		return result?.cancelled
			? cancelled("Fork was cancelled by an extension.")
			: { success: true };
	} catch (error) {
		return reject(
			`${intent.type === "navigate" ? "Navigation" : "Fork"} failed: ${error instanceof Error ? error.message : String(error)}`,
			"error",
		);
	}
}
