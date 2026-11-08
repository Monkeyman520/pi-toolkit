import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
	ExtensionAPI,
	ExtensionContext,
	SessionEntry,
	ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { createEventBus } from "@earendil-works/pi-coding-agent";
import { afterEach, expect, it, vi } from "vitest";
import extension from "../extensions/index.ts";
import type { declarationSchema } from "../extensions/tasks.ts";

const dirs: string[] = [];
afterEach(async () => {
	await Promise.all(
		dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })),
	);
});
async function harness() {
	const dir = await mkdtemp(join(tmpdir(), "aco-host-"));
	dirs.push(dir);
	const hooks = new Map<string, (e: never, c: ExtensionContext) => unknown>();
	let cmd: {
		handler: (args: string, c: ExtensionContext) => Promise<void>;
		getArgumentCompletions: (s: string) => unknown;
	};
	let tokens: number | null = 1000;
	let branch: SessionEntry[] = [];
	let taskTool: ToolDefinition<typeof declarationSchema> | undefined;
	const notices: string[] = [];
	const events = createEventBus();
	const appendEntry = vi.fn((customType: string, data: unknown) => {
			branch.push({
				id: "meta-" + branch.length,
				parentId: branch.at(-1)?.id ?? null,
				timestamp: new Date().toISOString(),
				type: "custom",
				customType,
				data,
			});
		}),
		status = vi.fn();
	const pi = {
		registerTool: (tool: ToolDefinition<typeof declarationSchema>) => {
			if (tool.name === "aco_task") taskTool = tool;
		},
		on: (name: string, handler: (e: never, c: ExtensionContext) => unknown) =>
			hooks.set(name, handler),
		registerCommand: (_name: string, value: typeof cmd) => {
			cmd = value;
		},
		events,
		appendEntry,
	};
	const ctx = {
		mode: "rpc",
		hasUI: true,
		cwd: dir,
		model: { provider: "fixture", id: "test", contextWindow: 100000 },
		getContextUsage: () => ({
			tokens,
			contextWindow: 100000,
			percent: tokens === null ? null : tokens / 1000,
		}),
		sessionManager: { getSessionId: () => "session", getBranch: () => branch },
		ui: { notify: (s: string) => notices.push(s), setStatus: status },
	} as unknown as ExtensionContext;
	extension(pi as unknown as ExtensionAPI, join(dir, "pi-context-aco.json"));
	const emit = async (name: string, event: unknown = {}) =>
		hooks.get(name)?.(event as never, ctx);
	const report = async () => {
		await cmd.handler("trace", ctx);
		return JSON.parse(notices.at(-1) ?? "{}");
	};
	await emit("session_start");
	return {
		dir,
		pi,
		ctx,
		hooks,
		appendEntry,
		status,
		events,
		notices,
		emit,
		report,
		command: (args: string) => cmd.handler(args, ctx),
		tool: () => taskTool,
		tokens: (n: number | null) => {
			tokens = n;
		},
		branch: (b: SessionEntry[]) => {
			branch = b;
		},
	};
}
it("preserves frozen tool/results/boundary proposals and never registers mutation/model/delegation surfaces", async () => {
	const h = await harness();
	const event = Object.freeze({
		toolCallId: "a",
		toolName: "read",
		args: Object.freeze({ path: "SECRET", limit: 20 }),
	});
	expect(await h.emit("tool_execution_start", event)).toBeUndefined();
	const result = Object.freeze({
		content: Object.freeze([{ type: "text", text: "SECRET".repeat(1000) }]),
	});
	expect(
		await h.emit(
			"tool_execution_end",
			Object.freeze({
				toolCallId: "a",
				toolName: "read",
				result,
				isError: false,
			}),
		),
	).toBeUndefined();
	const boundary = Object.freeze({
		message: Object.freeze({
			role: "assistant",
			usage: {
				input: 100,
				output: 10,
				cacheRead: 0,
				cacheWrite: 0,
				totalTokens: 110,
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
			},
		}),
		entries: Object.freeze([{ type: "custom", customType: "other", data: 1 }]),
		continue: true,
	});
	h.tokens(3000);
	expect(await h.emit("turn_end", boundary)).toBeUndefined();
	const report = await h.report();
	expect(report.mode).toBe("observe-only");
	expect(report.authorizedStrategies).toEqual([]);
	expect(JSON.stringify(report)).not.toContain("SECRET");
	expect(report.pressure.finalizedCalls).toBe(1);
	expect(report.providerUsage.input.value).toBe(100);
	expect(report.management.modelCalls).toBe(0);
	expect(h.appendEntry).not.toHaveBeenCalled();
	expect(
		await h.emit(
			"before_agent_start",
			Object.freeze({ systemPrompt: "unchanged" }),
		),
	).toBeUndefined();
	for (const name of [
		"context",
		"context_with_system",
		"tool_call",
		"tool_result",
		"before_provider_request",
	])
		expect(h.hooks.has(name)).toBe(false);
});
it("records optional numeric metadata, resets on structural edits/unknown gaps, and bounds trace history", async () => {
	const h = await harness();
	await h.command("config persistTraces true");
	await h.emit("turn_start");
	h.tokens(4000);
	await h.emit("turn_end", { message: { role: "assistant" } });
	expect((await h.report()).pressure.growthRate.value).toBe(3000);
	expect(h.appendEntry).toHaveBeenCalledWith(
		"aco-monitor",
		expect.objectContaining({ event: "turn_end" }),
	);
	h.branch([
		{
			id: "edit",
			type: "context_edit",
			targetId: "x",
			replacement: null,
		} as SessionEntry,
	]);
	await h.emit("turn_start");
	expect((await h.report()).pressure.growthRate.value).toBeNull();
	for (let i = 0; i < 60; i++)
		await h.emit("turn_end", { message: { role: "assistant" } });
	expect((await h.report()).traces).toHaveLength(50);
	expect(JSON.stringify(h.appendEntry.mock.calls)).not.toContain("replacement");
});
it("does not treat agent_end as idle and stops only its own discovery/status on shutdown", async () => {
	const h = await harness();
	let otherCalls = 0;
	const off = h.events.on("pi-packages:ui:discover", () => otherCalls++);
	await h.emit("agent_start");
	await h.emit("agent_end");
	expect((await h.report()).running).toBe(true);
	await h.emit("agent_settled");
	expect((await h.report()).running).toBe(false);
	const found: string[] = [];
	h.events.emit("pi-packages:ui:discover", {
		register: (p: { id: string }) => found.push(p.id),
	});
	expect(found).toEqual(["pi-context-aco"]);
	await h.emit("session_shutdown");
	h.events.emit("pi-packages:ui:discover", {
		register: () => {
			throw Error("stale listener");
		},
	});
	expect(otherCalls).toBe(2);
	expect(h.status).toHaveBeenLastCalledWith("aco", undefined);
	off();
});
it("exposes missing usage capability as unknown instead of silently reporting zero", async () => {
	const h = await harness();
	Object.defineProperty(h.ctx, "getContextUsage", { value: undefined });
	await h.emit("turn_end", { message: { role: "assistant" } });
	const report = await h.report();
	expect(report.pressure.usedTokens.value).toBeNull();
	expect(report.capabilities).toContain("getContextUsage unavailable");
	expect(report.providerUsage.input.value).toBeNull();
});
it("persists validated controls, resets comparison on enable/reload and never enables a strategy", async () => {
	const h = await harness();
	await h.command("off");
	expect((await h.report()).settings.enabled).toBe(false);
	expect(
		JSON.parse(await readFile(join(h.dir, "pi-context-aco.json"), "utf8"))
			.enabled,
	).toBe(false);
	h.tokens(10000);
	await h.emit("turn_end", { message: { role: "assistant" } });
	await h.command("on");
	expect((await h.report()).pressure.growthRate.value).toBeNull();
	await writeFile(join(h.dir, "pi-context-aco.json"), '{"horizonTurns":5}');
	await h.command("config reload");
	expect((await h.report()).settings.horizonTurns).toBe(5);
	await h.command("config autoCompact true");
	expect(h.notices.at(-1)).toContain("Unknown");
	expect((await h.report()).authorizedStrategies).toEqual([]);
});
it("does not publish an old session after asynchronous startup is invalidated", async () => {
	const h = await harness();
	const starting = h.emit("session_start");
	await h.emit("session_shutdown");
	await starting;
	const found: string[] = [];
	h.events.emit("pi-packages:ui:discover", {
		register: (p: { id: string }) => found.push(p.id),
	});
	expect(found).toEqual([]);
});

it("keeps ordinary status bounded to the current report; traces require an explicit trace command", async () => {
	const h = await harness();
	await h.command("status");
	const notice = h.notices.at(-1) ?? "";
	const status = JSON.parse(notice.slice(notice.indexOf("\n") + 1));
	expect(status.traces).toBeUndefined();
	expect((await h.report()).traces.length).toBeGreaterThan(0);
});

it("declares task metadata atomically through commands and exposes inspectable recommendations", async () => {
	const h = await harness();
	await h.command(
		'declare {"taskId":"explore","active":true,"phase":"explore","estimatedFutureTokens":200000,"delegatable":true}',
	);
	const r = await h.report();
	expect(r.tasks.activeTaskId).toBe("explore");
	expect(r.recommendation.kind).toBe("proposal");
	expect(r.recommendation.executed).toBe(false);
	expect(h.appendEntry).toHaveBeenCalledWith(
		"aco-task",
		expect.objectContaining({ origin: "command" }),
	);
	const count = h.appendEntry.mock.calls.length;
	await h.command(
		'declare {"taskId":"bad","references":[{"id":"foreign","kind":"evidence","sourceEntryIds":["other"]}]}',
	);
	expect(h.appendEntry.mock.calls.length).toBe(count);
	expect(h.notices.at(-1)).toContain("outside");
	await h.command("tasks");
	expect(h.notices.at(-1)).toContain("activeTaskId");
	await h.command("recommend");
	expect(h.notices.at(-1)).toContain("prerequisites");
});
it("reuses stable assessments, reconstructs the active branch and does not run model judgments", async () => {
	const h = await harness();
	await h.command('declare {"taskId":"a","active":true,"phase":"review"}');
	const first = await h.report();
	const next = await h.report();
	expect(next.analysis.reassessments).toBe(first.analysis.reassessments);
	expect(next.analysis.modelCalls).toBe(0);
	h.branch([]);
	await h.emit("session_tree");
	expect((await h.report()).tasks.tasks).toEqual([]);
	expect((await h.report()).tasks.activeTaskId).toBeNull();
});
it("offers a metadata-only tool, refuses disabled updates and never fabricates executor authority", async () => {
	const h = await harness();
	expect(h.tool()?.name).toBe("aco_task");
	const tool = h.tool();
	if (!tool) throw Error("Task tool missing");
	const result = await tool.execute(
		"declaration",
		{ taskId: "one", active: true },
		undefined,
		undefined,
		h.ctx as never,
	);
	expect(JSON.stringify(result)).toContain("recorded");
	expect((await h.report()).tasks.tasks[0].provenance.status.origin).toBe(
		"unknown",
	);
	const before = h.appendEntry.mock.calls.length;
	await h.command("off");
	await expect(
		tool.execute(
			"blocked",
			{ taskId: "two" },
			undefined,
			undefined,
			h.ctx as never,
		),
	).rejects.toThrow("disabled");
	expect(h.appendEntry.mock.calls.length).toBe(before);
	expect((await h.report()).authorizedStrategies).toEqual([]);
});

it.each(["error", "aborted"])(
	"reports failed SDK-normalized zero %s usage as unavailable",
	async (stopReason) => {
		const h = await harness();
		await h.emit("turn_end", {
			message: {
				role: "assistant",
				stopReason,
				usage: {
					input: 0,
					output: 0,
					cacheRead: 0,
					cacheWrite: 0,
					totalTokens: 0,
					cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
				},
			},
		});
		const r = await h.report();
		expect(r.providerUsage.totalTokens.value).toBeNull();
		expect(r.providerUsage.costTotal.value).toBeNull();
		expect(r.providerUsage.cacheRead.value).toBeNull();
	},
);
