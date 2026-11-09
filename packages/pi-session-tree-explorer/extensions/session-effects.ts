import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import type { SessionTreeConfig } from "./config-schema.ts";
import type { ExplorerResult } from "./types.ts";

export interface SessionEffectResult {
	success: boolean;
	cancelled?: boolean;
	error?: string;
}

export interface ExecuteSessionIntentOptions {
	intent: ExplorerResult;
	ctx: ExtensionCommandContext;
	config: SessionTreeConfig;
	onNotify?: (message: string, type?: "info" | "warning" | "error") => void;
	onReplacementCleanup?: () => void;
}

/**
 * Execute session mutation intents (Navigate, Fork At, Fork Before)
 * safely outside the custom TUI lifecycle.
 */
export async function executeSessionIntent(
	options: ExecuteSessionIntentOptions,
): Promise<SessionEffectResult> {
	const { intent, ctx, config, onNotify, onReplacementCleanup } = options;

	if (intent.type === "close") {
		return { success: true };
	}

	const entryId = intent.entryId;

	// 1. Guard against virtual branch summary IDs
	if (!entryId || entryId.startsWith("virtual:branch:")) {
		const msg =
			intent.type === "navigate"
				? "Cannot navigate to virtual branch summary. Expand branch first."
				: "Cannot fork from virtual branch summary. Expand branch first.";
		onNotify?.(msg, "warning");
		return { success: false, error: msg };
	}

	// 2. Revalidate target in current session
	const targetEntry = ctx.sessionManager.getEntry(entryId);
	if (!targetEntry) {
		const msg = `Target entry '${entryId}' no longer exists in current session.`;
		onNotify?.(msg, "warning");
		return { success: false, error: msg };
	}

	// 3. Preflight agent busy check
	if (!ctx.isIdle()) {
		const msg =
			"Wait for the current response or compaction to finish before modifying the session.";
		onNotify?.(msg, "warning");
		return { success: false, error: msg };
	}

	// 4. Execute Navigate
	if (intent.type === "navigate") {
		try {
			const summarize =
				intent.summarize ?? config.session.navigateSummarize ?? false;
			const res = await ctx.navigateTree(entryId, { summarize });

			if (res?.cancelled) {
				onNotify?.("Navigation was cancelled by an extension.", "info");
				return { success: false, cancelled: true };
			}

			onNotify?.(`Navigated session tree to ${entryId}.`, "info");
			return { success: true };
		} catch (err) {
			const errorMsg = `Navigation failed: ${(err as Error).message}`;
			onNotify?.(errorMsg, "error");
			return { success: false, error: errorMsg };
		}
	}

	// 5. Execute Fork At or Fork Before
	if (intent.type === "fork") {
		const position = intent.position;

		// Validate user message requirement for Fork Before
		if (position === "before") {
			const isUser =
				(targetEntry.type === "message" &&
					targetEntry.message?.role === "user") ||
				targetEntry.type === "custom_message";

			if (!isUser) {
				const msg =
					"Fork Before is only available for user messages. Use 'f' to fork at this entry.";
				onNotify?.(msg, "warning");
				return { success: false, error: msg };
			}
		}

		// Optional user confirmation
		if (config.session.confirmFork) {
			const confirmed = await ctx.ui.confirm(
				"Confirm Fork",
				`Create a new independent session forking ${position} '${entryId}'?`,
			);
			if (!confirmed) {
				onNotify?.("Fork was cancelled.", "info");
				return { success: false, cancelled: true };
			}
		}

		try {
			const res = await ctx.fork(entryId, {
				position,
				withSession: async (replacementCtx) => {
					// Clean up old session references
					onReplacementCleanup?.();

					const posLabel = position === "before" ? "before" : "at";
					replacementCtx.ui.notify(
						`Created and switched to independent forked session (${posLabel} ${entryId}).`,
						"info",
					);
				},
			});

			if (res?.cancelled) {
				onNotify?.("Fork was cancelled by an extension.", "info");
				return { success: false, cancelled: true };
			}

			return { success: true };
		} catch (err) {
			const errorMsg = `Fork failed: ${(err as Error).message}`;
			onNotify?.(errorMsg, "error");
			return { success: false, error: errorMsg };
		}
	}

	return { success: true };
}
