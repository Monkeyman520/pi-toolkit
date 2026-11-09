import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { writeJsonConfig } from "pi-plugin-support/config";
import { Check } from "typebox/value";
import {
	formatSchemaDiagnostics,
	getDefaultConfig,
	type PartialSessionTreeConfig,
	type SessionTreeConfig,
	SessionTreeConfigSchema,
} from "./config-schema.ts";

export const CONFIG_FILE_NAME = "session-tree.json";
const MAX_CONFIG_BYTES = 1024 * 1024; // 1MB

export interface ConfigDiagnostic {
	layer: "global" | "project" | "runtime";
	path?: string;
	message: string;
	details?: string[];
}

export function deepMergeConfig<T>(base: T, override: unknown): T {
	if (
		!base ||
		typeof base !== "object" ||
		!override ||
		typeof override !== "object"
	) {
		return ((override !== undefined ? override : base) ?? {}) as T;
	}

	const result: Record<string, unknown> = {
		...(base as Record<string, unknown>),
	};

	for (const [key, val] of Object.entries(
		override as Record<string, unknown>,
	)) {
		if (val === undefined) continue;

		if (Array.isArray(val)) {
			// Arrays replace wholesale per Spec R13
			result[key] = [...val];
		} else if (
			val !== null &&
			typeof val === "object" &&
			result[key] !== null &&
			typeof result[key] === "object" &&
			!Array.isArray(result[key])
		) {
			result[key] = deepMergeConfig(result[key], val);
		} else {
			result[key] = val;
		}
	}

	return result as T;
}

export class ConfigManager {
	private currentConfig: SessionTreeConfig;
	private lastValidConfig: SessionTreeConfig;
	private diagnostics: ConfigDiagnostic[] = [];
	private globalConfigPath: string;
	private projectConfigPath: string;
	private lastLoadedParams?: {
		agentDir?: string;
		cwd: string;
		isProjectTrusted: boolean;
		runtimeOverrides?: PartialSessionTreeConfig;
	};

	constructor(initial?: PartialSessionTreeConfig) {
		this.currentConfig = getDefaultConfig();
		if (initial) {
			this.currentConfig = deepMergeConfig(
				this.currentConfig,
				initial as Record<string, unknown>,
			);
		}
		this.lastValidConfig = JSON.parse(JSON.stringify(this.currentConfig));
		this.globalConfigPath = "";
		this.projectConfigPath = "";
	}

	public getConfig(): SessionTreeConfig {
		return this.currentConfig;
	}

	public getDiagnostics(): ConfigDiagnostic[] {
		return [...this.diagnostics];
	}

	public getGlobalPath(): string {
		return this.globalConfigPath;
	}

	public getProjectPath(): string {
		return this.projectConfigPath;
	}

	private async readLayer(
		path: string,
		layerName: "global" | "project",
	): Promise<PartialSessionTreeConfig | null> {
		try {
			const text = await readFile(path, "utf8");
			if (Buffer.byteLength(text) > MAX_CONFIG_BYTES) {
				this.diagnostics.push({
					layer: layerName,
					path,
					message: "Configuration file exceeds maximum size (1MB)",
				});
				return null;
			}

			let data: unknown;
			try {
				data = JSON.parse(text);
			} catch (parseErr) {
				this.diagnostics.push({
					layer: layerName,
					path,
					message: `Malformed JSON syntax: ${(parseErr as Error).message}`,
				});
				return null;
			}

			if (typeof data !== "object" || data === null || Array.isArray(data)) {
				this.diagnostics.push({
					layer: layerName,
					path,
					message: "Configuration root must be an object",
				});
				return null;
			}

			if (!Check(SessionTreeConfigSchema, data)) {
				const details = formatSchemaDiagnostics(data);
				this.diagnostics.push({
					layer: layerName,
					path,
					message: "Configuration validation failed against schema",
					details,
				});
				return null;
			}

			return data as PartialSessionTreeConfig;
		} catch (err) {
			if (
				err instanceof Error &&
				"code" in err &&
				(err as { code: string }).code === "ENOENT"
			) {
				// Missing file is normal
				return null;
			}
			this.diagnostics.push({
				layer: layerName,
				path,
				message: `Failed to read file: ${(err as Error).message}`,
			});
			return null;
		}
	}

	public async loadLayers(params: {
		agentDir?: string;
		cwd: string;
		isProjectTrusted: boolean;
		runtimeOverrides?: PartialSessionTreeConfig;
	}): Promise<{ config: SessionTreeConfig; diagnostics: ConfigDiagnostic[] }> {
		this.lastLoadedParams = params;
		this.diagnostics = [];

		const agentDir = params.agentDir ?? getAgentDir();
		this.globalConfigPath = join(agentDir, CONFIG_FILE_NAME);
		this.projectConfigPath = join(params.cwd, ".pi", CONFIG_FILE_NAME);

		// 1. Built-in defaults
		let merged = getDefaultConfig();

		// 2. Global session-tree.json
		const globalLayer = await this.readLayer(this.globalConfigPath, "global");
		if (globalLayer) {
			merged = deepMergeConfig(merged, globalLayer as Record<string, unknown>);
		}

		// 3. Project-level .pi/session-tree.json (only if project is trusted!)
		if (params.isProjectTrusted) {
			const projectLayer = await this.readLayer(
				this.projectConfigPath,
				"project",
			);
			if (projectLayer) {
				merged = deepMergeConfig(
					merged,
					projectLayer as Record<string, unknown>,
				);
			}
		}

		// 4. Runtime overrides (highest precedence)
		if (params.runtimeOverrides) {
			merged = deepMergeConfig(
				merged,
				params.runtimeOverrides as Record<string, unknown>,
			);
		}

		this.currentConfig = merged;
		if (this.diagnostics.length === 0) {
			this.lastValidConfig = JSON.parse(JSON.stringify(merged));
		}

		return {
			config: this.currentConfig,
			diagnostics: [...this.diagnostics],
		};
	}

	public async reload(): Promise<{
		success: boolean;
		config: SessionTreeConfig;
		error?: string;
		diagnostics: ConfigDiagnostic[];
	}> {
		if (!this.lastLoadedParams) {
			return {
				success: true,
				config: this.currentConfig,
				diagnostics: [],
			};
		}

		const savedValidConfig = JSON.parse(JSON.stringify(this.lastValidConfig));
		const result = await this.loadLayers(this.lastLoadedParams);

		// If diagnostics indicate an invalid layer during reload
		if (result.diagnostics.length > 0) {
			// Per Spec R13: a failed reload retains the last valid effective configuration
			this.currentConfig = savedValidConfig;
			this.lastValidConfig = savedValidConfig;
			return {
				success: false,
				config: this.currentConfig,
				error: result.diagnostics.map((e) => e.message).join("; "),
				diagnostics: result.diagnostics,
			};
		}

		return {
			success: true,
			config: this.currentConfig,
			diagnostics: result.diagnostics,
		};
	}

	public async updateSetting(
		pathKey: string,
		val: unknown,
	): Promise<SessionTreeConfig> {
		const parts = pathKey.split(".");
		const partial: Record<string, unknown> = {};
		let cur = partial;

		for (let i = 0; i < parts.length - 1; i++) {
			cur[parts[i]] = {};
			cur = cur[parts[i]] as Record<string, unknown>;
		}
		cur[parts[parts.length - 1]] = val;

		// Merge into current
		this.currentConfig = deepMergeConfig(this.currentConfig, partial);
		this.lastValidConfig = JSON.parse(JSON.stringify(this.currentConfig));

		// Persist to global config path
		if (this.globalConfigPath) {
			await writeJsonConfig(
				this.globalConfigPath,
				this.currentConfig,
				SessionTreeConfigSchema,
			);
		}

		return this.currentConfig;
	}
}
