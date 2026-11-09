import { describe, expect, it, vi } from "vitest";
import { getDefaultKeybindings } from "../extensions/actions.ts";
import { KeyResolver, validateKeymap } from "../extensions/keymap.ts";

describe("T0002: Keymap, Multi-Key Sequences & Mode Transitions", () => {
	it("resolves single keys immediately", () => {
		const resolver = new KeyResolver({
			bindings: {
				"node.next": ["j"],
				"node.prev": ["k"],
				"session.close": ["q"],
			},
			vimMode: true,
		});

		expect(resolver.handleInput("j", "normal")).toEqual({
			type: "action",
			actionId: "node.next",
		});
		expect(resolver.handleInput("k", "normal")).toEqual({
			type: "action",
			actionId: "node.prev",
		});
		expect(resolver.handleInput("q", "normal")).toEqual({
			type: "action",
			actionId: "session.close",
		});
	});

	it("resolves multi-key sequences with prefixes (]b, [b, gp, gb, ge, zR, zM)", () => {
		const resolver = new KeyResolver({
			bindings: {
				"branch.next": ["]b"],
				"branch.prev": ["[b"],
				"branch.parent": ["gp"],
				"branch.root": ["gb"],
				"branch.leaf": ["ge"],
				"fold.expandAll": ["zR"],
				"fold.collapseAll": ["zM"],
			},
			vimMode: true,
		});

		// Test ]b
		expect(resolver.handleInput("]", "normal")).toEqual({ type: "prefix" });
		expect(resolver.handleInput("b", "normal")).toEqual({
			type: "action",
			actionId: "branch.next",
		});

		// Test [b
		expect(resolver.handleInput("[", "normal")).toEqual({ type: "prefix" });
		expect(resolver.handleInput("b", "normal")).toEqual({
			type: "action",
			actionId: "branch.prev",
		});

		// Test gp
		expect(resolver.handleInput("g", "normal")).toEqual({ type: "prefix" });
		expect(resolver.handleInput("p", "normal")).toEqual({
			type: "action",
			actionId: "branch.parent",
		});

		// Test zR
		expect(resolver.handleInput("z", "normal")).toEqual({ type: "prefix" });
		expect(resolver.handleInput("R", "normal")).toEqual({
			type: "action",
			actionId: "fold.expandAll",
		});
	});

	it("handles prefix ambiguity with timeout callback (e.g. g vs gg)", () => {
		vi.useFakeTimers();

		let timeoutResolvedAction = "";
		const resolver = new KeyResolver({
			bindings: {
				"single.g": ["g"],
				"double.gg": ["gg"],
			},
			vimMode: true,
			timeoutMs: 500,
		});

		// Typing 'g': since 'g' is both an action and prefix of 'gg', returns prefix and starts timer
		const res = resolver.handleInput("g", "normal", (action) => {
			timeoutResolvedAction = action;
		});
		expect(res).toEqual({ type: "prefix" });

		// Advance timer past 500ms without second key -> resolves to 'single.g'!
		vi.advanceTimersByTime(600);
		expect(timeoutResolvedAction).toBe("single.g");

		vi.useRealTimers();
	});

	it("detects duplicate and conflicting keybindings via validateKeymap", () => {
		const badBindings = {
			"action.one": ["j", "down"],
			"action.two": ["j"], // Duplicate 'j'!
			"action.three": ["g"], // Prefix conflict with 'gg'!
			"action.four": ["gg"],
		};

		const diagnostics = validateKeymap(badBindings);
		expect(diagnostics.some((d) => d.type === "duplicate")).toBe(true);
		expect(diagnostics.some((d) => d.type === "conflict")).toBe(true);
	});

	it("handles search mode: j/k type text, arrows/Ctrl+n/p move, Enter accepts, Esc clears", () => {
		const resolver = new KeyResolver({
			bindings: getDefaultKeybindings(),
			vimMode: true,
		});

		// In search mode, j and k are text!
		expect(resolver.handleInput("j", "search")).toEqual({
			type: "text",
			text: "j",
		});
		expect(resolver.handleInput("k", "search")).toEqual({
			type: "text",
			text: "k",
		});
		expect(resolver.handleInput("a", "search")).toEqual({
			type: "text",
			text: "a",
		});

		// Navigation in search mode
		expect(resolver.handleInput("\u001b[B", "search")).toEqual({
			type: "action",
			actionId: "search.next",
		});
		expect(resolver.handleInput("\u000e", "search")).toEqual({
			type: "action",
			actionId: "search.next",
		});
		expect(resolver.handleInput("\u001b[A", "search")).toEqual({
			type: "action",
			actionId: "search.prev",
		});
		expect(resolver.handleInput("\u0010", "search")).toEqual({
			type: "action",
			actionId: "search.prev",
		});

		// Enter accepts without navigating
		expect(resolver.handleInput("\r", "search")).toEqual({
			type: "action",
			actionId: "search.accept",
		});

		// Esc clears / exits search
		expect(resolver.handleInput("\u001b", "search")).toEqual({
			type: "action",
			actionId: "search.clear",
		});
	});

	it("supports non-Vim mode (vimMode = false): arrow keys navigate, single letters do not", () => {
		const resolver = new KeyResolver({
			bindings: getDefaultKeybindings(),
			vimMode: false,
		});

		// In non-Vim mode, 'j' and 'k' do NOT navigate
		expect(resolver.handleInput("j", "normal")).toEqual({
			type: "unmatched",
			data: "j",
		});
		expect(resolver.handleInput("k", "normal")).toEqual({
			type: "unmatched",
			data: "k",
		});

		// Arrow keys navigate
		expect(resolver.handleInput("[B", "normal")).toEqual({
			type: "action",
			actionId: "node.next",
		});
		expect(resolver.handleInput("[A", "normal")).toEqual({
			type: "action",
			actionId: "node.prev",
		});
		expect(resolver.handleInput("[D", "normal")).toEqual({
			type: "action",
			actionId: "node.parent",
		});
		expect(resolver.handleInput("[C", "normal")).toEqual({
			type: "action",
			actionId: "node.firstChild",
		});

		// Space or Enter folds
		expect(resolver.handleInput(" ", "normal")).toEqual({
			type: "action",
			actionId: "fold.toggle",
		});
	});
});
