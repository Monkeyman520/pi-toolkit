import {
	type Api,
	type AssistantMessage,
	type Message,
	type Model,
	uuidv7,
} from "@earendil-works/pi-ai";
import type {
	ContextUsage,
	ModelRegistry,
	SessionEntry,
	SessionHeader,
} from "@earendil-works/pi-coding-agent";
import type { PrettySessionConfig } from "./config.ts";
import type { ProjectInfo } from "./project.ts";

export const CUSTOM_ENTRY_TYPE = "pretty-session";

export type SummarySource = "llm" | "heuristic" | "manual";

export type SummaryTriggerReason =
	| "initial"
	| "turn_interval"
	| "context_delta"
	| "compact"
	| "manual";

export interface SessionMetrics {
	sessionId: string;
	sessionFile?: string;
	createdAt: string;
	updatedAt: string;
	turnCount: number;
	messageCount: number;
	userMessageCount: number;
	assistantMessageCount: number;
	compactionCount: number;
	contextTokens: number | null;
	contextWindow: number;
	contextPercent: number | null;
}

export interface PrettySessionEntryData {
	version: 1;
	title: string;
	description: string;
	source: SummarySource;
	manualLocked: boolean;
	createdAt: string;
	updatedAt: string;
	turnCount: number;
	messageCount: number;
	contextTokens: number | null;
	contextWindow: number;
	contextPercent: number | null;
	summarizedAtTurn: number;
	summarizedAtTokens: number;
	projectName?: string;
	gitBranch?: string;
}

const SUMMARY_SYSTEM_PROMPT = `You are a session title and description generator for a coding agent.
Given the conversation excerpts and project context, output ONLY a single valid JSON object with two keys:
{"title": "<concise 3-8 word session title>", "description": "<single-sentence summary of the goal, key actions, and current state>"}
Do not include markdown code fences or extra commentary.`;

export function sanitizeSingleLine(text: string, maxLen: number): string {
	const cleaned = text
		.replace(/\p{Cc}/gu, " ")
		.replace(/\s+/g, " ")
		.replace(/^["'`]+|["'`]+$/g, "")
		.trim();
	if (cleaned.length <= maxLen) return cleaned;
	const sliced = cleaned.slice(0, Math.max(1, maxLen - 1)).trimEnd();
	return `${sliced}…`;
}

export function extractMessageText(message: unknown): string {
	if (!message || typeof message !== "object") return "";
	const msg = message as Record<string, unknown>;
	const content = msg.content;
	if (typeof content === "string") return content;
	if (Array.isArray(content)) {
		return content
			.filter(
				(block): block is { type: "text"; text: string } =>
					Boolean(block) &&
					typeof block === "object" &&
					(block as Record<string, unknown>).type === "text" &&
					typeof (block as Record<string, unknown>).text === "string",
			)
			.map((block) => block.text)
			.join(" ");
	}
	return "";
}

export function extractTouchedFiles(
	entries: readonly SessionEntry[],
): string[] {
	const files: string[] = [];
	const addFile = (candidate: unknown) => {
		if (typeof candidate !== "string") return;
		const trimmed = candidate.trim();
		if (!trimmed || trimmed.length > 160) return;
		const normalized = trimmed.replace(/\\/g, "/");
		const short = normalized.split("/").slice(-2).join("/");
		if (short && !files.includes(short)) {
			files.push(short);
		}
	};

	for (const entry of entries) {
		if (entry.type !== "message") continue;
		const msg = entry.message as unknown as Record<string, unknown>;
		if (msg.role === "assistant" && Array.isArray(msg.content)) {
			for (const block of msg.content) {
				if (
					block &&
					typeof block === "object" &&
					(block as Record<string, unknown>).type === "toolCall"
				) {
					const args = (block as Record<string, unknown>).arguments;
					if (args && typeof args === "object") {
						const rec = args as Record<string, unknown>;
						addFile(rec.path ?? rec.filePath ?? rec.file);
					}
				}
			}
		}
	}
	return files.slice(0, 4);
}

function resolveEntryTimestampMs(entry: SessionEntry): number | undefined {
	if (entry.type === "message") {
		const msg = entry.message as unknown as Record<string, unknown>;
		if (typeof msg.timestamp === "number" && Number.isFinite(msg.timestamp)) {
			return msg.timestamp;
		}
	}
	const parsed = Date.parse(entry.timestamp);
	return Number.isNaN(parsed) ? undefined : parsed;
}

export function computeSessionMetrics(options: {
	entries: readonly SessionEntry[];
	header: SessionHeader | null;
	contextUsage?: ContextUsage;
	modelContextWindow?: number;
	sessionId?: string;
	sessionFile?: string;
	now?: number;
}): SessionMetrics {
	const nowIso = new Date(options.now ?? Date.now()).toISOString();
	const createdAt =
		options.header?.timestamp &&
		!Number.isNaN(Date.parse(options.header.timestamp))
			? new Date(options.header.timestamp).toISOString()
			: options.entries[0]?.timestamp &&
					!Number.isNaN(Date.parse(options.entries[0].timestamp))
				? new Date(options.entries[0].timestamp).toISOString()
				: nowIso;

	let latestActivityMs = Date.parse(createdAt);
	let userMessageCount = 0;
	let assistantMessageCount = 0;
	let compactionCount = 0;
	let latestUsageTokens: number | undefined;
	let totalTextChars = 0;

	for (const entry of options.entries) {
		if (entry.type === "compaction") {
			compactionCount++;
			totalTextChars += entry.summary.length;
			const ts = resolveEntryTimestampMs(entry);
			if (ts !== undefined && ts > latestActivityMs) latestActivityMs = ts;
			continue;
		}
		if (entry.type !== "message") continue;
		const role = (entry.message as unknown as { role?: string }).role;
		if (role === "user" || role === "assistant") {
			const ts = resolveEntryTimestampMs(entry);
			if (ts !== undefined && ts > latestActivityMs) latestActivityMs = ts;
			const text = extractMessageText(entry.message);
			totalTextChars += text.length;
		}
		if (role === "user") {
			userMessageCount++;
		} else if (role === "assistant") {
			assistantMessageCount++;
			const assistant = entry.message as AssistantMessage;
			if (assistant.usage) {
				const u = assistant.usage;
				const sum =
					(u.input ?? 0) +
					(u.output ?? 0) +
					(u.cacheRead ?? 0) +
					(u.cacheWrite ?? 0);
				if (sum > 0) {
					latestUsageTokens = sum;
				} else if (typeof u.totalTokens === "number" && u.totalTokens > 0) {
					latestUsageTokens = u.totalTokens;
				}
			}
		}
	}

	const messageCount = userMessageCount + assistantMessageCount;
	const turnCount = assistantMessageCount;
	const updatedAt = Number.isFinite(latestActivityMs)
		? new Date(latestActivityMs).toISOString()
		: createdAt;

	const contextWindow =
		options.contextUsage?.contextWindow ?? options.modelContextWindow ?? 0;

	let contextTokens: number | null =
		options.contextUsage?.tokens !== undefined &&
		options.contextUsage.tokens !== null
			? options.contextUsage.tokens
			: null;

	if (contextTokens === null) {
		if (latestUsageTokens !== undefined && latestUsageTokens > 0) {
			contextTokens = latestUsageTokens;
		} else if (totalTextChars > 0) {
			contextTokens = Math.max(1, Math.ceil(totalTextChars / 4));
		}
	}

	const contextPercent =
		options.contextUsage?.percent !== undefined &&
		options.contextUsage.percent !== null
			? options.contextUsage.percent
			: contextTokens !== null && contextWindow > 0
				? (contextTokens / contextWindow) * 100
				: null;

	return {
		sessionId: options.sessionId ?? options.header?.id ?? "unknown",
		sessionFile: options.sessionFile,
		createdAt,
		updatedAt,
		turnCount,
		messageCount,
		userMessageCount,
		assistantMessageCount,
		compactionCount,
		contextTokens,
		contextWindow,
		contextPercent,
	};
}

function isPrettySessionEntryData(
	data: unknown,
): data is PrettySessionEntryData {
	if (!data || typeof data !== "object") return false;
	const d = data as Record<string, unknown>;
	return (
		d.version === 1 &&
		typeof d.title === "string" &&
		typeof d.description === "string" &&
		(d.source === "llm" || d.source === "heuristic" || d.source === "manual") &&
		typeof d.manualLocked === "boolean"
	);
}

export function reconstructMetadata(
	entries: readonly SessionEntry[],
	currentSessionName: string | undefined,
	metrics?: SessionMetrics,
	project?: ProjectInfo,
): PrettySessionEntryData | undefined {
	let latest: PrettySessionEntryData | undefined;
	for (const entry of entries) {
		if (
			entry.type === "custom" &&
			entry.customType === CUSTOM_ENTRY_TYPE &&
			isPrettySessionEntryData(entry.data)
		) {
			latest = {
				...entry.data,
				title: sanitizeSingleLine(entry.data.title, 120),
				description: sanitizeSingleLine(entry.data.description, 280),
				projectName: entry.data.projectName
					? sanitizeSingleLine(entry.data.projectName, 80)
					: undefined,
				gitBranch: entry.data.gitBranch
					? sanitizeSingleLine(entry.data.gitBranch, 80)
					: undefined,
			};
		}
	}

	const normalizedName = currentSessionName
		? sanitizeSingleLine(currentSessionName, 120) || undefined
		: undefined;
	if (latest) {
		if (normalizedName && normalizedName !== latest.title) {
			latest = {
				...latest,
				title: normalizedName,
				source: "manual",
				manualLocked: true,
			};
		}
		if (metrics) {
			const metricUpdatedMs = Date.parse(metrics.updatedAt);
			const latestUpdatedMs = Date.parse(latest.updatedAt);
			latest = {
				...latest,
				createdAt: metrics.createdAt || latest.createdAt,
				updatedAt:
					!Number.isNaN(metricUpdatedMs) &&
					(Number.isNaN(latestUpdatedMs) || metricUpdatedMs >= latestUpdatedMs)
						? metrics.updatedAt
						: latest.updatedAt,
				turnCount: Math.max(metrics.turnCount, latest.turnCount),
				messageCount: Math.max(metrics.messageCount, latest.messageCount),
				contextTokens: metrics.contextTokens ?? latest.contextTokens,
				contextWindow: metrics.contextWindow || latest.contextWindow,
				contextPercent: metrics.contextPercent ?? latest.contextPercent,
				projectName: project?.name ?? latest.projectName,
				gitBranch: project?.git.branch ?? latest.gitBranch,
			};
		}
		return latest;
	}

	if (normalizedName) {
		const fallbackDesc = buildHeuristicSummary(entries, project).description;
		return {
			version: 1,
			title: normalizedName,
			description: fallbackDesc,
			source: "manual",
			manualLocked: true,
			createdAt: metrics?.createdAt ?? new Date().toISOString(),
			updatedAt: metrics?.updatedAt ?? new Date().toISOString(),
			turnCount: metrics?.turnCount ?? 0,
			messageCount: metrics?.messageCount ?? 0,
			contextTokens: metrics?.contextTokens ?? null,
			contextWindow: metrics?.contextWindow ?? 0,
			contextPercent: metrics?.contextPercent ?? null,
			summarizedAtTurn: metrics?.turnCount ?? 0,
			summarizedAtTokens: metrics?.contextTokens ?? 0,
			projectName: project?.name,
			gitBranch: project?.git.branch,
		};
	}

	return undefined;
}

export function evaluateSummaryTrigger(params: {
	config: PrettySessionConfig;
	metrics: SessionMetrics;
	current: PrettySessionEntryData | undefined;
	reason: "turn" | "compact" | "manual";
}): {
	shouldSummarize: boolean;
	trigger?: SummaryTriggerReason;
	updateTitle: boolean;
} {
	const { config, metrics, current, reason } = params;

	if (reason === "manual") {
		return {
			shouldSummarize: true,
			trigger: "manual",
			updateTitle: true,
		};
	}

	if (!config.enabled) {
		return { shouldSummarize: false, updateTitle: false };
	}

	const hasConversation =
		metrics.userMessageCount >= 1 &&
		(metrics.assistantMessageCount >= 1 || metrics.compactionCount >= 1);
	if (!hasConversation) {
		return { shouldSummarize: false, updateTitle: false };
	}

	const updateTitle = !(current?.manualLocked && config.protectManualName);

	if (!current || current.summarizedAtTurn === 0) {
		return {
			shouldSummarize: true,
			trigger: "initial",
			updateTitle,
		};
	}

	if (reason === "compact" && config.summarizeOnCompact) {
		return {
			shouldSummarize: true,
			trigger: "compact",
			updateTitle,
		};
	}

	if (metrics.turnCount - current.summarizedAtTurn >= config.updateEveryTurns) {
		return {
			shouldSummarize: true,
			trigger: "turn_interval",
			updateTitle,
		};
	}

	const currentTokens = metrics.contextTokens ?? 0;
	if (currentTokens - current.summarizedAtTokens >= config.contextDeltaTokens) {
		return {
			shouldSummarize: true,
			trigger: "context_delta",
			updateTitle,
		};
	}

	return { shouldSummarize: false, updateTitle: false };
}

function cleanUserPromptForSummary(raw: string): string {
	return raw
		.replace(/```[\s\S]*?```/g, " ")
		.replace(/^\/[a-zA-Z0-9_:-]+\s*/, "")
		.replace(/^\$[a-zA-Z0-9_:-]+\s*/, "")
		.replace(/\p{Cc}/gu, " ")
		.replace(/\s+/g, " ")
		.trim();
}

export function buildHeuristicSummary(
	entries: readonly SessionEntry[],
	project?: ProjectInfo,
	maxTitleLen = 60,
	maxDescLen = 160,
): { title: string; description: string } {
	const userPrompts: string[] = [];
	const assistantReplies: string[] = [];
	let latestCompaction: string | undefined;

	for (const entry of entries) {
		if (entry.type === "compaction" && entry.summary.trim()) {
			latestCompaction = cleanUserPromptForSummary(entry.summary);
			continue;
		}
		if (entry.type !== "message") continue;
		const role = (entry.message as unknown as { role?: string }).role;
		const text = cleanUserPromptForSummary(extractMessageText(entry.message));
		if (!text) continue;
		if (role === "user") userPrompts.push(text);
		else if (role === "assistant") assistantReplies.push(text);
	}

	const touchedFiles = extractTouchedFiles(entries);
	const firstUser = userPrompts[0] ?? latestCompaction ?? "";
	const latestUser = userPrompts[userPrompts.length - 1] ?? firstUser;
	const latestAssistant = assistantReplies[assistantReplies.length - 1] ?? "";

	if (!firstUser && !latestAssistant) {
		const fallbackTitle = project?.name
			? `${project.name} session`
			: "New Pi session";
		const fallbackDesc = project
			? `Interactive coding session in ${project.name}${project.git.branch ? ` (${project.git.branch})` : ""}.`
			: "Interactive Pi coding session.";
		return {
			title: sanitizeSingleLine(fallbackTitle, maxTitleLen),
			description: sanitizeSingleLine(fallbackDesc, maxDescLen),
		};
	}

	const primarySource = latestUser || firstUser || latestAssistant;
	const firstClause =
		primarySource.split(/[.!?;\n]|\s+—\s+/)[0]?.trim() || primarySource;
	const title = sanitizeSingleLine(firstClause, maxTitleLen);

	const descParts: string[] = [];
	if (firstUser) {
		descParts.push(sanitizeSingleLine(firstUser, 64));
	}
	if (userPrompts.length > 1 && latestUser && latestUser !== firstUser) {
		descParts.push(`Latest: ${sanitizeSingleLine(latestUser, 44)}`);
	} else if (latestAssistant) {
		descParts.push(`Outcome: ${sanitizeSingleLine(latestAssistant, 44)}`);
	}
	if (touchedFiles.length > 0) {
		descParts.push(`Files: ${touchedFiles.join(", ")}`);
	} else if (project?.name) {
		descParts.push(`Project: ${project.name}`);
	}

	const description = sanitizeSingleLine(
		descParts.join(" · ") || primarySource,
		maxDescLen,
	);

	return { title, description };
}

export function parseLlmSummaryResponse(
	rawText: string,
	maxTitleLen = 60,
	maxDescLen = 160,
): { title: string; description: string } | undefined {
	const trimmed = rawText.trim();
	if (!trimmed) return undefined;

	const fencedMatch = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
	const candidate = fencedMatch?.[1]?.trim() ?? trimmed;
	const jsonBraceMatch = /\{[\s\S]*\}/.exec(candidate);

	if (jsonBraceMatch) {
		try {
			const parsed: unknown = JSON.parse(jsonBraceMatch[0]);
			if (parsed && typeof parsed === "object") {
				const rec = parsed as Record<string, unknown>;
				const rawTitle = typeof rec.title === "string" ? rec.title.trim() : "";
				const rawDesc =
					typeof rec.description === "string"
						? rec.description.trim()
						: typeof rec.summary === "string"
							? rec.summary.trim()
							: "";
				if (rawTitle && rawDesc) {
					return {
						title: sanitizeSingleLine(rawTitle, maxTitleLen),
						description: sanitizeSingleLine(rawDesc, maxDescLen),
					};
				}
			}
		} catch {
			// Fall back to line parsing
		}
	}

	const titleLine = /^\s*(?:title|name)\s*:\s*(.+)$/im.exec(candidate)?.[1];
	const descLine = /^\s*(?:description|summary)\s*:\s*(.+)$/im.exec(
		candidate,
	)?.[1];
	if (titleLine?.trim() && descLine?.trim()) {
		return {
			title: sanitizeSingleLine(titleLine, maxTitleLen),
			description: sanitizeSingleLine(descLine, maxDescLen),
		};
	}

	return undefined;
}

function buildConversationExcerpt(
	entries: readonly SessionEntry[],
	project?: ProjectInfo,
): string {
	const lines: string[] = [];
	if (project) {
		lines.push(
			`Project: ${project.name} (${project.shortCwd})${project.git.branch ? ` [branch: ${project.git.branch}]` : ""}`,
		);
	}
	const touchedFiles = extractTouchedFiles(entries);
	if (touchedFiles.length > 0) {
		lines.push(`Touched files: ${touchedFiles.join(", ")}`);
	}

	const messageLines: string[] = [];
	for (const entry of entries) {
		if (entry.type === "compaction" && entry.summary.trim()) {
			messageLines.push(
				`[Compaction Summary]: ${sanitizeSingleLine(entry.summary, 300)}`,
			);
			continue;
		}
		if (entry.type !== "message") continue;
		const role = (entry.message as unknown as { role?: string }).role;
		if (role !== "user" && role !== "assistant") continue;
		const text = extractMessageText(entry.message);
		if (!text.trim()) continue;
		messageLines.push(
			`[${role.toUpperCase()}]: ${sanitizeSingleLine(text, 240)}`,
		);
	}

	const selected =
		messageLines.length <= 8
			? messageLines
			: [
					...messageLines.slice(0, 2),
					"... (earlier messages omitted) ...",
					...messageLines.slice(-6),
				];

	return [...lines, "", "Conversation:", ...selected].join("\n");
}

export function resolveTargetModel(
	configuredModel: string | undefined,
	activeModel: Model<Api> | undefined,
	modelRegistry?: Pick<ModelRegistry, "find" | "getAvailable">,
): Model<Api> | undefined {
	if (!configuredModel) return activeModel;
	if (!modelRegistry) return activeModel;

	const trimmed = configuredModel.trim();
	const slashIdx = trimmed.indexOf("/");
	if (slashIdx > 0) {
		const provider = trimmed.slice(0, slashIdx);
		const modelId = trimmed.slice(slashIdx + 1);
		const exact = modelRegistry.find(provider, modelId);
		if (exact) return exact;
	}

	const available = modelRegistry.getAvailable();
	return (
		available.find(
			(m) => m.id === trimmed || `${m.provider}/${m.id}` === trimmed,
		) ?? activeModel
	);
}

export async function generateSessionSummary(options: {
	entries: readonly SessionEntry[];
	project?: ProjectInfo;
	config: PrettySessionConfig;
	model?: Model<Api>;
	modelRegistry?: Pick<ModelRegistry, "complete" | "find" | "getAvailable">;
	signal?: AbortSignal;
}): Promise<{
	title: string;
	description: string;
	source: "llm" | "heuristic";
}> {
	const heuristic = buildHeuristicSummary(
		options.entries,
		options.project,
		options.config.maxTitleLength,
		options.config.maxDescriptionLength,
	);

	if (!options.config.useLlm || !options.modelRegistry) {
		return { ...heuristic, source: "heuristic" };
	}

	const targetModel = resolveTargetModel(
		options.config.model,
		options.model,
		options.modelRegistry,
	);
	if (!targetModel) {
		return { ...heuristic, source: "heuristic" };
	}

	const timeoutSignal = AbortSignal.timeout(options.config.summaryTimeoutMs);
	const signal = options.signal
		? AbortSignal.any([options.signal, timeoutSignal])
		: timeoutSignal;

	const promptText = buildConversationExcerpt(options.entries, options.project);
	const userMessage: Message = {
		role: "user",
		content: [{ type: "text", text: promptText }],
		timestamp: Date.now(),
	};

	try {
		const response = await options.modelRegistry.complete(
			targetModel,
			{
				systemPrompt: SUMMARY_SYSTEM_PROMPT,
				messages: [userMessage],
			},
			{
				maxTokens: 256,
				signal,
				cacheRetention: "none",
				sessionId: uuidv7(),
			},
		);

		if (response.stopReason === "aborted" || response.stopReason === "error") {
			return { ...heuristic, source: "heuristic" };
		}

		const responseText = extractMessageText(response);
		const parsed = parseLlmSummaryResponse(
			responseText,
			options.config.maxTitleLength,
			options.config.maxDescriptionLength,
		);
		if (parsed) {
			return { ...parsed, source: "llm" };
		}
	} catch {
		// Fall back to heuristic summary on any provider/network error
	}

	return { ...heuristic, source: "heuristic" };
}
