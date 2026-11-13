import { afterEach, describe, expect, it, vi } from "vitest";
import {
	computeContextMetrics,
	estimateMessageTokens,
} from "../extensions/context-metrics.ts";
import { MetricsController } from "../extensions/metrics-controller.ts";
import { createInitialState } from "../extensions/state.ts";
import { buildTreeIndex } from "../extensions/tree-index.ts";
import { SessionTreeComponent } from "../extensions/tui.ts";

afterEach(() => vi.useRealTimers());
describe("remediation: lazy metrics", () => {
	it("does not estimate in render and reuses projection/cache across movement", () => {
		vi.useFakeTimers();
		const index = buildTreeIndex(
			Array.from({ length: 20 }, (_, i) => ({
				id: `e${i}`,
				parentId: i ? `e${i - 1}` : null,
				type: "message",
				timestamp: "T0",
				message: { role: "user", content: "prompt" },
			})),
		);
		const state = createInitialState("metrics", { selectedEntryId: "e0" });
		const component = new SessionTreeComponent({
			state,
			index,
			tui: { requestRender() {} },
			theme: {},
			done() {},
		});
		const projection = component.getVisibleNodes();
		expect(component.getMetricsForEntry("e0")).toBeUndefined();
		component.render(100);
		vi.runAllTimers();
		const first = component.getMetricsForEntry("e0");
		expect(first?.tokens).toBeGreaterThan(0);
		component.handleInput("j");
		expect(component.getVisibleNodes()).toBe(projection);
		expect(component.getMetricsForEntry("e0")).toBe(first);
		component.dispose();
	});
	it("cannot request rendering from estimation after disposal", () => {
		vi.useFakeTimers();
		const requestRender = vi.fn();
		const state = createInitialState("dispose", { selectedEntryId: "u" });
		const component = new SessionTreeComponent({
			state,
			index: buildTreeIndex([
				{
					id: "u",
					parentId: null,
					type: "message",
					timestamp: "T0",
					message: { role: "user", content: "x" },
				},
			]),
			tui: { requestRender },
			theme: {},
			done() {},
		});
		component.render(100);
		component.dispose();
		requestRender.mockClear();
		vi.runAllTimers();
		expect(requestRender).not.toHaveBeenCalled();
	});
});
describe("remediation: honest estimates", () => {
	it("estimates message content instead of cumulative request usage", () => {
		expect(
			estimateMessageTokens({
				role: "assistant",
				content: [{ type: "text", text: "short" }],
				usage: { totalTokens: 50000 },
			}),
		).toBeLessThan(100);
	});
	it("does not borrow a current model window for history without model evidence", () => {
		const entry = {
			id: "u",
			parentId: null,
			type: "message",
			timestamp: "T0",
			message: { role: "user", content: "prompt" },
		};
		const metrics = computeContextMetrics({
			entryId: "u",
			rawEntries: [entry],
			index: buildTreeIndex([entry]),
			sessionLeafId: null,
			activeModel: { id: "gpt-4o", provider: "openai", contextWindow: 128000 },
		});
		expect(metrics.contextWindow).toBeNull();
		expect(metrics.modelId).toBeUndefined();
	});
});
describe("remediation: selected metrics priority", () => {
	it("reprioritizes an already queued entry when selection changes", () => {
		vi.useFakeTimers();
		const entries = [
			{
				id: "e0",
				parentId: null,
				type: "message",
				timestamp: "T0",
				message: { role: "user", content: "zero" },
			},
			{
				id: "e1",
				parentId: "e0",
				type: "message",
				timestamp: "T1",
				message: { role: "user", content: "one" },
			},
		];
		const controller = new MetricsController(
			"priority",
			1,
			{
				index: buildTreeIndex(entries),
				rawEntries: entries,
				sessionLeafId: null,
			},
			() => {},
		);
		controller.prioritize(["e0", "e1"]);
		controller.prioritize(["e1", "e0"]);
		vi.advanceTimersToNextTimer();
		expect(controller.request("e1")).toBeDefined();
		controller.dispose();
	});
});
describe("bounded malformed context", () => {
	it("projects normalized cycles without modifying the raw entries", () => {
		const entries = [
			{
				id: "a",
				parentId: "b",
				type: "message",
				timestamp: "T0",
				message: { role: "user", content: "a" },
			},
			{
				id: "b",
				parentId: "a",
				type: "message",
				timestamp: "T1",
				message: { role: "user", content: "b" },
			},
		];
		const before = JSON.stringify(entries);
		expect(
			computeContextMetrics({
				entryId: "a",
				rawEntries: entries,
				index: buildTreeIndex(entries),
				sessionLeafId: null,
			}).source,
		).toBe("projection-estimate");
		expect(JSON.stringify(entries)).toBe(before);
	});
	it("does not guess a historical context for a vanished ID", () => {
		expect(
			computeContextMetrics({
				entryId: "missing",
				rawEntries: [],
				index: buildTreeIndex([]),
				sessionLeafId: null,
			}).source,
		).toBe("unknown");
	});
});
