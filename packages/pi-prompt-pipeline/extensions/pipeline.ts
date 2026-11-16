import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { Action, Rule, Stage } from "./schema.ts";

export type SourcedRule = Rule & { baseDir: string };
export interface PromptPart {
	text: string;
	requestPath?: string;
}
export interface PipelineContext {
	provider: string;
	model: string;
	cwd: string;
	stage: Stage;
	customPrompt?: boolean;
	extensions: string[];
	options: unknown;
}
export function glob(pattern: string, value: string): boolean {
	const escaped = pattern
		.split("*")
		.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
		.join(".*");
	return new RegExp(`^${escaped}$`, "s").test(value.replaceAll("\\", "/"));
}
export function matches(rule: SourcedRule, ctx: PipelineContext): boolean {
	if (rule.enabled === false || rule.stage !== ctx.stage) return false;
	const w = rule.when;
	if (!w) return true;
	if (w.providers && !w.providers.some((p) => glob(p, ctx.provider)))
		return false;
	if (w.models && !w.models.some((p) => glob(p, ctx.model))) return false;
	if (w.customPrompt !== undefined && w.customPrompt !== ctx.customPrompt)
		return false;
	const ext = w.extensions;
	const observed = (p: string) =>
		ctx.extensions.some((v) => glob(p.replaceAll("\\", "/"), v));
	return (
		!ext ||
		((!ext.all || ext.all.every(observed)) &&
			(!ext.any || ext.any.some(observed)) &&
			!ext.none?.some(observed))
	);
}

interface Section {
	name: string;
	start: number;
	end: number;
	open: number;
}
function sections(text: string): Section[] {
	const result: Section[] = [];
	let outer: (Omit<Section, "end"> & { depth: number }) | undefined;
	// Only outer boundaries are structural. Other names inside a section are opaque prose.
	const tags = /<(\/?)([A-Za-z_][A-Za-z0-9_.:-]*)(?:\s+[^<>]*?)?\s*(\/?)>/g;
	for (const match of text.matchAll(tags)) {
		const [, closing, name, selfClosing] = match;
		if (outer) {
			if (name === outer.name) {
				if (closing) {
					outer.depth--;
					if (outer.depth === 0) {
						result.push({
							name: outer.name,
							open: outer.open,
							start: outer.start,
							end: match.index,
						});
						outer = undefined;
					}
				} else if (!selfClosing) outer.depth++;
			}
			continue;
		}
		if (closing) throw new Error("Unmatched outer prompt section");
		const start = match.index + match[0].length;
		if (selfClosing)
			result.push({ name, open: match.index, start, end: start });
		else outer = { name, open: match.index, start, depth: 1 };
	}
	if (outer) throw new Error("Unclosed outer prompt section");
	return result;
}
async function action(
	text: string,
	a: Action,
	rule: SourcedRule,
	ctx: PipelineContext,
	requestPath?: string,
): Promise<string> {
	switch (a.type) {
		case "literal":
			return a.firstOnly
				? text.replace(a.find, () => a.replace)
				: text.split(a.find).join(a.replace);
		case "regex":
			return text.replace(new RegExp(a.pattern, a.flags), a.replace);
		case "removeLines": {
			const regex = new RegExp(a.pattern, a.flags);
			return (text.match(/[^\r\n]*(?:\r\n|\n|\r|$)/g) ?? [])
				.filter((line) => {
					regex.lastIndex = 0;
					return !regex.test(line.replace(/(?:\r\n|\n|\r)$/, ""));
				})
				.join("");
		}
		case "prepend":
			return a.text + text;
		case "append":
			return text + a.text;
		case "file":
			return readFile(resolve(rule.baseDir, a.path), "utf8");
		case "script": {
			const path = resolve(rule.baseDir, a.path);
			if (extname(path) !== ".mjs")
				throw new Error("Scripts must be local .mjs modules");
			const module = await import(/* @vite-ignore */ pathToFileURL(path).href);
			if (typeof module.default !== "function")
				throw new Error("Script requires a default function");
			const value: unknown = await module.default(text, {
				provider: ctx.provider,
				model: ctx.model,
				cwd: ctx.cwd,
				stage: ctx.stage,
				ruleId: rule.id,
				requestPath,
				options: a.options ?? {},
			});
			if (typeof value !== "string")
				throw new Error("Script must return a string");
			return value;
		}
	}
}
async function transform(
	text: string,
	rule: SourcedRule,
	ctx: PipelineContext,
	path?: string,
) {
	for (const target of rule.targets) {
		// Validate the structure before any target, including intro/all, to ensure rule atomicity.
		const parsed = sections(text);
		let ranges: { start: number; end: number }[];
		if (target === "all") ranges = [{ start: 0, end: text.length }];
		else if (target === "intro")
			ranges = [{ start: 0, end: parsed[0]?.open ?? text.length }];
		else {
			const name =
				target === "doc"
					? "docs"
					: target === "skill"
						? "skills"
						: target.startsWith("tag:")
							? target.slice(4)
							: target;
			ranges = parsed.filter(
				(s) => s.name === name && !text.slice(s.open, s.start).endsWith("/>"),
			);
		}
		let output = "",
			offset = 0;
		for (const range of ranges) {
			let value = text.slice(range.start, range.end);
			for (const a of rule.actions)
				value = await action(value, a, rule, ctx, path);
			output += text.slice(offset, range.start) + value;
			offset = range.end;
		}
		text = output + text.slice(offset);
	}
	return text;
}
export async function runPipeline(
	parts: PromptPart[],
	rules: SourcedRule[],
	ctx: PipelineContext,
) {
	let current = parts.map((p) => ({ ...p }));
	const failures: string[] = [];
	for (const rule of rules) {
		if (!matches(rule, ctx)) continue;
		try {
			const next: PromptPart[] = [];
			for (const part of current)
				next.push({
					...part,
					text: await transform(part.text, rule, ctx, part.requestPath),
				});
			current = next;
		} catch {
			failures.push(rule.id);
		}
	}
	return { parts: current, failures };
}
