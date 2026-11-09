import { describe, expect, it } from "vitest";
import { createActionRegistry } from "../extensions/actions.ts";
import { buildDisplayProjection } from "../extensions/display.ts";
import { createInitialState } from "../extensions/state.ts";
import { buildTreeIndex } from "../extensions/tree-index.ts";
import { SessionTreeComponent } from "../extensions/tui.ts";
import type { ActionContext, SessionEntry } from "../extensions/types.ts";

describe("T0007: Responsive Layouts, Compound States & View Actions", () => {
	function createFixture() {
		const entries: SessionEntry[] = [
			{
				type: "message",
				id: "root",
				parentId: null,
				timestamp: "T0",
				message: { role: "system", content: "System preamble" },
			},
			{
				type: "message",
				id: "user1",
				parentId: "root",
				timestamp: "T1",
				label: "checkpoint-alpha",
				message: {
					role: "user",
					content: "Refactor core authentication logic",
				},
			},
			{
				type: "message",
				id: "asst1",
				parentId: "user1",
				timestamp: "T2",
				message: {
					role: "assistant",
					model: "gpt-4o",
					content: "Completed authentication plan.",
				},
			},
		];

		const index = buildTreeIndex(entries);
		const state = createInitialState("resp-session", {
			selectedEntryId: "user1",
			sessionLeafId: "asst1",
			foldOptions: {
				mode: "all",
				collapseInactiveBranches: false,
				collapseLinearPaths: false,
				rememberManualOverrides: false,
				maxExpandDepth: 0,
			},
			displayOptions: {
				showAssistantNodes: true,
				showToolNodes: true,
				showThinkingNodes: false,
				showMetadataNodes: true,
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
		});

		return { entries, index, state };
	}

	it("adapts layout across terminal widths: >=120, 80-119, <80", () => {
		const { index, state } = createFixture();
		const comp = new SessionTreeComponent({
			tui: { requestRender: () => {} },
			theme: {},
			done: () => {},
			index,
			state,
			activeModel: { id: "gpt-4o", provider: "openai", contextWindow: 128_000 },
			activeUsage: { tokens: 42_000, contextWindow: 128_000, percent: 33 },
		});

		// 1. Wide width (>= 120): includes depth, context tokens/window %, and model
		const wideLines = comp.render(130);
		expect(
			wideLines.some((l) => l.includes("D1") && l.includes("gpt-4o")),
		).toBe(true);

		// 2. Standard width (80-119): includes depth and context tokens, but omits inline model
		const midLines = comp.render(100);
		expect(midLines.some((l) => l.includes("D1"))).toBe(true);

		// 3. Narrow width (< 80): tree row keeps depth, context badge moves to details panel
		const narrowLines = comp.render(70);
		expect(narrowLines.some((l) => l.includes("D1"))).toBe(true);
		expect(narrowLines.some((l) => l.includes("Context:"))).toBe(true);
	});

	it("renders compound states simultaneously: Root ●, Leaf ◉, Selection ▶, Label ★[label]", () => {
		const { index, state } = createFixture();
		state.selectedEntryId = "user1";
		state.sessionLeafId = "asst1";

		const comp = new SessionTreeComponent({
			tui: { requestRender: () => {} },
			theme: {},
			done: () => {},
			index,
			state,
		});

		const lines = comp.render(100);
		// Root marker ●
		expect(
			lines.some((l) => l.includes("●") && l.includes("System preamble")),
		).toBe(true);
		// Selection cursor ▶ on user1
		expect(
			lines.some((l) => l.includes("▶") && l.includes("Refactor core")),
		).toBe(true);
		// Label marker ★[checkpoint-alpha]
		expect(lines.some((l) => l.includes("★[checkpoint-alpha]"))).toBe(true);
		// Leaf marker ◉ on asst1
		expect(
			lines.some(
				(l) => l.includes("◉") && l.includes("Completed authentication"),
			),
		).toBe(true);
	});

	it("executes all 5 view control actions: toggleDetails, toggleContext, cycleDepthMode, cycleLayout, reset", () => {
		const { index, state } = createFixture();
		const visible = buildDisplayProjection(index, state);

		const registry = createActionRegistry();
		const ctx: ActionContext = {
			state,
			index,
			visibleNodes: visible,
			close: () => {},
		};

		// 1. view.toggleDetails ('d')
		expect(state.showDetails).toBe(true);
		registry.get("view.toggleDetails")?.execute(ctx);
		expect(state.showDetails).toBe(false);
		registry.get("view.toggleDetails")?.execute(ctx);
		expect(state.showDetails).toBe(true);

		// 2. view.toggleContext ('c')
		expect(state.showContext).toBe(true);
		registry.get("view.toggleContext")?.execute(ctx);
		expect(state.showContext).toBe(false);
		registry.get("view.toggleContext")?.execute(ctx);
		expect(state.showContext).toBe(true);

		// 3. view.cycleDepthMode ('D'): turn -> raw -> branch -> turn
		expect(state.displayOptions.depthMode).toBe("turn");
		registry.get("view.cycleDepthMode")?.execute(ctx);
		expect(state.displayOptions.depthMode).toBe("raw");
		registry.get("view.cycleDepthMode")?.execute(ctx);
		expect(state.displayOptions.depthMode).toBe("branch");
		registry.get("view.cycleDepthMode")?.execute(ctx);
		expect(state.displayOptions.depthMode).toBe("turn");

		// 4. view.cycleLayout ('C'): normal <-> compact
		expect(state.displayOptions.layout).toBe("normal");
		registry.get("view.cycleLayout")?.execute(ctx);
		expect(state.displayOptions.layout).toBe("compact");
		registry.get("view.cycleLayout")?.execute(ctx);
		expect(state.displayOptions.layout).toBe("normal");

		// 5. view.reset: restores defaults
		state.displayOptions.depthMode = "branch";
		state.displayOptions.layout = "compact";
		state.showDetails = false;
		registry.get("view.reset")?.execute(ctx);

		expect(state.displayOptions.depthMode).toBe("turn");
		expect(state.displayOptions.layout).toBe("normal");
		expect(state.showDetails).toBe(true);
		expect(state.showContext).toBe(true);
	});
});
