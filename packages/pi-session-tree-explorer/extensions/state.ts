import { defaultDisplayOptions, defaultFoldOptions } from "./display.ts";
import type { ExplorerState } from "./types.ts";

export function createInitialState(
	sessionId = "ephemeral",
	override: Partial<ExplorerState> = {},
): ExplorerState {
	return {
		sessionId,
		selectedEntryId: null,
		sessionLeafId: null,
		focusedBranchId: null,
		focusedPathIds: new Set<string>(),
		mode: "normal",
		searchQuery: "",
		recentLeafByBranch: new Map<string, string>(),
		scrollOffset: 0,
		version: 1,
		vimMode: true,
		displayOptions: defaultDisplayOptions(),
		foldOptions: defaultFoldOptions(),
		manualExpandedIds: new Set<string>(),
		manualCollapsedIds: new Set<string>(),
		temporaryRevealedIds: new Set<string>(),
		searchScope: "all",
		searchRegex: false,
		searchResults: [],
		searchResultIndex: -1,
		previewNodeId: null,
		...override,
	};
}
