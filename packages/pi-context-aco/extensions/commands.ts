import type { AutocompleteItem } from "@earendil-works/pi-tui";
import { settingCandidates } from "pi-plugin-support/settings";
import { options, type Settings, schema, settingKey } from "./config.ts";

export const usage =
	"Usage: /aco [status | trace | tasks | recommend | compose <JSON> | advance | composition | prune | restore <id|all> | summarize <JSON> | delegate <JSON> | delegation | reconcile <JSON> | compact | compaction | authorize <JSON> | revoke | declare <JSON> | checkpoint <JSON> | evidence | recall <JSON> | on | off | config [reload | <key> [value]] | help] — observation + verified recovery + scoped V3/V4 actions";
export type Command =
	| {
			kind:
				| "panel"
				| "status"
				| "trace"
				| "reload"
				| "help"
				| "tasks"
				| "recommend"
				| "evidence"
				| "prune"
				| "compact"
				| "compaction"
				| "delegation"
				| "revoke"
				| "advance"
				| "composition";
	  }
	| {
			kind:
				| "declare"
				| "checkpoint"
				| "recall"
				| "summarize"
				| "authorize"
				| "delegate"
				| "reconcile"
				| "compose";
			json: string;
	  }
	| { kind: "restore"; targetId: string }
	| { kind: "get"; key: string }
	| { kind: "set"; key: string; value: string };
export function parse(args: string): Command {
	const jsonAction =
		/^(declare|checkpoint|recall|summarize|authorize|delegate|reconcile|compose)\s+/i.exec(
			args.trim(),
		);
	if (jsonAction)
		return args.length <=
			(jsonAction[1].toLowerCase() === "declare" ? 32768 : 65536)
			? {
					kind: jsonAction[1].toLowerCase() as
						| "declare"
						| "checkpoint"
						| "recall"
						| "summarize"
						| "authorize"
						| "delegate"
						| "reconcile"
						| "compose",
					json: args.trim().slice(jsonAction[0].length),
				}
			: { kind: "help" };
	if (args.length > 512) return { kind: "help" };
	const p = args.trim().split(/\s+/).filter(Boolean);
	if (!p.length) return { kind: "panel" };
	if (p.length === 1) {
		switch (p[0].toLowerCase()) {
			case "compose":
				return { kind: "compose", json: "" };
			case "advance":
				return { kind: "advance" };
			case "composition":
				return { kind: "composition" };
			case "compact":
				return { kind: "compact" };
			case "delegation":
				return { kind: "delegation" };
			case "compaction":
				return { kind: "compaction" };
			case "revoke":
				return { kind: "revoke" };
			case "status":
				return { kind: "status" };
			case "evidence":
				return { kind: "evidence" };
			case "prune":
				return { kind: "prune" };
			case "tasks":
				return { kind: "tasks" };
			case "recommend":
				return { kind: "recommend" };
			case "trace":
				return { kind: "trace" };
			case "config":
				return { kind: "panel" };
			case "on":
				return { kind: "set", key: "enabled", value: "true" };
			case "off":
				return { kind: "set", key: "enabled", value: "false" };
		}
	}
	if (p[0].toLowerCase() === "restore") {
		return p.length === 2
			? { kind: "restore", targetId: p[1] }
			: { kind: "help" };
	}
	if (p[0].toLowerCase() === "config") {
		if (p.length === 2)
			return p[1].toLowerCase() === "reload"
				? { kind: "reload" }
				: { kind: "get", key: p[1] };
		if (p.length === 3) return { kind: "set", key: p[1], value: p[2] };
	}
	return { kind: "help" };
}
export function complete(
	prefix: string,
	settings: Settings,
): AutocompleteItem[] | null {
	if (prefix.length > 512) return null;
	const p = prefix.trimStart().split(/\s+/).filter(Boolean);
	const at = /\s$/.test(prefix) ? p.length : Math.max(0, p.length - 1);
	const partial = /\s$/.test(prefix) ? "" : (p.at(-1) ?? "");
	const filter = (items: AutocompleteItem[]) => {
		const found = items.filter((x) =>
			x.label.toLowerCase().startsWith(partial.toLowerCase()),
		);
		return found.length ? found : null;
	};
	if (at === 0)
		return filter(
			[
				"status",
				"trace",
				"tasks",
				"recommend",
				"compose",
				"advance",
				"composition",
				"prune",
				"summarize",
				"compact",
				"compaction",
				"delegation",
				"delegate",
				"reconcile",
				"authorize",
				"revoke",
				"restore",
				"declare",
				"checkpoint",
				"evidence",
				"recall",
				"on",
				"off",
				"config",
				"help",
			].map((action) => ({
				value: action,
				label: action,
				description: "ACO observation and explicit local recovery control",
			})),
		);
	if (p[0]?.toLowerCase() !== "config") return null;
	const action = p[0];
	if (at === 1)
		return filter([
			{
				value: `${action} reload`,
				label: "reload",
				description: "Reload configuration",
			},
			...Object.entries(options).map(([key, option]) => ({
				value: `${action} ${key}`,
				label: key,
				description: `${option.description}; current=${settings[key as keyof Settings]}`,
			})),
		]);
	if (at === 2) {
		const key = settingKey(p[1]);
		if (!key) return null;
		return filter(
			settingCandidates(schema.properties[key], options[key].values).map(
				(v) => ({
					value: `${action} ${key} ${v}`,
					label: v,
					description: options[key].description,
				}),
			),
		);
	}
	return null;
}
