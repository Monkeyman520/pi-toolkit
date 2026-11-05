import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import {
	accountUsage,
	branchAccounting,
	compareRuns,
} from "../extensions/evaluation.ts";

describe("honest comparative accounting", () => {
	it("keeps missing metrics unknown and separates parent/child/management", () => {
		const reported = {
			input: 10,
			output: 2,
			totalTokens: 12,
			cacheRead: 0,
			cacheWrite: 0,
			cost: { input: 1, output: 2, total: 3, cacheRead: 0, cacheWrite: 0 },
		};
		const a = accountUsage([
			{ owner: "parent", usage: reported },
			{ owner: "child", usage: { totalTokens: 7 } },
		]);
		expect(a.total.totalTokens).toBe(19);
		expect(a.total.input).toBeNull();
		expect(a.byOwner.management.totalTokens).toBe(0);
		expect(a.total.costTotal).toBeNull();
		expect(a.gaps.length).toBeGreaterThan(0);
	});
	it("refuses non-comparable task inputs and never infers superiority", () => {
		const base = {
			taskKey: "same",
			acceptanceKey: "bytes-and-tests",
			evidenceClass: "controlled" as const,
			taskSuccess: true,
			continuity: true,
			recoveryAttempts: 0,
			recoveryFailures: 0,
			mistakenDecisions: 0,
			latencyMs: 1,
			humanInterventions: 0,
			accounting: accountUsage([]),
		};
		expect(() =>
			compareRuns(
				{ ...base, policy: "adaptive" },
				{ ...base, policy: "no-ACO", taskKey: "different" },
			),
		).toThrow(/comparable/);
		const report = compareRuns(
			{ ...base, policy: "adaptive" },
			{ ...base, policy: "no-ACO" },
		);
		expect(report.superiority).toBe("not established");
		expect(report.adaptive.accounting.total.totalTokens).toBe(0);
	});
	it("accounts interrupted children as unknown and preserves legacy metric gaps", () => {
		const note = (customType: string, data: unknown): SessionEntry => ({
			type: "custom",
			id: customType,
			parentId: null,
			timestamp: "",
			customType,
			data,
		});
		const pending = branchAccounting([
			note("aco-delegation-intent", { id: "orphan" }),
		]);
		expect(pending.total.totalTokens).toBeNull();
		const legacy = branchAccounting([
			note("aco-delegation-intent", { id: "child" }),
			note("aco-delegation-result", {
				id: "child",
				tokens: 10,
				cost: 2,
				cacheRead: 3,
				cacheWrite: 0,
			}),
		]);
		expect(legacy.byOwner.child.totalTokens).toBe(10);
		expect(legacy.total.input).toBeNull();
		expect(legacy.total.costTotal).toBe(2);
	});
});
