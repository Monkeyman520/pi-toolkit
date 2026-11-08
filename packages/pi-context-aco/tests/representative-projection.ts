import { createHash } from "node:crypto";
import { appendFileSync } from "node:fs";
import { join } from "node:path";
import {
	buildSessionProjection,
	type ExtensionAPI,
	type SessionEntry,
} from "@earendil-works/pi-coding-agent";
import { reconcileActions } from "../extensions/actions.ts";

const object = (v: unknown): Record<string, unknown> =>
	v !== null && typeof v === "object" ? (v as Record<string, unknown>) : {};
const hash = (value: unknown) =>
	createHash("sha256")
		.update(JSON.stringify(value) ?? "null")
		.digest("hex");
/** Numeric/hash-only observation; no prompt bodies, headers or credentials persisted here. */
export function projectionSummary(messages: readonly unknown[]) {
	return {
		messageCount: messages.length,
		serializedBytes: Buffer.byteLength(JSON.stringify(messages)),
		messages: messages.map((value) => {
			const m = object(value);
			return {
				role: m.role,
				toolCallId: m.toolCallId ?? null,
				contentHash: hash(m.content),
				contentCodeUnits: JSON.stringify(m.content ?? null).length,
			};
		}),
	};
}
/** Logical preview only: never write it into the live session or send another model request. */
export function comparePrunedProjection(branch: readonly SessionEntry[]) {
	const ids = new Set<string>();
	for (const action of reconcileActions(branch).filter(
		(a) => a.kind === "prune" && a.success,
	)) {
		const start = branch.findIndex(
			(e) =>
				e.type === "custom" &&
				e.customType === "aco-context-action" &&
				object(e.data).id === action.id,
		);
		const next = branch.findIndex(
			(e, i) =>
				i > start &&
				e.type === "custom" &&
				e.customType === "aco-context-action",
		);
		const window = branch.slice(start + 1, next < 0 ? undefined : next);
		for (const target of action.observedTargetIds) {
			const edit = window.find(
				(e) =>
					e.type === "context_edit" &&
					e.targetId === target &&
					e.replacement === null,
			);
			if (edit) ids.add(edit.id);
		}
	}
	const actual = projectionSummary(
		buildSessionProjection([...branch]).messages,
	);
	const preview = branch.map((e) =>
		ids.has(e.id)
			? {
					id: e.id,
					parentId: e.parentId,
					timestamp: e.timestamp,
					type: "custom" as const,
					customType: "evaluation-neutralized-prune",
					data: null,
				}
			: e,
	);
	const withoutPrune = projectionSummary(
		buildSessionProjection(preview).messages,
	);
	return {
		actual,
		withoutPrune,
		removedMessages: withoutPrune.messageCount - actual.messageCount,
		removedBytes: withoutPrune.serializedBytes - actual.serializedBytes,
		neutralizedEditIds: [...ids],
		scope:
			"Exact same branch logical projection with only observed committed ACO prune edits neutralized; bytes, not provider token savings or invoice cost.",
	};
}
export function installProjectionProbe(
	pi: ExtensionAPI,
	root: string,
	stage: "before" | "after",
) {
	let sequence = 0;
	pi.on("context", (event, ctx) => {
		appendFileSync(
			join(root, "projections.jsonl"),
			JSON.stringify({
				at: Date.now(),
				stage,
				sequence: ++sequence,
				...projectionSummary(event.messages),
				sameBranch: comparePrunedProjection(ctx.sessionManager.getBranch()),
			}) + "\n",
		);
	});
}
