import { JsonConfigStore } from "pi-plugin-support/config";
import { parseBoolean as parseBooleanInput } from "pi-plugin-support/settings";
import { type Static, Type } from "typebox";
import { Check } from "typebox/value";
import { compileCustomRules, defaults, type Settings } from "./recovery.ts";

export const CONFIG_FILE_NAME = "pi-auto-resume.json";
const MAX_CONFIG_BYTES = 1024 * 1024;

export const settingsSchema = Type.Object(
	{
		enabled: Type.Optional(Type.Boolean()),
		network: Type.Optional(Type.Boolean()),
		server: Type.Optional(Type.Boolean()),
		throttle: Type.Optional(Type.Boolean()),
		quota: Type.Optional(Type.Boolean()),
		wake: Type.Optional(Type.Boolean()),
		retryDelayMs: Type.Optional(
			Type.Integer({ minimum: 1, maximum: 86400000 }),
		),
		retryBackoffFactor: Type.Optional(Type.Number({ minimum: 1, maximum: 10 })),
		maxRetryDelayMs: Type.Optional(
			Type.Integer({ minimum: 1, maximum: 86400000 }),
		),
		quotaDelayMs: Type.Optional(
			Type.Integer({ minimum: 0, maximum: 86400000 }),
		),
		maxAttempts: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
		maxWaitMs: Type.Optional(Type.Integer({ minimum: 0, maximum: 604800000 })),
		maxTotalAttempts: Type.Optional(
			Type.Integer({ minimum: 0, maximum: 10000 }),
		),
		notifyOnResume: Type.Optional(Type.Boolean()),
		resumePrompt: Type.Optional(
			Type.String({ minLength: 0, maxLength: 16384 }),
		),
		resumePromptFile: Type.Optional(
			Type.String({ minLength: 0, maxLength: 1024 }),
		),
		stopFile: Type.Optional(Type.String({ minLength: 0, maxLength: 1024 })),
		customExcludePatterns: Type.Optional(
			Type.Array(Type.String({ minLength: 1, maxLength: 512 }), {
				maxItems: 50,
			}),
		),
		customMatchPatterns: Type.Optional(
			Type.Array(
				Type.Object(
					{
						pattern: Type.String({ minLength: 1, maxLength: 512 }),
						cause: Type.Union([
							Type.Literal("network"),
							Type.Literal("server"),
							Type.Literal("throttle"),
							Type.Literal("quota"),
						]),
					},
					{ additionalProperties: false },
				),
				{ maxItems: 50 },
			),
		),
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
		description: "Recover from network loss, stream aborts, or timeouts",
		values: ["true", "false"],
	},
	server: {
		description:
			"Recover from transient upstream server errors (HTTP 500/502/503/504/529, overloaded)",
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
		description: "Minimum delay before network/server/throttle retry (ms)",
		values: ["1000", "5000", "10000", "30000", "60000"],
	},
	retryBackoffFactor: {
		description:
			"Exponential backoff multiplier for consecutive retries (1 = fixed delay)",
		values: ["1", "1.5", "2", "3"],
	},
	maxRetryDelayMs: {
		description: "Maximum backoff delay cap for non-quota retries (ms)",
		values: ["30000", "60000", "300000", "600000", "1800000"],
	},
	quotaDelayMs: {
		description: "Safety delay after reported quota reset time (ms)",
		values: ["0", "5000", "15000", "30000", "60000", "120000"],
	},
	maxAttempts: {
		description: "Maximum consecutive automatic recovery attempts",
		values: ["1", "2", "3", "5", "10", "20"],
	},
	maxWaitMs: {
		description: "Maximum single recovery wait cap in ms (0 = unlimited)",
		values: ["0", "60000", "300000", "1800000", "21600000"],
	},
	maxTotalAttempts: {
		description:
			"Maximum cumulative automatic recoveries per session (0 = unlimited)",
		values: ["0", "5", "10", "20", "50"],
	},
	notifyOnResume: {
		description: "Show a concise notification when an automatic recovery fires",
		values: ["true", "false"],
	},
	resumePrompt: {
		description:
			"Recovery prompt template supporting {cause}, {attempt}, {maxAttempts}",
		values: [],
	},
	resumePromptFile: {
		description:
			"Local UTF-8 prompt file re-read dynamically on each recovery attempt",
		values: [],
	},
	stopFile: {
		description:
			"Local sentinel file path; if it exists, pending recovery is cancelled",
		values: [],
	},
	customExcludePatterns: {
		description:
			"Regex strings that always block recovery (edit in pi-auto-resume.json)",
		values: [],
	},
	customMatchPatterns: {
		description:
			"Custom {pattern, cause} regex rules for recovery (edit in pi-auto-resume.json)",
		values: [],
	},
};

export class AutoResumeConfigManager {
	readonly configPath: string;
	private readonly store: JsonConfigStore<Settings>;
	private regexError: string | undefined;
	private lastRegexErrorKey: string | undefined;
	constructor(configPath: string) {
		this.configPath = configPath;
		this.store = new JsonConfigStore({
			path: configPath,
			schema: settingsSchema,
			defaults: () => ({
				...defaults,
				customExcludePatterns: [...defaults.customExcludePatterns],
				customMatchPatterns: defaults.customMatchPatterns.map((rule) => ({
					...rule,
				})),
			}),
			maxBytes: MAX_CONFIG_BYTES,
			errorMessage:
				"Auto Resume disabled: invalid/unreadable pi-auto-resume.json.",
			onInvalid: () => ({
				...defaults,
				enabled: false,
				customExcludePatterns: [],
				customMatchPatterns: [],
			}),
		});
	}
	get settings(): Settings {
		if (this.regexError) {
			return {
				...defaults,
				enabled: false,
				customExcludePatterns: [],
				customMatchPatterns: [],
			};
		}
		return this.store.config;
	}
	get error() {
		return this.store.error ?? this.regexError;
	}
	async reloadIfChanged(force = false) {
		const { config, ...result } = await this.store.reload(force);
		if (result.error) {
			this.regexError = undefined;
			this.lastRegexErrorKey = undefined;
			return { ...result, settings: config };
		}
		const compiled = compileCustomRules(
			config.customExcludePatterns,
			config.customMatchPatterns,
		);
		if (!compiled.ok) {
			const errorKey = JSON.stringify({
				e: config.customExcludePatterns,
				m: config.customMatchPatterns,
			});
			const isNewError = this.lastRegexErrorKey !== errorKey;
			const hadRegexError = this.regexError !== undefined;
			this.regexError = `Auto Resume disabled: ${compiled.error}`;
			this.lastRegexErrorKey = errorKey;
			return {
				changed: result.changed || !hadRegexError,
				settings: this.settings,
				error: this.regexError,
				isNewError,
			};
		}
		const recoveredFromRegexError = this.regexError !== undefined;
		this.regexError = undefined;
		this.lastRegexErrorKey = undefined;
		return {
			...result,
			changed: result.changed || recoveredFromRegexError,
			settings: config,
		};
	}

	async setOption(
		rawKey: string,
		rawValue: string,
		persist = true,
	): Promise<
		| {
				ok: true;
				key: keyof Settings;
				value: boolean | number | string;
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

		if (
			resolvedKey === "customExcludePatterns" ||
			resolvedKey === "customMatchPatterns"
		) {
			return {
				ok: false,
				error: `${resolvedKey} must be edited directly in ${this.configPath} (hot-reloaded automatically).`,
			};
		}

		const trimmedValue = rawValue.trim();
		let parsedValue: boolean | number | string;
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
		} else if (Type.IsNumber(settingsSchema.properties[resolvedKey])) {
			if (!/^-?\d+(?:\.\d+)?$/.test(trimmedValue)) {
				return {
					ok: false,
					error: `Invalid number value "${trimmedValue}" for ${resolvedKey}.`,
				};
			}
			parsedValue = Number(trimmedValue);
		} else if (Type.IsString(settingsSchema.properties[resolvedKey])) {
			const unquoted =
				trimmedValue.length >= 2 &&
				((trimmedValue.startsWith('"') && trimmedValue.endsWith('"')) ||
					(trimmedValue.startsWith("'") && trimmedValue.endsWith("'")))
					? trimmedValue.slice(1, -1).trim()
					: trimmedValue;
			parsedValue = unquoted;
		} else {
			return { ok: false, error: `Unsupported key "${resolvedKey}".` };
		}

		const candidateRaw: Record<string, unknown> = {
			...this.store.raw,
		};
		if (typeof parsedValue === "string" && parsedValue === "") {
			delete candidateRaw[resolvedKey];
		} else {
			candidateRaw[resolvedKey] = parsedValue;
		}
		if (!Check(settingsSchema, candidateRaw)) {
			return {
				ok: false,
				error: `Value ${JSON.stringify(parsedValue)} for ${resolvedKey} is out of allowed range.`,
			};
		}
		const mergedRules = compileCustomRules(
			(candidateRaw.customExcludePatterns as string[] | undefined) ??
				defaults.customExcludePatterns,
			(candidateRaw.customMatchPatterns as
				| Settings["customMatchPatterns"]
				| undefined) ?? defaults.customMatchPatterns,
		);
		if (!mergedRules.ok) {
			return {
				ok: false,
				error: `Cannot save config while custom patterns are invalid: ${mergedRules.error}`,
			};
		}

		await this.store.replace(candidateRaw, persist);
		this.regexError = undefined;
		this.lastRegexErrorKey = undefined;

		return {
			ok: true,
			key: resolvedKey,
			value: parsedValue,
			settings: this.settings,
		};
	}
}
