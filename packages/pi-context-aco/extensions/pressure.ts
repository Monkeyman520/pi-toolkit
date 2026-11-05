export interface ForecastSettings {
	historySize: number;
	horizonTurns: number;
	reserveTokens: number;
}
export interface Reading {
	identity: string;
	tokens: number | null | undefined;
	capacity: number | null | undefined;
}
export interface Metric {
	kind: "measured" | "estimated" | "unavailable";
	value: number | null;
	source: string;
}
export const unknown = (source: string): Metric => ({
	kind: "unavailable",
	value: null,
	source,
});
const metric = (
	value: number | null,
	kind: "measured" | "estimated",
	source: string,
): Metric =>
	value === null || !Number.isFinite(value)
		? unknown(source)
		: { kind, value, source };
const nonnegative = (n: unknown): number | null =>
	typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : null;

export function textTokens(result: unknown): number | null {
	if (
		!result ||
		typeof result !== "object" ||
		!("content" in result) ||
		!Array.isArray(result.content)
	)
		return null;
	let chars = 0;
	for (const block of result.content) {
		if (block?.type !== "text" || typeof block.text !== "string") return null;
		chars += block.text.length;
	}
	return Math.ceil(chars / 4);
}
export class PressureMonitor {
	private identity = "";
	private capacity: number | null = null;
	private last: number | null = null;
	private growth: number[] = [];
	private history = new Map<string, number[]>();
	private pending = new Map<string, { name: string; key: string }>();
	private untracked = 0;
	private finalized = 0;
	private errors = 0;
	private resetReason = "startup";
	private lastTool: {
		name: string;
		estimatedTokens: number | null;
		isError: boolean;
		durationMs: number | null;
	} | null = null;

	reset(reason: string) {
		this.identity = "";
		this.last = null;
		this.growth = [];
		this.pending.clear();
		this.history.clear();
		this.untracked = 0;
		this.resetReason = reason;
	}
	startTool(id: string, name: string, limit?: number) {
		if (this.pending.has(id)) return;
		if (this.pending.size >= 256) {
			this.untracked++;
			return;
		}
		const safeName = name.slice(0, 128);
		const hint =
			typeof limit === "number" && Number.isFinite(limit) && limit > 0
				? limit
				: "unspecified";
		this.pending.set(id, { name: safeName, key: `${safeName}:limit=${hint}` });
	}
	finishTool(
		id: string,
		name: string,
		tokens: number | null,
		isError: boolean,
		durationMs?: number,
	) {
		const pending = this.pending.get(id);
		this.pending.delete(id);
		this.finalized++;
		if (isError) this.errors++;
		this.lastTool = {
			name: name.slice(0, 128),
			estimatedTokens: nonnegative(tokens),
			isError,
			durationMs: nonnegative(durationMs),
		};
		if (!isError && pending && nonnegative(tokens) !== null) {
			if (!this.history.has(pending.key) && this.history.size >= 64) return;
			const sizes = this.history.get(pending.key) ?? [];
			sizes.push(tokens as number);
			this.history.set(pending.key, sizes.slice(-10));
		}
	}
	observe(reading: Reading, settings: ForecastSettings, completed = false) {
		const capacity = nonnegative(reading.capacity);
		const validCapacity = capacity !== null && capacity > 0 ? capacity : null;
		const tokens = nonnegative(reading.tokens);
		if (
			this.identity &&
			(this.identity !== reading.identity || this.capacity !== validCapacity)
		)
			this.reset("model/window/projection changed");
		this.identity = reading.identity;
		this.capacity = validCapacity;
		if (tokens === null) {
			this.growth = [];
			this.last = null;
			this.resetReason = "unknown usage";
		} else if (this.last === null) {
			this.last = tokens;
		} else if (tokens < this.last) {
			this.growth = [];
			this.last = tokens;
			this.resetReason = "context shrank";
		} else if (completed) {
			this.growth.push(tokens - this.last);
			this.last = tokens;
		}
		this.growth = this.growth.slice(-settings.historySize);
		const rate = this.growth.length
			? this.growth.reduce((a, b) => a + b, 0) / this.growth.length
			: null;
		let pendingTokens = 0,
			known = 0,
			missing = this.untracked;
		for (const { key } of this.pending.values()) {
			const history = this.history.get(key);
			if (!history?.length) {
				missing++;
				continue;
			}
			pendingTokens += Math.max(...history);
			known++;
		}
		const burst = known ? pendingTokens : null;
		const trend = rate === null ? null : rate * settings.horizonTurns;
		const future =
			trend === null && burst === null
				? null
				: Math.max(trend ?? 0, burst ?? 0);
		const projected =
			tokens === null || future === null
				? null
				: tokens + future + settings.reserveTokens;
		const ratio =
			projected === null || validCapacity === null
				? null
				: projected / validCapacity;
		return {
			usedTokens: metric(
				tokens,
				"estimated",
				"Pi last assistant usage plus trailing-message estimates; not exact request size",
			),
			capacity: metric(
				validCapacity,
				"measured",
				"active model configured context window",
			),
			netGrowth: metric(
				this.growth.at(-1) ?? null,
				"estimated",
				"latest completed-turn net context estimate",
			),
			growthRate: metric(
				rate,
				"estimated",
				"mean of recent comparable completed-turn deltas",
			),
			pendingToolTokens: metric(
				burst,
				"estimated",
				"recent maximum text-size estimate for each comparable announced tool; nested results may overlap",
			),
			projectedTokens: metric(
				projected,
				"estimated",
				"forecast including reserve; unknown components may add more",
			),
			projectedUsage: metric(
				ratio,
				"estimated",
				"projected tokens / active capacity; not a calibrated probability",
			),
			burstRisk: metric(
				tokens !== null && burst !== null && validCapacity !== null
					? (tokens + burst + settings.reserveTokens) / validCapacity
					: null,
				"estimated",
				"announced known-tool burst pressure fraction; not a probability; unknown calls excluded",
			),
			reclaimableTokens: unknown("not assessed in T0001"),
			protectedTokens: unknown(
				"T0002 protects references; safe token sizing requires the later semantic graph",
			),
			recoveryCost: unknown("evidence recovery not delivered in T0001"),
			sampleCount: this.growth.length,
			pendingCalls: this.pending.size,
			unknownPendingCalls: missing,
			finalizedCalls: this.finalized,
			errorCalls: this.errors,
			lastTool: this.lastTool ? { ...this.lastTool } : null,
			resetReason: this.resetReason,
			assumptions:
				"recent completed-turn mean; max(trend horizon, known pending tool results) + reserve",
			settings: { ...settings },
			missingTrend: rate === null,
			unannouncedFutureTools: "unknown",
		};
	}
}
export type Pressure = ReturnType<PressureMonitor["observe"]>;
