import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
	ExtensionContext,
	SessionEntry,
} from "@earendil-works/pi-coding-agent";
import { afterEach, expect, test } from "vitest";
import { Continuity } from "../extensions/continuity.ts";
import { fileIO } from "../extensions/evidence.ts";

const assistantMeta = {
	api: "fixture",
	provider: "fixture",
	model: "fixture",
	stopReason: "toolUse" as const,
	usage: {
		input: 0,
		output: 0,
		cacheRead: 0,
		cacheWrite: 0,
		totalTokens: 0,
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
	},
};
const roots: string[] = [];
afterEach(async () => {
	await Promise.all(
		roots.splice(0).map((p) => rm(p, { recursive: true, force: true })),
	);
});
async function setup() {
	const cwd = await mkdtemp(join(tmpdir(), "aco-continuity-"));
	roots.push(cwd);
	let entries: SessionEntry[] = [
		{
			type: "message",
			id: "goal",
			parentId: null,
			timestamp: "2026-01-01",
			message: {
				role: "user",
				content: "Keep error 0xAF; unfinished work",
				timestamp: 1,
			},
		},
		{
			type: "custom",
			id: "task",
			parentId: "goal",
			timestamp: "2026-01-01",
			customType: "aco-task",
			data: {
				version: 1,
				origin: "command",
				update: {
					taskId: "work",
					active: true,
					phase: "implement",
					status: "running",
					planStatus: "running",
					requiredContextIds: ["decision"],
					references: [
						{ id: "decision", kind: "decision", sourceEntryIds: ["goal"] },
					],
				},
			},
		},
	];
	const append = (customType: string, data: unknown) => {
		entries.push({
			type: "custom",
			id: "meta-" + entries.length,
			parentId: entries.at(-1)?.id ?? null,
			timestamp: "2026-01-01",
			customType,
			data,
		});
	};
	const ctx = {
		cwd,
		sessionManager: {
			getBranch: () => entries,
			getSessionId: () => "session",
			getSessionFile: () => join(cwd, "session.jsonl"),
		},
	} as unknown as ExtensionContext;
	const service = new Continuity(join(cwd, "store"), append);
	return {
		cwd,
		ctx,
		service,
		append,
		entries,
		replace: (next: SessionEntry[]) => {
			entries = next;
		},
	};
}
test("captures task/plan/decision/latest facts and original source references, metadata stays body-free", async () => {
	const h = await setup();
	const result = await h.service.checkpoint(
		h.ctx,
		{ sourceEntryIds: ["goal"], unresolvedWork: ["run regression"] },
		() => true,
	);
	expect(result.recoverable).toBe(true);
	expect(
		JSON.stringify(
			h.entries.filter(
				(e) => e.type === "custom" && e.customType.startsWith("aco-evidence"),
			),
		),
	).not.toContain("0xAF");
	const access = await h.service.access(h.ctx);
	const text = JSON.parse(
		await h.service.store.recall(
			result.checkpointId,
			"continuity",
			access,
			32768,
			0,
		),
	).text;
	const snapshot = JSON.parse(text);
	expect(snapshot.task.planStatus).toBe("running");
	expect(
		snapshot.references.find((r: { id: string }) => r.id === "decision").kind,
	).toBe("decision");
	expect(snapshot.unresolvedWork).toEqual(["run regression"]);
	expect(snapshot.sourceEntryIds).toContain("goal");
	expect(snapshot.historical).toBe(true);
	const status = await h.service.reconcile(h.ctx);
	expect(status.lastUsableId).toBe(result.checkpointId);
	h.replace(h.entries.slice(0, 2));
	expect((await h.service.reconcile(h.ctx)).lastUsableId).toBeNull();
	await expect(
		h.service.recall(
			h.ctx,
			{
				checkpointId: result.checkpointId,
				segmentId: "goal",
				budgetBytes: 2048,
			},
			() => true,
		),
	).rejects.toThrow();
});
test("readback failure and incomplete intent remain distinguishable after restart", async () => {
	const h = await setup();
	const good = await h.service.checkpoint(
		h.ctx,
		{ sourceEntryIds: ["goal"] },
		() => true,
	);
	const broken = new Continuity(join(h.cwd, "store"), h.append, {
		...fileIO,
		read: async () => {
			throw Error("injected verification failure");
		},
	});
	await expect(
		broken.checkpoint(h.ctx, { sourceEntryIds: ["goal"] }, () => true),
	).rejects.toThrow("injected");
	const restarted = new Continuity(join(h.cwd, "store"), h.append);
	const report = await restarted.reconcile(h.ctx);
	expect(report.lastUsableId).toBe(good.checkpointId);
	expect(report.checkpoints.some((c) => c.status === "incomplete")).toBe(true);
});
test("stale/cancelled checkpoint cannot append a successful receipt", async () => {
	const h = await setup();
	let current = true;
	const service = new Continuity(join(h.cwd, "store"), h.append, {
		...fileIO,
		rename: async (a, b) => {
			await fileIO.rename(a, b);
			current = false;
		},
	});
	await expect(
		service.checkpoint(h.ctx, { sourceEntryIds: ["goal"] }, () => current),
	).rejects.toThrow();
	expect(
		h.entries.some(
			(e) => e.type === "custom" && e.customType === "aco-evidence-commit",
		),
	).toBe(false);
	expect((await service.reconcile(h.ctx)).checkpoints[0].status).toBe(
		"incomplete",
	);
});
test("rejects invalid source IDs and checkpoint contract before intent append", async () => {
	const h = await setup(),
		count = h.entries.length;
	for (const raw of [
		{ sourceEntryIds: ["foreign"] },
		{ sourceEntryIds: [], project: "spoof" },
		{ sourceEntryIds: ["goal"], unresolvedWork: "invalid" },
	])
		await expect(
			h.service.checkpoint(h.ctx, raw, () => true),
		).rejects.toThrow();
	expect(h.entries).toHaveLength(count);
});

test("preserves latest tool facts, modified resources and exact structured errors", async () => {
	const h = await setup();
	h.entries.push(
		{
			type: "message",
			id: "call-edit",
			parentId: "task",
			timestamp: "2026-01-01",
			message: {
				role: "assistant",
				...assistantMeta,
				content: [
					{
						type: "toolCall",
						id: "edit",
						name: "write",
						arguments: { path: "src/main.ts", content: "exact" },
					},
				],
				timestamp: 2,
			},
		} as SessionEntry,
		{
			type: "message",
			id: "result-edit",
			parentId: "call-edit",
			timestamp: "2026-01-01",
			message: {
				role: "toolResult",
				toolCallId: "edit",
				toolName: "write",
				content: [{ type: "text", text: "written" }],
				isError: false,
				timestamp: 3,
			},
		},
		{
			type: "message",
			id: "call-test",
			parentId: "result-edit",
			timestamp: "2026-01-01",
			message: {
				role: "assistant",
				...assistantMeta,
				content: [
					{
						type: "toolCall",
						id: "test",
						name: "bash",
						arguments: { command: "npm test" },
					},
				],
				timestamp: 4,
			},
		} as SessionEntry,
		{
			type: "message",
			id: "result-test",
			parentId: "call-test",
			timestamp: "2026-01-01",
			message: {
				role: "toolResult",
				toolCallId: "test",
				toolName: "bash",
				content: [{ type: "text", text: "FAIL exact 0xAF" }],
				details: { exitCode: 1 },
				structuredContent: { error: "0xAF" },
				isError: false,
				timestamp: 5,
			},
		} as SessionEntry,
	);
	const result = await h.service.checkpoint(
		h.ctx,
		{ sourceEntryIds: ["goal"] },
		() => true,
	);
	const access = await h.service.access(h.ctx);
	const continuity = JSON.parse(
		JSON.parse(
			await h.service.store.recall(
				result.checkpointId,
				"continuity",
				access,
				32768,
			),
		).text,
	);
	expect(continuity.task.testState).toBe("failed");
	expect(continuity.task.modifiedResources).toContain("src/main.ts");
	expect(continuity.sourceEntryIds).toContain("result-test");
	expect(
		JSON.parse(
			JSON.parse(
				await h.service.store.recall(
					result.checkpointId,
					"result-test",
					access,
					2048,
				),
			).text,
		).message.structuredContent,
	).toEqual({ error: "0xAF" });
});
test("append failure preserves older recovery and ephemeral sessions cannot claim restart recovery", async () => {
	const h = await setup();
	const good = await h.service.checkpoint(
		h.ctx,
		{ sourceEntryIds: ["goal"] },
		() => true,
	);
	const failed = new Continuity(join(h.cwd, "store"), (type, data) => {
		if (type === "aco-evidence-commit") throw Error("commit append failed");
		h.append(type, data);
	});
	await expect(
		failed.checkpoint(h.ctx, { sourceEntryIds: ["goal"] }, () => true),
	).rejects.toThrow("append");
	expect((await h.service.reconcile(h.ctx)).lastUsableId).toBe(
		good.checkpointId,
	);
	const ephemeral = {
		...h.ctx,
		sessionManager: {
			...h.ctx.sessionManager,
			getSessionFile: () => undefined,
		},
	};
	await expect(
		h.service.checkpoint(ephemeral, { sourceEntryIds: ["goal"] }, () => true),
	).rejects.toThrow("persistent Pi session");
});
test("branch navigation invalidates in-flight work even if it returns to the same leaf", async () => {
	const h = await setup();
	let service: Continuity;
	service = new Continuity(join(h.cwd, "store"), h.append, {
		...fileIO,
		rename: async (a, b) => {
			await fileIO.rename(a, b);
			service.invalidate();
		},
	});
	await expect(
		service.checkpoint(h.ctx, { sourceEntryIds: ["goal"] }, () => true),
	).rejects.toThrow("changed");
	expect((await service.reconcile(h.ctx)).lastUsableId).toBeNull();
});

test("an orphaned commit is not authority without its matching intent", async () => {
	const h = await setup();
	const result = await h.service.checkpoint(
		h.ctx,
		{ sourceEntryIds: ["goal"] },
		() => true,
	);
	h.replace(
		h.entries.filter(
			(e) => e.type !== "custom" || e.customType !== "aco-evidence-intent",
		),
	);
	await expect(
		h.service.recall(
			h.ctx,
			{
				checkpointId: result.checkpointId,
				segmentId: "goal",
				budgetBytes: 2048,
			},
			() => true,
		),
	).rejects.toThrow();
});

test("reconciliation never reports a superseded branch as usable", async () => {
	const h = await setup();
	await h.service.checkpoint(h.ctx, { sourceEntryIds: ["goal"] }, () => true);
	let switched = false;
	const service = new Continuity(join(h.cwd, "store"), h.append, {
		...fileIO,
		read: async (path, max) => {
			const body = await fileIO.read(path, max);
			if (!switched) {
				switched = true;
				h.replace(h.entries.slice(0, 1));
				service.invalidate();
			}
			return body;
		},
	});
	const result = await service.reconcile(h.ctx);
	expect(result.lastUsableId).toBeNull();
	expect(result.checkpoints).toEqual([]);
	expect(result.issues.join(" ")).toContain("superseded");
});
