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
	"Usage: /pretty-session (/ps)",
	"  /ps [browse [all]]               Open interactive session & project browser",
	"  /ps info                         Show current session & project metadata",
	"  /ps project                      Show detailed project context (Git, manifest, sessions)",
	"  /ps summarize (or /ps refresh)   Generate/refresh session title & description now",
	"  /ps rename <title> [| <desc>]    Set custom title (and optional description) and lock",
	"  /ps unlock                       Unlock manual title so dynamic updates resume",
	"  /ps list [all]                   List saved sessions with descriptions & metrics",
	"  /ps config [reload|<key> <val>]  View, reload, or dynamically update configuration",
	"  /ps toggle <auto|llm|widget|status|lock|compact>",
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
		case "open":
			return {
				kind: "browse",
				scope: rest.toLowerCase() === "all" ? "all" : "current",
			};
		case "info":
		case "status":
		case "show":
			return { kind: "info" };
		case "project":
		case "proj":
			return { kind: "project" };
		case "summarize":
		case "summary":
		case "refresh":
		case "regen":
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
			return { kind: "unlock" };
		case "list":
		case "ls":
			return {
				kind: "list",
				scope: rest.toLowerCase() === "all" ? "all" : "current",
			};
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
			return { kind: "toggle", target: rest.split(/\s+/)[0] ?? "" };
		}
		case "help":
		case "-h":
		case "--help":
			return { kind: "help" };
		default:
			return { kind: "help" };
	}
}
