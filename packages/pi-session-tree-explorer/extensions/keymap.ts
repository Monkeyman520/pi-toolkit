import { Key, matchesKey, parseKey } from "@earendil-works/pi-tui";
import { createActionRegistry } from "./actions.ts";
import type { ActionDefinition, InputMode, KeymapDiagnostic } from "./types.ts";

export interface KeyBindingMap {
	[actionId: string]: string[];
}
const namedKeys = new Set([
	"up",
	"down",
	"left",
	"right",
	"home",
	"end",
	"pageup",
	"pagedown",
	"insert",
	"delete",
	"clear",
	"backspace",
	"enter",
	"escape",
	"space",
	"tab",
]);
export function normalizeKey(key: string): string {
	const k = key.toLowerCase().trim().replace(/^<|>$/g, "");
	const aliases: Record<string, string> = {
		space: " ",
		enter: "\r",
		return: "\r",
		esc: "\u001b",
		escape: "\u001b",
		tab: "\t",
	};
	const modified = k.match(/^((?:(?:ctrl|alt|shift|super)\+)+)(.+)$/);
	if (modified) {
		const modifiers = modified[1].slice(0, -1).split("+").sort();
		const base =
			({ return: "enter", esc: "escape" } as Record<string, string>)[
				modified[2]
			] ?? modified[2];
		if (
			modifiers.length === 1 &&
			modifiers[0] === "shift" &&
			/^[a-z]$/.test(base)
		)
			return base.toUpperCase();
		return `${modifiers.join("+")}+${base}`;
	}
	return (
		aliases[k] ?? (namedKeys.has(k) || /^f(?:[1-9]|1[0-2])$/.test(k) ? k : key)
	);
}
function validModifier(key: string): boolean {
	const match = normalizeKey(key).match(
		/^((?:(?:ctrl|alt|shift|super)[+])+)(.+)$/,
	);
	if (!match) return false;
	const modifiers = match[1].slice(0, -1).split("+"),
		base = match[2];
	return (
		new Set(modifiers).size === modifiers.length &&
		(namedKeys.has(base) ||
			/^f(?:[1-9]|1[0-2])$/.test(base) ||
			/^[\x21-\x7e]$/.test(base))
	);
}
export function matchRawInput(data: string): string {
	for (const name of ["up", "down", "left", "right"] as const)
		if (matchesKey(data, Key[name])) return name;
	if (matchesKey(data, Key.escape)) return "\u001b";
	if (matchesKey(data, Key.tab)) return "\t";
	if (data === "\n" || data === "\r") return "\r";
	const controls: Record<string, string> = {
		"\u0004": "ctrl+d",
		"\u0015": "ctrl+u",
		"\u000e": "ctrl+n",
		"\u0010": "ctrl+p",
	};
	return (
		controls[data] ??
		(data.length !== 1 || data.charCodeAt(0) < 32
			? parseKey(data)
			: undefined) ??
		data
	);
}
function tokens(key: string): string[] {
	const normalized = normalizeKey(key);
	if (
		normalized.length === 1 ||
		namedKeys.has(normalized) ||
		/^f(?:[1-9]|1[0-2])$/.test(normalized) ||
		validModifier(normalized)
	)
		return [normalized];
	return [...normalized];
}
function keysFor(
	action: ActionDefinition | undefined,
	keys: string[],
	mode: InputMode,
): string[] {
	if (action && !action.modes.includes(mode)) return [];
	const isDefault =
		action && JSON.stringify(keys) === JSON.stringify(action.defaultKeys);
	return (isDefault ? action.modeKeys?.[mode] : undefined) ?? keys;
}
export function validateKeymap(
	bindings: Record<string, string[]>,
	registry = createActionRegistry(),
): KeymapDiagnostic[] {
	const diagnostics: KeymapDiagnostic[] = [];
	for (const [id, keys] of Object.entries(bindings)) {
		if (!registry.has(id))
			diagnostics.push({
				type: "invalid",
				actionId: id,
				keys: [],
				message: `Unknown Action '${id}'`,
			});
		if (
			!Array.isArray(keys) ||
			keys.some(
				(k) =>
					typeof k !== "string" ||
					!k.length ||
					(/\s/.test(k) && k !== " ") ||
					(k.length > 1 && !/^(<.*>|[A-Za-z+[\]{}?/!~^|_0-9-]+)$/.test(k)),
			)
		) {
			diagnostics.push({
				type: "invalid",
				actionId: id,
				keys: [],
				message: `Invalid keys for '${id}'`,
			});
		}
	}
	for (const mode of ["normal", "search", "preview", "help"] as const) {
		const assigned = new Map<string, string>();
		for (const [id, keys] of Object.entries(bindings)) {
			if (!Array.isArray(keys)) continue;
			for (const key of keysFor(registry.get(id), keys, mode)) {
				if (typeof key !== "string" || !key.length) continue;
				if (
					/^(ctrl|alt|shift|super)[+]/i.test(normalizeKey(key)) &&
					!validModifier(key)
				) {
					diagnostics.push({
						type: "invalid",
						actionId: id,
						keys: [key],
						message: `Invalid modifier key '${key}'`,
					});
					continue;
				}
				const norm = tokens(key).join("\0");
				const other = assigned.get(norm);
				if (other)
					diagnostics.push({
						type: "duplicate",
						actionId: id,
						keys: [key],
						message: `Key '${key}' conflicts between ${other} and ${id} in ${mode}`,
					});
				else assigned.set(norm, id);
			}
		}
		for (const [a, id] of assigned)
			for (const b of assigned.keys())
				if (b.startsWith(`${a}\0`))
					diagnostics.push({
						type: "conflict",
						actionId: id,
						keys: [a, b],
						message: `Ambiguous prefix '${a}' in ${mode}; waits for timeout`,
					});
	}
	return diagnostics;
}
export interface KeyResolverOptions {
	bindings: Record<string, string[]>;
	vimMode: boolean;
	timeoutMs?: number;
	registry?: Map<string, ActionDefinition>;
}
export type KeyResolveResult =
	| { type: "action"; actionId: string }
	| { type: "prefix" }
	| { type: "unmatched"; data: string }
	| { type: "text"; text: string };
export class KeyResolver {
	private bindings: Record<string, string[]>;
	private vimMode: boolean;
	private timeoutMs: number;
	private registry: Map<string, ActionDefinition>;
	private mode: InputMode = "normal";
	private buffer: string[] = [];
	private timer: NodeJS.Timeout | null = null;
	constructor(options: KeyResolverOptions) {
		this.bindings = options.bindings;
		this.vimMode = options.vimMode;
		this.timeoutMs = options.timeoutMs ?? 800;
		this.registry = options.registry ?? createActionRegistry();
	}
	public setVimMode(value: boolean) {
		if (value !== this.vimMode) this.reset();
		this.vimMode = value;
	}
	public setBindings(bindings: Record<string, string[]>) {
		this.reset();
		this.bindings = bindings;
	}
	public keysForAction(id: string, mode: InputMode): string[] {
		const action = this.registry.get(id);
		return keysFor(action, this.bindings[id] ?? [], mode).filter(
			(binding) =>
				!(
					!this.vimMode &&
					mode === "normal" &&
					action?.id.startsWith("node.") &&
					/^[a-zA-Z[\]]/.test(binding) &&
					!["up", "down", "left", "right", "tab"].includes(binding) &&
					action.defaultKeys.includes(binding)
				),
		);
	}
	public getBindings() {
		return this.bindings;
	}
	public reset() {
		this.buffer = [];
		if (this.timer) clearTimeout(this.timer);
		this.timer = null;
	}
	public setMode(mode: InputMode) {
		if (mode !== this.mode) this.reset();
		this.mode = mode;
	}
	public handleInput(
		raw: string,
		mode: InputMode,
		onTimeoutResolve?: (id: string) => void,
	): KeyResolveResult {
		this.setMode(mode);
		const key = normalizeKey(matchRawInput(raw)),
			assigned = new Map<string, string>(),
			prefixes = new Set<string>();
		for (const id of Object.keys(this.bindings)) {
			for (const binding of this.keysForAction(id, mode)) {
				const sequence = tokens(binding),
					norm = sequence.join("\0");
				// Conflicting bindings never resolve to an arbitrary last writer.
				assigned.set(norm, assigned.has(norm) ? "" : id);
				for (let i = 1; i < sequence.length; i++)
					prefixes.add(sequence.slice(0, i).join("\0"));
			}
		}
		let candidate = [...this.buffer, key].join("\0");
		if (!assigned.has(candidate) && !prefixes.has(candidate)) {
			this.reset();
			candidate = key;
		}
		if (prefixes.has(candidate)) {
			this.reset();
			this.buffer = candidate.split("\0");
			const id = assigned.get(candidate);
			this.timer = setTimeout(() => {
				this.reset();
				if (id && this.mode === mode) onTimeoutResolve?.(id);
			}, this.timeoutMs);
			return { type: "prefix" };
		}
		this.reset();
		const id = assigned.get(candidate);
		if (id) return { type: "action", actionId: id };
		if (mode === "search") {
			if (raw === "\b" || raw === "\x7f") return { type: "text", text: "\b" };
			if (
				raw.length > 0 &&
				[...raw].every((character) => {
					const code = character.charCodeAt(0);
					return code >= 32 && (code < 127 || code > 159);
				})
			)
				return { type: "text", text: raw };
		}
		return { type: "unmatched", data: raw };
	}
}
