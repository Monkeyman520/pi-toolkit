import { createHash, randomUUID } from "node:crypto";
import type {
	SessionBoundaryDraft,
	SessionEntry,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { Check } from "typebox/value";

const digest = (value: unknown) =>
	createHash("sha256").update(JSON.stringify(value)).digest("hex");
const actionSchema = Type.Object(
	{
		version: Type.Literal(1),
		id: Type.String({ maxLength: 128 }),
		kind: Type.Union([
			Type.Literal("prune"),
			Type.Literal("restore"),
			Type.Literal("semantic"),
		]),
		targets: Type.Array(
			Type.Object({
				id: Type.String(),
				digest: Type.String({ pattern: "^[a-f0-9]{64}$" }),
			}),
			{ maxItems: 128 },
		),
		checkpointIds: Type.Array(Type.String(), { maxItems: 64 }),
		beforeTokens: Type.Number(),
		afterTokens: Type.Number(),
		timestamp: Type.Number(),
	},
	{ additionalProperties: false },
);
export function actionDrafts(
	kind: "prune" | "restore" | "semantic",
	edits: readonly SessionBoundaryDraft[],
	checkpointIds: string[],
	beforeTokens: number,
	afterTokens: number,
	actionId: string = randomUUID(),
): SessionBoundaryDraft[] {
	const targets = edits
		.filter((d) => d.type === "context_edit")
		.map((d) => ({ id: d.targetId, digest: digest(d.replacement) }));
	if (!targets.length) return [...edits];
	return [
		{
			type: "custom",
			customType: "aco-context-action",
			data: {
				version: 1,
				id: actionId,
				kind,
				targets,
				checkpointIds,
				beforeTokens,
				afterTokens,
				timestamp: Date.now(),
			},
		},
		...edits,
	];
}
export function reconcileActions(branch: readonly SessionEntry[]) {
	return branch.flatMap((entry, index) => {
		if (
			entry.type !== "custom" ||
			entry.customType !== "aco-context-action" ||
			!Check(actionSchema, entry.data)
		)
			return [];
		const action = entry.data;
		const nextAction = branch.findIndex(
			(e, i) =>
				i > index &&
				e.type === "custom" &&
				e.customType === "aco-context-action",
		);
		const following = branch.slice(
			index + 1,
			nextAction < 0 ? undefined : nextAction,
		);
		const observedTargetIds = action.targets
			.filter((target) => {
				const edit = following.find(
					(e) => e.type === "context_edit" && e.targetId === target.id,
				);
				return (
					edit?.type === "context_edit" &&
					digest(edit.replacement) === target.digest
				);
			})
			.map((t) => t.id);
		const status =
			observedTargetIds.length === action.targets.length
				? "committed"
				: observedTargetIds.length
					? "partial"
					: "not-committed";
		return [
			{
				...action,
				status,
				success: status === "committed",
				observedTargetIds,
				recovery:
					"Re-verify active scoped checkpoints before restoration; never blindly replay a partial action.",
			},
		];
	});
}
