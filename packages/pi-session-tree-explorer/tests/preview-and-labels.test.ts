import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createActionRegistry } from "../extensions/actions.ts";
import { setClipboardWriter } from "../extensions/clipboard.ts";
import { buildDisplayProjection } from "../extensions/display.ts";
import { createInitialState } from "../extensions/state.ts";
import { buildTreeIndex } from "../extensions/tree-index.ts";
import { SessionTreeComponent } from "../extensions/tui.ts";
import type { ActionContext, SessionEntry } from "../extensions/types.ts";

describe("T0004: Preview, Clipboard Copy & Label Metadata", () => {
	beforeEach(() => {
		setClipboardWriter(() => ({ success: true }));
	});

	afterEach(() => {
		setClipboardWriter(null);
	});

	function createFixture() {
		const longText =
			"Line 1: Detailed specification analysis\nLine 2: Architectural invariants\nLine 3: Implementation plan";

		const entries: SessionEntry[] = [
			{
				type: "message",
				id: "node1",
				parentId: null,
				timestamp: "2026-11-09T10:00:00Z",
				label: "existing-label",
				message: { role: "user", content: longText },
			},
			{
				type: "message",
				id: "node2",
				parentId: "node1",
				timestamp: "2026-11-09T10:01:00Z",
				message: {
					role: "assistant",
					model: "gpt-4o",
					content: "Completed implementation plan successfully.",
				},
			},
		];

		const index = buildTreeIndex(entries);
		const state = createInitialState("test-preview-labels", {
			selectedEntryId: "node1",
			foldOptions: {
				mode: "all",
				collapseInactiveBranches: false,
				collapseLinearPaths: false,
				rememberManualOverrides: false,
				maxExpandDepth: 0,
			},
		});

		return { entries, index, state };
	}

	it("toggles preview mode and renders complete full text without truncation", () => {
		const { index, state } = createFixture();
		const visible = buildDisplayProjection(index, state);

		const registry = createActionRegistry();
		const ctx: ActionContext = {
			state,
			index,
			visibleNodes: visible,
			close: () => {},
		};

		// 1. Enter preview mode via session.preview ('p')
		registry.get("session.preview")?.execute(ctx);
		expect(state.mode).toBe("preview");
		expect(state.previewNodeId).toBe("node1");

		// 2. Render preview in TUI component
		const comp = new SessionTreeComponent({
			tui: { requestRender: () => {} },
			theme: {},
			done: () => {},
			index,
			state,
			registry,
		});

		const lines = comp.render(80);
		expect(
			lines.some((l) => l.includes("SESSION TREE EXPLORER - PREVIEW")),
		).toBe(true);
		expect(
			lines.some((l) => l.includes("Line 1: Detailed specification analysis")),
		).toBe(true);
		expect(
			lines.some((l) => l.includes("Line 2: Architectural invariants")),
		).toBe(true);
		expect(lines.some((l) => l.includes("Line 3: Implementation plan"))).toBe(
			true,
		);

		// 3. Exit preview mode via 'p'
		comp.handleInput("p");
		expect(state.mode).toBe("normal");

		// 4. Enter preview again and exit via Esc
		comp.handleInput("p");
		expect(state.mode).toBe("preview");
		comp.handleInput("\u001b"); // Esc exits preview
		expect(state.mode).toBe("normal");
	});

	it("copies real Entry ID and content, but refuses virtual summaries", () => {
		const { index, state } = createFixture();
		const visible = buildDisplayProjection(index, state);

		let notifiedMessage = "";
		const registry = createActionRegistry();
		const ctx: ActionContext = {
			state,
			index,
			visibleNodes: visible,
			close: () => {},
			notify: (msg) => {
				notifiedMessage = msg;
			},
		};

		// Real entry copyId
		state.selectedEntryId = "node1";
		registry.get("session.copyId")?.execute(ctx);
		expect(notifiedMessage).toContain("Copied Entry ID: node1");

		// Real entry copyContent
		registry.get("session.copyContent")?.execute(ctx);
		expect(notifiedMessage).toContain("Copied node content");

		// Virtual summary refusal
		state.selectedEntryId = "virtual:branch:dummy";
		registry.get("session.copyId")?.execute(ctx);
		expect(notifiedMessage).toContain("Cannot copy virtual branch summary ID");

		registry.get("session.copyContent")?.execute(ctx);
		expect(notifiedMessage).toContain(
			"Cannot copy virtual branch summary content",
		);
	});

	it("sets, edits, and clears entry labels using host label callback", async () => {
		const { index, state } = createFixture();
		const visible = buildDisplayProjection(index, state);

		let hostLabeledId = "";
		let hostLabelVal: string | undefined = "";

		const registry = createActionRegistry();
		const ctx: ActionContext = {
			state,
			index,
			visibleNodes: visible,
			close: () => {},
			setLabel: async (id, val) => {
				hostLabeledId = id;
				hostLabelVal = val;
			},
		};

		// 1. Clear existing label on node1
		state.selectedEntryId = "node1";
		expect(index.displayLabelsById.get("node1")).toBe("existing-label");

		await registry.get("session.setLabel")?.execute(ctx);
		expect(hostLabeledId).toBe("node1");
		expect(hostLabelVal).toBeUndefined();
		expect(index.displayLabelsById.get("node1")).toBeUndefined();

		// 2. Set new label on node1
		await registry.get("session.setLabel")?.execute(ctx);
		expect(hostLabeledId).toBe("node1");
		expect(hostLabelVal).toBe("bookmark");
		expect(index.entryById.get("node1")?.label).toBe("existing-label");
		expect(index.displayLabelsById.get("node1")).toBe("bookmark");

		// 3. Virtual summary cannot be labeled
		state.selectedEntryId = "virtual:branch:x";
		let virtualError = "";
		ctx.notify = (msg) => {
			virtualError = msg;
		};
		await registry.get("session.setLabel")?.execute(ctx);
		expect(virtualError).toContain("Cannot label virtual branch summary");
	});

	it("invokes refresh callback on session.refresh", async () => {
		const { index, state } = createFixture();
		const visible = buildDisplayProjection(index, state);

		let refreshCalled = false;
		const registry = createActionRegistry();
		const ctx: ActionContext = {
			state,
			index,
			visibleNodes: visible,
			close: () => {},
			refresh: async () => {
				refreshCalled = true;
			},
		};

		await registry.get("session.refresh")?.execute(ctx);
		expect(refreshCalled).toBe(true);
	});
});
