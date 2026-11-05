import { appendFileSync } from "node:fs";
import { createAssistantMessageEventStream } from "@earendil-works/pi-ai";
export default function fixture(pi) {
	pi.registerCommand("evidence-probe", {
		handler: async (_args, ctx) => {
			ctx.ui.notify(
				JSON.stringify({
					sessionFile: ctx.sessionManager.getSessionFile(),
					sessionId: ctx.sessionManager.getSessionId(),
					leaf: ctx.sessionManager.getLeafId(),
					branch: ctx.sessionManager.getBranch(),
					projection: ctx.sessionManager.buildSessionProjection().messages,
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
			const reason = recall || readSource ? "toolUse" : "stop";
			const message = {
				role: "assistant",
				api: model.api,
				provider: model.provider,
				model: model.id,
				content:
					recall || readSource
						? [
								{
									type: "toolCall",
									id: "fixture-" + Date.now(),
									name: recall ? "aco_recall" : "read",
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
				stream.push({ type: "done", reason, message });
				stream.end(message);
			});
			return stream;
		},
	});
}
