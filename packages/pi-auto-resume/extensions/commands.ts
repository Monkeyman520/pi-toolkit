import type { AutocompleteItem } from "@earendil-works/pi-tui";
import { settingCandidates } from "pi-plugin-support/settings";
import { configOptions, settingsSchema } from "./config.ts";
import { defaults, type Settings } from "./recovery.ts";

export type AutoResumeCommand =
	| { kind: "default" }
	| { kind: "status" }
	| { kind: "on" }
	| { kind: "off" }
	| { kind: "stop" }
	| {
			kind: "guard";
			sub: "status" | "clear" | "duration" | "until";
			value?: string;
	  }
	| { kind: "config"; reload?: boolean; key?: string; value?: string }
	| { kind: "help" };

export const autoResumeUsage =
	"Usage: /auto-resume [status | stop | on | off | guard [status | clear | duration <spec> | until <timestamp>] | config [reload | <key> [value]] | help]";

const actionDefinitions: ReadonlyArray<{
	action: string;
	description: string;
}> = [
	{
		action: "status",
		description: "Show current recovery status and active settings",
	},
	{ action: "on", description: "Enable auto-resume for the current session" },
	{
		action: "off",
		description: "Disable auto-resume for the current session",
	},
	{
		action: "stop",
		description: "Cancel any pending recovery wait immediately",
	},
	{
		action: "guard",
		description:
			"Inspect, set, or clear session-only time guardrails (duration/until)",
	},
	{
		action: "config",
		description:
			"Open TUI settings panel, reload config, or view/update a setting",
	},
	{ action: "help", description: "Show /auto-resume command usage" },
];

const guardSubcommands: ReadonlyArray<{
	sub: "status" | "clear" | "duration" | "until";
	description: string;
}> = [
	{ sub: "status", description: "Show active session time guardrail" },
	{ sub: "clear", description: "Remove active session time guardrail" },
	{
		sub: "duration",
		description:
			"Stop automatic recoveries after a relative duration (e.g. 2h)",
	},
	{
		sub: "until",
		description:
			"Stop automatic recoveries after a timestamp (ISO-8601 or YYYY-MM-DD HH:MM:SS)",
	},
];

const guardDurationPresets = ["15m", "30m", "1h", "2h", "4h", "8h"] as const;

export function parseAutoResumeArgs(args: string): AutoResumeCommand {
	if (args.length > 4096) return { kind: "help" };
	const trimmed = args.trim();
	if (!trimmed) return { kind: "default" };
	const parts = trimmed.split(/\s+/).filter(Boolean);
	const sub = (parts[0] ?? "").toLowerCase();

	if (sub === "help" || sub === "-h" || sub === "--help") {
		return { kind: "help" };
	}
	if (
		(sub === "status" || sub === "info" || sub === "show") &&
		parts.length === 1
	) {
		return { kind: "status" };
	}
	if (sub === "on" && parts.length === 1) {
		return { kind: "on" };
	}
	if (sub === "off" && parts.length === 1) {
		return { kind: "off" };
	}
	if (sub === "stop" && parts.length === 1) {
		return { kind: "stop" };
	}
	if (sub === "guard") {
		const guardSub = (parts[1] ?? "status").toLowerCase();
		const rest = parts.slice(2).join(" ").trim();
		if (guardSub === "status" && !rest) {
			return { kind: "guard", sub: "status" };
		}
		if (guardSub === "clear" && !rest) {
			return { kind: "guard", sub: "clear" };
		}
		if ((guardSub === "duration" || guardSub === "until") && rest) {
			return { kind: "guard", sub: guardSub, value: rest };
		}
		return { kind: "help" };
	}
	if (sub === "config" || sub === "cfg" || sub === "set") {
		const keyArg = parts[1];
		const valArg = parts.slice(2).join(" ").trim();
		if (!keyArg) {
			return { kind: "config" };
		}
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

export function getAutoResumeCompletions(
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

	const sub = (parts[0] ?? "").toLowerCase();
	if (sub === "guard") {
		const actionToken = parts[0] ?? "guard";
		const tokenIndex = endsWithSpace ? parts.length : parts.length - 1;
		const partial = endsWithSpace ? "" : (parts[parts.length - 1] ?? "");
		const lowerPartial = partial.toLowerCase();
		if (tokenIndex === 1) {
			const matches = guardSubcommands
				.filter((item) => item.sub.startsWith(lowerPartial))
				.map((item) => ({
					value: `${actionToken} ${item.sub}`,
					label: item.sub,
					description: item.description,
				}));
			return matches.length > 0 ? matches : null;
		}
		if (tokenIndex === 2 && (parts[1] ?? "").toLowerCase() === "duration") {
			const matches = guardDurationPresets
				.filter((preset) => preset.toLowerCase().startsWith(lowerPartial))
				.map((preset) => ({
					value: `${actionToken} duration ${preset}`,
					label: preset,
					description: `Set session recovery guardrail for ${preset}`,
				}));
			return matches.length > 0 ? matches : null;
		}
		return null;
	}
	if (sub !== "config" && sub !== "cfg" && sub !== "set") {
		return null;
	}

	const actionToken = parts[0] ?? "config";
	const tokenIndex = endsWithSpace ? parts.length : parts.length - 1;
	const partial = endsWithSpace ? "" : (parts[parts.length - 1] ?? "");
	const lowerPartial = partial.toLowerCase();

	if (tokenIndex === 1) {
		const candidates: AutocompleteItem[] = [];
		if ("reload".startsWith(lowerPartial)) {
			candidates.push({
				value: `${actionToken} reload`,
				label: "reload",
				description: "Reload pi-auto-resume.json from disk",
			});
		}
		for (const key of Object.keys(defaults) as Array<keyof Settings>) {
			if (key.toLowerCase().startsWith(lowerPartial)) {
				const currentVal = settings[key];
				const formatted = Array.isArray(currentVal)
					? `${currentVal.length} rules`
					: String(currentVal);
				candidates.push({
					value: `${actionToken} ${key}`,
					label: key,
					description: `${configOptions[key].description} (current: ${formatted})`,
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

	return null;
}
