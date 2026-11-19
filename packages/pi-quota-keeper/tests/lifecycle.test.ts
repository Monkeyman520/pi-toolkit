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

// Keep credential/provider access out of lifecycle tests; OS ownership remains real.
mock.module("../extensions/accounts.ts", () => ({
	collectAccounts: async () => [],
}));

type Handler = (
	event: Record<string, unknown>,
	ctx: ExtensionContext,
) => unknown;
const stops: Array<() => Promise<void>> = [];
beforeEach(async () => {
	scope.dir = await mkdtemp(join(tmpdir(), "pi-quota-keeper-lifecycle-"));
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
		const a = instance(events);
		const b = instance(events);
		// Real owner negotiation can have in-flight socket timeouts on Linux.
		// Track the plugin's polling handles, not all timers in the process.
		const start = spyOn(globalThis, "setInterval");
		const stop = spyOn(globalThis, "clearInterval");
		try {
			await a.emit("session_start");
			await b.emit("session_start");
			expect(start).toHaveBeenCalledTimes(2);
			const [aPoll, bPoll] = start.mock.results.map(({ value }) => value);
			expect(aPoll).not.toBe(bPoll);
			await a.emit("session_shutdown");
			expect(discoverLoadedPanels(events).map((panel) => panel.id)).toEqual([
				SELF_PLUGIN_ID,
			]);
			expect(stop.mock.calls.some(([handle]) => handle === aPoll)).toBe(true);
			expect(stop.mock.calls.some(([handle]) => handle === bPoll)).toBe(false);
			await b.emit("session_shutdown");
			expect(discoverLoadedPanels(events)).toEqual([]);
			expect(stop.mock.calls.some(([handle]) => handle === bPoll)).toBe(true);
			expect(jest.getTimerCount()).toBe(0);
		} finally {
			start.mockRestore();
			stop.mockRestore();
		}
	});
});
