import type { Api, AssistantMessage, Model } from "@earendil-works/pi-ai";
import type {
	SessionEntry,
	SessionHeader,
} from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { defaultConfig } from "../extensions/config.ts";
import {
	applyDuplicateTitleSuffix,
	buildConversationExcerpt,
	buildHeuristicSummary,
	buildSummarySystemPrompt,
	CUSTOM_ENTRY_TYPE,
	computeSessionMetrics,
	detectConversationLanguage,
	evaluateSummaryTrigger,
	extractUserPromptClue,
	generateSessionSummary,
	parseLlmSummaryResponse,
	reconstructMetadata,
	stripTitleTimestampSuffix,
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

		const byTurnIntervalOnce = evaluateSummaryTrigger({
			config: defaultConfig,
			metrics: { ...metrics, turnCount: 4, contextTokens: 3000 },
			current: existing,
			reason: "turn",
		});
		expect(byTurnIntervalOnce).toEqual({
			shouldSummarize: true,
			trigger: "turn_interval",
			updateTitle: false,
		});

		const byTurnIntervalDynamic = evaluateSummaryTrigger({
			config: { ...defaultConfig, titleUpdateMode: "dynamic" },
			metrics: { ...metrics, turnCount: 4, contextTokens: 3000 },
			current: existing,
			reason: "turn",
		});
		expect(byTurnIntervalDynamic).toEqual({
			shouldSummarize: true,
			trigger: "turn_interval",
			updateTitle: true,
		});

		const byContextDeltaOnce = evaluateSummaryTrigger({
			config: defaultConfig,
			metrics: { ...metrics, turnCount: 2, contextTokens: 11000 },
			current: existing,
			reason: "turn",
		});
		expect(byContextDeltaOnce).toEqual({
			shouldSummarize: true,
			trigger: "context_delta",
			updateTitle: false,
		});

		const byContextDeltaDynamic = evaluateSummaryTrigger({
			config: { ...defaultConfig, titleUpdateMode: "dynamic" },
			metrics: { ...metrics, turnCount: 2, contextTokens: 11000 },
			current: existing,
			reason: "turn",
		});
		expect(byContextDeltaDynamic).toEqual({
			shouldSummarize: true,
			trigger: "context_delta",
			updateTitle: true,
		});

		const byCompactOnce = evaluateSummaryTrigger({
			config: defaultConfig,
			metrics: { ...metrics, turnCount: 2, contextTokens: 3000 },
			current: existing,
			reason: "compact",
		});
		expect(byCompactOnce).toEqual({
			shouldSummarize: true,
			trigger: "compact",
			updateTitle: false,
		});

		const byManual = evaluateSummaryTrigger({
			config: defaultConfig,
			metrics: { ...metrics, turnCount: 2, contextTokens: 3000 },
			current: existing,
			reason: "manual",
		});
		expect(byManual).toEqual({
			shouldSummarize: true,
			trigger: "manual",
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

		const entriesWithControlChars: SessionEntry[] = [
			...entries,
			{
				type: "custom",
				id: "c2",
				parentId: "e2",
				timestamp: "2026-04-20T08:03:00.000Z",
				customType: CUSTOM_ENTRY_TYPE,
				data: {
					version: 1,
					title: "Evil\nTitle\u001b[31m",
					description: "Line1\r\nLine2\u0007",
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
					projectName: "proj\nname",
					gitBranch: "main\u001b",
				},
			},
		];
		const sanitized = reconstructMetadata(entriesWithControlChars, undefined);
		expect(sanitized?.title).toBe("Evil Title [31m");
		expect(sanitized?.title).not.toContain("\u001b");
		expect(sanitized?.description).toBe("Line1 Line2");
		expect(sanitized?.description).not.toContain("\u0007");
		expect(sanitized?.projectName).toBe("proj name");
		expect(sanitized?.gitBranch).not.toContain("\u001b");
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

	it("deduplicates colliding titles with pre-reserved local timestamp suffix without double-appending", () => {
		const createdAt = new Date(2026, 10, 18, 14, 40, 40).toISOString();
		const unique = applyDuplicateTitleSuffix({
			candidateTitle: "Refactor Auth Middleware.",
			existingTitles: ["Other Session"],
			createdAt,
			maxTitleLength: 40,
		});
		expect(unique).toBe("Refactor Auth Middleware");

		const colliding = applyDuplicateTitleSuffix({
			candidateTitle: "Refactor Auth Middleware",
			existingTitles: ["Refactor Auth Middleware"],
			createdAt,
			maxTitleLength: 40,
		});
		expect(colliding).toBe("Refactor Auth… [2026-11-18 14:40:40]");
		expect(colliding.length).toBeLessThanOrEqual(40);
		expect(colliding.endsWith("[2026-11-18 14:40:40]")).toBe(true);

		// Existing timestamp suffix is stripped before deduplication so suffixes never double up
		const alreadySuffixed = applyDuplicateTitleSuffix({
			candidateTitle: "Refactor Auth Middleware [2026-11-18 09:00:00]",
			existingTitles: ["Refactor Auth Middleware"],
			createdAt,
			maxTitleLength: 40,
		});
		expect(alreadySuffixed).toBe("Refactor Auth… [2026-11-18 14:40:40]");
		expect(stripTitleTimestampSuffix(alreadySuffixed)).toBe("Refactor Auth…");
	});

	it("strips expanded <skill> blocks and command prefixes while preserving real prompts and skill-only clues", () => {
		const mixedPrompt = [
			'<skill name="grimoire-refine" location="/skills/grimoire-refine/SKILL.md">',
			"# Coordination",
			"Lots of detailed English SKILL.md instructions that must never leak into summary.",
			"</skill>",
			"",
			"$grimoire-refine 优化会话标题与摘要",
		].join("\n");
		const extracted = extractUserPromptClue(mixedPrompt);
		expect(extracted).toEqual({
			text: "优化会话标题与摘要",
			skillNames: ["grimoire-refine"],
		});

		const slashSkill = extractUserPromptClue("/skill:pdf extract report.pdf");
		expect(slashSkill).toEqual({
			text: "extract report.pdf",
			skillNames: ["pdf"],
		});

		const pathPreserved = extractUserPromptClue(
			"/workspace/pi-packages/index.ts fix $100 budget",
		);
		expect(pathPreserved.text).toBe(
			"/workspace/pi-packages/index.ts fix $100 budget",
		);

		const skillOnlyEntries: SessionEntry[] = [
			makeMessageEntry(
				"u1",
				null,
				"user",
				'<skill name="pdf" location="/skills/pdf/SKILL.md">\n# PDF Tools\nFull instructions...\n</skill>',
				Date.parse("2026-04-20T08:01:00.000Z"),
			),
			makeMessageEntry(
				"a1",
				"u1",
				"assistant",
				"Ready.",
				Date.parse("2026-04-20T08:02:00.000Z"),
			),
		];
		const skillOnlyHeuristic = buildHeuristicSummary(skillOnlyEntries);
		expect(skillOnlyHeuristic.title).toBe("Skill: pdf");
		expect(skillOnlyHeuristic.description).not.toContain("Full instructions");

		const mixedEntries: SessionEntry[] = [
			makeMessageEntry(
				"u1",
				null,
				"user",
				mixedPrompt,
				Date.parse("2026-04-20T08:01:00.000Z"),
			),
			makeMessageEntry(
				"a1",
				"u1",
				"assistant",
				"已完成标题优化。",
				Date.parse("2026-04-20T08:02:00.000Z"),
			),
		];
		const excerpt = buildConversationExcerpt(mixedEntries);
		expect(excerpt).toContain("优化会话标题与摘要");
		expect(excerpt).not.toContain("Lots of detailed English SKILL.md");
		expect(detectConversationLanguage(mixedEntries)).toBe("zh-CN");
	});

	it("respects configured language in both LLM prompt and localized heuristic fallback", async () => {
		const zhPrompt = buildSummarySystemPrompt({
			...defaultConfig,
			language: "zh-CN",
		});
		expect(zhPrompt).toContain("strictly in zh-CN");
		expect(zhPrompt).toContain("本会话旨在");

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

		let capturedSystemPrompt = "";
		await generateSessionSummary({
			entries,
			config: { ...defaultConfig, language: "zh-CN" },
			model: fakeModel,
			modelRegistry: {
				find: () => fakeModel,
				getAvailable: () => [fakeModel],
				complete: async (_model, input) => {
					capturedSystemPrompt = input.systemPrompt ?? "";
					return {
						role: "assistant",
						content: [
							{
								type: "text",
								text: '{"title": "会话摘要插件优化。", "description": "完成配置与多语言生成逻辑。"}',
							},
						],
						stopReason: "stop",
					} as unknown as AssistantMessage;
				},
			},
		});
		expect(capturedSystemPrompt).toContain("strictly in zh-CN");

		const zhHeuristic = buildHeuristicSummary(
			entries,
			undefined,
			40,
			100,
			"zh-CN",
		);
		expect(zhHeuristic.description).toContain("文件:");

		const emptyZh = buildHeuristicSummary([], undefined, 40, 100, "zh-CN");
		expect(emptyZh.title).toBe("新建 Pi 会话");

		const emptyJa = buildHeuristicSummary([], undefined, 40, 100, "ja");
		expect(emptyJa.title).toBe("新規 Pi セッション");
	});
});
