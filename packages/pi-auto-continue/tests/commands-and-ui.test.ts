import { describe, expect, it, mock } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	createEventBus,
	type ExtensionContext,
	type Theme,
} from "@earendil-works/pi-coding-agent";
import type { Component, TUI } from "@earendil-works/pi-tui";
import {
	getAutoContinueCompletions,
	parseAutoContinueArgs,
	tokenizeArgs,
} from "../extensions/commands.ts";
import { AutoContinueConfigManager } from "../extensions/config.ts";
import { ContinueController, defaults } from "../extensions/loop.ts";
import {
	DISCOVER_EVENT,
	isDiscoverPayload,
	openAutoContinueSettingsPanel,
} from "../extensions/ui.ts";

describe("Command parsing and shell-style quoting", () => {
	it("splits quoted strings while preserving Windows backslashes", () => {
		const res = tokenizeArgs(
			'--prompt "Review step 2" --prompt-file C:\\tmp\\next.txt --format "<continue>" "</continue>"',
		);
		expect(res).toEqual({
			ok: true,
			tokens: [
				"--prompt",
				"Review step 2",
				"--prompt-file",
				"C:\\tmp\\next.txt",
				"--format",
				"<continue>",
				"</continue>",
			],
		});
		expect(tokenizeArgs('--prompt "unclosed').ok).toBe(false);
	});

	it("parses /auto-continue start flags accurately and rejects invalid flags", () => {
		const now = 1_700_000_000_000;
		const parsed = parseAutoContinueArgs(
			'start -r 5 --delay 2s --duration 30m --on-error wait-quota --queue-empty continue --prompt "Next step" --prompt-pipe "node check.js" --format "<c>" "</c>" --stop-file STOP --stop-cmd "node hook.js"',
			now,
		);
		expect(parsed).toEqual({
			kind: "start",
			overrides: {
				maxRounds: 5,
				delayMs: 2000,
				deadlineMs: now + 30 * 60 * 1000,
				onError: "wait-quota",
				queueEmptyPolicy: "continue",
				prompt: "Next step",
				promptPipe: "node check.js",
				pipeFormatPrefix: "<c>",
				pipeFormatSuffix: "</c>",
				stopFile: "STOP",
				stopCommand: "node hook.js",
			},
		});

		expect(parseAutoContinueArgs("start --bogus 1", now).kind).toBe("error");
		expect(parseAutoContinueArgs("start --rounds -1", now).kind).toBe("error");
		expect(parseAutoContinueArgs("start --delay 10", now).kind).toBe("error");
		expect(parseAutoContinueArgs("start --on-error nope", now).kind).toBe(
			"error",
		);
		expect(
			parseAutoContinueArgs(
				"start --duration 5m --until 2099-01-01 00:00:00",
				now,
			).kind,
		).toBe("error");
		expect(parseAutoContinueArgs("start --format onlyone", now).kind).toBe(
			"error",
		);
	});

	it("parses queue subcommands, default indices, and rejects invalid arguments", () => {
		expect(parseAutoContinueArgs("queue")).toEqual({
			kind: "queue",
			sub: "list",
		});
		expect(parseAutoContinueArgs("queue add")).toEqual({
			kind: "queue",
			sub: "add",
			text: undefined,
		});
		expect(parseAutoContinueArgs("queue add Fix failing   tests")).toEqual({
			kind: "queue",
			sub: "add",
			text: "Fix failing   tests",
		});
		expect(parseAutoContinueArgs("queue prepend Urgent check")).toEqual({
			kind: "queue",
			sub: "prepend",
			text: "Urgent check",
		});
		expect(parseAutoContinueArgs("queue remove 2")).toEqual({
			kind: "queue",
			sub: "remove",
			index: 2,
		});
		expect(parseAutoContinueArgs("queue move 3 1")).toEqual({
			kind: "queue",
			sub: "move",
			from: 3,
			to: 1,
		});
		expect(parseAutoContinueArgs("queue clear")).toEqual({
			kind: "queue",
			sub: "clear",
		});
		expect(parseAutoContinueArgs('queue import "tasks/my list.md"')).toEqual({
			kind: "queue",
			sub: "import",
			filePath: "tasks/my list.md",
		});
		expect(parseAutoContinueArgs("queue send")).toEqual({
			kind: "queue",
			sub: "send",
			index: 1,
		});
		expect(parseAutoContinueArgs("queue steer 2")).toEqual({
			kind: "queue",
			sub: "steer",
			index: 2,
		});
		expect(parseAutoContinueArgs("queue remove 0").kind).toBe("error");
		expect(parseAutoContinueArgs("queue send abc").kind).toBe("error");
		expect(parseAutoContinueArgs("queue unknown").kind).toBe("error");
	});
});

describe("Multi-token completions and configuration suggestions contract", () => {
	const expectedPresets = {
		delayMs: ["1000", "5000", "15000", "30000", "60000"],
		maxRounds: ["0", "3", "5", "10", "20", "50"],
		onError: ["defer", "wait-quota", "stop"],
		queueEmptyPolicy: ["stop", "continue"],
		expandPromptTemplates: ["true", "false", "on", "off"],
		quotaWait: ["true", "false", "on", "off"],
		quotaDelayMs: ["0", "5000", "15000", "30000", "60000", "120000"],
		pipeRequireFormat: ["true", "false", "on", "off"],
		pipeTimeoutMs: ["5000", "15000", "30000", "60000", "120000"],
		stopCommandTimeoutMs: ["5000", "15000", "30000", "60000"],
		notifyOnContinue: ["true", "false", "on", "off"],
	};

	it("returns full replacement prefixes across actions, start flags, queue, and config", () => {
		expect(getAutoContinueCompletions("")?.map((i) => i.value)).toEqual([
			"start",
			"stop",
			"queue",
			"status",
			"config",
			"help",
		]);
		expect(
			getAutoContinueCompletions("start --on-error ")?.map((i) => i.value),
		).toEqual([
			"start --on-error defer",
			"start --on-error wait-quota",
			"start --on-error stop",
		]);
		expect(
			getAutoContinueCompletions("start --rounds 3 --q")?.map((i) => i.value),
		).toEqual(["start --rounds 3 --queue-empty"]);
		expect(getAutoContinueCompletions("queue ")?.map((i) => i.value)).toEqual([
			"queue add",
			"queue prepend",
			"queue list",
			"queue remove",
			"queue move",
			"queue clear",
			"queue import",
			"queue send",
			"queue steer",
		]);
		expect(getAutoContinueCompletions("config ")?.map((i) => i.label)).toEqual([
			"reload",
			...Object.keys(defaults),
		]);
	});

	for (const [key, values] of Object.entries(expectedPresets)) {
		it(`suggests and accepts every preset for config ${key}`, async () => {
			const dir = await mkdtemp(join(tmpdir(), "pi-ac-cand-"));
			try {
				const manager = new AutoContinueConfigManager(join(dir, "cfg.json"));
				expect(
					getAutoContinueCompletions(`config ${key} `)?.map((i) => i.value),
				).toEqual(values.map((v) => `config ${key} ${v}`));
				for (const value of values) {
					const res = await manager.setOption(key, value, false);
					expect(res.ok, `${key}=${value}`).toBe(true);
				}
			} finally {
				await rm(dir, { recursive: true, force: true });
			}
		});
	}
});

describe("Interactive TUI settings panel", () => {
	const stubTheme = {
		fg: (_token: string, text: string) => text,
		bold: (text: string) => text,
	} as unknown as Theme;

	it("renders status, toggles session armed state without writing disk, executes actions, and shows sibling switcher only when peers exist", async () => {
		const dir = await mkdtemp(join(tmpdir(), "pi-ac-ui-"));
		try {
			const cfgPath = join(dir, "pi-auto-continue.json");
			const configManager = new AutoContinueConfigManager(cfgPath);
			const controller = new ContinueController();
			controller.enqueue("Queued task alpha");
			const events = createEventBus();

			// 1. Without peer plugins: no "Switch Installed Plugin"
			let renderedWithoutPeers = "";
			const onArm = mock(() => controller.arm({}, Date.now(), false));
			const onDisarm = mock((reason: string) => controller.disarm(reason));
			const onSendNext = mock(() => ({ ok: true as const, summary: "sent" }));
			const onAddEditor = mock(async () => {});
			const onClearQueue = mock(() => controller.clearQueue());
			const onReload = mock(async () => {});
			const onStateChanged = mock(() => {});

			const ctxNoPeers = {
				mode: "tui",
				hasUI: true,
				ui: {
					custom: async <T>(
						factory: (
							tui: TUI,
							theme: Theme,
							kb: unknown,
							done: (result: T) => void,
						) => Component,
					) => {
						let result: T | undefined;
						const comp = factory(
							{ requestRender: mock() } as unknown as TUI,
							stubTheme,
							{},
							(res) => {
								result = res;
							},
						);
						renderedWithoutPeers = comp.render(100).join("\n");
						// Press Enter on first item (session-armed) to toggle armed
						comp.handleInput?.("\r");
						expect(onArm).toHaveBeenCalledTimes(1);
						expect(controller.isArmed()).toBe(true);
						// Press Escape to close
						comp.handleInput?.("\u001b");
						return result as T;
					},
				},
			} as unknown as ExtensionContext;

			await openAutoContinueSettingsPanel({
				ctx: ctxNoPeers,
				events,
				configManager,
				controller,
				onStateChanged,
				onArmSession: onArm,
				onDisarmSession: onDisarm,
				onSendNextQueued: onSendNext,
				onAddQueuedViaEditor: onAddEditor,
				onClearQueue,
				onReloadConfig: onReload,
			});

			expect(renderedWithoutPeers).toContain(
				"Auto Continue · Status & Settings",
			);
			expect(renderedWithoutPeers).toContain("Queue Head:");
			expect(renderedWithoutPeers).toContain("Queued task alpha");
			expect(renderedWithoutPeers).not.toContain("Switch Installed Plugin");

			// 2. With a peer plugin registered: Switch Installed Plugin appears
			const peerOpen = mock(async () => {});
			const unsub = events.on(DISCOVER_EVENT, (payload) => {
				if (isDiscoverPayload(payload)) {
					payload.register({
						id: "peer-plugin",
						title: "Peer Plugin",
						command: "/peer",
						getSummary: () => "ready",
						open: peerOpen,
					});
				}
			});

			let renderedWithPeers = "";
			const ctxWithPeers = {
				mode: "tui",
				hasUI: true,
				ui: {
					custom: async <T>(
						factory: (
							tui: TUI,
							theme: Theme,
							kb: unknown,
							done: (result: T) => void,
						) => Component,
					) => {
						let result: T | undefined;
						const comp = factory(
							{ requestRender: mock() } as unknown as TUI,
							stubTheme,
							{},
							(res) => {
								result = res;
							},
						);
						// Wrap up to the last item (Switch Installed Plugin)
						comp.handleInput?.("\u001b[A");
						renderedWithPeers = comp.render(100).join("\n");
						// Press Enter to open peer switcher, then Enter to select peer
						comp.handleInput?.("\r");
						comp.handleInput?.("\r");
						return result as T;
					},
				},
			} as unknown as ExtensionContext;

			await openAutoContinueSettingsPanel({
				ctx: ctxWithPeers,
				events,
				configManager,
				controller,
				onStateChanged,
				onArmSession: onArm,
				onDisarmSession: onDisarm,
				onSendNextQueued: onSendNext,
				onAddQueuedViaEditor: onAddEditor,
				onClearQueue,
				onReloadConfig: onReload,
			});
			unsub();

			expect(renderedWithPeers).toContain("Switch Installed Plugin");
			expect(peerOpen).toHaveBeenCalledTimes(1);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});
});
