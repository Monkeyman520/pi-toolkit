import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Type } from "typebox";
import { Check } from "typebox/value";
import { DisplayConfigSchema } from "./config-schema.ts";
import type { DisplayOptions, ExplorerState, TreeIndex } from "./types.ts";

const ViewStateSchema = Type.Object(
	{
		version: Type.Literal(1),
		sessionId: Type.String(),
		focusedBranchId: Type.Optional(Type.Union([Type.String(), Type.Null()])),
		displayOptions: Type.Optional(
			Type.Object(
				{
					...DisplayConfigSchema.properties,
					userOnly: Type.Optional(Type.Boolean()),
					branchOnly: Type.Optional(Type.Boolean()),
					labeledOnly: Type.Optional(Type.Boolean()),
				},
				{ additionalProperties: false },
			),
		),
		showDetails: Type.Optional(Type.Boolean()),
		showContext: Type.Optional(Type.Boolean()),
		manualExpandedIds: Type.Optional(Type.Array(Type.String())),
		manualCollapsedIds: Type.Optional(Type.Array(Type.String())),
	},
	{ additionalProperties: false },
);
export type LoadedViewState = Partial<Omit<ExplorerState, "displayOptions">> & {
	displayOptions?: Partial<DisplayOptions>;
};

export interface SessionViewState {
	version: number;
	sessionId: string;
	focusedBranchId?: string | null;
	displayOptions?: Partial<DisplayOptions>;
	showDetails?: boolean;
	showContext?: boolean;
	manualExpandedIds?: string[];
	manualCollapsedIds?: string[];
}

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

/**
 * Persist allowed view state properties outside Session JSONL.
 * Never pollutes session history with CustomEntry noise.
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

	// Collect only permitted state (excludes temporary search data, reveals, and tasks)
	const data: SessionViewState = {
		version: 1,
		sessionId,
		focusedBranchId: state.focusedBranchId,
		displayOptions: { ...state.displayOptions },
		showDetails: state.showDetails,
		showContext: state.showContext,
		manualExpandedIds: Array.from(state.manualExpandedIds),
		manualCollapsedIds: Array.from(state.manualCollapsedIds),
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
 * Load persisted view state for a session, filtering out stale entry IDs.
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
		if (!Check(ViewStateSchema, parsed) || parsed.sessionId !== sessionId)
			return null;
		const data = parsed;

		const overrides: LoadedViewState = {};

		if (data.displayOptions) {
			overrides.displayOptions = {
				...overrides.displayOptions,
				...data.displayOptions,
			} as DisplayOptions;
		}

		if (typeof data.showDetails === "boolean") {
			overrides.showDetails = data.showDetails;
		}

		if (typeof data.showContext === "boolean") {
			overrides.showContext = data.showContext;
		}

		if (data.focusedBranchId && index.entryById.has(data.focusedBranchId)) {
			overrides.focusedBranchId = data.focusedBranchId;
		}

		if (rememberManualOverrides) {
			if (Array.isArray(data.manualExpandedIds)) {
				// Only keep valid existing entry IDs, ignore stale IDs
				const validExpanded = data.manualExpandedIds.filter((id) =>
					index.entryById.has(id),
				);
				overrides.manualExpandedIds = new Set(validExpanded);
			}

			if (Array.isArray(data.manualCollapsedIds)) {
				const validCollapsed = data.manualCollapsedIds.filter((id) =>
					index.entryById.has(id),
				);
				overrides.manualCollapsedIds = new Set(validCollapsed);
			}
		}

		return overrides;
	} catch {
		return null;
	}
}
