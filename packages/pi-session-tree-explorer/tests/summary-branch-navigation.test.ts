import { describe, expect, it, vi } from "vitest";
import { getDefaultConfig } from "../extensions/config-schema.ts";
import { createInitialState } from "../extensions/state.ts";
import { buildTreeIndex } from "../extensions/tree-index.ts";
import { SessionTreeComponent } from "../extensions/tui.ts";

function fixture(
	focus: "always" | "never" | "branch-actions" = "branch-actions",
	reveal = true,
) {
	const parents = [
		["r", null],
		["a", "r"],
		["aa", "a"],
		["b", "r"],
		["b1", "b"],
		["b2", "b"],
		["c", "r"],
		["c1", "c"],
		["c2", "c"],
	] as const;
	const index = buildTreeIndex(
		parents.map(([id, parentId]) => ({
			id,
			parentId,
			type: "message",
			timestamp: "T0",
			message: { role: "user", content: id },
		})),
	);
	const state = createInitialState("summary-branch", {
			selectedEntryId: "a",
			focusedBranchId: "a",
			focusedPathIds: new Set(["r", "a", "aa"]),
			sessionLeafId: "aa",
		}),
		done = vi.fn(),
		config = getDefaultConfig();
	config.context.enabled = false;
	config.navigation.focusFollowsSelection = focus;
	config.navigation.autoRevealTarget = reveal;
	config.keybindings["branch.cycle"] = ["f6"];
	const component = new SessionTreeComponent({
		state,
		index,
		config,
		tui: { requestRender() {} },
		theme: {},
		done,
	});
	return { state, index, component, done };
}
function selectSummary(component: SessionTreeComponent) {
	const row = component.getVisibleNodes().find((n) => n.anchorEntryId === "b");
	expect(row?.isVirtual).toBe(true);
	component.handleInput("j");
	component.handleInput("j");
	return row?.id;
}
describe("branch input from projected summaries", () => {
	it.each([
		["next", ["]", "b"], "c"],
		["prev", ["[", "b"], "a"],
		["parent", ["g", "p"], "r"],
		["root", ["g", "b"], "b"],
		["leaf", ["g", "e"], "b2"],
		["first", ["g", "["], "a"],
		["last", ["g", "]"], "c"],
		["nextFork", ["]", "f"], "c"],
		["prevFork", ["[", "f"], "r"],
		["active", ["g", "a"], "aa"],
		["nextLeaf", ["]", "l"], "b1"],
		["prevLeaf", ["[", "l"], "b"],
		["cycle", ["\u001b[17~"], "c"],
	])(
		"%s resolves the explicit raw anchor before traversal",
		(_name, inputs, expected) => {
			const { state, index, component, done } = fixture();
			try {
				const summary = selectSummary(component);
				expect(state.selectedEntryId).toBe(summary);
				for (const input of inputs) component.handleInput(input);
				expect(state.selectedEntryId).toBe(expected);
				expect(index.entryById.has(state.focusedBranchId ?? "")).toBe(true);
				expect(
					[...state.focusedPathIds].every((id) => index.entryById.has(id)),
				).toBe(true);
				component.render(100);
				expect(state.selectedEntryId).toBe(expected);
				expect(done).not.toHaveBeenCalled();
			} finally {
				component.dispose();
			}
		},
	);
	it("projects a raw destination back to a summary when auto-reveal and focus-follow are disabled", () => {
		const { state, index, component, done } = fixture("never", false);
		try {
			expect(state.selectedEntryId).toBe("a");
			const summary = selectSummary(component);
			expect(state.selectedEntryId).toBe(summary);
			component.handleInput("]");
			component.handleInput("b");
			expect(
				component.getVisibleNodes().find((n) => n.id === state.selectedEntryId)
					?.anchorEntryId,
			).toBe("c");
			expect(state.focusedBranchId).toBe("a");
			expect(
				[...state.focusedPathIds].every((id) => index.entryById.has(id)),
			).toBe(true);
			expect(state.temporaryRevealedIds.size).toBe(0);
			expect(done).not.toHaveBeenCalled();
		} finally {
			component.dispose();
		}
	});
	it("keeps focus real when ordinary row movement selects a summary with always-follow enabled", () => {
		const { state, index, component } = fixture("always");
		try {
			selectSummary(component);
			expect(state.focusedBranchId).toBe("b");
			expect(
				[...state.focusedPathIds].every((id) => index.entryById.has(id)),
			).toBe(true);
			expect(state.selectedEntryId).toBe("b");
		} finally {
			component.dispose();
		}
	});
	it("collapses raw siblings from the explicit summary anchor", () => {
		const { state, index, component } = fixture();
		try {
			selectSummary(component);
			component.handleInput("z");
			component.handleInput("c");
			expect([...state.manualCollapsedIds].sort()).toEqual(["a", "c"]);
			expect(
				[...state.manualCollapsedIds].every((id) => index.entryById.has(id)),
			).toBe(true);
		} finally {
			component.dispose();
		}
	});
	it("finds the owning Root from a summary in a later root group", () => {
		const { state, index, component } = fixture();
		component.dispose();
		const forest = buildTreeIndex([
			{
				id: "earlier",
				parentId: null,
				type: "message",
				timestamp: "T0",
				message: { role: "user", content: "earlier" },
			},
			...index.entryById.values(),
		]);
		const view = new SessionTreeComponent({
			state,
			index: forest,
			tui: { requestRender() {} },
			theme: {},
			done() {},
		});
		try {
			const summary = selectSummary(view);
			expect(state.selectedEntryId).toBe(summary);
			view.handleInput("g");
			view.handleInput("g");
			expect(state.selectedEntryId).toBe("r");
		} finally {
			view.dispose();
		}
	});
});
