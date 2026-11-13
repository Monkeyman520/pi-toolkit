import {
	truncateToWidth,
	visibleWidth,
	wrapTextWithAnsi,
} from "@earendil-works/pi-tui";
import { createActionRegistry } from "./actions.ts";
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
import { InspectionView } from "./inspection-view.ts";
import { KeyResolver } from "./keymap.ts";
import { MetricsController } from "./metrics-controller.ts";
import { extractContentText } from "./search.ts";
import { SearchController } from "./search-state.ts";
import type { SessionSnapshot } from "./session-snapshot.ts";
import type {
	ActionContext,
	ActionDefinition,
	ContextMetrics,
	DisplayNode,
	ExplorerResult,
	ExplorerState,
	TreeIndex,
} from "./types.ts";

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
			s.foldOptions.mode === "focused-only" &&
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
					if (!entry)
						return [
							`Virtual branch summary or missing node: ${targetId ?? ""}`,
						];
					const body = [
						`Type: ${entry.type} Role: ${entry.message?.role ?? "n/a"} Timestamp: ${entry.timestamp}`,
					];
					const bookmark = this.index.displayLabelsById.get(entry.id);
					if (bookmark) body.push(`Label: ${bookmark}`);
					if (entry.message?.model) body.push(`Model: ${entry.message.model}`);
					if (entry.message?.toolName)
						body.push(`Tool: ${entry.message.toolName}`);
					body.push("Full Content:");
					for (const paragraph of extractContentText(entry).split("\n"))
						for (const line of wrapTextWithAnsi(paragraph || " ", safeWidth))
							body.push(line);
					return body;
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
		const viewportHeight = this.config.performance.virtualRendering
			? Math.max(5, this.pageSize)
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

		for (let i = start; i < end; i++) {
			const node = visibleNodes[i];
			const isSel = node.id === this.state.selectedEntryId;
			const isCurrent = node.id === this.state.sessionLeafId;

			const parts: string[] = [];
			if (this.index.rootIds.includes(node.id)) parts.push("●");
			if (isCurrent) parts.push("◉");
			if (node.isCollapsed || node.isVirtualSummary) parts.push("▸");
			else if (node.isFork) parts.push("▾");
			const marker = parts.join("") || "◇";
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
			const availableTextWidth = Math.max(
				0,
				safeWidth -
					visibleWidth(prefix) -
					visibleWidth(contextSuffix) -
					visibleWidth(labelTag) -
					visibleWidth(meta) -
					2,
			);
			const truncatedText = truncateToWidth(
				node.summaryText.slice(0, this.state.displayOptions.maxMessageLength),
				availableTextWidth,
			);
			const row = `${prefix}${truncatedText}${labelTag}${contextSuffix}${meta}`;
			lines.push(truncateToWidth(row, safeWidth));
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

			const detailLine2 = selectedNode.isVirtualSummary
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
			navigate: (entryId, summarize) =>
				this.done({ type: "navigate", entryId, summarize }),
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
