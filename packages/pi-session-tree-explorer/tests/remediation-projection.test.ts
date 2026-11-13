import { describe, expect, it } from "vitest";
import { buildDisplayProjection } from "../extensions/display.ts";
import { navNodeFirstChild, navNodeParent } from "../extensions/navigation.ts";
import { createInitialState } from "../extensions/state.ts";
import { buildTreeIndex } from "../extensions/tree-index.ts";
import { SessionTreeComponent } from "../extensions/tui.ts";

function fixture() {
	const index = buildTreeIndex([
		{
			id: "r",
			parentId: null,
			type: "message",
			timestamp: "T0",
			message: { role: "user", content: "r" },
		},
		{
			id: "a",
			parentId: "r",
			type: "message",
			timestamp: "T1",
			message: { role: "assistant", content: "a" },
		},
		{
			id: "b",
			parentId: "r",
			type: "message",
			timestamp: "T2",
			message: { role: "assistant", content: "b" },
		},
		{
			id: "au",
			parentId: "a",
			type: "message",
			timestamp: "T3",
			message: { role: "user", content: "au" },
		},
		{
			id: "bu",
			parentId: "b",
			type: "message",
			timestamp: "T4",
			message: { role: "user", content: "bu" },
		},
	]);
	const state = createInitialState("projection", {
		selectedEntryId: "au",
		focusedPathIds: new Set(["r", "a", "au"]),
	});
	const component = new SessionTreeComponent({
		state,
		index,
		tui: { requestRender() {} },
		theme: {},
		done() {},
	});
	return { index, state, component };
}
describe("remediation: projection navigation", () => {
	it("navigates virtual rows using their logical ancestry", () => {
		const { index, state } = fixture();
		state.displayOptions.showAssistantNodes = true;
		const nodes = buildDisplayProjection(index, state);
		expect(navNodeParent("virtual:branch:b", nodes, index)).toBe("r");
		expect(navNodeFirstChild("r", nodes, index)).toBe("a");
		expect(nodes.map((n) => n.id)).toEqual([
			"r",
			"a",
			"au",
			"virtual:branch:b",
		]);
	});
	it("preserves a hidden raw branch choice before and after render", () => {
		const { state, component } = fixture();
		component.handleInput("]");
		component.handleInput("b");
		expect(state.selectedEntryId).toBe("b");
		const version = state.version;
		component.render(100);
		expect(state.selectedEntryId).toBe("b");
		expect(state.version).toBe(version);
		expect(component.getVisibleNodes().some((n) => n.realId === "b")).toBe(
			true,
		);
	});
	it("expands a hidden virtual branch without creating a sticky search reveal", () => {
		const { state, component } = fixture();
		state.displayOptions.showAssistantNodes = true;
		state.selectedEntryId = "virtual:branch:b";
		component.handleInput("\r");
		expect(state.manualExpandedIds.has("b")).toBe(true);
		expect(state.temporaryRevealedIds.size).toBe(0);
		component.handleInput("h");
		expect(
			component.getVisibleNodes().find((n) => n.anchorEntryId === "b")
				?.isCollapsed,
		).toBe(true);
		component.dispose();
	});
});
