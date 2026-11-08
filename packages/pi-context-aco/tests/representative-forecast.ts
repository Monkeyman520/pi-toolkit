const object = (v: unknown): Record<string, unknown> =>
	v !== null && typeof v === "object" ? (v as Record<string, unknown>) : {};
const number = (v: unknown): number | null =>
	typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null;
const metric = (v: unknown) => number(object(v).value);
/** Score only the pressure monitor's stated completed-turn horizon, not task-demand declarations. */
export function compareForecasts(raw: readonly unknown[]) {
	const turns = raw.map(object).filter((t) => t.event === "turn_end");
	const pairs = [];
	for (let i = 0; i < turns.length; i++) {
		const start = turns[i],
			p = object(start.pressure),
			settings = object(p.settings);
		const horizon = number(settings.horizonTurns),
			reserve = number(settings.reserveTokens);
		const projected = metric(p.projectedTokens);
		if (
			horizon === null ||
			!Number.isInteger(horizon) ||
			horizon < 1 ||
			reserve === null ||
			projected === null ||
			i + horizon >= turns.length
		)
			continue;
		const end = turns[i + horizon],
			observed = metric(object(end.pressure).usedTokens);
		if (observed === null) continue;
		const path = turns.slice(i, i + horizon + 1).map((t) => object(t.pressure));
		const stable = path.every(
			(r, j) =>
				metric(r.capacity) === metric(p.capacity) &&
				number(object(r.settings).reserveTokens) === reserve &&
				(j === 0 ||
					((number(r.sampleCount) ?? -1) >=
						(number(path[j - 1].sampleCount) ?? Infinity) &&
						(metric(r.usedTokens) ?? -1) >=
							(metric(path[j - 1].usedTokens) ?? Infinity))),
		);
		pairs.push({
			startTimestamp: start.timestamp,
			observedTimestamp: end.timestamp,
			horizonCompletedTurns: horizon,
			predictedContextPlusReserve: projected,
			observedContextPlusReserve: observed + reserve,
			error: observed + reserve - projected,
			stable,
		});
	}
	const stable = pairs.filter((p) => p.stable);
	return {
		availableCompletedTurns: turns.length,
		pairs,
		meanAbsoluteError: stable.length
			? stable.reduce((n, p) => n + Math.abs(p.error), 0) / stable.length
			: null,
		scope:
			"Host-estimated context plus the SAME reserve at the declared completed-turn horizon. Not provider total run tokens, one-assessment feedback, calibrated task-demand accuracy or a counterfactual after intervention. Detected context/capacity resets are excluded from the stable score. Tail-only traces cannot establish whole-run prediction accuracy.",
	};
}
