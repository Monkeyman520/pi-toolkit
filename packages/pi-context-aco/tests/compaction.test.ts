import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
	ExtensionAPI,
	ExtensionContext,
	SessionEntry,
	TurnEndEvent,
} from "@earendil-works/pi-coding-agent";
import { afterEach, expect, test, vi } from "vitest";
import { Compactor } from "../extensions/compaction.ts";
import { defaults } from "../extensions/config.ts";
import { Continuity } from "../extensions/continuity.ts";

type Hook = (event: unknown, ctx: ExtensionContext) => unknown;
const roots: string[] = [];
afterEach(async () => {
	await Promise.all(
		roots.splice(0).map((p) => rm(p, { recursive: true, force: true })),
	);
});
async function setup(mode = "compact") {
	const cwd = await mkdtemp(join(tmpdir(), "aco-compact-"));
	roots.push(cwd);
	const branch = [
		{
			id: "u",
			parentId: null,
			timestamp: "now",
			type: "message",
			message: { role: "user", content: "Keep constraint 0xAF", timestamp: 1 },
		},
		{
			id: "a",
			parentId: "u",
			timestamp: "now",
			type: "message",
			message: {
				role: "assistant",
				content: [
					{
						type: "toolCall",
						id: "call",
						name: "read",
						arguments: { path: "doc" },
					},
				],
				timestamp: 1,
			},
		},
		{
			id: "r",
			parentId: "a",
			timestamp: "now",
			type: "message",
			message: {
				role: "toolResult",
				toolCallId: "call",
				toolName: "read",
				isError: false,
				details: { exact: "0xAF" },
				content: [
					{
						type: "text",
						text: "Conclusion: API v2; rationale is compatibility; retain 0xAF\n".repeat(
							1000,
						),
					},
				],
				timestamp: 1,
			},
		},
	] as SessionEntry[];
	const append = (customType: string, data: unknown) =>
		branch.push({
			type: "custom",
			customType,
			data,
			id: `m${branch.length}`,
			parentId: branch.at(-1)?.id ?? null,
			timestamp: "now",
		});
	const hooks = new Map<string, Hook>();
	const compact = vi.fn();
	const ctx = {
		cwd,
		mode: "rpc",
		hasUI: true,
		model: { id: "test", provider: "fixture", contextWindow: 100000 },
		getContextUsage: () => ({
			tokens: 20000,
			contextWindow: 100000,
			percent: 20,
		}),
		sessionManager: {
			getBranch: () => branch,
			getSessionId: () => "session",
			getSessionFile: () => join(cwd, "session"),
		},
		compact,
		ui: { confirm: vi.fn(async () => true), notify: vi.fn() },
	} as unknown as ExtensionContext;
	const continuity = new Continuity(join(cwd, "evidence"), append);
	const runtime = {
		owner: {},
		settings: { ...defaults, mode: mode as typeof defaults.mode },
	};
	const pi = {
		on: (name: string, fn: Hook) => hooks.set(name, fn),
		appendEntry: append,
	} as unknown as ExtensionAPI;
	const controller = new Compactor(pi, continuity, () => runtime);
	await continuity.checkpoint(
		ctx,
		{ sourceEntryIds: ["u", "a", "r"] },
		() => true,
	);
	const grant = (operation: "native" | "semantic") =>
		controller.permissions.grant(ctx, {
			operation,
			taskId: "task:u",
			sourceEntryIds: ["u", "a", "r"],
			maxInputTokens: 64000,
			maxSummaryTokens: 8000,
		});
	const boundary = async () =>
		hooks.get("turn_end")?.(
			{ entries: [], outcome: "completed" } as unknown as TurnEndEvent,
			ctx,
		);
	return {
		cwd,
		branch,
		ctx,
		compact,
		continuity,
		runtime,
		controller,
		hooks,
		grant,
		boundary,
	};
}
test("V1 cannot execute and unauthorized non-interactive proposals do not mutate or prompt", async () => {
	const h = await setup("observe");
	h.grant("semantic");
	await expect(
		h.controller.summarize(h.ctx, { sourceEntryIds: ["r"] }),
	).rejects.toThrow("V3");
	h.runtime.settings.mode = "compact";
	h.controller.permissions.reset();
	const count = h.branch.length;
	expect(
		(await h.controller.summarize(h.ctx, { sourceEntryIds: ["r"] })).status,
	).toBe("recommendation");
	expect(h.branch).toHaveLength(count);
	expect(h.ctx.ui.confirm).not.toHaveBeenCalled();
});
test("authorized local summaries retain exact data and only become edits at a safe boundary", async () => {
	const h = await setup();
	h.grant("semantic");
	expect(
		(await h.controller.summarize(h.ctx, { sourceEntryIds: ["r"] })).status,
	).toBe("scheduled");
	expect(h.branch.some((e) => e.type === "context_edit")).toBe(false);
	const result = (await h.boundary()) as { entries: SessionEntry[] };
	expect(
		result.entries.some(
			(d: SessionEntry) =>
				d.type === "context_edit" &&
				d.targetId === "r" &&
				d.replacement !== null,
		),
	).toBe(true);
	expect(JSON.stringify(result)).toContain("0xAF");
});
test("plausible summary, revocation and exhausted budgets cannot bypass verification", async () => {
	const h = await setup();
	h.grant("semantic");
	await expect(
		h.controller.summarize(h.ctx, {
			sourceEntryIds: ["r"],
			summary: "Looks equivalent!",
		}),
	).rejects.toThrow("equivalence");
	await h.controller.summarize(h.ctx, { sourceEntryIds: ["r"] });
	h.controller.permissions.reset();
	expect(await h.boundary()).toBeUndefined();
	h.runtime.settings.maxSummaryTokens = 1;
	h.grant("semantic");
	await expect(
		h.controller.summarize(h.ctx, { sourceEntryIds: ["r"] }),
	).rejects.toThrow("budget");
});
test("native request is not completion and unrelated compaction hooks are left alone", async () => {
	const h = await setup();
	h.grant("native");
	expect((await h.controller.native(h.ctx)).status).toBe("requested");
	expect(h.compact).toHaveBeenCalledOnce();
	expect(h.controller.report(h.ctx).last?.status).toBe("requested");
	expect(
		await h.hooks.get("session_before_compact")?.(
			{ customInstructions: "unrelated" },
			h.ctx,
		),
	).toBeUndefined();
	h.compact.mock.calls[0][0].onError(new Error("native failed"));
	expect(h.controller.report(h.ctx).last?.status).toBe("failed");
});

test("recovery loss or conflicting final drafts cancel a scheduled summary without any edit", async () => {
	const h = await setup();
	h.grant("semantic");
	await h.controller.summarize(h.ctx, { sourceEntryIds: ["r"] });
	const access = await h.continuity.access(h.ctx),
		receipt = access.receipts[0];
	const manifest = await h.continuity.store.manifest(receipt);
	const segment = manifest.segments.find((s) => s.id === "r");
	if (!segment) throw Error("fixture source missing");
	const { unlink } = await import("node:fs/promises");
	await unlink(
		join(h.cwd, "evidence", receipt.scope.project, receipt.id, segment.file),
	);
	expect(await h.boundary()).toBeUndefined();
	expect(h.controller.report(h.ctx).last?.status).toBe("cancelled");
	expect(h.branch.some((e) => e.type === "context_edit")).toBe(false);
});
test("task/branch changes and revoked authority cannot commit into a replacement session", async () => {
	const h = await setup();
	h.grant("semantic");
	await h.controller.summarize(h.ctx, { sourceEntryIds: ["r"] });
	h.runtime.owner = {};
	expect(await h.boundary()).toBeUndefined();
	expect(h.controller.report(h.ctx).last?.status).toBe("cancelled");
});
test("native V1 and missing recovery cannot bypass guards even with explicit automation", async () => {
	const h = await setup();
	h.grant("native");
	h.runtime.settings.mode = "observe";
	await expect(h.controller.native(h.ctx)).rejects.toThrow("V3");
	expect(h.compact).not.toHaveBeenCalled();
	h.runtime.settings.mode = "compact";
	const receipt = (await h.continuity.access(h.ctx)).receipts[0];
	const { unlink } = await import("node:fs/promises");
	await unlink(
		join(
			h.cwd,
			"evidence",
			receipt.scope.project,
			receipt.id,
			"continuity.json",
		),
	);
	await expect(h.controller.native(h.ctx)).rejects.toThrow("checkpoint");
	expect(h.compact).not.toHaveBeenCalled();
});

test("revocation before asynchronous native preparation cancels only the issued request, never falls through to host generation", async () => {
	const h = await setup();
	h.grant("native");
	await h.controller.native(h.ctx);
	const options = h.compact.mock.calls[0][0];
	h.controller.reset();
	expect(
		await h.hooks.get("session_before_compact")?.(
			{ customInstructions: options.customInstructions },
			h.ctx,
		),
	).toEqual({ cancel: true });
	expect(
		await h.hooks.get("session_before_compact")?.(
			{ customInstructions: "aco-native:unrelated" },
			h.ctx,
		),
	).toBeUndefined();
});
