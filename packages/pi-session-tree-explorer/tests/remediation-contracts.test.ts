import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { Check } from "typebox/value";
import { describe, expect, it, vi } from "vitest";
import {
	getDefaultConfig,
	SessionTreeConfigSchema,
} from "../extensions/config-schema.ts";
import { resolveDisplayTarget } from "../extensions/display.ts";
import { executeSessionIntent } from "../extensions/session-effects.ts";
import { createInitialState } from "../extensions/state.ts";
import { buildTreeIndex } from "../extensions/tree-index.ts";
import { SessionTreeComponent } from "../extensions/tui.ts";

describe("approved U4 contracts", () => {
	for (const config of [
		{ session: { forkPosition: "before" } },
		{ navigation: { skipHiddenNodes: false } },
		{ search: { preserveFoldState: false } },
	])
		it(`rejects conflicting configuration ${JSON.stringify(config)}`, () =>
			expect(Check(SessionTreeConfigSchema, config)).toBe(false));
	it("expands a compressed linear path into its real rows without a session intent", () => {
		const entries = ["r", "a", "b", "d", "c"].map((id, i) => ({
			id,
			parentId: i ? ["r", "a", "b", "d"][i - 1] : null,
			type: "message",
			timestamp: "T0",
			message: {
				role: i === 0 || id === "c" ? "user" : "assistant",
				content: id,
			},
		}));
		const state = createInitialState("linear", {
			selectedEntryId: "r",
			sessionLeafId: "c",
		});
		state.displayOptions.showAssistantNodes = true;
		state.foldOptions.collapseLinearPaths = true;
		const index = buildTreeIndex(entries),
			done = vi.fn();
		const component = new SessionTreeComponent({
			state,
			index,
			done,
			tui: { requestRender() {} },
			theme: {},
		});
		const nodes = component.getVisibleNodes();
		const summary = nodes.find((n) => n.kind === "compressed_path");
		expect(summary?.anchorEntryId).toBe("a");
		expect(nodes.filter((n) => n.realId).map((n) => n.realId)).toEqual([
			"r",
			"c",
		]);
		component.handleInput("j");
		component.handleInput("\r");
		expect(done).not.toHaveBeenCalled();
		expect(component.getVisibleNodes().map((n) => n.realId)).toEqual([
			"r",
			"a",
			"b",
			"d",
			"c",
		]);
		expect(index.rawDepthById.get("d")).toBe(3);
		component.dispose();
	});
	for (const outcome of [
		"ready",
		"decline",
		"failed",
		"replaced",
		"busy",
	] as const)
		it(`handles explicit busy waiting: ${outcome}`, async () => {
			let idle = false,
				session = "old";
			const order: string[] = [];
			const navigateTree = vi.fn(async () => {
				order.push("navigate");
				return { cancelled: false };
			});
			const waitForIdle = vi.fn(async () => {
				order.push("wait");
				if (outcome === "failed") throw new Error("wait failed");
				if (outcome === "replaced") session = "new";
				if (outcome !== "busy") idle = true;
			});
			const ctx = {
				sessionManager: {
					getSessionId: () => session,
					getEntry: () => ({
						id: "u",
						type: "message",
						message: { role: "user" },
					}),
				},
				isIdle: () => idle,
				ui: {
					confirm: async () => {
						order.push("confirm");
						return outcome !== "decline";
					},
				},
				waitForIdle,
				navigateTree,
			};
			const config = getDefaultConfig();
			config.session.busyBehavior = "wait";
			const result = await executeSessionIntent({
				ctx: ctx as unknown as ExtensionCommandContext,
				config,
				expectedSessionId: "old",
				intent: { type: "navigate", entryId: "u" },
				onNotify: (m) => {
					if (m.includes("Waiting")) order.push("visible");
				},
			});
			expect(result.success).toBe(outcome === "ready");
			if (outcome === "ready")
				expect(order).toEqual(["confirm", "visible", "wait", "navigate"]);
			else expect(navigateTree).not.toHaveBeenCalled();
			if (outcome === "decline") expect(waitForIdle).not.toHaveBeenCalled();
		});
	it("maps hidden descendants to their own collapsed ancestor summary", () => {
		const entries = [
			["r", null],
			["a", "r"],
			["b", "r"],
			["x", "b"],
			["y", "x"],
		].map(([id, parentId]) => ({
			id: id as string,
			parentId: parentId ?? null,
			type: "message",
			timestamp: "T0",
			message: { role: "user", content: id },
		}));
		const state = createInitialState("hidden", {
			selectedEntryId: "a",
			sessionLeafId: "a",
			focusedPathIds: new Set(["r", "a"]),
		});
		state.manualCollapsedIds.add("b");
		const index = buildTreeIndex(entries),
			component = new SessionTreeComponent({
				state,
				index,
				theme: {},
				tui: { requestRender() {} },
				done() {},
			});
		const nodes = component.getVisibleNodes(),
			summary = nodes.find((n) => n.anchorEntryId === "b");
		expect(summary).toBeDefined();
		expect(resolveDisplayTarget("y", index, nodes)).toBe(summary?.id);
		component.dispose();
	});
	it("updates compression structure after movement without losing a merged virtual target", () => {
		const entries = ["r", "a", "b", "d", "c"].map((id, i) => ({
			id,
			parentId: i ? ["r", "a", "b", "d"][i - 1] : null,
			type: "message",
			timestamp: "T0",
			message: { role: "user", content: id },
		}));
		const state = createInitialState("compression", {
			selectedEntryId: "a",
			sessionLeafId: "c",
		});
		state.foldOptions.collapseLinearPaths = true;
		const index = buildTreeIndex(entries),
			component = new SessionTreeComponent({
				state,
				index,
				tui: { requestRender() {} },
				theme: {},
				done() {},
			});
		component.handleInput("j");
		const fresh = component.getVisibleNodes();
		expect(fresh.some((n) => n.realId === "a")).toBe(false);
		expect(
			fresh.find((n) => n.id === state.selectedEntryId)?.compressedEntryIds,
		).toContain("b");
		component.dispose();
	});
});
