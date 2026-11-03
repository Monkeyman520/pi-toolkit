import { describe, expect, it } from "vitest";
import { formatQuotaView } from "../extensions/display.ts";
import type { Snapshot } from "../extensions/providers.ts";

const now = Date.parse("2026-11-03T06:00:00Z");
const available: Snapshot = {
	id: "openai-codex:fixture",
	provider: "openai-codex",
	label: "openai-codex",
	status: "available",
	fetchedAt: now - 10000,
	windows: [
		{
			id: "primary_window",
			remainingPercent: 56,
			resetAt: now + (3 * 60 + 16) * 60000,
		},
		{
			id: "secondary_window",
			remainingPercent: 2,
			resetAt: now + (24 * 60 + 40) * 60000,
		},
	],
	activation: {
		supported: false,
		reason:
			"No qualified first-request activation mechanism for this service/window.",
	},
};
function failed(provider: string, reason: string): Snapshot {
	return {
		id: `${provider}:fixture`,
		provider,
		label: provider === "antigravity" ? "antigravity (a***@g***)" : provider,
		status: "unavailable",
		fetchedAt: now - 20000,
		windows: [],
		reason,
		activation: { supported: false, reason },
	};
}
function render(snapshots: Snapshot[], detailed = false) {
	return formatQuotaView({
		snapshots,
		ledger: {},
		owner: true,
		schedule: { mode: "reset", delayMs: 30000, enabledAccounts: [] },
		now,
		detailed,
	}).join("\n");
}
describe("quota presentation", () => {
	it("summarizes health and promotes usable quota without mutating source order", () => {
		const snapshots = [failed("openai", "HTTP 401"), available];
		const out = render(snapshots);
		expect(out).toContain("2 accounts");
		expect(out).toContain("1 available");
		expect(out.indexOf("OpenAI Codex")).toBeLessThan(
			out.indexOf("Authentication rejected"),
		);
		expect(snapshots[0].provider).toBe("openai");
		expect(out).toContain("Owner");
		expect(out).toContain("reset +30s");
	});
	it("shows readable window labels, percentage bars and relative reset times", () => {
		const out = render([available]);
		expect(out).toContain("Primary");
		expect(out).toContain("56%");
		expect(out).toContain("[######----]");
		expect(out).toContain("3h 16m");
		expect(out).toContain("1d 40m");
		expect(out).not.toContain("primary_window");
	});
	it("does not repeat an unavailable reason as activation status", () => {
		const out = render([failed("openai", "HTTP 401")]);
		expect(out.match(/HTTP 401/g)).toHaveLength(1);
		expect(out).toContain("/login openai");
		expect(out).not.toContain("Activation:");
	});
	it("shortens known failures without pretending to diagnose an ambiguous request", () => {
		const out = render([
			failed(
				"antigravity",
				"Linked Pi Antigravity account token expired; refresh it using pi-antigravity.",
			),
			failed(
				"google-antigravity",
				"Quota request failed (network, permission, timeout, or unrecognized response).",
			),
		]);
		expect(out).toContain("Google Antigravity");
		expect(out).toContain("Saved token expired");
		expect(out).toContain("Request failed");
		expect(out).toContain("/antigravity.doctor");
		expect(out).not.toContain(" (checked ");
	});
	it("hides machine IDs and UTC timestamps by default but preserves them in details", () => {
		const compact = render([available]);
		expect(compact).not.toContain("openai-codex:fixture");
		expect(compact).not.toContain("2026-11-03T");
		expect(compact).toContain("/quota details");
		const detailed = render([available], true);
		expect(detailed).toContain("openai-codex:fixture");
		expect(detailed).toContain("2026-11-03T09:16:00.000Z");
		expect(detailed).toContain(available.activation.reason);
	});
	it("never turns missing quota into zero and labels elapsed reset times as due", () => {
		const out = render([
			{
				...available,
				windows: [
					{ id: "pool" },
					{ id: "past", remainingPercent: 0, resetAt: now - 1 },
				],
			},
		]);
		expect(out).toContain("unknown");
		expect(out).toContain("0%");
		expect(out).toContain("reset due");
		expect(out).not.toMatch(/NaN|Infinity/);
	});
	it("preserves explicit activation opt-in and separate outcome information", () => {
		const out = formatQuotaView({
			snapshots: [
				{ ...available, activation: { supported: true, reason: "qualified" } },
			],
			ledger: {
				[available.id]: {
					outcome: "Activation outcome uncertain; cycle will not be replayed.",
				},
			},
			schedule: {
				mode: "fixed",
				delayMs: 30000,
				enabledAccounts: [available.id],
			},
			owner: false,
			now,
		}).join("\n");
		expect(out).toContain("Follower");
		expect(out).toContain("every 5h");
		expect(out).toContain("Activation: enabled");
		expect(out).toContain("outcome uncertain");
	});
	it("has a helpful empty state and retains maintenance errors", () => {
		const out = formatQuotaView({
			snapshots: [],
			ledger: {},
			owner: false,
			now,
			schedule: { mode: "reset", delayMs: 30000, enabledAccounts: [] },
			problem: "Quota state unreadable",
		}).join("\n");
		expect(out).toContain("No cached Pi accounts");
		expect(out).toContain("Quota state unreadable");
	});
	it("limits compact model lists and total output without hiding the presence of more data", () => {
		const windows = Array.from({ length: 220 }, (_, i) => ({
			id: `model-${i}`,
			remainingPercent: 50,
		}));
		const out = render([{ ...available, windows }]);
		expect(out).toContain("more limits");
		expect(out.split("\n").length).toBeLessThan(30);
		const detailed = render([{ ...available, windows }], true);
		expect(detailed.split("\n").length).toBeLessThanOrEqual(200);
		expect(detailed).toContain("truncated");
	});
	it("does not allow control characters to break account formatting", () => {
		const out = render(
			[{ ...available, label: "openai-codex\n\u001b[31m" }],
			true,
		);
		expect(out).not.toContain("\u001b");
	});

	it("distinguishes best-effort wake-up support from quota availability and reset readiness", () => {
		const out = formatQuotaView({
			snapshots: [
				{
					...failed("xai", "Quota endpoint not qualified."),
					activation: {
						supported: true,
						bestEffort: true,
						reason: "Window opening is not guaranteed.",
					},
				},
			],
			ledger: {},
			owner: true,
			now,
			schedule: {
				mode: "reset",
				delayMs: 30000,
				enabledAccounts: ["xai:fixture"],
			},
		}).join("\n");
		expect(out).toContain("Wake-up: enabled (best-effort)");
		expect(out).toContain("reset window unknown");
		expect(out).toContain("not guaranteed");
		expect(out).not.toContain("Activation: unsupported");
	});

	it.each([0, 3])(
		"shows %s available quota resets separately from reset countdowns in both views",
		(availableCount) => {
			for (const detailed of [false, true]) {
				const out = render(
					[{ ...available, resetCredits: { availableCount } }],
					detailed,
				);
				expect(out).toContain(`Rate-limit resets: ${availableCount} available`);
				expect(out).toContain("3h 16m");
			}
		},
	);
	it("does not display absent Codex reset credits as zero", () => {
		const out = render([available]);
		expect(out).toContain("Rate-limit resets: unknown (not reported)");
		expect(out).not.toContain("Rate-limit resets: 0");
	});

	it("shows grouped reset-credit UTC expiries only in details, without confusing quota resets", () => {
		const expiresAt = Date.parse("2031-01-01T00:00:00Z");
		const s = {
			...available,
			resetCredits: {
				availableCount: 3,
				expirations: [{ expiresAt }, { expiresAt }, {}],
			},
		};
		const compact = render([s]),
			detailed = render([s], true);
		expect(compact).not.toContain("2031-01-01");
		expect(compact).not.toContain("expiry unknown");
		expect(detailed).toContain("2 resets expire 2031-01-01T00:00:00.000Z");
		expect(detailed).toContain("1 reset: expiry unknown");
		expect(detailed).toContain("Rate-limit resets: 3 available");
	});
	it("shows distinct expiry dates, past expiries, missing entries, and detail failures truthfully", () => {
		const future = now + 86400000,
			past = now - 86400000;
		const out = render(
			[
				{
					...available,
					resetCredits: {
						availableCount: 3,
						expirations: [{ expiresAt: future }, { expiresAt: past }],
					},
				},
			],
			true,
		);
		expect(out).toContain("1 reset expires");
		expect(out).toContain("1 reset expired");
		expect(out).toContain("1 reset: expiry unknown");
		expect(
			render(
				[
					{
						...available,
						resetCredits: { availableCount: 2, detailsUnavailable: "HTTP 403" },
					},
				],
				true,
			),
		).toContain("Expiry: unavailable (HTTP 403)");
		expect(
			render([{ ...available, resetCredits: { availableCount: 0 } }], true),
		).toContain("Expiry: no available resets");
		expect(
			render([{ ...available, resetCredits: { availableCount: 2 } }], true),
		).toContain("Expiry: unknown (not reported)");
	});
});
