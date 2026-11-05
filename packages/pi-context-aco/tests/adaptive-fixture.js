import { appendFileSync } from "node:fs";
import { createAssistantMessageEventStream } from "@earendil-works/pi-ai";
import { Type } from "typebox";
export default function fixture(pi) {
	pi.registerCommand("adaptive-probe", {
		handler: async (_args, ctx) =>
			ctx.ui.notify(
				JSON.stringify({
					branch: ctx.sessionManager.getBranch(),
					projection: ctx.sessionManager.buildSessionProjection().messages,
					sourceIds: ctx.sessionManager
						.buildSessionProjection()
						.entries.filter((e) => e.messages.length)
						.map((e) => e.sourceEntry.id),
					sessionFile: ctx.sessionManager.getSessionFile(),
				}),
				"info",
			),
	});
	pi.registerTool({
		name: "adaptive_research",
		label: "Controlled research",
		description: "Test-only repeated historical observations",
		parameters: Type.Object({ topic: Type.String() }),
		async execute(_id, args) {
			return {
				content: [
					{
						type: "text",
						text: (
							"Historical observation " +
							args.topic +
							": compatibility retained.\n"
						).repeat(1000),
					},
				],
				details: { controlled: true },
			};
		},
	});
	pi.registerProvider("adaptive-fixture", {
		api: "aco-adaptive-fixture",
		apiKey: "fixture",
		baseUrl: "https://example.invalid",
		models: [
			{
				id: "test",
				name: "Controlled composition",
				reasoning: false,
				input: ["text"],
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
				contextWindow: 100000,
				maxTokens: 4000,
			},
		],
		streamSimple(model, context, options) {
			const child = JSON.stringify(context.messages[0]).includes(
				"ACO independent child.",
			);
			const last = context.messages.at(-1);
			const content =
				typeof last.content === "string"
					? last.content
					: last.content
							.filter((c) => c.type === "text")
							.map((c) => c.text)
							.join("");
			let blocks = [
					{ type: "text", text: "CONTINUITY_OK: preserve compatibility" },
				],
				stopReason = "stop";
			if (child) {
				const request = JSON.parse(content);
				blocks = [
					{
						type: "text",
						text: JSON.stringify({
							conclusions: ["Controlled independent compatibility analysis"],
							deliverables: [],
							evidence: request.contract.evidence.map(
								(r) => r.checkpointId + ":" + r.segmentId,
							),
							tests: ["Not run: no child shell"],
							unresolvedIssues: [],
						}),
					},
				];
			} else if (last.role === "user" && content.startsWith("RESEARCH:")) {
				blocks = [
					{
						type: "toolCall",
						id: "research-" + Date.now(),
						name: "adaptive_research",
						arguments: { topic: content.slice(9) },
					},
				];
				stopReason = "toolUse";
			}
			const input = Math.ceil(JSON.stringify(context).length / 4),
				output = Math.ceil(JSON.stringify(blocks).length / 4);
			const usage = {
				input,
				output,
				cacheRead: 0,
				cacheWrite: 0,
				totalTokens: input + output,
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
			};
			appendFileSync(
				process.env.ACO_REQUESTS,
				JSON.stringify({
					child,
					context,
					usage,
					maxTokens: options?.maxTokens,
				}) + "\n",
			);
			const message = {
				role: "assistant",
				api: model.api,
				provider: model.provider,
				model: model.id,
				content: blocks,
				stopReason,
				timestamp: Date.now(),
				usage,
			};
			const stream = createAssistantMessageEventStream();
			queueMicrotask(() => {
				stream.push({ type: "start", partial: message });
				stream.push({ type: "done", reason: stopReason, message });
				stream.end();
			});
			return stream;
		},
	});
}
