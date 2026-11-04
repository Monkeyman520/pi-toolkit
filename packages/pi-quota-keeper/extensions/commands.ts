import type { AutocompleteItem } from "@earendil-works/pi-tui";
import {
	configOptions,
	defaultQuotaConfig,
	type QuotaConfigKey,
	type QuotaKeeperConfig,
} from "./coordination.ts";
import { formatQuotaList, formatQuotaView } from "./display.ts";
import type { Snapshot } from "./providers.ts";

export type { QuotaConfigKey } from "./coordination.ts";

export type QuotaCommand =
	| { kind: "view"; id?: string; detailed: boolean }
	| { kind: "list" | "refresh" | "usage" }
	| { kind: "enable"; id: string; model: string; resetWindow?: string }
	| { kind: "disable"; id: string }
	| {
			kind: "config";
			key?: QuotaConfigKey;
			value?: string;
			reload?: boolean;
	  };

export const quotaUsage =
	"Usage: /quota [status [account-id] | details [account-id] | list | refresh | <account-id> [details] | enable <account-id> <model-id> [window-id] | disable <account-id> | config [reload | mode|delayMs|pollIntervalMs [value]] | help]";

const configKeyAliases: Readonly<Record<string, QuotaConfigKey>> = {
	mode: "mode",
	delay: "delayMs",
	delayms: "delayMs",
	poll: "pollIntervalMs",
	pollinterval: "pollIntervalMs",
	pollintervalms: "pollIntervalMs",
};

const reservedWords = new Set([
	"status",
	"view",
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

export function parseQuotaArgs(args: string): QuotaCommand {
	if (args.length > 512) return { kind: "usage" };
	const parts = args.trim().split(/\s+/).filter(Boolean);
	if (!parts.length) return { kind: "view", detailed: false };

	if (parts.length === 1) {
		const first = parts[0] ?? "";
		if (first === "help" || first === "-h" || first === "--help")
			return { kind: "usage" };
		if (first === "list" || first === "refresh") return { kind: first };
		if (first === "config") return { kind: "config" };
		if (first === "enable" || first === "disable") return { kind: "usage" };
		if (first === "details") return { kind: "view", detailed: true };
		if (first === "status" || first === "view")
			return { kind: "view", detailed: false };
		return { kind: "view", id: first, detailed: false };
	}

	if (parts[0] === "status" || parts[0] === "view") {
		const id = parts[1];
		if (parts.length === 2 && id && !reservedWords.has(id)) {
			return { kind: "view", id, detailed: false };
		}
		return { kind: "usage" };
	}

	if (parts[0] === "disable") {
		const id = parts[1];
		if (parts.length === 2 && id && !reservedWords.has(id)) {
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
			!reservedWords.has(id) &&
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
		const second = (parts[1] ?? "").toLowerCase();
		if (second === "reload" && parts.length === 2) {
			return { kind: "config", reload: true };
		}
		const key = configKeyAliases[second];
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
		if (id && !reservedWords.has(id))
			return { kind: "view", id, detailed: true };
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

export interface QuotaCompletionContext {
	snapshots?: readonly Snapshot[];
	config?: QuotaKeeperConfig;
	models?: ReadonlyArray<{ id: string; provider: string; name?: string }>;
}

const quotaActions: ReadonlyArray<{ action: string; description: string }> = [
	{
		action: "status",
		description: "Show compact quota status (all accounts or one account-id)",
	},
	{
		action: "details",
		description: "Show detailed quota windows, UTC resets, and diagnostics",
	},
	{
		action: "list",
		description: "List copyable account IDs, masked labels, and auth types",
	},
	{
		action: "refresh",
		description: "Force an immediate quota poll through the maintenance owner",
	},
	{
		action: "enable",
		description:
			"Enable scheduled wake-up: /quota enable <account-id> <model-id> [window-id]",
	},
	{
		action: "disable",
		description: "Disable scheduled wake-up: /quota disable <account-id>",
	},
	{
		action: "config",
		description:
			"Open TUI settings panel, reload config, or update mode/delayMs/pollIntervalMs",
	},
	{ action: "help", description: "Show /quota command usage" },
];

const fallbackProviderModels: Readonly<Record<string, readonly string[]>> = {
	anthropic: ["claude-sonnet-4-5", "claude-haiku-4-5"],
	openai: ["gpt-5", "gpt-5-mini", "codex-mini-latest"],
	"openai-codex": ["gpt-5", "codex-mini-latest"],
	antigravity: ["gemini-2.5-flash", "gemini-2.5-pro"],
	"google-antigravity": ["gemini-2.5-flash", "gemini-2.5-pro"],
	"github-copilot": ["gpt-4o", "claude-3.5-sonnet"],
	xai: ["grok-3-mini", "grok-3"],
};

function matchesProviderFamily(
	accountProvider: string,
	modelProvider: string,
): boolean {
	if (accountProvider === modelProvider) return true;
	if (
		(accountProvider === "openai" || accountProvider === "openai-codex") &&
		(modelProvider === "openai" || modelProvider === "openai-codex")
	) {
		return true;
	}
	if (
		(accountProvider === "antigravity" ||
			accountProvider === "google-antigravity") &&
		(modelProvider === "antigravity" || modelProvider === "google-antigravity")
	) {
		return true;
	}
	return false;
}

export function getQuotaModelsForProvider(
	provider: string,
	context?: QuotaCompletionContext,
	accountId?: string,
): string[] {
	const seen = new Set<string>();
	if (accountId && context?.config?.models[accountId]) {
		seen.add(context.config.models[accountId]);
	}
	for (const m of context?.models ?? []) {
		if (matchesProviderFamily(provider, m.provider) && m.id) {
			seen.add(m.id);
		}
	}
	for (const fallback of fallbackProviderModels[provider] ?? []) {
		seen.add(fallback);
	}
	return [...seen];
}

export function getQuotaCompletions(
	argumentPrefix: string,
	context?: QuotaCompletionContext,
): AutocompleteItem[] | null {
	const trimmedStart = argumentPrefix.trimStart();
	const endsWithSpace = /\s$/.test(argumentPrefix);
	const parts = trimmedStart ? trimmedStart.split(/\s+/).filter(Boolean) : [];
	const snapshots = context?.snapshots ?? [];
	const cfg = context?.config;

	if (parts.length === 0 || (parts.length === 1 && !endsWithSpace)) {
		const partial = (parts[0] ?? "").toLowerCase();
		const matches = quotaActions
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

	const collectAccounts = (): Array<{
		id: string;
		provider: string;
		description: string;
	}> => {
		const byId = new Map<
			string,
			{ id: string; provider: string; description: string }
		>();
		for (const s of snapshots) {
			byId.set(s.id, {
				id: s.id,
				provider: s.provider,
				description: `${s.label} · ${s.status}${s.activation.supported ? " · wake-up eligible" : ""}`,
			});
		}
		for (const enabledId of cfg?.enabledAccounts ?? []) {
			if (!byId.has(enabledId)) {
				const prov = enabledId.split(":")[0] || "unknown";
				byId.set(enabledId, {
					id: enabledId,
					provider: prov,
					description: "Configured in enabledAccounts",
				});
			}
		}
		return [...byId.values()];
	};

	if (
		(sub === "status" || sub === "view" || sub === "details") &&
		tokenIndex === 1
	) {
		const matches = collectAccounts()
			.filter((a) => a.id.toLowerCase().startsWith(lowerPartial))
			.map((a) => ({
				value: `${actionToken} ${a.id}`,
				label: a.id,
				description: a.description,
			}));
		return matches.length > 0 ? matches : null;
	}

	if (sub === "disable" && tokenIndex === 1) {
		const enabledSet = new Set(cfg?.enabledAccounts ?? []);
		const allAccounts = collectAccounts().sort(
			(a, b) => Number(enabledSet.has(b.id)) - Number(enabledSet.has(a.id)),
		);
		const matches = allAccounts
			.filter((a) => a.id.toLowerCase().startsWith(lowerPartial))
			.map((a) => ({
				value: `${actionToken} ${a.id}`,
				label: a.id,
				description: enabledSet.has(a.id)
					? `Currently enabled (${a.description})`
					: a.description,
			}));
		return matches.length > 0 ? matches : null;
	}

	if (sub === "enable") {
		if (tokenIndex === 1) {
			const matches = collectAccounts()
				.filter((a) => a.id.toLowerCase().startsWith(lowerPartial))
				.map((a) => ({
					value: `${actionToken} ${a.id}`,
					label: a.id,
					description: a.description,
				}));
			return matches.length > 0 ? matches : null;
		}
		if (tokenIndex === 2) {
			const accountId = parts[1] ?? "";
			const snap = snapshots.find((s) => s.id === accountId);
			const provider = snap?.provider ?? (accountId.split(":")[0] || "");
			const modelIds = getQuotaModelsForProvider(provider, context, accountId);
			const matches = modelIds
				.filter((m) => m.toLowerCase().startsWith(lowerPartial))
				.map((m) => ({
					value: `${actionToken} ${accountId} ${m}`,
					label: m,
					description: `Wake-up model for ${accountId}`,
				}));
			return matches.length > 0 ? matches : null;
		}
		if (tokenIndex === 3) {
			const accountId = parts[1] ?? "";
			const modelId = parts[2] ?? "";
			const snap = snapshots.find((s) => s.id === accountId);
			const winIds = new Set<string>();
			for (const w of snap?.windows ?? []) {
				if (w.id) winIds.add(w.id);
			}
			if (cfg?.resetWindows[accountId]) {
				winIds.add(cfg.resetWindows[accountId]);
			}
			const matches = [...winIds]
				.filter((w) => w.toLowerCase().startsWith(lowerPartial))
				.map((w) => ({
					value: `${actionToken} ${accountId} ${modelId} ${w}`,
					label: w,
					description: `Reset window for ${accountId}`,
				}));
			return matches.length > 0 ? matches : null;
		}
		return null;
	}

	if (sub === "config") {
		if (tokenIndex === 1) {
			const configKeys: ReadonlyArray<{ key: string; description: string }> = [
				{
					key: "reload",
					description: "Reload pi-quota-keeper.json from disk",
				},
				{
					key: "mode",
					description: `${configOptions.mode.description} (current: ${cfg?.mode ?? defaultQuotaConfig.mode})`,
				},
				{
					key: "delayMs",
					description: `${configOptions.delayMs.description} (current: ${cfg?.delayMs ?? defaultQuotaConfig.delayMs})`,
				},
				{
					key: "pollIntervalMs",
					description: `${configOptions.pollIntervalMs.description} (current: ${cfg?.pollIntervalMs ?? defaultQuotaConfig.pollIntervalMs})`,
				},
			];
			const matches = configKeys
				.filter((item) => item.key.toLowerCase().startsWith(lowerPartial))
				.map((item) => ({
					value: `${actionToken} ${item.key}`,
					label: item.key,
					description: item.description,
				}));
			return matches.length > 0 ? matches : null;
		}
		if (tokenIndex === 2) {
			const rawKey = parts[1] ?? "";
			const resolvedKey = configKeyAliases[rawKey.toLowerCase()];
			if (!resolvedKey) return null;
			const values = configOptions[resolvedKey].values;
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
