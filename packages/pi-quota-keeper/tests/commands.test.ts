import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	createEventBus,
	type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import {
	formatQuotaCommand,
	getQuotaCompletions,
	parseQuotaArgs,
} from "../extensions/commands.ts";
import { defaultQuotaConfig } from "../extensions/coordination.ts";
import type { Snapshot } from "../extensions/providers.ts";
import {
	DISCOVER_EVENT,
	discoverLoadedPanels,
	isDiscoverPayload,
	openQuotaSettingsPanel,
	SELF_PLUGIN_ID,
} from "../extensions/ui.ts";

const snapshots: Snapshot[] = [
	{
		id: "anthropic:one",
		provider: "anthropic",
		label: "anthropic (a***@e***)",
		credentialType: "oauth",
		status: "available",
		fetchedAt: 0,
		windows: [
			{ id: "five_hour", remainingPercent: 80 },
			{ id: "seven_day", remainingPercent: 95 },
		],
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
		["status", { kind: "view", detailed: false }],
		["view", { kind: "view", detailed: false }],
		[
			"status anthropic:one",
			{ kind: "view", id: "anthropic:one", detailed: false },
		],
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
		["config reload", { kind: "config", reload: true }],
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
		"status status",
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

	it("provides multi-token argument completions for actions, accounts, models, windows, and config", () => {
		const ctx = {
			snapshots,
			config: {
				...defaultQuotaConfig,
				enabledAccounts: ["anthropic:one"],
				models: { "anthropic:one": "claude-sonnet-4-5" },
				resetWindows: {},
			},
			models: [
				{ id: "claude-opus-4-6", provider: "anthropic" },
				{ id: "gpt-5", provider: "openai" },
			],
		};

		const actions = getQuotaCompletions("", ctx) ?? [];
		expect(actions.map((a) => a.value)).toEqual([
			"status",
			"details",
			"list",
			"refresh",
			"enable",
			"disable",
			"config",
			"help",
		]);

		const statusAccounts = getQuotaCompletions("status a", ctx) ?? [];
		expect(statusAccounts.map((a) => a.value)).toEqual([
			"status anthropic:one",
		]);

		const enableAccounts = getQuotaCompletions("enable ", ctx) ?? [];
		expect(enableAccounts.map((a) => a.value)).toEqual([
			"enable anthropic:one",
			"enable openai:two",
		]);

		const enableModels =
			getQuotaCompletions("enable anthropic:one ", ctx) ?? [];
		expect(enableModels.map((m) => m.value)).toContain(
			"enable anthropic:one claude-opus-4-6",
		);
		expect(enableModels.map((m) => m.value)).toContain(
			"enable anthropic:one claude-sonnet-4-5",
		);

		const enableWindows =
			getQuotaCompletions("enable anthropic:one claude-opus-4-6 ", ctx) ?? [];
		expect(enableWindows.map((w) => w.value)).toEqual([
			"enable anthropic:one claude-opus-4-6 five_hour",
			"enable anthropic:one claude-opus-4-6 seven_day",
		]);

		const disableAccounts = getQuotaCompletions("disable ", ctx) ?? [];
		expect(disableAccounts[0]?.value).toBe("disable anthropic:one");

		const configKeys = getQuotaCompletions("config ", ctx) ?? [];
		expect(configKeys.map((k) => k.value)).toEqual([
			"config reload",
			"config mode",
			"config delayMs",
			"config pollIntervalMs",
		]);

		const modeVals = getQuotaCompletions("config mode ", ctx) ?? [];
		expect(modeVals.map((v) => v.value)).toEqual([
			"config mode reset",
			"config mode fixed",
		]);
	});

	it("renders TUI quota settings panel without uninstalled plugins and discovers loaded plugins via pi.events", async () => {
		const dir = await mkdtemp(join(tmpdir(), "pi-quota-tui-"));
		try {
			const bus = createEventBus();
			bus.on(DISCOVER_EVENT, (payload: unknown) => {
				if (!isDiscoverPayload(payload)) return;
				payload.register({
					id: SELF_PLUGIN_ID,
					title: "Pi Quota Keeper",
					command: "/quota",
					getSummary: () => "owner · 2 accounts",
					open: async () => {},
				});
			});

			expect(discoverLoadedPanels(bus)).toHaveLength(1);

			let renderedSoloLines: string[] = [];
			const fakeTheme = {
				fg: (_token: string, text: string) => text,
				bold: (text: string) => text,
			};
			const mockCtx = {
				hasUI: true,
				mode: "tui",
				modelRegistry: { getAvailable: () => [] },
				ui: {
					custom: async (
						factory: (
							tui: { requestRender: () => void },
							theme: typeof fakeTheme,
							kb: unknown,
							done: (val: unknown) => void,
						) => { render: (w: number) => string[] },
					) => {
						const comp = factory(
							{ requestRender: () => {} },
							fakeTheme,
							{},
							() => {},
						);
						renderedSoloLines = comp.render(100);
						return undefined;
					},
				},
			} as unknown as ExtensionContext;

			const cfg = {
				...defaultQuotaConfig,
				enabledAccounts: ["anthropic:one"],
				models: { "anthropic:one": "claude-sonnet-4-5" },
				resetWindows: {},
			};

			await openQuotaSettingsPanel({
				ctx: mockCtx,
				events: bus,
				dir,
				getState: () => ({ version: 1, snapshots, ledger: {} }),
				getConfig: () => cfg,
				getOwnerActive: () => true,
				getProblem: () => undefined,
				onApplyConfig: async () => true,
				onRefreshNow: async () => true,
				onReloadConfig: async () => cfg,
			});

			const soloText = renderedSoloLines.join("\n");
			expect(soloText).toContain("Quota Keeper · Quotas & Wake-up Settings");
			expect(soloText).toContain("Wake-up: anthropic:one");
			expect(soloText).not.toContain("Switch Installed Plugin");
			expect(soloText).not.toContain("Auto Resume");
			expect(soloText).not.toContain("Pretty Session");
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});
});
