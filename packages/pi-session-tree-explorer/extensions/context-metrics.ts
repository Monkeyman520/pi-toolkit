import {
	buildSessionProjection,
	estimateTokens,
} from "@earendil-works/pi-coding-agent";
import type { ContextMetrics, SessionEntry, TreeIndex } from "./types.ts";

export interface ActiveModelInfo {
	id: string;
	provider: string;
	contextWindow?: number;
}

const KNOWN_CONTEXT_WINDOWS: Record<string, number> = {
	"gpt-4o": 128_000,
	"gpt-4o-mini": 128_000,
	"gpt-4-turbo": 128_000,
	"claude-3-5-sonnet": 200_000,
	"claude-3-5-haiku": 200_000,
	"claude-3-opus": 200_000,
	"claude-sonnet-4-5": 200_000,
	o1: 200_000,
	"o3-mini": 200_000,
	"gemini-1.5-pro": 1_000_000,
	"gemini-1.5-flash": 1_000_000,
	"gemini-2.0-flash": 1_000_000,
};

export function resolveContextWindow(
	modelId?: string,
	_provider?: string,
	activeModel?: ActiveModelInfo,
): number | null {
	if (!modelId) {
		return activeModel?.contextWindow ?? null;
	}

	if (
		activeModel &&
		activeModel.id === modelId &&
		(!_provider || activeModel.provider === _provider) &&
		activeModel.contextWindow
	) {
		return activeModel.contextWindow;
	}

	// Normalized lookup
	const normalized = modelId.toLowerCase().trim();
	for (const [key, win] of Object.entries(KNOWN_CONTEXT_WINDOWS)) {
		if (normalized === key || normalized.startsWith(`${key}-`)) {
			return win;
		}
	}

	return null;
}

export function estimateMessageTokens(message: unknown): number {
	if (!message || typeof message !== "object") return 0;
	const msg = message as { role?: string; content?: unknown };
	const normalized =
		msg.role === "assistant" && typeof msg.content === "string"
			? { ...msg, content: [{ type: "text", text: msg.content }] }
			: msg;
	return estimateTokens(normalized as Parameters<typeof estimateTokens>[0]);
}

export function estimateContextTokens(projectionMessages: unknown[]): number {
	let total = 0;
	for (const msg of projectionMessages) {
		total += estimateMessageTokens(msg);
	}
	return total;
}

export interface ComputeContextParams {
	entryId: string;
	rawEntries: SessionEntry[];
	index: TreeIndex;
	sessionLeafId: string | null;
	activeUsage?: {
		tokens: number | null;
		contextWindow: number;
		percent: number | null;
	};
	activeModel?: ActiveModelInfo;
}

/**
 * Compute honest, branch-correct Context metrics for an entry.
 * Guarantees read-only projection: never modifies Session Leaf or session file.
 */

function resolveHistoricalModel(
	entryId: string,
	index: TreeIndex,
	projectionModel?: { provider?: string; modelId?: string } | null,
): { modelId?: string; provider?: string } | undefined {
	if (projectionModel?.modelId) {
		return projectionModel;
	}
	let cur: string | null = entryId;
	while (cur) {
		const entry = index.entryById.get(cur);
		if (entry?.type === "model_change" && entry.modelId) {
			return { modelId: entry.modelId, provider: entry.provider };
		}
		if (entry?.type === "message" && entry.message?.model) {
			return { modelId: entry.message.model, provider: entry.message.provider };
		}
		cur = index.parentById.get(cur) ?? null;
	}
	return projectionModel?.modelId ? projectionModel : undefined;
}

export function computeContextMetrics(
	params: ComputeContextParams,
): ContextMetrics {
	const {
		entryId,
		rawEntries,
		index,
		sessionLeafId,
		activeUsage,
		activeModel,
	} = params;

	// 1. Active Leaf: use host getContextUsage if available
	if (entryId === sessionLeafId && activeUsage) {
		return {
			entryId,
			tokens: activeUsage.tokens,
			contextWindow: activeUsage.contextWindow,
			percentage: activeUsage.percent,
			modelId: activeModel?.id,
			source: "active-context",
			estimated: true,
		};
	}

	// 2. Historical Node: pure read-only projection
	try {
		if (!index.entryById.has(entryId))
			throw new Error("Missing context target");
		// Use bounded, normalized topology without altering any host/raw entry.
		const normalized = new Map(
			rawEntries.map((entry) => [
				entry.id,
				{ ...entry, parentId: index.parentById.get(entry.id) ?? null },
			]),
		);
		if (!normalized.has(entryId)) throw new Error("Missing snapshot entry");
		const safeEntries = [...normalized.values()] as unknown as Parameters<
			typeof buildSessionProjection
		>[0];
		const projection = buildSessionProjection(
			safeEntries,
			entryId,
			new Map(safeEntries.map((entry) => [entry.id, entry])),
		);
		const tokens = estimateContextTokens(projection.messages);

		const historicalModel = resolveHistoricalModel(
			entryId,
			index,
			projection.model,
		);
		const historicalModelId = historicalModel?.modelId;
		const historicalProvider = historicalModel?.provider;
		const contextWindow = historicalModelId
			? resolveContextWindow(historicalModelId, historicalProvider, activeModel)
			: null;

		const percentage =
			tokens !== null && contextWindow !== null && contextWindow > 0
				? Math.min(100, Math.round((tokens / contextWindow) * 100))
				: null;

		return {
			entryId,
			tokens,
			contextWindow,
			percentage,
			modelId: historicalModelId,
			source: "projection-estimate",
			estimated: true,
		};
	} catch {
		// Honest unknown on failure
		return {
			entryId,
			tokens: null,
			contextWindow: null,
			percentage: null,
			source: "unknown",
			estimated: false,
		};
	}
}

export class ContextMetricsCache {
	private cache = new Map<string, ContextMetrics>();
	private maxSize: number;

	constructor(maxSize = 512) {
		this.maxSize = maxSize;
	}

	public get(
		sessionId: string,
		revision: number,
		entryId: string,
		modelId?: string,
	): ContextMetrics | undefined {
		const key = `${sessionId}:${revision}:${entryId}:${modelId ?? ""}`;
		const item = this.cache.get(key);
		if (item) {
			// Refresh LRU order
			this.cache.delete(key);
			this.cache.set(key, item);
		}
		return item;
	}

	public set(
		sessionId: string,
		revision: number,
		entryId: string,
		metrics: ContextMetrics,
		modelId?: string,
	): void {
		const key = `${sessionId}:${revision}:${entryId}:${modelId ?? ""}`;
		if (this.cache.has(key)) {
			this.cache.delete(key);
		} else if (this.cache.size >= this.maxSize) {
			// Evict oldest
			const firstKey = this.cache.keys().next().value;
			if (firstKey) this.cache.delete(firstKey);
		}
		this.cache.set(key, metrics);
	}

	public clear(): void {
		this.cache.clear();
	}
}

export function formatTokenNumber(num: number | null): string {
	if (num === null || num === undefined) return "—";
	if (num >= 1_000_000) {
		return `${Math.round(num / 100_000) / 10}m`;
	}
	if (num >= 1000) {
		return `${Math.round(num / 100) / 10}k`;
	}
	return String(num);
}

export function formatContextMetricsBadge(
	metrics: ContextMetrics | undefined,
	options: { showEstimateMarker?: boolean; showPercentage?: boolean } = {},
): string {
	if (!metrics || metrics.tokens === null) {
		return "—";
	}

	const marker =
		metrics.estimated && (options.showEstimateMarker ?? true) ? "~" : "";
	const tokensStr = formatTokenNumber(metrics.tokens);

	if (metrics.contextWindow !== null && metrics.contextWindow > 0) {
		const winStr = formatTokenNumber(metrics.contextWindow);
		const pctStr =
			options.showPercentage !== false && metrics.percentage !== null
				? ` ${metrics.percentage}%`
				: "";
		return `${marker}${tokensStr}/${winStr}${pctStr}`;
	}

	return `${marker}${tokensStr}`;
}
