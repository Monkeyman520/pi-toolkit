import { formatQuotaList, formatQuotaView } from "./display.ts";
export type QuotaCommand =
	| { kind: "view"; id?: string; detailed: boolean }
	| { kind: "list" | "refresh" | "usage" };
export const quotaUsage =
	"Usage: /quota | /quota details | /quota list | /quota refresh | /quota <account-id> [details]";
export function parseQuotaArgs(args: string): QuotaCommand {
	if (args.length > 512) return { kind: "usage" };
	const parts = args.trim().split(/\s+/).filter(Boolean);
	if (!parts.length) return { kind: "view", detailed: false };
	const reserved = new Set(["details", "list", "refresh"]);
	if (parts.length === 1) {
		if (parts[0] === "list" || parts[0] === "refresh")
			return { kind: parts[0] };
		if (parts[0] === "details") return { kind: "view", detailed: true };
		return { kind: "view", id: parts[0], detailed: false };
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
