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
	expectedSessionId?: string;
	ctx: ExtensionCommandContext;
	config: SessionTreeConfig;
	onNotify?: (message: string, type?: "info" | "warning" | "error") => void;
	onReplacementCleanup?: () => void;
}
/** Called only after custom UI completion. The host remains authoritative after every preflight. */
export async function executeSessionIntent(
	options: ExecuteSessionIntentOptions,
): Promise<SessionEffectResult> {
	const { intent, ctx, config, onNotify, onReplacementCleanup } = options;
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
			const result = await ctx.navigateTree(entryId, {
				summarize: intent.summarize ?? config.session.navigateSummarize,
			});
			if (result?.cancelled)
				return cancelled("Navigation was cancelled by an extension.");
			onNotify?.(`Navigated session tree to ${entryId}.`, "info");
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
