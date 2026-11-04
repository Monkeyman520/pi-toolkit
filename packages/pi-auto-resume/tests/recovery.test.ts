import { mkdtemp, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	createEventBus,
	type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
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
	defaults,
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
		["rate limit exceeded", "throttle"],
		["subscription usage limit reached", "quota"],
	])("recognizes %s", (error, kind) => {
		expect(classify(error)).toBe(kind);
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
			"config",
			"help",
		]);

		const onOff = getAutoResumeCompletions("o", defaults) ?? [];
		expect(onOff.map((a) => a.value)).toEqual(["on", "off"]);

		const cfgKeys = getAutoResumeCompletions("config ", defaults) ?? [];
		expect(cfgKeys.some((item) => item.value === "config reload")).toBe(true);
		expect(cfgKeys.some((item) => item.value === "config retryDelayMs")).toBe(
			true,
		);

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
						) => { render: (w: number) => string[] },
					) => {
						const comp = factory(
							{ requestRender: () => {} },
							fakeTheme,
							{},
							() => {},
						);
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
			expect(recovery.status).toContain("network: waiting until");

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

			// Navigate down to action-stop (index 8)
			for (let i = 0; i < 8; i++) {
				panelComponent?.handleInput("\x1b[B");
			}
			// Press Enter on action-stop
			panelComponent?.handleInput("\r");

			expect(recovery.status).toBe("cancelled");
			expect(stateChanged).toBe(true);

			// Ensure the list is NOT empty or frozen: re-render returns the full UI with updated status
			const lines = panelComponent?.render(100).join("\n") ?? "";
			expect(lines).toContain("Status: cancelled");
			expect(lines).toContain("Cancelled pending recovery.");
			expect(lines).toContain("Cancel Pending Recovery (stop)");

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
