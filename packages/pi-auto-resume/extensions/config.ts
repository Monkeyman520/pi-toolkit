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

const booleanSettingKeys = new Set<keyof Settings>([
	"enabled",
	"network",
	"throttle",
	"quota",
	"wake",
]);

const integerSettingKeys = new Set<keyof Settings>([
	"retryDelayMs",
	"quotaDelayMs",
	"maxAttempts",
]);

function parseBooleanInput(raw: string): boolean | undefined {
	const normalized = raw.trim().toLowerCase();
	if (normalized === "true" || normalized === "on" || normalized === "1")
		return true;
	if (normalized === "false" || normalized === "off" || normalized === "0")
		return false;
	return undefined;
}

export class AutoResumeConfigManager {
	readonly configPath: string;
	private rawPersisted: PartialSettings = {};
	private current: Settings = { ...defaults };
	private lastMtimeMs: number | "missing" | undefined;
	private lastContent: string | undefined;
	private lastError: string | undefined;
	private notifiedErrorKey: string | undefined;

	constructor(configPath: string) {
		this.configPath = configPath;
	}

	get settings(): Settings {
		return { ...this.current };
	}

	get error(): string | undefined {
		return this.lastError;
	}

	async reloadIfChanged(force = false): Promise<{
		changed: boolean;
		settings: Settings;
		error?: string;
		isNewError: boolean;
	}> {
		let rawText: string | undefined;
		try {
			const fileStat = await stat(this.configPath);
			if (fileStat.size > MAX_CONFIG_BYTES) {
				throw new Error("Configuration file too large");
			}
			rawText = await readFile(this.configPath, "utf8");
			if (Buffer.byteLength(rawText) > MAX_CONFIG_BYTES) {
				throw new Error("Configuration file too large");
			}
			if (
				!force &&
				this.lastMtimeMs === fileStat.mtimeMs &&
				this.lastContent === rawText
			) {
				return {
					changed: false,
					settings: this.settings,
					error: this.lastError,
					isNewError: false,
				};
			}
			this.lastMtimeMs = fileStat.mtimeMs;
			this.lastContent = rawText;

			const parsed: unknown = JSON.parse(rawText);
			if (!Check(settingsSchema, parsed)) {
				throw new Error("Invalid configuration");
			}
			const nextSettings: Settings = { ...defaults, ...parsed };
			const changed =
				force ||
				this.lastError !== undefined ||
				JSON.stringify(this.current) !== JSON.stringify(nextSettings);
			this.rawPersisted = { ...parsed };
			this.current = nextSettings;
			this.lastError = undefined;
			this.notifiedErrorKey = undefined;
			return {
				changed,
				settings: this.settings,
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
					JSON.stringify(this.current) !== JSON.stringify(defaults);
				this.lastMtimeMs = "missing";
				this.lastContent = undefined;
				this.rawPersisted = {};
				this.current = { ...defaults };
				this.lastError = undefined;
				this.notifiedErrorKey = undefined;
				return {
					changed,
					settings: this.settings,
					isNewError: false,
				};
			}
			// Fail closed on invalid/unreadable configuration
			const errMsg =
				"Auto Resume disabled: invalid/unreadable pi-auto-resume.json.";
			const errorKey =
				rawText ?? (error instanceof Error ? error.message : String(error));
			const isNewError = this.notifiedErrorKey !== errorKey;
			const disabledSettings: Settings = { ...defaults, enabled: false };
			const changed =
				force ||
				this.lastError === undefined ||
				JSON.stringify(this.current) !== JSON.stringify(disabledSettings);
			this.current = disabledSettings;
			this.lastError = errMsg;
			this.notifiedErrorKey = errorKey;
			return {
				changed,
				settings: this.settings,
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
		if (booleanSettingKeys.has(resolvedKey)) {
			const boolVal = parseBooleanInput(trimmedValue);
			if (boolVal === undefined) {
				return {
					ok: false,
					error: `Invalid boolean value "${trimmedValue}" for ${resolvedKey}. Expected true/false or on/off.`,
				};
			}
			parsedValue = boolVal;
		} else if (integerSettingKeys.has(resolvedKey)) {
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
			...this.rawPersisted,
			[resolvedKey]: parsedValue,
		};
		if (!Check(settingsSchema, candidateRaw)) {
			return {
				ok: false,
				error: `Value ${JSON.stringify(parsedValue)} for ${resolvedKey} is out of allowed range.`,
			};
		}

		this.rawPersisted = candidateRaw;
		this.current = { ...defaults, ...candidateRaw };
		this.lastError = undefined;
		this.notifiedErrorKey = undefined;

		if (persist) {
			await this.persistCurrent();
		}

		return {
			ok: true,
			key: resolvedKey,
			value: parsedValue,
			settings: this.settings,
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
