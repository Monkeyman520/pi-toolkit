/**
 * Core type definitions for Enhanced Session Tree Explorer
 */

export interface SessionMessage {
	role: string;
	content: unknown;
	timestamp?: number;
	model?: string;
	provider?: string;
	api?: string;
	toolName?: string;
	toolCallId?: string;
	isError?: boolean;
	sections?: Record<string, string | null>;
	toolsAdded?: unknown[];
	toolsRemoved?: unknown[];
	usage?: { input?: number; output?: number; totalTokens?: number };
}

export interface RawSessionEntry {
	type: string;
	id: string;
	parentId: string | null;
	timestamp: string;
	message?: SessionMessage;
	provider?: string;
	modelId?: string;
	thinkingLevel?: string;
	kind?: string;
	summary?: string;
	firstKeptEntryId?: string;
	targetId?: string;
	replacement?: unknown;
	fromId?: string;
	customType?: string;
	content?: unknown;
	display?: boolean;
	label?: string;
	name?: string;
	[key: string]: unknown;
}

export type SessionEntry = RawSessionEntry;

export interface TreeIndex {
	entryById: Map<string, SessionEntry>;
	parentById: Map<string, string | null>;
	childrenById: Map<string, string[]>;
	rootIds: string[];
	rawDepthById: Map<string, number>;
	turnDepthById: Map<string, number>;
	branchDepthById: Map<string, number>;
	forkPointIds: Set<string>;
	leafIds: Set<string>;
	preorderIds: string[];
}

export interface BranchLocation {
	forkPointId: string;
	branchRootId: string;
	siblingBranchIds: string[];
	currentIndex: number;
}

export type InputMode = "normal" | "search" | "preview" | "help";

export type FoldMode =
	| "all"
	| "focused-only"
	| "active-only"
	| "depth-limited"
	| "manual";

export interface FoldOptions {
	mode: FoldMode;
	collapseInactiveBranches: boolean;
	collapseLinearPaths: boolean;
	rememberManualOverrides: boolean;
	maxExpandDepth: number;
}

export interface DisplayOptions {
	showAssistantNodes: boolean;
	showToolNodes: boolean;
	showThinkingNodes: boolean;
	showMetadataNodes: boolean;
	showCompactionNodes: boolean;
	userOnly: boolean;
	branchOnly: boolean;
	labeledOnly: boolean;
	depthMode: "raw" | "turn" | "branch";
	showDepth: boolean;
	maxMessageLength: number;
	showNodeId: boolean;
	showTimestamps: boolean;
	layout: "normal" | "compact";
}

export interface SearchSnapshot {
	searchQuery: string;
	selectedEntryId: string | null;
	temporaryRevealedIds: Set<string>;
	manualExpandedIds: Set<string>;
	manualCollapsedIds: Set<string>;
}

export interface ExplorerState {
	sessionId: string;
	selectedEntryId: string | null;
	sessionLeafId: string | null;
	focusedBranchId: string | null;
	focusedPathIds: Set<string>;
	mode: InputMode;
	searchQuery: string;
	recentLeafByBranch: Map<string, string>;
	scrollOffset: number;
	version: number;

	vimMode: boolean;
	displayOptions: DisplayOptions;
	foldOptions: FoldOptions;
	manualExpandedIds: Set<string>;
	manualCollapsedIds: Set<string>;
	temporaryRevealedIds: Set<string>;

	searchSnapshot?: SearchSnapshot;
	searchScope: "all" | "focused-subtree";
	searchRegex: boolean;
	searchResults: Array<{ id: string; score: number }>;
	searchResultIndex: number;
	previewNodeId: string | null;
	showDetails: boolean;
	showContext: boolean;
	renderOverscan: number;
}

export interface ContextMetrics {
	entryId: string;
	tokens: number | null;
	contextWindow: number | null;
	percentage: number | null;
	modelId?: string;
	source: "active-context" | "projection-estimate" | "unknown";
	estimated: boolean;
}

export interface DisplayNode {
	id: string;
	realId: string | null;
	isVirtual: boolean;
	kind: string;
	role?: string;
	summaryText: string;
	timestamp: string;
	rawDepth: number;
	turnDepth: number;
	branchDepth: number;
	forkCount?: number;
	descendantCount?: number;
	hasChildren: boolean;
	isLeaf: boolean;
	isFork: boolean;
	isCurrentLeaf: boolean;
	isSelected: boolean;
	label?: string;

	visibleParentId: string | null;
	isCollapsed?: boolean;
	isExpanded?: boolean;
	isVirtualSummary?: boolean;
	anchorEntryId?: string;
	virtualDescendantCount?: number;
	virtualForkCount?: number;
	contextMetrics?: ContextMetrics;
}

export interface ActionContext {
	state: ExplorerState;
	index: TreeIndex;
	visibleNodes: DisplayNode[];
	close: () => void;
	pageSize?: number;
	reproject?: () => void;
	setLabel?: (
		entryId: string,
		label: string | undefined,
	) => Promise<void> | void;
	refresh?: () => Promise<void> | void;
	notify?: (message: string, type?: "info" | "warning" | "error") => void;
	navigate?: (entryId: string, summarize?: boolean) => void;
	fork?: (entryId: string, position: "at" | "before") => void;
}

export interface ActionDefinition {
	id: string;
	description: string;
	defaultKeys: string[];
	modes: InputMode[];
	enabled?: (state: ExplorerState, index: TreeIndex) => boolean;
	execute: (ctx: ActionContext) => void | Promise<void>;
}

export type ExplorerResult =
	| { type: "close" }
	| { type: "navigate"; entryId: string; summarize?: boolean }
	| { type: "fork"; entryId: string; position: "at" | "before" };

export interface KeymapDiagnostic {
	type: "duplicate" | "conflict" | "invalid";
	message: string;
	keys: string[];
	actionId?: string;
}
