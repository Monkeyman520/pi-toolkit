import { randomUUID } from "node:crypto";
import {
	mkdir,
	readFile,
	rename,
	stat,
	unlink,
	writeFile,
} from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { SourcedRule } from "./pipeline.ts";
import { compatibilityRules } from "./preset.ts";
import { type Config, type Point, validateConfig } from "./schema.ts";

export const CONFIG_FILE = "prompt-pipeline.json";
export interface LoadedConfig {
	rules: SourcedRule[];
	antigravityCompat: boolean;
	logging: "silent" | "error" | "info";
	export: { points: Point[]; directory: string };
	diagnostics: string[];
	globalPath: string;
	projectPath: string;
}
export async function readConfig(path: string): Promise<Config> {
	try {
		if ((await stat(path)).size > 1024 * 1024)
			throw new Error("Configuration too large");
		const text = await readFile(path, "utf8");
		if (Buffer.byteLength(text) > 1024 * 1024)
			throw new Error("Configuration too large");
		return validateConfig(JSON.parse(text));
	} catch (error) {
		if (error instanceof Error && "code" in error && error.code === "ENOENT")
			return {};
		throw error;
	}
}
export async function loadConfig(
	agentDir: string,
	cwd: string,
	trusted: boolean,
): Promise<LoadedConfig> {
	const result: LoadedConfig = {
		rules: [],
		antigravityCompat: false,
		logging: "error",
		export: { points: [], directory: join(agentDir, "prompt-exports") },
		diagnostics: [],
		globalPath: join(agentDir, CONFIG_FILE),
		projectPath: join(cwd, ".pi", CONFIG_FILE),
	};
	const rules = new Map<string, SourcedRule>();
	for (const path of [
		result.globalPath,
		...(trusted ? [result.projectPath] : []),
	]) {
		let layer: Config;
		try {
			layer = await readConfig(path);
		} catch {
			result.diagnostics.push(`Invalid or unreadable configuration: ${path}`);
			continue;
		}
		if (layer.logging !== undefined) result.logging = layer.logging;
		if (layer.antigravityCompat !== undefined)
			result.antigravityCompat = layer.antigravityCompat;
		if (layer.export?.points !== undefined)
			result.export.points = layer.export.points;
		if (layer.export?.directory !== undefined)
			result.export.directory = resolve(dirname(path), layer.export.directory);
		for (const rule of layer.rules ?? [])
			rules.set(rule.id, { ...rule, baseDir: dirname(path) });
	}
	const merged = new Map<string, SourcedRule>();
	if (result.antigravityCompat)
		for (const rule of compatibilityRules(agentDir)) merged.set(rule.id, rule);
	for (const rule of rules.values()) merged.set(rule.id, rule);
	result.rules = [...merged.values()];
	return result;
}
export async function saveConfig(path: string, value: unknown) {
	const config = validateConfig(value);
	const text = `${JSON.stringify(config, null, 2)}\n`;
	if (Buffer.byteLength(text) > 1024 * 1024)
		throw new Error("Configuration too large");
	await mkdir(dirname(path), { recursive: true, mode: 0o700 });
	const temp = `${path}.${randomUUID()}.tmp`;
	try {
		await writeFile(temp, text, {
			encoding: "utf8",
			flag: "wx",
			mode: 0o600,
		});
		await rename(temp, path);
	} catch (error) {
		await unlink(temp).catch(() => {});
		throw error;
	}
}
