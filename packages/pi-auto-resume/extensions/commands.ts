import type { AutocompleteItem } from "@earendil-works/pi-tui";
import { defaults, type Settings } from "./recovery.ts";

export type AutoResumeCommand =
	| { kind: "default" }
	| { kind: "status" }
	| { kind: "on" }
	| { kind: "off" }
	| { kind: "stop" }
	| { kind: "config"; reload?: boolean; key?: string; value?: string }
	| { kind: "help" };

export const autoResumeUsage =
	"Usage: /auto-resume [status | stop | on | off | config [reload | <key> [value]] | help]";

const settingKeyDescriptions: Readonly<Record<keyof Settings, string>> = {
	enabled: "Enable or disable automatic recovery by default",
	network: "Recover from network loss or request timeouts",
	throttle: "Recover from temporary rate-limiting (HTTP 429)",
	quota: "Recover after subscription quota reset",
	wake: "Reevaluate interrupted work after computer wake",
	retryDelayMs: "Minimum delay before network/throttle retry (ms)",
	quotaDelayMs: "Safety delay after reported quota reset time (ms)",
	maxAttempts: "Maximum consecutive automatic recovery attempts",
};

const booleanKeys = new Set<keyof Settings>([
	"enabled",
	"network",
	"throttle",
	"quota",
	"wake",
]);

const integerPresets: Readonly<Record<string, readonly string[]>> = {
	retryDelayMs: ["1000", "5000", "10000", "30000", "60000"],
	quotaDelayMs: ["0", "5000", "15000", "30000", "60000", "120000"],
	maxAttempts: ["1", "2", "3", "5", "10", "20"],
};

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
		action: "config",
		description:
			"Open TUI settings panel, reload config, or view/update a setting",
	},
	{ action: "help", description: "Show /auto-resume command usage" },
];

export function parseAutoResumeArgs(args: string): AutoResumeCommand {
	if (args.length > 512) return { kind: "help" };
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
				candidates.push({
					value: `${actionToken} ${key}`,
					label: key,
					description: `${settingKeyDescriptions[key]} (current: ${String(settings[key])})`,
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

		const rawValues = booleanKeys.has(matchedKey)
			? ["true", "false", "on", "off"]
			: (integerPresets[matchedKey] ?? []);

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
