import { describe, expect, it } from "vitest";
import { PressureMonitor, textTokens } from "../extensions/pressure.ts";

const settings = { historySize: 3, horizonTurns: 3, reserveTokens: 1000 };
const reading = (tokens: number | null, identity = "a", capacity = 100000) => ({
	tokens,
	identity,
	capacity,
});

describe("passive pressure evidence", () => {
	it("never fabricates unknown usage, trend, protected content or recovery cost", () => {
		const m = new PressureMonitor();
		const s = m.observe(reading(null), settings);
		for (const key of [
			"usedTokens",
			"growthRate",
			"projectedTokens",
			"burstRisk",
			"reclaimableTokens",
			"protectedTokens",
			"recoveryCost",
		] as const)
			expect(s[key]).toMatchObject({ kind: "unavailable", value: null });
		expect(s.capacity).toMatchObject({ kind: "measured", value: 100000 });
	});
	it("labels host tokens as estimated and projects upcoming growth at low occupancy", () => {
		const m = new PressureMonitor();
		m.observe(reading(10000), settings);
		m.observe(reading(20000), settings, true);
		const s = m.observe(reading(35000), settings, true);
		expect(s.usedTokens.kind).toBe("estimated");
		expect(s.growthRate.value).toBe(12500);
		expect(s.projectedTokens.value).toBe(73500);
		expect(s.projectedUsage.value).toBe(0.735);
		expect(s.assumptions).toContain(
			"recent completed-turn mean; max(trend horizon, known pending tool results) + reserve",
		);
	});
	it("bounds growth history and does not sample command/status reads as turns", () => {
		const m = new PressureMonitor();
		m.observe(reading(0), settings);
		for (const n of [10, 30, 60, 100]) m.observe(reading(n), settings, true);
		for (let i = 0; i < 10; i++) m.observe(reading(100), settings);
		expect(m.observe(reading(100), settings).growthRate.value).toBe(30);
		expect(m.observe(reading(100), settings).sampleCount).toBe(3);
	});
	it.each([
		["model/window change", reading(60000, "b")],
		["window change", reading(60000, "a", 200000)],
		["unknown gap", reading(null)],
		["context shrink", reading(10)],
	])("invalidates trend across %s", (_label, next) => {
		const m = new PressureMonitor();
		m.observe(reading(100), settings);
		m.observe(reading(1000), settings, true);
		expect(m.observe(next, settings, true).growthRate.value).toBeNull();
	});
	it("establishes a fresh baseline after an unknown gap", () => {
		const m = new PressureMonitor();
		m.observe(reading(null), settings);
		m.observe(reading(100), settings, true);
		expect(m.observe(reading(130), settings, true).growthRate.value).toBe(30);
	});
	it("invalidates stale growth immediately when an inter-turn/status reading shrinks", () => {
		const m = new PressureMonitor();
		m.observe(reading(10000), settings);
		m.observe(reading(20000), settings, true);
		expect(m.observe(reading(5000), settings).growthRate.value).toBeNull();
		expect(m.observe(reading(5000), settings).projectedTokens.value).toBeNull();
	});
	it("explicit interventions and branch switches clear trend and pending predictions", () => {
		const m = new PressureMonitor();
		m.observe(reading(100), settings);
		m.observe(reading(200), settings, true);
		m.startTool("a", "read");
		m.reset("context-edit");
		const s = m.observe(reading(10000), settings);
		expect(s.growthRate.value).toBeNull();
		expect(s.pendingCalls).toBe(0);
		expect(s.resetReason).toBe("context-edit");
	});
	it("forecasts comparable pending tool sizes without storing arguments or output", () => {
		const m = new PressureMonitor();
		m.observe(reading(35000), settings);
		m.startTool("old", "read", 200);
		m.finishTool("old", "read", 20000, false, 1);
		m.startTool("a", "read", 200);
		m.startTool("b", "read", 200);
		const s = m.observe(reading(35000), settings);
		expect(s.pendingToolTokens.value).toBe(40000);
		expect(s.projectedTokens.value).toBe(76000);
		expect(s.burstRisk.value).toBe(0.76);
		m.startTool("c", "read", 300);
		expect(m.observe(reading(35000), settings).unknownPendingCalls).toBe(1);
	});
	it("counts blocked/errors/nested and reverse completions by ID without declaring missing durations zero", () => {
		const m = new PressureMonitor();
		m.startTool("parent", "codemode");
		m.startTool("a", "read");
		m.startTool("b", "read");
		m.finishTool("b", "read", 10, false, 12);
		m.finishTool("a", "read", 8, true);
		m.finishTool("parent", "codemode", 20, false, 15);
		m.finishTool("blocked", "unknown", 4, true);
		const s = m.observe(reading(100), settings);
		expect(s.finalizedCalls).toBe(4);
		expect(s.errorCalls).toBe(2);
		expect(s.pendingCalls).toBe(0);
		expect(s.lastTool?.durationMs).toBeNull();
		expect(s.lastTool?.isError).toBe(true);
	});
	it("does not learn failed results as expected successful output", () => {
		const m = new PressureMonitor();
		m.startTool("a", "read");
		m.finishTool("a", "read", 2, true);
		m.startTool("b", "read");
		expect(
			m.observe(reading(100), settings).pendingToolTokens.value,
		).toBeNull();
	});
	it("keeps capacity and usage unknown for invalid nonfinite inputs", () => {
		const m = new PressureMonitor();
		const s = m.observe(
			{ tokens: NaN, capacity: Infinity, identity: "a" },
			settings,
			true,
		);
		expect(s.capacity.value).toBeNull();
		expect(s.usedTokens.value).toBeNull();
		expect(s.projectedUsage.value).toBeNull();
	});
	it("keeps text estimates distinct from tokens and refuses multimodal/unsupported shapes", () => {
		expect(textTokens({ content: [{ type: "text", text: "12345678" }] })).toBe(
			2,
		);
		expect(textTokens({ content: [] })).toBe(0);
		expect(
			textTokens({ content: [{ type: "image", data: "secret" }] }),
		).toBeNull();
		expect(textTokens({ details: { text: "secret" } })).toBeNull();
	});
	it("bounds tool metadata under large or adversarial call streams", () => {
		const m = new PressureMonitor();
		for (let i = 0; i < 300; i++) m.startTool(String(i), `tool${i}`);
		const s = m.observe(reading(1), settings);
		expect(s.pendingCalls).toBeLessThanOrEqual(256);
		expect(s.unknownPendingCalls).toBeGreaterThan(0);
	});
});
