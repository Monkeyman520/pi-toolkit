import { Key, matchesKey } from "@earendil-works/pi-tui";
import type { InputMode, KeymapDiagnostic } from "./types.ts";

export interface KeyBindingMap {
	[actionId: string]: string[];
}

export function normalizeKey(key: string): string {
	const k = key.toLowerCase().trim();
	if (k === "<space>" || k === "space") return " ";
	if (k === "<enter>" || k === "enter" || k === "return") return "\r";
	if (k === "<esc>" || k === "esc" || k === "escape") return "\u001b";
	if (k === "<tab>" || k === "tab") return "\t";
	if (k === "<up>" || k === "up") return "up";
	if (k === "<down>" || k === "down") return "down";
	if (k === "<left>" || k === "left") return "left";
	if (k === "<right>" || k === "right") return "right";
	return key;
}

export function matchRawInput(data: string): string {
	if (matchesKey(data, Key.up)) return "up";
	if (matchesKey(data, Key.down)) return "down";
	if (matchesKey(data, Key.left)) return "left";
	if (matchesKey(data, Key.right)) return "right";
	if (matchesKey(data, Key.escape)) return "\u001b";
	if (matchesKey(data, Key.tab) || data === "\t") return "\t";
	if (data === "\r" || data === "\n") return "\r";
	if (data === "\u0004") return "ctrl+d";
	if (data === "\u0015") return "ctrl+u";
	if (data === "\u000e") return "ctrl+n";
	if (data === "\u0010") return "ctrl+p";
	return data;
}

/**
 * Validate keymap bindings, detecting duplicates and conflicting prefixes.
 */
export function validateKeymap(
	bindings: Record<string, string[]>,
): KeymapDiagnostic[] {
	const diagnostics: KeymapDiagnostic[] = [];
	const keyToAction = new Map<string, string>();
	const allKeys: string[] = [];

	for (const [actionId, keys] of Object.entries(bindings)) {
		if (!Array.isArray(keys)) {
			diagnostics.push({
				type: "invalid",
				message: `Action ${actionId} keys must be an array of strings`,
				keys: [],
				actionId,
			});
			continue;
		}

		for (const key of keys) {
			if (typeof key !== "string" || key.length === 0) {
				diagnostics.push({
					type: "invalid",
					message: `Empty or invalid key for action ${actionId}`,
					keys: [String(key)],
					actionId,
				});
				continue;
			}

			const norm = normalizeKey(key);
			const existing = keyToAction.get(norm);
			if (existing) {
				diagnostics.push({
					type: "duplicate",
					message: `Key '${key}' is duplicated between ${existing} and ${actionId}`,
					keys: [key],
					actionId,
				});
			} else {
				keyToAction.set(norm, actionId);
				allKeys.push(norm);
			}
		}
	}

	// Check prefix conflicts (e.g. 'g' vs 'gg')
	for (const key1 of allKeys) {
		for (const key2 of allKeys) {
			if (key1 !== key2 && key2.startsWith(key1)) {
				diagnostics.push({
					type: "conflict",
					message: `Key '${key1}' for action ${keyToAction.get(key1)} is a prefix of '${key2}' for action ${keyToAction.get(key2)}`,
					keys: [key1, key2],
					actionId: keyToAction.get(key1),
				});
			}
		}
	}

	return diagnostics;
}

export interface KeyResolverOptions {
	bindings: Record<string, string[]>;
	vimMode: boolean;
	timeoutMs?: number;
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
	private buffer = "";
	private timer: NodeJS.Timeout | null = null;
	private actionByNormalizedKey = new Map<string, string>();
	private prefixes = new Set<string>();

	constructor(options: KeyResolverOptions) {
		this.bindings = options.bindings;
		this.vimMode = options.vimMode;
		this.timeoutMs = options.timeoutMs ?? 800;
		this.rebuildIndex();
	}

	public setVimMode(vimMode: boolean) {
		this.vimMode = vimMode;
	}

	public setBindings(bindings: Record<string, string[]>) {
		this.bindings = bindings;
		this.rebuildIndex();
	}

	public getBindings(): Record<string, string[]> {
		return this.bindings;
	}

	private rebuildIndex() {
		this.actionByNormalizedKey.clear();
		this.prefixes.clear();

		for (const [actionId, keys] of Object.entries(this.bindings)) {
			for (const k of keys) {
				const norm = normalizeKey(k);
				this.actionByNormalizedKey.set(norm, actionId);

				for (let i = 1; i < norm.length; i++) {
					this.prefixes.add(norm.slice(0, i));
				}
			}
		}
	}

	public reset() {
		this.buffer = "";
		if (this.timer) {
			clearTimeout(this.timer);
			this.timer = null;
		}
	}

	public handleInput(
		raw: string,
		mode: InputMode,
		onTimeoutResolve?: (actionId: string) => void,
	): KeyResolveResult {
		const key = matchRawInput(raw);

		// Special handling in Search Mode
		if (mode === "search") {
			if (key === "\u001b") {
				return { type: "action", actionId: "search.clear" };
			}
			if (key === "\r") {
				return { type: "action", actionId: "search.accept" };
			}
			if (key === "down" || key === "ctrl+n") {
				return { type: "action", actionId: "search.next" };
			}
			if (key === "up" || key === "ctrl+p") {
				return { type: "action", actionId: "search.prev" };
			}
			// Printable text including j/k
			if (raw.length === 1 && raw >= " " && raw !== "\u001b") {
				return { type: "text", text: raw };
			}
			if (raw === "\b" || raw === "\x7f" || raw === "\u0008") {
				return { type: "text", text: "\b" };
			}
			return { type: "unmatched", data: raw };
		}

		// Non-Vim Mode: only arrow keys, Enter, Space, Escape, 'q', and '?' are enabled
		if (!this.vimMode && mode === "normal") {
			if (key === "down") return { type: "action", actionId: "node.next" };
			if (key === "up") return { type: "action", actionId: "node.prev" };
			if (key === "left") return { type: "action", actionId: "node.parent" };
			if (key === "right")
				return { type: "action", actionId: "node.firstChild" };
			if (key === "\u001b" || key === "q")
				return { type: "action", actionId: "session.close" };
			if (key === "\r") return { type: "action", actionId: "fold.toggle" };
			if (key === " ") return { type: "action", actionId: "fold.toggle" };
			if (key === "?") return { type: "action", actionId: "view.help" };
			return { type: "unmatched", data: raw };
		}

		// Full sequence matching with buffer
		const candidate = this.buffer + key;

		// 1. If candidate is a prefix of longer sequences
		if (this.prefixes.has(candidate)) {
			// Check if candidate is ALSO a complete action (prefix-ambiguous)
			const exactAction = this.actionByNormalizedKey.get(candidate);
			this.buffer = candidate;

			if (this.timer) {
				clearTimeout(this.timer);
			}

			if (exactAction && onTimeoutResolve) {
				// Ambiguous prefix: wait for next key or timeout
				this.timer = setTimeout(() => {
					this.reset();
					onTimeoutResolve(exactAction);
				}, this.timeoutMs);
			} else {
				// Incomplete prefix: wait for next key or timeout to reset
				this.timer = setTimeout(() => {
					this.reset();
				}, this.timeoutMs);
			}

			return { type: "prefix" };
		}

		// 2. Exact match
		const actionId = this.actionByNormalizedKey.get(candidate);
		this.reset();

		if (actionId) {
			return { type: "action", actionId };
		}

		// 3. Fallback: single key exact match
		const singleAction = this.actionByNormalizedKey.get(key);
		if (singleAction) {
			return { type: "action", actionId: singleAction };
		}

		return { type: "unmatched", data: raw };
	}
}
