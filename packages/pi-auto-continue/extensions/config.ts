import { JsonConfigStore } from "pi-plugin-support/config";
import { parseBoolean as parseBooleanInput } from "pi-plugin-support/settings";
import { type Static, Type } from "typebox";
import { Check } from "typebox/value";
import { defaults, type Settings } from "./loop.ts";

export const CONFIG_FILE_NAME = "pi-auto-continue.json";
const MAX_CONFIG_BYTES = 1024 * 1024;

export const settingsSchema = Type.Object(
	{
		delayMs: Type.Optional(Type.Integer({ minimum: 100, maximum: 86400000 })),
		maxRounds: Type.Optional(Type.Integer({ minimum: 0, maximum: 1000 })),
		onError: Type.Optional(
			Type.Union([
				Type.Literal("defer"),
				Type.Literal("wait-quota"),
				Type.Literal("stop"),
			]),
		),
		queueEmptyPolicy: Type.Optional(
			Type.Union([Type.Literal("stop"), Type.Literal("continue")]),
		),
		expandPromptTemplates: Type.Optional(Type.Boolean()),
		quotaWait: Type.Optional(Type.Boolean()),
		quotaDelayMs: Type.Optional(
			Type.Integer({ minimum: 0, maximum: 86400000 }),
		),
		prompt: Type.Optional(Type.String({ minLength: 0, maxLength: 16384 })),
		promptFile: Type.Optional(Type.String({ minLength: 0, maxLength: 1024 })),
		promptPipe: Type.Optional(Type.String({ minLength: 0, maxLength: 4096 })),
		pipeFormatPrefix: Type.Optional(
			Type.String({ minLength: 0, maxLength: 256 }),
		),
		pipeFormatSuffix: Type.Optional(
			Type.String({ minLength: 0, maxLength: 256 }),
		),
		pipeRequireFormat: Type.Optional(Type.Boolean()),
		pipeTimeoutMs: Type.Optional(
			Type.Integer({ minimum: 1000, maximum: 600000 }),
		),
		stopFile: Type.Optional(Type.String({ minLength: 0, maxLength: 1024 })),
		stopCommand: Type.Optional(Type.String({ minLength: 0, maxLength: 4096 })),
		stopCommandTimeoutMs: Type.Optional(
			Type.Integer({ minimum: 1000, maximum: 600000 }),
		),
		notifyOnContinue: Type.Optional(Type.Boolean()),
	},
	{ additionalProperties: false },
);

export type PartialSettings = Static<typeof settingsSchema>;

// Suggestions are presentation metadata; the schema remains the validation authority.
export const configOptions: Readonly<
	Record<keyof Settings, { description: string; values: readonly string[] }>
> = {
	delayMs: {
		description: "Buffer delay after normal completion before continuing (ms)",
		values: ["1000", "5000", "15000", "30000", "60000"],
	},
	maxRounds: {
		description: "Maximum automatic continuation rounds (0 = unlimited)",
		values: ["0", "3", "5", "10", "20", "50"],
	},
	onError: {
		description: "Behavior when an assistant turn ends with an error",
		values: ["defer", "wait-quota", "stop"],
	},
	queueEmptyPolicy: {
		description: "Behavior when the continuation queue drains completely",
		values: ["stop", "continue"],
	},
	expandPromptTemplates: {
		description: "Expand slash commands, skills, and prompt templates on send",
		values: ["true", "false"],
	},
	quotaWait: {
		description:
			"Wait for concrete provider quota reset evidence before sending",
		values: ["true", "false"],
	},
	quotaDelayMs: {
		description: "Safety delay after reported quota reset time (ms)",
		values: ["0", "5000", "15000", "30000", "60000", "120000"],
	},
	prompt: {
		description: "Default continuation prompt supporting {round}, {maxRounds}",
		values: [],
	},
	promptFile: {
		description: "Local UTF-8 prompt file re-read before each round",
		values: [],
	},
	promptPipe: {
		description: "One-shot shell command whose stdout becomes the next prompt",
		values: [],
	},
	pipeFormatPrefix: {
		description: "Opening tag for last-match prompt pipe extraction",
		values: [],
	},
	pipeFormatSuffix: {
		description: "Closing tag for last-match prompt pipe extraction",
		values: [],
	},
	pipeRequireFormat: {
		description:
			"Fail closed instead of falling back when format tags are missing",
		values: ["true", "false"],
	},
	pipeTimeoutMs: {
		description: "Timeout for one-shot promptPipe command (ms)",
		values: ["5000", "15000", "30000", "60000", "120000"],
	},
	stopFile: {
		description: "Local sentinel file path; if present, stop and disarm",
		values: [],
	},
	stopCommand: {
		description:
			"One-shot pre-dispatch StopHook command (non-zero or '0' stops)",
		values: [],
	},
	stopCommandTimeoutMs: {
		description: "Timeout for one-shot stopCommand hook (ms)",
		values: ["5000", "15000", "30000", "60000"],
	},
	notifyOnContinue: {
		description:
			"Show a concise notification when an automatic round dispatches",
		values: ["true", "false"],
	},
};

export class AutoContinueConfigManager {
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
				"Auto Continue blocked: invalid/unreadable pi-auto-continue.json.",
			onInvalid: () => ({ ...defaults }),
		});
	}

	get settings(): Settings {
		return this.store.config;
	}

	get error(): string | undefined {
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
				value: boolean | number | string;
				settings: Settings;
		  }
		| { ok: false; error: string }
	> {
		const trimmedKey = rawKey.trim();
		const resolvedKey = (Object.keys(defaults) as Array<keyof Settings>).find(
			(k) => k.toLowerCase() === trimmedKey.toLowerCase(),
		);
		if (!resolvedKey) {
			return {
				ok: false,
				error: `Unknown configuration key "${trimmedKey}". Valid keys: ${Object.keys(defaults).join(", ")}.`,
			};
		}

		const trimmedValue = rawValue.trim();
		const propSchema = settingsSchema.properties[resolvedKey];
		let parsedValue: boolean | number | string;

		if (Type.IsBoolean(propSchema)) {
			const boolVal = parseBooleanInput(trimmedValue);
			if (boolVal === undefined) {
				return {
					ok: false,
					error: `Invalid boolean value "${trimmedValue}" for ${resolvedKey}. Expected true/false or on/off.`,
				};
			}
			parsedValue = boolVal;
		} else if (Type.IsInteger(propSchema)) {
			if (!/^-?\d+$/.test(trimmedValue)) {
				return {
					ok: false,
					error: `Invalid integer value "${trimmedValue}" for ${resolvedKey}.`,
				};
			}
			parsedValue = Number.parseInt(trimmedValue, 10);
		} else if (Type.IsUnion(propSchema)) {
			parsedValue = trimmedValue.toLowerCase();
		} else if (Type.IsString(propSchema)) {
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
		if (
			typeof parsedValue === "string" &&
			parsedValue === "" &&
			!Type.IsUnion(propSchema)
		) {
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

		await this.store.replace(candidateRaw, persist);
		return {
			ok: true,
			key: resolvedKey,
			value: parsedValue,
			settings: this.settings,
		};
	}
}
