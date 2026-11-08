import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	accountWholeRun,
	allowEvaluationTool,
	createGuardedFetch,
} from "./representative-evaluation-support.ts";

const roots: string[] = [];
afterEach(async () => {
	await Promise.all(
		roots.splice(0).map((p) => rm(p, { recursive: true, force: true })),
	);
});
const reply = (timestamp: number, totalTokens = 10) => ({
	role: "assistant",
	timestamp,
	provider: "antigravity",
	model: "gemini-3.8-flash",
	content: [{ type: "text", text: "done" }],
	stopReason: "stop",
	usage: {
		input: 6,
		output: 4,
		cacheRead: 2,
		cacheWrite: 0,
		totalTokens,
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
	},
});
describe("representative evaluator evidence", () => {
	it("blocks provider model fallback before transmission and logs only approved transport usage", async () => {
		let calls = 0;
		const rows: unknown[] = [];
		const fetch = createGuardedFetch(
			async () => {
				calls++;
				return new Response(
					'data: {"response":{"usageMetadata":{"promptTokenCount":6,"candidatesTokenCount":4,"totalTokenCount":10}}}\n\n',
				);
			},
			(row) => rows.push(row),
		);
		const send = (model: string) =>
			fetch(
				"https://cloudcode-pa.googleapis.com/v1internal:streamGenerateContent?alt=sse",
				{
					method: "POST",
					body: JSON.stringify({
						model,
						request: {
							generationConfig: {
								thinkingConfig: { thinkingBudget: -1, includeThoughts: true },
							},
						},
					}),
				},
			);
		await expect(send("gemini-3.7-flash-high")).rejects.toThrow(/model/);
		expect(calls).toBe(0);
		await (await send("gemini-3.8-flash-high")).text();
		expect(calls).toBe(1);
		expect(rows).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					kind: "request",
					requestBytes: expect.any(Number),
				}),
			]),
		);
		expect(rows).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					kind: "usage",
					usage: {
						promptTokenCount: 6,
						candidatesTokenCount: 4,
						totalTokenCount: 10,
					},
				}),
			]),
		);
		expect(JSON.stringify(rows)).not.toContain("project");
	});
	it("counts retry-only events and abandoned entries without duplicating persisted completions", () => {
		const a = reply(1),
			b = reply(2),
			c = reply(3);
		const entries = [a, c].map((message, i) => ({
			type: "message",
			id: String(i),
			message,
		}));
		const events = [a, b].map((message) => ({ type: "message_end", message }));
		const r = accountWholeRun(entries, events);
		expect(r.parentCompletions).toBe(3);
		expect(r.accounting.total.totalTokens).toBe(30);
		expect(r.accounting.total.input).toBe(18);
		expect(r.accounting.total.cacheRead).toBe(6);
		expect(r.accounting.total.cacheWrite).toBeNull();
		expect(r.accounting.total.costTotal).toBeNull();
	});
	it("does not turn absent provider usage or unresolved children into measured zeroes", () => {
		const entries = [
			{
				type: "custom",
				customType: "aco-delegation-intent",
				data: { id: "child" },
			},
		];
		const events = [
			{
				type: "message_end",
				message: { ...reply(1), usage: undefined, stopReason: "error" },
			},
		];
		const r = accountWholeRun(entries, events);
		expect(r.accounting.total.totalTokens).toBeNull();
		expect(r.accounting.byOwner.child.totalTokens).toBeNull();
		expect(r.unresolvedChildren).toEqual(["child"]);
		expect(r.failedParentCompletions).toBe(1);
	});
	it("deduplicates durable child results but retains every parent completion occurrence", () => {
		const result = {
			type: "custom",
			customType: "aco-delegation-result",
			data: { id: "child", providerUsage: reply(1).usage },
		};
		const events = [1, 1].map((timestamp) => ({
			type: "message_end",
			message: reply(timestamp),
		}));
		const r = accountWholeRun([result, result], events);
		expect(r.parentCompletions).toBe(2);
		expect(r.accounting.byOwner.child.totalTokens).toBe(10);
		expect(r.accounting.total.totalTokens).toBe(30);
	});
	it("permits only task paths and frozen local verification commands, including symlink escape refusal", async () => {
		const root = await mkdtemp(join(tmpdir(), "aco-eval-guard-"));
		const outside = await mkdtemp(join(tmpdir(), "aco-eval-outside-"));
		roots.push(root, outside);
		await mkdir(join(root, "extensions"));
		await writeFile(join(root, "extensions", "a.ts"), "export {};");
		await symlink(
			outside,
			join(root, "escape"),
			process.platform === "win32" ? "junction" : "dir",
		);
		expect(allowEvaluationTool(root, "read", { path: "extensions/a.ts" })).toBe(
			true,
		);
		expect(
			allowEvaluationTool(root, "write", { path: "extensions/new.ts" }),
		).toBe(true);
		expect(allowEvaluationTool(root, "write", { path: "package.json" })).toBe(
			false,
		);
		expect(allowEvaluationTool(root, "read", { path: "../auth.json" })).toBe(
			false,
		);
		expect(
			allowEvaluationTool(root, "read", { path: "escape/auth.json" }),
		).toBe(false);
		expect(allowEvaluationTool(root, "bash", { command: "npm test" })).toBe(
			true,
		);
		expect(
			allowEvaluationTool(root, "bash", {
				command: "npm test; cat ~/.pi/agent/auth.json",
			}),
		).toBe(false);
		expect(allowEvaluationTool(root, "bash", { command: "npm install" })).toBe(
			false,
		);
		expect(allowEvaluationTool(root, "unknown", {})).toBe(false);
	});
});
