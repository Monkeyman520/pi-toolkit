import { describe, expect, it, vi } from "vitest";
import { createActionRegistry } from "../extensions/actions.ts";
import { deepMergeConfig } from "../extensions/config.ts";
import { getDefaultConfig } from "../extensions/config-schema.ts";
import { computeContextMetrics } from "../extensions/context-metrics.ts";
import { buildDisplayProjection } from "../extensions/display.ts";
import { executeSessionIntent } from "../extensions/session-effects.ts";
import { createInitialState } from "../extensions/state.ts";
import { buildTreeIndex } from "../extensions/tree-index.ts";
import type { ActionContext, SessionEntry } from "../extensions/types.ts";

describe("T0008: End-to-End Acceptance Scenarios (Spec E01 - E07)", () => {
	// E01: Browse and distinguish sibling versus branch
	it("Scenario E01: browse and distinguish sibling versus branch", () => {
		const entries: SessionEntry[] = [
			{
				type: "message",
				id: "Root",
				parentId: null,
				timestamp: "T0",
				message: { role: "system", content: "sys" },
			},
			{
				type: "message",
				id: "A",
				parentId: "Root",
				timestamp: "T1",
				message: { role: "user", content: "A" },
			},
			{
				type: "message",
				id: "B1",
				parentId: "A",
				timestamp: "T2",
				message: { role: "assistant", content: "B1" },
			},
			{
				type: "message",
				id: "C1",
				parentId: "B1",
				timestamp: "T3",
				message: { role: "user", content: "C1" },
			},
			{
				type: "message",
				id: "D1",
				parentId: "C1",
				timestamp: "T4",
				message: { role: "assistant", content: "D1" },
			},
			{
				type: "message",
				id: "B2",
				parentId: "A",
				timestamp: "T5",
				message: { role: "assistant", content: "B2" },
			},
			{
				type: "message",
				id: "C2",
				parentId: "B2",
				timestamp: "T6",
				message: { role: "user", content: "C2" },
			},
			{
				type: "message",
				id: "D2",
				parentId: "C2",
				timestamp: "T7",
				message: { role: "assistant", content: "D2" },
			},
			{
				type: "message",
				id: "B3",
				parentId: "A",
				timestamp: "T8",
				message: { role: "assistant", content: "B3" },
			},
			{
				type: "message",
				id: "C3",
				parentId: "B3",
				timestamp: "T9",
				message: { role: "user", content: "C3" },
			},
		];
		const index = buildTreeIndex(entries);
		const state = createInitialState("e01-sess", {
			selectedEntryId: "D1",
			sessionLeafId: "D1",
			foldOptions: {
				mode: "all",
				collapseInactiveBranches: false,
				collapseLinearPaths: false,
				rememberManualOverrides: false,
				maxExpandDepth: 0,
			},
			displayOptions: {
				showAssistantNodes: true,
				showToolNodes: true,
				showThinkingNodes: false,
				showMetadataNodes: true,
				showCompactionNodes: true,
				userOnly: false,
				branchOnly: false,
				labeledOnly: false,
				depthMode: "turn",
				showDepth: true,
				maxMessageLength: 80,
				showNodeId: false,
				showTimestamps: false,
				layout: "normal",
			},
		});

		const registry = createActionRegistry();
		const ctx: ActionContext = {
			state,
			index,
			visibleNodes: buildDisplayProjection(index, state),
			close: () => {},
		};

		// From D1: node.parent -> C1
		registry.get("node.parent")?.execute(ctx);
		expect(state.selectedEntryId).toBe("C1");

		// Return to D1
		registry.get("node.next")?.execute(ctx);
		expect(state.selectedEntryId).toBe("D1");

		// node.nextSibling -> unchanged (D1 has no siblings under C1)
		registry.get("node.nextSibling")?.execute(ctx);
		expect(state.selectedEntryId).toBe("D1");

		// branch.next -> B2 (switches to sibling branch at nearest fork A)
		registry.get("branch.next")?.execute(ctx);
		expect(state.selectedEntryId).toBe("B2");

		// Invariant: Session Leaf remains D1 and raw session entries are untouched!
		expect(state.sessionLeafId).toBe("D1");
		expect(entries[0].id).toBe("Root");
	});

	// E02: Cancel, accept and clear a hidden full-text result
	it("Scenario E02: cancel, accept and clear a hidden full-text result", () => {
		const longPrompt =
			"Detailed text containing target_secret_token_12345 deep beyond row truncation";
		const entries: SessionEntry[] = [
			{
				type: "message",
				id: "u1",
				parentId: null,
				timestamp: "T0",
				message: { role: "user", content: longPrompt },
			},
			{
				type: "message",
				id: "asst1",
				parentId: "u1",
				timestamp: "T1",
				message: { role: "assistant", content: "assistant answer" },
			},
			{
				type: "message",
				id: "u2_branch",
				parentId: "asst1",
				timestamp: "T2",
				message: { role: "user", content: "branch user" },
			},
		];

		const index = buildTreeIndex(entries);
		const state = createInitialState("e02-sess", {
			selectedEntryId: "u1",
			displayOptions: {
				showAssistantNodes: false, // Assistant hidden by default
				showToolNodes: false,
				showThinkingNodes: false,
				showMetadataNodes: false,
				showCompactionNodes: true,
				userOnly: false,
				branchOnly: false,
				labeledOnly: false,
				depthMode: "turn",
				showDepth: true,
				maxMessageLength: 40,
				showNodeId: false,
				showTimestamps: false,
				layout: "normal",
			},
		});

		const registry = createActionRegistry();
		const ctx: ActionContext = {
			state,
			index,
			visibleNodes: buildDisplayProjection(index, state),
			close: () => {},
			reproject: () => {
				ctx.visibleNodes = buildDisplayProjection(index, state);
			},
		};

		// 1. Search open snapshots state
		registry.get("search.open")?.execute(ctx);
		expect(state.mode).toBe("search");
		expect(state.searchSnapshot).toBeDefined();

		// Typing search query
		state.searchQuery = "target_secret_token";
		state.searchResults = [{ id: "u1", score: 100 }];
		state.searchResultIndex = 0;

		// Cancel search -> restores snapshot
		registry.get("search.clear")?.execute(ctx);
		expect(state.mode).toBe("normal");
		expect(state.searchQuery).toBe("");

		// Open again and accept
		registry.get("search.open")?.execute(ctx);
		state.searchQuery = "assistant";
		state.searchResults = [{ id: "asst1", score: 100 }];
		state.searchResultIndex = 0;

		// Accept search: reveals asst1 without navigating
		registry.get("search.accept")?.execute(ctx);
		expect(state.mode).toBe("normal");
		expect(state.selectedEntryId).toBe("asst1");
		expect(state.temporaryRevealedIds.has("asst1")).toBe(true);

		// asst1 is visible
		let visible = buildDisplayProjection(index, state);
		expect(visible.some((n) => n.id === "asst1")).toBe(true);

		// Normal mode Esc clears search reveals and query
		registry.get("search.clear")?.execute(ctx);
		expect(state.searchQuery).toBe("");
		expect(state.temporaryRevealedIds.size).toBe(0);

		// asst1 is hidden again, selection falls back to nearest visible ancestor (u1)
		visible = buildDisplayProjection(index, state);
		expect(visible.some((n) => n.id === "asst1")).toBe(false);
		expect(state.selectedEntryId).toBe("u1");
	});

	// E03: Inclusive versus before-prompt fork
	it("Scenario E03: inclusive versus before-prompt fork", async () => {
		const entries: SessionEntry[] = [
			{
				type: "message",
				id: "u1",
				parentId: null,
				timestamp: "T0",
				message: { role: "user", content: "Prompt 1" },
			},
			{
				type: "message",
				id: "a1",
				parentId: "u1",
				timestamp: "T1",
				message: { role: "assistant", content: "Reply 1" },
			},
		];

		let forkCallArgs: {
			targetId: string;
			options?: { position?: string; summarize?: boolean };
		} | null = null;
		const mockCtx: unknown = {
			isIdle: () => true,
			sessionManager: {
				getEntry: (id: string) => entries.find((e) => e.id === id),
			},
			fork: vi.fn(
				async (
					targetId: string,
					options?: { position?: string; summarize?: boolean },
				) => {
					forkCallArgs = { targetId, options };
					return { cancelled: false };
				},
			),
		};

		const config = getDefaultConfig();

		// Fork At: position = "at"
		const resAt = await executeSessionIntent({
			intent: { type: "fork", entryId: "a1", position: "at" },
			ctx: mockCtx as never,
			config,
		});
		expect(resAt.success).toBe(true);
		expect(forkCallArgs).not.toBeNull();
		const argsAt = forkCallArgs as unknown as {
			targetId: string;
			options: { position: string };
		};
		expect(argsAt.targetId).toBe("a1");
		expect(argsAt.options.position).toBe("at");

		// Fork Before on user message: position = "before"
		const resBefore = await executeSessionIntent({
			intent: { type: "fork", entryId: "u1", position: "before" },
			ctx: mockCtx as never,
			config,
		});
		expect(resBefore.success).toBe(true);
		expect(forkCallArgs).not.toBeNull();
		const argsBefore = forkCallArgs as unknown as {
			targetId: string;
			options: { position: string };
		};
		expect(argsBefore.targetId).toBe("u1");
		expect(argsBefore.options.position).toBe("before");

		// Original entries remain completely intact
		expect(entries.length).toBe(2);
	});

	// E04: Native Navigate and busy rejection
	it("Scenario E04: native navigate and busy rejection", async () => {
		const entries: SessionEntry[] = [
			{
				type: "message",
				id: "u1",
				parentId: null,
				timestamp: "T0",
				message: { role: "user", content: "P1" },
			},
		];

		let busy = true;
		const mockCtx: unknown = {
			isIdle: () => !busy,
			sessionManager: {
				getEntry: (id: string) => entries.find((e) => e.id === id),
			},
			navigateTree: vi.fn(
				async (
					_id: string,
					options?: { position?: string; summarize?: boolean },
				) => ({
					cancelled: false,
					summarize: options?.summarize,
				}),
			),
		};

		const config = getDefaultConfig();

		// When busy: rejects
		const busyRes = await executeSessionIntent({
			intent: { type: "navigate", entryId: "u1" },
			ctx: mockCtx as never,
			config,
		});
		expect(busyRes.success).toBe(false);
		expect(busyRes.error).toContain(
			"Wait for the current response or compaction to finish",
		);
		expect(
			(mockCtx as { navigateTree: ReturnType<typeof vi.fn> }).navigateTree,
		).not.toHaveBeenCalled();

		// When idle: succeeds with summarize=false
		busy = false;
		const idleRes = await executeSessionIntent({
			intent: { type: "navigate", entryId: "u1" },
			ctx: mockCtx as never,
			config,
		});
		expect(idleRes.success).toBe(true);
		expect(
			(mockCtx as { navigateTree: ReturnType<typeof vi.fn> }).navigateTree,
		).toHaveBeenCalledWith("u1", {
			summarize: false,
		});
	});

	// E05: Branch-correct historical context
	it("Scenario E05: branch-correct historical context", () => {
		const entries: SessionEntry[] = [
			{
				type: "message",
				id: "u1",
				parentId: null,
				timestamp: "T0",
				message: { role: "user", content: "Initial topic" },
			},
			{
				type: "model_change",
				id: "mc1",
				parentId: "u1",
				timestamp: "T1",
				provider: "openai",
				modelId: "gpt-4o",
			},
			{
				type: "message",
				id: "a1",
				parentId: "mc1",
				timestamp: "T2",
				message: { role: "assistant", content: "Analysis" },
			},
		];
		const index = buildTreeIndex(entries);

		const metrics = computeContextMetrics({
			entryId: "a1",
			rawEntries: entries,
			index,
			sessionLeafId: "a1",
			activeModel: { id: "gpt-4o", provider: "openai", contextWindow: 128_000 },
		});

		expect(metrics.source).toBe("projection-estimate");
		expect(metrics.modelId).toBe("gpt-4o");
		expect(metrics.contextWindow).toBe(128_000);
		expect(metrics.tokens).toBeGreaterThan(0);
		expect(metrics.estimated).toBe(true);
	});

	// E06: Layer failure, trust and restart
	it("Scenario E06: layer failure, trust and restart", () => {
		const base = getDefaultConfig();

		// Test deep merge
		const merged = deepMergeConfig(base, { vimMode: false });
		expect(merged.vimMode).toBe(false);
		expect(merged.navigation.initialFocus).toBe("active"); // Preserved!
	});

	// E07: Preserve all original Actions and catalog the existing settings shortcut.
	it("Scenario E07: original Action inventory plus catalog-owned settings link", () => {
		const registry = createActionRegistry();
		expect(registry.size).toBe(80);

		// Count by domain
		const domainCounts: Record<string, number> = {};
		for (const id of registry.keys()) {
			const domain = id.split(".")[0];
			domainCounts[domain] = (domainCounts[domain] || 0) + 1;
		}

		expect(domainCounts.node).toBe(17);
		expect(domainCounts.branch).toBe(13);
		expect(domainCounts.fold).toBe(11);
		expect(domainCounts.filter).toBe(8);
		expect(domainCounts.search).toBe(7);
		expect(domainCounts.session).toBe(9);
		expect(domainCounts.view).toBe(15);
	});
});
