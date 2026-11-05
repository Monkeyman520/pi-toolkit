import { appendFileSync } from "node:fs";
import { createAssistantMessageEventStream } from "@earendil-works/pi-ai";
import { Type } from "typebox";

let declaredInput = null,
	declareNext = false;
let calls = 0,
	edit = false,
	lastBoundary = [];
export default function fixture(pi) {
	pi.registerTool({
		name: "fixture_output",
		label: "Fixture Output",
		description: "Controlled test-only output",
		parameters: Type.Object({
			size: Type.Integer(),
			blocked: Type.Optional(Type.Boolean()),
		}),
		async execute(_id, params) {
			await new Promise((resolve) =>
				setTimeout(resolve, params.size === 32000 ? 25 : 1),
			);
			return {
				content: [
					{
						type: "text",
						text: "EVIDENCE_SENTINEL:" + "x".repeat(params.size),
					},
				],
				details: { verified: "unchanged" },
				structuredContent: { size: params.size },
			};
		},
	});
	pi.on("tool_call", (event) => {
		if (event.toolName === "fixture_output" && event.input.blocked)
			return { block: true, reason: "controlled blocked call" };
	});
	pi.on("turn_end", (event) => {
		lastBoundary = Object.keys(event);
		if (edit && event.toolResultEntryIds.length) {
			edit = false;
			return {
				entries: [
					...event.entries,
					{
						type: "context_edit",
						targetId: event.toolResultEntryIds[0],
						replacement: { content: "EXTERNAL_FIXTURE_EDIT" },
					},
				],
			};
		}
	});
	pi.registerCommand("fixture-edit", {
		description: "fixture external edit",
		handler: async () => {
			edit = true;
		},
	});
	pi.registerCommand("fixture-compact", {
		description: "fixture native compaction",
		handler: async (_args, ctx) => {
			ctx.compact();
		},
	});
	pi.on("session_before_compact", (event) => ({
		compaction: {
			summary: "Controlled fixture summary, not ACO-generated",
			firstKeptEntryId: event.preparation.firstKeptEntryId,
			tokensBefore: event.preparation.tokensBefore,
		},
	}));
	pi.registerCommand("fixture-pressure", {
		description: "fixture reported usage",
		handler: async (args) => {
			declaredInput = Number(args);
		},
	});
	pi.registerCommand("fixture-declare", {
		description: "fixture task declaration",
		handler: async () => {
			declareNext = true;
		},
	});
	pi.registerCommand("fixture-branch", {
		description: "fixture branch navigation",
		handler: async (args, ctx) => {
			await ctx.navigateTree(args.trim());
		},
	});
	pi.registerCommand("fixture-probe", {
		description: "fixture inspection",
		handler: async (_args, ctx) => {
			const panels = [];
			pi.events.emit("pi-packages:ui:discover", {
				register: (panel) => panels.push(panel.id),
			});
			const entries = ctx.sessionManager.getBranch();
			ctx.ui.notify(
				JSON.stringify({
					fixture: true,
					sessionFile: ctx.sessionManager.getSessionFile(),
					leaf: ctx.sessionManager.getLeafId(),
					sources: entries
						.filter((e) => e.type === "message")
						.map((e) => ({ id: e.id, role: e.message.role })),
					taskMetadata: entries
						.filter((e) => e.type === "custom" && e.customType === "aco-task")
						.map((e) => e.data),
					panels,
					lastBoundary,
					metadata: entries.filter(
						(e) => e.type === "custom" && e.customType === "aco-monitor",
					).length,
					edits: entries.filter((e) => e.type === "context_edit").length,
					projectionHasMetadata: JSON.stringify(
						ctx.sessionManager.buildSessionProjection().messages,
					).includes('customType":"aco-monitor'),
				}),
				"info",
			);
		},
	});
	const off = pi.events.on("pi-packages:ui:discover", (payload) =>
		payload.register({
			id: "fixture-panel",
			title: "Fixture Panel",
			command: "/fixture-probe",
			getSummary: () => "test only",
			open: async (ctx) => ctx.ui.notify("Fixture panel alive", "info"),
		}),
	);
	pi.on("session_start", (event) => {
		if (process.env.ACO_LIFECYCLE)
			appendFileSync(
				process.env.ACO_LIFECYCLE,
				JSON.stringify({ event: "start", reason: event.reason }) + "\n",
			);
	});
	pi.on("session_shutdown", (event) => {
		off();
		if (process.env.ACO_LIFECYCLE)
			appendFileSync(
				process.env.ACO_LIFECYCLE,
				JSON.stringify({ event: "shutdown", reason: event.reason }) + "\n",
			);
	});
	pi.registerProvider("aco-fixture", {
		api: "aco-fixture-api",
		apiKey: "fixture",
		baseUrl: "https://example.invalid",
		models: [100000, 200000].map((window, i) => ({
			id: "test" + i,
			name: "ACO Fixture " + i,
			reasoning: false,
			input: ["text"],
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
			contextWindow: window,
			maxTokens: 1000,
		})),
		streamSimple(model, context) {
			calls++;
			appendFileSync(
				process.env.ACO_REQUESTS,
				JSON.stringify({ calls, messages: context.messages }) + "\n",
			);
			const tools = context.messages.at(-1)?.role === "user";
			const declaration = tools && declareNext;
			if (declaration) declareNext = false;
			const content = declaration
				? [
						{
							type: "toolCall",
							id: "declaration-" + calls,
							name: "aco_task",
							arguments: {
								taskId: "agent-task",
								active: true,
								phase: "plan",
								status: "running",
								estimatedFutureTokens: 10000,
							},
						},
					]
				: tools
					? [
							{
								type: "toolCall",
								id: "call-" + calls + "-a",
								name: "fixture_output",
								arguments: { size: 32000 },
							},
							{
								type: "toolCall",
								id: "call-" + calls + "-b",
								name: "fixture_output",
								arguments: { size: 16000 },
							},
							{
								type: "toolCall",
								id: "call-" + calls + "-blocked",
								name: "fixture_output",
								arguments: { size: 10, blocked: true },
							},
							{
								type: "toolCall",
								id: "call-" + calls + "-missing",
								name: "fixture_missing",
								arguments: {},
							},
						]
					: [
							{
								type: "text",
								text: "Controlled completion; no further action.",
							},
						];
			const reason = tools ? "toolUse" : "stop";
			const message = {
				role: "assistant",
				api: model.api,
				provider: model.provider,
				model: model.id,
				content,
				stopReason: reason,
				timestamp: 123456,
				usage: {
					input: declaredInput ?? 2000 + calls * 1000,
					output: 100,
					cacheRead: 50,
					cacheWrite: 25,
					totalTokens: (declaredInput ?? 2000 + calls * 1000) + 175,
					cost: {
						input: 0.001,
						output: 0.0001,
						cacheRead: 0.00001,
						cacheWrite: 0.00002,
						total: 0.00113,
					},
				},
			};
			const stream = createAssistantMessageEventStream();
			queueMicrotask(() => {
				stream.push({ type: "done", reason, message });
				stream.end(message);
			});
			return stream;
		},
	});
}
