import { appendFileSync, writeFileSync } from "node:fs";
import { createAssistantMessageEventStream } from "@earendil-works/pi-ai";
export default function fixture(pi) {
	let fault = "none";
	const pending = new Set();
	pi.registerCommand("delegation-fault", {
		handler: async (args) => {
			if (
				!["none", "malformed", "error", "overrun", "tool", "hold"].includes(
					args,
				)
			)
				throw Error("Invalid fixture fault");
			fault = args;
		},
	});
	const release = () => {
		for (const done of pending) done();
		pending.clear();
	};
	pi.registerCommand("delegation-release", { handler: async () => release() });
	pi.on("session_shutdown", release);
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
			let payload, forbiddenRecall;
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
				const stolen = request.contract.constraints.find((s) =>
					s.startsWith("UNAUTHORIZED_RECALL:"),
				);
				if (stolen)
					forbiddenRecall = JSON.parse(
						stolen.slice("UNAUTHORIZED_RECALL:".length),
					);
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
			const currentFault = child ? fault : "none";
			if (currentFault === "malformed") message.content[0].text = "not JSON";
			if (currentFault === "error") {
				message.stopReason = "error";
				message.errorMessage = "Controlled failed child";
			}
			if (currentFault === "overrun") {
				message.usage.output = (options?.maxTokens ?? 2000) + 1;
				message.usage.totalTokens = 1000000;
			}
			if (currentFault === "tool")
				message.content = [
					{
						type: "toolCall",
						id: "unauthorized-recall",
						name: "aco_recall",
						arguments: forbiddenRecall ?? {
							checkpointId: "00000000-0000-0000-0000-000000000000",
							segmentId: "ungranted",
							budgetBytes: 8192,
						},
					},
				];
			const stream = createAssistantMessageEventStream();
			const finish = () => {
				stream.push({ type: "start", partial: message });
				if (message.stopReason === "error")
					stream.push({ type: "error", reason: "error", error: message });
				else stream.push({ type: "done", reason: "stop", message });
				stream.end();
			};
			// Deliberately uncooperative child: revoke must not wait for provider cooperation.
			if (currentFault === "hold") pending.add(finish);
			else queueMicrotask(finish);
			return stream;
		},
	});
}
