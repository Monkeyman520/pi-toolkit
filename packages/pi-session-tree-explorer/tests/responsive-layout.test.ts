import { visibleWidth } from "@earendil-works/pi-tui";
import { describe, expect, it } from "vitest";
import { createInitialState } from "../extensions/state.ts";
import { buildTreeIndex } from "../extensions/tree-index.ts";
import { SessionTreeComponent } from "../extensions/tui.ts";
import type { SessionEntry } from "../extensions/types.ts";
import { computeResponsiveLayout, renderDualPane } from "../extensions/ui.ts";

function buildLayoutFixture(): SessionEntry[] {
	return [
		{
			type: "message",
			id: "u1",
			parentId: null,
			timestamp: "T0",
			message: { role: "user", content: "Optimize database access layer" },
		},
		{
			type: "message",
			id: "a1",
			parentId: "u1",
			timestamp: "T1",
			message: {
				role: "assistant",
				model: "claude-sonnet-4-5",
				content: "Analyzing repository ORM and connection pooling.",
			},
		},
		{
			type: "message",
			id: "tc1",
			parentId: "a1",
			timestamp: "T2",
			message: {
				role: "assistant",
				content: [
					{
						type: "toolCall",
						name: "read",
						arguments: { path: "src/db/client.ts" },
					},
				],
			},
		},
		{
			type: "message",
			id: "tr1",
			parentId: "tc1",
			timestamp: "T3",
			message: {
				role: "toolResult",
				toolName: "read",
				content: "export const pool = createPool();",
				isError: false,
			},
		},
		{
			type: "message",
			id: "tr2",
			parentId: "tr1",
			timestamp: "T4",
			message: {
				role: "toolResult",
				toolName: "bash",
				content: "All 14 db tests passed",
				isError: false,
			},
		},
		{
			type: "message",
			id: "a2",
			parentId: "tr2",
			timestamp: "T5",
			message: {
				role: "assistant",
				model: "claude-sonnet-4-5",
				content: "Database layer refactor complete and verified.",
			},
		},
	];
}

describe("T0004: Responsive Dual-Pane (Outline + Preview) Layout", () => {
	it("computes 60/40 split for >= 100 columns and single-pane fallback for < 100 columns", () => {
		const wide = computeResponsiveLayout(120);
		expect(wide.mode).toBe("dual-pane");
		expect(wide.outlineWidth).toBe(72);
		expect(wide.previewWidth).toBe(47);
		expect(wide.outlineWidth + 1 + wide.previewWidth).toBe(120);

		const boundary = computeResponsiveLayout(100);
		expect(boundary.mode).toBe("dual-pane");
		expect(boundary.outlineWidth).toBe(60);
		expect(boundary.previewWidth).toBe(39);

		const narrow = computeResponsiveLayout(99);
		expect(narrow.mode).toBe("single-pane");
		expect(narrow.outlineWidth).toBe(99);

		const combined = renderDualPane(["left"], ["right"], boundary);
		expect(combined.length).toBe(1);
		expect(visibleWidth(combined[0])).toBe(100);
		expect(combined[0]).toContain("│");
	});

	it("renders dual-pane Outline + live Preview on >= 100 columns and updates Preview on cursor move", () => {
		const index = buildTreeIndex(buildLayoutFixture());
		const state = createInitialState("dual-pane-sess", {
			selectedEntryId: "u1",
			sessionLeafId: "a2",
			displayOptions: {
				showAssistantNodes: true,
				showToolNodes: true,
				showThinkingNodes: false,
				showMetadataNodes: false,
				showCompactionNodes: true,
				userOnly: false,
				branchOnly: false,
				labeledOnly: false,
				depthMode: "turn",
				showDepth: true,
				maxMessageLength: 80,
				showNodeId: false,
				showTimestamps: false,
				layout: "normal",
			},
			foldOptions: {
				mode: "all",
				collapseInactiveBranches: false,
				collapseLinearPaths: false,
				rememberManualOverrides: true,
				maxExpandDepth: 0,
			},
		});

		const comp = new SessionTreeComponent({
			tui: { requestRender() {}, terminal: { rows: 30, columns: 120 } },
			theme: {},
			done: () => {},
			index,
			state,
		});

		const initialLines = comp.render(120);
		expect(initialLines.every((l) => visibleWidth(l) <= 120)).toBe(true);
		const initialJoined = initialLines.join("\n");
		expect(initialJoined).toContain("│NODE PREVIEW");
		expect(initialJoined).toContain("Optimize database access layer");
		expect(initialJoined).toContain("[USER]");

		// Move cursor to assistant a1 -> Preview updates immediately
		comp.handleInput("j");
		const afterA1 = comp.render(120).join("\n");
		expect(afterA1).toContain("[ASSISTANT]");
		expect(afterA1).toContain("Analyzing repository ORM");

		// Move cursor to aggregated tool group -> Preview displays tool group breakdown
		comp.handleInput("j");
		const afterTools = comp.render(120).join("\n");
		expect(afterTools).toContain("[TOOL GROUP]");
		expect(afterTools).toContain("read, bash");
		expect(afterTools).toContain("All 14 db tests passed");
		comp.dispose();
	});

	it("falls back to single-column Outline on < 100 columns with Tab/p modal preview and handles resize", () => {
		const index = buildTreeIndex(buildLayoutFixture());
		const state = createInitialState("narrow-sess", {
			selectedEntryId: "a2",
			sessionLeafId: "a2",
			displayOptions: {
				showAssistantNodes: true,
				showToolNodes: true,
				showThinkingNodes: false,
				showMetadataNodes: false,
				showCompactionNodes: true,
				userOnly: false,
				branchOnly: false,
				labeledOnly: false,
				depthMode: "turn",
				showDepth: true,
				maxMessageLength: 80,
				showNodeId: false,
				showTimestamps: false,
				layout: "normal",
			},
			foldOptions: {
				mode: "all",
				collapseInactiveBranches: false,
				collapseLinearPaths: false,
				rememberManualOverrides: true,
				maxExpandDepth: 0,
			},
		});

		const comp = new SessionTreeComponent({
			tui: { requestRender() {}, terminal: { rows: 24, columns: 80 } },
			theme: {},
			done: () => {},
			index,
			state,
		});

		// Narrow (<100): single-column Outline without dual-pane divider
		const narrowLines = comp.render(80);
		expect(narrowLines.every((l) => visibleWidth(l) <= 80)).toBe(true);
		expect(narrowLines.join("\n")).not.toContain("│NODE PREVIEW");

		// Tab opens modal preview overlay; Esc returns to Outline
		comp.handleInput("\t");
		expect(state.mode).toBe("preview");
		const modalLines = comp.render(80);
		expect(modalLines.join("\n")).toContain("SESSION TREE EXPLORER - PREVIEW");
		expect(modalLines.join("\n")).toContain("Branch tip");
		expect(modalLines.join("\n")).toContain("Database layer refactor complete");
		comp.handleInput("\u001b");
		expect(state.mode).toBe("normal");

		// Dynamic resize from 80 -> 120 switches to dual-pane, then back to 75 -> single-pane cleanly
		const wideLines = comp.render(120);
		expect(wideLines.every((l) => visibleWidth(l) <= 120)).toBe(true);
		expect(wideLines.join("\n")).toContain("│NODE PREVIEW");

		const ultraNarrowLines = comp.render(75);
		expect(ultraNarrowLines.every((l) => visibleWidth(l) <= 75)).toBe(true);
		expect(ultraNarrowLines.join("\n")).not.toContain("│NODE PREVIEW");
		comp.dispose();
	});
});
