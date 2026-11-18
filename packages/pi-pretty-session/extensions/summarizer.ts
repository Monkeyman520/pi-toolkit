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
import { defaultConfig, type PrettySessionConfig } from "./config.ts";
import type { ProjectInfo } from "./project.ts";

export const CUSTOM_ENTRY_TYPE = "pretty-session";
export const TITLE_TIMESTAMP_SUFFIX_LENGTH = 22;

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

export function buildSummarySystemPrompt(
	config: Pick<
		PrettySessionConfig,
		"maxTitleLength" | "maxDescriptionLength" | "language"
	>,
): string {
	const languageInstruction =
		config.language === "auto"
			? "Write BOTH title and description in the primary natural language used by the user in the conversation."
			: `Write BOTH title and description strictly in ${config.language}, even if the conversation excerpts or project context use another language.`;

	return [
		"You are a session title and description generator for a coding agent.",
		"Given the conversation excerpts and project context, output ONLY a single valid JSON object with two keys:",
		`{"title": "<ultra-concise topic phrase, <= ${config.maxTitleLength} chars>", "description": "<single condensed sentence, <= ${config.maxDescriptionLength} chars>"}`,
		"Rules:",
		`- title: an ultra-concise phrase naming the core subject directly, with no filler modifiers, quotes, or trailing punctuation (max ${config.maxTitleLength} characters).`,
		`- description: ONE highly condensed sentence directly stating the core goal and current progress/outcome (max ${config.maxDescriptionLength} characters). Do NOT use boilerplate or meta-openers such as "本会话旨在", "本会话主要", "用户希望", "该会话", "This session aims to", "This conversation focuses on", or "The user wants to".`,
		`- ${languageInstruction}`,
		"- Output raw JSON only; do not include markdown code fences or extra commentary.",
	].join("\n");
}

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

export function sanitizeTitle(text: string, maxLen: number): string {
	const cleaned = text
		.replace(/\p{Cc}/gu, " ")
		.replace(/\s+/g, " ")
		.replace(/^["'`]+|["'`]+$/g, "")
		.trim()
		.replace(/[.,;:!?。，；：！？、]+$/u, "")
		.trim();
	if (cleaned.length <= maxLen) return cleaned;
	const limit = Math.max(1, maxLen - 1);
	let sliced = cleaned.slice(0, limit).trimEnd();
	const lastSpace = sliced.lastIndexOf(" ");
	if (lastSpace >= Math.floor(limit * 0.5)) {
		sliced = sliced.slice(0, lastSpace).trimEnd();
	}
	sliced = sliced.replace(/[.,;:!?。，；：！？、]+$/u, "").trimEnd();
	if (!sliced) {
		sliced = cleaned.slice(0, limit).trimEnd();
	}
	return `${sliced}…`;
}

const TRAILING_TIMESTAMP_SUFFIX_RE =
	/\s*\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\]$/;

export function stripTitleTimestampSuffix(title: string): string {
	return title.replace(TRAILING_TIMESTAMP_SUFFIX_RE, "").trimEnd();
}

function pad2(n: number): string {
	return String(n).padStart(2, "0");
}

export function formatLocalTimestampSuffix(
	isoOrDate?: string | number | Date,
	fallbackMs = Date.now(),
): string {
	let ms: number;
	if (isoOrDate instanceof Date) {
		ms = isoOrDate.getTime();
	} else if (typeof isoOrDate === "number") {
		ms = isoOrDate;
	} else if (typeof isoOrDate === "string" && isoOrDate.trim()) {
		ms = Date.parse(isoOrDate);
	} else {
		ms = fallbackMs;
	}
	const date = new Date(Number.isFinite(ms) ? ms : fallbackMs);
	const yyyy = date.getFullYear();
	const mm = pad2(date.getMonth() + 1);
	const dd = pad2(date.getDate());
	const hh = pad2(date.getHours());
	const min = pad2(date.getMinutes());
	const ss = pad2(date.getSeconds());
	return ` [${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}]`;
}

export function applyDuplicateTitleSuffix(options: {
	candidateTitle: string;
	existingTitles: readonly string[];
	createdAt?: string;
	maxTitleLength: number;
	nowMs?: number;
}): string {
	const strippedRaw = stripTitleTimestampSuffix(options.candidateTitle);
	const normalizedBaseFull = sanitizeTitle(strippedRaw, 200);
	const normalizedBaseBounded = sanitizeTitle(
		strippedRaw,
		options.maxTitleLength,
	);
	if (!normalizedBaseBounded) return "";

	const candidateCleanFull = sanitizeSingleLine(strippedRaw, 200);
	const candidateCleanBounded = sanitizeSingleLine(
		strippedRaw,
		options.maxTitleLength,
	);

	const hasDuplicate = options.existingTitles.some((existing) => {
		const cleanExisting = sanitizeSingleLine(existing, 200);
		if (!cleanExisting) return false;
		const titleExisting = sanitizeTitle(cleanExisting, 200);
		return (
			cleanExisting === candidateCleanBounded ||
			cleanExisting === candidateCleanFull ||
			titleExisting === normalizedBaseBounded ||
			titleExisting === normalizedBaseFull
		);
	});

	if (!hasDuplicate) {
		return normalizedBaseBounded;
	}

	const suffix = formatLocalTimestampSuffix(options.createdAt, options.nowMs);
	const baseBudget = Math.max(2, options.maxTitleLength - suffix.length);
	const truncatedBase =
		sanitizeTitle(normalizedBaseFull, baseBudget) ||
		normalizedBaseFull.slice(0, baseBudget).trimEnd();
	return `${truncatedBase}${suffix}`;
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
	options?: {
		maxTitleLength?: number;
		maxDescriptionLength?: number;
		language?: string;
	},
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
		const fallbackDesc = buildHeuristicSummary(
			entries,
			project,
			options?.maxTitleLength ?? defaultConfig.maxTitleLength,
			options?.maxDescriptionLength ?? defaultConfig.maxDescriptionLength,
			options?.language ?? defaultConfig.language,
		).description;
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

	const isInitial = !current || current.summarizedAtTurn === 0;
	const isManualLocked = Boolean(
		current?.manualLocked && config.protectManualName,
	);
	const updateTitle =
		!isManualLocked && (isInitial || config.titleUpdateMode !== "once");

	if (isInitial) {
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

export function extractUserPromptClue(raw: string): {
	text: string;
	skillNames: string[];
} {
	const skillNames: string[] = [];
	const addSkillName = (candidate: string | undefined) => {
		const cleaned = candidate?.trim();
		if (!cleaned || cleaned === "...") return;
		if (!skillNames.includes(cleaned)) {
			skillNames.push(cleaned);
		}
	};

	const withoutSkillBlocks = raw.replace(
		/<skill\b([^>]*)>[\s\S]*?<\/skill>/gi,
		(_match, attrs: string) => {
			const nameMatch = /\bname\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(attrs);
			addSkillName(nameMatch?.[1] ?? nameMatch?.[2]);
			return " ";
		},
	);

	const withoutCodeBlocks = withoutSkillBlocks.replace(/```[\s\S]*?```/g, " ");
	let remaining = withoutCodeBlocks.trimStart();

	for (;;) {
		const skillSlash = /^\/skill:([a-zA-Z0-9_.:-]+)(?=\s|$)\s*/i.exec(
			remaining,
		);
		if (skillSlash) {
			addSkillName(skillSlash[1]);
			remaining = remaining.slice(skillSlash[0].length);
			continue;
		}
		const slashCmd = /^\/([a-zA-Z0-9_:-]+)(?=\s|$)\s*/.exec(remaining);
		if (slashCmd) {
			remaining = remaining.slice(slashCmd[0].length);
			continue;
		}
		const dollarCmd = /^\$([a-zA-Z][a-zA-Z0-9_.:-]*)(?=\s|$)\s*/.exec(
			remaining,
		);
		if (dollarCmd) {
			addSkillName(dollarCmd[1]);
			remaining = remaining.slice(dollarCmd[0].length);
			continue;
		}
		break;
	}

	const text = remaining
		.replace(/\p{Cc}/gu, " ")
		.replace(/\s+/g, " ")
		.trim();

	return { text, skillNames };
}

function cleanUserPromptForSummary(raw: string): string {
	return extractUserPromptClue(raw).text;
}

export function detectConversationLanguage(
	entries: readonly SessionEntry[],
): "zh-CN" | "ja" | "en" {
	let cjkCount = 0;
	let kanaCount = 0;
	let latinCount = 0;

	const countSample = (sample: string) => {
		for (const ch of sample) {
			const code = ch.codePointAt(0) ?? 0;
			if (
				(code >= 0x3040 && code <= 0x309f) ||
				(code >= 0x30a0 && code <= 0x30ff) ||
				(code >= 0x31f0 && code <= 0x31ff)
			) {
				kanaCount++;
			} else if (
				(code >= 0x4e00 && code <= 0x9fff) ||
				(code >= 0x3400 && code <= 0x4dbf)
			) {
				cjkCount++;
			} else if (
				(code >= 0x41 && code <= 0x5a) ||
				(code >= 0x61 && code <= 0x7a)
			) {
				latinCount++;
			}
		}
	};

	for (const entry of entries) {
		if (entry.type === "compaction" && entry.summary.trim()) {
			countSample(cleanUserPromptForSummary(entry.summary));
			continue;
		}
		if (entry.type !== "message") continue;
		const role = (entry.message as unknown as { role?: string }).role;
		if (role === "user") {
			countSample(cleanUserPromptForSummary(extractMessageText(entry.message)));
		} else if (role === "assistant") {
			countSample(
				extractMessageText(entry.message)
					.replace(/```[\s\S]*?```/g, " ")
					.slice(0, 600),
			);
		}
	}

	if (kanaCount >= 2 || (kanaCount > 0 && kanaCount + cjkCount >= 2)) {
		return "ja";
	}
	if (cjkCount >= 2 && (cjkCount * 2 >= latinCount || cjkCount >= 6)) {
		return "zh-CN";
	}
	return "en";
}

export function resolveEffectiveLanguage(
	configuredLanguage: string | undefined,
	entries: readonly SessionEntry[],
): string {
	const trimmed = configuredLanguage?.trim();
	if (!trimmed || trimmed.toLowerCase() === "auto") {
		return detectConversationLanguage(entries);
	}
	return trimmed;
}

interface HeuristicLocale {
	isCjk: boolean;
	minSecondaryLen: number;
	minClueChars: number;
	latestPrefix: string;
	outcomePrefix: string;
	filesPrefix: string;
	projectPrefix: string;
	skillPrefix: string;
	emptyTitle: (projectName?: string) => string;
	emptyDesc: (projectName?: string, branch?: string) => string;
	skillOnlyDesc: (skills: readonly string[], projectName?: string) => string;
}

function getHeuristicLocale(language: string): HeuristicLocale {
	const lower = language.toLowerCase();
	if (lower === "zh" || lower.startsWith("zh-")) {
		return {
			isCjk: true,
			minSecondaryLen: 14,
			minClueChars: 6,
			latestPrefix: "最新: ",
			outcomePrefix: "进展: ",
			filesPrefix: "文件: ",
			projectPrefix: "项目: ",
			skillPrefix: "技能: ",
			emptyTitle: (proj) => (proj ? `${proj} 会话` : "新建 Pi 会话"),
			emptyDesc: (proj, branch) =>
				proj
					? `${proj}${branch ? ` (${branch})` : ""} 交互式编码会话。`
					: "Pi 交互式编码会话。",
			skillOnlyDesc: (skills, proj) =>
				`调用技能 ${skills.join(", ")}${proj ? ` · 项目: ${proj}` : ""}。`,
		};
	}
	if (lower === "ja" || lower.startsWith("ja-")) {
		return {
			isCjk: true,
			minSecondaryLen: 14,
			minClueChars: 6,
			latestPrefix: "最新: ",
			outcomePrefix: "結果: ",
			filesPrefix: "ファイル: ",
			projectPrefix: "プロジェクト: ",
			skillPrefix: "スキル: ",
			emptyTitle: (proj) =>
				proj ? `${proj} セッション` : "新規 Pi セッション",
			emptyDesc: (proj, branch) =>
				proj
					? `${proj}${branch ? ` (${branch})` : ""} での開発セッション。`
					: "Pi 対話コーディングセッション。",
			skillOnlyDesc: (skills, proj) =>
				`スキル ${skills.join(", ")} を実行${proj ? ` · プロジェクト: ${proj}` : ""}。`,
		};
	}
	return {
		isCjk: false,
		minSecondaryLen: 20,
		minClueChars: 10,
		latestPrefix: "Latest: ",
		outcomePrefix: "Outcome: ",
		filesPrefix: "Files: ",
		projectPrefix: "Project: ",
		skillPrefix: "Skill: ",
		emptyTitle: (proj) => (proj ? `${proj} session` : "New Pi session"),
		emptyDesc: (proj, branch) =>
			proj
				? `Interactive coding session in ${proj}${branch ? ` (${branch})` : ""}.`
				: "Interactive Pi coding session.",
		skillOnlyDesc: (skills, proj) =>
			`Invoked skill ${skills.join(", ")}${proj ? ` · Project: ${proj}` : ""}.`,
	};
}

export function buildHeuristicSummary(
	entries: readonly SessionEntry[],
	project?: ProjectInfo,
	maxTitleLen = defaultConfig.maxTitleLength,
	maxDescLen = defaultConfig.maxDescriptionLength,
	language = defaultConfig.language,
): { title: string; description: string } {
	const effectiveLang = resolveEffectiveLanguage(language, entries);
	const locale = getHeuristicLocale(effectiveLang);

	const realUserPrompts: string[] = [];
	const skillClues: string[] = [];
	const assistantReplies: string[] = [];
	let latestCompaction: string | undefined;

	for (const entry of entries) {
		if (entry.type === "compaction" && entry.summary.trim()) {
			const cleaned = cleanUserPromptForSummary(entry.summary);
			if (cleaned) latestCompaction = cleaned;
			continue;
		}
		if (entry.type !== "message") continue;
		const role = (entry.message as unknown as { role?: string }).role;
		const rawText = extractMessageText(entry.message);
		if (role === "user") {
			const clue = extractUserPromptClue(rawText);
			if (clue.text) {
				realUserPrompts.push(clue.text);
			} else {
				for (const name of clue.skillNames) {
					if (!skillClues.includes(name)) skillClues.push(name);
				}
			}
		} else if (role === "assistant") {
			const text = cleanUserPromptForSummary(rawText);
			if (text) assistantReplies.push(text);
		}
	}

	const touchedFiles = extractTouchedFiles(entries);
	const firstUser = realUserPrompts[0] ?? latestCompaction ?? "";
	const latestUser = realUserPrompts[realUserPrompts.length - 1] ?? firstUser;
	const latestAssistant = assistantReplies[assistantReplies.length - 1] ?? "";

	if (!firstUser && !latestAssistant) {
		if (skillClues.length > 0) {
			return {
				title: sanitizeTitle(
					`${locale.skillPrefix}${skillClues[0]}`,
					maxTitleLen,
				),
				description: sanitizeSingleLine(
					locale.skillOnlyDesc(skillClues.slice(0, 2), project?.name),
					maxDescLen,
				),
			};
		}
		return {
			title: sanitizeTitle(locale.emptyTitle(project?.name), maxTitleLen),
			description: sanitizeSingleLine(
				locale.emptyDesc(project?.name, project?.git.branch),
				maxDescLen,
			),
		};
	}

	const primarySource =
		latestUser ||
		firstUser ||
		(skillClues.length > 0 ? `${locale.skillPrefix}${skillClues[0]}` : "") ||
		latestAssistant;
	const firstClause =
		primarySource.split(/[.!?。！？;\n]|\s+—\s+/)[0]?.trim() || primarySource;
	const title = sanitizeTitle(firstClause, maxTitleLen);

	const primaryIntent =
		firstUser ||
		(skillClues.length > 0 ? `${locale.skillPrefix}${skillClues[0]}` : "") ||
		latestAssistant;
	const primaryCap = locale.isCjk
		? Math.min(Math.floor(maxDescLen * 0.62), 56)
		: Math.min(Math.floor(maxDescLen * 0.65), 64);
	const primarySegment = sanitizeSingleLine(primaryIntent, primaryCap);

	const remaining = maxDescLen - primarySegment.length - 3;
	let secondarySegment = "";
	if (remaining >= locale.minSecondaryLen) {
		if (realUserPrompts.length > 1 && latestUser && latestUser !== firstUser) {
			const contentBudget = remaining - locale.latestPrefix.length;
			if (contentBudget >= locale.minClueChars) {
				secondarySegment = `${locale.latestPrefix}${sanitizeSingleLine(latestUser, contentBudget)}`;
			}
		} else if (touchedFiles.length > 0) {
			const maxFilesBudget = remaining - locale.filesPrefix.length;
			if (maxFilesBudget >= 4) {
				const fittedFiles: string[] = [];
				for (const file of touchedFiles.slice(0, 2)) {
					const candidate = [...fittedFiles, file].join(", ");
					if (candidate.length <= maxFilesBudget) {
						fittedFiles.push(file);
					}
				}
				if (fittedFiles.length > 0) {
					secondarySegment = `${locale.filesPrefix}${fittedFiles.join(", ")}`;
				}
			}
		} else if (latestAssistant) {
			const contentBudget = remaining - locale.outcomePrefix.length;
			if (contentBudget >= locale.minClueChars) {
				secondarySegment = `${locale.outcomePrefix}${sanitizeSingleLine(latestAssistant, contentBudget)}`;
			}
		} else if (project?.name) {
			const candidate = `${locale.projectPrefix}${project.name}`;
			if (candidate.length <= remaining) {
				secondarySegment = candidate;
			}
		}
	}

	const combined = secondarySegment
		? `${primarySegment} · ${secondarySegment}`
		: primarySegment || primarySource;
	const description = sanitizeSingleLine(combined, maxDescLen);

	return { title, description };
}

export function parseLlmSummaryResponse(
	rawText: string,
	maxTitleLen = defaultConfig.maxTitleLength,
	maxDescLen = defaultConfig.maxDescriptionLength,
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
						title: sanitizeTitle(rawTitle, maxTitleLen),
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
			title: sanitizeTitle(titleLine, maxTitleLen),
			description: sanitizeSingleLine(descLine, maxDescLen),
		};
	}

	return undefined;
}

export function buildConversationExcerpt(
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
			const cleaned = cleanUserPromptForSummary(entry.summary);
			if (cleaned) {
				messageLines.push(
					`[Compaction Summary]: ${sanitizeSingleLine(cleaned, 300)}`,
				);
			}
			continue;
		}
		if (entry.type !== "message") continue;
		const role = (entry.message as unknown as { role?: string }).role;
		if (role !== "user" && role !== "assistant") continue;
		const rawText = extractMessageText(entry.message);
		if (!rawText.trim()) continue;
		if (role === "user") {
			const clue = extractUserPromptClue(rawText);
			if (clue.text) {
				messageLines.push(`[USER]: ${sanitizeSingleLine(clue.text, 240)}`);
			} else if (clue.skillNames.length > 0) {
				messageLines.push(`[USER]: Skill: ${clue.skillNames.join(", ")}`);
			}
			continue;
		}
		messageLines.push(`[ASSISTANT]: ${sanitizeSingleLine(rawText, 240)}`);
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
		options.config.language,
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
				systemPrompt: buildSummarySystemPrompt(options.config),
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
