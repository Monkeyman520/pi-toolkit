import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	createEventBus,
	type ExtensionAPI,
	type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import extension from "../extensions/index.ts";
import {
	DISCOVER_EVENT,
	discoverLoadedPanels,
	isDiscoverPayload,
	SELF_PLUGIN_ID,
} from "../extensions/ui.ts";

const scope = vi.hoisted(() => ({ dir: "" }));
vi.mock("@earendil-works/pi-coding-agent", async (importOriginal) => ({
	...(await importOriginal<typeof import("@earendil-works/pi-coding-agent")>()),
	getAgentDir: () => scope.dir,
}));

// Keep credential/provider access out of lifecycle tests; OS ownership remains real.
vi.mock("../extensions/accounts.ts", () => ({
	collectAccounts: async () => [],
}));

type Handler = (
	event: Record<string, unknown>,
	ctx: ExtensionContext,
) => unknown;
const stops: Array<() => Promise<void>> = [];
beforeEach(async () => {
	scope.dir = await mkdtemp(join(tmpdir(), "pi-quota-keeper-lifecycle-"));
	vi.useFakeTimers();
});
afterEach(async () => {
	for (const stop of stops.splice(0)) await stop();
	vi.useRealTimers();
	vi.restoreAllMocks();
	await rm(scope.dir, { recursive: true, force: true });
});

function instance(events = createEventBus()) {
	const handlers = new Map<string, Handler>();
	const commands = new Map<
		string,
		{ handler: (args: string, ctx: ExtensionContext) => Promise<void> }
	>();
	const detach = vi.fn();
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
			setStatus: vi.fn(),
			setWidget: vi.fn(),
			notify: vi.fn(),
			onTerminalInput: vi.fn(() => detach),
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
		sendUserMessage: vi.fn(),
		appendEntry: vi.fn(),
		setSessionName: vi.fn(),
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
		expect(vi.getTimerCount()).toBe(0);
		const peerOpen = vi.fn(async () => {});
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
		const timers = vi.getTimerCount();
		await app.emit("session_start");
		expect(registrations().filter((id) => id === SELF_PLUGIN_ID)).toHaveLength(
			1,
		);
		expect(vi.getTimerCount()).toBe(timers);

		await app.emit("session_shutdown");
		expect(registrations()).toEqual(["independent-peer"]);
		expect(vi.getTimerCount()).toBe(0);
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
		expect(vi.getTimerCount()).toBe(1);
		await b.emit("session_shutdown");
		expect(discoverLoadedPanels(events)).toEqual([]);
		expect(vi.getTimerCount()).toBe(0);
	});
});
