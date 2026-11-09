import { type Static, Type } from "typebox";
import { Errors } from "typebox/value";
import { getDefaultKeybindings } from "./actions.ts";

export const NavigationConfigSchema = Type.Object(
	{
		initialFocus: Type.Optional(
			Type.Union([Type.Literal("active"), Type.Literal("root")]),
		),
		branchNavigationScope: Type.Optional(Type.Literal("nearest-fork")),
		branchWrap: Type.Optional(Type.Boolean()),
		focusFollowsSelection: Type.Optional(
			Type.Union([
				Type.Literal("branch-actions"),
				Type.Literal("always"),
				Type.Literal("never"),
			]),
		),
		autoRevealTarget: Type.Optional(Type.Boolean()),
		skipHiddenNodes: Type.Optional(Type.Boolean()),
	},
	{ additionalProperties: false },
);

export const DisplayConfigSchema = Type.Object(
	{
		showAssistantNodes: Type.Optional(Type.Boolean()),
		showToolNodes: Type.Optional(Type.Boolean()),
		showThinkingNodes: Type.Optional(Type.Boolean()),
		showMetadataNodes: Type.Optional(Type.Boolean()),
		showCompactionNodes: Type.Optional(Type.Boolean()),
		depthMode: Type.Optional(
			Type.Union([
				Type.Literal("raw"),
				Type.Literal("turn"),
				Type.Literal("branch"),
			]),
		),
		showDepth: Type.Optional(Type.Boolean()),
		maxMessageLength: Type.Optional(
			Type.Integer({ minimum: 10, maximum: 500 }),
		),
		showNodeId: Type.Optional(Type.Boolean()),
		showTimestamps: Type.Optional(Type.Boolean()),
		layout: Type.Optional(
			Type.Union([Type.Literal("normal"), Type.Literal("compact")]),
		),
	},
	{ additionalProperties: false },
);

export const FoldConfigSchema = Type.Object(
	{
		mode: Type.Optional(
			Type.Union([
				Type.Literal("all"),
				Type.Literal("focused-only"),
				Type.Literal("active-only"),
				Type.Literal("depth-limited"),
				Type.Literal("manual"),
			]),
		),
		collapseInactiveBranches: Type.Optional(Type.Boolean()),
		collapseLinearPaths: Type.Optional(Type.Boolean()),
		rememberManualOverrides: Type.Optional(Type.Boolean()),
		maxExpandDepth: Type.Optional(Type.Integer({ minimum: 0, maximum: 100 })),
	},
	{ additionalProperties: false },
);

export const SearchConfigSchema = Type.Object(
	{
		mode: Type.Optional(
			Type.Union([
				Type.Literal("fuzzy"),
				Type.Literal("exact"),
				Type.Literal("regex"),
			]),
		),
		scope: Type.Optional(
			Type.Union([Type.Literal("all"), Type.Literal("focused-subtree")]),
		),
		includeHiddenNodes: Type.Optional(Type.Boolean()),
		autoExpandMatches: Type.Optional(Type.Boolean()),
		preserveFoldState: Type.Optional(Type.Boolean()),
		caseSensitive: Type.Optional(Type.Boolean()),
		maxResults: Type.Optional(Type.Integer({ minimum: 1, maximum: 1000 })),
	},
	{ additionalProperties: false },
);

export const ContextConfigSchema = Type.Object(
	{
		enabled: Type.Optional(Type.Boolean()),
		showTokens: Type.Optional(Type.Boolean()),
		showPercentage: Type.Optional(Type.Boolean()),
		showModel: Type.Optional(Type.Boolean()),
		estimateHistorical: Type.Optional(Type.Boolean()),
		showEstimateMarker: Type.Optional(Type.Boolean()),
		lazyEvaluation: Type.Optional(Type.Boolean()),
		cacheSize: Type.Optional(Type.Integer({ minimum: 16, maximum: 10000 })),
	},
	{ additionalProperties: false },
);

export const SessionConfigSchema = Type.Object(
	{
		forkPosition: Type.Optional(
			Type.Union([Type.Literal("at"), Type.Literal("before")]),
		),
		navigateSummarize: Type.Optional(Type.Boolean()),
		confirmFork: Type.Optional(Type.Boolean()),
		busyBehavior: Type.Optional(
			Type.Union([Type.Literal("reject"), Type.Literal("wait")]),
		),
	},
	{ additionalProperties: false },
);

export const PerformanceConfigSchema = Type.Object(
	{
		virtualRendering: Type.Optional(Type.Boolean()),
		renderOverscan: Type.Optional(Type.Integer({ minimum: 1, maximum: 200 })),
		searchDebounceMs: Type.Optional(
			Type.Integer({ minimum: 0, maximum: 5000 }),
		),
	},
	{ additionalProperties: false },
);

export const SessionTreeConfigSchema = Type.Object(
	{
		$schema: Type.Optional(Type.String()),
		vimMode: Type.Optional(Type.Boolean()),
		navigation: Type.Optional(NavigationConfigSchema),
		display: Type.Optional(DisplayConfigSchema),
		fold: Type.Optional(FoldConfigSchema),
		search: Type.Optional(SearchConfigSchema),
		context: Type.Optional(ContextConfigSchema),
		session: Type.Optional(SessionConfigSchema),
		performance: Type.Optional(PerformanceConfigSchema),
		keybindings: Type.Optional(
			Type.Record(Type.String(), Type.Array(Type.String())),
		),
	},
	{ additionalProperties: false },
);

export type PartialSessionTreeConfig = Static<typeof SessionTreeConfigSchema>;

export interface SessionTreeConfig {
	vimMode: boolean;
	navigation: {
		initialFocus: "active" | "root";
		branchNavigationScope: "nearest-fork";
		branchWrap: boolean;
		focusFollowsSelection: "branch-actions" | "always" | "never";
		autoRevealTarget: boolean;
		skipHiddenNodes: boolean;
	};
	display: {
		showAssistantNodes: boolean;
		showToolNodes: boolean;
		showThinkingNodes: boolean;
		showMetadataNodes: boolean;
		showCompactionNodes: boolean;
		depthMode: "raw" | "turn" | "branch";
		showDepth: boolean;
		maxMessageLength: number;
		showNodeId: boolean;
		showTimestamps: boolean;
		layout: "normal" | "compact";
	};
	fold: {
		mode: "all" | "focused-only" | "active-only" | "depth-limited" | "manual";
		collapseInactiveBranches: boolean;
		collapseLinearPaths: boolean;
		rememberManualOverrides: boolean;
		maxExpandDepth: number;
	};
	search: {
		mode: "fuzzy" | "exact" | "regex";
		scope: "all" | "focused-subtree";
		includeHiddenNodes: boolean;
		autoExpandMatches: boolean;
		preserveFoldState: boolean;
		caseSensitive: boolean;
		maxResults: number;
	};
	context: {
		enabled: boolean;
		showTokens: boolean;
		showPercentage: boolean;
		showModel: boolean;
		estimateHistorical: boolean;
		showEstimateMarker: boolean;
		lazyEvaluation: boolean;
		cacheSize: number;
	};
	session: {
		forkPosition: "at" | "before";
		navigateSummarize: boolean;
		confirmFork: boolean;
		busyBehavior: "reject" | "wait";
	};
	performance: {
		virtualRendering: boolean;
		renderOverscan: number;
		searchDebounceMs: number;
	};
	keybindings: Record<string, string[]>;
}

export function getDefaultConfig(): SessionTreeConfig {
	return {
		vimMode: true,
		navigation: {
			initialFocus: "active",
			branchNavigationScope: "nearest-fork",
			branchWrap: false,
			focusFollowsSelection: "branch-actions",
			autoRevealTarget: true,
			skipHiddenNodes: true,
		},
		display: {
			showAssistantNodes: false,
			showToolNodes: false,
			showThinkingNodes: false,
			showMetadataNodes: false,
			showCompactionNodes: true,
			depthMode: "turn",
			showDepth: true,
			maxMessageLength: 80,
			showNodeId: false,
			showTimestamps: false,
			layout: "normal",
		},
		fold: {
			mode: "focused-only",
			collapseInactiveBranches: true,
			collapseLinearPaths: false,
			rememberManualOverrides: true,
			maxExpandDepth: 0,
		},
		search: {
			mode: "fuzzy",
			scope: "all",
			includeHiddenNodes: true,
			autoExpandMatches: true,
			preserveFoldState: true,
			caseSensitive: false,
			maxResults: 100,
		},
		context: {
			enabled: true,
			showTokens: true,
			showPercentage: true,
			showModel: false,
			estimateHistorical: true,
			showEstimateMarker: true,
			lazyEvaluation: true,
			cacheSize: 512,
		},
		session: {
			forkPosition: "at",
			navigateSummarize: false,
			confirmFork: false,
			busyBehavior: "reject",
		},
		performance: {
			virtualRendering: true,
			renderOverscan: 20,
			searchDebounceMs: 40,
		},
		keybindings: getDefaultKeybindings(),
	};
}

export function formatSchemaDiagnostics(data: unknown): string[] {
	const errors = [...Errors(SessionTreeConfigSchema, data)];
	return errors.map((e) => {
		const p =
			(e as { instancePath?: string; path?: string }).instancePath ||
			(e as { path?: string }).path;
		return `${p || "/"}: ${e.message}`;
	});
}
