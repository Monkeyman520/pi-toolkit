const object = (v: unknown): Record<string, unknown> =>
	v !== null && typeof v === "object" ? (v as Record<string, unknown>) : {};
const counter = (n: unknown): number | null =>
	typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : null;
const add = (a: number | null, b: number | null) =>
	a === null || b === null ? null : a + b;
const subtract = (a: number | null, b: number | null) =>
	a === null || b === null || b > a ? null : a - b;
function counters(raw: unknown) {
	const u = object(raw),
		prompt = counter(u.promptTokenCount),
		cached = counter(u.cachedContentTokenCount);
	return {
		promptTokensIncludingCache: prompt,
		newInput: subtract(prompt, cached),
		outputIncludingThoughts: add(
			counter(u.candidatesTokenCount),
			counter(u.thoughtsTokenCount),
		),
		cacheRead: cached,
		cacheWrite: null,
		totalTokens: counter(u.totalTokenCount),
		actualFee: null,
	};
}
type Counters = ReturnType<typeof counters>;
function sum(rows: Counters[], strict: boolean): Counters {
	const keys = Object.keys(counters(null)) as (keyof Counters)[];
	return Object.fromEntries(
		keys.map((key) => [
			key,
			key === "actualFee" ||
			key === "cacheWrite" ||
			(strict && rows.some((r) => r[key] === null))
				? null
				: rows.reduce((n, r) => n + (r[key] ?? 0), 0),
		]),
	) as Counters;
}
/** Server metadata per transmission attempt; NOT adapter defaults or invoice measurements. */
export function accountTransport(
	raw: readonly unknown[],
	incompleteAttemptIds: readonly number[] = [],
) {
	const attempts = new Map<number, unknown>();
	let blockedRequests = 0;
	for (const value of raw) {
		const r = object(value);
		if (r.kind === "blocked") blockedRequests++;
		if (typeof r.id !== "number") continue;
		if (r.kind === "request") attempts.set(r.id, null);
		else if (r.kind === "usage" && attempts.has(r.id))
			attempts.set(r.id, r.usage);
	}
	const values = [...attempts.values()].map(counters);
	const incompleteAttempts = [...new Set(incompleteAttemptIds)].filter((id) =>
		attempts.has(id),
	);
	return {
		attempts: attempts.size,
		blockedRequests,
		withoutUsage: [...attempts].filter(([, u]) => u === null).map(([id]) => id),
		total: sum(
			incompleteAttempts.length ? [...values, counters(null)] : values,
			true,
		),
		incompleteAttempts,
		knownSubtotal: sum(values, false),
		scope:
			"Last cumulative server usage metadata per attempted inference HTTP transmission. Explicitly incomplete attempts invalidate whole-run totals even with positive partial usage. Missing counters remain unknown; knownSubtotal preserves reported frames. Cache writes and actual fees unavailable. Parent-actor inference only; no child grant or model-management call was issued.",
	};
}
