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
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as piHost from "@earendil-works/pi-coding-agent";
import {
	createEventBus,
	type ExtensionAPI,
	type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import extension from "../extensions/index.ts";
import * as summarizer from "../extensions/summarizer.ts";
import {
	DISCOVER_EVENT,
	discoverLoadedPanels,
	isDiscoverPayload,
	SELF_PLUGIN_ID,
} from "../extensions/ui.ts";
import { waitFor } from "./wait-for.ts";

const scope = { dir: "" };
mock.module("@earendil-works/pi-coding-agent", () => ({
	...piHost,
	getAgentDir: () => scope.dir,
}));

mock.module("../extensions/project.ts", () => ({
	inspectProject: async (cwd: string) => ({
		name: "fixture",
		cwd,
		shortCwd: cwd,
		git: { isRepo: false },
		sessionCount: 0,
		inspectedAt: Date.now(),
	}),
}));
const summary = { generate: mock() };
mock.module("../extensions/summarizer.ts", () => ({
	...summarizer,
	generateSessionSummary: summary.generate,
}));

type Handler = (
	event: Record<string, unknown>,
	ctx: ExtensionContext,
) => unknown;
const stops: Array<() => Promise<void>> = [];
beforeEach(async () => {
	scope.dir = await mkdtemp(join(tmpdir(), "pi-pretty-session-lifecycle-"));
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
			input: mock(),
			setStatus: mock(),
			setWidget: mock(),
			notify: mock(),
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
	return { pi, ctx, emit, commands, detach };
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

		await app.emit("session_shutdown");
		expect(registrations()).toEqual(["independent-peer"]);
		expect(jest.getTimerCount()).toBe(0);
		const peers = discoverLoadedPanels(app.pi.events);
		await peers[0]?.open(app.ctx);
		expect(peerOpen).toHaveBeenCalledWith(app.ctx);

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

	it.each(["session_tree", "session_shutdown"])(
		"discards a late summary after %s",
		async (event) => {
			let finish!: (value: {
				title: string;
				description: string;
				source: "heuristic";
			}) => void;
			summary.generate.mockImplementationOnce(
				() =>
					new Promise((resolve) => {
						finish = resolve;
					}),
			);
			const app = instance();
			await app.emit("session_start");
			const pending = app.commands.get("ps")?.handler("summarize", app.ctx);
			await waitFor(() => expect(summary.generate).toHaveBeenCalled());
			const signal = summary.generate.mock.calls.at(-1)?.[0]
				.signal as AbortSignal;
			await app.emit(event);
			expect(signal.aborted).toBe(true);
			finish({
				title: "Late obsolete title",
				description: "Must not persist",
				source: "heuristic",
			});
			await pending;
			expect(app.pi.appendEntry).not.toHaveBeenCalled();
			expect(app.pi.setSessionName).not.toHaveBeenCalled();
			summary.generate.mockReset();
		},
	);
});

it("discards a rename dialog result after session replacement reuses the context", async () => {
	const app = instance();
	await app.emit("session_start");
	let finish!: (title: string) => void;
	const input = spyOn(app.ctx.ui, "input").mockImplementationOnce(
		() =>
			new Promise((resolve) => {
				finish = resolve;
			}),
	);
	const pending = app.commands.get("ps")?.handler("rename", app.ctx);
	await waitFor(() => expect(input).toHaveBeenCalled());
	await app.emit("session_start");
	finish("Obsolete dialog title");
	await pending;
	expect(app.pi.appendEntry).not.toHaveBeenCalled();
	expect(app.pi.setSessionName).not.toHaveBeenCalled();
});
