import { describe, expect, it, vi } from "vitest";
import { getDefaultConfig } from "../extensions/config-schema.ts";
import { createInitialState } from "../extensions/state.ts";
import { buildTreeIndex } from "../extensions/tree-index.ts";
import { SessionTreeComponent } from "../extensions/tui.ts";

function fixture() {
	const terminal = { rows: 12 },
		done = vi.fn(),
		state = createInitialState("paging", {
			selectedEntryId: "r",
			sessionLeafId: "r",
		});
	const message = {
		role: "user",
		get content() {
			return Array.from({ length: 120 }, (_, i) =>
				i === 119 ? "TAIL_SENTINEL" : `line ${i} 内容😀`,
			).join("\n");
		},
	};
	const read = vi.spyOn(message, "content", "get");
	const component = new SessionTreeComponent({
		state,
		index: buildTreeIndex([
			{ id: "r", parentId: null, type: "message", timestamp: "T0", message },
		]),
		tui: { requestRender() {}, terminal },
		theme: {},
		done,
	});
	return { component, state, terminal, done, read };
}
describe("bounded help and preview inspection", () => {
	it("pages the complete catalog with persistent close hints and bounded height", () => {
		const { component, done, state } = fixture();
		component.handleInput("?");
		const first = component.render(100);
		expect(first.length).toBeLessThanOrEqual(12);
		expect(first.join("\n")).toContain("Close");
		component.handleInput("\u001b[6~");
		expect(component.render(100)).not.toEqual(first);
		component.handleInput("\u001b[F");
		expect(component.render(100).join("\n")).toContain("session.close");
		component.handleInput("\u001b[H");
		expect(component.render(100)).toEqual(first);
		expect(state.selectedEntryId).toBe("r");
		expect(done).not.toHaveBeenCalled();
		component.dispose();
	});
	it("reaches long preview tails, caches wrapping, clamps on resize, and resets on reentry", () => {
		const { component, terminal, read, done, state } = fixture();
		component.handleInput("p");
		expect(component.render(70).length).toBeLessThanOrEqual(12);
		expect(component.render(70).join("\n")).not.toContain("TAIL_SENTINEL");
		read.mockClear();
		component.handleInput("\u001b[F");
		expect(component.render(70).join("\n")).toContain("TAIL_SENTINEL");
		expect(read).not.toHaveBeenCalled();
		terminal.rows = 7;
		expect(component.render(45).length).toBeLessThanOrEqual(7);
		terminal.rows = 1;
		expect(component.render(10).length).toBeLessThanOrEqual(1);
		terminal.rows = 12;
		component.handleInput("p");
		component.handleInput("p");
		component.handleInput("\u001b[H");
		expect(component.render(70).join("\n")).toContain("line 0");
		expect(state.sessionLeafId).toBe("r");
		expect(done).not.toHaveBeenCalled();
		component.dispose();
	});
	it("uses remappable mode-qualified paging Actions instead of an input bypass", () => {
		const { component } = fixture(),
			config = getDefaultConfig();
		config.keybindings["view.pageDown"] = ["f6"];
		component.applyConfiguration(config);
		component.handleInput("?");
		const first = component.render(130);
		component.handleInput("\u001b[6~");
		expect(component.render(130)).toEqual(first);
		component.handleInput("\u001b[17~");
		expect(component.render(130)).not.toEqual(first);
		expect(component.render(130).join("\n")).toContain("f6");
		component.dispose();
	});
	it("renders and pages a multi-megabyte single paragraph without argument overflow", () => {
		const content = `${"x".repeat(2 * 1024 * 1024)}TAIL`;
		const state = createInitialState("large-paragraph", {
				selectedEntryId: "r",
				sessionLeafId: "r",
			}),
			done = vi.fn();
		const component = new SessionTreeComponent({
			state,
			index: buildTreeIndex([
				{
					id: "r",
					parentId: null,
					type: "message",
					timestamp: "T0",
					message: { role: "user", content },
				},
			]),
			tui: { requestRender() {}, terminal: { rows: 12 } },
			theme: {},
			done,
		});
		try {
			component.handleInput("p");
			let first: string[] = [];
			expect(() => {
				first = component.render(8);
			}).not.toThrow();
			expect(first.length).toBeLessThanOrEqual(12);
			component.handleInput("\u001b[F");
			expect(component.render(8).join("\n")).toContain("TAIL");
			expect(state.sessionLeafId).toBe("r");
			expect(done).not.toHaveBeenCalled();
		} finally {
			component.dispose();
		}
	}, 20000);
});
