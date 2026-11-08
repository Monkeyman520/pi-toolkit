import { appendFileSync } from "node:fs";
import { createAssistantMessageEventStream } from "@earendil-works/pi-ai";
export default function fixture(pi) {
	let failures = 0;
	let positivePartial = false;
	pi.registerCommand("evidence-partial", {
		handler: async () => {
			failures = 1;
			positivePartial = true;
		},
	});
	pi.registerCommand("evidence-failures", {
		handler: async (args) => {
			failures = Number(args);
		},
	});
	pi.registerCommand("evidence-probe", {
		handler: async (_args, ctx) => {
			ctx.ui.notify(
				JSON.stringify({
					sessionFile: ctx.sessionManager.getSessionFile(),
					sessionId: ctx.sessionManager.getSessionId(),
					leaf: ctx.sessionManager.getLeafId(),
					branch: ctx.sessionManager.getBranch(),
					projection: ctx.sessionManager.buildSessionProjection().messages,
					projectionSourceIds: ctx.sessionManager
						.buildSessionProjection()
						.entries.filter((e) => e.messages.length)
						.map((e) => e.sourceEntry.id),
				}),
				"info",
			);
		},
	});
	pi.registerCommand("evidence-tree", {
		handler: async (id, ctx) => {
			await ctx.navigateTree(id.trim());
		},
	});
	pi.registerCommand("evidence-clone", {
		handler: async (_args, ctx) => {
			await ctx.fork(ctx.sessionManager.getLeafId(), { position: "at" });
		},
	});
	pi.registerProvider("evidence-fixture", {
		api: "evidence-fixture-api",
		apiKey: "fixture",
		baseUrl: "https://example.invalid",
		models: [
			{
				id: "test",
				name: "Evidence fixture",
				reasoning: false,
				input: ["text"],
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
				contextWindow: 100000,
				maxTokens: 1000,
			},
		],
		streamSimple(model, context) {
			appendFileSync(
				process.env.ACO_REQUESTS,
				JSON.stringify(context.messages) + "\n",
			);
			const last = context.messages.at(-1);
			const contentText =
				typeof last?.content === "string"
					? last.content
					: (last?.content ?? [])
							.filter((b) => b.type === "text")
							.map((b) => b.text)
							.join("\n");
			const recall = last?.role === "user" && contentText.includes("RECALL:");
			const args = recall
				? JSON.parse(contentText.slice(contentText.indexOf("RECALL:") + 7))
				: null;
			const readSource =
				last?.role === "user" && contentText.startsWith("READ_SOURCE:");
			const repeated = last?.role === "user" && contentText === "V3_RESEARCH";
			const reason = recall || readSource || repeated ? "toolUse" : "stop";
			const message = {
				role: "assistant",
				api: model.api,
				provider: model.provider,
				model: model.id,
				content:
					recall || readSource || repeated
						? [
								{
									type: "toolCall",
									id: "fixture-" + Date.now(),
									name: repeated
										? "v3_research"
										: recall
											? "aco_recall"
											: "read",
									arguments: recall ? args : { path: contentText.slice(12) },
								},
							]
						: [{ type: "text", text: "Controlled response." }],
				stopReason: reason,
				timestamp: 1,
				usage: {
					input: 1000,
					output: 10,
					cacheRead: 0,
					cacheWrite: 0,
					totalTokens: 1010,
					cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
				},
			};
			const stream = createAssistantMessageEventStream();
			queueMicrotask(() => {
				if (failures > 0) {
					failures--;
					const error = {
						...message,
						content: [],
						stopReason: "error",
						errorMessage: positivePartial
							? "stream stalled: controlled positive partial usage"
							: "503 controlled transient failure",
						// Reproduce the SDK zero-default shape when a failed request has no usage metadata.
						usage: positivePartial
							? {
									...message.usage,
									input: 96702,
									output: 151,
									totalTokens: 96853,
								}
							: {
									input: 0,
									output: 0,
									cacheRead: 0,
									cacheWrite: 0,
									totalTokens: 0,
									cost: {
										input: 0,
										output: 0,
										cacheRead: 0,
										cacheWrite: 0,
										total: 0,
									},
								},
					};
					positivePartial = false;
					stream.push({ type: "error", reason: "error", error });
					stream.end(error);
					return;
				}
				stream.push({ type: "done", reason, message });
				stream.end(message);
			});
			return stream;
		},
	});
}
