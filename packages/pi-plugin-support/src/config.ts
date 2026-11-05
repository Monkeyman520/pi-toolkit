import { randomUUID } from "node:crypto";
import {
	mkdir,
	readFile,
	rename,
	stat,
	unlink,
	writeFile,
} from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import type { TSchema } from "typebox";
import { Check } from "typebox/value";

type FileEvidence = { text?: string; mtimeMs?: number };
export type JsonRead =
	| { kind: "missing" }
	| {
			kind: "valid";
			data: Record<string, unknown>;
			text: string;
			mtimeMs: number;
	  }
	| ({ kind: "invalid" | "unreadable"; error: unknown } & FileEvidence);

/** Bounded user-settings JSON only. No credential or activation-ledger semantics. */
export async function readJsonConfig(
	path: string,
	schema: TSchema,
	maxBytes: number,
): Promise<JsonRead> {
	let text: string | undefined, mtimeMs: number | undefined;
	try {
		const file = await stat(path);
		if (file.size > maxBytes)
			return {
				kind: "invalid",
				error: new Error("Configuration file too large"),
			};
		text = await readFile(path, "utf8");
		mtimeMs = file.mtimeMs;
		if (Buffer.byteLength(text) > maxBytes)
			return {
				kind: "invalid",
				error: new Error("Configuration file too large"),
			};
	} catch (error) {
		if (error instanceof Error && "code" in error && error.code === "ENOENT")
			return { kind: "missing" };
		return { kind: "unreadable", error };
	}
	try {
		const data: unknown = JSON.parse(text);
		if (
			!data ||
			typeof data !== "object" ||
			Array.isArray(data) ||
			!Check(schema, data)
		)
			throw new Error("Invalid configuration");
		return {
			kind: "valid",
			data: data as Record<string, unknown>,
			text,
			mtimeMs,
		};
	} catch (error) {
		return { kind: "invalid", error, text, mtimeMs };
	}
}

/** Atomically replaces the explicit target. Failure rejects; no rollback/locking is promised. */
export async function writeJsonConfig(
	path: string,
	data: object,
	schema: TSchema,
): Promise<string> {
	if (!Check(schema, data))
		throw new Error("Configuration does not match schema.");
	const dir = dirname(path);
	await mkdir(dir, { recursive: true, mode: 0o700 });
	const text = `${JSON.stringify(data, null, "\t")}\n`;
	const temp = join(
		dir,
		`.${basename(path)}.${process.pid}-${randomUUID()}.tmp`,
	);
	try {
		await writeFile(temp, text, { encoding: "utf8", mode: 0o600, flag: "wx" });
		await rename(temp, path);
	} catch (error) {
		await unlink(temp).catch(() => {});
		throw error;
	}
	return text;
}

export interface ConfigReload<T> {
	changed: boolean;
	config: T;
	error?: string;
	isNewError: boolean;
}
export interface ConfigStoreOptions<T extends object> {
	path: string;
	schema: TSchema;
	defaults: () => T;
	maxBytes: number;
	errorMessage: string;
	initial?: Record<string, unknown>;
	/** Absent means keep the previous safe configuration. Supplied fallback is caller policy. */
	onInvalid?: (previous: T) => T;
	/** Optional error identity preserves a caller's existing notification policy. */
	identifyError?: (
		result: Extract<JsonRead, { kind: "invalid" | "unreadable" }>,
		previousText?: string,
	) => string;
}

/** Instance-local tracking, never a watcher. Callers decide when to reload and how to apply settings. */
export class JsonConfigStore<T extends object> {
	private readonly options: ConfigStoreOptions<T>;
	private persisted: Record<string, unknown>;
	private current: T;
	private lastMtime: number | "missing" | undefined;
	private lastText: string | undefined;
	private lastError: string | undefined;
	private notified: string | undefined;
	constructor(options: ConfigStoreOptions<T>) {
		this.options = options;
		this.persisted = { ...options.initial };
		this.current = { ...options.defaults(), ...options.initial };
	}
	get config(): T {
		return { ...this.current };
	}
	get raw(): Record<string, unknown> {
		return { ...this.persisted };
	}
	get error() {
		return this.lastError;
	}
	private result(changed: boolean, isNewError = false): ConfigReload<T> {
		return { changed, config: this.config, error: this.lastError, isNewError };
	}
	async reload(force = false): Promise<ConfigReload<T>> {
		const read = await readJsonConfig(
			this.options.path,
			this.options.schema,
			this.options.maxBytes,
		);
		if (read.kind === "missing") {
			const next = this.options.defaults();
			const changed =
				force ||
				this.lastMtime !== "missing" ||
				this.lastError !== undefined ||
				JSON.stringify(this.current) !== JSON.stringify(next);
			this.lastMtime = "missing";
			this.lastText = undefined;
			this.persisted = {};
			this.current = next;
			this.lastError = undefined;
			this.notified = undefined;
			return this.result(changed);
		}
		if ("text" in read && read.text !== undefined) {
			if (
				!force &&
				this.lastMtime === read.mtimeMs &&
				this.lastText === read.text
			)
				return this.result(false);
			this.lastMtime = read.mtimeMs;
			this.lastText = read.text;
		}
		if (read.kind === "valid") {
			const next = { ...this.options.defaults(), ...read.data };
			const changed =
				force ||
				this.lastError !== undefined ||
				JSON.stringify(this.current) !== JSON.stringify(next);
			this.persisted = { ...read.data };
			this.current = next;
			this.lastError = undefined;
			this.notified = undefined;
			return this.result(changed);
		}
		const key =
			this.options.identifyError?.(read, this.lastText) ??
			read.text ??
			(read.error instanceof Error ? read.error.message : String(read.error));
		const isNewError = this.notified !== key;
		let changed = false;
		if (this.options.onInvalid) {
			const next = this.options.onInvalid(this.config);
			changed =
				force ||
				this.lastError === undefined ||
				JSON.stringify(this.current) !== JSON.stringify(next);
			this.current = next;
		}
		this.lastError = this.options.errorMessage;
		this.notified = key;
		return this.result(changed, isNewError);
	}
	async replace(raw: Record<string, unknown>, persist: boolean): Promise<void> {
		if (!Check(this.options.schema, raw))
			throw new Error("Configuration does not match schema.");
		// Preserve existing adapters' update-before-persist behavior; never report failed durability as success.
		this.persisted = { ...raw };
		this.current = { ...this.options.defaults(), ...raw };
		this.lastError = undefined;
		this.notified = undefined;
		if (!persist) return;
		const text = await writeJsonConfig(
			this.options.path,
			this.persisted,
			this.options.schema,
		);
		try {
			this.lastMtime = (await stat(this.options.path)).mtimeMs;
			this.lastText = text;
		} catch {
			/* A subsequent reload resolves a post-write stat race. */
		}
	}
}
