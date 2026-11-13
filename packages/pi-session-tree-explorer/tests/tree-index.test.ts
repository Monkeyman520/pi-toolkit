import { describe, expect, it } from "vitest";
import { buildTreeIndex } from "../extensions/tree-index.ts";
import type { SessionEntry } from "../extensions/types.ts";

describe("buildTreeIndex", () => {
	it("handles an empty entry list", () => {
		const index = buildTreeIndex([]);
		expect(index.entryById.size).toBe(0);
		expect(index.rootIds).toEqual([]);
		expect(index.forkPointIds.size).toBe(0);
		expect(index.leafIds.size).toBe(0);
		expect(index.preorderIds).toEqual([]);
	});

	it("indexes a single root entry", () => {
		const entries: SessionEntry[] = [
			{
				type: "message",
				id: "r1",
				parentId: null,
				timestamp: "2026-11-09T00:00:00Z",
				message: { role: "system", content: "You are a coding assistant" },
			},
		];
		const index = buildTreeIndex(entries);
		expect(index.rootIds).toEqual(["r1"]);
		expect(index.rawDepthById.get("r1")).toBe(0);
		expect(index.turnDepthById.get("r1")).toBe(0);
		expect(index.branchDepthById.get("r1")).toBe(0);
		expect(index.forkPointIds.size).toBe(0);
		expect(Array.from(index.leafIds)).toEqual(["r1"]);
		expect(index.preorderIds).toEqual(["r1"]);
	});

	it("indexes multiple roots preserving session order", () => {
		const entries: SessionEntry[] = [
			{
				type: "message",
				id: "r1",
				parentId: null,
				timestamp: "2026-11-09T00:00:00Z",
			},
			{
				type: "message",
				id: "r2",
				parentId: null,
				timestamp: "2026-11-09T00:00:01Z",
			},
		];
		const index = buildTreeIndex(entries);
		expect(index.rootIds).toEqual(["r1", "r2"]);
		expect(index.preorderIds).toEqual(["r1", "r2"]);
		expect(index.rawDepthById.get("r1")).toBe(0);
		expect(index.rawDepthById.get("r2")).toBe(0);
	});

	it("computes rawDepth, turnDepth, and branchDepth accurately per U1 specification", () => {
		// Root (system)                  raw=0  turn=0  branch=0
		// └─ User A (user)               raw=1  turn=1  branch=0
		//    └─ Assistant (assistant)    raw=2  turn=1  branch=0 (fork point)
		//       ├─ User B (user)         raw=3  turn=2  branch=1
		//       └─ User C (user)         raw=3  turn=2  branch=1
		const entries: SessionEntry[] = [
			{
				type: "message",
				id: "root",
				parentId: null,
				timestamp: "2026-11-09T00:00:00Z",
				message: { role: "system", content: "sys" },
			},
			{
				type: "message",
				id: "userA",
				parentId: "root",
				timestamp: "2026-11-09T00:00:01Z",
				message: { role: "user", content: "A" },
			},
			{
				type: "message",
				id: "asstA",
				parentId: "userA",
				timestamp: "2026-11-09T00:00:02Z",
				message: { role: "assistant", content: "Hi" },
			},
			{
				type: "message",
				id: "userB",
				parentId: "asstA",
				timestamp: "2026-11-09T00:00:03Z",
				message: { role: "user", content: "B" },
			},
			{
				type: "message",
				id: "userC",
				parentId: "asstA",
				timestamp: "2026-11-09T00:00:04Z",
				message: { role: "user", content: "C" },
			},
		];

		const index = buildTreeIndex(entries);

		expect(index.rawDepthById.get("root")).toBe(0);
		expect(index.turnDepthById.get("root")).toBe(0);
		expect(index.branchDepthById.get("root")).toBe(0);

		expect(index.rawDepthById.get("userA")).toBe(1);
		expect(index.turnDepthById.get("userA")).toBe(1);
		expect(index.branchDepthById.get("userA")).toBe(0);

		expect(index.rawDepthById.get("asstA")).toBe(2);
		expect(index.turnDepthById.get("asstA")).toBe(1);
		expect(index.branchDepthById.get("asstA")).toBe(0);

		expect(index.rawDepthById.get("userB")).toBe(3);
		expect(index.turnDepthById.get("userB")).toBe(2);
		expect(index.branchDepthById.get("userB")).toBe(1);

		expect(index.rawDepthById.get("userC")).toBe(3);
		expect(index.turnDepthById.get("userC")).toBe(2);
		expect(index.branchDepthById.get("userC")).toBe(1);

		expect(index.forkPointIds.has("asstA")).toBe(true);
		expect(index.forkPointIds.size).toBe(1);
		expect(Array.from(index.leafIds).sort()).toEqual(["userB", "userC"].sort());
	});

	it("indexes every raw session entry type", () => {
		const entries: SessionEntry[] = [
			{
				type: "message",
				id: "1",
				parentId: null,
				timestamp: "2026-11-09T00:00:01Z",
				message: { role: "user", content: "Hi" },
			},
			{
				type: "model_change",
				id: "2",
				parentId: "1",
				timestamp: "2026-11-09T00:00:02Z",
				modelId: "gpt-4o",
			},
			{
				type: "thinking_level_change",
				id: "3",
				parentId: "2",
				timestamp: "2026-11-09T00:00:03Z",
				thinkingLevel: "high",
			},
			{
				type: "usage",
				id: "4",
				parentId: "3",
				timestamp: "2026-11-09T00:00:04Z",
				kind: "cache_warm",
			},
			{
				type: "compaction",
				id: "5",
				parentId: "4",
				timestamp: "2026-11-09T00:00:05Z",
				summary: "compacted",
			},
			{
				type: "context_edit",
				id: "6",
				parentId: "5",
				timestamp: "2026-11-09T00:00:06Z",
				targetId: "1",
			},
			{
				type: "branch_summary",
				id: "7",
				parentId: "6",
				timestamp: "2026-11-09T00:00:07Z",
				summary: "branch summary",
			},
			{
				type: "custom",
				id: "8",
				parentId: "7",
				timestamp: "2026-11-09T00:00:08Z",
				customType: "my-ext",
			},
			{
				type: "custom_message",
				id: "9",
				parentId: "8",
				timestamp: "2026-11-09T00:00:09Z",
				customType: "my-ext",
				content: "injected",
			},
			{
				type: "label",
				id: "10",
				parentId: "9",
				timestamp: "2026-11-09T00:00:10Z",
				label: "my-bookmark",
			},
			{
				type: "session_info",
				id: "11",
				parentId: "10",
				timestamp: "2026-11-09T00:00:11Z",
				name: "My Session",
			},
		];

		const index = buildTreeIndex(entries);
		expect(index.entryById.size).toBe(11);
		expect(index.preorderIds.length).toBe(11);
		expect(index.rawDepthById.get("11")).toBe(10);
	});

	it("handles self-cycles and ancestor loops safely without crashing", () => {
		const entries: SessionEntry[] = [
			// Self cycle
			{
				type: "message",
				id: "self",
				parentId: "self",
				timestamp: "2026-11-09T00:00:00Z",
			},
			// Two-node cycle: A -> B -> A
			{
				type: "message",
				id: "A",
				parentId: "B",
				timestamp: "2026-11-09T00:00:01Z",
			},
			{
				type: "message",
				id: "B",
				parentId: "A",
				timestamp: "2026-11-09T00:00:02Z",
			},
		];

		const index = buildTreeIndex(entries);
		expect(index.entryById.size).toBe(3);
		// No infinite loop in preorder
		expect(index.preorderIds.length).toBe(3);
	});

	it("handles missing parents by treating them safely as root entries", () => {
		const entries: SessionEntry[] = [
			{
				type: "message",
				id: "orphan",
				parentId: "nonexistent",
				timestamp: "2026-11-09T00:00:00Z",
			},
			{
				type: "message",
				id: "child",
				parentId: "orphan",
				timestamp: "2026-11-09T00:00:01Z",
			},
		];

		const index = buildTreeIndex(entries);
		expect(index.rootIds).toContain("orphan");
		expect(index.rawDepthById.get("orphan")).toBe(0);
		expect(index.rawDepthById.get("child")).toBe(1);
		expect(index.preorderIds).toEqual(["orphan", "child"]);
	});
	it("indexes repeated IDs once without leaving duplicate topology edges", () => {
		const root = { id: "r", parentId: null, type: "message", timestamp: "T0" };
		const child = { id: "c", parentId: "r", type: "message", timestamp: "T1" };
		const index = buildTreeIndex([root, child, { ...root }, { ...child }]);
		expect(index.preorderIds).toEqual(["r", "c"]);
		expect(index.childrenById.get("r")).toEqual(["c"]);
	});
});
