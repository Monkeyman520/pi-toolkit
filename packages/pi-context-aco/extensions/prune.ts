import type {
	ContextEditEntryDraft,
	SessionBoundaryDraft,
	SessionEntry,
} from "@earendil-works/pi-coding-agent";
import type { ACOMode } from "./config.ts";
import type { EvidenceStore, Receipt } from "./evidence.ts";
import { textTokens } from "./pressure.ts";
import type { SegmentCategory, TaskSnapshot } from "./tasks.ts";

export type AgentMessage = Record<string, unknown> & {
	role: string;
	content?: unknown;
};

interface ContextEditLike {
	type: "context_edit";
	targetId: string;
	replacement: { content: unknown } | null;
}

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
	mode: "request-projection" | "durable-edit";
	targetIds: string[];
	beforeTokens: number;
	afterTokens: number;
	reclaimedTokens: number;
	timestamp: number;
	drafts?: SessionBoundaryDraft[];
	error?: string;
}

function object(v: unknown): Record<string, unknown> {
	return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

function asContextEdit(entry: SessionEntry): ContextEditLike | undefined {
	if (entry.type === "context_edit" && "targetId" in entry) {
		const rec = entry as unknown as Record<string, unknown>;
		return {
			type: "context_edit",
			targetId: String(rec.targetId),
			replacement:
				rec.replacement === null
					? null
					: (rec.replacement as { content: unknown }),
		};
	}
	return undefined;
}

function getOmittedEntryIds(branch: readonly SessionEntry[]): Set<string> {
	const latestEdits = new Map<string, ContextEditLike>();
	for (const entry of branch) {
		const edit = asContextEdit(entry);
		if (edit) {
			latestEdits.set(edit.targetId, edit);
		}
	}
	const omitted = new Set<string>();
	for (const [targetId, edit] of latestEdits) {
		if (edit.replacement === null) {
			omitted.add(targetId);
		}
	}
	return omitted;
}

export function evaluatePruneCandidates(
	snapshot: TaskSnapshot,
	branch: readonly SessionEntry[],
	_receipts: readonly Receipt[],
	options: {
		mode: ACOMode;
		maxPruneTokens?: number;
	},
): PruneEvaluationResult {
	if (options.mode === "observe") {
		return {
			eligible: [],
			ineligible: [
				{
					referenceId: "*",
					reason: "V1 observe mode cannot execute exact pruning",
				},
			],
			totalEstimatedTokens: 0,
		};
	}

	const maxTokens = options.maxPruneTokens ?? 64000;
	const omittedOnBranch = getOmittedEntryIds(branch);
	const branchById = new Map(branch.map((e) => [e.id, e]));
	const eligible: PruneCandidate[] = [];
	const seenSources = new Set<string>();
	const ineligible: { referenceId: string; reason: string }[] = [];
	let totalEstimatedTokens = 0;

	for (const ref of snapshot.references) {
		const isCandidateKind =
			ref.completedResearch ||
			ref.redundant ||
			ref.reproducibleData ||
			ref.category === "completed-research" ||
			ref.category === "redundant-content" ||
			ref.category === "reproducible-data";

		if (!isCandidateKind) {
			continue;
		}

		if (ref.protectedReasons.length > 0) {
			ineligible.push({
				referenceId: ref.id,
				reason: `Protected: ${ref.protectedReasons.join("; ")}`,
			});
			continue;
		}

		if (ref.activeConsumers.length > 0) {
			ineligible.push({
				referenceId: ref.id,
				reason: `Active consumers depend on this reference: ${ref.activeConsumers.join(", ")}`,
			});
			continue;
		}

		if (ref.recoverability !== "recoverable" || !ref.storage?.verified) {
			ineligible.push({
				referenceId: ref.id,
				reason:
					"Unverified recovery: original source not verified in active-branch checkpoint",
			});
			continue;
		}

		let structurallyLegal = true;
		let pairedAssistantEntryId: string | undefined;

		for (const sourceId of ref.sourceEntryIds) {
			const entry = branchById.get(sourceId);
			if (!entry) {
				ineligible.push({
					referenceId: ref.id,
					reason: `Source entry ${sourceId} not found on active branch`,
				});
				structurallyLegal = false;
				break;
			}

			if (omittedOnBranch.has(sourceId)) {
				ineligible.push({
					referenceId: ref.id,
					reason: `Source entry ${sourceId} is already omitted on active branch`,
				});
				structurallyLegal = false;
				break;
			}

			if (entry.type === "message") {
				const m = entry.message;
				if (m.role === "user") {
					ineligible.push({
						referenceId: ref.id,
						reason:
							"User message contains user requirements/constraints and cannot be pruned",
					});
					structurallyLegal = false;
					break;
				}

				if (m.role === "toolResult") {
					const callId = String(object(m).toolCallId ?? "");
					const assistantEntry = branch.find((e) => {
						if (e.type !== "message" || e.message.role !== "assistant")
							return false;
						const content =
							"content" in e.message && Array.isArray(e.message.content)
								? (e.message.content as unknown[])
								: [];
						return content.some(
							(b) =>
								object(b).type === "toolCall" &&
								String(object(b).id) === callId,
						);
					});

					if (!assistantEntry) {
						ineligible.push({
							referenceId: ref.id,
							reason: `Cannot prune toolResult without paired assistant toolCall entry (${callId})`,
						});
						structurallyLegal = false;
						break;
					}

					const assistantContent =
						assistantEntry.type === "message" &&
						"content" in assistantEntry.message &&
						Array.isArray(assistantEntry.message.content)
							? (assistantEntry.message.content as unknown[])
							: [];
					const otherCalls = assistantContent.filter(
						(b) =>
							object(b).type === "toolCall" && String(object(b).id) !== callId,
					);

					if (otherCalls.length > 0) {
						ineligible.push({
							referenceId: ref.id,
							reason:
								"Paired assistant message has multiple tool calls; cannot omit exchange without breaking protocol",
						});
						structurallyLegal = false;
						break;
					}

					const assistantRef = snapshot.references.find((r) =>
						r.sourceEntryIds.includes(assistantEntry.id),
					);
					if (assistantRef?.protectedReasons.length) {
						ineligible.push({
							referenceId: ref.id,
							reason: `Paired assistant entry is protected: ${assistantRef.protectedReasons.join("; ")}`,
						});
						structurallyLegal = false;
						break;
					}

					pairedAssistantEntryId = assistantEntry.id;
				}
			}
		}

		if (!structurallyLegal) {
			continue;
		}

		const estTokens = ref.estimatedTokens ?? 100;
		if (totalEstimatedTokens + estTokens > maxTokens) {
			ineligible.push({
				referenceId: ref.id,
				reason: `Pruning would exceed budget limit (${maxTokens} tokens)`,
			});
			continue;
		}

		if (seenSources.has(ref.sourceEntryIds[0])) continue;
		seenSources.add(ref.sourceEntryIds[0]);
		totalEstimatedTokens += estTokens;
		eligible.push({
			referenceId: ref.id,
			sourceEntryId: ref.sourceEntryIds[0],
			category: ref.category,
			estimatedTokens: estTokens,
			checkpointId: ref.storage?.checkpointId ?? "",
			pairedEntryId: pairedAssistantEntryId,
		});
	}

	return {
		eligible,
		ineligible,
		totalEstimatedTokens,
	};
}

function matchMessageToEntry(msg: AgentMessage, entry: SessionEntry): boolean {
	if (entry.type !== "message") return false;
	const em = entry.message;
	if (msg.role !== em.role) return false;
	if (msg.role === "toolResult" && em.role === "toolResult") {
		return object(msg).toolCallId === object(em).toolCallId;
	}
	if (msg.role === "assistant" && em.role === "assistant") {
		return JSON.stringify(msg.content) === JSON.stringify(em.content);
	}
	if (msg.role === "user" && em.role === "user") {
		return JSON.stringify(msg.content) === JSON.stringify(em.content);
	}
	return false;
}

export function projectRequestContext(
	messages: AgentMessage[],
	candidates: readonly PruneCandidate[],
	branch: readonly SessionEntry[],
): ContextProjectionResult {
	const beforeMessages = messages.length;
	const beforeTokens = messages.reduce((n, m) => n + (textTokens(m) ?? 0), 0);

	if (!candidates.length) {
		return {
			messages,
			excludedEntryIds: [],
			beforeTokens,
			afterTokens: beforeTokens,
			reclaimedTokens: 0,
			beforeMessages,
			afterMessages: beforeMessages,
		};
	}

	const excludedEntryIds = new Set<string>();
	for (const c of candidates) {
		excludedEntryIds.add(c.sourceEntryId);
		if (c.pairedEntryId) {
			excludedEntryIds.add(c.pairedEntryId);
		}
	}

	const branchById = new Map(branch.map((e) => [e.id, e]));
	const excludedEntries = [...excludedEntryIds]
		.map((id) => branchById.get(id))
		.filter((e): e is SessionEntry => e !== undefined);

	const filtered: AgentMessage[] = [];
	for (const msg of messages) {
		const isExcluded = excludedEntries.some((entry) =>
			matchMessageToEntry(msg, entry),
		);
		if (!isExcluded) {
			filtered.push(msg);
		}
	}

	const toolCalls = new Set<string>();
	const toolResults = new Set<string>();

	for (const m of filtered) {
		if (m.role === "assistant" && Array.isArray(m.content)) {
			for (const b of m.content) {
				const obj = object(b);
				if (obj.type === "toolCall" && typeof obj.id === "string") {
					toolCalls.add(obj.id);
				}
			}
		} else if (
			m.role === "toolResult" &&
			typeof object(m).toolCallId === "string"
		) {
			toolResults.add(String(object(m).toolCallId));
		}
	}

	for (const callId of toolCalls) {
		if (!toolResults.has(callId)) {
			return {
				messages,
				excludedEntryIds: [],
				beforeTokens,
				afterTokens: beforeTokens,
				reclaimedTokens: 0,
				beforeMessages,
				afterMessages: beforeMessages,
			};
		}
	}

	for (const resultId of toolResults) {
		if (!toolCalls.has(resultId)) {
			return {
				messages,
				excludedEntryIds: [],
				beforeTokens,
				afterTokens: beforeTokens,
				reclaimedTokens: 0,
				beforeMessages,
				afterMessages: beforeMessages,
			};
		}
	}

	const hasUserOrAssistant = filtered.some(
		(m) => m.role === "user" || m.role === "assistant",
	);
	if (!hasUserOrAssistant) {
		return {
			messages,
			excludedEntryIds: [],
			beforeTokens,
			afterTokens: beforeTokens,
			reclaimedTokens: 0,
			beforeMessages,
			afterMessages: beforeMessages,
		};
	}

	const afterTokens = filtered.reduce((n, m) => n + (textTokens(m) ?? 0), 0);
	const reclaimedTokens = Math.max(0, beforeTokens - afterTokens);

	return {
		messages: filtered,
		excludedEntryIds: [...excludedEntryIds],
		beforeTokens,
		afterTokens,
		reclaimedTokens,
		beforeMessages,
		afterMessages: filtered.length,
	};
}

export function createPruneBoundaryDrafts(
	candidates: readonly PruneCandidate[],
	branch: readonly SessionEntry[],
	existingDrafts: readonly SessionBoundaryDraft[] = [],
): {
	drafts: SessionBoundaryDraft[];
	prunedTargetIds: string[];
	beforeTokens: number;
	afterTokens: number;
	reclaimedTokens: number;
} {
	const omittedOnBranch = getOmittedEntryIds(branch);
	const draftsInEvent = new Set(
		existingDrafts
			.filter(
				(
					d,
				): d is SessionBoundaryDraft & {
					type: "context_edit";
					targetId: string;
				} => d.type === "context_edit" && "targetId" in d,
			)
			.map((d) => d.targetId),
	);

	const targetIdsToOmit: string[] = [];
	for (const c of candidates) {
		if (
			!omittedOnBranch.has(c.sourceEntryId) &&
			!draftsInEvent.has(c.sourceEntryId) &&
			!targetIdsToOmit.includes(c.sourceEntryId)
		) {
			targetIdsToOmit.push(c.sourceEntryId);
		}
		if (
			c.pairedEntryId &&
			!omittedOnBranch.has(c.pairedEntryId) &&
			!draftsInEvent.has(c.pairedEntryId) &&
			!targetIdsToOmit.includes(c.pairedEntryId)
		) {
			targetIdsToOmit.push(c.pairedEntryId);
		}
	}

	if (!targetIdsToOmit.length) {
		return {
			drafts: [...existingDrafts],
			prunedTargetIds: [],
			beforeTokens: 0,
			afterTokens: 0,
			reclaimedTokens: 0,
		};
	}

	const branchById = new Map(branch.map((e) => [e.id, e]));
	let beforeTokens = 0;
	const newDrafts: SessionBoundaryDraft[] = [];

	for (const targetId of targetIdsToOmit) {
		const entry = branchById.get(targetId);
		if (entry?.type === "message") {
			beforeTokens += textTokens(entry.message) ?? 0;
		}
		newDrafts.push({
			type: "context_edit",
			targetId,
			replacement: null,
		});
	}

	return {
		drafts: [...existingDrafts, ...newDrafts],
		prunedTargetIds: targetIdsToOmit,
		beforeTokens,
		afterTokens: 0,
		reclaimedTokens: beforeTokens,
	};
}

export async function createRestoreBoundaryDrafts(
	targetId: string,
	branch: readonly SessionEntry[],
	_store: EvidenceStore,
	receipts: readonly Receipt[],
	existingDrafts: readonly SessionBoundaryDraft[] = [],
): Promise<{
	drafts: SessionBoundaryDraft[];
	restoredTargetIds: string[];
	error?: string;
}> {
	const omittedOnBranch = getOmittedEntryIds(branch);
	const targets =
		targetId === "all"
			? [...omittedOnBranch]
			: omittedOnBranch.has(targetId)
				? [targetId]
				: [];

	if (!targets.length) {
		return {
			drafts: [...existingDrafts],
			restoredTargetIds: [],
			error:
				targetId === "all"
					? "No omitted entries to restore"
					: `Target ${targetId} is not currently omitted`,
		};
	}

	const restoreDrafts: SessionBoundaryDraft[] = [];
	const restoredTargetIds: string[] = [];

	for (const tid of targets) {
		let matchingReceipt: Receipt | undefined;
		for (const r of receipts) {
			matchingReceipt = r;
			break;
		}

		if (!matchingReceipt) {
			return {
				drafts: [...existingDrafts],
				restoredTargetIds,
				error: `No verified receipt found on active branch to restore ${tid}`,
			};
		}

		try {
			const originalEntry = branch.find((e) => e.id === tid);
			if (originalEntry?.type !== "message") {
				continue;
			}

			const content =
				"content" in originalEntry.message
					? (originalEntry.message as { content: unknown }).content
					: "";

			const draft: ContextEditEntryDraft = {
				type: "context_edit",
				targetId: tid,
				replacement: {
					content: content as NonNullable<
						ContextEditEntryDraft["replacement"]
					>["content"],
				},
			};
			restoreDrafts.push(draft);
			restoredTargetIds.push(tid);
		} catch (error) {
			return {
				drafts: [...existingDrafts],
				restoredTargetIds,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	}

	return {
		drafts: [...existingDrafts, ...restoreDrafts],
		restoredTargetIds,
	};
}

export function reconcileBranchPrunes(
	branch: readonly SessionEntry[],
	receipts: readonly Receipt[],
): {
	omittedTargetIds: string[];
	verifiedTargetIds: string[];
	unverifiedTargetIds: string[];
	issues: string[];
} {
	const omitted = getOmittedEntryIds(branch);
	const omittedTargetIds = [...omitted];
	const verifiedTargetIds: string[] = [];
	const unverifiedTargetIds: string[] = [];
	const issues: string[] = [];

	for (const tid of omittedTargetIds) {
		if (receipts.length > 0) {
			verifiedTargetIds.push(tid);
		} else {
			unverifiedTargetIds.push(tid);
			issues.push(
				`Omitted entry ${tid} has no verified recovery receipt on active branch`,
			);
		}
	}

	return {
		omittedTargetIds,
		verifiedTargetIds,
		unverifiedTargetIds,
		issues,
	};
}
