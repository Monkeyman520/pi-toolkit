import { describe, expect, it } from "bun:test";
import { mkdtemp, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	createEventBus,
	type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import {
	getAutoResumeCompletions,
	parseAutoResumeArgs,
} from "../extensions/commands.ts";
import {
	AutoResumeConfigManager,
	CONFIG_FILE_NAME,
} from "../extensions/config.ts";
import {
	classify,
	DEFAULT_RESUME_PROMPT,
	defaults,
	formatCountdown,
	formatResumePrompt,
	parseDurationMs,
	parseGuardDurationMs,
	parseGuardUntilMs,
	Recovery,
	resetTime,
} from "../extensions/recovery.ts";
import {
	DISCOVER_EVENT,
	discoverLoadedPanels,
	isDiscoverPayload,
	openAutoResumeSettingsPanel,
	SELF_PLUGIN_ID,
} from "../extensions/ui.ts";

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
		["ECONNABORTED", "network"],
		["premature close", "network"],
		["UND_ERR_SOCKET", "network"],
		["stream closed unexpectedly", "network"],
		["overloaded_error", "server"],
		["503 service unavailable", "server"],
		["bad gateway", "server"],
		["rate limit exceeded", "throttle"],
		["subscription usage limit reached", "quota"],
	])("recognizes %s", (error, kind) => {
		expect<unknown>(classify(error)).toBe(kind);
	});
	it("classifies transient HTTP 5xx/529 statuses as server while preserving 401/403 and built-in exclusions", () => {
		for (const status of [500, 502, 503, 504, 529]) {
			expect(classify("upstream error", status)).toBe("server");
		}
		expect(classify("upstream error", 401)).toBeUndefined();
		expect(classify("upstream error", 403)).toBeUndefined();
		expect(classify("context window exceeded", 500)).toBeUndefined();
		expect(classify("invalid api key", 503)).toBeUndefined();
	});
	it("parses relative duration headers for x-ratelimit-reset-requests/tokens", () => {
		expect(parseDurationMs("500ms")).toBe(500);
		expect(parseDurationMs("20s")).toBe(20000);
		expect(parseDurationMs("1m30s")).toBe(90000);
		expect(parseDurationMs("2h5m10s")).toBe(7510000);
		expect(parseDurationMs("12345")).toBeUndefined();
		expect(resetTime({ "x-ratelimit-reset-requests": "1m30s" }, "", 1000)).toBe(
			91000,
		);
		expect(resetTime({ "X-RateLimit-Reset-Tokens": "500ms" }, "", 2000)).toBe(
			2500,
		);
		expect(resetTime({ "x-ratelimit-reset": "20s" }, "", 1000)).toBe(21000);
	});
	it("applies exponential backoff with cap and jitter, respects Retry-After, and supports factor=1 fixed delay", () => {
		const r = new Recovery(
			{
				retryDelayMs: 1000,
				retryBackoffFactor: 2,
				maxRetryDelayMs: 5000,
				maxAttempts: 5,
			},
			{ random: () => 0 },
		);
		r.failed("overloaded_error", {}, 0, 529);
		expect(r.take(999, true)).toBe(false);
		expect(r.take(1000, true)).toBe(true);

		r.failed("overloaded_error", {}, 1000, 529);
		expect(r.take(2999, true)).toBe(false);
		expect(r.take(3000, true)).toBe(true);

		r.failed("overloaded_error", {}, 3000, 529);
		expect(r.take(6999, true)).toBe(false);
		expect(r.take(7000, true)).toBe(true);

		// Capped at maxRetryDelayMs (5000ms)
		r.failed("overloaded_error", {}, 7000, 529);
		expect(r.take(11999, true)).toBe(false);
		expect(r.take(12000, true)).toBe(true);

		// Jitter adds up to +10% when random() === 1 (still capped at maxRetryDelayMs)
		const jittered = new Recovery(
			{
				retryDelayMs: 1000,
				retryBackoffFactor: 2,
				maxRetryDelayMs: 10000,
				maxAttempts: 3,
			},
			{ random: () => 1 },
		);
		jittered.failed("fetch failed", {}, 0);
		expect(jittered.take(1000, true)).toBe(true);
		jittered.failed("fetch failed", {}, 1000);
		expect(jittered.take(3199, true)).toBe(false);
		expect(jittered.take(3200, true)).toBe(true);

		// Retry-After lower bound wins over shorter backoff
		const hinted = new Recovery(
			{ retryDelayMs: 1000, retryBackoffFactor: 2 },
			{ random: () => 0 },
		);
		hinted.failed("rate limit", { "retry-after": "10" }, 1000, 429);
		expect(hinted.take(10999, true)).toBe(false);
		expect(hinted.take(11000, true)).toBe(true);

		// Fixed delay when retryBackoffFactor === 1
		const fixed = new Recovery(
			{ retryDelayMs: 1000, retryBackoffFactor: 1, maxAttempts: 3 },
			{ random: () => 1 },
		);
		fixed.failed("fetch failed", {}, 0);
		expect(fixed.take(1000, true)).toBe(true);
		fixed.failed("fetch failed", {}, 1000);
		expect(fixed.take(1999, true)).toBe(false);
		expect(fixed.take(2000, true)).toBe(true);

		// Category toggle for server
		const serverDisabled = new Recovery({ server: false });
		serverDisabled.failed("overloaded_error", {}, 0, 529);
		expect(serverDisabled.take(100000, true)).toBe(false);
	});
	it("supports customExcludePatterns and customMatchPatterns with exclusion-first precedence and fail-closed invalid regex", async () => {
		const r = new Recovery({
			retryDelayMs: 100,
			retryBackoffFactor: 1,
			customExcludePatterns: ["maintenance_halt"],
			customMatchPatterns: [
				{ pattern: "token", cause: "network" },
				{ pattern: "gateway_hiccup", cause: "server" },
				{ pattern: "custom_quota_hit", cause: "quota" },
			],
		});
		// Built-in exclusion still beats customMatchPatterns
		r.failed("invalid api token", {}, 0);
		expect(r.status).toBe("not eligible");
		expect(r.take(1000, true)).toBe(false);

		// customExcludePatterns beats built-in network classifier
		r.failed("fetch failed: maintenance_halt", {}, 0);
		expect(r.status).toBe("not eligible");
		expect(r.take(1000, true)).toBe(false);

		// customMatchPatterns classifies non-standard error into target cause
		r.failed("proxy returned gateway_hiccup", {}, 0);
		expect(r.take(100, true)).toBe(true);

		// custom quota match still enforces concrete reset-time evidence
		r.failed("custom_quota_hit", {}, 200);
		expect(r.status).toContain("reset time unavailable");
		expect(r.take(100000, true)).toBe(false);

		// Category toggle still disables custom match for that cause
		r.updateSettings({
			...r.settings,
			server: false,
		});
		r.failed("proxy returned gateway_hiccup", {}, 300);
		expect(r.status).toBe("not eligible");

		// Invalid regex in pi-auto-resume.json fails closed and hot-reloads cleanly once fixed
		const dir = await mkdtemp(join(tmpdir(), "pi-auto-resume-regex-"));
		try {
			const cfgPath = join(dir, CONFIG_FILE_NAME);
			const mgr = new AutoResumeConfigManager(cfgPath);
			await writeFile(
				cfgPath,
				JSON.stringify({ customExcludePatterns: ["[unclosed"] }),
				"utf8",
			);
			const bad = await mgr.reloadIfChanged();
			expect(bad.settings.enabled).toBe(false);
			expect(bad.error).toContain("Invalid customExcludePatterns regex");
			expect(bad.isNewError).toBe(true);

			// Re-reading same invalid file does not re-emit isNewError
			const badAgain = await mgr.reloadIfChanged();
			expect(badAgain.settings.enabled).toBe(false);
			expect(badAgain.isNewError).toBe(false);

			// Fixing regex restores enabled settings
			await writeFile(
				cfgPath,
				JSON.stringify({
					customMatchPatterns: [{ pattern: "edge_retry", cause: "server" }],
				}),
				"utf8",
			);
			const fixed = await mgr.reloadIfChanged();
			expect(fixed.error).toBeUndefined();
			expect(fixed.changed).toBe(true);
			expect(fixed.settings.enabled).toBe(true);
			expect(fixed.settings.customMatchPatterns).toEqual([
				{ pattern: "edge_retry", cause: "server" },
			]);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});
	it("formats resumePrompt placeholders in a single pass and falls back to default when blank", () => {
		expect(
			formatResumePrompt("Retry {cause} ({attempt}/{maxAttempts})", {
				cause: "server",
				attempt: 2,
				maxAttempts: 5,
			}),
		).toBe("Retry server (2/5)");
		expect(
			formatResumePrompt("   ", {
				cause: "network",
				attempt: 1,
				maxAttempts: 3,
			}),
		).toBe(DEFAULT_RESUME_PROMPT);
	});
	it("enforces maxWaitMs, maxTotalAttempts, and session time guardrails", () => {
		// Default maxWaitMs=0 allows long quota waits
		const unlimited = new Recovery({ quotaDelayMs: 0 });
		unlimited.failed(
			"subscription quota exhausted",
			{ "retry-after": "86400" },
			1000,
		);
		expect(unlimited.hasPending()).toBe(true);

		// Positive maxWaitMs rejects waits exceeding the cap
		const capped = new Recovery({ maxWaitMs: 60000, quotaDelayMs: 0 });
		capped.failed(
			"subscription quota exhausted",
			{ "retry-after": "120" },
			1000,
		);
		expect(capped.hasPending()).toBe(false);
		expect(capped.status).toBe("wait exceeds maxWaitMs");

		// maxTotalAttempts bounds cumulative recoveries across user prompts and completions
		const budgeted = new Recovery({
			retryDelayMs: 10,
			retryBackoffFactor: 1,
			maxAttempts: 5,
			maxTotalAttempts: 2,
		});
		budgeted.failed("fetch failed", {}, 0);
		expect(budgeted.take(10, true)).toBe(true);
		budgeted.completed();
		budgeted.userInput();
		budgeted.failed("fetch failed", {}, 100);
		expect(budgeted.take(110, true)).toBe(true);
		budgeted.completed();
		budgeted.failed("fetch failed", {}, 200);
		expect(budgeted.hasPending()).toBe(false);
		expect(budgeted.status).toBe("session attempt limit reached");
		expect(budgeted.getTotalAttempts()).toBe(2);

		// Session time guardrails (duration & until parsers + expiration)
		expect(parseGuardDurationMs("30m")).toBe(1800000);
		expect(parseGuardDurationMs("300")).toBe(300000);
		expect(parseGuardDurationMs("0s")).toBeUndefined();
		expect(parseGuardUntilMs("2030-01-02T03:04:05Z")).toBe(
			Date.parse("2030-01-02T03:04:05Z"),
		);
		expect(parseGuardUntilMs("2030-02-31 10:00:00")).toBeUndefined();

		const guarded = new Recovery({ retryDelayMs: 100, retryBackoffFactor: 1 });
		guarded.setGuardUntil(500, 0);
		guarded.failed("fetch failed", {}, 450);
		expect(guarded.hasPending()).toBe(false);
		expect(guarded.status).toBe("wait exceeds guardrail");

		guarded.failed("fetch failed", {}, 100);
		expect(guarded.hasPending()).toBe(true);
		expect(guarded.take(500, true)).toBe(false);
		expect(guarded.status).toBe("guardrail expired");

		guarded.clearGuard();
		guarded.failed("fetch failed", {}, 600);
		expect(guarded.take(700, true)).toBe(true);
	});
	it("formats human-readable countdown status and captures truncated diagnostics", () => {
		expect(formatCountdown(0)).toBe("0s");
		expect(formatCountdown(11200)).toBe("12s");
		expect(formatCountdown(125000)).toBe("2m 05s");
		expect(formatCountdown(3900000)).toBe("1h 05m");

		const r = new Recovery({
			retryDelayMs: 12000,
			retryBackoffFactor: 1,
			maxAttempts: 5,
			maxTotalAttempts: 10,
			stopFile: "/tmp/stop.flag",
		});
		const longMsg = `rate limit   exceeded\n${"x".repeat(200)}`;
		r.failed(longMsg, {}, 1000, 429);
		expect(r.formatStatus(1000)).toBe("throttle: retrying in 12s (1/5)");
		expect(r.formatStatus(1999)).toBe("throttle: retrying in 12s (1/5)");
		expect(r.formatStatus(2000)).toBe("throttle: retrying in 11s (1/5)");

		const diag = r.getDiagnostics(2000);
		expect(diag.status).toBe("throttle: retrying in 11s (1/5)");
		expect(diag.lastCause).toBe("throttle");
		expect(diag.lastError?.includes("\n")).toBe(false);
		expect((diag.lastError?.length ?? 0) <= 120).toBe(true);
		expect(diag.lastError?.endsWith("...")).toBe(true);
		expect(diag.stopFile).toBe("/tmp/stop.flag");
	});
	it("does not confuse a quota message with a generic 429", () => {
		expect(classify("subscription quota exhausted", 429)).toBe("quota");
	});
	it("uses only concrete reset evidence and handles case-insensitive headers and empty values safely", () => {
		expect(resetTime({ "retry-after": "12" }, "", 1000)).toBe(13000);
		expect(resetTime({ "Retry-After": "15" }, "", 1000)).toBe(16000);
		expect(resetTime({ "X-RateLimit-Reset": "2000000000" }, "", 0)).toBe(
			2000000000000,
		);
		expect(resetTime({ "retry-after": "   " }, "", 1000)).toBeUndefined();
		expect(resetTime({ "x-ratelimit-reset": "   " }, "", 1000)).toBeUndefined();
		expect(resetTime({}, '{"resets_at":2000000000}', 0)).toBe(2000000000000);
		expect(resetTime({}, '{"reset_at":2000000000}', 0)).toBe(2000000000000);
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
	it("honors category controls, setEnabled transitions, and bounded attempts", () => {
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
		r.failed("fetch failed", {}, 300);
		r.setEnabled(false);
		expect(r.status).toBe("disabled");
		expect(r.take(400, true)).toBe(false);
		r.setEnabled(true);
		expect(r.status).toBe("idle");
	});
	it("encapsulates staged provider/message failures and clears them on cancellation", () => {
		const r = new Recovery({ retryDelayMs: 500 });
		r.recordRequestStart();
		r.recordProviderResponse({ "Retry-After": "2" }, 429);
		r.recordAssistantMessage("error", "rate limit exceeded");
		r.settleTurn(false, 1000);
		expect(r.take(2999, true)).toBe(false);
		expect(r.take(3000, true)).toBe(true);

		r.recordRequestStart();
		r.recordProviderResponse({}, 500);
		r.recordAssistantMessage("error", "fetch failed");
		r.cancel();
		r.settleTurn(false, 4000);
		expect(r.take(10000, true)).toBe(false);
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
	it("hot-reloads settings, fails closed on invalid JSON, and persists /auto-resume config updates", async () => {
		const dir = await mkdtemp(join(tmpdir(), "pi-auto-resume-cfg-"));
		try {
			const cfgPath = join(dir, CONFIG_FILE_NAME);
			const mgr = new AutoResumeConfigManager(cfgPath);
			const initial = await mgr.reloadIfChanged();
			expect(initial.settings).toEqual(defaults);

			await writeFile(
				cfgPath,
				JSON.stringify({ maxAttempts: 4, retryDelayMs: 500 }),
				"utf8",
			);
			const reloaded = await mgr.reloadIfChanged();
			expect(reloaded.changed).toBe(true);
			expect(reloaded.settings.maxAttempts).toBe(4);
			expect(reloaded.settings.retryDelayMs).toBe(500);

			// Fail closed on invalid configuration
			await writeFile(cfgPath, JSON.stringify({ unknownField: true }), "utf8");
			const bad = await mgr.reloadIfChanged();
			expect(bad.error).toContain("invalid/unreadable");
			expect(bad.isNewError).toBe(true);
			expect(bad.settings.enabled).toBe(false);

			// Deleting file reverts to defaults
			await unlink(cfgPath);
			const reverted = await mgr.reloadIfChanged();
			expect(reverted.error).toBeUndefined();
			expect(reverted.settings).toEqual(defaults);

			// Persist option via setOption
			const setRes = await mgr.setOption("maxAttempts", "7", true);
			expect(setRes.ok).toBe(true);
			expect(mgr.settings.maxAttempts).toBe(7);

			const mgr2 = new AutoResumeConfigManager(cfgPath);
			const loaded2 = await mgr2.reloadIfChanged();
			expect(loaded2.settings.maxAttempts).toBe(7);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it("parses unified /auto-resume <action> [other-args] commands and provides multi-token completions", () => {
		expect(parseAutoResumeArgs("")).toEqual({ kind: "default" });
		expect(parseAutoResumeArgs("status")).toEqual({ kind: "status" });
		expect(parseAutoResumeArgs("on")).toEqual({ kind: "on" });
		expect(parseAutoResumeArgs("off")).toEqual({ kind: "off" });
		expect(parseAutoResumeArgs("stop")).toEqual({ kind: "stop" });
		expect(parseAutoResumeArgs("guard")).toEqual({
			kind: "guard",
			sub: "status",
		});
		expect(parseAutoResumeArgs("guard clear")).toEqual({
			kind: "guard",
			sub: "clear",
		});
		expect(parseAutoResumeArgs("guard duration 2h")).toEqual({
			kind: "guard",
			sub: "duration",
			value: "2h",
		});
		expect(parseAutoResumeArgs("guard until 2030-05-01 08:00:00")).toEqual({
			kind: "guard",
			sub: "until",
			value: "2030-05-01 08:00:00",
		});
		expect(parseAutoResumeArgs("config")).toEqual({ kind: "config" });
		expect(parseAutoResumeArgs("config reload")).toEqual({
			kind: "config",
			reload: true,
		});
		expect(parseAutoResumeArgs("config maxAttempts 3")).toEqual({
			kind: "config",
			key: "maxAttempts",
			value: "3",
		});
		expect(parseAutoResumeArgs("unknown extra")).toEqual({ kind: "help" });

		const actions = getAutoResumeCompletions("", defaults) ?? [];
		expect(actions.map((a) => a.value)).toEqual([
			"status",
			"on",
			"off",
			"stop",
			"guard",
			"config",
			"help",
		]);
		expect(
			getAutoResumeCompletions("guard ", defaults)?.map((item) => item.value),
		).toEqual(["guard status", "guard clear", "guard duration", "guard until"]);
		expect(
			getAutoResumeCompletions("guard duration 1", defaults)?.map(
				(item) => item.value,
			),
		).toEqual(["guard duration 15m", "guard duration 1h"]);

		const onOff = getAutoResumeCompletions("o", defaults) ?? [];
		expect(onOff.map((a) => a.value)).toEqual(["on", "off"]);

		const cfgKeys = getAutoResumeCompletions("config ", defaults) ?? [];
		expect(cfgKeys.some((item) => item.value === "config reload")).toBe(true);
		expect(cfgKeys.some((item) => item.value === "config retryDelayMs")).toBe(
			true,
		);
		const matchKeyItem = getAutoResumeCompletions("config customMatch", {
			...defaults,
			customMatchPatterns: [{ pattern: "foo", cause: "server" }],
		})?.[0];
		expect(matchKeyItem?.description).toContain("current: 1 rules");
		expect(matchKeyItem?.description).not.toContain("[object Object]");

		const boolValues =
			getAutoResumeCompletions("config network ", defaults) ?? [];
		expect(boolValues.map((item) => item.value)).toEqual([
			"config network true",
			"config network false",
			"config network on",
			"config network off",
		]);

		const intValues =
			getAutoResumeCompletions("config maxAttempts 1", defaults) ?? [];
		expect(intValues.map((item) => item.value)).toEqual([
			"config maxAttempts 1",
			"config maxAttempts 10",
		]);
	});

	it("renders TUI settings panel without uninstalled plugins and discovers loaded plugins via pi.events", async () => {
		const dir = await mkdtemp(join(tmpdir(), "pi-auto-resume-tui-"));
		try {
			const cfgPath = join(dir, CONFIG_FILE_NAME);
			const mgr = new AutoResumeConfigManager(cfgPath);
			const recovery = new Recovery();
			const bus = createEventBus();

			bus.on(DISCOVER_EVENT, (payload: unknown) => {
				if (!isDiscoverPayload(payload)) return;
				payload.register({
					id: SELF_PLUGIN_ID,
					title: "Pi Auto Resume",
					command: "/auto-resume",
					getSummary: () => "idle",
					open: async () => {},
				});
			});

			const soloPanels = discoverLoadedPanels(bus);
			expect(soloPanels).toHaveLength(1);
			expect(soloPanels[0]?.id).toBe(SELF_PLUGIN_ID);

			let renderedSoloLines: string[] = [];
			const fakeTheme = {
				fg: (_token: string, text: string) => text,
				bold: (text: string) => text,
			};
			const mockCtx = {
				hasUI: true,
				mode: "tui",
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

			await openAutoResumeSettingsPanel({
				ctx: mockCtx,
				events: bus,
				configManager: mgr,
				recovery,
				onStateChanged: () => {},
				onReloadConfig: async () => {},
			});

			const soloText = renderedSoloLines.join("\n");
			expect(soloText).toContain("Auto Resume · Status & Settings");
			expect(soloText).toContain("Session Auto-Resume (on/off)");
			expect(soloText).not.toContain("Switch Installed Plugin");
			expect(soloText).not.toContain("Quota Keeper");
			expect(soloText).not.toContain("Pretty Session");

			// Register a second loaded plugin on the shared bus
			bus.on(DISCOVER_EVENT, (payload: unknown) => {
				if (!isDiscoverPayload(payload)) return;
				payload.register({
					id: "pi-quota-keeper",
					title: "Pi Quota Keeper",
					command: "/quota",
					getSummary: () => "owner · 2 accounts",
					open: async () => {},
				});
			});

			let renderedMultiLines: string[] = [];
			const mockCtxMulti = {
				...mockCtx,
				ui: {
					custom: async (
						factory: (
							tui: { requestRender: () => void },
							theme: typeof fakeTheme,
							kb: unknown,
							done: (val: unknown) => void,
						) => {
							render: (w: number) => string[];
							handleInput: (d: string) => void;
						},
					) => {
						const comp = factory(
							{ requestRender: () => {} },
							fakeTheme,
							{},
							() => {},
						);
						// Wrap to the bottom item so Switch Installed Plugin is visible in the viewport
						comp.handleInput("\x1b[A");
						renderedMultiLines = comp.render(100);
						return undefined;
					},
				},
			} as unknown as ExtensionContext;

			await openAutoResumeSettingsPanel({
				ctx: mockCtxMulti,
				events: bus,
				configManager: mgr,
				recovery,
				onStateChanged: () => {},
				onReloadConfig: async () => {},
			});

			expect(renderedMultiLines.join("\n")).toContain(
				"Switch Installed Plugin",
			);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it("executes action-stop in TUI settings panel without freezing the list or breaking navigation", async () => {
		const dir = await mkdtemp(join(tmpdir(), "pi-auto-resume-action-"));
		try {
			const cfgPath = join(dir, CONFIG_FILE_NAME);
			const mgr = new AutoResumeConfigManager(cfgPath);
			const recovery = new Recovery();
			recovery.failed("fetch failed", {}, 0);
			expect(recovery.status).toContain("network: retrying in");

			const bus = createEventBus();
			let panelComponent:
				| {
						render: (w: number) => string[];
						handleInput: (d: string) => void;
				  }
				| undefined;
			let doneCalled = false;
			const fakeTheme = {
				fg: (_token: string, text: string) => text,
				bold: (text: string) => text,
			};
			const mockCtx = {
				hasUI: true,
				mode: "tui",
				ui: {
					custom: async (
						factory: (
							tui: { requestRender: () => void },
							theme: typeof fakeTheme,
							kb: unknown,
							done: (val: unknown) => void,
						) => {
							render: (w: number) => string[];
							handleInput: (d: string) => void;
						},
					) => {
						panelComponent = factory(
							{ requestRender: () => {} },
							fakeTheme,
							{},
							() => {
								doneCalled = true;
							},
						);
						return undefined;
					},
				},
			} as unknown as ExtensionContext;

			let stateChanged = false;
			await openAutoResumeSettingsPanel({
				ctx: mockCtx,
				events: bus,
				configManager: mgr,
				recovery,
				onStateChanged: () => {
					stateChanged = true;
				},
				onReloadConfig: async () => {},
			});

			// Navigate down to action-stop (index 14)
			for (let i = 0; i < 14; i++) {
				panelComponent?.handleInput("\x1b[B");
			}
			// Press Enter on action-stop
			panelComponent?.handleInput("\r");

			expect(recovery.status).toBe("cancelled");
			expect(stateChanged).toBe(true);

			// Ensure the list is NOT empty or frozen: re-render returns the full UI with updated status
			const lines = panelComponent?.render(100).join("\n") ?? "";
			expect(lines).toContain("Status: cancelled");
			expect(lines).toContain("Last: [network] fetch failed");
			expect(lines).toContain("Cancelled pending recovery.");
			expect(lines).toContain("Cancel Pending Recovery (stop)");
			// Narrow-width render completes safely without throwing
			expect((panelComponent?.render(40) ?? []).length).toBeGreaterThan(0);

			// Ensure user can still navigate back up
			panelComponent?.handleInput("\x1b[A");
			// And press Escape to close cleanly
			panelComponent?.handleInput("\x1b");
			expect(doneCalled).toBe(true);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});
});
