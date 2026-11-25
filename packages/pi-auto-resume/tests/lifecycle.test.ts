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
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as piHost from "@earendil-works/pi-coding-agent";
import {
	createEventBus,
	type ExtensionAPI,
	type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import extension from "../extensions/index.ts";
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
beforeEach(async () => {
	scope.dir = await mkdtemp(join(tmpdir(), "pi-auto-resume-lifecycle-"));
	jest.useFakeTimers();
});
afterEach(async () => {
	for (const stop of stops.splice(0)) await stop();
	jest.useRealTimers();
	mock.restore();
	await rm(scope.dir, { recursive: true, force: true });
});

function instance(events = createEventBus()) {
	const handlers = new Map<string, Handler>();
	const commands = new Map<
		string,
		{ handler: (args: string, ctx: ExtensionContext) => Promise<void> }
	>();
	const detach = mock();
	const setStatus = mock();
	const notify = mock();
	const ctx = {
		cwd: scope.dir,
		hasUI: true,
		mode: "tui",
		isIdle: () => true,
		hasPendingMessages: () => false,
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
			onTerminalInput: mock(() => detach),
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
	stops.push(() => emit("session_shutdown"));
	return { pi, ctx, emit, commands, detach, setStatus, notify };
}

describe("package-owned lifecycle", () => {
	it("registers only while running, replaces session registrations, and cleans up its own resources", async () => {
		const app = instance();
		expect(jest.getTimerCount()).toBe(0);
		const peerOpen = mock(async () => {});
		const unregisterPeer = app.pi.events.on(DISCOVER_EVENT, (payload) => {
			if (isDiscoverPayload(payload))
				payload.register({
					id: "independent-peer",
					title: "Peer",
					command: "/peer",
					getSummary: () => "running",
					open: peerOpen,
				});
		});
		const registrations = () => {
			const ids: string[] = [];
			app.pi.events.emit(DISCOVER_EVENT, {
				register: (descriptor: { id: string }) => ids.push(descriptor.id),
			});
			return ids;
		};
		expect(registrations()).toEqual(["independent-peer"]);
		await app.emit("session_start");
		expect(registrations().sort()).toEqual(
			["independent-peer", SELF_PLUGIN_ID].sort(),
		);
		const timers = jest.getTimerCount();
		await app.emit("session_start");
		expect(registrations().filter((id) => id === SELF_PLUGIN_ID)).toHaveLength(
			1,
		);
		expect(jest.getTimerCount()).toBe(timers);
		expect(app.detach).toHaveBeenCalledTimes(1);
		await app.emit("session_shutdown");
		expect(registrations()).toEqual(["independent-peer"]);
		expect(jest.getTimerCount()).toBe(0);
		const peers = discoverLoadedPanels(app.pi.events);
		await peers[0]?.open(app.ctx);
		expect(peerOpen).toHaveBeenCalledWith(app.ctx);
		expect(app.detach).toHaveBeenCalledTimes(2);
		unregisterPeer();
	});

	it("does not stop another instance sharing the event bus", async () => {
		const events = createEventBus();
		const a = instance(events),
			b = instance(events);
		await a.emit("session_start");
		await b.emit("session_start");
		await a.emit("session_shutdown");
		expect(discoverLoadedPanels(events).map((panel) => panel.id)).toEqual([
			SELF_PLUGIN_ID,
		]);
		expect(jest.getTimerCount()).toBe(1);
		await b.emit("session_shutdown");
		expect(discoverLoadedPanels(events)).toEqual([]);
		expect(jest.getTimerCount()).toBe(0);
	});

	it("cancels only the stopped instance's pending continuation", async () => {
		await writeFile(
			join(scope.dir, "pi-auto-resume.json"),
			JSON.stringify({ retryDelayMs: 1 }),
		);
		const a = instance(),
			b = instance();
		for (const app of [a, b]) {
			await app.emit("session_start");
			await app.emit("message_end", {
				message: {
					role: "assistant",
					stopReason: "error",
					errorMessage: "fetch failed",
				},
			});
			await app.emit("agent_settled", { aborted: false });
		}
		await a.emit("session_shutdown");
		jest.advanceTimersByTime(250);
		expect(a.pi.sendUserMessage).not.toHaveBeenCalled();
		expect(b.pi.sendUserMessage).toHaveBeenCalledTimes(1);
	});

	it("renders resumePrompt placeholders and dynamically re-reads resumePromptFile with fail-closed error handling", async () => {
		jest.useRealTimers();
		const waitFor = async (predicate: () => boolean) => {
			const deadline = Date.now() + 3000;
			while (!predicate()) {
				if (Date.now() > deadline) {
					throw new Error("Timed out waiting for async recovery");
				}
				await new Promise((resolve) => setTimeout(resolve, 15));
			}
		};
		const promptPath = join(scope.dir, "resume-prompt.txt");
		await writeFile(
			promptPath,
			"  First file prompt\r\nCause={cause} #{attempt}/{maxAttempts}  ",
			"utf8",
		);
		await writeFile(
			join(scope.dir, "pi-auto-resume.json"),
			JSON.stringify({
				retryDelayMs: 1,
				retryBackoffFactor: 1,
				maxAttempts: 3,
				resumePromptFile: promptPath,
			}),
		);
		const app = instance();
		await app.emit("session_start");
		await app.emit("message_end", {
			message: {
				role: "assistant",
				stopReason: "error",
				errorMessage: "fetch failed",
			},
		});
		await app.emit("agent_settled", { aborted: false });
		await waitFor(() => app.pi.sendUserMessage.mock.calls.length >= 1);

		expect(app.pi.sendUserMessage).toHaveBeenCalledTimes(1);
		expect(app.pi.sendUserMessage).toHaveBeenLastCalledWith(
			"First file prompt\nCause=network #1/3",
		);

		// Update file content dynamically before second attempt
		await writeFile(promptPath, "Updated prompt #{attempt}", "utf8");
		await app.emit("message_end", {
			message: {
				role: "assistant",
				stopReason: "error",
				errorMessage: "overloaded_error",
			},
		});
		await app.emit("agent_settled", { aborted: false });
		await waitFor(() => app.pi.sendUserMessage.mock.calls.length >= 2);

		expect(app.pi.sendUserMessage).toHaveBeenCalledTimes(2);
		expect(app.pi.sendUserMessage).toHaveBeenLastCalledWith(
			"Updated prompt #2",
		);

		// Empty file fails closed without sending a message
		await writeFile(promptPath, "   \r\n  ", "utf8");
		await app.emit("message_end", {
			message: {
				role: "assistant",
				stopReason: "error",
				errorMessage: "fetch failed",
			},
		});
		await app.emit("agent_settled", { aborted: false });
		await waitFor(() =>
			app.setStatus.mock.calls.some(
				(call: unknown[]) =>
					call[1] === "resumePromptFile unavailable or empty",
			),
		);

		expect(app.pi.sendUserMessage).toHaveBeenCalledTimes(2);
		expect(app.setStatus).toHaveBeenLastCalledWith(
			"auto-resume",
			"resumePromptFile unavailable or empty",
		);
	});

	it("does not dispatch after session_shutdown while reading resumePromptFile asynchronously", async () => {
		const promptPath = join(scope.dir, "race-prompt.txt");
		await writeFile(promptPath, "Should not send after shutdown", "utf8");
		await writeFile(
			join(scope.dir, "pi-auto-resume.json"),
			JSON.stringify({
				retryDelayMs: 1,
				resumePromptFile: promptPath,
			}),
		);
		const app = instance();
		await app.emit("session_start");
		await app.emit("message_end", {
			message: {
				role: "assistant",
				stopReason: "error",
				errorMessage: "fetch failed",
			},
		});
		await app.emit("agent_settled", { aborted: false });
		jest.advanceTimersByTime(250);
		// Immediately shut down while async prompt file read is in flight
		await app.emit("session_shutdown");
		jest.useRealTimers();
		await new Promise((resolve) => setTimeout(resolve, 20));
		jest.useFakeTimers();

		expect(app.pi.sendUserMessage).not.toHaveBeenCalled();
	});

	it("cancels pending recovery when stopFile sentinel exists and enforces session-only guard command without writing config", async () => {
		jest.useRealTimers();
		const waitFor = async (predicate: () => boolean) => {
			const deadline = Date.now() + 3000;
			while (!predicate()) {
				if (Date.now() > deadline) {
					throw new Error("Timed out waiting for sentinel check");
				}
				await new Promise((resolve) => setTimeout(resolve, 15));
			}
		};
		const stopFile = join(scope.dir, "STOP_AUTO_RESUME");
		const cfgPath = join(scope.dir, "pi-auto-resume.json");
		await writeFile(
			cfgPath,
			JSON.stringify({
				retryDelayMs: 60,
				retryBackoffFactor: 1,
				stopFile,
			}),
		);
		const app = instance();
		await app.emit("session_start");
		await app.emit("message_end", {
			message: {
				role: "assistant",
				stopReason: "error",
				errorMessage: "fetch failed",
			},
		});
		await app.emit("agent_settled", { aborted: false });
		// Create sentinel file before retry fires
		await writeFile(stopFile, "stop", "utf8");
		await waitFor(() =>
			app.setStatus.mock.calls.some(
				(call: unknown[]) => call[1] === "stopped by sentinel file",
			),
		);
		expect(app.pi.sendUserMessage).not.toHaveBeenCalled();

		// /auto-resume guard duration sets session guardrail without modifying pi-auto-resume.json
		const beforeCfg = await (await import("node:fs/promises")).readFile(
			cfgPath,
			"utf8",
		);
		const cmd = app.commands.get("auto-resume");
		expect(cmd).toBeDefined();
		await cmd?.handler("guard duration 1h", app.ctx);
		const afterCfg = await (await import("node:fs/promises")).readFile(
			cfgPath,
			"utf8",
		);
		expect(afterCfg).toBe(beforeCfg);
		expect(app.notify).toHaveBeenLastCalledWith(
			expect.stringContaining("Auto Resume Guardrail: active until"),
			"info",
		);
	});

	it("updates countdown status once per second without redundant redraws and honors notifyOnResume", async () => {
		await writeFile(
			join(scope.dir, "pi-auto-resume.json"),
			JSON.stringify({
				retryDelayMs: 3000,
				retryBackoffFactor: 1,
				notifyOnResume: true,
			}),
		);
		const app = instance();
		await app.emit("session_start");
		app.setStatus.mockClear();
		app.notify.mockClear();

		await app.emit("message_end", {
			message: {
				role: "assistant",
				stopReason: "error",
				errorMessage: "rate limit exceeded\nwith details",
			},
		});
		await app.emit("agent_settled", { aborted: false });
		expect(app.setStatus).toHaveBeenLastCalledWith(
			"auto-resume",
			"throttle: retrying in 3s (1/5)",
		);
		const callsAfterSettle = app.setStatus.mock.calls.length;

		// Advancing 250ms, 500ms, 750ms stays at "3s" -> zero redundant setStatus calls
		jest.advanceTimersByTime(250);
		jest.advanceTimersByTime(250);
		jest.advanceTimersByTime(250);
		expect(app.setStatus.mock.calls.length).toBe(callsAfterSettle);

		// At +1000ms (remaining 2000ms -> 2s), exactly one new status update
		jest.advanceTimersByTime(250);
		expect(app.setStatus.mock.calls.length).toBe(callsAfterSettle + 1);
		expect(app.setStatus).toHaveBeenLastCalledWith(
			"auto-resume",
			"throttle: retrying in 2s (1/5)",
		);

		// Advance remaining 2000ms to fire recovery and emit dispatch notification
		jest.advanceTimersByTime(2000);
		expect(app.pi.sendUserMessage).toHaveBeenCalledTimes(1);
		expect(app.notify).toHaveBeenCalledWith(
			expect.stringContaining("resuming after throttle interruption"),
			"info",
		);

		// Verify /auto-resume status includes enriched diagnostics
		const cmd = app.commands.get("auto-resume");
		await cmd?.handler("status", app.ctx);
		expect(app.notify).toHaveBeenLastCalledWith(
			expect.stringContaining("sessionTotal=1"),
			"info",
		);
		expect(app.notify).toHaveBeenLastCalledWith(
			expect.stringContaining(
				"last=[throttle] rate limit exceeded with details",
			),
			"info",
		);

		// Suppress notification when notifyOnResume is false
		await cmd?.handler("config notifyOnResume false", app.ctx);
		app.notify.mockClear();
		await app.emit("message_end", {
			message: {
				role: "assistant",
				stopReason: "error",
				errorMessage: "fetch failed",
			},
		});
		await app.emit("agent_settled", { aborted: false });
		jest.advanceTimersByTime(3000);
		expect(app.pi.sendUserMessage).toHaveBeenCalledTimes(2);
		expect(app.notify).not.toHaveBeenCalled();
	});
});

it("does not resurrect an old session's resources after a delayed configuration load", async () => {
	const { AutoResumeConfigManager } = await import("../extensions/config.ts");
	const { defaults } = await import("../extensions/recovery.ts");
	let release!: (value: {
		changed: boolean;
		settings: typeof defaults;
		isNewError: boolean;
	}) => void;
	spyOn(AutoResumeConfigManager.prototype, "reloadIfChanged")
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
	const app = instance();
	const old = app.emit("session_start");
	await app.emit("session_start");
	release({ changed: true, settings: { ...defaults }, isNewError: false });
	await old;
	expect(jest.getTimerCount()).toBe(1);
	const ids: string[] = [];
	app.pi.events.emit(DISCOVER_EVENT, {
		register: (panel: { id: string }) => ids.push(panel.id),
	});
	expect(ids).toEqual([SELF_PLUGIN_ID]);
});
