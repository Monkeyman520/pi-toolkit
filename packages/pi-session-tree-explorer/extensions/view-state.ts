import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Type } from "typebox";
import { Check } from "typebox/value";
import { DisplayConfigSchema } from "./config-schema.ts";
import type {
	DisplayOptions,
	ExplorerState,
	SessionViewState,
	TreeIndex,
} from "./types.ts";

export type { SessionViewState } from "./types.ts";

const DisplayOverridesSchema = Type.Object(
	{
		...DisplayConfigSchema.properties,
		userOnly: Type.Optional(Type.Boolean()),
		branchOnly: Type.Optional(Type.Boolean()),
		labeledOnly: Type.Optional(Type.Boolean()),
	},
	{ additionalProperties: false },
);

export const ViewStateV1Schema = Type.Object(
	{
		version: Type.Literal(1),
		sessionId: Type.String(),
		focusedBranchId: Type.Optional(Type.Union([Type.String(), Type.Null()])),
		displayOptions: Type.Optional(DisplayOverridesSchema),
		showDetails: Type.Optional(Type.Boolean()),
		showContext: Type.Optional(Type.Boolean()),
		manualExpandedIds: Type.Optional(Type.Array(Type.String())),
		manualCollapsedIds: Type.Optional(Type.Array(Type.String())),
	},
	{ additionalProperties: false },
);

export const ViewStateV2Schema = Type.Object(
	{
		version: Type.Literal(2),
		sessionId: Type.String(),
		focusedBranchId: Type.Optional(Type.Union([Type.String(), Type.Null()])),
		selectedNodeId: Type.Optional(Type.Union([Type.String(), Type.Null()])),
		explicitDisplayOverrides: Type.Optional(DisplayOverridesSchema),
		showDetails: Type.Optional(Type.Boolean()),
		showContext: Type.Optional(Type.Boolean()),
		manualExpandedIds: Type.Optional(Type.Array(Type.String())),
		manualCollapsedIds: Type.Optional(Type.Array(Type.String())),
		branchBookmarks: Type.Optional(Type.Record(Type.String(), Type.String())),
	},
	{ additionalProperties: false },
);

export type LoadedViewState = Partial<
	Omit<ExplorerState, "displayOptions" | "selectedEntryId">
> & {
	selectedNodeId?: string | null;
	explicitDisplayOverrides?: Partial<DisplayOptions>;
	migratedFromVersion?: 1;
};

export function sanitizeSessionId(sessionId: string): string {
	return sessionId.replace(/[^a-zA-Z0-9_-]/g, "_");
}

export function getViewStateFilePath(
	agentDir: string,
	sessionId: string,
): string {
	const safeId = sanitizeSessionId(sessionId);
	return join(agentDir, "state", "session-tree", `${safeId}.json`);
}

function buildExplicitOverridesPayload(
	overrides: Partial<DisplayOptions> | undefined,
): Partial<DisplayOptions> | undefined {
	if (!overrides) return undefined;
	const entries = Object.entries(overrides).filter(
		([, value]) => value !== undefined,
	);
	if (entries.length === 0) return undefined;
	return Object.fromEntries(entries) as Partial<DisplayOptions>;
}

/**
 * Persist Tier-2 per-session view state overrides outside Session JSONL.
 * Never persists full displayOptions snapshots, activeLeafId, or temporary search state.
 */
export async function saveViewState(
	agentDir: string,
	sessionId: string,
	state: ExplorerState,
): Promise<void> {
	if (!sessionId || sessionId === "ephemeral") {
		return;
	}

	const filePath = getViewStateFilePath(agentDir, sessionId);
	const dir = dirname(filePath);

	const explicitDisplayOverrides = buildExplicitOverridesPayload(
		state.explicitDisplayOverrides,
	);

	const data: SessionViewState = {
		version: 2,
		sessionId,
		focusedBranchId: state.focusedBranchId,
		selectedNodeId: state.selectedEntryId,
		...(explicitDisplayOverrides ? { explicitDisplayOverrides } : {}),
		showDetails: state.showDetails,
		showContext: state.showContext,
		manualExpandedIds: Array.from(state.manualExpandedIds),
		manualCollapsedIds: Array.from(state.manualCollapsedIds),
		...(state.branchBookmarks && Object.keys(state.branchBookmarks).length > 0
			? { branchBookmarks: { ...state.branchBookmarks } }
			: {}),
	};

	try {
		await mkdir(dir, { recursive: true });
		const tempPath = `${filePath}.${randomUUID()}.tmp`;
		await writeFile(tempPath, JSON.stringify(data, null, 2), "utf8");
		await rename(tempPath, filePath);
	} catch {
		// Non-critical persistence failure
	}
}

/**
 * Load persisted Tier-2 view state for a session, migrating v1 files and filtering stale entry IDs.
 * Full v1 displayOptions snapshots are discarded so Global Config changes remain authoritative.
 */
export async function loadViewState(
	agentDir: string,
	sessionId: string,
	index: TreeIndex,
	rememberManualOverrides = true,
): Promise<LoadedViewState | null> {
	if (!sessionId || sessionId === "ephemeral") {
		return null;
	}

	const filePath = getViewStateFilePath(agentDir, sessionId);

	try {
		const text = await readFile(filePath, "utf8");
		const parsed: unknown = JSON.parse(text);

		if (Check(ViewStateV2Schema, parsed)) {
			if (parsed.sessionId !== sessionId) return null;
			const overrides: LoadedViewState = {};

			if (parsed.explicitDisplayOverrides) {
				const cleanOverrides = buildExplicitOverridesPayload(
					parsed.explicitDisplayOverrides as Partial<DisplayOptions>,
				);
				if (cleanOverrides) {
					overrides.explicitDisplayOverrides = cleanOverrides;
				}
			}
			if (typeof parsed.showDetails === "boolean") {
				overrides.showDetails = parsed.showDetails;
			}
			if (typeof parsed.showContext === "boolean") {
				overrides.showContext = parsed.showContext;
			}
			if (
				parsed.focusedBranchId &&
				index.entryById.has(parsed.focusedBranchId)
			) {
				overrides.focusedBranchId = parsed.focusedBranchId;
			}
			if (parsed.selectedNodeId && index.entryById.has(parsed.selectedNodeId)) {
				overrides.selectedNodeId = parsed.selectedNodeId;
			}
			if (parsed.branchBookmarks) {
				const validBookmarks: Record<string, string> = {};
				for (const [entryId, bookmark] of Object.entries(
					parsed.branchBookmarks,
				)) {
					if (index.entryById.has(entryId) && bookmark.trim()) {
						validBookmarks[entryId] = bookmark;
					}
				}
				if (Object.keys(validBookmarks).length > 0) {
					overrides.branchBookmarks = validBookmarks;
				}
			}
			if (rememberManualOverrides) {
				if (Array.isArray(parsed.manualExpandedIds)) {
					overrides.manualExpandedIds = new Set(
						parsed.manualExpandedIds.filter((id) => index.entryById.has(id)),
					);
				}
				if (Array.isArray(parsed.manualCollapsedIds)) {
					overrides.manualCollapsedIds = new Set(
						parsed.manualCollapsedIds.filter((id) => index.entryById.has(id)),
					);
				}
			}

			return overrides;
		}

		// Automatic migration from legacy version 1:
		// preserve manual folds/focus/toggles and discard full displayOptions snapshot.
		if (Check(ViewStateV1Schema, parsed)) {
			if (parsed.sessionId !== sessionId) return null;
			const overrides: LoadedViewState = {
				migratedFromVersion: 1,
			};

			if (typeof parsed.showDetails === "boolean") {
				overrides.showDetails = parsed.showDetails;
			}
			if (typeof parsed.showContext === "boolean") {
				overrides.showContext = parsed.showContext;
			}
			if (
				parsed.focusedBranchId &&
				index.entryById.has(parsed.focusedBranchId)
			) {
				overrides.focusedBranchId = parsed.focusedBranchId;
			}
			if (rememberManualOverrides) {
				if (Array.isArray(parsed.manualExpandedIds)) {
					overrides.manualExpandedIds = new Set(
						parsed.manualExpandedIds.filter((id) => index.entryById.has(id)),
					);
				}
				if (Array.isArray(parsed.manualCollapsedIds)) {
					overrides.manualCollapsedIds = new Set(
						parsed.manualCollapsedIds.filter((id) => index.entryById.has(id)),
					);
				}
			}

			return overrides;
		}

		return null;
	} catch {
		return null;
	}
}
