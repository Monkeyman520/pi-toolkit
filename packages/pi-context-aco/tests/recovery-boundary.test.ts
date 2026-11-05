import { mkdtemp, rm, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
	ExtensionContext,
	SessionEntry,
} from "@earendil-works/pi-coding-agent";
import { afterEach, expect, test } from "vitest";
import { Continuity } from "../extensions/continuity.ts";
import {
	createRestoreBoundaryDrafts,
	evaluatePruneCandidates,
	reconcileBranchPrunes,
} from "../extensions/prune.ts";
import { buildTasks, linkCheckpoints } from "../extensions/tasks.ts";

const roots: string[] = [];
afterEach(async () => {
	await Promise.all(
		roots.splice(0).map((p) => rm(p, { recursive: true, force: true })),
	);
});
async function setup() {
	const cwd = await mkdtemp(join(tmpdir(), "aco-recovery-"));
	roots.push(cwd);
	const base = (id: string, parentId: string | null) => ({
		id,
		parentId,
		timestamp: "2026-11-05",
	});
	const branch = [
		{
			...base("u1", null),
			type: "message",
			message: { role: "user", content: "Research", timestamp: 1 },
		},
		{
			...base("a1", "u1"),
			type: "message",
			message: {
				role: "assistant",
				content: [
					{
						type: "toolCall",
						id: "c1",
						name: "read",
						arguments: { path: "doc" },
					},
				],
				timestamp: 1,
			},
		},
		{
			...base("r1", "a1"),
			type: "message",
			message: {
				role: "toolResult",
				toolCallId: "c1",
				toolName: "read",
				content: [{ type: "text", text: "historical 0x42" }],
				isError: false,
				timestamp: 1,
			},
		},
		{
			...base("n1", "r1"),
			type: "custom",
			customType: "aco-task",
			data: {
				version: 1,
				origin: "command",
				update: {
					taskId: "work",
					active: true,
					status: "completed",
					references: [
						{
							id: "research",
							kind: "evidence",
							sourceEntryIds: ["r1"],
							completedResearch: true,
						},
					],
				},
			},
		},
	] as SessionEntry[];
	const service = new Continuity(join(cwd, "store"), (customType, data) =>
		branch.push({
			...base(`meta-${branch.length}`, branch.at(-1)?.id ?? null),
			type: "custom",
			customType,
			data,
		}),
	);
	const ctx = {
		cwd,
		sessionManager: {
			getBranch: () => branch,
			getSessionId: () => "session",
			getSessionFile: () => join(cwd, "session"),
		},
	} as unknown as ExtensionContext;
	await service.checkpoint(ctx, { sourceEntryIds: ["a1", "r1"] }, () => true);
	const access = await service.access(ctx);
	const receipt = access.receipts[0];
	const corrupt = async () => {
		const manifest = await service.store.manifest(receipt);
		const segment = manifest.segments.find((s) => s.id === "r1");
		if (!segment) throw Error("missing fixture");
		await unlink(
			join(cwd, "store", receipt.scope.project, receipt.id, segment.file),
		);
	};
	return { cwd, branch, service, ctx, receipt, corrupt, base };
}
test("deleted originals cannot be reclassified as verified by manifest or cached state", async () => {
	const h = await setup();
	const good = await h.service.getActiveCheckpoints(h.ctx);
	expect(good).toHaveLength(1);
	const snapshot = buildTasks(h.branch, h.cwd);
	linkCheckpoints(snapshot, good);
	await h.corrupt();
	expect((await h.service.reconcile(h.ctx)).checkpoints[0].status).toBe(
		"invalid",
	);
	const checkpoints = await h.service.getActiveCheckpoints(h.ctx);
	linkCheckpoints(snapshot, checkpoints);
	expect(
		evaluatePruneCandidates(snapshot, h.branch, checkpoints, {
			mode: "exact-prune",
		}).eligible,
	).toEqual([]);
});
test("restoration rejects inaccessible or uncovered originals without successful drafts", async () => {
	const h = await setup();
	await h.corrupt();
	h.branch.push({
		...h.base("omit", "n1"),
		type: "context_edit",
		targetId: "r1",
		replacement: null,
	});
	const checkpoints = await h.service.getActiveCheckpoints(h.ctx);
	const result = await createRestoreBoundaryDrafts("r1", h.branch, checkpoints);
	expect(result.restoredTargetIds).toEqual([]);
	expect(result.error).toBeTruthy();
});
test("reconciliation verifies target coverage rather than receipt count", async () => {
	const h = await setup();
	const checkpoints = await h.service.getActiveCheckpoints(h.ctx);
	h.branch.push({
		...h.base("omit", "n1"),
		type: "context_edit",
		targetId: "never-archived",
		replacement: null,
	});
	const result = reconcileBranchPrunes(h.branch, checkpoints);
	expect(result.verifiedTargetIds).toEqual([]);
	expect(result.unverifiedTargetIds).toEqual(["never-archived"]);
});
test("restoring an omitted tool result restores its verified call in the same proposal", async () => {
	const h = await setup();
	const checkpoints = await h.service.getActiveCheckpoints(h.ctx);
	h.branch.push({
		...h.base("omit-r", "n1"),
		type: "context_edit",
		targetId: "r1",
		replacement: null,
	});
	h.branch.push({
		...h.base("omit-a", "omit-r"),
		type: "context_edit",
		targetId: "a1",
		replacement: null,
	});
	const result = await createRestoreBoundaryDrafts("r1", h.branch, checkpoints);
	expect(result.error).toBeUndefined();
	expect(result.restoredTargetIds.sort()).toEqual(["a1", "r1"]);
});
