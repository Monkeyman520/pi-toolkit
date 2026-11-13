import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { readJsonConfig, writeJsonConfig } from "pi-plugin-support/config";
import { Check } from "typebox/value";
import {
	formatSchemaDiagnostics,
	getDefaultConfig,
	type PartialSessionTreeConfig,
	type SessionTreeConfig,
	SessionTreeConfigSchema,
} from "./config-schema.ts";
import { validateKeymap } from "./keymap.ts";

export const CONFIG_FILE_NAME = "session-tree.json";
const MAX_CONFIG_BYTES = 1024 * 1024;
export interface ConfigDiagnostic {
	layer: "global" | "project" | "runtime";
	path?: string;
	message: string;
	details?: string[];
}
export interface LoadParams {
	agentDir?: string;
	cwd: string;
	isProjectTrusted: boolean;
	runtimeOverrides?: PartialSessionTreeConfig;
}
export function deepMergeConfig<T>(base: T, override: unknown): T {
	if (
		!base ||
		typeof base !== "object" ||
		!override ||
		typeof override !== "object"
	)
		return (override === undefined ? base : override) as T;
	const result: Record<string, unknown> = {
		...(base as Record<string, unknown>),
	};
	for (const [key, val] of Object.entries(override)) {
		if (["__proto__", "constructor", "prototype"].includes(key))
			throw new Error("Unsafe configuration key");
		if (val === undefined) continue;
		if (Array.isArray(val)) result[key] = [...val];
		else if (
			val &&
			typeof val === "object" &&
			result[key] &&
			typeof result[key] === "object" &&
			!Array.isArray(result[key])
		)
			result[key] = deepMergeConfig(result[key], val);
		else result[key] = val;
	}
	return result as T;
}
function validate(config: unknown): void {
	if (!Check(SessionTreeConfigSchema, config))
		throw new Error(
			formatSchemaDiagnostics(config).join("; ") || "Invalid configuration",
		);
	const effective = deepMergeConfig(getDefaultConfig(), config);
	const errors = validateKeymap(effective.keybindings).filter(
		(d) => d.type !== "conflict",
	);
	if (errors.length) throw new Error(errors.map((d) => d.message).join("; "));
}
export class ConfigManager {
	private currentConfig = getDefaultConfig();
	private globalLayer: PartialSessionTreeConfig = {};
	private projectLayer: PartialSessionTreeConfig = {};
	private runtimeLayer: PartialSessionTreeConfig = {};
	private diagnostics: ConfigDiagnostic[] = [];
	private globalConfigPath = "";
	private projectConfigPath = "";
	private lastLoadedParams?: LoadParams;
	private queue: Promise<unknown> = Promise.resolve();
	constructor(initial?: PartialSessionTreeConfig) {
		if (initial) {
			validate(initial);
			this.runtimeLayer = structuredClone(initial);
			this.currentConfig = deepMergeConfig(this.currentConfig, initial);
		}
	}
	private serialized<T>(work: () => Promise<T>): Promise<T> {
		const result = this.queue.then(work);
		this.queue = result.catch(() => {});
		return result;
	}
	public getConfig(): SessionTreeConfig {
		return structuredClone(this.currentConfig);
	}
	public getDiagnostics(): ConfigDiagnostic[] {
		return structuredClone(this.diagnostics);
	}
	public getGlobalPath() {
		return this.globalConfigPath;
	}
	public getProjectPath() {
		return this.projectConfigPath;
	}
	private async candidate(params: LoadParams) {
		const globalPath = join(params.agentDir ?? getAgentDir(), CONFIG_FILE_NAME),
			projectPath = join(params.cwd, ".pi", CONFIG_FILE_NAME);
		const diagnostics: ConfigDiagnostic[] = [];
		let config = getDefaultConfig();
		const read = async (
			path: string,
			layer: "global" | "project",
		): Promise<PartialSessionTreeConfig> => {
			const read = await readJsonConfig(
				path,
				SessionTreeConfigSchema,
				MAX_CONFIG_BYTES,
			);
			if (read.kind === "missing") return {};
			if (read.kind !== "valid") {
				diagnostics.push({
					layer,
					path,
					message: String(read.error),
					details:
						"text" in read && read.text
							? (() => {
									try {
										return formatSchemaDiagnostics(JSON.parse(read.text));
									} catch {
										return [];
									}
								})()
							: [],
				});
				return {};
			}
			try {
				const candidate = deepMergeConfig(config, read.data);
				validate(candidate);
				config = candidate;
				return read.data as PartialSessionTreeConfig;
			} catch (error) {
				diagnostics.push({ layer, path, message: String(error) });
				return {};
			}
		};
		const global = await read(globalPath, "global");
		const project = params.isProjectTrusted
			? await read(projectPath, "project")
			: {};
		let runtime: PartialSessionTreeConfig = structuredClone(
			params.runtimeOverrides ?? {},
		);
		try {
			const candidate = deepMergeConfig(config, runtime);
			validate(candidate);
			config = candidate;
		} catch (error) {
			diagnostics.push({ layer: "runtime", message: String(error) });
			runtime = {};
		}
		return {
			config,
			global,
			project,
			runtime,
			diagnostics,
			globalPath,
			projectPath,
		};
	}
	private publish(next: Awaited<ReturnType<ConfigManager["candidate"]>>) {
		this.currentConfig = next.config;
		this.globalLayer = next.global;
		this.projectLayer = next.project;
		this.runtimeLayer = next.runtime;
		this.globalConfigPath = next.globalPath;
		this.projectConfigPath = next.projectPath;
		this.diagnostics = next.diagnostics;
	}
	public async ensureLoaded(params: LoadParams) {
		if (
			!this.lastLoadedParams ||
			params.cwd !== this.lastLoadedParams.cwd ||
			params.isProjectTrusted !== this.lastLoadedParams.isProjectTrusted ||
			params.agentDir !== this.lastLoadedParams.agentDir
		)
			return this.loadLayers(params);
		return { config: this.getConfig(), diagnostics: this.getDiagnostics() };
	}
	public loadLayers(
		params: LoadParams,
	): Promise<{ config: SessionTreeConfig; diagnostics: ConfigDiagnostic[] }> {
		return this.serialized(async () => {
			const next = await this.candidate(params);
			this.publish(next);
			this.lastLoadedParams = structuredClone(params);
			return { config: this.getConfig(), diagnostics: this.getDiagnostics() };
		});
	}
	public reload(): Promise<{
		success: boolean;
		config: SessionTreeConfig;
		error?: string;
		diagnostics: ConfigDiagnostic[];
	}> {
		return this.serialized(async () => {
			if (!this.lastLoadedParams)
				return { success: true, config: this.getConfig(), diagnostics: [] };
			const next = await this.candidate(this.lastLoadedParams);
			if (next.diagnostics.length) {
				this.diagnostics = next.diagnostics;
				return {
					success: false,
					config: this.getConfig(),
					error: next.diagnostics.map((d) => d.message).join("; "),
					diagnostics: this.getDiagnostics(),
				};
			}
			this.publish(next);
			return { success: true, config: this.getConfig(), diagnostics: [] };
		});
	}
	public updateSetting(
		pathKey: string,
		val: unknown,
	): Promise<SessionTreeConfig> {
		return this.serialized(async () => {
			const parts = pathKey.split(".");
			if (
				parts.some(
					(p) => !p || ["__proto__", "constructor", "prototype"].includes(p),
				)
			)
				throw new Error("Invalid setting path");
			const partial: Record<string, unknown> = {};
			let cur = partial;
			for (const part of parts.slice(0, -1)) {
				const nested = {};
				cur[part] = nested;
				cur = nested;
			}
			cur[parts[parts.length - 1]] = val;
			const global = deepMergeConfig(this.globalLayer, partial);
			validate(global);
			const config = deepMergeConfig(
				deepMergeConfig(
					deepMergeConfig(getDefaultConfig(), global),
					this.projectLayer,
				),
				this.runtimeLayer,
			);
			validate(config);
			if (this.globalConfigPath)
				await writeJsonConfig(
					this.globalConfigPath,
					global,
					SessionTreeConfigSchema,
				);
			this.globalLayer = structuredClone(global);
			this.currentConfig = config;
			this.diagnostics = [];
			return this.getConfig();
		});
	}
}
