import { randomUUID } from "node:crypto";
import {
	mkdir,
	readFile,
	rename,
	stat,
	unlink,
	writeFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { type Static, Type } from "typebox";
import { Check } from "typebox/value";

export const CONFIG_FILE_NAME = "pi-pretty-session.json";
const MAX_CONFIG_BYTES = 1024 * 1024;

export const configSchema = Type.Object(
	{
		enabled: Type.Optional(Type.Boolean()),
		useLlm: Type.Optional(Type.Boolean()),
		model: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })),
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
		maxTitleLength: Type.Optional(Type.Integer({ minimum: 12, maximum: 120 })),
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
	updateEveryTurns: 3,
	contextDeltaTokens: 8000,
	summarizeOnCompact: true,
	protectManualName: true,
	showWidget: true,
	widgetPlacement: "aboveEditor",
	showStatus: true,
	maxTitleLength: 60,
	maxDescriptionLength: 160,
	summaryTimeoutMs: 15000,
};

export interface ConfigReloadResult {
	changed: boolean;
	config: PrettySessionConfig;
	error?: string;
	isNewError: boolean;
}

const booleanKeys = new Set<keyof PrettySessionConfig>([
	"enabled",
	"useLlm",
	"summarizeOnCompact",
	"protectManualName",
	"showWidget",
	"showStatus",
]);

const integerKeys = new Set<keyof PrettySessionConfig>([
	"updateEveryTurns",
	"contextDeltaTokens",
	"maxTitleLength",
	"maxDescriptionLength",
	"summaryTimeoutMs",
]);

export const toggleAliases: Readonly<
	Record<string, keyof PrettySessionConfig>
> = {
	auto: "enabled",
	enabled: "enabled",
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

function parseBooleanValue(raw: string): boolean | undefined {
	const normalized = raw.trim().toLowerCase();
	if (normalized === "true" || normalized === "on" || normalized === "1")
		return true;
	if (normalized === "false" || normalized === "off" || normalized === "0")
		return false;
	return undefined;
}

export class ConfigManager {
	readonly configPath: string;
	private current: PrettySessionConfig;
	private rawPersisted: PartialPrettySessionConfig = {};
	private lastMtimeMs: number | "missing" | undefined;
	private lastContent: string | undefined;
	private lastError: string | undefined;
	private notifiedErrorContent: string | undefined;

	constructor(
		configPath = join(getAgentDir(), CONFIG_FILE_NAME),
		initial?: PartialPrettySessionConfig,
	) {
		this.configPath = configPath;
		this.current = { ...defaultConfig, ...initial };
		if (initial) this.rawPersisted = { ...initial };
	}

	get config(): PrettySessionConfig {
		return { ...this.current };
	}

	get error(): string | undefined {
		return this.lastError;
	}

	async reloadIfChanged(force = false): Promise<ConfigReloadResult> {
		try {
			const fileStat = await stat(this.configPath);
			if (fileStat.size > MAX_CONFIG_BYTES) {
				throw new Error("Configuration file exceeds maximum size");
			}
			const rawText = await readFile(this.configPath, "utf8");
			if (Buffer.byteLength(rawText) > MAX_CONFIG_BYTES) {
				throw new Error("Configuration file exceeds maximum size");
			}
			if (
				!force &&
				this.lastMtimeMs === fileStat.mtimeMs &&
				this.lastContent === rawText
			) {
				return {
					changed: false,
					config: this.config,
					error: this.lastError,
					isNewError: false,
				};
			}
			this.lastMtimeMs = fileStat.mtimeMs;
			this.lastContent = rawText;

			const parsed: unknown = JSON.parse(rawText);
			if (!Check(configSchema, parsed)) {
				throw new Error("Configuration does not match schema");
			}
			const nextConfig: PrettySessionConfig = {
				...defaultConfig,
				...parsed,
			};
			const changed =
				force ||
				this.lastError !== undefined ||
				JSON.stringify(this.current) !== JSON.stringify(nextConfig);
			this.rawPersisted = { ...parsed };
			this.current = nextConfig;
			this.lastError = undefined;
			this.notifiedErrorContent = undefined;
			return {
				changed,
				config: this.config,
				isNewError: false,
			};
		} catch (error) {
			if (
				error instanceof Error &&
				"code" in error &&
				error.code === "ENOENT"
			) {
				const wasMissing = this.lastMtimeMs === "missing";
				const hadError = this.lastError !== undefined;
				const changed =
					force ||
					!wasMissing ||
					hadError ||
					JSON.stringify(this.current) !== JSON.stringify(defaultConfig);
				this.lastMtimeMs = "missing";
				this.lastContent = undefined;
				this.rawPersisted = {};
				this.current = { ...defaultConfig };
				this.lastError = undefined;
				this.notifiedErrorContent = undefined;
				return {
					changed,
					config: this.config,
					isNewError: false,
				};
			}
			const errMsg = `Invalid or unreadable ${CONFIG_FILE_NAME}; keeping previous safe configuration.`;
			const errorKey =
				this.lastContent ??
				(error instanceof Error ? error.message : String(error));
			const isNewError = this.notifiedErrorContent !== errorKey;
			this.lastError = errMsg;
			this.notifiedErrorContent = errorKey;
			return {
				changed: false,
				config: this.config,
				error: errMsg,
				isNewError,
			};
		}
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

		if (booleanKeys.has(resolvedKey)) {
			const boolVal = parseBooleanValue(trimmedValue);
			if (boolVal === undefined) {
				return {
					ok: false,
					error: `Invalid boolean value "${trimmedValue}" for ${resolvedKey}. Expected true/false or on/off.`,
				};
			}
			parsedValue = boolVal;
		} else if (integerKeys.has(resolvedKey)) {
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
			...this.rawPersisted,
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

		this.rawPersisted = candidateRaw;
		this.current = { ...defaultConfig, ...candidateRaw };
		this.lastError = undefined;
		this.notifiedErrorContent = undefined;

		if (persist) {
			await this.persistCurrent();
		}

		return {
			ok: true,
			key: resolvedKey,
			value: this.current[resolvedKey],
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
				value: boolean;
				config: PrettySessionConfig;
		  }
		| { ok: false; error: string }
	> {
		const normalized = target.trim().toLowerCase();
		const key = toggleAliases[normalized];
		if (!key || !booleanKeys.has(key)) {
			return {
				ok: false,
				error: `Unknown toggle target "${target}". Supported targets: auto, llm, widget, status, lock, compact.`,
			};
		}
		const currentVal = Boolean(this.current[key]);
		const res = await this.setOption(key, String(!currentVal), persist);
		if (!res.ok) return res;
		return {
			ok: true,
			key,
			value: Boolean(res.value),
			config: res.config,
		};
	}

	private async persistCurrent(): Promise<void> {
		const dir = dirname(this.configPath);
		await mkdir(dir, { recursive: true, mode: 0o700 });
		const serialized = `${JSON.stringify(this.rawPersisted, null, "\t")}\n`;
		const tempPath = join(
			dir,
			`.${CONFIG_FILE_NAME}.${process.pid}-${randomUUID()}.tmp`,
		);
		try {
			await writeFile(tempPath, serialized, {
				encoding: "utf8",
				mode: 0o600,
				flag: "wx",
			});
			await rename(tempPath, this.configPath);
		} catch (error) {
			await unlink(tempPath).catch(() => {});
			throw error;
		}
		try {
			const fileStat = await stat(this.configPath);
			this.lastMtimeMs = fileStat.mtimeMs;
			this.lastContent = serialized;
		} catch {
			// Ignore stat race after write
		}
	}
}
