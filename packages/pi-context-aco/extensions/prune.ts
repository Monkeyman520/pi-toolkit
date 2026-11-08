import {
	buildSessionProjection,
	type ContextEditEntryDraft,
	type SessionBoundaryDraft,
	type SessionEntry,
} from "@earendil-works/pi-coding-agent";
import type { ACOMode } from "./config.ts";
import type { VerifiedCheckpoint } from "./continuity.ts";
import { textTokens } from "./pressure.ts";
import type { SegmentCategory, TaskSnapshot } from "./tasks.ts";

export type AgentMessage = Record<string, unknown> & {
	role: string;
	content?: unknown;
};
export interface PruneCandidate {
	referenceId: string;
	sourceEntryId: string;
	category: SegmentCategory;
	estimatedTokens: number;
	checkpointId: string;
	pairedEntryId?: string;
}
export interface PruneEvaluationResult {
	eligible: PruneCandidate[];
	ineligible: { referenceId: string; reason: string }[];
	totalEstimatedTokens: number;
}
export interface ContextProjectionResult {
	messages: AgentMessage[];
	excludedEntryIds: string[];
	beforeTokens: number;
	afterTokens: number;
	reclaimedTokens: number;
	beforeMessages: number;
	afterMessages: number;
}
export interface PruneExecutionOutcome {
	success: boolean;
	status?: "proposed" | "committed" | "partial" | "not-committed";
	mode: "request-projection" | "durable-edit";
	targetIds: string[];
	beforeTokens: number;
	afterTokens: number;
	reclaimedTokens: number;
	timestamp: number;
	drafts?: SessionBoundaryDraft[];
	error?: string;
}
const object = (v: unknown): Record<string, unknown> =>
	v && typeof v === "object" ? (v as Record<string, unknown>) : {};
export function messageTokens(message: unknown): number | null {
	const m = object(message);
	const content = m.content;
	if (typeof content === "string") return Math.ceil(content.length / 4);
	if (
		!Array.isArray(content) ||
		content.some((b) => !["text", "toolCall"].includes(String(object(b).type)))
	)
		return null;
	return textTokens(message) ?? Math.ceil(JSON.stringify(content).length / 4);
}
export function latestEdits(branch: readonly SessionEntry[]) {
	const edits = new Map<string, ContextEditEntryDraft["replacement"]>();
	for (const e of branch)
		if (e.type === "context_edit") edits.set(e.targetId, e.replacement);
	return edits;
}
export function verifiedOriginal(
	id: string,
	branch: readonly SessionEntry[],
	checkpoints: readonly VerifiedCheckpoint[],
) {
	const entry = branch.find((e) => e.id === id);
	if (!entry) return undefined;
	const raw = JSON.stringify(entry);
	for (const checkpoint of checkpoints)
		if (checkpoint.originals.get(id) === raw)
			return {
				checkpointId: checkpoint.id,
				entry: JSON.parse(raw) as SessionEntry,
			};
	return undefined;
}
export function legalMessages(
	messages: readonly { role: string; content?: unknown }[],
) {
	const pending = new Map<string, string>();
	const seen = new Set<string>();
	for (const m of messages) {
		if (m.role === "toolResult") {
			const id = object(m).toolCallId;
			if (
				typeof id !== "string" ||
				!pending.has(id) ||
				pending.get(id) !== object(m).toolName
			)
				return false;
			pending.delete(id);
		} else {
			if (pending.size) return false;
			if (m.role === "assistant" && Array.isArray(m.content))
				for (const block of m.content) {
					const b = object(block);
					if (b.type !== "toolCall") continue;
					if (
						typeof b.id !== "string" ||
						typeof b.name !== "string" ||
						seen.has(b.id)
					)
						return false;
					pending.set(b.id, b.name);
					seen.add(b.id);
				}
		}
	}
	return pending.size === 0;
}
export function previewEdits(
	branch: readonly SessionEntry[],
	drafts: readonly SessionBoundaryDraft[],
) {
	const entries = [...branch];
	for (const [i, draft] of drafts.entries())
		entries.push({
			...draft,
			id: `aco-preview-${i}`,
			parentId: entries.at(-1)?.id ?? null,
			timestamp: "preview",
		} as SessionEntry);
	return buildSessionProjection(entries).messages;
}
export function validateEdits(
	branch: readonly SessionEntry[],
	drafts: readonly SessionBoundaryDraft[],
) {
	try {
		return legalMessages(previewEdits(branch, drafts));
	} catch {
		return false;
	}
}
function calls(entry: SessionEntry) {
	return entry.type === "message" &&
		entry.message.role === "assistant" &&
		Array.isArray(entry.message.content)
		? entry.message.content.filter((b) => b.type === "toolCall")
		: [];
}
export function exchangeTargets(
	id: string,
	branch: readonly SessionEntry[],
): string[] {
	const entry = branch.find((e) => e.id === id);
	if (entry?.type !== "message") return [id];
	if (entry.message.role === "toolResult") {
		const callId = entry.message.toolCallId;
		const assistant = branch.find((e) => calls(e).some((c) => c.id === callId));
		return assistant
			? [...new Set([id, ...exchangeTargets(assistant.id, branch)])]
			: [id];
	}
	const toolCalls = calls(entry);
	return [
		...new Set([
			id,
			...branch
				.filter(
					(e) =>
						e.type === "message" &&
						e.message.role === "toolResult" &&
						toolCalls.some(
							(c) => c.id === (e.message as { toolCallId?: string }).toolCallId,
						),
				)
				.map((e) => e.id),
		]),
	];
}
export function evaluatePruneCandidates(
	snapshot: TaskSnapshot,
	branch: readonly SessionEntry[],
	checkpoints: readonly VerifiedCheckpoint[],
	options: { mode: ACOMode; maxPruneTokens?: number },
): PruneEvaluationResult {
	const result: PruneEvaluationResult = {
		eligible: [],
		ineligible: [],
		totalEstimatedTokens: 0,
	};
	if (options.mode !== "exact-prune" && options.mode !== "adaptive") {
		result.ineligible.push({
			referenceId: "*",
			reason:
				options.mode === "observe"
					? "V1 observe mode cannot execute exact pruning"
					: "Exact pruning requires exact-prune mode",
		});
		return result;
	}
	const edits = latestEdits(branch);
	const seen = new Set<string>();
	for (const ref of snapshot.references) {
		if (!(ref.completedResearch || ref.redundant || ref.reproducibleData))
			continue;
		let reason = "";
		const id = ref.sourceEntryIds[0];
		const source = branch.find((e) => e.id === id);
		const group = exchangeTargets(id, branch);
		if (ref.protectedReasons.length)
			reason = `Protected: ${ref.protectedReasons.join("; ")}`;
		else if (ref.activeConsumers.length)
			reason = "Active consumers depend on this reference";
		else if (
			snapshot.coverage !== "complete" ||
			ref.sourceEntryIds.length !== 1
		)
			reason = "Incomplete analysis or multi-source candidate";
		else if (source?.type !== "message" || source.message.role === "user")
			reason = "Only expendable assistant/tool messages can be pruned";
		else if (source.message.role === "assistant" && calls(source).length)
			reason = "Cannot prune a tool call independently of its result";
		else if (source.message.role === "toolResult" && group.length < 2)
			reason = "Missing paired assistant toolCall";
		else if (group.length > 2)
			reason =
				"Paired assistant message has multiple tool calls; cannot omit exchange without breaking protocol";
		else if (
			group.some((t) => {
				const e = branch.find((e) => e.id === t);
				return (
					e?.type === "message" &&
					e.message.role === "assistant" &&
					e.message.content.some((b) => b.type !== "toolCall")
				);
			})
		)
			reason = "Paired assistant carries additional reasoning or text";
		else if (group.some((t) => edits.has(t)))
			reason = "Source already edited on active branch";
		else if (group.some((t) => !verifiedOriginal(t, branch, checkpoints)))
			reason =
				"Unverified recovery: original source or paired assistant not verified in active-branch checkpoint";
		else if (
			group.some((t) =>
				snapshot.references.some(
					(r) =>
						r.sourceEntryIds.includes(t) &&
						(r.protectedReasons.length || r.activeConsumers.length),
				),
			)
		)
			reason = "Paired source is protected";
		const size = group.reduce((n, t) => {
			const e = branch.find((e) => e.id === t);
			return (
				n +
				(e?.type === "message"
					? (messageTokens(e.message) ?? Number.POSITIVE_INFINITY)
					: Number.POSITIVE_INFINITY)
			);
		}, 0);
		if (
			!reason &&
			result.totalEstimatedTokens + size > (options.maxPruneTokens ?? 64000)
		)
			reason = "Pruning would exceed budget limit";
		if (reason) {
			result.ineligible.push({ referenceId: ref.id, reason });
			continue;
		}
		if (group.some((t) => seen.has(t))) continue;
		for (const t of group) seen.add(t);
		result.totalEstimatedTokens += size;
		result.eligible.push({
			referenceId: ref.id,
			sourceEntryId: id,
			category: ref.category,
			estimatedTokens: size,
			checkpointId:
				verifiedOriginal(id, branch, checkpoints)?.checkpointId ?? "",
			pairedEntryId: group.find((t) => t !== id),
		});
	}
	return result;
}
export function projectRequestContext(
	messages: AgentMessage[],
	candidates: readonly PruneCandidate[],
	branch: readonly SessionEntry[],
): ContextProjectionResult {
	const beforeTokens = messages.reduce(
		(n, m) => n + (messageTokens(m) ?? 0),
		0,
	);
	const unchanged = (): ContextProjectionResult => ({
		messages,
		excludedEntryIds: [],
		beforeTokens,
		afterTokens: beforeTokens,
		reclaimedTokens: 0,
		beforeMessages: messages.length,
		afterMessages: messages.length,
	});
	const ids = [
		...new Set(
			candidates.flatMap((c) => [
				c.sourceEntryId,
				...(c.pairedEntryId ? [c.pairedEntryId] : []),
			]),
		),
	];
	const indexes = new Set<number>();
	for (const id of ids) {
		const entry = branch.find((e) => e.id === id);
		if (entry?.type !== "message") return unchanged();
		const matches = messages
			.map((m, i) => ({ m, i }))
			.filter(
				({ m }) =>
					m.role === entry.message.role &&
					JSON.stringify(m.content) ===
						JSON.stringify(object(entry.message).content) &&
					(m.role !== "toolResult" ||
						object(m).toolCallId === object(entry.message).toolCallId),
			);
		if (matches.length !== 1) return unchanged();
		indexes.add(matches[0].i);
	}
	const filtered = messages.filter((_, i) => !indexes.has(i));
	if (
		!legalMessages(filtered) ||
		!filtered.some((m) => m.role === "user" || m.role === "assistant")
	)
		return unchanged();
	const afterTokens = filtered.reduce((n, m) => n + (messageTokens(m) ?? 0), 0);
	return {
		messages: filtered,
		excludedEntryIds: ids,
		beforeTokens,
		afterTokens,
		reclaimedTokens: Math.max(0, beforeTokens - afterTokens),
		beforeMessages: messages.length,
		afterMessages: filtered.length,
	};
}
export function createPruneBoundaryDrafts(
	candidates: readonly PruneCandidate[],
	branch: readonly SessionEntry[],
	existingDrafts: readonly SessionBoundaryDraft[] = [],
) {
	const occupied = new Set(
		existingDrafts
			.filter((d) => d.type === "context_edit")
			.map((d) => d.targetId),
	);
	const edits = latestEdits(branch);
	const targets = new Set<string>();
	for (const c of candidates) {
		const group = [
			c.sourceEntryId,
			...(c.pairedEntryId ? [c.pairedEntryId] : []),
		];
		if (group.some((id) => edits.has(id) || occupied.has(id))) continue;
		for (const id of group) targets.add(id);
	}
	const additions: SessionBoundaryDraft[] = [...targets].map((targetId) => ({
		type: "context_edit",
		targetId,
		replacement: null,
	}));
	const drafts = [...existingDrafts, ...additions];
	if (!validateEdits(branch, drafts)) {
		return {
			drafts: [...existingDrafts],
			prunedTargetIds: [],
			beforeTokens: 0,
			afterTokens: 0,
			reclaimedTokens: 0,
		};
	}
	const beforeTokens = [...targets].reduce((n, id) => {
		const e = branch.find((e) => e.id === id);
		return n + (e?.type === "message" ? (messageTokens(e.message) ?? 0) : 0);
	}, 0);
	return {
		drafts,
		prunedTargetIds: [...targets],
		beforeTokens,
		afterTokens: 0,
		reclaimedTokens: beforeTokens,
	};
}
export async function createRestoreBoundaryDrafts(
	targetId: string,
	branch: readonly SessionEntry[],
	checkpoints: readonly VerifiedCheckpoint[],
	existingDrafts: readonly SessionBoundaryDraft[] = [],
): Promise<{
	drafts: SessionBoundaryDraft[];
	restoredTargetIds: string[];
	error?: string;
}> {
	const fail = (error: string) => ({
		drafts: [...existingDrafts],
		restoredTargetIds: [],
		error,
	});
	const edits = latestEdits(branch);
	const modified = [...edits]
		.filter(([id, value]) => {
			const e = branch.find((e) => e.id === id);
			return (
				e?.type !== "message" ||
				JSON.stringify(value?.content) !==
					JSON.stringify(object(e.message).content)
			);
		})
		.map(([id]) => id);
	const selected =
		targetId === "all"
			? modified
			: modified.includes(targetId)
				? [targetId]
				: [];
	if (!selected.length) return fail("No edited entries to restore");
	const targets = [
		...new Set(selected.flatMap((id) => exchangeTargets(id, branch))),
	].filter((id) => modified.includes(id));
	const occupied = new Set(
		existingDrafts
			.filter((d) => d.type === "context_edit")
			.map((d) => d.targetId),
	);
	const additions: SessionBoundaryDraft[] = [];
	for (const id of targets) {
		if (occupied.has(id)) return fail("Conflicting restoration draft");
		const verified = verifiedOriginal(id, branch, checkpoints);
		if (
			verified?.entry.type !== "message" ||
			!("content" in verified.entry.message)
		)
			return fail(
				`No verified original found on active branch to restore ${id}`,
			);
		additions.push({
			type: "context_edit",
			targetId: id,
			replacement: { content: verified.entry.message.content },
		});
	}
	const drafts = [...existingDrafts, ...additions];
	if (!validateEdits(branch, drafts))
		return fail("Restoration would leave invalid tool relationships");
	return { drafts, restoredTargetIds: targets };
}
export function reconcileBranchPrunes(
	branch: readonly SessionEntry[],
	checkpoints: readonly VerifiedCheckpoint[],
) {
	const omittedTargetIds = [...latestEdits(branch)]
		.filter(([, v]) => v === null)
		.map(([id]) => id);
	const verifiedTargetIds = omittedTargetIds.filter((id) =>
		verifiedOriginal(id, branch, checkpoints),
	);
	const unverifiedTargetIds = omittedTargetIds.filter(
		(id) => !verifiedTargetIds.includes(id),
	);
	return {
		omittedTargetIds,
		verifiedTargetIds,
		unverifiedTargetIds,
		issues: unverifiedTargetIds.map(
			(id) =>
				`Omitted entry ${id} has no verified recovery receipt on active branch`,
		),
	};
}

/** Exact request-local repair only after an explicit restore was scheduled; no durable replay. */
export async function restoreRequestContext(
	messages: { role: string; content?: unknown }[],
	branch: readonly SessionEntry[],
	checkpoints: readonly VerifiedCheckpoint[],
	roots: readonly string[],
): Promise<{ role: string; content?: unknown }[]> {
	if (legalMessages(messages)) return messages;
	let drafts: SessionBoundaryDraft[] = [];
	for (const root of roots) {
		const restore = await createRestoreBoundaryDrafts(
			root,
			branch,
			checkpoints,
			drafts,
		);
		if (restore.error) throw Error(restore.error);
		drafts = restore.drafts;
	}
	const recovered = previewEdits(branch, drafts);
	const restored = [...messages];
	const edits = latestEdits(branch);
	const serialized = (m: unknown) => JSON.stringify(m);
	for (const draft of drafts) {
		if (draft.type !== "context_edit" || edits.get(draft.targetId) !== null)
			continue;
		const original = verifiedOriginal(
			draft.targetId,
			branch,
			checkpoints,
		)?.entry;
		if (original?.type !== "message")
			throw Error("No verified original for request restoration");
		const value = serialized(original.message);
		if (restored.some((m) => serialized(m) === value)) continue;
		const positions = recovered.flatMap((m, i) =>
			serialized(m) === value ? [i] : [],
		);
		if (positions.length !== 1) throw Error("Ambiguous restoration source");
		const locate = (m: unknown) =>
			restored.flatMap((candidate, i) =>
				serialized(candidate) === serialized(m) ? [i] : [],
			);
		let insertion: number | undefined;
		for (
			let distance = 1;
			distance < recovered.length && insertion === undefined;
			distance++
		) {
			const next = recovered[positions[0] + distance];
			const previous = recovered[positions[0] - distance];
			if (next) {
				const matches = locate(next);
				if (matches.length === 1) insertion = matches[0];
			}
			if (insertion === undefined && previous) {
				const matches = locate(previous);
				if (matches.length === 1) insertion = matches[0] + 1;
			}
		}
		if (insertion === undefined)
			throw Error("No unambiguous request restoration anchor");
		restored.splice(insertion, 0, original.message);
	}
	if (!legalMessages(restored))
		throw Error("Request restoration cannot preserve legal tool relationships");
	return restored;
}
