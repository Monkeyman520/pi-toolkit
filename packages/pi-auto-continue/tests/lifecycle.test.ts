import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	jest,
	mock,
	spyOn,
} from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as piHost from "@earendil-works/pi-coding-agent";
import {
	createEventBus,
	type ExtensionAPI,
	type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { AutoContinueConfigManager } from "../extensions/config.ts";
import extension from "../extensions/index.ts";
import { defaults } from "../extensions/loop.ts";
import {
	DISCOVER_EVENT,
	discoverLoadedPanels,
	isDiscoverPayload,
	SELF_PLUGIN_ID,
} from "../extensions/ui.ts";

const scope = { dir: "" };
mock.module("@earendil-works/pi-coding-agent", () => ({
	...piHost,
	getAgentDir: () => scope.dir,
}));

type Handler = (
	event: Record<string, unknown>,
	ctx: ExtensionContext,
) => unknown;

const stops: Array<() => Promise<void>> = [];

function nodeCmd(code: string): string {
	return `"${process.execPath}" -e "${code}"`;
}

beforeEach(async () => {
	scope.dir = await mkdtemp(join(tmpdir(), "pi-auto-continue-lifecycle-"));
	jest.useFakeTimers();
	jest.setSystemTime(1_700_000_000_000);
});

afterEach(async () => {
	for (const stop of stops.splice(0)) await stop();
	jest.useRealTimers();
	mock.restore();
	await rm(scope.dir, { recursive: true, force: true });
});

function createInstance(events = createEventBus()) {
	const handlers = new Map<string, Handler>();
	const commands = new Map<
		string,
		{ handler: (args: string, ctx: ExtensionContext) => Promise<void> }
	>();
	let terminalListener: ((data: string) => unknown) | undefined;
	const detach = mock(() => {
		terminalListener = undefined;
	});
	const setStatus = mock();
	const notify = mock();
	const editor = mock(async () => "Line 1\nLine 2");
	let idle = true;
	let pendingMessages = false;

	const ctx = {
		cwd: scope.dir,
		hasUI: true,
		mode: "tui",
		isIdle: () => idle,
		hasPendingMessages: () => pendingMessages,
		getContextUsage: () => undefined,
		sessionManager: {
			getBranch: () => [],
			getEntries: () => [],
			getHeader: () => null,
			getSessionId: () => "fixture",
			getSessionFile: () => undefined,
			getSessionDir: () => scope.dir,
			getSessionName: () => undefined,
		},
		ui: {
			setStatus,
			setWidget: mock(),
			notify,
			editor,
			onTerminalInput: mock((cb: (data: string) => unknown) => {
				terminalListener = cb;
				return detach;
			}),
		},
	} as unknown as ExtensionContext;

	const pi = {
		events,
		on: (name: string, handler: Handler) => handlers.set(name, handler),
		registerCommand: (
			name: string,
			command: {
				handler: (args: string, ctx: ExtensionContext) => Promise<void>;
			},
		) => commands.set(name, command),
		sendUserMessage: mock(),
		appendEntry: mock(),
		setSessionName: mock(),
	};

	extension(pi as unknown as ExtensionAPI);

	const emit = async (
		name: string,
		event: Record<string, unknown> = {},
		target = ctx,
	) => {
		await handlers.get(name)?.(event, target);
	};

	const runCmd = async (args: string, target = ctx) => {
		const cmd = commands.get("auto-continue");
		expect(cmd).toBeDefined();
		await cmd?.handler(args, target);
	};

	const pressKey = (data: string) => {
		terminalListener?.(data);
	};

	stops.push(() => emit("session_shutdown"));

	return {
		pi,
		ctx,
		emit,
		runCmd,
		pressKey,
		detach,
		setStatus,
		notify,
		editor,
		setBusy: (busy: boolean, pending = false) => {
			idle = !busy;
			pendingMessages = pending;
		},
	};
}

describe("package-owned lifecycle and multi-instance isolation", () => {
	it("remains inactive before session_start, cleans up on repeated start, and releases all resources on shutdown", async () => {
		const app = createInstance();
		expect(jest.getTimerCount()).toBe(0);

		const peerOpen = mock(async () => {});
		const unregisterPeer = app.pi.events.on(DISCOVER_EVENT, (payload) => {
			if (isDiscoverPayload(payload)) {
				payload.register({
					id: "independent-peer",
					title: "Peer",
					command: "/peer",
					getSummary: () => "running",
					open: peerOpen,
				});
			}
		});

		const registeredIds = () =>
			discoverLoadedPanels(app.pi.events).map((p) => p.id);

		expect(registeredIds()).toEqual(["independent-peer"]);
		await app.emit("session_start");
		expect(registeredIds().sort()).toEqual(
			["independent-peer", SELF_PLUGIN_ID].sort(),
		);
		const timerCount = jest.getTimerCount();
		expect(timerCount).toBe(1);

		await app.runCmd("queue add Keep until shutdown");
		await app.emit("session_start");
		expect(registeredIds().filter((id) => id === SELF_PLUGIN_ID)).toHaveLength(
			1,
		);
		expect(jest.getTimerCount()).toBe(timerCount);
		expect(app.detach).toHaveBeenCalledTimes(1);

		await app.emit("session_shutdown");
		expect(registeredIds()).toEqual(["independent-peer"]);
		expect(jest.getTimerCount()).toBe(0);
		expect(app.detach).toHaveBeenCalledTimes(2);
		unregisterPeer();
	});

	it("isolates multiple instances sharing the same event bus", async () => {
		const events = createEventBus();
		const a = createInstance(events);
		const b = createInstance(events);
		await a.emit("session_start");
		await b.emit("session_start");

		await a.runCmd("queue add Task A");
		await b.runCmd("queue add Task B");
		await a.runCmd("start --delay 250");
		await b.runCmd("start --delay 250");

		await a.emit("session_shutdown");
		expect(discoverLoadedPanels(events).map((p) => p.id)).toEqual([
			SELF_PLUGIN_ID,
		]);
		expect(jest.getTimerCount()).toBe(1);

		jest.advanceTimersByTime(300);
		expect(a.pi.sendUserMessage).not.toHaveBeenCalled();
		expect(b.pi.sendUserMessage).toHaveBeenCalledTimes(1);
		expect(b.pi.sendUserMessage).toHaveBeenLastCalledWith("Task B", {
			expandPromptTemplates: true,
		});

		await b.emit("session_shutdown");
		expect(discoverLoadedPanels(events)).toEqual([]);
		expect(jest.getTimerCount()).toBe(0);
	});

	it("does not resurrect an old session's resources after a delayed config load", async () => {
		let release!: (value: {
			changed: boolean;
			settings: typeof defaults;
			isNewError: boolean;
		}) => void;
		spyOn(AutoContinueConfigManager.prototype, "reloadIfChanged")
			.mockImplementationOnce(
				() =>
					new Promise((resolve) => {
						release = resolve;
					}),
			)
			.mockResolvedValue({
				changed: true,
				settings: { ...defaults },
				isNewError: false,
			});

		const app = createInstance();
		const oldStart = app.emit("session_start");
		await app.emit("session_start");
		release({ changed: true, settings: { ...defaults }, isNewError: false });
		await oldStart;

		expect(jest.getTimerCount()).toBe(1);
		expect(
			discoverLoadedPanels(app.pi.events).map((panel) => panel.id),
		).toEqual([SELF_PLUGIN_ID]);
	});
});

describe("continuation queue lifecycle, preservation, rollback, and immediate send/steer", () => {
	it("drains queue FIFO with expandPromptTemplates, preserves across all disarm triggers, supports editor/import, and honors rollback", async () => {
		const cfgPath = join(scope.dir, "pi-auto-continue.json");
		const beforeCfg = JSON.stringify({ delayMs: 2000, maxRounds: 5 });
		await writeFile(cfgPath, beforeCfg, "utf8");

		const app = createInstance();
		await app.emit("session_start");

		// TUI editor multiline add
		await app.runCmd("queue add");
		expect(app.editor).toHaveBeenCalledTimes(1);

		// Import from file
		const importFile = join(scope.dir, "tasks.md");
		await writeFile(importFile, "/skill:lint\n---\nFinal verify", "utf8");
		await app.runCmd(`queue import "${importFile}"`);

		// Arm with session-only override (must not modify config file on disk)
		await app.runCmd("start --delay 500 --rounds 10");
		expect(await readFile(cfgPath, "utf8")).toBe(beforeCfg);

		// Item 1 dispatches from editor multiline prompt
		jest.advanceTimersByTime(500);
		expect(app.pi.sendUserMessage).toHaveBeenCalledTimes(1);
		expect(app.pi.sendUserMessage).toHaveBeenLastCalledWith("Line 1\nLine 2", {
			expandPromptTemplates: true,
		});

		// Disarm via Escape, Ctrl+C, stop, model_select, session_tree, abort — queue stays preserved!
		app.pressKey("\u001b");
		await app.runCmd("start --delay 500");
		app.pressKey("\u0003");
		await app.runCmd("start --delay 500");
		await app.emit("model_select");
		await app.runCmd("start --delay 500");
		await app.emit("session_tree");
		await app.runCmd("start --delay 500");
		await app.emit("agent_settled", { aborted: true });

		await app.runCmd("queue list");
		expect(app.notify).toHaveBeenLastCalledWith(
			expect.stringContaining("Auto Continue queue (2):"),
			"info",
		);

		// Rollback on sendUserMessage throw preserves head item and disarms
		app.pi.sendUserMessage.mockImplementationOnce(() => {
			throw new Error("host busy");
		});
		await app.runCmd("start --delay 500");
		jest.advanceTimersByTime(500);
		expect(app.notify).toHaveBeenLastCalledWith(
			expect.stringContaining("restored item to queue head"),
			"warning",
		);
		await app.runCmd("queue list");
		expect(app.notify).toHaveBeenLastCalledWith(
			expect.stringContaining("1. /skill:lint"),
			"info",
		);

		// Re-arm and drain remaining 2 items; queueEmptyPolicy="stop" disarms with "queue completed"
		await app.runCmd("start --delay 500");
		jest.advanceTimersByTime(500);
		expect(app.pi.sendUserMessage).toHaveBeenLastCalledWith("/skill:lint", {
			expandPromptTemplates: true,
		});
		await app.emit("message_end", {
			message: { role: "assistant", stopReason: "stop" },
		});
		await app.emit("agent_settled", { aborted: false });
		jest.advanceTimersByTime(500);
		expect(app.pi.sendUserMessage).toHaveBeenLastCalledWith("Final verify", {
			expandPromptTemplates: true,
		});
		await app.emit("message_end", {
			message: { role: "assistant", stopReason: "stop" },
		});
		await app.emit("agent_settled", { aborted: false });
		jest.advanceTimersByTime(2000);
		// Disarmed after queue completed; no extra loop prompt sent
		expect(app.pi.sendUserMessage).toHaveBeenCalledTimes(4); // 1 + 1 throwing + 2 successful
		await app.runCmd("status");
		expect(app.notify).toHaveBeenLastCalledWith(
			expect.stringContaining("lastStop=queue completed"),
			"info",
		);

		// Explicit queue clear empties queue
		await app.runCmd("queue add Temp item");
		await app.runCmd("queue clear");
		await app.runCmd("queue list");
		expect(app.notify).toHaveBeenLastCalledWith(
			"Auto Continue queue is empty.",
			"info",
		);
	});

	it("supports immediate queue send (idle + busy followUp), queue steer, and rollback on failure", async () => {
		const app = createInstance();
		await app.emit("session_start");
		await app.runCmd("queue add Item 1");
		await app.runCmd("queue add Item 2");
		await app.runCmd("queue add Item 3");

		// Idle & disarmed: queue send dispatches immediately with expandPromptTemplates
		await app.runCmd("queue send");
		expect(app.pi.sendUserMessage).toHaveBeenLastCalledWith("Item 1", {
			expandPromptTemplates: true,
		});

		// Busy: queue send uses deliverAs: "followUp"
		app.setBusy(true);
		await app.runCmd("queue send");
		expect(app.pi.sendUserMessage).toHaveBeenLastCalledWith("Item 2", {
			expandPromptTemplates: true,
			deliverAs: "followUp",
		});

		// Busy: queue steer throws once -> item 3 restored, then succeeds with deliverAs: "steer"
		app.pi.sendUserMessage.mockImplementationOnce(() => {
			throw new Error("rejected");
		});
		await app.runCmd("queue steer 1");
		expect(app.notify).toHaveBeenLastCalledWith(
			expect.stringContaining("restored to queue"),
			"error",
		);

		await app.runCmd("queue steer 1");
		expect(app.pi.sendUserMessage).toHaveBeenLastCalledWith("Item 3", {
			expandPromptTemplates: true,
			deliverAs: "steer",
		});
	});

	it("deduplicates 1-second countdown status updates and respects notifyOnContinue", async () => {
		await writeFile(
			join(scope.dir, "pi-auto-continue.json"),
			JSON.stringify({ delayMs: 3000, notifyOnContinue: true }),
			"utf8",
		);
		const app = createInstance();
		await app.emit("session_start");
		await app.runCmd("start");
		app.setStatus.mockClear();
		app.notify.mockClear();

		await app.emit("message_end", {
			message: { role: "assistant", stopReason: "stop" },
		});
		await app.emit("agent_settled", { aborted: false });
		expect(app.setStatus).toHaveBeenLastCalledWith(
			"auto-continue",
			"continuing in 3s (1/10)",
		);
		const countAfterSettle = app.setStatus.mock.calls.length;

		jest.advanceTimersByTime(250);
		jest.advanceTimersByTime(250);
		jest.advanceTimersByTime(250);
		expect(app.setStatus.mock.calls.length).toBe(countAfterSettle);

		jest.advanceTimersByTime(250);
		expect(app.setStatus.mock.calls.length).toBe(countAfterSettle + 1);
		expect(app.setStatus).toHaveBeenLastCalledWith(
			"auto-continue",
			"continuing in 2s (1/10)",
		);

		jest.advanceTimersByTime(2000);
		expect(app.pi.sendUserMessage).toHaveBeenCalledTimes(1);
		expect(app.notify).toHaveBeenCalledWith(
			expect.stringContaining("continuing round 1/10"),
			"info",
		);

		await app.runCmd("config notifyOnContinue false");
		app.notify.mockClear();
		await app.emit("message_end", {
			message: { role: "assistant", stopReason: "stop" },
		});
		await app.emit("agent_settled", { aborted: false });
		jest.advanceTimersByTime(3000);
		expect(app.pi.sendUserMessage).toHaveBeenCalledTimes(2);
		expect(app.notify).not.toHaveBeenCalled();
	});
});

describe("in-flight async command abort and orthogonal error/quota handling", () => {
	it("aborts in-flight slow promptPipe and stopCommand cleanly on stop, human input, and shutdown without late sends", async () => {
		jest.useRealTimers();
		const waitFor = async (pred: () => boolean) => {
			const deadline = Date.now() + 4000;
			while (!pred()) {
				if (Date.now() > deadline) throw new Error("Timed out waiting");
				await new Promise((r) => setTimeout(r, 15));
			}
		};

		const slowPipe = nodeCmd(
			"setTimeout(() => console.log('late prompt'), 1500)",
		);
		const app = createInstance();
		await app.emit("session_start");
		await app.runCmd(
			`start --delay 100 --prompt-pipe "${slowPipe.replaceAll('"', '\\"')}"`,
		);

		await app.emit("message_end", {
			message: { role: "assistant", stopReason: "stop" },
		});
		await app.emit("agent_settled", { aborted: false });
		await waitFor(() =>
			app.setStatus.mock.calls.some((c: unknown[]) =>
				String(c[1]).includes("running prompt pipe..."),
			),
		);

		// Cancel via /auto-continue stop while pipe is running
		await app.runCmd("stop");
		await new Promise((r) => setTimeout(r, 350));
		expect(app.pi.sendUserMessage).not.toHaveBeenCalled();

		// Now test human input cancelling in-flight stopCommand while staying armed
		const slowHook = nodeCmd("setTimeout(() => console.log('1'), 1500)");
		await app.runCmd(
			`start --delay 100 --stop-cmd "${slowHook.replaceAll('"', '\\"')}"`,
		);
		await app.emit("message_end", {
			message: { role: "assistant", stopReason: "stop" },
		});
		await app.emit("agent_settled", { aborted: false });
		await waitFor(() =>
			app.setStatus.mock.calls.some((c: unknown[]) =>
				String(c[1]).includes("running stop hook..."),
			),
		);

		await app.emit("input", {
			source: "interactive",
			text: "human takes over",
		});
		await new Promise((r) => setTimeout(r, 350));
		expect(app.pi.sendUserMessage).not.toHaveBeenCalled();

		// Shutdown during in-flight stopCommand
		await app.emit("message_end", {
			message: { role: "assistant", stopReason: "stop" },
		});
		await app.emit("agent_settled", { aborted: false });
		await waitFor(
			() =>
				app.setStatus.mock.calls.filter((c: unknown[]) =>
					String(c[1]).includes("running stop hook..."),
				).length >= 2,
		);
		await app.emit("session_shutdown");
		await new Promise((r) => setTimeout(r, 350));
		expect(app.pi.sendUserMessage).not.toHaveBeenCalled();
	});

	it("handles onError defer, wait-quota, idle quota floor, and stop orthogonally", async () => {
		const app = createInstance();
		await app.emit("session_start");

		// 1. defer (default): error does not send or drop queue; subsequent success resumes queue
		await app.runCmd("queue add Deferred task");
		app.setBusy(true);
		await app.runCmd("start --delay 500 --on-error defer");
		app.setBusy(false);

		await app.emit("after_provider_response", {
			status: 429,
			headers: { "retry-after": "2" },
		});
		await app.emit("message_end", {
			message: {
				role: "assistant",
				stopReason: "error",
				errorMessage: "rate limit exceeded",
			},
		});
		await app.emit("agent_settled", { aborted: false });
		jest.advanceTimersByTime(5000);
		expect(app.pi.sendUserMessage).not.toHaveBeenCalled();

		// Recovery completes normally -> queued item dispatches
		await app.emit("message_end", {
			message: { role: "assistant", stopReason: "stop" },
		});
		await app.emit("agent_settled", { aborted: false });
		jest.advanceTimersByTime(500);
		expect(app.pi.sendUserMessage).toHaveBeenCalledTimes(1);
		expect(app.pi.sendUserMessage).toHaveBeenLastCalledWith("Deferred task", {
			expandPromptTemplates: true,
		});

		// 2. wait-quota: schedules queued item for Retry-After + quotaDelayMs
		await app.runCmd("config quotaDelayMs 500");
		await app.runCmd("queue add After quota task");
		app.setBusy(true);
		await app.runCmd("start --delay 15000 --on-error wait-quota");
		app.setBusy(false);

		await app.emit("after_provider_response", {
			status: 429,
			headers: { "retry-after": "2" },
		});
		await app.emit("message_end", {
			message: {
				role: "assistant",
				stopReason: "error",
				errorMessage: "subscription quota exhausted",
			},
		});
		await app.emit("agent_settled", { aborted: false });
		jest.advanceTimersByTime(2000);
		expect(app.pi.sendUserMessage).toHaveBeenCalledTimes(1);
		jest.advanceTimersByTime(750);
		expect(app.pi.sendUserMessage).toHaveBeenCalledTimes(2);
		expect(app.pi.sendUserMessage).toHaveBeenLastCalledWith(
			"After quota task",
			{ expandPromptTemplates: true },
		);

		// 3. onError: stop disarms while preserving queue
		await app.runCmd("queue add Preserved after error stop");
		app.setBusy(true);
		await app.runCmd("start --delay 500 --on-error stop");
		app.setBusy(false);
		await app.emit("message_end", {
			message: {
				role: "assistant",
				stopReason: "error",
				errorMessage: "upstream failure",
			},
		});
		await app.emit("agent_settled", { aborted: false });
		jest.advanceTimersByTime(2000);
		expect(app.pi.sendUserMessage).toHaveBeenCalledTimes(2);
		await app.runCmd("queue list");
		expect(app.notify).toHaveBeenLastCalledWith(
			expect.stringContaining("Preserved after error stop"),
			"info",
		);
	});
});
