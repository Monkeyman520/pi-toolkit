import { JsonConfigStore } from "pi-plugin-support/config";
import { parseBoolean as parseBooleanInput } from "pi-plugin-support/settings";
import { type Static, Type } from "typebox";
import { Check } from "typebox/value";
import { defaults, type Settings } from "./recovery.ts";

export const CONFIG_FILE_NAME = "pi-auto-resume.json";
const MAX_CONFIG_BYTES = 1024 * 1024;

export const settingsSchema = Type.Object(
	{
		enabled: Type.Optional(Type.Boolean()),
		network: Type.Optional(Type.Boolean()),
		throttle: Type.Optional(Type.Boolean()),
		quota: Type.Optional(Type.Boolean()),
		wake: Type.Optional(Type.Boolean()),
		retryDelayMs: Type.Optional(
			Type.Integer({ minimum: 1, maximum: 86400000 }),
		),
		quotaDelayMs: Type.Optional(
			Type.Integer({ minimum: 0, maximum: 86400000 }),
		),
		maxAttempts: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
	},
	{ additionalProperties: false },
);

export type PartialSettings = Static<typeof settingsSchema>;

// Suggestions are presentation metadata; the schema remains the validation authority.
export const configOptions: Readonly<
	Record<keyof Settings, { description: string; values: readonly string[] }>
> = {
	enabled: {
		description: "Enable or disable automatic recovery by default",
		values: ["true", "false"],
	},
	network: {
		description: "Recover from network loss or request timeouts",
		values: ["true", "false"],
	},
	throttle: {
		description: "Recover from temporary rate-limiting (HTTP 429)",
		values: ["true", "false"],
	},
	quota: {
		description: "Recover after subscription quota reset",
		values: ["true", "false"],
	},
	wake: {
		description: "Reevaluate interrupted work after computer wake",
		values: ["true", "false"],
	},
	retryDelayMs: {
		description: "Minimum delay before network/throttle retry (ms)",
		values: ["1000", "5000", "10000", "30000", "60000"],
	},
	quotaDelayMs: {
		description: "Safety delay after reported quota reset time (ms)",
		values: ["0", "5000", "15000", "30000", "60000", "120000"],
	},
	maxAttempts: {
		description: "Maximum consecutive automatic recovery attempts",
		values: ["1", "2", "3", "5", "10", "20"],
	},
};

export class AutoResumeConfigManager {
	readonly configPath: string;
	private readonly store: JsonConfigStore<Settings>;
	constructor(configPath: string) {
		this.configPath = configPath;
		this.store = new JsonConfigStore({
			path: configPath,
			schema: settingsSchema,
			defaults: () => ({ ...defaults }),
			maxBytes: MAX_CONFIG_BYTES,
			errorMessage:
				"Auto Resume disabled: invalid/unreadable pi-auto-resume.json.",
			onInvalid: () => ({ ...defaults, enabled: false }),
		});
	}
	get settings(): Settings {
		return this.store.config;
	}
	get error() {
		return this.store.error;
	}
	async reloadIfChanged(force = false) {
		const { config, ...result } = await this.store.reload(force);
		return { ...result, settings: config };
	}

	async setOption(
		rawKey: string,
		rawValue: string,
		persist = true,
	): Promise<
		| {
				ok: true;
				key: keyof Settings;
				value: boolean | number;
				settings: Settings;
		  }
		| { ok: false; error: string }
	> {
		const trimmedKey = rawKey.trim();
		const resolvedKey = Object.keys(defaults).find(
			(k) => k.toLowerCase() === trimmedKey.toLowerCase(),
		) as keyof Settings | undefined;
		if (!resolvedKey) {
			return {
				ok: false,
				error: `Unknown configuration key "${trimmedKey}". Valid keys: ${Object.keys(defaults).join(", ")}.`,
			};
		}

		const trimmedValue = rawValue.trim();
		let parsedValue: boolean | number;
		if (Type.IsBoolean(settingsSchema.properties[resolvedKey])) {
			const boolVal = parseBooleanInput(trimmedValue);
			if (boolVal === undefined) {
				return {
					ok: false,
					error: `Invalid boolean value "${trimmedValue}" for ${resolvedKey}. Expected true/false or on/off.`,
				};
			}
			parsedValue = boolVal;
		} else if (Type.IsInteger(settingsSchema.properties[resolvedKey])) {
			if (!/^-?\d+$/.test(trimmedValue)) {
				return {
					ok: false,
					error: `Invalid integer value "${trimmedValue}" for ${resolvedKey}.`,
				};
			}
			parsedValue = Number.parseInt(trimmedValue, 10);
		} else {
			return { ok: false, error: `Unsupported key "${resolvedKey}".` };
		}

		const candidateRaw: Record<string, unknown> = {
			...this.store.raw,
			[resolvedKey]: parsedValue,
		};
		if (!Check(settingsSchema, candidateRaw)) {
			return {
				ok: false,
				error: `Value ${JSON.stringify(parsedValue)} for ${resolvedKey} is out of allowed range.`,
			};
		}

		await this.store.replace(candidateRaw, persist);

		return {
			ok: true,
			key: resolvedKey,
			value: parsedValue,
			settings: this.settings,
		};
	}
}
