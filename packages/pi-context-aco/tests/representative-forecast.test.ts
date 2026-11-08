import { describe, expect, it } from "vitest";
import { compareForecasts } from "./representative-forecast.ts";

const trace = (n: number, projected: number | null, used = n * 10) => ({
	timestamp: n,
	event: "turn_end",
	pressure: {
		projectedTokens: { value: projected },
		usedTokens: { value: used },
		capacity: { value: 1000 },
		sampleCount: n,
		settings: { horizonTurns: 3, reserveTokens: 10 },
	},
});
describe("matched-horizon host forecast observations", () => {
	it("does not miss a context reset when both sample counts are already zero", () => {
		const rows = [
			trace(1, 150, 100),
			trace(2, 150, 80),
			trace(3, 150, 85),
			trace(4, 150, 90),
		];
		for (const row of rows) row.pressure.sampleCount = 0;
		const r = compareForecasts(rows);
		expect(r.pairs[0].stable).toBe(false);
		expect(r.meanAbsoluteError).toBeNull();
	});
	it("compares to the third completed turn with the same reserve and units", () => {
		const r = compareForecasts([
			trace(1, 60),
			trace(2, 70),
			trace(3, 80),
			trace(4, 90, 50),
		]);
		expect(r.pairs).toHaveLength(1);
		expect(r.pairs[0].observedContextPlusReserve).toBe(60);
		expect(r.pairs[0].error).toBe(0);
		expect(r.meanAbsoluteError).toBe(0);
	});
	it("does not call a next-assessment or unfinished horizon an accuracy measurement", () => {
		const r = compareForecasts([trace(1, 600), trace(2, 700), trace(3, 800)]);
		expect(r.pairs).toEqual([]);
		expect(r.meanAbsoluteError).toBeNull();
	});
	it("retains reset/capacity-change observations but excludes them from stable forecast scores", () => {
		const a = trace(1, 60),
			b = trace(2, 70),
			c = trace(3, 80),
			d = trace(4, 90, 50);
		d.pressure.capacity.value = 2000;
		const r = compareForecasts([a, b, c, d]);
		expect(r.pairs).toHaveLength(1);
		expect(r.pairs[0].stable).toBe(false);
		expect(r.meanAbsoluteError).toBeNull();
	});
});
