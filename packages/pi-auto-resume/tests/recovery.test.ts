import { describe, expect, it } from "vitest";
import { classify, Recovery, resetTime } from "../extensions/recovery.ts";

describe("restricted recovery", () => {
	it.each([
		"context window exceeded",
		"maximum output tokens exceeded",
		"invalid api key",
		"permission denied",
		"some unrelated error",
	])("excludes %s", (error) => {
		expect(
			classify(error, error === "some unrelated error" ? undefined : 429),
		).toBeUndefined();
	});
	it.each([
		["fetch failed", "network"],
		["ETIMEDOUT", "network"],
		["rate limit exceeded", "throttle"],
		["subscription usage limit reached", "quota"],
	])("recognizes %s", (error, kind) => {
		expect(classify(error)).toBe(kind);
	});
	it("does not confuse a quota message with a generic 429", () => {
		expect(classify("subscription quota exhausted", 429)).toBe("quota");
	});
	it("uses only concrete reset evidence", () => {
		expect(resetTime({ "retry-after": "12" }, "", 1000)).toBe(13000);
		expect(resetTime({}, '{"resets_at":2000000000}', 0)).toBe(2000000000000);
		expect(resetTime({}, "quota exhausted", 1000)).toBeUndefined();
	});
	it("continues an interrupted task only after its due time and only once", () => {
		const r = new Recovery({ retryDelayMs: 1000 });
		r.failed("fetch failed", {}, 0);
		expect(r.take(999, true)).toBe(false);
		expect(r.take(1000, false)).toBe(false);
		expect(r.take(1000, true)).toBe(true);
		expect(r.take(2000, true)).toBe(false);
	});
	it("does not retry unknown subscription resets", () => {
		const r = new Recovery();
		r.failed("subscription quota exhausted", {}, 0);
		expect(r.take(1000000000, true)).toBe(false);
		expect(r.status).toContain("reset time unavailable");
	});
	it("waits for reset plus configured safety delay", () => {
		const r = new Recovery({ quotaDelayMs: 30 });
		r.failed("subscription quota exhausted", { "retry-after": "10" }, 1000);
		expect(r.take(11029, true)).toBe(false);
		expect(r.take(11030, true)).toBe(true);
	});
	it("honors category controls and bounded attempts", () => {
		const disabled = new Recovery({ network: false });
		disabled.failed("fetch failed", {}, 0);
		expect(disabled.take(50000, true)).toBe(false);
		const r = new Recovery({ maxAttempts: 1, retryDelayMs: 1 });
		r.failed("fetch failed", {}, 0);
		expect(r.take(1, true)).toBe(true);
		r.failed("fetch failed", {}, 2);
		expect(r.take(100, true)).toBe(false);
		r.userInput();
		r.failed("fetch failed", {}, 200);
		expect(r.take(201, true)).toBe(true);
	});
	it("cancels pending work after explicit stop, normal completion, host recovery, or session change", () => {
		for (const action of ["cancel", "completed", "running"] as const) {
			const r = new Recovery({ retryDelayMs: 1 });
			r.failed("fetch failed", {}, 0);
			r[action]();
			expect(r.take(10000, true)).toBe(false);
		}
	});
	it("reevaluates one pending task after sleep without activating an idle session", () => {
		const r = new Recovery({ retryDelayMs: 1 });
		expect(r.take(9999999, true)).toBe(false);
		r.failed("fetch failed", {}, 0);
		expect(r.take(9999999, true)).toBe(true);
		expect(r.take(9999999, true)).toBe(false);
	});
	it("can disable wake catch-up", () => {
		const r = new Recovery({ retryDelayMs: 1, wake: false });
		r.failed("fetch failed", {}, 0);
		r.woke();
		expect(r.take(9999999, true)).toBe(false);
	});
});
