import {
	Key,
	matchesKey,
	truncateToWidth,
	visibleWidth,
} from "@earendil-works/pi-tui";
import { createActionRegistry } from "./actions.ts";
import { buildDisplayProjection } from "./display.ts";
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
	pageSize?: number;
}

export class SessionTreeComponent {
	private tui: { requestRender: () => void };
	private done: (result: ExplorerResult) => void;
	private index: TreeIndex;
	private state: ExplorerState;
	private registry: Map<string, ActionDefinition>;
	private pageSize: number;
	private keyBuffer = "";
	private keyTimeout: NodeJS.Timeout | null = null;

	constructor(options: SessionTreeComponentOptions) {
		this.tui = options.tui;
		this.done = options.done;
		this.index = options.index;
		this.state = options.state;
		this.registry = options.registry ?? createActionRegistry();
		this.pageSize = options.pageSize ?? 16;
	}

	public invalidate(): void {
		this.tui.requestRender();
	}

	public getVisibleNodes(): DisplayNode[] {
		return buildDisplayProjection(this.index, this.state);
	}

	public render(width: number): string[] {
		const lines: string[] = [];
		const safeWidth = Math.max(40, width);
		const visibleNodes = this.getVisibleNodes();

		// Ensure valid selection
		if (
			visibleNodes.length > 0 &&
			(!this.state.selectedEntryId ||
				!visibleNodes.some((n) => n.id === this.state.selectedEntryId))
		) {
			this.state.selectedEntryId = visibleNodes[0].id;
		}

		// 1. Header
		const entryCount = this.index.entryById.size;
		const forkCount = this.index.forkPointIds.size;
		const sessionDisplay = this.state.sessionId.slice(0, 16);
		const headerLeft = "SESSION TREE EXPLORER [NORMAL]";
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

		// 2. Tree content viewport
		if (visibleNodes.length === 0) {
			lines.push("  (empty session tree)");
			lines.push("─".repeat(safeWidth));
			lines.push("Press 'q' to close.");
			return lines;
		}

		// Scroll calculation
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
			if (this.index.rootIds.includes(node.id)) {
				marker = "●";
			} else if (isCurrent) {
				marker = "◉";
			} else if (node.isFork) {
				marker = "▾";
			}

			const selPrefix = isSel ? "▶ " : "  ";
			const indent = "  ".repeat(Math.min(10, node.rawDepth));
			const depthStr = `D${node.turnDepth}`;
			const labelTag = node.label ? ` [${node.label}]` : "";

			// Assemble row
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

		// 3. Selection detail panel
		const selectedNode = visibleNodes[Math.max(selectedIndex, 0)];
		if (selectedNode) {
			const detailLine1 = `Selected: ${selectedNode.summaryText}`;
			const detailLine2 = `ID: ${selectedNode.id}  RawDepth: ${selectedNode.rawDepth}  Turn: ${selectedNode.turnDepth}  BranchDepth: ${selectedNode.branchDepth}`;
			lines.push(truncateToWidth(detailLine1, safeWidth));
			lines.push(truncateToWidth(detailLine2, safeWidth));
		} else {
			lines.push("No node selected");
			lines.push("");
		}

		// 4. Footer key hints
		lines.push("─".repeat(safeWidth));
		const footer =
			"j/k Move  H Parent  L Child  [b/]b Branch  gp Fork  gb Root  ge Leaf  q Close";
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
		};

		if (!action.enabled || action.enabled(this.state, this.index)) {
			action.execute(ctx);
			this.tui.requestRender();
		}
	}

	public handleInput(data: string): void {
		// Single-key immediate matches
		if (matchesKey(data, Key.escape) || data === "q") {
			this.dispatch("session.close");
			return;
		}

		if (matchesKey(data, Key.down) || data === "j") {
			this.dispatch("node.next");
			return;
		}

		if (matchesKey(data, Key.up) || data === "k") {
			this.dispatch("node.prev");
			return;
		}

		if (data === "H") {
			this.dispatch("node.parent");
			return;
		}

		if (data === "L") {
			this.dispatch("node.firstChild");
			return;
		}

		if (data === "G") {
			this.dispatch("node.last");
			return;
		}

		if (matchesKey(data, Key.tab) || data === "\t") {
			this.dispatch("node.current");
			return;
		}

		// Multi-key handling
		if (this.keyBuffer.length > 0) {
			const seq = this.keyBuffer + data;
			this.keyBuffer = "";
			if (this.keyTimeout) {
				clearTimeout(this.keyTimeout);
				this.keyTimeout = null;
			}

			if (seq === "]b") {
				this.dispatch("branch.next");
			} else if (seq === "[b") {
				this.dispatch("branch.prev");
			} else if (seq === "gp") {
				this.dispatch("branch.parent");
			} else if (seq === "gb") {
				this.dispatch("branch.root");
			} else if (seq === "ge") {
				this.dispatch("branch.leaf");
			} else if (seq === "gg") {
				this.dispatch("node.root");
			} else if (seq === "gL") {
				this.dispatch("node.lastChild");
			} else if (seq === "gs") {
				this.dispatch("node.firstSibling");
			} else if (seq === "g[") {
				this.dispatch("branch.first");
			} else if (seq === "g]") {
				this.dispatch("branch.last");
			} else if (seq === "ga") {
				this.dispatch("branch.active");
			} else if (seq === "]s") {
				this.dispatch("node.nextSibling");
			} else if (seq === "[s") {
				this.dispatch("node.prevSibling");
			} else if (seq === "]f") {
				this.dispatch("branch.nextFork");
			} else if (seq === "[f") {
				this.dispatch("branch.prevFork");
			} else if (seq === "]m") {
				this.dispatch("node.nextLabel");
			} else if (seq === "[m") {
				this.dispatch("node.prevLabel");
			} else if (seq === "]u") {
				this.dispatch("node.nextUser");
			} else if (seq === "[u") {
				this.dispatch("node.prevUser");
			} else if (seq === "]l") {
				this.dispatch("branch.nextLeaf");
			} else if (seq === "[l") {
				this.dispatch("branch.prevLeaf");
			}
			return;
		}

		// Prefix initiation
		if (data === "]" || data === "[" || data === "g") {
			this.keyBuffer = data;
			this.keyTimeout = setTimeout(() => {
				this.keyBuffer = "";
				this.keyTimeout = null;
			}, 800);
			return;
		}
	}
}
