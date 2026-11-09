import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { createActionRegistry, getDefaultKeybindings } from "./actions.ts";
import { buildDisplayProjection } from "./display.ts";
import { KeyResolver } from "./keymap.ts";
import type {
	ActionContext,
	ActionDefinition,
	DisplayNode,
	ExplorerResult,
	ExplorerState,
	TreeIndex,
} from "./types.ts";

export interface SessionTreeComponentOptions {
	tui: { requestRender: () => void };
	theme: unknown;
	done: (result: ExplorerResult) => void;
	index: TreeIndex;
	state: ExplorerState;
	registry?: Map<string, ActionDefinition>;
	keybindings?: Record<string, string[]>;
	pageSize?: number;
}

export class SessionTreeComponent {
	private tui: { requestRender: () => void };
	private done: (result: ExplorerResult) => void;
	private index: TreeIndex;
	private state: ExplorerState;
	private registry: Map<string, ActionDefinition>;
	private keyResolver: KeyResolver;
	private pageSize: number;
	private cachedVisibleNodes: DisplayNode[] | null = null;
	private cachedVersion = -1;

	constructor(options: SessionTreeComponentOptions) {
		this.tui = options.tui;
		this.done = options.done;
		this.index = options.index;
		this.state = options.state;
		this.registry = options.registry ?? createActionRegistry();
		this.pageSize = options.pageSize ?? 16;

		const bindings = options.keybindings ?? getDefaultKeybindings();
		this.keyResolver = new KeyResolver({
			bindings,
			vimMode: this.state.vimMode,
		});
	}

	public invalidate(): void {
		this.cachedVisibleNodes = null;
		this.tui.requestRender();
	}

	public getVisibleNodes(): DisplayNode[] {
		if (
			this.cachedVisibleNodes === null ||
			this.cachedVersion !== this.state.version
		) {
			this.cachedVisibleNodes = buildDisplayProjection(this.index, this.state);
			this.cachedVersion = this.state.version;
		}
		return this.cachedVisibleNodes;
	}

	public render(width: number): string[] {
		const lines: string[] = [];
		const safeWidth = Math.max(40, width);

		// 1. Help View Overlay
		if (this.state.mode === "help") {
			lines.push(
				truncateToWidth("SESSION TREE EXPLORER - SHORTCUT HELP", safeWidth),
			);
			lines.push("─".repeat(safeWidth));
			lines.push("Navigation:");
			lines.push("  j / Down       Next visible node");
			lines.push("  k / Up         Previous visible node");
			lines.push("  H              Logical parent node");
			lines.push("  L              Logical first child");
			lines.push("  ]b / [b        Next / previous sibling branch");
			lines.push("  gp / gb / ge   Branch parent / root / leaf");
			lines.push("  ]f / [f        Next / previous fork point");
			lines.push("  gg / G         Root / last visible node");
			lines.push("  Tab            Current session leaf");
			lines.push("");
			lines.push("Folding & Filtering:");
			lines.push("  Space / Enter  Toggle folding of selected node");
			lines.push("  l / h          Expand / collapse selected node");
			lines.push("  zR / zM        Expand all / collapse all");
			lines.push(
				"  za / zs / zc   Active only / focused only / collapse siblings",
			);
			lines.push(
				"  z+ / z- / zr   Increase / decrease depth / restore defaults",
			);
			lines.push("");
			lines.push("Controls:");
			lines.push("  ?              Close help");
			lines.push("  q / Esc        Close explorer");
			lines.push("─".repeat(safeWidth));
			lines.push("Press '?' or 'q' to return to tree view.");
			return lines;
		}

		const visibleNodes = this.getVisibleNodes();

		// Selection guard
		if (
			visibleNodes.length > 0 &&
			(!this.state.selectedEntryId ||
				!visibleNodes.some((n) => n.id === this.state.selectedEntryId))
		) {
			this.state.selectedEntryId = visibleNodes[0].id;
		}

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

		// 3. Tree Content Viewport
		if (this.index.entryById.size === 0) {
			lines.push("  (empty session tree)");
			lines.push("─".repeat(safeWidth));
			lines.push("Press 'q' to close.");
			return lines;
		}

		if (visibleNodes.length === 0) {
			lines.push("  (no matching visible entries - check filter settings)");
			lines.push("─".repeat(safeWidth));
			lines.push("Press '?' for help, 'q' to close.");
			return lines;
		}

		const selectedIndex = visibleNodes.findIndex(
			(n) => n.id === this.state.selectedEntryId,
		);
		const viewportHeight = Math.max(5, this.pageSize);

		let start = 0;
		if (selectedIndex >= viewportHeight) {
			start = selectedIndex - Math.floor(viewportHeight / 2);
		}
		const end = Math.min(visibleNodes.length, start + viewportHeight);
		start = Math.max(0, Math.min(start, visibleNodes.length - viewportHeight));

		for (let i = start; i < end; i++) {
			const node = visibleNodes[i];
			const isSel = node.id === this.state.selectedEntryId;
			const isCurrent = node.id === this.state.sessionLeafId;

			let marker = "◇";
			if (node.isVirtualSummary) {
				marker = "▸";
			} else if (this.index.rootIds.includes(node.id)) {
				marker = "●";
			} else if (isCurrent) {
				marker = "◉";
			} else if (node.isCollapsed) {
				marker = "▸";
			} else if (node.isFork) {
				marker = "▾";
			}

			const selPrefix = isSel ? "▶ " : "  ";
			const indent = "  ".repeat(Math.min(10, node.rawDepth));
			const depthStr = `D${node.turnDepth}`;
			const labelTag = node.label ? ` [${node.label}]` : "";

			const prefix = `${selPrefix}${indent}${marker} `;
			const suffix = `  ${depthStr}`;
			const availableTextWidth = Math.max(
				10,
				safeWidth -
					visibleWidth(prefix) -
					visibleWidth(suffix) -
					visibleWidth(labelTag) -
					2,
			);
			const truncatedText = truncateToWidth(
				node.summaryText,
				availableTextWidth,
			);
			const row = `${prefix}${truncatedText}${labelTag}${suffix}`;
			lines.push(truncateToWidth(row, safeWidth));
		}

		lines.push("─".repeat(safeWidth));

		// 4. Details Panel
		const selectedNode = visibleNodes[Math.max(selectedIndex, 0)];
		if (selectedNode) {
			const detailLine1 = `Selected: ${selectedNode.summaryText}`;
			const detailLine2 = selectedNode.isVirtualSummary
				? `Virtual Branch Summary  Descendants: ${selectedNode.virtualDescendantCount ?? 0}  Forks: ${selectedNode.virtualForkCount ?? 0}`
				: `ID: ${selectedNode.id}  RawDepth: ${selectedNode.rawDepth}  Turn: ${selectedNode.turnDepth}  BranchDepth: ${selectedNode.branchDepth}`;
			lines.push(truncateToWidth(detailLine1, safeWidth));
			lines.push(truncateToWidth(detailLine2, safeWidth));
		} else {
			lines.push("No node selected");
			lines.push("");
		}

		// 5. Footer Key Hints
		lines.push("─".repeat(safeWidth));
		const footer =
			"j/k Move  H/L Parent/Child  [b/]b Branch  Space Fold  ? Help  q Close";
		lines.push(truncateToWidth(footer, safeWidth));

		return lines;
	}

	public dispatch(actionId: string): void {
		const action = this.registry.get(actionId);
		if (!action) return;

		const visibleNodes = this.getVisibleNodes();
		const ctx: ActionContext = {
			state: this.state,
			index: this.index,
			visibleNodes,
			close: () => this.done({ type: "close" }),
			pageSize: this.pageSize,
			reproject: () => {
				this.cachedVisibleNodes = null;
				this.cachedVersion = -1;
			},
		};

		if (!action.enabled || action.enabled(this.state, this.index)) {
			action.execute(ctx);
			this.invalidate();
		}
	}

	public handleInput(data: string): void {
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
				if (result.text === "\b") {
					this.state.searchQuery = this.state.searchQuery.slice(0, -1);
				} else {
					this.state.searchQuery += result.text;
				}
				this.invalidate();
			}
		}
	}
}
