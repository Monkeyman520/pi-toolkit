import type { SessionEntry } from "@earendil-works/pi-coding-agent";

type Owner = "parent" | "child" | "management";
export interface UsageSample {
	owner: Owner;
	usage: unknown;
}
const object = (v: unknown): Record<string, unknown> =>
	v && typeof v === "object" ? (v as Record<string, unknown>) : {};
const finite = (n: unknown): number | null =>
	typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : null;
const fields = [
	"input",
	"output",
	"cacheRead",
	"cacheWrite",
	"totalTokens",
	"costInput",
	"costOutput",
	"costCacheRead",
	"costCacheWrite",
	"costTotal",
] as const;
type Totals = Record<(typeof fields)[number], number | null>;
const values = (v: unknown): Totals => {
	const u = object(v),
		cost = object(u.cost);
	return {
		input: finite(u.input),
		output: finite(u.output),
		cacheRead: finite(u.cacheRead),
		cacheWrite: finite(u.cacheWrite),
		totalTokens: finite(u.totalTokens),
		costInput: finite(cost.input),
		costOutput: finite(cost.output),
		costCacheRead: finite(cost.cacheRead),
		costCacheWrite: finite(cost.cacheWrite),
		costTotal: finite(cost.total),
	};
};
const sum = (rows: Totals[]): Totals =>
	Object.fromEntries(
		fields.map((f) => [
			f,
			rows.some((r) => r[f] === null)
				? null
				: rows.reduce((n, r) => n + (r[f] ?? 0), 0),
		]),
	) as Totals;
export function accountUsage(samples: UsageSample[]) {
	const gaps = samples.flatMap((s, i) =>
		fields
			.filter((f) => values(s.usage)[f] === null)
			.map((f) => s.owner + "[" + i + "]." + f),
	);
	return {
		total: sum(samples.map((s) => values(s.usage))),
		byOwner: Object.fromEntries(
			(["parent", "child", "management"] as const).map((o) => [
				o,
				sum(samples.filter((s) => s.owner === o).map((s) => values(s.usage))),
			]),
		) as Record<Owner, Totals>,
		gaps,
		scope:
			"Provider-reported usage on active branch; input is new input, cache counters separate. Totals assume compatible provider currency/tariffs; no conversion. Currency, tariffs and hidden third-party activity are not independently verified.",
	};
}
export function branchAccounting(branch: readonly SessionEntry[]) {
	const samples: UsageSample[] = [];
	const intents = new Set<string>(),
		results = new Set<string>();
	for (const e of branch) {
		if (e.type === "message" && e.message.role === "assistant") {
			samples.push({ owner: "parent", usage: e.message.usage });
		} else if (
			e.type === "message" &&
			e.message.role === "toolResult" &&
			e.message.usage
		) {
			samples.push({ owner: "management", usage: e.message.usage });
		} else if (e.type === "compaction" || e.type === "branch_summary") {
			// Hook compaction can be local/no-model; absent usage is not a fabricated zero measurement.
			samples.push({ owner: "management", usage: e.usage });
		} else if (e.type === "usage")
			samples.push({ owner: "management", usage: e.usage });
		else if (e.type === "custom") {
			const data = object(e.data);
			if (
				e.customType === "aco-delegation-intent" &&
				typeof data.id === "string"
			)
				intents.add(data.id);
			if (
				e.customType === "aco-delegation-result" &&
				typeof data.id === "string" &&
				!results.has(data.id)
			) {
				results.add(data.id);
				samples.push({
					owner: "child",
					usage: data.providerUsage ?? {
						totalTokens: data.tokens,
						cacheRead: data.cacheRead,
						cacheWrite: data.cacheWrite,
						cost: { total: data.cost },
					},
				});
			}
		}
	}
	for (const id of intents)
		if (!results.has(id)) samples.push({ owner: "child", usage: null });
	return accountUsage(samples);
}
export interface EvaluationRun {
	taskKey: string;
	acceptanceKey: string;
	policy: string;
	evidenceClass: "controlled" | "representative";
	taskSuccess: boolean | null;
	continuity: boolean | null;
	recoveryAttempts: number | null;
	recoveryFailures: number | null;
	mistakenDecisions: number | null;
	latencyMs: number | null;
	humanInterventions: number | null;
	accounting: ReturnType<typeof accountUsage>;
}
export function compareRuns(adaptive: EvaluationRun, control: EvaluationRun) {
	if (
		!adaptive.taskKey ||
		!adaptive.acceptanceKey ||
		adaptive.taskKey !== control.taskKey ||
		adaptive.acceptanceKey !== control.acceptanceKey ||
		adaptive.evidenceClass !== control.evidenceClass
	)
		throw Error(
			"Runs are not comparable: same task inputs, acceptance and evidence class required",
		);
	return {
		adaptive,
		control,
		superiority: "not established" as const,
		limitations:
			"Task/acceptance keys are evaluator attestations, not independent success proof. Controlled providers do not measure real-model task quality; smaller parent context does not establish lower total cost.",
	};
}
