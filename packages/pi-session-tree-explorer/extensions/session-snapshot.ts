import type {
	ActiveModelInfo,
	ComputeContextParams,
} from "./context-metrics.ts";
import { buildTreeIndex } from "./tree-index.ts";
import type { SessionEntry, TreeIndex } from "./types.ts";

/** Adapter-owned metadata; never decorate objects returned by SessionManager. */
export interface SessionSnapshot {
	sessionId: string;
	leafId: string | null;
	revision: number;
	activeModel?: ActiveModelInfo;
	activeUsage?: ComputeContextParams["activeUsage"];
	index: TreeIndex;
}
export interface SessionReader {
	getEntries(): readonly unknown[];
	getSessionId(): string;
	getLeafId(): string | null;
	getLabel(id: string): string | undefined;
}
export function captureSessionSnapshot(
	reader: SessionReader,
	revision = 1,
	evidence: Pick<SessionSnapshot, "activeModel" | "activeUsage"> = {},
): SessionSnapshot {
	const labels = new Map<string, string>();
	const entries = reader
		.getEntries()
		.filter(
			(raw): raw is SessionEntry =>
				!!raw &&
				typeof raw === "object" &&
				"id" in raw &&
				typeof raw.id === "string",
		)
		.map((entry) => {
			const label = reader.getLabel(entry.id);
			if (label) labels.set(entry.id, label);
			return Object.freeze({ ...entry });
		});
	return {
		sessionId: reader.getSessionId(),
		leafId: reader.getLeafId(),
		revision,
		index: buildTreeIndex(entries, labels),
		...evidence,
	};
}
