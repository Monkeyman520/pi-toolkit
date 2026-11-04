import { formatQuotaList, formatQuotaView } from "./display.ts";

export type QuotaConfigKey = "mode" | "delayMs" | "pollIntervalMs";

export type QuotaCommand =
	| { kind: "view"; id?: string; detailed: boolean }
	| { kind: "list" | "refresh" | "usage" }
	| { kind: "enable"; id: string; model: string; resetWindow?: string }
	| { kind: "disable"; id: string }
	| { kind: "config"; key?: QuotaConfigKey; value?: string };

export const quotaUsage =
	"Usage: /quota | /quota details | /quota list | /quota refresh | /quota <account-id> [details] | /quota enable <account-id> <model-id> [window-id] | /quota disable <account-id> | /quota config [mode|delayMs|pollIntervalMs <value>]";

const configKeyAliases: Readonly<Record<string, QuotaConfigKey>> = {
	mode: "mode",
	delay: "delayMs",
	delayms: "delayMs",
	poll: "pollIntervalMs",
	pollinterval: "pollIntervalMs",
	pollintervalms: "pollIntervalMs",
};

export function parseQuotaArgs(args: string): QuotaCommand {
	if (args.length > 512) return { kind: "usage" };
	const parts = args.trim().split(/\s+/).filter(Boolean);
	if (!parts.length) return { kind: "view", detailed: false };
	const reserved = new Set([
		"details",
		"list",
		"refresh",
		"enable",
		"disable",
		"config",
		"help",
		"-h",
		"--help",
	]);
	if (parts.length === 1) {
		if (parts[0] === "help" || parts[0] === "-h" || parts[0] === "--help")
			return { kind: "usage" };
		if (parts[0] === "list" || parts[0] === "refresh")
			return { kind: parts[0] };
		if (parts[0] === "config") return { kind: "config" };
		if (parts[0] === "enable" || parts[0] === "disable")
			return { kind: "usage" };
		if (parts[0] === "details") return { kind: "view", detailed: true };
		return { kind: "view", id: parts[0], detailed: false };
	}
	if (parts[0] === "disable") {
		const id = parts[1];
		if (parts.length === 2 && id && !reserved.has(id)) {
			return { kind: "disable", id };
		}
		return { kind: "usage" };
	}
	if (parts[0] === "enable") {
		const id = parts[1];
		const model = parts[2];
		const resetWindow = parts[3];
		if (
			(parts.length === 3 || parts.length === 4) &&
			id &&
			!reserved.has(id) &&
			model
		) {
			return {
				kind: "enable",
				id,
				model,
				...(resetWindow ? { resetWindow } : {}),
			};
		}
		return { kind: "usage" };
	}
	if (parts[0] === "config") {
		const key = configKeyAliases[(parts[1] ?? "").toLowerCase()];
		if (!key) return { kind: "usage" };
		if (parts.length === 2) return { kind: "config", key };
		if (parts.length === 3 && parts[2]) {
			return { kind: "config", key, value: parts[2] };
		}
		return { kind: "usage" };
	}
	if (parts.length === 2) {
		const id =
			parts[0] === "details"
				? parts[1]
				: parts[1] === "details"
					? parts[0]
					: undefined;
		if (id && !reserved.has(id)) return { kind: "view", id, detailed: true };
	}
	return { kind: "usage" };
}

export function formatQuotaCommand(
	view: Parameters<typeof formatQuotaView>[0],
	command: QuotaCommand,
): string[] {
	if (command.kind === "usage") return [quotaUsage];
	if (command.kind === "list") return formatQuotaList(view.snapshots);
	if (command.kind === "view") {
		const snapshots =
			command.id === undefined
				? view.snapshots
				: view.snapshots.filter((s) => s.id === command.id);
		if (command.id !== undefined && !snapshots.length)
			return ["Account ID not found. Use /quota list for exact account IDs."];
		return formatQuotaView({ ...view, snapshots, detailed: command.detailed });
	}
	return formatQuotaView(view);
}
