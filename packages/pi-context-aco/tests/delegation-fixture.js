import { appendFileSync, writeFileSync } from "node:fs";
import { createAssistantMessageEventStream } from "@earendil-works/pi-ai";
export default function fixture(pi) {
	const probe = (ctx) => {
		const data = {
			sessionFile: ctx.sessionManager.getSessionFile(),
			branch: ctx.sessionManager.getBranch(),
			projection: ctx.sessionManager.buildSessionProjection().messages,
		};
		if (process.env.ACO_PROBE)
			writeFileSync(process.env.ACO_PROBE, JSON.stringify(data));
		return data;
	};
	pi.on("agent_settled", (_event, ctx) => probe(ctx));
	pi.registerCommand("delegation-probe", {
		handler: async (_args, ctx) =>
			ctx.ui.notify(JSON.stringify(probe(ctx)), "info"),
	});
	pi.registerProvider("delegation-fixture", {
		api: "aco-delegation-fixture",
		apiKey: "fixture",
		baseUrl: "https://example.invalid",
		models: [
			{
				id: "test",
				name: "Controlled independent children",
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
			appendFileSync(
				process.env.ACO_REQUESTS,
				JSON.stringify({ child, context, maxTokens: options?.maxTokens }) +
					"\n",
			);
			let payload;
			if (child) {
				const last = context.messages.at(-1);
				const raw =
					typeof last.content === "string"
						? last.content
						: last.content
								.filter((c) => c.type === "text")
								.map((c) => c.text)
								.join("");
				const request = JSON.parse(raw);
				payload = {
					conclusions: ["Controlled analysis: " + request.contract.goal],
					deliverables: request.resources
						.filter((r) => r.write)
						.map((r) => ({
							path: r.path,
							content: "verified child proposal\n",
						})),
					evidence: request.contract.evidence.map(
						(r) => r.checkpointId + ":" + r.segmentId,
					),
					tests: ["Not executed: child has no shell tools"],
					unresolvedIssues: [],
				};
			}
			const message = {
				role: "assistant",
				api: model.api,
				provider: model.provider,
				model: model.id,
				content: [
					{
						type: "text",
						text: child
							? JSON.stringify(payload)
							: "Controlled parent response",
					},
				],
				stopReason: "stop",
				timestamp: Date.now(),
				usage: {
					input: child ? 200 : 1000,
					output: child ? 100 : 10,
					cacheRead: 0,
					cacheWrite: 0,
					totalTokens: child ? 300 : 1010,
					cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
				},
			};
			const stream = createAssistantMessageEventStream();
			queueMicrotask(() => {
				stream.push({ type: "start", partial: message });
				stream.push({ type: "done", reason: "stop", message });
				stream.end();
			});
			return stream;
		},
	});
}
