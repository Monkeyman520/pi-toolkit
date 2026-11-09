import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createInitialState } from "../extensions/state.ts";
import { buildTreeIndex } from "../extensions/tree-index.ts";
import type { SessionEntry } from "../extensions/types.ts";
import {
	getViewStateFilePath,
	loadViewState,
	saveViewState,
} from "../extensions/view-state.ts";

describe("T0007: Per-Session View State Persistence & Stale ID Filtering", () => {
	let tempAgentDir: string;

	beforeEach(async () => {
		tempAgentDir = await mkdtemp(join(tmpdir(), "pi-session-tree-state-test-"));
	});

	afterEach(async () => {
		await rm(tempAgentDir, { recursive: true, force: true });
	});

	function createFixture() {
		const entries: SessionEntry[] = [
			{ type: "message", id: "root", parentId: null, timestamp: "T0" },
			{ type: "message", id: "child1", parentId: "root", timestamp: "T1" },
			{ type: "message", id: "child2", parentId: "root", timestamp: "T2" },
		];
		const index = buildTreeIndex(entries);
		return { entries, index };
	}

	it("saves view state in independent state file outside Session JSONL", async () => {
		createFixture();
		const state = createInitialState("sess-abc-123", {
			focusedBranchId: "child1",
			showDetails: false,
			showContext: false,
			manualExpandedIds: new Set(["child1"]),
			manualCollapsedIds: new Set(["child2"]),
			// Temporary search data that MUST NOT be persisted:
			searchQuery: "temporary_query_xyz",
			temporaryRevealedIds: new Set(["child2"]),
			searchResults: [{ id: "child2", score: 99 }],
		});

		await saveViewState(tempAgentDir, "sess-abc-123", state);

		const expectedFile = getViewStateFilePath(tempAgentDir, "sess-abc-123");
		const content = await readFile(expectedFile, "utf8");
		const json = JSON.parse(content);

		expect(json.sessionId).toBe("sess-abc-123");
		expect(json.focusedBranchId).toBe("child1");
		expect(json.showDetails).toBe(false);
		expect(json.showContext).toBe(false);
		expect(json.manualExpandedIds).toEqual(["child1"]);
		expect(json.manualCollapsedIds).toEqual(["child2"]);

		// MUST NOT persist temporary search queries or reveals!
		expect(json.searchQuery).toBeUndefined();
		expect(json.temporaryRevealedIds).toBeUndefined();
		expect(json.searchResults).toBeUndefined();
	});

	it("skips saving when session is ephemeral", async () => {
		const state = createInitialState("ephemeral");
		await saveViewState(tempAgentDir, "ephemeral", state);

		const expectedFile = getViewStateFilePath(tempAgentDir, "ephemeral");
		const exists = await readFile(expectedFile, "utf8")
			.then(() => true)
			.catch(() => false);
		expect(exists).toBe(false);
	});

	it("restores saved state and filters out stale/vanished entry IDs", async () => {
		const { index } = createFixture();
		const state = createInitialState("sess-filter-stale", {
			focusedBranchId: "child1",
			manualExpandedIds: new Set(["child1", "stale_vanished_id_1"]),
			manualCollapsedIds: new Set(["child2", "stale_vanished_id_2"]),
		});

		await saveViewState(tempAgentDir, "sess-filter-stale", state);

		// Load with index that does NOT have the stale IDs
		const loaded = await loadViewState(
			tempAgentDir,
			"sess-filter-stale",
			index,
			true,
		);
		expect(loaded).not.toBeNull();

		// Stale IDs must be filtered out!
		expect(Array.from(loaded?.manualExpandedIds ?? [])).toEqual(["child1"]);
		expect(Array.from(loaded?.manualCollapsedIds ?? [])).toEqual(["child2"]);
	});

	it("ignores manual overrides when rememberManualOverrides is false", async () => {
		const { index } = createFixture();
		const state = createInitialState("sess-no-overrides", {
			manualExpandedIds: new Set(["child1"]),
		});

		await saveViewState(tempAgentDir, "sess-no-overrides", state);

		// Load with rememberManualOverrides = false
		const loaded = await loadViewState(
			tempAgentDir,
			"sess-no-overrides",
			index,
			false,
		);
		expect(loaded).not.toBeNull();
		expect(loaded?.manualExpandedIds).toBeUndefined();
	});
});
