import type { AutocompleteItem } from "@earendil-works/pi-tui";
import type { Stage } from "./schema.ts";
export const usage = [
	"/prompt-pipeline [status|config|config reload|config edit]",
	"/prompt-pipeline config logging silent|error|info",
	"/prompt-pipeline config antigravityCompat true|false",
	"/prompt-pipeline export agent|request before|both",
	"/prompt-pipeline export cancel",
	"Exports reserve the next real event; no additional model request is sent.",
	"before/after are this plugin's boundaries, not global first/last.",
].join("\n");
type Command =
	| { kind: "status" | "config" | "reload" | "edit" | "cancel" | "help" }
	| { kind: "export"; stage: Stage; mode: "before" | "both" }
	| { kind: "set"; key: "logging" | "antigravityCompat"; value: string };
export function parseCommand(args: string): Command {
	const text = args.trim(),
		tokens = text.split(/\s+/);
	if (!text || text === "status") return { kind: "status" };
	if (text === "config") return { kind: "config" };
	if (text === "config reload") return { kind: "reload" };
	if (text === "config edit") return { kind: "edit" };
	if (text === "export cancel") return { kind: "cancel" };
	const [first, second, third] = tokens;
	if (
		tokens.length === 3 &&
		first === "export" &&
		(second === "agent" || second === "request") &&
		(third === "before" || third === "both")
	)
		return { kind: "export", stage: second, mode: third };
	if (tokens.length === 3 && first === "config") {
		if (second === "logging" && ["silent", "error", "info"].includes(third))
			return { kind: "set", key: second, value: third };
		if (second === "antigravityCompat" && ["true", "false"].includes(third))
			return { kind: "set", key: second, value: third };
	}
	return { kind: "help" };
}
export function completions(prefix: string): AutocompleteItem[] | null {
	const words = prefix.trimStart().split(/\s+/);
	const head = words.slice(0, -1).join(" "),
		tail = words.at(-1) ?? "";
	let choices: string[];
	if (!head) choices = ["status", "config", "export", "help"];
	else if (head === "export") choices = ["agent", "request", "cancel"];
	else if (head === "export agent" || head === "export request")
		choices = ["before", "both"];
	else if (head === "config")
		choices = ["reload", "edit", "logging", "antigravityCompat"];
	else if (head === "config logging") choices = ["silent", "error", "info"];
	else if (head === "config antigravityCompat") choices = ["true", "false"];
	else return null;
	return choices
		.filter((v) => v.startsWith(tail))
		.map((v) => ({ value: head ? `${head} ${v}` : v, label: v }));
}
