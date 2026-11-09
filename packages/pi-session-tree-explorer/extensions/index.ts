import type {
	ExtensionAPI,
	ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import { createActionRegistry } from "./actions.ts";
import { buildTreeIndex } from "./tree-index.ts";
import { SessionTreeComponent } from "./tui.ts";
import type { ExplorerResult, ExplorerState, SessionEntry } from "./types.ts";

export { createActionRegistry } from "./actions.ts";
export { buildDisplayProjection } from "./display.ts";
export * from "./navigation.ts";
export { buildTreeIndex } from "./tree-index.ts";
export { SessionTreeComponent } from "./tui.ts";
export * from "./types.ts";

export default function sessionTreeExplorerPlugin(pi: ExtensionAPI): void {
	pi.registerCommand("stree", {
		description: "Enhanced Session Tree Explorer for Pi",
		handler: async (
			_args: string,
			ctx: ExtensionCommandContext,
		): Promise<void> => {
			if (ctx.mode !== "tui") {
				ctx.ui.notify(
					"Session Tree Explorer requires an interactive TUI session.",
					"info",
				);
				return;
			}

			const rawEntries = (ctx.sessionManager.getEntries() ??
				[]) as SessionEntry[];
			const currentLeafId = ctx.sessionManager.getLeafId() ?? null;
			const sessionId = ctx.sessionManager.getSessionId() ?? "ephemeral";

			const index = buildTreeIndex(rawEntries);

			// Compute focused path IDs (from active leaf up to root)
			const focusedPathIds = new Set<string>();
			let curr = currentLeafId;
			while (curr !== null) {
				focusedPathIds.add(curr);
				curr = index.parentById.get(curr) ?? null;
			}

			const initialSelection =
				currentLeafId && index.entryById.has(currentLeafId)
					? currentLeafId
					: index.preorderIds.length > 0
						? index.preorderIds[0]
						: null;

			const state: ExplorerState = {
				sessionId,
				selectedEntryId: initialSelection,
				sessionLeafId: currentLeafId,
				focusedBranchId: null,
				focusedPathIds,
				mode: "normal",
				searchQuery: "",
				recentLeafByBranch: new Map<string, string>(),
				scrollOffset: 0,
				version: 1,
			};

			const registry = createActionRegistry();

			const result = await ctx.ui.custom<ExplorerResult>(
				(tui, theme, _kb, done) => {
					return new SessionTreeComponent({
						tui,
						theme,
						done,
						index,
						state,
						registry,
					});
				},
			);

			// In T0001, only safe read-only browsing and close are executed.
			// No session leaf or file mutation occurs.
			if (result && result.type === "close") {
				// Pure close, no-op
			}
		},
	});
}
