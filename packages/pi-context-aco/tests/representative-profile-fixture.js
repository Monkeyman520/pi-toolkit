import { createAssistantMessageEventStream } from "@earendil-works/pi-ai";
export default function fixture(pi) {
	pi.registerProvider("profile-fixture", {
		api: "profile-fixture-api",
		apiKey: "fixture",
		baseUrl: "https://example.invalid",
		models: [
			{
				id: "test",
				name: "Controlled profile probe",
				reasoning: false,
				input: ["text"],
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
				contextWindow: 100000,
				maxTokens: 1000,
			},
		],
		streamSimple(model, context) {
			const tools = context.messages.at(-1)?.role === "user";
			const message = {
				role: "assistant",
				api: model.api,
				provider: model.provider,
				model: model.id,
				timestamp: Date.now(),
				content: tools
					? [
							{
								type: "toolCall",
								id: "profile-probe",
								name: "bash",
								arguments: { command: "npm test -- tests/delegation.test.ts" },
							},
						]
					: [
							{
								type: "text",
								text: "Controlled profile probe finished; tool output is independent evidence.",
							},
						],
				stopReason: tools ? "toolUse" : "stop",
				usage: {
					input: 0,
					output: 0,
					cacheRead: 0,
					cacheWrite: 0,
					totalTokens: 0,
					cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
				},
			};
			const stream = createAssistantMessageEventStream();
			queueMicrotask(() => {
				stream.push({ type: "start", partial: message });
				stream.push({ type: "done", reason: message.stopReason, message });
				stream.end();
			});
			return stream;
		},
	});
}
