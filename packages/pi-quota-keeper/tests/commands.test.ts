import { describe, expect, it } from "vitest";
import { formatQuotaCommand, parseQuotaArgs } from "../extensions/commands.ts";
import type { Snapshot } from "../extensions/providers.ts";

const snapshots: Snapshot[] = [
	{
		id: "anthropic:one",
		provider: "anthropic",
		label: "anthropic (a***@e***)",
		credentialType: "oauth",
		status: "available",
		fetchedAt: 0,
		windows: [{ id: "five_hour", remainingPercent: 80 }],
		activation: { supported: true, reason: "qualified" },
	},
	{
		id: "openai:two",
		provider: "openai",
		label: "openai (b***@e***)",
		credentialType: "api_key",
		status: "unavailable",
		reason: "Subscription OAuth required",
		fetchedAt: 0,
		windows: [],
		activation: { supported: false, reason: "not qualified" },
	},
];
const view = {
	snapshots,
	ledger: {},
	owner: false,
	schedule: { mode: "reset" as const, delayMs: 30000, enabledAccounts: [] },
	now: 0,
};
describe("quota command contract", () => {
	it.each([
		["", { kind: "view", detailed: false }],
		[" details ", { kind: "view", detailed: true }],
		["list", { kind: "list" }],
		["refresh", { kind: "refresh" }],
		["help", { kind: "usage" }],
		["--help", { kind: "usage" }],
		[
			"enable anthropic:one claude-sonnet-4-5",
			{ kind: "enable", id: "anthropic:one", model: "claude-sonnet-4-5" },
		],
		[
			"enable ag:one gemini-fixture gemini-5h",
			{
				kind: "enable",
				id: "ag:one",
				model: "gemini-fixture",
				resetWindow: "gemini-5h",
			},
		],
		["disable anthropic:one", { kind: "disable", id: "anthropic:one" }],
		["config", { kind: "config" }],
		["config mode fixed", { kind: "config", key: "mode", value: "fixed" }],
		["config delay 15000", { kind: "config", key: "delayMs", value: "15000" }],
		[
			"config poll 120000",
			{ kind: "config", key: "pollIntervalMs", value: "120000" },
		],
		["anthropic:one", { kind: "view", id: "anthropic:one", detailed: false }],
		[
			"anthropic:one details",
			{ kind: "view", id: "anthropic:one", detailed: true },
		],
		[
			"details anthropic:one",
			{ kind: "view", id: "anthropic:one", detailed: true },
		],
	])("parses %j without treating IDs as executable input", (args, expected) => {
		expect(parseQuotaArgs(String(args))).toEqual(expected);
	});
	it.each([
		"list extra",
		"refresh extra",
		"details details",
		"list details",
		"a b c",
		"enable",
		"enable anthropic:one",
		"disable",
		"enable list model",
		"config unknown 1",
	])("rejects ambiguous arguments %s", (args) => {
		expect(parseQuotaArgs(args)).toEqual({ kind: "usage" });
	});
	it("lists exact IDs, masked accounts, provider and credential type without quota/expiry noise", () => {
		const out = formatQuotaCommand(view, { kind: "list" }).join("\n");
		expect(out).toContain("ID");
		expect(out).toContain("Account");
		expect(out).toContain("Type");
		expect(out).toContain("anthropic:one");
		expect(out).toContain("openai:two");
		expect(out).toContain("a***@e***");
		expect(out).toContain("b***@e***");
		expect(out).toContain("OAuth");
		expect(out).toContain("API key");
		expect(out).not.toContain("80%");
		expect(out).not.toContain("Activation:");
	});
	it("filters by exact ID and preserves details without mutating the shared snapshots", () => {
		const out = formatQuotaCommand(view, {
			kind: "view",
			id: "anthropic:one",
			detailed: true,
		}).join("\n");
		expect(out).toContain("anthropic:one");
		expect(out).toContain("80%");
		expect(out).not.toContain("openai:two");
		expect(out).not.toContain("b***@e***");
		expect(snapshots).toHaveLength(2);
	});
	it("does not silently display other accounts for an unknown or partial ID", () => {
		for (const id of ["anthropic", "one", "missing"]) {
			const out = formatQuotaCommand(view, {
				kind: "view",
				id,
				detailed: false,
			}).join("\n");
			expect(out).toContain("Account ID not found");
			expect(out).toContain("/quota list");
			expect(out).not.toContain("80%");
		}
	});
	it("keeps legacy cache credential types unknown and supports an empty list", () => {
		const legacy = { ...snapshots[0] };
		delete legacy.credentialType;
		expect(
			formatQuotaCommand(
				{ ...view, snapshots: [legacy] },
				{ kind: "list" },
			).join("\n"),
		).toContain("unknown");
		expect(
			formatQuotaCommand({ ...view, snapshots: [] }, { kind: "list" }).join(
				"\n",
			),
		).toContain("No cached Pi accounts");
	});

	it("bounds large lists without silently truncating an individual copyable ID", () => {
		const many = Array.from({ length: 220 }, (_, i) => ({
			...snapshots[0],
			id: `anthropic:account-${i}`,
		}));
		const lines = formatQuotaCommand(
			{ ...view, snapshots: many },
			{ kind: "list" },
		);
		expect(lines.length).toBeLessThanOrEqual(200);
		expect(lines.join("\n")).toContain("Account list truncated");
		expect(lines.join("\n")).toContain("anthropic:account-195");
	});
});
