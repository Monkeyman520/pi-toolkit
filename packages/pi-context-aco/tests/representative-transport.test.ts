import { describe, expect, it } from "vitest";
import { accountTransport } from "./representative-transport.ts";

describe("live Antigravity transport accounting", () => {
	it("keeps stalled cumulative usage as a subtotal, not a completed charge", () => {
		const rows = [
			{ kind: "request", id: 1 },
			{
				kind: "usage",
				id: 1,
				usage: { totalTokenCount: 96853, promptTokenCount: 96702 },
			},
		];
		const r = accountTransport(rows, [1]);
		expect(r.total.totalTokens).toBeNull();
		expect(r.knownSubtotal.totalTokens).toBe(96853);
		expect(r.incompleteAttempts).toEqual([1]);
	});
	it("counts each transmitted attempt once using its last cumulative usage frame", () => {
		const rows = [
			{ kind: "request", id: 1 },
			{
				kind: "usage",
				id: 1,
				usage: {
					promptTokenCount: 5,
					candidatesTokenCount: 1,
					thoughtsTokenCount: 1,
					totalTokenCount: 7,
				},
			},
			{
				kind: "usage",
				id: 1,
				usage: {
					promptTokenCount: 5,
					candidatesTokenCount: 3,
					thoughtsTokenCount: 2,
					totalTokenCount: 10,
				},
			},
			{ kind: "request", id: 2 },
			{
				kind: "usage",
				id: 2,
				usage: {
					promptTokenCount: 8,
					cachedContentTokenCount: 2,
					candidatesTokenCount: 1,
					thoughtsTokenCount: 1,
					totalTokenCount: 10,
				},
			},
		];
		const r = accountTransport(rows);
		expect(r.attempts).toBe(2);
		expect(r.total.totalTokens).toBe(20);
		expect(r.total.promptTokensIncludingCache).toBe(13);
		expect(r.total.outputIncludingThoughts).toBe(7);
		expect(r.total.newInput).toBeNull();
		expect(r.total.cacheRead).toBeNull();
		expect(r.total.cacheWrite).toBeNull();
		expect(r.total.actualFee).toBeNull();
	});
	it("retains missing-usage retry attempts and refuses to zero-fill them", () => {
		const r = accountTransport([
			{ kind: "request", id: 1 },
			{ kind: "response", id: 1, status: 503 },
			{ kind: "request", id: 2 },
			{ kind: "response", id: 2, status: 200 },
			{ kind: "usage", id: 2, usage: { totalTokenCount: 20 } },
		]);
		expect(r.attempts).toBe(2);
		expect(r.withoutUsage).toEqual([1]);
		expect(r.total.totalTokens).toBeNull();
		expect(r.knownSubtotal.totalTokens).toBe(20);
	});
	it("excludes blocked fallback attempts that were never transmitted", () => {
		const r = accountTransport([
			{ kind: "blocked", model: "gemini-3.7-flash-high" },
		]);
		expect(r.attempts).toBe(0);
		expect(r.blockedRequests).toBe(1);
		expect(r.total.totalTokens).toBe(0);
		expect(r.total.actualFee).toBeNull();
	});
});
