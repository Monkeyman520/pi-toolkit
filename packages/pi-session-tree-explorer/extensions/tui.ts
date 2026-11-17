import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { createActionRegistry } from "./actions.ts";
import {
	type BranchDiffResult,
	buildDiffBranchOptions,
	compareBranches,
	type DiffBranchOption,
	formatBranchDiffLines,
} from "./branch-diff.ts";
import { getDefaultConfig, type SessionTreeConfig } from "./config-schema.ts";
import {
	type ActiveModelInfo,
	formatContextMetricsBadge,
} from "./context-metrics.ts";
import {
	buildDisplayProjection,
	defaultDisplayOptions,
	extractSummary,
	rawTargetForSelection,
	reconcileSelection,
	resolveDisplayTarget,
} from "./display.ts";
import {
	computeSessionStatistics,
	formatRichPreviewLines,
	formatSessionStatisticsLines,
	InspectionView,
} from "./inspection-view.ts";
import { KeyResolver, matchRawInput } from "./keymap.ts";
import { MetricsController } from "./metrics-controller.ts";
import { findReachableBranchTips } from "./navigation.ts";
import { SearchController } from "./search-state.ts";
import {
	computeBranchSummaryContext,
	type NavigationHistory,
} from "./session-effects.ts";
import type { SessionSnapshot } from "./session-snapshot.ts";
import type {
	ActionContext,
	ActionDefinition,
	BranchSummaryContext,
	BranchTipCandidate,
	ContextMetrics,
	DisplayNode,
	ExplorerResult,
	ExplorerState,
	TreeIndex,
} from "./types.ts";
import { computeResponsiveLayout, renderDualPane } from "./ui.ts";

export interface SessionTreeComponentOptions {
	tui: {
		requestRender: () => void;
		terminal?: { rows: number; columns?: number };
	};
	theme: unknown;
	done: (result: ExplorerResult) => void;
	index: TreeIndex;
	state: ExplorerState;
	registry?: Map<string, ActionDefinition>;
	keybindings?: Record<string, string[]>;
	pageSize?: number;
	config?: SessionTreeConfig;
	onReloadConfig?: () => Promise<SessionTreeConfig>;
	onOpenSettings?: () => Promise<SessionTreeConfig>;
	onEditLabel?: (
		entryId: string,
		current: string | undefined,
	) => Promise<{ label: string | undefined } | null>;
	navigationHistory?: NavigationHistory;
	cwd?: string;
}

export class SessionTreeComponent {
	private tui: {
		requestRender: () => void;
		terminal?: { rows: number; columns?: number };
	};
	private done: (result: ExplorerResult) => void;
	private index: TreeIndex;
	private state: ExplorerState;
	private registry: Map<string, ActionDefinition>;
	private keyResolver: KeyResolver;
	private pageSize: number;
	private config: SessionTreeConfig;
	private onReloadConfig?: () => Promise<SessionTreeConfig>;
	private onOpenSettings?: () => Promise<SessionTreeConfig>;
	private onEditLabel?: SessionTreeComponentOptions["onEditLabel"];
	private cachedVisibleNodes: DisplayNode[] | null = null;
	private closed = false;
	private inspection = new InspectionView();
	private lastRenderWidth = 80;
	private navigationHistory?: NavigationHistory;
	private tipPicker: {
		tips: BranchTipCandidate[];
		selectedIndex: number;
	} | null = null;
	private userTipConfirm: BranchTipCandidate | null = null;
	private summaryPrompt: {
		entryId: string;
		context: BranchSummaryContext;
		selectedIndex: number;
		customInputMode: boolean;
		customInstructions: string;
	} | null = null;
	private cwd?: string;
	private branchDiff: {
		stage: "pick-a" | "pick-b" | "loading" | "view";
		options: DiffBranchOption[];
		selectedIndex: number;
		branchAId?: string;
		branchBId?: string;
		result?: BranchDiffResult;
		scrollOffset: number;
	} | null = null;
	private branchSwitcher: {
		items: Array<{
			anchorId: string;
			tipId: string;
			bookmark: string;
			isBookmarked: boolean;
			isCurrentLeaf: boolean;
			messageCount: number;
			lastUpdated: string;
			preview: string;
		}>;
		selectedIndex: number;
	} | null = null;
	private bookmarkPrompt: {
		entryId: string;
		value: string;
	} | null = null;
	private statsView: { scrollOffset: number } | null = null;

	private searchController: SearchController;
	private metricsController: MetricsController;
	private cachedProjectionKey = "";
	private summaryRevision = -1;
	private summaryCache = new Map<
		string,
		{
			plain?: ReturnType<typeof extractSummary>;
			thinking?: ReturnType<typeof extractSummary>;
		}
	>();
	private activeModel?: ActiveModelInfo;
	private activeUsage?: {
		tokens: number | null;
		contextWindow: number;
		percent: number | null;
	};
	private onSetLabel?: (
		id: string,
		label: string | undefined,
	) => Promise<void> | void;
	private onRefresh?: () => // biome-ignore lint/suspicious/noConfusingVoidType: legacy refresh callbacks may return no replacement snapshot.
	Promise<SessionSnapshot | void> | SessionSnapshot | void;
	private sessionRevision = 1;
	private pendingEffects = new Set<Promise<void>>();
	private onNotify?: (
		message: string,
		type?: "info" | "warning" | "error",
	) => void;

	constructor(
		options: SessionTreeComponentOptions & {
			activeModel?: ActiveModelInfo;
			activeUsage?: {
				tokens: number | null;
				contextWindow: number;
				percent: number | null;
			};
			onSetLabel?: (
				id: string,
				label: string | undefined,
			) => Promise<void> | void;
			onRefresh?: () => // biome-ignore lint/suspicious/noConfusingVoidType: legacy refresh callbacks may return no replacement snapshot.
			Promise<SessionSnapshot | void> | SessionSnapshot | void;
			onNotify?: (message: string, type?: "info" | "warning" | "error") => void;
		},
	) {
		this.tui = options.tui;
		this.done = (result) => {
			if (!this.closed) {
				this.dispose();
				options.done(result);
			}
		};
		this.index = options.index;
		this.state = options.state;
		this.config = structuredClone(options.config ?? getDefaultConfig());
		this.onReloadConfig = options.onReloadConfig;
		this.onOpenSettings = options.onOpenSettings;
		this.onEditLabel = options.onEditLabel;
		this.navigationHistory = options.navigationHistory;
		this.cwd = options.cwd;
		if (options.config) {
			this.state.searchScope = this.config.search.scope;
			this.state.searchRegex = this.config.search.mode === "regex";
		}
		this.registry = options.registry ?? createActionRegistry();
		this.pageSize = options.pageSize ?? 16;
		this.activeModel = options.activeModel;
		this.activeUsage = options.activeUsage;
		this.onSetLabel = options.onSetLabel;
		this.onRefresh = options.onRefresh;
		this.onNotify = options.onNotify;
		this.metricsController = this.createMetricsController();
		const search = this.config.search;
		this.searchController = new SearchController(
			this.state,
			() => this.index,
			() => this.invalidate(),
			{ ...search, debounceMs: this.config.performance.searchDebounceMs },
		);

		const bindings = options.keybindings ?? this.config.keybindings;
		this.keyResolver = new KeyResolver({
			bindings,
			registry: this.registry,
			vimMode: this.state.vimMode,
		});
		this.state.selectedEntryId = resolveDisplayTarget(
			this.state.selectedEntryId,
			this.index,
			this.getVisibleNodes(),
		);
	}

	public runSearch(query: string): void {
		this.searchController.run(query);
	}

	public dispose(): void {
		this.closed = true;
		this.tipPicker = null;
		this.userTipConfirm = null;
		this.branchSwitcher = null;
		this.bookmarkPrompt = null;
		this.statsView = null;
		this.branchDiff = null;
		this.summaryPrompt = null;
		this.summaryCache.clear();
		this.inspection.reset();
		this.cachedVisibleNodes = null;
		this.keyResolver.reset();
		this.searchController.dispose();
		this.metricsController.dispose();
	}
	public invalidate(): void {
		this.tui.requestRender();
	}

	private createMetricsController(): MetricsController {
		return new MetricsController(
			this.state.sessionId,
			this.sessionRevision,
			{
				index: this.index,
				rawEntries: [...this.index.entryById.values()],
				sessionLeafId: this.state.sessionLeafId,
				activeModel: this.activeModel,
				activeUsage: this.activeUsage,
			},
			() => {
				if (!this.closed) this.tui.requestRender();
			},
			this.config.context.cacheSize,
			this.config.context.estimateHistorical,
		);
	}
	public getMetricsForEntry(entryId: string): ContextMetrics | undefined {
		if (!this.config.context.enabled || this.closed) return undefined;
		return this.metricsController.request(
			entryId,
			entryId === this.state.selectedEntryId ? 0 : 1,
		);
	}
	public getVisibleNodes(): DisplayNode[] {
		const s = this.state;
		const key = JSON.stringify([
			this.sessionRevision,
			s.displayOptions,
			s.foldOptions,
			s.foldOptions.collapseLinearPaths ? s.selectedEntryId : null,
			[...s.manualExpandedIds],
			[...s.manualCollapsedIds],
			[...s.temporaryRevealedIds],
			s.branchBookmarks ?? {},
			(s.foldOptions.mode === "focused-only" ||
				s.foldOptions.mode === "smart") &&
			s.foldOptions.collapseInactiveBranches
				? [...s.focusedPathIds]
				: null,
		]);
		if (!this.cachedVisibleNodes || key !== this.cachedProjectionKey) {
			if (this.summaryRevision !== this.sessionRevision) {
				this.summaryCache.clear();
				this.summaryRevision = this.sessionRevision;
			}
			this.cachedVisibleNodes = buildDisplayProjection(
				this.index,
				s,
				(entry, thinking) => {
					let pair = this.summaryCache.get(entry.id);
					if (!pair) {
						pair = {};
						this.summaryCache.set(entry.id, pair);
					}
					const key = thinking ? "thinking" : "plain";
					if (pair[key]) return pair[key];
					const summary = extractSummary(entry, thinking);
					pair[key] = summary;
					return summary;
				},
			);
			this.cachedProjectionKey = key;
		}
		for (const node of this.cachedVisibleNodes) {
			node.isSelected = node.id === s.selectedEntryId;
			node.isCurrentLeaf = node.id === s.sessionLeafId;
		}
		return this.cachedVisibleNodes;
	}

	private metricsBadge(metrics: ContextMetrics | undefined): string {
		const options = this.config.context;
		if (!options.enabled) return "";
		if (!options.showTokens)
			return metrics?.percentage == null || !options.showPercentage
				? "—"
				: `${metrics.estimated ? "~" : ""}${metrics.percentage}%`;
		const badge = formatContextMetricsBadge(metrics, {
			showPercentage: options.showPercentage,
		});
		return options.showEstimateMarker ? badge : badge.replace(/^~/, "≈");
	}
	private hint(
		actionId: string,
		label: string,
		mode = this.state.mode,
	): string {
		const names: Record<string, string> = {
			"\r": "Enter",
			enter: "Enter",
			"\u001b": "Esc",
			escape: "Esc",
			esc: "Esc",
			" ": "Space",
			space: "Space",
			"\t": "Tab",
			tab: "Tab",
		};
		const keys = this.keyResolver
			.keysForAction(actionId, mode)
			.map((k) => names[k] ?? k)
			.join("/");
		return `${keys || "(unbound)"} ${label}`;
	}
	public render(width: number): string[] {
		const lines: string[] = [];
		const safeWidth = Math.max(1, width);

		const inspectionHeight = Math.max(1, (this.tui.terminal?.rows ?? 24) - 4);
		this.lastRenderWidth = safeWidth;
		if (this.userTipConfirm) {
			const tip = this.userTipConfirm;
			lines.push(
				truncateToWidth(
					"SESSION TREE EXPLORER - USER MESSAGE TIP NOTICE",
					safeWidth,
				),
			);
			lines.push("─".repeat(safeWidth));
			lines.push(
				truncateToWidth(
					`Target tip '${tip.entryId}' is a user message (D${tip.turnDepth}).`,
					safeWidth,
				),
			);
			lines.push(
				truncateToWidth(
					"Pi native navigation will move to its parent and restore this prompt into the editor:",
					safeWidth,
				),
			);
			lines.push(truncateToWidth(`  "${tip.previewText}"`, safeWidth));
			lines.push("─".repeat(safeWidth));
			lines.push(
				truncateToWidth(
					"Enter/y Confirm and restore prompt  Esc/n Cancel",
					safeWidth,
				),
			);
			return lines;
		}
		if (this.tipPicker) {
			const { tips, selectedIndex } = this.tipPicker;
			lines.push(
				truncateToWidth(
					`SESSION TREE EXPLORER - SELECT BRANCH TIP (${tips.length} reachable)`,
					safeWidth,
				),
			);
			lines.push("─".repeat(safeWidth));
			for (let i = 0; i < tips.length; i++) {
				const tip = tips[i];
				const prefix = i === selectedIndex ? "▶ " : "  ";
				const tags = [
					tip.isCurrentLeaf ? "[CURRENT]" : "",
					tip.isUserPrompt ? "[USER->restores prompt]" : "",
				]
					.filter(Boolean)
					.join(" ");
				const row = `${prefix}[${tip.role}] D${tip.turnDepth} ${tip.previewText}${tags ? ` ${tags}` : ""} (${tip.entryId})`;
				lines.push(truncateToWidth(row, safeWidth));
			}
			lines.push("─".repeat(safeWidth));
			lines.push(
				truncateToWidth(
					"j/k/↑/↓ Select  Enter Go to tip  Esc/q Cancel",
					safeWidth,
				),
			);
			return lines;
		}
		if (this.bookmarkPrompt) {
			const bp = this.bookmarkPrompt;
			lines.push(
				truncateToWidth(
					`SESSION TREE EXPLORER - BOOKMARK BRANCH [${bp.entryId}]`,
					safeWidth,
				),
			);
			lines.push("─".repeat(safeWidth));
			lines.push(
				truncateToWidth(
					`Bookmark name (empty clears): ${bp.value}█`,
					safeWidth,
				),
			);
			lines.push("─".repeat(safeWidth));
			lines.push(truncateToWidth("Enter Save bookmark  Esc Cancel", safeWidth));
			return lines;
		}
		if (this.branchSwitcher) {
			const bs = this.branchSwitcher;
			lines.push(
				truncateToWidth(
					`SESSION TREE EXPLORER - BRANCH SWITCHER (${bs.items.length} branches)`,
					safeWidth,
				),
			);
			lines.push("─".repeat(safeWidth));
			for (let i = 0; i < bs.items.length; i++) {
				const item = bs.items[i];
				const prefix = i === bs.selectedIndex ? "▶ " : "  ";
				const tag = item.bookmark ? `★ [${item.bookmark}] ` : "";
				const cur = item.isCurrentLeaf ? " [CURRENT]" : "";
				const row = `${prefix}${tag}${item.preview} (${item.messageCount} msgs, ${item.lastUpdated})${cur} -> ${item.tipId}`;
				lines.push(truncateToWidth(row, safeWidth));
			}
			lines.push("─".repeat(safeWidth));
			lines.push(
				truncateToWidth(
					"j/k/↑/↓ Select  Enter Go to branch tip  Esc/q Cancel",
					safeWidth,
				),
			);
			return lines;
		}
		if (this.statsView) {
			const stats = computeSessionStatistics(this.index, this.state);
			const statLines = formatSessionStatisticsLines(stats, safeWidth);
			const bodyHeight = Math.max(4, inspectionHeight - 4);
			const maxScroll = Math.max(0, statLines.length - bodyHeight);
			this.statsView.scrollOffset = Math.max(
				0,
				Math.min(this.statsView.scrollOffset, maxScroll),
			);
			const windowLines = statLines.slice(
				this.statsView.scrollOffset,
				this.statsView.scrollOffset + bodyHeight,
			);
			lines.push(
				truncateToWidth(
					"SESSION TREE EXPLORER - SESSION STATISTICS",
					safeWidth,
				),
			);
			lines.push("─".repeat(safeWidth));
			lines.push(...windowLines);
			lines.push("─".repeat(safeWidth));
			lines.push(truncateToWidth("j/k/↑/↓ Scroll  Esc/q Close", safeWidth));
			return lines;
		}
		if (this.branchDiff) {
			const bd = this.branchDiff;
			if (bd.stage === "pick-a" || bd.stage === "pick-b") {
				const title =
					bd.stage === "pick-a"
						? "SESSION TREE EXPLORER - BRANCH DIFF (SELECT BRANCH A)"
						: `SESSION TREE EXPLORER - BRANCH DIFF (SELECT BRANCH B vs ${bd.branchAId})`;
				lines.push(truncateToWidth(title, safeWidth));
				lines.push("─".repeat(safeWidth));
				for (let i = 0; i < bd.options.length; i++) {
					const opt = bd.options[i];
					const prefix = i === bd.selectedIndex ? "▶ " : "  ";
					const tags = [
						opt.isCurrentLeaf ? "[CURRENT]" : "",
						opt.label ? `★[${opt.label}]` : "",
						opt.entryId === bd.branchAId ? "[A]" : "",
					]
						.filter(Boolean)
						.join(" ");
					lines.push(
						truncateToWidth(
							`${prefix}D${opt.turnDepth} ${opt.preview}${tags ? ` ${tags}` : ""} (${opt.entryId})`,
							safeWidth,
						),
					);
				}
				lines.push("─".repeat(safeWidth));
				lines.push(
					truncateToWidth(
						"j/k/↑/↓ Select  Enter Next  Esc/q Cancel",
						safeWidth,
					),
				);
				return lines;
			}
			if (bd.stage === "loading" || !bd.result) {
				lines.push(
					truncateToWidth(
						`SESSION TREE EXPLORER - BRANCH DIFF (${bd.branchAId} vs ${bd.branchBId})`,
						safeWidth,
					),
				);
				lines.push("─".repeat(safeWidth));
				lines.push("Computing branch topology and workspace git diff...");
				return lines;
			}
			const diffLines = formatBranchDiffLines(bd.result, safeWidth);
			const bodyHeight = Math.max(4, inspectionHeight - 4);
			const maxScroll = Math.max(0, diffLines.length - bodyHeight);
			bd.scrollOffset = Math.max(0, Math.min(bd.scrollOffset, maxScroll));
			const windowLines = diffLines.slice(
				bd.scrollOffset,
				bd.scrollOffset + bodyHeight,
			);
			lines.push(
				truncateToWidth(
					`SESSION TREE EXPLORER - BRANCH DIFF [${bd.branchAId} vs ${bd.branchBId}]`,
					safeWidth,
				),
			);
			lines.push("─".repeat(safeWidth));
			lines.push(...windowLines);
			lines.push("─".repeat(safeWidth));
			lines.push(
				truncateToWidth(
					`[${diffLines.length ? bd.scrollOffset + 1 : 0}-${Math.min(diffLines.length, bd.scrollOffset + bodyHeight)}/${diffLines.length}] j/k/↑/↓ Scroll  Esc/q Close`,
					safeWidth,
				),
			);
			return lines;
		}
		if (this.summaryPrompt) {
			const sp = this.summaryPrompt;
			const c = sp.context;
			lines.push(
				truncateToWidth(
					"SESSION TREE EXPLORER - BRANCH NAVIGATION SUMMARY",
					safeWidth,
				),
			);
			lines.push("─".repeat(safeWidth));
			lines.push(
				truncateToWidth(
					`Source branch: ${c.sourceBranchLabel} (${c.sourceLeafId ?? "none"})`,
					safeWidth,
				),
			);
			lines.push(
				truncateToWidth(
					`Target branch: ${c.targetBranchLabel} (${c.targetId})`,
					safeWidth,
				),
			);
			lines.push(
				truncateToWidth(
					`Summarized range: ${c.abandonedEntryCount} entries (${c.abandonedTurnCount} turns) since ${c.commonAncestorId ?? "root"}`,
					safeWidth,
				),
			);
			lines.push("─".repeat(safeWidth));
			if (sp.customInputMode) {
				lines.push(
					truncateToWidth(
						`Custom prompt: ${sp.customInstructions}█`,
						safeWidth,
					),
				);
				lines.push("─".repeat(safeWidth));
				lines.push(
					truncateToWidth("Enter Submit custom summary  Esc Back", safeWidth),
				);
			} else {
				const opts = [
					"1: No summary (fast switch)",
					"2: Summarize (native Pi branch summary)",
					"3: Custom prompt (enter summary instructions)",
				];
				for (let i = 0; i < opts.length; i++) {
					const prefix = i === sp.selectedIndex ? "▶ " : "  ";
					lines.push(truncateToWidth(`${prefix}${opts[i]}`, safeWidth));
				}
				lines.push("─".repeat(safeWidth));
				lines.push(
					truncateToWidth(
						"1/2/3 or ↑/↓ Select  Enter Confirm  Esc Cancel",
						safeWidth,
					),
				);
			}
			return lines;
		}
		if (this.state.mode === "preview") {
			const targetId = this.state.previewNodeId ?? this.state.selectedEntryId;
			const entry = targetId ? this.index.entryById.get(targetId) : undefined;
			return this.inspection.render({
				identity: `preview:${this.sessionRevision}:${targetId}`,
				contentKey: `${safeWidth}:${this.state.version}`,
				width: safeWidth,
				height: inspectionHeight,
				title: `SESSION TREE EXPLORER - PREVIEW [ID: ${targetId ?? "none"}]`,
				footer: `${this.hint("session.preview", "Return")} ${this.hint("session.close", "Close preview")} ${this.hint("view.pageUp", "Prev")} ${this.hint("view.pageDown", "Next")}`,
				body: () => {
					const previewNode = this.getVisibleNodes().find(
						(n) => n.id === targetId,
					);
					const metrics = targetId
						? this.getMetricsForEntry(targetId)
						: undefined;
					return formatRichPreviewLines({
						node: previewNode,
						entry,
						index: this.index,
						width: safeWidth,
						metrics,
						metricsBadge: metrics ? this.metricsBadge(metrics) : undefined,
					});
				},
			});
		}
		if (this.state.mode === "help")
			return this.inspection.render({
				identity: `help:${this.sessionRevision}`,
				contentKey: `${safeWidth}:${this.state.version}`,
				width: safeWidth,
				height: inspectionHeight,
				title: "SESSION TREE EXPLORER - SHORTCUT HELP",
				footer: `${this.hint("view.help", "Return")} ${this.hint("session.close", "Close help")} ${this.hint("view.settings", "Settings")} ${this.hint("view.pageUp", "Prev")} ${this.hint("view.pageDown", "Next")}`,
				body: () => {
					const body = ["Navigation:", "Folding & Filtering:"];
					for (const action of this.registry.values()) {
						const keys = action.modes.map(
							(mode) =>
								`${mode}: ${this.keyResolver.keysForAction(action.id, mode).join("/") || "(bind in config)"}`,
						);
						const available =
							!action.enabled || action.enabled(this.state, this.index);
						body.push(
							`${action.id} [${action.modes.join("/")}] ${keys.join(" / ")} ${available ? "" : "(disabled) "}${action.description}`,
						);
					}
					return body;
				},
			});

		const visibleNodes = this.getVisibleNodes();

		// 2. Header
		const entryCount = this.index.entryById.size;
		const forkCount = this.index.forkPointIds.size;
		const sessionDisplay = this.state.sessionId.slice(0, 16);
		const vimTag = this.state.vimMode ? "NORMAL" : "NON-VIM";
		const headerLeft = `SESSION TREE EXPLORER [${vimTag}]`;
		const headerRight = `Session: ${sessionDisplay}  Entries: ${entryCount}  Forks: ${forkCount}`;
		const padLen = Math.max(
			2,
			safeWidth - visibleWidth(headerLeft) - visibleWidth(headerRight),
		);
		lines.push(
			truncateToWidth(
				`${headerLeft}${" ".repeat(padLen)}${headerRight}`,
				safeWidth,
			),
		);
		lines.push("─".repeat(safeWidth));

		// Search Bar row
		if (this.state.mode === "search") {
			const searchStatus = `[${this.state.searchResults.length} matches, scope: ${this.state.searchScope}]`;
			lines.push(
				truncateToWidth(
					`/ ${this.state.searchQuery}█ ${searchStatus}`,
					safeWidth,
				),
			);
			lines.push("─".repeat(safeWidth));
		} else if (this.state.searchQuery) {
			const searchStatus = `[${this.state.searchResults.length} matches, scope: ${this.state.searchScope} - ${this.hint("search.clear", "clears", "normal")}]`;
			lines.push(
				truncateToWidth(
					`/ ${this.state.searchQuery} ${searchStatus}`,
					safeWidth,
				),
			);
			lines.push("─".repeat(safeWidth));
		}

		// 3. Tree Content Viewport
		if (this.index.entryById.size === 0) {
			lines.push("  (empty session tree)");
			lines.push("─".repeat(safeWidth));
			lines.push(this.hint("session.close", "Close"));
			return lines.map((line) => truncateToWidth(line, safeWidth));
		}

		if (visibleNodes.length === 0) {
			lines.push("  (no matching visible entries - check filter settings)");
			lines.push("─".repeat(safeWidth));
			lines.push(
				`${this.hint("view.help", "Help")}  ${this.hint("session.close", "Close")}`,
			);
			return lines.map((line) => truncateToWidth(line, safeWidth));
		}

		const selectedIndex = visibleNodes.findIndex(
			(n) => n.id === this.state.selectedEntryId,
		);
		const maxRows = this.tui.terminal?.rows
			? Math.min(this.pageSize, Math.max(5, this.tui.terminal.rows - 8))
			: this.pageSize;
		const viewportHeight = this.config.performance.virtualRendering
			? Math.max(5, maxRows)
			: visibleNodes.length;

		let start = 0;
		if (selectedIndex >= viewportHeight) {
			start = selectedIndex - Math.floor(viewportHeight / 2);
		}
		start = Math.max(0, Math.min(start, visibleNodes.length - viewportHeight));
		const end = Math.min(visibleNodes.length, start + viewportHeight);
		if (
			this.config.context.enabled &&
			(this.state.showContext || this.state.showDetails)
		) {
			const overscan = this.config.performance.renderOverscan;
			this.metricsController.prioritize([
				this.state.selectedEntryId ?? "",
				...visibleNodes.slice(start, end).map((n) => n.realId ?? ""),
				...visibleNodes
					.slice(
						Math.max(0, start - overscan),
						Math.min(visibleNodes.length, end + overscan),
					)
					.map((n) => n.realId ?? ""),
				...(this.config.context.lazyEvaluation
					? []
					: visibleNodes.slice(0, 256).map((n) => n.realId ?? "")),
			]);
		}

		const layout = computeResponsiveLayout(safeWidth);
		const outlineWidth = layout.outlineWidth;
		const outlineLines: string[] = [];

		for (let i = start; i < end; i++) {
			const node = visibleNodes[i];
			const isSel = node.id === this.state.selectedEntryId;
			const isCurrent = node.id === this.state.sessionLeafId;

			const parts: string[] = [];
			if (node.kind === "virtual-tool-group") {
				if (isCurrent) parts.push("◉");
			} else {
				if (this.index.rootIds.includes(node.id)) parts.push("●");
				if (isCurrent) parts.push("◉");
				if (node.isCollapsed || node.isVirtualSummary) parts.push("▸");
				else if (node.isFork) parts.push("▾");
			}
			const marker =
				parts.join("") || (node.kind === "virtual-tool-group" ? "" : "◇");
			const selPrefix = isSel ? "▶ " : "  ";
			const indent = (
				this.state.displayOptions.layout === "compact" ? " " : "  "
			).repeat(Math.min(10, node.rawDepth));
			let depthVal = node.turnDepth;
			let depthPrefix = "D";
			if (this.state.displayOptions.depthMode === "raw") {
				depthVal = node.rawDepth;
				depthPrefix = "R";
			} else if (this.state.displayOptions.depthMode === "branch") {
				depthVal = node.branchDepth;
				depthPrefix = "B";
			}
			const depthStr = this.state.displayOptions.showDepth
				? `${depthPrefix}${depthVal}`
				: "";
			const labelTag = node.label ? ` ★[${node.label}]` : "";

			let contextSuffix = "";
			const metrics = this.state.showContext
				? this.getMetricsForEntry(node.id)
				: undefined;
			node.contextMetrics = metrics;

			if (
				safeWidth >= 120 &&
				this.state.showContext &&
				this.config.context.enabled
			) {
				const contextBadge = this.metricsBadge(metrics);
				const modelTag =
					metrics?.modelId && this.config.context.showModel
						? ` [${metrics.modelId.slice(0, 16)}]`
						: "";
				contextSuffix = `  ${depthStr}  ${contextBadge}${modelTag}`;
			} else if (
				safeWidth >= 80 &&
				this.state.showContext &&
				this.config.context.enabled
			) {
				const contextBadge = this.metricsBadge(metrics);
				contextSuffix = `  ${depthStr}  ${contextBadge}`;
			} else {
				contextSuffix = `  ${depthStr}`;
			}

			const prefix = `${selPrefix}${indent}${marker} `;
			const meta = `${this.state.displayOptions.showNodeId ? ` [${node.realId ?? "summary"}]` : ""}${this.state.displayOptions.showTimestamps ? ` ${node.timestamp}` : ""}`;
			const queryTerm = this.state.searchQuery.trim();
			const isSearchHit =
				queryTerm.length > 0 &&
				this.state.searchResults.some(
					(r) => r.id === node.id || r.id === node.realId,
				);
			const rawSlice = node.summaryText.slice(
				0,
				this.state.displayOptions.maxMessageLength,
			);
			const hasInlineMatch =
				isSearchHit &&
				(this.config.search.caseSensitive
					? rawSlice.includes(queryTerm)
					: rawSlice.toLowerCase().includes(queryTerm.toLowerCase()));
			const searchHitTag = isSearchHit && !hasInlineMatch ? " [hit]" : "";
			const availableTextWidth = Math.max(
				0,
				outlineWidth -
					visibleWidth(prefix) -
					visibleWidth(contextSuffix) -
					visibleWidth(labelTag) -
					visibleWidth(searchHitTag) -
					visibleWidth(meta) -
					2,
			);
			let truncatedText = truncateToWidth(rawSlice, availableTextWidth);
			if (hasInlineMatch) {
				const escaped = queryTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
				const rx = new RegExp(
					escaped,
					this.config.search.caseSensitive ? "g" : "gi",
				);
				truncatedText = truncatedText.replace(
					rx,
					(m) => `\x1b[1;33m${m}\x1b[0m`,
				);
			}
			const row = `${prefix}${truncatedText}${searchHitTag}${labelTag}${contextSuffix}${meta}`;
			outlineLines.push(truncateToWidth(row, outlineWidth));
		}

		if (layout.mode === "dual-pane") {
			const previewTargetId =
				this.state.previewNodeId ?? this.state.selectedEntryId;
			const previewNode =
				visibleNodes.find((n) => n.id === previewTargetId) ??
				visibleNodes[Math.max(selectedIndex, 0)];
			const previewEntry = previewTargetId
				? this.index.entryById.get(previewTargetId)
				: undefined;
			const previewMetrics = previewTargetId
				? this.getMetricsForEntry(previewTargetId)
				: undefined;
			const previewBody = formatRichPreviewLines({
				node: previewNode,
				entry: previewEntry,
				index: this.index,
				width: layout.previewWidth,
				metrics: previewMetrics,
				metricsBadge: previewMetrics
					? this.metricsBadge(previewMetrics)
					: undefined,
			});
			const paneHeight = Math.max(
				outlineLines.length,
				Math.min(maxRows, previewBody.length + 2),
				6,
			);
			const previewLines = [
				"NODE PREVIEW",
				"─".repeat(layout.previewWidth),
				...previewBody,
			].slice(0, paneHeight);
			lines.push(...renderDualPane(outlineLines, previewLines, layout));
		} else {
			lines.push(...outlineLines);
		}

		lines.push("─".repeat(safeWidth));

		// 4. Details Panel
		const selectedNode = visibleNodes[Math.max(selectedIndex, 0)];
		if (selectedNode && this.state.showDetails) {
			const detailLine1 = `Selected: ${selectedNode.summaryText}`;
			const metrics =
				selectedNode.contextMetrics ?? this.getMetricsForEntry(selectedNode.id);
			const contextBadge = this.metricsBadge(metrics);
			const sourceLabel = metrics?.source ? ` (source: ${metrics.source})` : "";

			const detailLine2 =
				selectedNode.kind === "virtual-tool-group" && selectedNode.toolGroup
					? `Tool Group: ${selectedNode.toolGroup.count} calls (${selectedNode.toolGroup.statusSummary})  Tools: ${selectedNode.toolGroup.toolNames.join(", ")}`
					: selectedNode.isVirtualSummary
						? `Virtual Branch Summary  Descendants: ${selectedNode.virtualDescendantCount ?? 0}  Forks: ${selectedNode.virtualForkCount ?? 0}`
						: `ID: ${selectedNode.id}  Depth: D${selectedNode.turnDepth}  Branch: ${selectedNode.branchDepth}  Context: ${contextBadge}${sourceLabel}`;
			lines.push(truncateToWidth(detailLine1, safeWidth));
			lines.push(truncateToWidth(detailLine2, safeWidth));
		} else {
			if (this.state.showDetails) lines.push("No node selected");
			lines.push("");
		}

		// 5. Footer Key Hints
		lines.push("─".repeat(safeWidth));
		const footer = [
			["session.navigate", "Go"],
			["session.preview", "Preview"],
			["branch.tip", "Tip"],
			["session.restorePrevious", "Restore"],
			["session.fork", "Fork"],
			["session.forkBefore", "ForkBefore"],
			["fold.toggle", "Fold"],
			["search.open", "Search"],
			["view.help", "Help"],
			["session.close", "Close"],
		]
			.map(([id, label]) => this.hint(id, label))
			.join("  ");
		lines.push(truncateToWidth(footer, safeWidth));

		return lines.map((line) => truncateToWidth(line, safeWidth));
	}

	public applyConfiguration(config: SessionTreeConfig): void {
		if (this.closed) return;
		const previous = this.config;
		this.config = structuredClone(config);
		const changes = (before: object, next: object) => {
			const old = new Map(Object.entries(before));
			return Object.fromEntries(
				Object.entries(next).filter(([key, value]) => old.get(key) !== value),
			);
		};
		if (previous.vimMode !== config.vimMode)
			this.state.vimMode = config.vimMode;
		this.state.displayOptions = {
			...this.state.displayOptions,
			...changes(previous.display, config.display),
		};
		this.state.foldOptions = {
			...this.state.foldOptions,
			...changes(previous.fold, config.fold),
		};
		if (previous.search.scope !== config.search.scope)
			this.state.searchScope = config.search.scope;
		if (previous.search.mode !== config.search.mode)
			this.state.searchRegex = config.search.mode === "regex";
		this.state.renderOverscan = config.performance.renderOverscan;
		this.keyResolver.setBindings(config.keybindings);
		this.keyResolver.setVimMode(this.state.vimMode);
		if (
			JSON.stringify(previous.search) !== JSON.stringify(config.search) ||
			previous.performance.searchDebounceMs !==
				config.performance.searchDebounceMs
		)
			this.searchController.configure({
				...config.search,
				debounceMs: config.performance.searchDebounceMs,
			});
		if (JSON.stringify(previous.context) !== JSON.stringify(config.context)) {
			this.metricsController.dispose();
			this.metricsController = this.createMetricsController();
		}
		this.state.version++;
		this.invalidate();
	}
	public replaceSnapshot(snapshot: SessionSnapshot): void {
		if (this.closed) return;
		const changed = snapshot.sessionId !== this.state.sessionId;
		this.sessionRevision++;
		this.index = snapshot.index;
		this.state.sessionId = snapshot.sessionId;
		this.state.sessionLeafId = snapshot.leafId;
		this.activeModel = snapshot.activeModel;
		this.activeUsage = snapshot.activeUsage;
		this.tipPicker = null;
		this.userTipConfirm = null;
		this.branchDiff = null;
		this.summaryPrompt = null;
		this.branchSwitcher = null;
		this.bookmarkPrompt = null;
		this.statsView = null;
		this.state.searchSnapshot = undefined;
		if (this.state.mode === "search") this.state.mode = "normal";
		for (const ids of [
			this.state.manualExpandedIds,
			this.state.manualCollapsedIds,
			this.state.temporaryRevealedIds,
		])
			for (const id of ids)
				if (changed || !this.index.entryById.has(id)) ids.delete(id);
		if (changed) {
			this.state.mode = "normal";
			this.state.searchQuery = "";
			this.state.searchResults = [];
			this.state.focusedBranchId = null;
			this.state.recentLeafByBranch.clear();
			this.state.displayOptions = {
				...defaultDisplayOptions(),
				...this.config.display,
			};
			this.state.explicitDisplayOverrides = {};
			this.state.branchBookmarks = {};
			this.state.foldOptions = { ...this.config.fold };
			this.state.showDetails = true;
			this.state.showContext = true;
		}
		if (
			this.state.focusedBranchId &&
			!this.index.entryById.has(this.state.focusedBranchId)
		)
			this.state.focusedBranchId = null;
		this.state.focusedPathIds.clear();
		let focal = this.state.focusedBranchId ?? snapshot.leafId;
		while (focal) {
			this.state.focusedPathIds.add(focal);
			focal = this.index.parentById.get(focal) ?? null;
		}
		if (
			changed ||
			!this.state.selectedEntryId ||
			!this.index.entryById.has(this.state.selectedEntryId)
		)
			this.state.selectedEntryId =
				snapshot.leafId ?? this.index.preorderIds[0] ?? null;
		this.state.version++;
		this.searchController.invalidate();
		this.metricsController.dispose();
		this.metricsController = this.createMetricsController();
		reconcileSelection(this.index, this.state, this.getVisibleNodes());
		this.invalidate();
	}
	public async whenSettled(): Promise<void> {
		await Promise.all([...this.pendingEffects]);
	}
	public dispatch(actionId: string): void {
		const action = this.registry.get(actionId);
		if (
			this.closed ||
			!action ||
			!action.modes.includes(this.state.mode) ||
			(action.enabled && !action.enabled(this.state, this.index))
		)
			return;
		if (
			this.pendingEffects.size &&
			[
				"session.navigate",
				"session.fork",
				"session.forkBefore",
				"session.setLabel",
				"session.refresh",
				"session.restorePrevious",
				"branch.tip",
				"view.settings",
			].includes(actionId)
		) {
			this.onNotify?.("Another session operation is in progress", "warning");
			return;
		}
		const revision = this.sessionRevision;
		const isCurrent = () => !this.closed && revision === this.sessionRevision;
		const previousNodes = this.getVisibleNodes();
		const previousMode = this.state.mode;
		const ctx: ActionContext = {
			state: this.state,
			index: this.index,
			visibleNodes: previousNodes,
			isCurrent,
			actionId,
			navigationOptions: this.config.navigation,
			defaults: {
				display: { ...defaultDisplayOptions(), ...this.config.display },
				fold: { ...this.config.fold },
			},
			editLabel: this.onEditLabel,
			scrollInspection: (move) => {
				this.render(this.lastRenderWidth);
				this.inspection.scroll(move);
			},
			openSettings: async () => {
				if (this.onOpenSettings)
					this.applyConfiguration(await this.onOpenSettings());
			},
			reloadConfig: async () => {
				if (this.onReloadConfig)
					this.applyConfiguration(await this.onReloadConfig());
			},
			searchAction: (id) => this.searchController.execute(ctx, id),
			close: () => this.done({ type: "close" }),
			pageSize: this.pageSize,
			reproject: () => {
				this.cachedVisibleNodes = null;
				ctx.visibleNodes = this.getVisibleNodes();
				return ctx.visibleNodes;
			},
			setLabel: this.onSetLabel,
			refresh: async () => {
				const next = await this.onRefresh?.();
				if (!isCurrent()) return;
				if (next) this.replaceSnapshot(next);
				else {
					this.sessionRevision++;
					this.state.version++;
					this.searchController.invalidate();
					this.metricsController.dispose();
					this.metricsController = this.createMetricsController();
					this.invalidate();
				}
			},
			notify: this.onNotify,
			navigationHistory: this.navigationHistory,
			openTipPicker: (tips) => {
				this.tipPicker = { tips, selectedIndex: 0 };
				this.userTipConfirm = null;
			},
			openBranchDiff: (initialBranchId) => {
				const options = buildDiffBranchOptions(
					this.index,
					this.state.sessionLeafId,
					initialBranchId ?? this.state.selectedEntryId,
				);
				if (options.length < 2) {
					this.onNotify?.(
						"Need at least two branches or entries to compare.",
						"info",
					);
					return;
				}
				const initialIdx = Math.max(
					0,
					options.findIndex(
						(o) => o.entryId === (initialBranchId ?? this.state.sessionLeafId),
					),
				);
				this.branchDiff = {
					stage: "pick-a",
					options,
					selectedIndex: initialIdx,
					scrollOffset: 0,
				};
			},
			openBranchSwitcher: () => {
				const bookmarked = new Map<string, string>();
				for (const [id, label] of this.index.displayLabelsById.entries()) {
					bookmarked.set(id, label);
				}
				if (this.state.branchBookmarks) {
					for (const [id, label] of Object.entries(
						this.state.branchBookmarks,
					)) {
						if (this.index.entryById.has(id) && label.trim()) {
							bookmarked.set(id, label);
						}
					}
				}
				const items: NonNullable<typeof this.branchSwitcher>["items"] = [];
				const seenTips = new Set<string>();
				const addBranch = (
					anchorId: string,
					bookmark: string,
					isBookmarked: boolean,
				) => {
					const tips = findReachableBranchTips(this.index, anchorId);
					const tipId = tips[tips.length - 1] ?? anchorId;
					if (seenTips.has(tipId) && !isBookmarked) return;
					seenTips.add(tipId);
					const tipEntry = this.index.entryById.get(tipId);
					const anchorEntry = this.index.entryById.get(anchorId);
					let messageCount = 0;
					let cur: string | null = tipId;
					const guard = new Set<string>();
					while (cur && !guard.has(cur)) {
						guard.add(cur);
						messageCount++;
						cur = this.index.parentById.get(cur) ?? null;
					}
					const previewSource = anchorEntry ?? tipEntry;
					items.push({
						anchorId,
						tipId,
						bookmark,
						isBookmarked,
						isCurrentLeaf: tipId === this.state.sessionLeafId,
						messageCount,
						lastUpdated: tipEntry?.timestamp ?? "",
						preview: previewSource
							? extractSummary(previewSource, false).summaryText.slice(0, 48)
							: anchorId,
					});
				};
				for (const [id, label] of bookmarked.entries()) {
					addBranch(id, label, true);
				}
				for (const leafId of this.index.leafIds) {
					addBranch(leafId, bookmarked.get(leafId) ?? "", false);
				}
				if (items.length === 0) {
					this.onNotify?.("No branches available.", "info");
					return;
				}
				this.branchSwitcher = { items, selectedIndex: 0 };
			},
			openSessionStats: () => {
				this.statsView = { scrollOffset: 0 };
			},
			editBookmark: async (entryId, current) => {
				this.bookmarkPrompt = { entryId, value: current ?? "" };
				this.invalidate();
				return null;
			},
			confirmUserTip: (tip) => {
				this.userTipConfirm = tip;
				this.tipPicker = null;
				this.onNotify?.(
					`Tip '${tip.entryId}' is a user message; native navigation will restore its prompt into the editor.`,
					"warning",
				);
			},
			restorePrevious: (entryId) =>
				this.done({ type: "navigate", entryId, restore: true }),
			navigate: (entryId, summarize) => {
				if (this.config.session.promptSummary && summarize === undefined) {
					const summaryCtx = computeBranchSummaryContext(
						this.index,
						this.state.sessionLeafId,
						entryId,
					);
					if (summaryCtx.isCrossBranch) {
						this.summaryPrompt = {
							entryId,
							context: summaryCtx,
							selectedIndex: 0,
							customInputMode: false,
							customInstructions: "",
						};
						return;
					}
				}
				this.done({ type: "navigate", entryId, summarize });
			},
			fork: (entryId, position) =>
				this.done({ type: "fork", entryId, position }),
		};
		const complete = () => {
			if (!this.closed) {
				if (previousMode !== this.state.mode) this.inspection.reset();
				const nodes = this.getVisibleNodes(),
					selected = this.state.selectedEntryId;
				const target = nodes.some((n) => n.id === selected)
					? selected
					: (rawTargetForSelection(selected, previousNodes, this.index) ??
						selected);
				this.state.selectedEntryId = resolveDisplayTarget(
					target,
					this.index,
					nodes,
				);
				this.keyResolver.setMode(this.state.mode);
				this.invalidate();
			}
		};
		try {
			const result = action.execute(ctx);
			complete();
			if (result instanceof Promise) {
				const pending = result.then(complete).catch((error) => {
					if (!this.closed) this.onNotify?.(String(error), "error");
				});
				this.pendingEffects.add(pending);
				void pending.finally(() => this.pendingEffects.delete(pending));
			}
		} catch (error) {
			this.onNotify?.(String(error), "error");
		}
	}

	public handleInput(data: string): void {
		if (this.closed) return;
		if (this.bookmarkPrompt) {
			const bp = this.bookmarkPrompt;
			const key = matchRawInput(data);
			if (key === "\r") {
				const label = bp.value.trim() || undefined;
				const nextMap = { ...(this.state.branchBookmarks ?? {}) };
				if (label) nextMap[bp.entryId] = label;
				else delete nextMap[bp.entryId];
				this.state.branchBookmarks = nextMap;
				this.bookmarkPrompt = null;
				this.state.version++;
				this.cachedVisibleNodes = null;
				this.onNotify?.(
					label
						? `Bookmarked '${label}' on ${bp.entryId}`
						: `Removed bookmark on ${bp.entryId}`,
					"info",
				);
				this.invalidate();
				return;
			}
			if (key === "\u001b") {
				this.bookmarkPrompt = null;
				this.invalidate();
				return;
			}
			if (data === "\b" || data === "\x7f") {
				bp.value = [...bp.value].slice(0, -1).join("");
				this.invalidate();
				return;
			}
			if (
				data.length > 0 &&
				[...data].every((c) => {
					const code = c.charCodeAt(0);
					return code >= 32 && (code < 127 || code > 159);
				})
			) {
				bp.value += data;
				this.invalidate();
			}
			return;
		}
		if (this.branchSwitcher) {
			const bs = this.branchSwitcher;
			const key = matchRawInput(data);
			if (key === "\u001b" || key === "q") {
				this.branchSwitcher = null;
				this.invalidate();
				return;
			}
			if (key === "j" || key === "down" || key === "ctrl+n") {
				bs.selectedIndex = Math.min(bs.items.length - 1, bs.selectedIndex + 1);
				this.invalidate();
				return;
			}
			if (key === "k" || key === "up" || key === "ctrl+p") {
				bs.selectedIndex = Math.max(0, bs.selectedIndex - 1);
				this.invalidate();
				return;
			}
			if (key === "\r") {
				const chosen = bs.items[bs.selectedIndex];
				this.branchSwitcher = null;
				if (chosen) {
					this.done({ type: "navigate", entryId: chosen.tipId });
				} else {
					this.invalidate();
				}
				return;
			}
			return;
		}
		if (this.statsView) {
			const key = matchRawInput(data);
			if (key === "\u001b" || key === "q") {
				this.statsView = null;
				this.invalidate();
				return;
			}
			if (key === "j" || key === "down") {
				this.statsView.scrollOffset++;
				this.invalidate();
			} else if (key === "k" || key === "up") {
				this.statsView.scrollOffset = Math.max(
					0,
					this.statsView.scrollOffset - 1,
				);
				this.invalidate();
			}
			return;
		}
		if (this.branchDiff) {
			const bd = this.branchDiff;
			const key = matchRawInput(data);
			if (key === "\u001b" || key === "q") {
				this.branchDiff = null;
				this.invalidate();
				return;
			}
			if (bd.stage === "pick-a" || bd.stage === "pick-b") {
				if (key === "j" || key === "down" || key === "ctrl+n") {
					bd.selectedIndex = Math.min(
						bd.options.length - 1,
						bd.selectedIndex + 1,
					);
					this.invalidate();
					return;
				}
				if (key === "k" || key === "up" || key === "ctrl+p") {
					bd.selectedIndex = Math.max(0, bd.selectedIndex - 1);
					this.invalidate();
					return;
				}
				if (key === "\r") {
					const chosen = bd.options[bd.selectedIndex];
					if (!chosen) return;
					if (bd.stage === "pick-a") {
						bd.branchAId = chosen.entryId;
						bd.stage = "pick-b";
						const nextIdx = bd.options.findIndex(
							(o) => o.entryId !== chosen.entryId,
						);
						bd.selectedIndex = nextIdx === -1 ? 0 : nextIdx;
						this.invalidate();
						return;
					}
					const branchAId = bd.branchAId ?? chosen.entryId;
					const branchBId = chosen.entryId;
					bd.branchBId = branchBId;
					bd.stage = "loading";
					this.invalidate();
					const rev = this.sessionRevision;
					const diffPromise = compareBranches({
						index: this.index,
						branchAId,
						branchBId,
						cwd: this.cwd,
					}).then((res) => {
						if (this.closed || rev !== this.sessionRevision || !this.branchDiff)
							return;
						this.branchDiff.result = res;
						this.branchDiff.stage = "view";
						this.branchDiff.scrollOffset = 0;
						this.invalidate();
					});
					this.pendingEffects.add(diffPromise);
					void diffPromise.finally(() =>
						this.pendingEffects.delete(diffPromise),
					);
					return;
				}
				return;
			}
			if (bd.stage === "view") {
				if (key === "j" || key === "down") {
					bd.scrollOffset++;
					this.invalidate();
				} else if (key === "k" || key === "up") {
					bd.scrollOffset = Math.max(0, bd.scrollOffset - 1);
					this.invalidate();
				} else if (key === "pagedown" || key === "ctrl+d") {
					bd.scrollOffset += 8;
					this.invalidate();
				} else if (key === "pageup" || key === "ctrl+u") {
					bd.scrollOffset = Math.max(0, bd.scrollOffset - 8);
					this.invalidate();
				} else if (key === "home") {
					bd.scrollOffset = 0;
					this.invalidate();
				} else if (key === "end") {
					bd.scrollOffset = Number.MAX_SAFE_INTEGER;
					this.invalidate();
				}
				return;
			}
			return;
		}
		if (this.summaryPrompt) {
			const sp = this.summaryPrompt;
			const key = matchRawInput(data);
			if (sp.customInputMode) {
				if (key === "\r") {
					const instructions = sp.customInstructions.trim() || undefined;
					const entryId = sp.entryId;
					this.summaryPrompt = null;
					this.done({
						type: "navigate",
						entryId,
						summarize: true,
						...(instructions ? { customInstructions: instructions } : {}),
					});
					return;
				}
				if (key === "\u001b") {
					sp.customInputMode = false;
					this.invalidate();
					return;
				}
				if (data === "\b" || data === "\x7f") {
					sp.customInstructions = [...sp.customInstructions]
						.slice(0, -1)
						.join("");
					this.invalidate();
					return;
				}
				if (
					data.length > 0 &&
					[...data].every((c) => {
						const code = c.charCodeAt(0);
						return code >= 32 && (code < 127 || code > 159);
					})
				) {
					sp.customInstructions += data;
					this.invalidate();
				}
				return;
			}
			if (key === "j" || key === "down" || key === "ctrl+n") {
				sp.selectedIndex = Math.min(2, sp.selectedIndex + 1);
				this.invalidate();
				return;
			}
			if (key === "k" || key === "up" || key === "ctrl+p") {
				sp.selectedIndex = Math.max(0, sp.selectedIndex - 1);
				this.invalidate();
				return;
			}
			if (key === "1") {
				const entryId = sp.entryId;
				this.summaryPrompt = null;
				this.done({ type: "navigate", entryId, summarize: false });
				return;
			}
			if (key === "2") {
				const entryId = sp.entryId;
				this.summaryPrompt = null;
				this.done({ type: "navigate", entryId, summarize: true });
				return;
			}
			if (key === "3") {
				sp.selectedIndex = 2;
				sp.customInputMode = true;
				this.invalidate();
				return;
			}
			if (key === "\r") {
				if (sp.selectedIndex === 0) {
					const entryId = sp.entryId;
					this.summaryPrompt = null;
					this.done({ type: "navigate", entryId, summarize: false });
					return;
				}
				if (sp.selectedIndex === 1) {
					const entryId = sp.entryId;
					this.summaryPrompt = null;
					this.done({ type: "navigate", entryId, summarize: true });
					return;
				}
				sp.customInputMode = true;
				this.invalidate();
				return;
			}
			if (key === "\u001b" || key === "q") {
				this.summaryPrompt = null;
				this.invalidate();
				return;
			}
			return;
		}
		if (this.userTipConfirm) {
			const key = matchRawInput(data);
			if (key === "\r" || key === "y" || key === "Y") {
				const entryId = this.userTipConfirm.entryId;
				this.userTipConfirm = null;
				this.done({ type: "navigate", entryId });
				return;
			}
			if (key === "\u001b" || key === "n" || key === "N" || key === "q") {
				this.userTipConfirm = null;
				this.onNotify?.("Branch tip navigation cancelled.", "info");
				this.invalidate();
				return;
			}
			return;
		}
		if (this.tipPicker) {
			const key = matchRawInput(data);
			const tips = this.tipPicker.tips;
			if (key === "j" || key === "down" || key === "ctrl+n") {
				this.tipPicker.selectedIndex = Math.min(
					tips.length - 1,
					this.tipPicker.selectedIndex + 1,
				);
				this.invalidate();
				return;
			}
			if (key === "k" || key === "up" || key === "ctrl+p") {
				this.tipPicker.selectedIndex = Math.max(
					0,
					this.tipPicker.selectedIndex - 1,
				);
				this.invalidate();
				return;
			}
			if (key === "\r") {
				const chosen = tips[this.tipPicker.selectedIndex];
				this.tipPicker = null;
				if (!chosen) {
					this.invalidate();
					return;
				}
				if (chosen.isUserPrompt) {
					this.userTipConfirm = chosen;
					this.onNotify?.(
						`Tip '${chosen.entryId}' is a user message; native navigation will restore its prompt into the editor.`,
						"warning",
					);
					this.invalidate();
					return;
				}
				this.done({ type: "navigate", entryId: chosen.entryId });
				return;
			}
			if (key === "\u001b" || key === "q") {
				this.tipPicker = null;
				this.invalidate();
				return;
			}
			return;
		}
		this.keyResolver.setVimMode(this.state.vimMode);

		const result = this.keyResolver.handleInput(
			data,
			this.state.mode,
			(actionId) => this.dispatch(actionId),
		);

		if (result.type === "action") {
			this.dispatch(result.actionId);
		} else if (result.type === "text") {
			if (this.state.mode === "search") {
				this.searchController.edit(result.text);
				this.invalidate();
			}
		}
	}
}
