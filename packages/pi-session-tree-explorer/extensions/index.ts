import type {
	ExtensionAPI,
	ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import { createActionRegistry } from "./actions.ts";
import { createInitialState } from "./state.ts";

export { createInitialState } from "./state.ts";

import { buildTreeIndex } from "./tree-index.ts";
import { SessionTreeComponent } from "./tui.ts";
import type { ExplorerResult, SessionEntry } from "./types.ts";

export { createActionRegistry, getDefaultKeybindings } from "./actions.ts";
export {
	buildDisplayProjection,
	defaultDisplayOptions,
	defaultFoldOptions,
	isNodeCollapsed,
	isNodeVisible,
} from "./display.ts";
export { KeyResolver, validateKeymap } from "./keymap.ts";
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

			const state = createInitialState(sessionId, {
				selectedEntryId: initialSelection,
				sessionLeafId: currentLeafId,
				focusedPathIds,
			});

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

			// Only safe read-only browsing and close in T0001/T0002
			if (result && result.type === "close") {
				// Pure close, no-op
			}
		},
	});
}
