import { readJsonConfig, writeJsonConfig } from "pi-plugin-support/config";
import { parseBoolean } from "pi-plugin-support/settings";
import { Type } from "typebox";
import { Check } from "typebox/value";
import type { ForecastSettings } from "./pressure.ts";

export interface Settings extends ForecastSettings {
	enabled: boolean;
	persistTraces: boolean;
}
export const defaults: Settings = {
	enabled: true,
	historySize: 6,
	horizonTurns: 3,
	reserveTokens: 4096,
	persistTraces: false,
};
export const schema = Type.Partial(
	Type.Object({
		enabled: Type.Boolean(),
		historySize: Type.Integer({ minimum: 2, maximum: 50 }),
		horizonTurns: Type.Integer({ minimum: 1, maximum: 20 }),
		reserveTokens: Type.Integer({ minimum: 0, maximum: 1000000 }),
		persistTraces: Type.Boolean(),
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
				typeof defaults[key] === "boolean"
					? parseBoolean(rawValue)
					: /^\d+$/.test(rawValue)
						? Number(rawValue)
						: undefined;
			const next = { ...this.values, [key]: value };
			if (value === undefined || !Check(schema, next))
				throw Error(`Invalid/out-of-range value for ${key}`);
			await writeJsonConfig(this.path, next, schema);
			this.values = next;
			this.error = undefined;
		});
	}
}
