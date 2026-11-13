import type { AutocompleteItem } from "@earendil-works/pi-tui";
import { parseBoolean } from "pi-plugin-support/settings";

export const streeUsage = [
	"Usage: /stree <action> [other-args]",
	"  /stree                            Open the Session Tree Explorer (interactive TUI)",
	"  /stree config                     Open interactive TUI configuration panel",
	"  /stree config reload              Force reload configuration from disk",
	"  /stree config <key> [value]       View or update a configuration key",
	"  /stree help                       Show command usage",
];

export const CONFIGURABLE_KEYS: Record<
	string,
	{ type: "boolean" | "enum" | "number"; values?: string[] }
> = {
	vimMode: { type: "boolean" },
	"navigation.initialFocus": { type: "enum", values: ["active", "root"] },
	"navigation.branchWrap": { type: "boolean" },
	"navigation.focusFollowsSelection": {
		type: "enum",
		values: ["branch-actions", "always", "never"],
	},
	"navigation.autoRevealTarget": { type: "boolean" },
	"navigation.skipHiddenNodes": { type: "boolean", values: ["true"] },
	"display.showAssistantNodes": { type: "boolean" },
	"display.showToolNodes": { type: "boolean" },
	"display.showThinkingNodes": { type: "boolean" },
	"display.showMetadataNodes": { type: "boolean" },
	"display.showCompactionNodes": { type: "boolean" },
	"display.depthMode": { type: "enum", values: ["raw", "turn", "branch"] },
	"display.showDepth": { type: "boolean" },
	"display.maxMessageLength": {
		type: "number",
		values: ["40", "60", "80", "120", "160"],
	},
	"display.showNodeId": { type: "boolean" },
	"display.showTimestamps": { type: "boolean" },
	"display.layout": { type: "enum", values: ["normal", "compact"] },
	"fold.mode": {
		type: "enum",
		values: ["focused-only", "all", "active-only", "depth-limited", "manual"],
	},
	"fold.collapseInactiveBranches": { type: "boolean" },
	"fold.collapseLinearPaths": { type: "boolean" },
	"fold.rememberManualOverrides": { type: "boolean" },
	"fold.maxExpandDepth": { type: "number", values: ["0", "1", "2", "3", "5"] },
	"search.mode": { type: "enum", values: ["fuzzy", "exact", "regex"] },
	"search.scope": { type: "enum", values: ["all", "focused-subtree"] },
	"search.includeHiddenNodes": { type: "boolean" },
	"search.autoExpandMatches": { type: "boolean" },
	"search.preserveFoldState": { type: "boolean", values: ["true"] },
	"search.caseSensitive": { type: "boolean" },
	"search.maxResults": { type: "number", values: ["50", "100", "200", "500"] },
	"context.enabled": { type: "boolean" },
	"context.showTokens": { type: "boolean" },
	"context.showPercentage": { type: "boolean" },
	"context.showModel": { type: "boolean" },
	"context.estimateHistorical": { type: "boolean" },
	"context.showEstimateMarker": { type: "boolean" },
	"context.lazyEvaluation": { type: "boolean" },
	"context.cacheSize": {
		type: "number",
		values: ["256", "512", "1024", "2048"],
	},
	"session.forkPosition": { type: "enum", values: ["at"] },
	"session.navigateSummarize": { type: "boolean" },
	"session.confirmFork": { type: "boolean" },
	"session.busyBehavior": { type: "enum", values: ["reject", "wait"] },
	"performance.virtualRendering": { type: "boolean" },
	"performance.renderOverscan": {
		type: "number",
		values: ["10", "20", "40", "60"],
	},
	"performance.searchDebounceMs": {
		type: "number",
		values: ["20", "40", "80", "100"],
	},
};

export function getStreeArgumentCompletions(
	argumentPrefix: string,
): AutocompleteItem[] | null {
	const raw = argumentPrefix.trimStart();
	const tokens = raw.split(/\s+/);

	// Case 1: First token (/stree [action])
	if (tokens.length <= 1) {
		const prefix = tokens[0] ?? "";
		const actions = [
			{
				value: "config",
				label: "config",
				description: "Open settings panel, reload, or view/set key",
			},
			{ value: "help", label: "help", description: "Show command usage" },
		];
		const matches = actions.filter((a) => a.value.startsWith(prefix));
		return matches.length > 0 ? matches : null;
	}

	const action = tokens[0].toLowerCase();

	// Case 2: Under /stree config ...
	if (action === "config") {
		// Subcommand or key (/stree config [key|reload])
		if (tokens.length === 2) {
			const sub = tokens[1];
			const candidates: AutocompleteItem[] = [
				{
					value: "config reload",
					label: "reload",
					description: "Reload configuration from disk",
				},
			];

			for (const [key, meta] of Object.entries(CONFIGURABLE_KEYS)) {
				candidates.push({
					value: `config ${key}`,
					label: key,
					description: `Setting (${meta.type})`,
				});
			}

			const matches = candidates.filter(
				(c) => c.label?.startsWith(sub) || c.value.startsWith(`config ${sub}`),
			);
			return matches.length > 0 ? matches : null;
		}

		// Key value (/stree config <key> [value])
		if (tokens.length === 3) {
			const key = tokens[1];
			const valPrefix = tokens[2];
			const meta = CONFIGURABLE_KEYS[key];
			if (!meta) return null;

			let allowedValues: string[] = [];
			if (meta.type === "boolean") {
				allowedValues = meta.values ?? ["true", "false", "on", "off"];
			} else if (meta.values) {
				allowedValues = meta.values;
			}

			const matches = allowedValues
				.filter((v) => v.startsWith(valPrefix))
				.map((v) => ({
					value: `config ${key} ${v}`,
					label: v,
					description: `Value for ${key}`,
				}));

			return matches.length > 0 ? matches : null;
		}
	}

	return null;
}

export function parseSettingValue(key: string, rawVal: string): unknown {
	const meta = CONFIGURABLE_KEYS[key];
	if (!meta) {
		// Try JSON parse or string
		try {
			return JSON.parse(rawVal);
		} catch {
			return rawVal;
		}
	}

	if (meta.type === "boolean") {
		const b = parseBoolean(rawVal);
		if (b !== undefined) return b;
	}

	if (meta.type === "number") {
		const num = Number(rawVal);
		if (!Number.isNaN(num)) return num;
	}

	return rawVal;
}
