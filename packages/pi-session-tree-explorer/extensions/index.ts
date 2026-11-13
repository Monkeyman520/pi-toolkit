import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { loadViewState, saveViewState } from "./view-state.ts";

export {
	getViewStateFilePath,
	loadViewState,
	saveViewState,
} from "./view-state.ts";

import { executeSessionIntent } from "./session-effects.ts";

export { executeSessionIntent } from "./session-effects.ts";

import type {
	ExtensionAPI,
	ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import { createActionRegistry } from "./actions.ts";
import {
	getStreeArgumentCompletions,
	parseSettingValue,
	streeUsage,
} from "./commands.ts";
import { ConfigManager } from "./config.ts";
import { defaultDisplayOptions } from "./display.ts";
import { captureSessionSnapshot } from "./session-snapshot.ts";
import { createInitialState } from "./state.ts";
import { SessionTreeComponent } from "./tui.ts";
import type { ExplorerResult, ExplorerState } from "./types.ts";
import {
	DISCOVER_EVENT,
	isDiscoverPayload,
	openSessionTreeSettingsPanel,
	SELF_PLUGIN_ID,
} from "./ui.ts";

export { createActionRegistry, getDefaultKeybindings } from "./actions.ts";
export { copyToClipboard } from "./clipboard.ts";
export { getStreeArgumentCompletions } from "./commands.ts";
export { ConfigManager } from "./config.ts";
export { getDefaultConfig, SessionTreeConfigSchema } from "./config-schema.ts";
export {
	buildDisplayProjection,
	defaultDisplayOptions,
	defaultFoldOptions,
	isNodeCollapsed,
	isNodeVisible,
} from "./display.ts";
export { KeyResolver, validateKeymap } from "./keymap.ts";
export * from "./navigation.ts";
export {
	buildSearchIndex,
	executeSearch,
	extractContentText,
	extractFullText,
} from "./search.ts";
export { createInitialState } from "./state.ts";
export { buildTreeIndex } from "./tree-index.ts";
export { SessionTreeComponent } from "./tui.ts";
export * from "./types.ts";
export { openSessionTreeSettingsPanel, SELF_PLUGIN_ID } from "./ui.ts";

export default function sessionTreeExplorerPlugin(pi: ExtensionAPI): void {
	const configManager = new ConfigManager();
	let activeExplorer: SessionTreeComponent | undefined;
	let mutationPending = false;
	const disposeActive = () => {
		activeExplorer?.dispose();
		activeExplorer = undefined;
	};
	pi.on("session_shutdown", () => {
		activeExplorer?.dispose();
		activeExplorer = undefined;
	});

	// Installed-only dynamic discovery over pi.events per ADR 0004/0005
	pi.events.on(DISCOVER_EVENT, (payload: unknown) => {
		if (isDiscoverPayload(payload)) {
			payload.register({
				id: SELF_PLUGIN_ID,
				title: "Session Tree Explorer",
				command: "/stree config",
				getSummary: () => {
					const cfg = configManager.getConfig();
					return `Vim: ${cfg.vimMode ? "on" : "off"} | Fold: ${cfg.fold.mode} | Depth: ${cfg.display.depthMode}`;
				},
				open: async (ctx) => {
					await configManager.ensureLoaded({
						cwd: ctx.cwd,
						isProjectTrusted: ctx.isProjectTrusted?.() ?? false,
					});
					await openSessionTreeSettingsPanel({
						ctx,
						events: pi.events,
						configManager,
					});
				},
			});
		}
	});

	pi.registerCommand("stree", {
		description: "Enhanced Session Tree Explorer for Pi",
		getArgumentCompletions: (argumentPrefix: string) => {
			return getStreeArgumentCompletions(argumentPrefix);
		},
		handler: async (
			args: string,
			ctx: ExtensionCommandContext,
		): Promise<void> => {
			// Ensure configuration layers are loaded
			const loaded = await configManager.ensureLoaded({
				cwd: ctx.cwd,
				isProjectTrusted: ctx.isProjectTrusted?.() ?? false,
			});

			for (const diagnostic of loaded.diagnostics)
				ctx.ui.notify(
					`${diagnostic.layer}: ${diagnostic.message} ${(diagnostic.details ?? []).join("; ")}`,
					"warning",
				);
			const trimmed = args.trim();

			// 1. Help subcommand
			if (trimmed === "help") {
				ctx.ui.notify(streeUsage.join("\n"), "info");
				return;
			}

			// 2. Config subcommand
			if (trimmed === "config") {
				if (ctx.mode === "tui") {
					await openSessionTreeSettingsPanel({
						ctx,
						events: pi.events,
						configManager,
					});
				} else {
					const cfg = configManager.getConfig();
					ctx.ui.notify(
						`Session Tree Configuration: vimMode=${cfg.vimMode}, foldMode=${cfg.fold.mode}, depthMode=${cfg.display.depthMode}`,
						"info",
					);
				}
				return;
			}

			if (trimmed === "config reload") {
				const res = await configManager.reload();
				if (res.success) {
					ctx.ui.notify(
						"Session tree configuration reloaded successfully.",
						"info",
					);
				} else {
					ctx.ui.notify(
						`Configuration reload failed (retained previous safe settings): ${res.error ?? "invalid syntax"}`,
						"warning",
					);
				}
				return;
			}

			if (trimmed.startsWith("config ")) {
				const rest = trimmed.slice("config ".length).trim();
				const spaceIdx = rest.indexOf(" ");
				if (spaceIdx === -1) {
					// View key
					const key = rest;
					const cfg = configManager.getConfig() as unknown as Record<
						string,
						unknown
					>;
					const parts = key.split(".");
					let cur: unknown = cfg;
					for (const p of parts) {
						if (cur && typeof cur === "object") {
							cur = (cur as Record<string, unknown>)[p];
						} else {
							cur = undefined;
							break;
						}
					}
					ctx.ui.notify(`${key} = ${JSON.stringify(cur)}`, "info");
				} else {
					// Set key
					const key = rest.slice(0, spaceIdx).trim();
					const rawVal = rest.slice(spaceIdx + 1).trim();
					const parsed = parseSettingValue(key, rawVal);
					await configManager.updateSetting(key, parsed);
					ctx.ui.notify(`Updated ${key} = ${JSON.stringify(parsed)}`, "info");
				}
				return;
			}

			// 3. Main Explorer view
			if (ctx.mode !== "tui") {
				ctx.ui.notify(
					"Session Tree Explorer requires an interactive TUI session.",
					"info",
				);
				return;
			}

			if (activeExplorer || mutationPending) {
				ctx.ui.notify(
					"Session Tree Explorer or a session operation is already open.",
					"warning",
				);
				return;
			}
			const effectiveConfig = configManager.getConfig();
			let snapshot = captureSessionSnapshot(ctx.sessionManager, 1, {
				activeModel: ctx.model,
				activeUsage: ctx.getContextUsage() ?? undefined,
			});
			const currentLeafId = snapshot.leafId;
			const sessionId = snapshot.sessionId;
			const index = snapshot.index;

			// Compute focused path IDs (from active leaf up to root)
			const focusedPathIds = new Set<string>();
			let curr = currentLeafId;
			while (curr !== null) {
				focusedPathIds.add(curr);
				curr = index.parentById.get(curr) ?? null;
			}

			const initialSelection =
				effectiveConfig.navigation.initialFocus === "root"
					? (index.rootIds[0] ?? null)
					: currentLeafId && index.entryById.has(currentLeafId)
						? currentLeafId
						: index.preorderIds.length > 0
							? index.preorderIds[0]
							: null;

			const state: ExplorerState = createInitialState(sessionId, {
				selectedEntryId: initialSelection,
				sessionLeafId: currentLeafId,
				focusedPathIds,
				vimMode: effectiveConfig.vimMode,
				displayOptions: {
					...defaultDisplayOptions(),
					...effectiveConfig.display,
				},
				foldOptions: { ...effectiveConfig.fold },
			});

			const agentDir = getAgentDir();
			const savedViewState = await loadViewState(
				agentDir,
				sessionId,
				index,
				effectiveConfig.fold.rememberManualOverrides,
			);
			if (savedViewState) {
				if (savedViewState.displayOptions) {
					state.displayOptions = {
						...state.displayOptions,
						...savedViewState.displayOptions,
					};
				}
				if (savedViewState.showDetails !== undefined) {
					state.showDetails = savedViewState.showDetails;
				}
				if (savedViewState.showContext !== undefined) {
					state.showContext = savedViewState.showContext;
				}
				if (savedViewState.focusedBranchId) {
					state.focusedBranchId = savedViewState.focusedBranchId;
					state.focusedPathIds.clear();
					let focal: string | null = state.focusedBranchId;
					while (focal) {
						state.focusedPathIds.add(focal);
						focal = index.parentById.get(focal) ?? null;
					}
				}
				if (savedViewState.manualExpandedIds) {
					state.manualExpandedIds = savedViewState.manualExpandedIds;
				}
				if (savedViewState.manualCollapsedIds) {
					state.manualCollapsedIds = savedViewState.manualCollapsedIds;
				}
			}

			const registry = createActionRegistry();

			let result: ExplorerResult | undefined;
			try {
				result = await ctx.ui.custom<ExplorerResult>(
					(tui, theme, _kb, done) => {
						activeExplorer = new SessionTreeComponent({
							tui,
							theme,
							done,
							index,
							state,
							registry,
							keybindings: effectiveConfig.keybindings,
							config: effectiveConfig,
							activeModel: ctx.model,
							activeUsage: ctx.getContextUsage() ?? undefined,
							onReloadConfig: async () => {
								const result = await configManager.reload();
								if (!result.success) throw new Error(result.error);
								return result.config;
							},
							onOpenSettings: async () => {
								await openSessionTreeSettingsPanel({
									ctx,
									events: pi.events,
									configManager,
								});
								return configManager.getConfig();
							},
							onEditLabel: async (_id, current) => {
								const label = await ctx.ui.input(
									"Entry label (empty clears)",
									current ?? "",
								);
								return label === undefined
									? null
									: { label: label || undefined };
							},
							onSetLabel: (id, label) => {
								if (ctx.sessionManager.getSessionId() !== snapshot.sessionId)
									throw new Error("Session changed");
								pi.setLabel(id, label);
							},
							onRefresh: async () => {
								snapshot = captureSessionSnapshot(
									ctx.sessionManager,
									snapshot.revision + 1,
									{
										activeModel: ctx.model,
										activeUsage: ctx.getContextUsage() ?? undefined,
									},
								);
								return snapshot;
							},
							onNotify: (msg, type) => {
								ctx.ui.notify(msg, type);
							},
						});
						return activeExplorer;
					},
				);
			} finally {
				disposeActive();
			}
			mutationPending = true;
			try {
				if (state.sessionId === sessionId)
					await saveViewState(agentDir, sessionId, state);
				if (result && result.type !== "close")
					await executeSessionIntent({
						intent: result,
						ctx,
						config: configManager.getConfig(),
						expectedSessionId: sessionId,
						onNotify: (msg, type) => ctx.ui.notify(msg, type),
						onReplacementCleanup: disposeActive,
					});
			} finally {
				mutationPending = false;
			}
		},
	});
}
