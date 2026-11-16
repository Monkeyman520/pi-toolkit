import { appendFileSync } from "node:fs";
import {
	createAssistantMessageEventStream,
	getCurrentSystemPrompt,
} from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
	pi.registerProvider("antigravity", {
		baseUrl: "http://127.0.0.1/unused",
		api: "prompt-pipeline-fixture",
		apiKey: "synthetic-no-credentials",
		models: [
			{
				id: "gemini-fixture",
				name: "Fixture",
				reasoning: false,
				input: ["text"],
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
				contextWindow: 100000,
				maxTokens: 128,
			},
		],
		streamSimple(model, context, options) {
			const stream = createAssistantMessageEventStream();
			void (async () => {
				const prompt = getCurrentSystemPrompt(context.messages);
				const shape = {
					project: "synthetic",
					model: model.id,
					request: {
						systemInstruction: {
							role: "user",
							parts: [
								{ text: prompt },
								{ inlineData: { mimeType: "test", data: "untouched" } },
							],
						},
						contents: [{ role: "user", parts: [{ text: "user-untouched" }] }],
					},
					requestId: "fixture-id",
				};
				const replacement = await options?.onPayload?.(shape, model);
				const payload = replacement === undefined ? shape : replacement;
				const path = process.env.PROMPT_PIPELINE_FIXTURE_LOG;
				if (path) appendFileSync(path, `${JSON.stringify({ payload })}\n`);
				const output = {
					role: "assistant" as const,
					content: [{ type: "text" as const, text: "fixture-ok" }],
					api: model.api,
					provider: model.provider,
					model: model.id,
					usage: {
						input: 1,
						output: 1,
						cacheRead: 0,
						cacheWrite: 0,
						totalTokens: 2,
						cost: {
							input: 0,
							output: 0,
							cacheRead: 0,
							cacheWrite: 0,
							total: 0,
						},
					},
					stopReason: "stop" as const,
					timestamp: Date.now(),
				};
				stream.push({ type: "start", partial: output });
				stream.push({ type: "done", reason: "stop", message: output });
				stream.end();
			})().catch((error) => {
				stream.end();
				throw error;
			});
			return stream;
		},
	});
	pi.on("before_agent_start", (event) => ({
		systemPrompt: `peer-before\n${event.systemPrompt}\n<project_context>Commit format: <gitmoji> <type>(<scope>): <subject></project_context>`,
	}));
	pi.events.on("pi-packages:ui:discover", (payload: unknown) => {
		if (
			payload &&
			typeof payload === "object" &&
			"register" in payload &&
			typeof payload.register === "function"
		)
			payload.register({
				id: "fixture-panel",
				title: "Fixture Panel",
				command: "/fixture-panel",
				getSummary: () => "loaded fixture only",
				open: async (ctx: {
					ui: { notify(text: string, type: string): void };
				}) => ctx.ui.notify("Fixture panel opened", "info"),
			});
	});
	pi.on("session_start", (event) => {
		if (process.env.PROMPT_PIPELINE_FIXTURE_LIFECYCLE)
			appendFileSync(
				process.env.PROMPT_PIPELINE_FIXTURE_LIFECYCLE,
				`${JSON.stringify({ reason: event.reason })}\n`,
			);
	});
}
