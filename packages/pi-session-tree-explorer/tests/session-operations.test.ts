import { describe, expect, it, vi } from "vitest";
import { getDefaultConfig } from "../extensions/config-schema.ts";
import { executeSessionIntent } from "../extensions/session-effects.ts";
import { createInitialState } from "../extensions/state.ts";
import { buildTreeIndex } from "../extensions/tree-index.ts";
import { SessionTreeComponent } from "../extensions/tui.ts";
import type { ExplorerResult, SessionEntry } from "../extensions/types.ts";

describe("T0005: Safe Navigate & Fork Session Operations", () => {
	function createFixture() {
		const entries: SessionEntry[] = [
			{
				type: "message",
				id: "root",
				parentId: null,
				timestamp: "T0",
				message: { role: "system", content: "System preamble" },
			},
			{
				type: "message",
				id: "user1",
				parentId: "root",
				timestamp: "T1",
				message: { role: "user", content: "Initial prompt" },
			},
			{
				type: "message",
				id: "asst1",
				parentId: "user1",
				timestamp: "T2",
				message: { role: "assistant", content: "Response 1" },
			},
			{
				type: "message",
				id: "user2",
				parentId: "asst1",
				timestamp: "T3",
				message: { role: "user", content: "Second prompt" },
			},
			{
				type: "message",
				id: "asst2",
				parentId: "user2",
				timestamp: "T4",
				message: { role: "assistant", content: "Response 2" },
			},
		];

		const index = buildTreeIndex(entries);
		const state = createInitialState("test-session-effects", {
			selectedEntryId: "asst1",
			sessionLeafId: "asst2",
		});

		return { entries, index, state };
	}

	it("dispatches distinct intents from TUI actions and never guesses a target on virtual summary", () => {
		const { index, state } = createFixture();

		let returnedIntent: ExplorerResult | null = null;
		state.displayOptions.showAssistantNodes = true;
		const newComponent = () =>
			new SessionTreeComponent({
				tui: { requestRender() {} },
				theme: {},
				done: (res) => {
					returnedIntent = res;
				},
				index,
				state,
			});
		let comp = newComponent();

		// 1. Enter on real entry dispatches navigate intent
		state.selectedEntryId = "asst1";
		comp.handleInput("\r");
		expect(returnedIntent).toEqual({
			type: "navigate",
			entryId: "asst1",
			summarize: undefined,
		});

		// 2. 'f' on real entry dispatches fork 'at' intent
		returnedIntent = null;
		comp = newComponent();
		comp.handleInput("f");
		expect(returnedIntent).toEqual({
			type: "fork",
			entryId: "asst1",
			position: "at",
		});

		// 3. 'F' on real entry dispatches fork 'before' intent
		returnedIntent = null;
		comp = newComponent();
		comp.handleInput("F");
		expect(returnedIntent).toEqual({
			type: "fork",
			entryId: "asst1",
			position: "before",
		});

		// Real projected summaries, not fabricated strings, own an expansion target.
		const virtualFixture = () => {
			const virtualIndex = buildTreeIndex([
				...index.entryById.values(),
				{
					id: "other",
					parentId: "user1",
					type: "message",
					timestamp: "T5",
					message: { role: "user", content: "other branch" },
				},
			]);
			const virtualState = createInitialState("virtual", {
				selectedEntryId: "virtual:branch:other",
			});
			return {
				state: virtualState,
				component: new SessionTreeComponent({
					tui: { requestRender() {} },
					theme: {},
					done: (r) => {
						returnedIntent = r;
					},
					index: virtualIndex,
					state: virtualState,
				}),
			};
		};
		returnedIntent = null;
		const expanded = virtualFixture();
		expanded.component.handleInput("\r");
		expect(returnedIntent).toBeNull();
		expect(expanded.state.manualExpandedIds.has("other")).toBe(true);
		expanded.component.dispose();
		const rejected = virtualFixture();
		rejected.component.handleInput("f");
		rejected.component.handleInput("F");
		expect(returnedIntent).toBeNull();
		rejected.component.dispose();
	});

	it("executes Navigate with summarize=false by default and preserves session file", async () => {
		const { entries } = createFixture();
		let navigatedTarget = "";
		let navigatedSummarize: boolean | undefined = true;

		const mockCtx: unknown = {
			isIdle: () => true,
			sessionManager: {
				getEntry: (id: string) => entries.find((e) => e.id === id),
				getLeafId: () => "asst2",
			},
			navigateTree: vi.fn(
				async (
					targetId: string,
					options?: {
						summarize?: boolean;
						position?: string;
						withSession?: (ctx: unknown) => Promise<void>;
					},
				) => {
					navigatedTarget = targetId;
					navigatedSummarize = options?.summarize;
					return { cancelled: false };
				},
			),
		};

		const config = getDefaultConfig();
		const res = await executeSessionIntent({
			intent: { type: "navigate", entryId: "user1" },
			ctx: mockCtx as never,
			config,
		});

		expect(res.success).toBe(true);
		expect(navigatedTarget).toBe("user1");
		// Default summarize must be false per Spec R09 to prevent silent model charges
		expect(navigatedSummarize).toBe(false);
	});

	it("executes Fork At passing position='at' without restoring editor prompt", async () => {
		const { entries } = createFixture();
		let forkedTarget = "";
		let forkedPosition = "";
		let withSessionCalled = false;

		const mockCtx: unknown = {
			isIdle: () => true,
			sessionManager: {
				getEntry: (id: string) => entries.find((e) => e.id === id),
			},
			fork: vi.fn(
				async (
					targetId: string,
					options?: {
						summarize?: boolean;
						position?: string;
						withSession?: (ctx: unknown) => Promise<void>;
					},
				) => {
					forkedTarget = targetId;
					forkedPosition = options?.position ?? "";
					if (options?.withSession) {
						withSessionCalled = true;
						await options.withSession({
							ui: { notify: vi.fn() },
						});
					}
					return { cancelled: false };
				},
			),
		};

		const config = getDefaultConfig();
		const res = await executeSessionIntent({
			intent: { type: "fork", entryId: "asst1", position: "at" },
			ctx: mockCtx as never,
			config,
		});

		expect(res.success).toBe(true);
		expect(forkedTarget).toBe("asst1");
		expect(forkedPosition).toBe("at");
		expect(withSessionCalled).toBe(true);
	});

	it("executes Fork Before only on user messages and rejects non-user entries", async () => {
		const { entries } = createFixture();
		let forkedPosition = "";
		let warnedMessage = "";

		const mockCtx: unknown = {
			isIdle: () => true,
			sessionManager: {
				getEntry: (id: string) => entries.find((e) => e.id === id),
			},
			fork: vi.fn(
				async (
					_targetId: string,
					options?: {
						summarize?: boolean;
						position?: string;
						withSession?: (ctx: unknown) => Promise<void>;
					},
				) => {
					forkedPosition = options?.position ?? "";
					return { cancelled: false };
				},
			),
		};

		const config = getDefaultConfig();

		// 1. Fork Before on assistant entry (asst1) should be REJECTED
		const rejectRes = await executeSessionIntent({
			intent: { type: "fork", entryId: "asst1", position: "before" },
			ctx: mockCtx as never,
			config,
			onNotify: (msg) => {
				warnedMessage = msg;
			},
		});

		expect(rejectRes.success).toBe(false);
		expect(rejectRes.error).toContain(
			"Fork Before is only available for user messages",
		);
		expect(warnedMessage).toContain(
			"Fork Before is only available for user messages",
		);
		expect(
			(mockCtx as { fork: ReturnType<typeof vi.fn> }).fork,
		).not.toHaveBeenCalled();

		// 2. Fork Before on user entry (user2) should SUCCEED
		const okRes = await executeSessionIntent({
			intent: { type: "fork", entryId: "user2", position: "before" },
			ctx: mockCtx as never,
			config,
		});

		expect(okRes.success).toBe(true);
		expect(forkedPosition).toBe("before");
	});

	it("rejects navigation and fork safely when agent is busy (isIdle = false)", async () => {
		const { entries } = createFixture();
		let busyWarning = "";

		const mockCtx: unknown = {
			isIdle: () => false, // AGENT BUSY!
			sessionManager: {
				getEntry: (id: string) => entries.find((e) => e.id === id),
			},
			navigateTree: vi.fn(),
			fork: vi.fn(),
		};

		const config = getDefaultConfig();

		// Busy Navigate
		const navRes = await executeSessionIntent({
			intent: { type: "navigate", entryId: "user1" },
			ctx: mockCtx as never,
			config,
			onNotify: (msg) => {
				busyWarning = msg;
			},
		});
		expect(navRes.success).toBe(false);
		expect(navRes.error).toContain(
			"Wait for the current response or compaction to finish",
		);
		expect(busyWarning).toContain(
			"Wait for the current response or compaction to finish",
		);
		expect(
			(mockCtx as { navigateTree: ReturnType<typeof vi.fn> }).navigateTree,
		).not.toHaveBeenCalled();

		// Busy Fork
		const forkRes = await executeSessionIntent({
			intent: { type: "fork", entryId: "user1", position: "at" },
			ctx: mockCtx as never,
			config,
		});
		expect(forkRes.success).toBe(false);
		expect(forkRes.error).toContain(
			"Wait for the current response or compaction to finish",
		);
		expect(
			(mockCtx as { fork: ReturnType<typeof vi.fn> }).fork,
		).not.toHaveBeenCalled();
	});

	it("detects missing target entry and handles host cancellation honestly", async () => {
		let notified = "";
		const mockCtx: unknown = {
			isIdle: () => true,
			sessionManager: {
				getEntry: () => undefined, // Target missing!
			},
			navigateTree: vi.fn(),
			fork: vi.fn(),
		};

		const config = getDefaultConfig();

		// Missing target
		const missingRes = await executeSessionIntent({
			intent: { type: "navigate", entryId: "vanished_id" },
			ctx: mockCtx as never,
			config,
			onNotify: (msg) => {
				notified = msg;
			},
		});
		expect(missingRes.success).toBe(false);
		expect(missingRes.error).toContain("no longer exists");
		expect(notified).toContain("no longer exists");

		// Extension cancellation on Navigate
		const mockCtx2: unknown = {
			isIdle: () => true,
			sessionManager: {
				getEntry: () => ({ type: "message", id: "ok", parentId: null }),
			},
			navigateTree: vi.fn(async () => ({ cancelled: true })), // Extension cancelled
		};
		const cancelRes = await executeSessionIntent({
			intent: { type: "navigate", entryId: "ok" },
			ctx: mockCtx2 as never,
			config,
		});
		expect(cancelRes.success).toBe(false);
		expect(cancelRes.cancelled).toBe(true);
	});

	it("triggers replacement cleanup callback upon fork with fresh context guarantee", async () => {
		const { entries } = createFixture();
		let cleanupCalled = false;

		const mockCtx: unknown = {
			isIdle: () => true,
			sessionManager: {
				getEntry: (id: string) => entries.find((e) => e.id === id),
			},
			fork: vi.fn(
				async (
					_id: string,
					options?: {
						summarize?: boolean;
						position?: string;
						withSession?: (ctx: unknown) => Promise<void>;
					},
				) => {
					if (options?.withSession) {
						await options.withSession({
							isReplacement: true,
							ui: { notify: vi.fn() },
						});
					}
					return { cancelled: false };
				},
			),
		};

		const config = getDefaultConfig();
		const res = await executeSessionIntent({
			intent: { type: "fork", entryId: "asst1", position: "at" },
			ctx: mockCtx as never,
			config,
			onReplacementCleanup: () => {
				cleanupCalled = true;
			},
		});

		expect(res.success).toBe(true);
		expect(cleanupCalled).toBe(true);
	});
});
