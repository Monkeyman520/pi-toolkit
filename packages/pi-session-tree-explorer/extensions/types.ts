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
}

export interface ActionContext {
	state: ExplorerState;
	index: TreeIndex;
	visibleNodes: DisplayNode[];
	close: () => void;
	pageSize?: number;
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
	| { type: "navigate"; entryId: string }
	| { type: "fork"; entryId: string; position: "at" | "before" };
