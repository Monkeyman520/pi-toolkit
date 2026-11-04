import type { Api, AssistantMessage, Model } from "@earendil-works/pi-ai";
import type {
	SessionEntry,
	SessionHeader,
} from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { defaultConfig } from "../extensions/config.ts";
import {
	buildHeuristicSummary,
	CUSTOM_ENTRY_TYPE,
	computeSessionMetrics,
	evaluateSummaryTrigger,
	generateSessionSummary,
	parseLlmSummaryResponse,
	reconstructMetadata,
} from "../extensions/summarizer.ts";

function makeMessageEntry(
	id: string,
	parentId: string | null,
	role: "user" | "assistant",
	text: string,
	timestampMs: number,
	tokens = 200,
): SessionEntry {
	if (role === "user") {
		return {
			type: "message",
			id,
			parentId,
			timestamp: new Date(timestampMs).toISOString(),
			message: {
				role: "user",
				content: text,
				timestamp: timestampMs,
			},
		};
	}
	return {
		type: "message",
		id,
		parentId,
		timestamp: new Date(timestampMs).toISOString(),
		message: {
			role: "assistant",
			content: [
				{ type: "text", text },
				{
					type: "toolCall",
					id: "call_1",
					name: "write",
					arguments: { path: "packages/pi-pretty-session/extensions/index.ts" },
				},
			],
			api: "anthropic-messages",
			provider: "anthropic",
			model: "claude-sonnet-4-5",
			usage: {
				input: tokens,
				output: 50,
				cacheRead: 0,
				cacheWrite: 0,
				totalTokens: tokens + 50,
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
			},
			stopReason: "stop",
			timestamp: timestampMs,
		} as AssistantMessage,
	};
}

describe("summarizer & session metrics", () => {
	const header: SessionHeader = {
		type: "session",
		version: 3,
		id: "sess-123",
		timestamp: "2026-04-20T08:00:00.000Z",
		cwd: "/workspace/pi-packages",
	};

	const entries: SessionEntry[] = [
		makeMessageEntry(
			"e1",
			null,
			"user",
			"Implement pretty-session plugin with dynamic config and session metrics.",
			Date.parse("2026-04-20T08:01:00.000Z"),
		),
		makeMessageEntry(
			"e2",
			"e1",
			"assistant",
			"Created extension entry and dynamic config loader.",
			Date.parse("2026-04-20T08:02:00.000Z"),
			1500,
		),
	];

	it("computes start time, last update time, turns, and context usage metrics", () => {
		const metrics = computeSessionMetrics({
			entries,
			header,
			contextUsage: {
				tokens: 4200,
				contextWindow: 200000,
				percent: 2.1,
			},
		});

		expect(metrics.sessionId).toBe("sess-123");
		expect(metrics.createdAt).toBe("2026-04-20T08:00:00.000Z");
		expect(metrics.updatedAt).toBe("2026-04-20T08:02:00.000Z");
		expect(metrics.turnCount).toBe(1);
		expect(metrics.messageCount).toBe(2);
		expect(metrics.contextTokens).toBe(4200);
		expect(metrics.contextWindow).toBe(200000);
		expect(metrics.contextPercent).toBe(2.1);

		const fallbackMetrics = computeSessionMetrics({
			entries,
			header,
			modelContextWindow: 100000,
		});
		expect(fallbackMetrics.contextTokens).toBe(1550);
		expect(fallbackMetrics.contextWindow).toBe(100000);
		expect(fallbackMetrics.contextPercent).toBeCloseTo(1.55);
	});

	it("evaluates initial, turn_interval, context_delta, compact, and manual-lock triggers", () => {
		const metrics = computeSessionMetrics({
			entries,
			header,
			contextUsage: { tokens: 2000, contextWindow: 100000, percent: 2 },
		});

		const initial = evaluateSummaryTrigger({
			config: defaultConfig,
			metrics,
			current: undefined,
			reason: "turn",
		});
		expect(initial).toEqual({
			shouldSummarize: true,
			trigger: "initial",
			updateTitle: true,
		});

		const existing = {
			version: 1 as const,
			title: "Initial Title",
			description: "Initial Desc",
			source: "llm" as const,
			manualLocked: false,
			createdAt: metrics.createdAt,
			updatedAt: metrics.updatedAt,
			turnCount: 1,
			messageCount: 2,
			contextTokens: 2000,
			contextWindow: 100000,
			contextPercent: 2,
			summarizedAtTurn: 1,
			summarizedAtTokens: 2000,
		};

		const noTrigger = evaluateSummaryTrigger({
			config: defaultConfig,
			metrics: { ...metrics, turnCount: 2, contextTokens: 3000 },
			current: existing,
			reason: "turn",
		});
		expect(noTrigger.shouldSummarize).toBe(false);

		const byTurnInterval = evaluateSummaryTrigger({
			config: defaultConfig,
			metrics: { ...metrics, turnCount: 4, contextTokens: 3000 },
			current: existing,
			reason: "turn",
		});
		expect(byTurnInterval).toEqual({
			shouldSummarize: true,
			trigger: "turn_interval",
			updateTitle: true,
		});

		const byContextDelta = evaluateSummaryTrigger({
			config: defaultConfig,
			metrics: { ...metrics, turnCount: 2, contextTokens: 11000 },
			current: existing,
			reason: "turn",
		});
		expect(byContextDelta).toEqual({
			shouldSummarize: true,
			trigger: "context_delta",
			updateTitle: true,
		});

		const lockedTitle = evaluateSummaryTrigger({
			config: defaultConfig,
			metrics: { ...metrics, turnCount: 4 },
			current: { ...existing, manualLocked: true, source: "manual" },
			reason: "turn",
		});
		expect(lockedTitle.shouldSummarize).toBe(true);
		expect(lockedTitle.updateTitle).toBe(false);
	});

	it("reconstructs persisted metadata and detects external manual renames", () => {
		const entriesWithCustom: SessionEntry[] = [
			...entries,
			{
				type: "custom",
				id: "c1",
				parentId: "e2",
				timestamp: "2026-04-20T08:02:05.000Z",
				customType: CUSTOM_ENTRY_TYPE,
				data: {
					version: 1,
					title: "Auto Generated Title",
					description: "Auto Generated Description",
					source: "llm",
					manualLocked: false,
					createdAt: "2026-04-20T08:00:00.000Z",
					updatedAt: "2026-04-20T08:02:00.000Z",
					turnCount: 1,
					messageCount: 2,
					contextTokens: 1550,
					contextWindow: 100000,
					contextPercent: 1.55,
					summarizedAtTurn: 1,
					summarizedAtTokens: 1550,
				},
			},
		];

		const normal = reconstructMetadata(
			entriesWithCustom,
			"Auto Generated Title",
		);
		expect(normal?.title).toBe("Auto Generated Title");
		expect(normal?.manualLocked).toBe(false);

		const renamedExternally = reconstructMetadata(
			entriesWithCustom,
			"User Custom Name",
		);
		expect(renamedExternally?.title).toBe("User Custom Name");
		expect(renamedExternally?.source).toBe("manual");
		expect(renamedExternally?.manualLocked).toBe(true);
	});

	it("parses LLM JSON and falls back cleanly to heuristic summary on failure", async () => {
		const parsedJson = parseLlmSummaryResponse(
			'```json\n{"title": "Add Pretty Session Plugin", "description": "Implements automatic session naming, dynamic config reload, and project metadata display."}\n```',
		);
		expect(parsedJson).toEqual({
			title: "Add Pretty Session Plugin",
			description:
				"Implements automatic session naming, dynamic config reload, and project metadata display.",
		});

		const heuristic = buildHeuristicSummary(entries);
		expect(heuristic.title).toContain("Implement pretty-session plugin");
		expect(heuristic.description).toContain("extensions/index.ts");

		const fakeModel = {
			id: "claude-sonnet-4-5",
			name: "Claude Sonnet",
			api: "anthropic-messages",
			provider: "anthropic",
			baseUrl: "https://api.anthropic.com",
			reasoning: false,
			input: ["text"],
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
			contextWindow: 200000,
			maxTokens: 8192,
		} as unknown as Model<Api>;

		const llmResult = await generateSessionSummary({
			entries,
			config: defaultConfig,
			model: fakeModel,
			modelRegistry: {
				find: () => fakeModel,
				getAvailable: () => [fakeModel],
				complete: async () =>
					({
						role: "assistant",
						content: [
							{
								type: "text",
								text: '{"title": "Pretty Session Plugin", "description": "Added session title/description summarizer and TUI metadata widget."}',
							},
						],
						stopReason: "stop",
					}) as unknown as AssistantMessage,
			},
		});
		expect(llmResult).toEqual({
			title: "Pretty Session Plugin",
			description:
				"Added session title/description summarizer and TUI metadata widget.",
			source: "llm",
		});

		const fallbackResult = await generateSessionSummary({
			entries,
			config: defaultConfig,
			model: fakeModel,
			modelRegistry: {
				find: () => fakeModel,
				getAvailable: () => [fakeModel],
				complete: async () => {
					throw new Error("Provider offline");
				},
			},
		});
		expect(fallbackResult.source).toBe("heuristic");
		expect(fallbackResult.title).toContain("Implement pretty-session plugin");
	});
});
