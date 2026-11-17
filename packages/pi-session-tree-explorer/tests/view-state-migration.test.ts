import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
	type ExtensionAPI,
	type ExtensionCommandContext,
	SessionManager,
} from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createActionRegistry } from "../extensions/actions.ts";
import plugin from "../extensions/index.ts";
import { createInitialState } from "../extensions/state.ts";
import { buildTreeIndex } from "../extensions/tree-index.ts";
import type { SessionTreeComponent } from "../extensions/tui.ts";
import type {
	ActionContext,
	ExplorerResult,
	SessionEntry,
} from "../extensions/types.ts";
import {
	getViewStateFilePath,
	loadViewState,
	saveViewState,
} from "../extensions/view-state.ts";

describe("T0002: Three-Tier State Architecture & Schema v2 Migration", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), "pi-stree-tier-migration-"));
	});

	afterEach(async () => {
		vi.unstubAllEnvs();
		await rm(tempDir, { recursive: true, force: true });
	});

	function createEntries(): SessionEntry[] {
		return [
			{
				type: "message",
				id: "root",
				parentId: null,
				timestamp: "T0",
				message: { role: "user", content: "Root prompt" },
			},
			{
				type: "message",
				id: "a1",
				parentId: "root",
				timestamp: "T1",
				message: { role: "assistant", content: "Assistant reply" },
			},
			{
				type: "message",
				id: "u2",
				parentId: "a1",
				timestamp: "T2",
				message: { role: "user", content: "Follow-up prompt" },
			},
		];
	}

	it("writes schema version 2 without full displayOptions snapshots or activeLeafId", async () => {
		const entries = createEntries();
		const index = buildTreeIndex(entries);
		const state = createInitialState("sess-v2-clean", {
			selectedEntryId: "u2",
			sessionLeafId: "u2",
			focusedBranchId: "a1",
			manualExpandedIds: new Set(["root"]),
			manualCollapsedIds: new Set(["a1"]),
		});

		// Without explicit user toggles, no explicitDisplayOverrides should be saved
		await saveViewState(tempDir, "sess-v2-clean", state);
		const filePath = getViewStateFilePath(tempDir, "sess-v2-clean");
		const saved = JSON.parse(await readFile(filePath, "utf8"));

		expect(saved.version).toBe(2);
		expect(saved.sessionId).toBe("sess-v2-clean");
		expect(saved.selectedNodeId).toBe("u2");
		expect(saved.focusedBranchId).toBe("a1");
		expect(saved.displayOptions).toBeUndefined();
		expect(saved.sessionLeafId).toBeUndefined();
		expect(saved.activeLeafId).toBeUndefined();
		expect(saved.explicitDisplayOverrides).toBeUndefined();

		// User toggles only userOnly -> only userOnly is persisted in explicitDisplayOverrides
		const registry = createActionRegistry();
		const ctx: ActionContext = {
			state,
			index,
			visibleNodes: [],
			close: () => {},
		};
		registry.get("filter.userOnly")?.execute(ctx);
		await saveViewState(tempDir, "sess-v2-clean", state);

		const savedWithOverride = JSON.parse(await readFile(filePath, "utf8"));
		expect(savedWithOverride.version).toBe(2);
		expect(savedWithOverride.displayOptions).toBeUndefined();
		expect(savedWithOverride.explicitDisplayOverrides).toEqual({
			userOnly: true,
		});
	});

	it("migrates legacy version 1 view state, discards polluted displayOptions, and filters stale IDs", async () => {
		const index = buildTreeIndex(createEntries());
		const sessionId = "sess-legacy-v1";
		const filePath = getViewStateFilePath(tempDir, sessionId);
		await mkdir(dirname(filePath), { recursive: true });

		const legacyV1 = {
			version: 1,
			sessionId,
			focusedBranchId: "a1",
			displayOptions: {
				showAssistantNodes: false,
				showToolNodes: false,
				showThinkingNodes: false,
				showMetadataNodes: false,
				showCompactionNodes: true,
				depthMode: "turn",
				showDepth: true,
				maxMessageLength: 80,
				showNodeId: false,
				showTimestamps: false,
				layout: "normal",
				userOnly: false,
				branchOnly: false,
				labeledOnly: false,
			},
			showDetails: false,
			showContext: true,
			manualExpandedIds: ["root", "stale-deleted-1"],
			manualCollapsedIds: ["u2", "stale-deleted-2"],
		};
		await writeFile(filePath, JSON.stringify(legacyV1, null, 2), "utf8");

		const loaded = await loadViewState(tempDir, sessionId, index, true);
		expect(loaded).not.toBeNull();
		expect(loaded?.migratedFromVersion).toBe(1);
		expect(loaded?.explicitDisplayOverrides).toBeUndefined();
		expect(loaded?.showDetails).toBe(false);
		expect(loaded?.showContext).toBe(true);
		expect(loaded?.focusedBranchId).toBe("a1");
		expect(Array.from(loaded?.manualExpandedIds ?? [])).toEqual(["root"]);
		expect(Array.from(loaded?.manualCollapsedIds ?? [])).toEqual(["u2"]);

		// Saving next writes clean v2 JSON without full displayOptions
		const nextState = createInitialState(sessionId, {
			focusedBranchId: loaded?.focusedBranchId ?? null,
			manualExpandedIds: loaded?.manualExpandedIds,
			manualCollapsedIds: loaded?.manualCollapsedIds,
			showDetails: loaded?.showDetails,
			showContext: loaded?.showContext,
		});
		await saveViewState(tempDir, sessionId, nextState);
		const migratedOnDisk = JSON.parse(await readFile(filePath, "utf8"));
		expect(migratedOnDisk.version).toBe(2);
		expect(migratedOnDisk.displayOptions).toBeUndefined();
		expect(migratedOnDisk.manualExpandedIds).toEqual(["root"]);
		expect(migratedOnDisk.manualCollapsedIds).toEqual(["u2"]);
	});

	it("lets global session-tree.json changes take effect immediately over legacy v1 cache and keeps sessionLeafId authoritative", async () => {
		vi.stubEnv("PI_CODING_AGENT_DIR", tempDir);
		const session = SessionManager.inMemory(tempDir);
		const u1 = session.appendMessage({
			role: "user",
			content: "First question",
			timestamp: Date.now(),
		});
		const a1 = session.appendMessage({
			role: "assistant",
			content: [
				{ type: "text", text: "Assistant detailed answer should be visible" },
			],
			api: "anthropic-messages",
			provider: "anthropic",
			model: "claude-sonnet-4-5",
			usage: {
				input: 10,
				output: 5,
				cacheRead: 0,
				cacheWrite: 0,
				totalTokens: 15,
				cost: {
					input: 0,
					output: 0,
					cacheRead: 0,
					cacheWrite: 0,
					total: 0,
				},
			},
			stopReason: "stop",
			timestamp: Date.now(),
		});

		const sessionId = session.getSessionId();
		// Write legacy v1 view state that had showAssistantNodes: false snapshot
		const statePath = getViewStateFilePath(tempDir, sessionId);
		await mkdir(dirname(statePath), { recursive: true });
		await writeFile(
			statePath,
			JSON.stringify({
				version: 1,
				sessionId,
				focusedBranchId: u1,
				displayOptions: {
					showAssistantNodes: false,
					showToolNodes: false,
					showThinkingNodes: false,
					showMetadataNodes: false,
					showCompactionNodes: true,
					depthMode: "turn",
					showDepth: true,
					maxMessageLength: 80,
					showNodeId: false,
					showTimestamps: false,
					layout: "normal",
				},
			}),
			"utf8",
		);

		// Global config enables showAssistantNodes: true
		await writeFile(
			join(tempDir, "session-tree.json"),
			JSON.stringify({
				display: { showAssistantNodes: true },
			}),
			"utf8",
		);

		let handler:
			| ((args: string, ctx: ExtensionCommandContext) => Promise<void>)
			| undefined;
		plugin({
			on() {},
			events: { on() {}, emit() {} },
			registerCommand(_name: string, definition: { handler: typeof handler }) {
				handler = definition.handler;
			},
			setLabel() {},
		} as unknown as ExtensionAPI);

		let rendered = "";
		let capturedLeafId: string | null = null;
		let capturedShowAssistant = false;

		const ctx = {
			cwd: tempDir,
			mode: "tui",
			sessionManager: session,
			isProjectTrusted: () => false,
			isIdle: () => true,
			getContextUsage: () => null,
			ui: {
				notify: () => {},
				custom: async (
					factory: (
						tui: unknown,
						theme: unknown,
						kb: unknown,
						done: (result: ExplorerResult) => void,
					) => SessionTreeComponent,
				) => {
					let result: ExplorerResult | undefined;
					const comp = factory({ requestRender() {} }, {}, {}, (r) => {
						result = r;
					});
					rendered = comp.render(120).join("\n");
					const nodes = comp.getVisibleNodes();
					capturedShowAssistant = nodes.some((n) => n.realId === a1);
					capturedLeafId = nodes.find((n) => n.isCurrentLeaf)?.realId ?? null;
					comp.handleInput("q");
					return result;
				},
			},
		};

		if (!handler) throw new Error("Missing stree handler");
		await handler("", ctx as unknown as ExtensionCommandContext);

		expect(capturedShowAssistant).toBe(true);
		expect(rendered).toContain("Assistant detailed answer should be visible");
		expect(capturedLeafId).toBe(a1);

		// After closing, disk file is migrated to version 2 without full displayOptions
		const migrated = JSON.parse(await readFile(statePath, "utf8"));
		expect(migrated.version).toBe(2);
		expect(migrated.displayOptions).toBeUndefined();
	});
});
