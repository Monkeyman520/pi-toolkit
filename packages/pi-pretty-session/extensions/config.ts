import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { JsonConfigStore } from "pi-plugin-support/config";
import { parseBoolean as parseBooleanValue } from "pi-plugin-support/settings";
import { type Static, Type } from "typebox";
import { Check } from "typebox/value";

export const CONFIG_FILE_NAME = "pi-pretty-session.json";
const MAX_CONFIG_BYTES = 1024 * 1024;

export const configSchema = Type.Object(
	{
		enabled: Type.Optional(Type.Boolean()),
		useLlm: Type.Optional(Type.Boolean()),
		model: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })),
		titleUpdateMode: Type.Optional(
			Type.Union([Type.Literal("once"), Type.Literal("dynamic")]),
		),
		language: Type.Optional(
			Type.String({
				minLength: 2,
				maxLength: 35,
				pattern: "^(auto|[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*)$",
			}),
		),
		updateEveryTurns: Type.Optional(
			Type.Integer({ minimum: 1, maximum: 1000 }),
		),
		contextDeltaTokens: Type.Optional(
			Type.Integer({ minimum: 500, maximum: 1000000 }),
		),
		summarizeOnCompact: Type.Optional(Type.Boolean()),
		protectManualName: Type.Optional(Type.Boolean()),
		showWidget: Type.Optional(Type.Boolean()),
		widgetPlacement: Type.Optional(
			Type.Union([Type.Literal("aboveEditor"), Type.Literal("belowEditor")]),
		),
		showStatus: Type.Optional(Type.Boolean()),
		maxTitleLength: Type.Optional(Type.Integer({ minimum: 24, maximum: 120 })),
		maxDescriptionLength: Type.Optional(
			Type.Integer({ minimum: 24, maximum: 280 }),
		),
		summaryTimeoutMs: Type.Optional(
			Type.Integer({ minimum: 1000, maximum: 60000 }),
		),
	},
	{ additionalProperties: false },
);

export type PartialPrettySessionConfig = Static<typeof configSchema>;

export interface PrettySessionConfig {
	enabled: boolean;
	useLlm: boolean;
	model: string | undefined;
	titleUpdateMode: "once" | "dynamic";
	language: string;
	updateEveryTurns: number;
	contextDeltaTokens: number;
	summarizeOnCompact: boolean;
	protectManualName: boolean;
	showWidget: boolean;
	widgetPlacement: "aboveEditor" | "belowEditor";
	showStatus: boolean;
	maxTitleLength: number;
	maxDescriptionLength: number;
	summaryTimeoutMs: number;
}

export const defaultConfig: PrettySessionConfig = {
	enabled: true,
	useLlm: true,
	model: undefined,
	titleUpdateMode: "once",
	language: "auto",
	updateEveryTurns: 3,
	contextDeltaTokens: 8000,
	summarizeOnCompact: true,
	protectManualName: true,
	showWidget: true,
	widgetPlacement: "aboveEditor",
	showStatus: true,
	maxTitleLength: 40,
	maxDescriptionLength: 100,
	summaryTimeoutMs: 15000,
};

export interface ConfigReloadResult {
	changed: boolean;
	config: PrettySessionConfig;
	error?: string;
	isNewError: boolean;
}

// Suggestions are presentation metadata; the schema remains the validation authority.
export const configOptions: Readonly<
	Record<
		keyof PrettySessionConfig,
		{ description: string; values: readonly string[] }
	>
> = {
	enabled: {
		description: "Enable automatic session summarization and naming",
		values: ["true", "false"],
	},
	useLlm: {
		description:
			"Use isolated LLM calls for summarization before heuristic fallback",
		values: ["true", "false"],
	},
	model: {
		description: "Optional provider/modelId override for summarization calls",
		values: ["default"],
	},
	titleUpdateMode: {
		description:
			"Title update policy: once (initial only) | dynamic (continuous)",
		values: ["once", "dynamic"],
	},
	language: {
		description:
			"Generation language: auto | zh-CN | en | ja (or BCP-47 language tag)",
		values: ["auto", "zh-CN", "en", "ja"],
	},
	updateEveryTurns: {
		description: "Re-summarize every N completed turns",
		values: ["1", "2", "3", "5", "10"],
	},
	contextDeltaTokens: {
		description: "Re-summarize when context grows by N tokens",
		values: ["2000", "4000", "8000", "16000", "32000"],
	},
	summarizeOnCompact: {
		description: "Re-summarize automatically after context compaction",
		values: ["true", "false"],
	},
	protectManualName: {
		description: "Protect manual session titles against dynamic overwrite",
		values: ["true", "false"],
	},
	showWidget: {
		description: "Display the session & project TUI widget",
		values: ["true", "false"],
	},
	widgetPlacement: {
		description: "Widget placement: aboveEditor | belowEditor",
		values: ["aboveEditor", "belowEditor"],
	},
	showStatus: {
		description: "Display compact session summary in the footer status bar",
		values: ["true", "false"],
	},
	maxTitleLength: {
		description: "Maximum character length for generated session titles",
		values: ["32", "40", "60", "80"],
	},
	maxDescriptionLength: {
		description: "Maximum character length for generated session descriptions",
		values: ["80", "100", "140", "200"],
	},
	summaryTimeoutMs: {
		description: "Timeout in milliseconds for LLM summarization calls",
		values: ["5000", "10000", "15000", "30000"],
	},
};

export const toggleAliases: Readonly<
	Record<string, keyof PrettySessionConfig>
> = {
	auto: "enabled",
	autosummarize: "enabled",
	enabled: "enabled",
	title: "titleUpdateMode",
	titlemode: "titleUpdateMode",
	titleupdatemode: "titleUpdateMode",
	lang: "language",
	updatetokendelta: "contextDeltaTokens",
	contextdeltatokens: "contextDeltaTokens",
	llm: "useLlm",
	usellm: "useLlm",
	widget: "showWidget",
	showwidget: "showWidget",
	status: "showStatus",
	showstatus: "showStatus",
	lock: "protectManualName",
	protectmanualname: "protectManualName",
	compact: "summarizeOnCompact",
	summarizeoncompact: "summarizeOnCompact",
};

export class ConfigManager {
	readonly configPath: string;
	private readonly store: JsonConfigStore<PrettySessionConfig>;
	constructor(
		configPath = join(getAgentDir(), CONFIG_FILE_NAME),
		initial?: PartialPrettySessionConfig,
	) {
		this.configPath = configPath;
		this.store = new JsonConfigStore({
			path: configPath,
			schema: configSchema,
			defaults: () => ({ ...defaultConfig }),
			maxBytes: MAX_CONFIG_BYTES,
			initial,
			errorMessage: `Invalid or unreadable ${CONFIG_FILE_NAME}; keeping previous safe configuration.`,
			identifyError: (read, lastText) =>
				lastText ??
				(read.error instanceof Error ? read.error.message : String(read.error)),
		});
	}
	get config(): PrettySessionConfig {
		return this.store.config;
	}
	get error() {
		return this.store.error;
	}
	async reloadIfChanged(force = false): Promise<ConfigReloadResult> {
		return this.store.reload(force);
	}

	async setOption(
		rawKey: string,
		rawValue: string,
		persist = true,
	): Promise<
		| {
				ok: true;
				key: keyof PrettySessionConfig;
				value: unknown;
				config: PrettySessionConfig;
		  }
		| { ok: false; error: string }
	> {
		const trimmedKey = rawKey.trim();
		const resolvedKey =
			(toggleAliases[trimmedKey.toLowerCase()] as
				| keyof PrettySessionConfig
				| undefined) ??
			(Object.keys(defaultConfig).find(
				(k) => k.toLowerCase() === trimmedKey.toLowerCase(),
			) as keyof PrettySessionConfig | undefined);

		if (!resolvedKey) {
			return {
				ok: false,
				error: `Unknown configuration key "${trimmedKey}". Valid keys: ${Object.keys(defaultConfig).join(", ")}.`,
			};
		}

		let parsedValue: unknown;
		const trimmedValue = rawValue.trim();

		if (Type.IsBoolean(configSchema.properties[resolvedKey])) {
			const boolVal = parseBooleanValue(trimmedValue);
			if (boolVal === undefined) {
				return {
					ok: false,
					error: `Invalid boolean value "${trimmedValue}" for ${resolvedKey}. Expected true/false or on/off.`,
				};
			}
			parsedValue = boolVal;
		} else if (Type.IsInteger(configSchema.properties[resolvedKey])) {
			if (!/^-?\d+$/.test(trimmedValue)) {
				return {
					ok: false,
					error: `Invalid integer value "${trimmedValue}" for ${resolvedKey}.`,
				};
			}
			parsedValue = Number.parseInt(trimmedValue, 10);
		} else if (resolvedKey === "widgetPlacement") {
			if (trimmedValue !== "aboveEditor" && trimmedValue !== "belowEditor") {
				return {
					ok: false,
					error: `Invalid widgetPlacement "${trimmedValue}". Expected "aboveEditor" or "belowEditor".`,
				};
			}
			parsedValue = trimmedValue;
		} else if (resolvedKey === "titleUpdateMode") {
			const normalizedMode = trimmedValue.toLowerCase();
			if (normalizedMode !== "once" && normalizedMode !== "dynamic") {
				return {
					ok: false,
					error: `Invalid titleUpdateMode "${trimmedValue}". Expected "once" or "dynamic".`,
				};
			}
			parsedValue = normalizedMode;
		} else if (resolvedKey === "language") {
			parsedValue =
				trimmedValue.toLowerCase() === "auto" ? "auto" : trimmedValue;
		} else if (resolvedKey === "model") {
			if (
				trimmedValue === "" ||
				trimmedValue.toLowerCase() === "default" ||
				trimmedValue.toLowerCase() === "none" ||
				trimmedValue.toLowerCase() === "null"
			) {
				parsedValue = undefined;
			} else {
				parsedValue = trimmedValue;
			}
		}

		const candidateRaw: Record<string, unknown> = {
			...this.store.raw,
		};
		if (parsedValue === undefined) {
			delete candidateRaw[resolvedKey];
		} else {
			candidateRaw[resolvedKey] = parsedValue;
		}

		if (!Check(configSchema, candidateRaw)) {
			return {
				ok: false,
				error: `Value ${JSON.stringify(parsedValue)} for ${resolvedKey} is out of allowed range.`,
			};
		}

		await this.store.replace(candidateRaw, persist);

		return {
			ok: true,
			key: resolvedKey,
			value: this.config[resolvedKey],
			config: this.config,
		};
	}

	async toggleOption(
		target: string,
		persist = true,
	): Promise<
		| {
				ok: true;
				key: keyof PrettySessionConfig;
				value: boolean | "once" | "dynamic";
				config: PrettySessionConfig;
		  }
		| { ok: false; error: string }
	> {
		const normalized = target.trim().toLowerCase();
		const key = toggleAliases[normalized];
		if (!key) {
			return {
				ok: false,
				error: `Unknown toggle target "${target}". Supported targets: auto, llm, widget, status, lock, compact, title.`,
			};
		}
		if (key === "titleUpdateMode") {
			const nextVal =
				this.config.titleUpdateMode === "once" ? "dynamic" : "once";
			const res = await this.setOption(key, nextVal, persist);
			if (!res.ok) return res;
			return {
				ok: true,
				key,
				value: res.config.titleUpdateMode,
				config: res.config,
			};
		}
		if (!Type.IsBoolean(configSchema.properties[key])) {
			return {
				ok: false,
				error: `Unknown toggle target "${target}". Supported targets: auto, llm, widget, status, lock, compact, title.`,
			};
		}
		const currentVal = Boolean(this.config[key]);
		const res = await this.setOption(key, String(!currentVal), persist);
		if (!res.ok) return res;
		return {
			ok: true,
			key,
			value: Boolean(res.value),
			config: res.config,
		};
	}
}
