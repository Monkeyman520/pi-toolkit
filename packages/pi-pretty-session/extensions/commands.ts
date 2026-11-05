import type { AutocompleteItem } from "@earendil-works/pi-tui";
import { settingCandidates } from "pi-plugin-support/settings";
import {
	configOptions,
	configSchema,
	defaultConfig,
	type PrettySessionConfig,
	toggleAliases,
} from "./config.ts";

export type PrettySessionCommand =
	| { kind: "browse"; scope: "current" | "all" }
	| { kind: "info" }
	| { kind: "project" }
	| { kind: "summarize" }
	| { kind: "rename"; title?: string; description?: string }
	| { kind: "unlock" }
	| { kind: "list"; scope: "current" | "all" }
	| { kind: "config"; key?: string; value?: string; reload?: boolean }
	| { kind: "toggle"; target: string }
	| { kind: "help" };

export const prettySessionUsage = [
	"Usage: /pretty-session (/ps) <action> [other-args]",
	"  /ps [browse [current|all]]       Open interactive session & project browser",
	"  /ps status (or /ps info)         Show current session & project metadata",
	"  /ps project                      Show detailed project context (Git, manifest, sessions)",
	"  /ps summarize (or /ps refresh)   Generate/refresh session title & description now",
	"  /ps rename <title> [| <desc>]    Set custom title (and optional description) and lock",
	"  /ps unlock                       Unlock manual title so dynamic updates resume",
	"  /ps list [current|all]           List saved sessions with descriptions & metrics",
	"  /ps config [reload|<key> [val]]  Open TUI settings panel, reload, or update config",
	"  /ps toggle <auto|llm|widget|status|lock|compact>",
	"  /ps help                         Show command usage",
].join("\n");

export function parsePrettySessionArgs(rawArgs: string): PrettySessionCommand {
	const trimmed = rawArgs.trim();
	if (!trimmed) {
		return { kind: "browse", scope: "current" };
	}

	const firstSpace = trimmed.search(/\s/);
	const sub = (
		firstSpace === -1 ? trimmed : trimmed.slice(0, firstSpace)
	).toLowerCase();
	const rest = firstSpace === -1 ? "" : trimmed.slice(firstSpace + 1).trim();

	switch (sub) {
		case "browse":
		case "open": {
			const lowerRest = rest.toLowerCase();
			if (lowerRest && lowerRest !== "all" && lowerRest !== "current") {
				return { kind: "help" };
			}
			return {
				kind: "browse",
				scope: lowerRest === "all" ? "all" : "current",
			};
		}
		case "status":
		case "info":
		case "show":
			if (rest) return { kind: "help" };
			return { kind: "info" };
		case "project":
		case "proj":
			if (rest) return { kind: "help" };
			return { kind: "project" };
		case "summarize":
		case "summary":
		case "refresh":
		case "regen":
			if (rest) return { kind: "help" };
			return { kind: "summarize" };
		case "rename":
		case "name": {
			if (!rest) return { kind: "rename" };
			const pipeIdx = rest.indexOf("|");
			if (pipeIdx === -1) {
				return { kind: "rename", title: rest.trim() };
			}
			const title = rest.slice(0, pipeIdx).trim();
			const description = rest.slice(pipeIdx + 1).trim();
			return {
				kind: "rename",
				title: title || undefined,
				description: description || undefined,
			};
		}
		case "unlock":
			if (rest) return { kind: "help" };
			return { kind: "unlock" };
		case "list":
		case "ls": {
			const lowerRest = rest.toLowerCase();
			if (lowerRest && lowerRest !== "all" && lowerRest !== "current") {
				return { kind: "help" };
			}
			return {
				kind: "list",
				scope: lowerRest === "all" ? "all" : "current",
			};
		}
		case "config":
		case "cfg":
		case "set": {
			if (!rest) return { kind: "config" };
			if (rest.toLowerCase() === "reload") {
				return { kind: "config", reload: true };
			}
			const sp = rest.search(/\s/);
			if (sp === -1) {
				return { kind: "config", key: rest };
			}
			return {
				kind: "config",
				key: rest.slice(0, sp).trim(),
				value: rest.slice(sp + 1).trim(),
			};
		}
		case "toggle": {
			if (!rest) return { kind: "help" };
			const tokens = rest.split(/\s+/).filter(Boolean);
			if (tokens.length !== 1) return { kind: "help" };
			return { kind: "toggle", target: tokens[0] ?? "" };
		}
		case "help":
		case "-h":
		case "--help":
			return { kind: "help" };
		default:
			return { kind: "help" };
	}
}

export interface PrettySessionCompletionContext {
	config?: PrettySessionConfig;
	models?: ReadonlyArray<{ id: string; provider: string }>;
}

const prettySessionActions: ReadonlyArray<{
	action: string;
	description: string;
}> = [
	{
		action: "browse",
		description: "Open interactive TUI session & project browser",
	},
	{
		action: "status",
		description: "Show current session & project metadata summary",
	},
	{
		action: "project",
		description: "Show detailed project context (Git, manifest, sessions)",
	},
	{
		action: "summarize",
		description: "Generate or refresh session title and description now",
	},
	{
		action: "rename",
		description: "Set custom session title (and optional | description)",
	},
	{
		action: "unlock",
		description: "Clear manual title lock so dynamic updates resume",
	},
	{
		action: "list",
		description: "List saved sessions with descriptions and metrics",
	},
	{
		action: "config",
		description:
			"Open TUI settings panel, reload config, or view/update a setting",
	},
	{
		action: "toggle",
		description:
			"Toggle boolean setting: auto, llm, widget, status, lock, compact",
	},
	{ action: "help", description: "Show command usage" },
];

const toggleTargets: ReadonlyArray<{
	target: string;
	key: keyof PrettySessionConfig;
	description: string;
}> = [
	{
		target: "auto",
		key: "enabled",
		description: "Toggle automatic session summarization and naming",
	},
	{
		target: "llm",
		key: "useLlm",
		description: "Toggle LLM summarization vs local heuristic extraction",
	},
	{
		target: "widget",
		key: "showWidget",
		description: "Toggle live session & project TUI widget",
	},
	{
		target: "status",
		key: "showStatus",
		description: "Toggle footer status bar summary",
	},
	{
		target: "lock",
		key: "protectManualName",
		description: "Toggle protection of manual session names",
	},
	{
		target: "compact",
		key: "summarizeOnCompact",
		description: "Toggle automatic re-summarization after /compact",
	},
];

export function getPrettySessionCompletions(
	argumentPrefix: string,
	context?: PrettySessionCompletionContext,
): AutocompleteItem[] | null {
	const trimmedStart = argumentPrefix.trimStart();
	const endsWithSpace = /\s$/.test(argumentPrefix);
	const parts = trimmedStart ? trimmedStart.split(/\s+/).filter(Boolean) : [];
	const cfg = context?.config ?? defaultConfig;

	if (parts.length === 0 || (parts.length === 1 && !endsWithSpace)) {
		const partial = (parts[0] ?? "").toLowerCase();
		const matches = prettySessionActions
			.filter((item) => item.action.startsWith(partial))
			.map((item) => ({
				value: item.action,
				label: item.action,
				description: item.description,
			}));
		return matches.length > 0 ? matches : null;
	}

	const actionToken = parts[0] ?? "";
	const sub = actionToken.toLowerCase();
	const tokenIndex = endsWithSpace ? parts.length : parts.length - 1;
	const partial = endsWithSpace ? "" : (parts[parts.length - 1] ?? "");
	const lowerPartial = partial.toLowerCase();

	if (
		(sub === "browse" || sub === "open" || sub === "list" || sub === "ls") &&
		tokenIndex === 1
	) {
		const scopes = [
			{ scope: "current", description: "Sessions in the current project" },
			{ scope: "all", description: "Sessions across all projects" },
		];
		const matches = scopes
			.filter((s) => s.scope.startsWith(lowerPartial))
			.map((s) => ({
				value: `${actionToken} ${s.scope}`,
				label: s.scope,
				description: s.description,
			}));
		return matches.length > 0 ? matches : null;
	}

	if (sub === "toggle" && tokenIndex === 1) {
		const matches = toggleTargets
			.filter((t) => t.target.startsWith(lowerPartial))
			.map((t) => ({
				value: `${actionToken} ${t.target}`,
				label: t.target,
				description: `${t.description} (current: ${String(cfg[t.key])})`,
			}));
		return matches.length > 0 ? matches : null;
	}

	if (sub === "config" || sub === "cfg" || sub === "set") {
		if (tokenIndex === 1) {
			const candidates: AutocompleteItem[] = [];
			if ("reload".startsWith(lowerPartial)) {
				candidates.push({
					value: `${actionToken} reload`,
					label: "reload",
					description: "Reload pi-pretty-session.json from disk",
				});
			}
			for (const key of Object.keys(defaultConfig) as Array<
				keyof PrettySessionConfig
			>) {
				if (key.toLowerCase().startsWith(lowerPartial)) {
					candidates.push({
						value: `${actionToken} ${key}`,
						label: key,
						description: `${configOptions[key].description} (current: ${String(cfg[key] ?? "default")})`,
					});
				}
			}
			return candidates.length > 0 ? candidates : null;
		}

		if (tokenIndex === 2) {
			const rawKey = parts[1] ?? "";
			const resolvedKey =
				(toggleAliases[rawKey.toLowerCase()] as
					| keyof PrettySessionConfig
					| undefined) ??
				((Object.keys(defaultConfig) as Array<keyof PrettySessionConfig>).find(
					(k) => k.toLowerCase() === rawKey.toLowerCase(),
				) as keyof PrettySessionConfig | undefined);
			if (!resolvedKey) return null;

			const values =
				resolvedKey === "model"
					? [
							...configOptions.model.values,
							...(context?.models ?? []).map(
								(model) => `${model.provider}/${model.id}`,
							),
						]
					: settingCandidates(
							configSchema.properties[resolvedKey],
							configOptions[resolvedKey].values,
						);

			const matches = values
				.filter((v) => v.toLowerCase().startsWith(lowerPartial))
				.map((v) => ({
					value: `${actionToken} ${rawKey} ${v}`,
					label: v,
					description: `Set ${resolvedKey} = ${v}`,
				}));
			return matches.length > 0 ? matches : null;
		}
	}

	return null;
}
