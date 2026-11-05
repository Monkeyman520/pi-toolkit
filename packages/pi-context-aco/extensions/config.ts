import { readJsonConfig, writeJsonConfig } from "pi-plugin-support/config";
import { parseBoolean } from "pi-plugin-support/settings";
import { Type } from "typebox";
import { Check } from "typebox/value";
import type { ForecastSettings } from "./pressure.ts";

export type ACOMode = "observe" | "exact-prune" | "compact" | "delegate";
export interface Settings extends ForecastSettings {
	enabled: boolean;
	persistTraces: boolean;
	mode: ACOMode;
	maxDelegationDepth: number;
	maxDelegationConcurrency: number;
	maxDelegationTokens: number;
	maxChildOutputTokens: number;
	maxPruneTokens: number;
	maxCompactInputTokens: number;
	maxSummaryTokens: number;
}
export const defaults: Settings = {
	enabled: true,
	historySize: 6,
	horizonTurns: 3,
	reserveTokens: 4096,
	persistTraces: false,
	mode: "observe",
	maxDelegationDepth: 1,
	maxDelegationConcurrency: 2,
	maxDelegationTokens: 200000,
	maxChildOutputTokens: 2000,
	maxPruneTokens: 64000,
	maxCompactInputTokens: 64000,
	maxSummaryTokens: 8000,
};
export const schema = Type.Partial(
	Type.Object({
		enabled: Type.Boolean(),
		historySize: Type.Integer({ minimum: 2, maximum: 50 }),
		horizonTurns: Type.Integer({ minimum: 1, maximum: 20 }),
		reserveTokens: Type.Integer({ minimum: 0, maximum: 1000000 }),
		persistTraces: Type.Boolean(),
		mode: Type.Union([
			Type.Literal("observe"),
			Type.Literal("exact-prune"),
			Type.Literal("compact"),
			Type.Literal("delegate"),
		]),
		maxDelegationDepth: Type.Integer({ minimum: 0, maximum: 1 }),
		maxDelegationConcurrency: Type.Integer({ minimum: 1, maximum: 8 }),
		maxDelegationTokens: Type.Integer({ minimum: 0, maximum: 10000000 }),
		maxChildOutputTokens: Type.Integer({ minimum: 128, maximum: 8000 }),
		maxPruneTokens: Type.Integer({ minimum: 0, maximum: 1000000 }),
		maxCompactInputTokens: Type.Integer({ minimum: 1, maximum: 1000000 }),
		maxSummaryTokens: Type.Integer({ minimum: 1, maximum: 100000 }),
	}),
	{ additionalProperties: false },
);
export const options: Record<
	keyof Settings,
	{ description: string; values: string[] }
> = {
	enabled: {
		description: "Observe only; never grants strategy permission",
		values: ["true", "false"],
	},
	historySize: {
		description: "Recent completed-turn deltas (2–50), uncalibrated",
		values: ["3", "6", "12", "24", "50"],
	},
	horizonTurns: {
		description: "Forecast horizon in turns (1–20), uncalibrated",
		values: ["1", "3", "5", "10", "20"],
	},
	reserveTokens: {
		description: "Forecast reserve only (0–1000000); not an execution budget",
		values: ["0", "1024", "4096", "8192", "16384"],
	},
	persistTraces: {
		description: "Persist numeric metadata in raw session, never model-visible",
		values: ["false", "true"],
	},
	mode: {
		description:
			"Execution mode: observe (V1), exact-prune (V2), compact (V3), delegate (V4); proposals need separate authority",
		values: ["observe", "exact-prune", "compact", "delegate"],
	},
	maxPruneTokens: {
		description: "Maximum tokens pruned per turn (0–1000000)",
		values: ["16000", "32000", "64000", "128000"],
	},
	maxCompactInputTokens: {
		description:
			"Finite estimated input budget for V3 actions; not authorization",
		values: ["16000", "64000", "128000"],
	},
	maxSummaryTokens: {
		description: "Finite estimated summary output budget; not authorization",
		values: ["2000", "8000", "16000"],
	},
	maxDelegationDepth: {
		description: "Native children: depth 0 disables, 1 permits; no recursion",
		values: ["0", "1"],
	},
	maxDelegationConcurrency: {
		description: "Maximum simultaneous independent children (1–8)",
		values: ["1", "2", "4", "8"],
	},
	maxDelegationTokens: {
		description:
			"Aggregate parent/child/coordination admission budget; retained reservations",
		values: ["0", "100000", "200000", "1000000"],
	},
	maxChildOutputTokens: {
		description: "Provider output limit and coordination reservation",
		values: ["1000", "2000", "4000"],
	},
};

export function settingKey(raw: string): keyof Settings | undefined {
	return (Object.keys(defaults) as (keyof Settings)[]).find(
		(k) => k.toLowerCase() === raw.toLowerCase(),
	);
}
export class Config {
	readonly path: string;
	private values = { ...defaults };
	private queue = Promise.resolve();
	error: string | undefined;
	constructor(path: string) {
		this.path = path;
	}
	get settings(): Settings {
		return { ...this.values };
	}
	private serial<T>(work: () => Promise<T>): Promise<T> {
		const next = this.queue.then(work);
		this.queue = next.then(
			() => {},
			() => {},
		);
		return next;
	}
	reload() {
		return this.serial(async () => {
			const read = await readJsonConfig(this.path, schema, 64 * 1024);
			if (read.kind === "missing") {
				this.values = { ...defaults };
				this.error = undefined;
			} else if (read.kind === "valid") {
				this.values = { ...defaults, ...read.data };
				this.error = undefined;
			} else {
				this.values = { ...defaults, enabled: false };
				this.error =
					"ACO observation disabled: invalid/unreadable configuration. Repair or explicitly set an option.";
			}
		});
	}
	set(rawKey: string, rawValue: string) {
		return this.serial(async () => {
			const key = settingKey(rawKey);
			if (!key) throw Error(`Unknown configuration key: ${rawKey}`);
			const value =
				key === "mode"
					? ["exact-prune", "observe", "compact", "delegate"].includes(
							rawValue.toLowerCase(),
						)
						? (rawValue.toLowerCase() as ACOMode)
						: undefined
					: typeof defaults[key] === "boolean"
						? parseBoolean(rawValue)
						: /^\d+$/.test(rawValue)
							? Number(rawValue)
							: undefined;
			const next = { ...this.values, [key]: value };
			if (value === undefined || !Check(schema, next))
				throw Error(`Invalid/out-of-range value for ${key}`);
			for (let attempt = 0; attempt < 5; attempt++) {
				try {
					await writeJsonConfig(this.path, next, schema);
					break;
				} catch (err) {
					const code =
						err && typeof err === "object" && "code" in err ? err.code : null;
					if (
						(code === "EPERM" || code === "EBUSY") &&
						process.platform === "win32" &&
						attempt < 4
					) {
						await new Promise((r) => setTimeout(r, 15 * (attempt + 1)));
						continue;
					}
					throw err;
				}
			}
			this.values = next;
			this.error = undefined;
		});
	}
}
