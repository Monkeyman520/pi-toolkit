import type { AutocompleteItem } from "@earendil-works/pi-tui";
import { settingCandidates } from "pi-plugin-support/settings";
import { configOptions, settingsSchema } from "./config.ts";
import {
	defaults,
	type OnErrorPolicy,
	parseDelayInputMs,
	parsePositiveDurationMs,
	parseUntilMs,
	type QueueEmptyPolicy,
	type SessionOverrides,
	type Settings,
} from "./loop.ts";

export type AutoContinueCommand =
	| { kind: "default" }
	| { kind: "start"; overrides: SessionOverrides }
	| { kind: "stop" }
	| { kind: "status" }
	| { kind: "queue"; sub: "list" }
	| { kind: "queue"; sub: "add"; text?: string }
	| { kind: "queue"; sub: "prepend"; text: string }
	| { kind: "queue"; sub: "remove"; index: number }
	| { kind: "queue"; sub: "move"; from: number; to: number }
	| { kind: "queue"; sub: "clear" }
	| { kind: "queue"; sub: "import"; filePath: string }
	| { kind: "queue"; sub: "send"; index: number }
	| { kind: "queue"; sub: "steer"; index: number }
	| { kind: "config"; reload?: boolean; key?: string; value?: string }
	| { kind: "help" }
	| { kind: "error"; error: string };

export const autoContinueUsage = [
	"Usage: /auto-continue [start [options] | stop | queue <subcommand> | status | config [reload | <key> [value]] | help]",
	"  start options: --rounds/-r <N> --delay/-d <ms|spec> --duration <spec> --until <timestamp> --on-error defer|wait-quota|stop --queue-empty stop|continue --prompt <text> --prompt-file <path> --prompt-pipe <cmd> --format <prefix> <suffix> --stop-file <path> --stop-cmd <cmd>",
	"  queue subcommands: list | add [text] | prepend <text> | remove <idx> | move <from> <to> | clear | import <file> | send [idx] | steer [idx]",
].join("\n");

const actionDefinitions: ReadonlyArray<{
	action: string;
	description: string;
}> = [
	{
		action: "start",
		description:
			"Arm auto-continue for this session (optional session-only flag overrides)",
	},
	{
		action: "stop",
		description: "Cancel pending waits/commands and disarm (preserves queue)",
	},
	{
		action: "queue",
		description: "Manage or immediately send/steer continuation queue items",
	},
	{
		action: "status",
		description: "Show armed state, countdown, queue, prompt mode, and hooks",
	},
	{
		action: "config",
		description:
			"Open TUI settings panel, reload config, or view/update defaults",
	},
	{ action: "help", description: "Show /auto-continue command usage" },
];

const startFlags: ReadonlyArray<{
	flag: string;
	description: string;
	values?: readonly string[];
}> = [
	{
		flag: "--rounds",
		description: "Maximum automatic rounds (0 = unlimited)",
		values: ["0", "3", "5", "10", "20"],
	},
	{
		flag: "--delay",
		description: "Buffer delay before continuing (ms or duration like 5s)",
		values: ["1s", "5s", "15s", "30s", "60s"],
	},
	{
		flag: "--duration",
		description: "Session-only stop deadline relative to now (e.g. 30m, 2h)",
		values: ["15m", "30m", "1h", "2h", "4h"],
	},
	{
		flag: "--until",
		description:
			"Session-only stop cutoff timestamp (ISO-8601 or YYYY-MM-DD HH:MM:SS)",
	},
	{
		flag: "--on-error",
		description: "Behavior on assistant error turn",
		values: ["defer", "wait-quota", "stop"],
	},
	{
		flag: "--queue-empty",
		description: "Behavior after continuation queue drains",
		values: ["stop", "continue"],
	},
	{ flag: "--prompt", description: "Session-only direct prompt template" },
	{
		flag: "--prompt-file",
		description: "Session-only dynamic UTF-8 prompt file",
	},
	{
		flag: "--prompt-pipe",
		description: "Session-only one-shot prompt pipe command",
	},
	{
		flag: "--format",
		description: "Two tokens: <prefix> <suffix> for last-match pipe extraction",
	},
	{ flag: "--stop-file", description: "Session-only sentinel file path" },
	{ flag: "--stop-cmd", description: "Session-only one-shot StopHook command" },
];

const queueSubcommands: ReadonlyArray<{
	sub: string;
	description: string;
}> = [
	{
		sub: "add",
		description:
			"Append item to queue tail (no text opens TUI multiline editor)",
	},
	{ sub: "prepend", description: "Insert item at queue head (position 1)" },
	{ sub: "list", description: "Show numbered queued items" },
	{ sub: "remove", description: "Remove queued item by 1-based index" },
	{ sub: "move", description: "Reorder queued item: move <from> <to>" },
	{ sub: "clear", description: "Empty all queued items" },
	{
		sub: "import",
		description: "Import queued prompts from a local UTF-8 file",
	},
	{
		sub: "send",
		description: "Send item now (idle: immediate; busy: followUp; default #1)",
	},
	{
		sub: "steer",
		description:
			"Steer running agent with item (busy: steer; idle: immediate; default #1)",
	},
];

export function tokenizeArgs(
	input: string,
): { ok: true; tokens: string[] } | { ok: false; error: string } {
	const tokens: string[] = [];
	let current = "";
	let inToken = false;
	let quote: '"' | "'" | undefined;

	for (let i = 0; i < input.length; i++) {
		const ch = input[i];
		if (quote === "'") {
			if (ch === "'") {
				quote = undefined;
			} else {
				current += ch;
			}
			continue;
		}
		if (quote === '"') {
			if (ch === "\\" && input[i + 1] === '"') {
				current += '"';
				i++;
			} else if (ch === '"') {
				quote = undefined;
			} else {
				current += ch;
			}
			continue;
		}
		if (ch === '"' || ch === "'") {
			quote = ch;
			inToken = true;
			continue;
		}
		if (/\s/.test(ch)) {
			if (inToken) {
				tokens.push(current);
				current = "";
				inToken = false;
			}
			continue;
		}
		current += ch;
		inToken = true;
	}

	if (quote) {
		return { ok: false, error: `Unclosed ${quote} quote in arguments.` };
	}
	if (inToken) {
		tokens.push(current);
	}
	return { ok: true, tokens };
}

function parsePositiveInt(raw: string | undefined): number | undefined {
	if (!raw || !/^\d+$/.test(raw.trim())) return undefined;
	const n = Number.parseInt(raw.trim(), 10);
	return Number.isSafeInteger(n) && n >= 1 ? n : undefined;
}

function unquoteSingleToken(raw: string): string {
	const trimmed = raw.trim();
	if (
		trimmed.length >= 2 &&
		((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
			(trimmed.startsWith("'") && trimmed.endsWith("'")))
	) {
		return trimmed.slice(1, -1);
	}
	return trimmed;
}

function parseStartCommand(rest: string, now: number): AutoContinueCommand {
	if (!rest.trim()) {
		return { kind: "start", overrides: {} };
	}
	const tokenized = tokenizeArgs(rest);
	if (!tokenized.ok) {
		return { kind: "error", error: tokenized.error };
	}
	const tokens = tokenized.tokens;
	const overrides: SessionOverrides = {};
	let hasDuration = false;
	let hasUntil = false;

	const needValue = (idx: number): string | undefined => {
		if (idx >= tokens.length) return undefined;
		return tokens[idx];
	};

	for (let i = 0; i < tokens.length; i++) {
		const flag = tokens[i];
		if (flag === "--rounds" || flag === "-r") {
			const val = needValue(++i);
			if (val === undefined || !/^\d+$/.test(val)) {
				return {
					kind: "error",
					error: `Invalid value for ${flag}: expected integer 0..1000.`,
				};
			}
			const n = Number.parseInt(val, 10);
			if (n < 0 || n > 1000) {
				return {
					kind: "error",
					error: `Value ${n} for ${flag} is out of range (0..1000).`,
				};
			}
			overrides.maxRounds = n;
			continue;
		}
		if (flag === "--delay" || flag === "-d") {
			const val = needValue(++i);
			const ms = val !== undefined ? parseDelayInputMs(val) : undefined;
			if (ms === undefined || ms < 100 || ms > 86400000) {
				return {
					kind: "error",
					error: `Invalid value for ${flag}: expected 100..86400000 ms or duration (e.g. 5s, 15s).`,
				};
			}
			overrides.delayMs = ms;
			continue;
		}
		if (flag === "--duration") {
			const val = needValue(++i);
			const ms = val !== undefined ? parsePositiveDurationMs(val) : undefined;
			if (ms === undefined) {
				return {
					kind: "error",
					error: `Invalid duration "${val ?? ""}". Expected positive duration like 30m, 2h, or 1h30m.`,
				};
			}
			if (hasUntil) {
				return {
					kind: "error",
					error: "Cannot combine --duration and --until.",
				};
			}
			hasDuration = true;
			overrides.deadlineMs = now + ms;
			continue;
		}
		if (flag === "--until") {
			const val = needValue(++i);
			const until = val !== undefined ? parseUntilMs(val) : undefined;
			if (until === undefined || until <= now) {
				return {
					kind: "error",
					error: `Invalid or past timestamp "${val ?? ""}". Expected future ISO-8601 or YYYY-MM-DD HH:MM:SS.`,
				};
			}
			if (hasDuration) {
				return {
					kind: "error",
					error: "Cannot combine --duration and --until.",
				};
			}
			hasUntil = true;
			overrides.deadlineMs = until;
			continue;
		}
		if (flag === "--on-error") {
			const val = needValue(++i)?.toLowerCase();
			if (val !== "defer" && val !== "wait-quota" && val !== "stop") {
				return {
					kind: "error",
					error: `Invalid --on-error value "${val ?? ""}". Expected defer, wait-quota, or stop.`,
				};
			}
			overrides.onError = val as OnErrorPolicy;
			continue;
		}
		if (flag === "--queue-empty") {
			const val = needValue(++i)?.toLowerCase();
			if (val !== "stop" && val !== "continue") {
				return {
					kind: "error",
					error: `Invalid --queue-empty value "${val ?? ""}". Expected stop or continue.`,
				};
			}
			overrides.queueEmptyPolicy = val as QueueEmptyPolicy;
			continue;
		}
		if (flag === "--prompt") {
			const val = needValue(++i);
			if (!val?.trim()) {
				return { kind: "error", error: "--prompt requires non-empty text." };
			}
			overrides.prompt = val;
			continue;
		}
		if (flag === "--prompt-file") {
			const val = needValue(++i);
			if (!val?.trim()) {
				return {
					kind: "error",
					error: "--prompt-file requires a file path.",
				};
			}
			overrides.promptFile = val.trim();
			continue;
		}
		if (flag === "--prompt-pipe") {
			const val = needValue(++i);
			if (!val?.trim()) {
				return {
					kind: "error",
					error: "--prompt-pipe requires a command string.",
				};
			}
			overrides.promptPipe = val.trim();
			continue;
		}
		if (flag === "--format") {
			const prefix = needValue(++i);
			const suffix = needValue(++i);
			if (!prefix?.trim() || !suffix?.trim()) {
				return {
					kind: "error",
					error: "--format requires two non-empty tokens: <prefix> <suffix>.",
				};
			}
			overrides.pipeFormatPrefix = prefix.trim();
			overrides.pipeFormatSuffix = suffix.trim();
			continue;
		}
		if (flag === "--stop-file") {
			const val = needValue(++i);
			if (!val?.trim()) {
				return { kind: "error", error: "--stop-file requires a file path." };
			}
			overrides.stopFile = val.trim();
			continue;
		}
		if (flag === "--stop-cmd") {
			const val = needValue(++i);
			if (!val?.trim()) {
				return {
					kind: "error",
					error: "--stop-cmd requires a command string.",
				};
			}
			overrides.stopCommand = val.trim();
			continue;
		}

		return {
			kind: "error",
			error: `Unknown /auto-continue start option "${flag}". Run /auto-continue help for usage.`,
		};
	}

	return { kind: "start", overrides };
}

function parseQueueCommand(rest: string): AutoContinueCommand {
	const trimmed = rest.trim();
	if (!trimmed) {
		return { kind: "queue", sub: "list" };
	}
	const firstSpace = trimmed.search(/\s/);
	const sub = (
		firstSpace < 0 ? trimmed : trimmed.slice(0, firstSpace)
	).toLowerCase();
	const subRest = firstSpace < 0 ? "" : trimmed.slice(firstSpace + 1).trim();

	if (sub === "list" || sub === "ls" || sub === "show") {
		if (subRest) {
			return { kind: "error", error: "Usage: /auto-continue queue list" };
		}
		return { kind: "queue", sub: "list" };
	}
	if (sub === "add" || sub === "push") {
		return { kind: "queue", sub: "add", text: subRest || undefined };
	}
	if (sub === "prepend" || sub === "unshift") {
		if (!subRest) {
			return {
				kind: "error",
				error: "Usage: /auto-continue queue prepend <text>",
			};
		}
		return { kind: "queue", sub: "prepend", text: subRest };
	}
	if (sub === "remove" || sub === "rm" || sub === "del") {
		const idx = parsePositiveInt(subRest);
		if (idx === undefined) {
			return {
				kind: "error",
				error: "Usage: /auto-continue queue remove <index> (1-based integer)",
			};
		}
		return { kind: "queue", sub: "remove", index: idx };
	}
	if (sub === "move" || sub === "mv") {
		const parts = subRest.split(/\s+/).filter(Boolean);
		const from = parts.length === 2 ? parsePositiveInt(parts[0]) : undefined;
		const to = parts.length === 2 ? parsePositiveInt(parts[1]) : undefined;
		if (from === undefined || to === undefined) {
			return {
				kind: "error",
				error:
					"Usage: /auto-continue queue move <from> <to> (1-based integers)",
			};
		}
		return { kind: "queue", sub: "move", from, to };
	}
	if (sub === "clear") {
		if (subRest) {
			return { kind: "error", error: "Usage: /auto-continue queue clear" };
		}
		return { kind: "queue", sub: "clear" };
	}
	if (sub === "import") {
		if (!subRest) {
			return {
				kind: "error",
				error: "Usage: /auto-continue queue import <file>",
			};
		}
		return {
			kind: "queue",
			sub: "import",
			filePath: unquoteSingleToken(subRest),
		};
	}
	if (sub === "send" || sub === "steer") {
		if (!subRest) {
			return { kind: "queue", sub, index: 1 };
		}
		const idx = parsePositiveInt(subRest);
		if (idx === undefined) {
			return {
				kind: "error",
				error: `Usage: /auto-continue queue ${sub} [index] (1-based integer, default 1)`,
			};
		}
		return { kind: "queue", sub, index: idx };
	}

	return {
		kind: "error",
		error: `Unknown queue subcommand "${sub}". Valid: list, add, prepend, remove, move, clear, import, send, steer.`,
	};
}

export function parseAutoContinueArgs(
	args: string,
	now = Date.now(),
): AutoContinueCommand {
	if (args.length > 16384) {
		return { kind: "error", error: "Command arguments exceed maximum length." };
	}
	const trimmed = args.trim();
	if (!trimmed) return { kind: "default" };

	const firstSpace = trimmed.search(/\s/);
	const action = (
		firstSpace < 0 ? trimmed : trimmed.slice(0, firstSpace)
	).toLowerCase();
	const rest = firstSpace < 0 ? "" : trimmed.slice(firstSpace + 1).trim();

	if (action === "help" || action === "-h" || action === "--help") {
		return { kind: "help" };
	}
	if (action === "status" || action === "info" || action === "show") {
		return rest ? { kind: "help" } : { kind: "status" };
	}
	if (action === "stop" || action === "disarm") {
		return rest ? { kind: "help" } : { kind: "stop" };
	}
	if (action === "start" || action === "arm") {
		return parseStartCommand(rest, now);
	}
	if (action === "queue" || action === "q") {
		return parseQueueCommand(rest);
	}
	if (action === "config" || action === "cfg" || action === "set") {
		if (!rest) {
			return { kind: "config" };
		}
		const keySpace = rest.search(/\s/);
		const keyArg = keySpace < 0 ? rest : rest.slice(0, keySpace);
		const valArg = keySpace < 0 ? "" : rest.slice(keySpace + 1).trim();
		if (keyArg.toLowerCase() === "reload" && !valArg) {
			return { kind: "config", reload: true };
		}
		if (!valArg) {
			return { kind: "config", key: keyArg };
		}
		return { kind: "config", key: keyArg, value: valArg };
	}

	return { kind: "help" };
}

export function getAutoContinueCompletions(
	argumentPrefix: string,
	settings: Settings = defaults,
): AutocompleteItem[] | null {
	const trimmedStart = argumentPrefix.trimStart();
	const endsWithSpace = /\s$/.test(argumentPrefix);
	const parts = trimmedStart ? trimmedStart.split(/\s+/).filter(Boolean) : [];

	if (parts.length === 0 || (parts.length === 1 && !endsWithSpace)) {
		const partial = (parts[0] ?? "").toLowerCase();
		const matches = actionDefinitions
			.filter((item) => item.action.startsWith(partial))
			.map((item) => ({
				value: item.action,
				label: item.action,
				description: item.description,
			}));
		return matches.length > 0 ? matches : null;
	}

	const actionToken = parts[0] ?? "";
	const action = actionToken.toLowerCase();
	const tokenIndex = endsWithSpace ? parts.length : parts.length - 1;
	const partial = endsWithSpace ? "" : (parts[parts.length - 1] ?? "");
	const lowerPartial = partial.toLowerCase();

	if (action === "start" || action === "arm") {
		const priorTokens = endsWithSpace ? parts : parts.slice(0, -1);
		const prefixHead = priorTokens.join(" ");
		const prev = priorTokens[priorTokens.length - 1]?.toLowerCase() ?? "";

		const flagByPrev =
			prev === "-r"
				? startFlags.find((f) => f.flag === "--rounds")
				: prev === "-d"
					? startFlags.find((f) => f.flag === "--delay")
					: startFlags.find((f) => f.flag === prev);

		if (flagByPrev?.values && flagByPrev.values.length > 0) {
			const matches = flagByPrev.values
				.filter((val) => val.toLowerCase().startsWith(lowerPartial))
				.map((val) => ({
					value: `${prefixHead} ${val}`,
					label: val,
					description: `${flagByPrev.flag} ${val}`,
				}));
			return matches.length > 0 ? matches : null;
		}

		// Suggest start flags when starting a new flag token
		if (!partial || partial.startsWith("-")) {
			const matches = startFlags
				.filter((f) => f.flag.startsWith(lowerPartial))
				.map((f) => ({
					value: `${prefixHead} ${f.flag}`,
					label: f.flag,
					description: f.description,
				}));
			return matches.length > 0 ? matches : null;
		}
		return null;
	}

	if (action === "queue" || action === "q") {
		if (tokenIndex === 1) {
			const matches = queueSubcommands
				.filter((item) => item.sub.startsWith(lowerPartial))
				.map((item) => ({
					value: `${actionToken} ${item.sub}`,
					label: item.sub,
					description: item.description,
				}));
			return matches.length > 0 ? matches : null;
		}
		return null;
	}

	if (action === "config" || action === "cfg" || action === "set") {
		if (tokenIndex === 1) {
			const candidates: AutocompleteItem[] = [];
			if ("reload".startsWith(lowerPartial)) {
				candidates.push({
					value: `${actionToken} reload`,
					label: "reload",
					description: "Reload pi-auto-continue.json from disk",
				});
			}
			for (const key of Object.keys(defaults) as Array<keyof Settings>) {
				if (key.toLowerCase().startsWith(lowerPartial)) {
					candidates.push({
						value: `${actionToken} ${key}`,
						label: key,
						description: `${configOptions[key].description} (current: ${String(settings[key])})`,
					});
				}
			}
			return candidates.length > 0 ? candidates : null;
		}

		if (tokenIndex === 2) {
			const rawKey = parts[1] ?? "";
			const matchedKey = (Object.keys(defaults) as Array<keyof Settings>).find(
				(k) => k.toLowerCase() === rawKey.toLowerCase(),
			);
			if (!matchedKey) return null;

			const rawValues = settingCandidates(
				settingsSchema.properties[matchedKey],
				configOptions[matchedKey].values,
			);
			const matches = rawValues
				.filter((v) => v.toLowerCase().startsWith(lowerPartial))
				.map((v) => ({
					value: `${actionToken} ${matchedKey} ${v}`,
					label: v,
					description: `Set ${matchedKey} = ${v}`,
				}));
			return matches.length > 0 ? matches : null;
		}
	}

	return null;
}
