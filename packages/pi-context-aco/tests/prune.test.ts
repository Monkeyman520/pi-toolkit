import type {
	CustomEntryDraft,
	SessionEntry,
} from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import type { VerifiedCheckpoint } from "../extensions/continuity.ts";
import {
	type AgentMessage,
	createPruneBoundaryDrafts,
	createRestoreBoundaryDrafts,
	evaluatePruneCandidates,
	projectRequestContext,
	reconcileBranchPrunes,
} from "../extensions/prune.ts";
import { buildTasks, linkCheckpoints } from "../extensions/tasks.ts";

const _base = (id: string, parentId: string | null = null): SessionEntry => ({
	id,
	parentId,
	timestamp: "2026-11-05T00:00:00Z",
	type: "custom",
	customType: "test",
});

const user = (
	id: string,
	text: string,
	parentId: string | null = null,
): SessionEntry => ({
	id,
	parentId,
	timestamp: "2026-11-05T00:00:00Z",
	type: "message",
	message: { role: "user", content: text, timestamp: 1 },
});

const _assistant = (
	id: string,
	content: unknown,
	parentId: string | null = null,
): SessionEntry =>
	({
		id,
		parentId,
		timestamp: "2026-11-05T00:00:00Z",
		type: "message",
		message: {
			role: "assistant",
			content:
				typeof content === "string"
					? [{ type: "text", text: content }]
					: content,
			timestamp: 1,
		},
	}) as unknown as SessionEntry;

const toolCall = (
	id: string,
	callId: string,
	name: string,
	args: Record<string, unknown> = {},
	parentId: string | null = null,
): SessionEntry =>
	({
		id,
		parentId,
		timestamp: "2026-11-05T00:00:00Z",
		type: "message",
		message: {
			role: "assistant",
			content: [{ type: "toolCall", id: callId, name, arguments: args }],
			timestamp: 1,
		},
	}) as unknown as SessionEntry;

const toolResult = (
	id: string,
	callId: string,
	name: string,
	text: string,
	isError = false,
	parentId: string | null = null,
): SessionEntry =>
	({
		id,
		parentId,
		timestamp: "2026-11-05T00:00:00Z",
		type: "message",
		message: {
			role: "toolResult",
			toolCallId: callId,
			toolName: name,
			content: [{ type: "text", text }],
			isError,
			timestamp: 1,
		},
	}) as unknown as SessionEntry;

const taskNote = (
	id: string,
	update: unknown,
	parentId: string | null = null,
): SessionEntry => ({
	id,
	parentId,
	timestamp: "2026-11-05T00:00:00Z",
	type: "custom",
	customType: "aco-task",
	data: { version: 1, origin: "command", update },
});

const contextEdit = (
	id: string,
	targetId: string,
	replacement: { content: unknown } | null,
	parentId: string | null = null,
): SessionEntry =>
	({
		id,
		parentId,
		timestamp: "2026-11-05T00:00:00Z",
		type: "context_edit",
		targetId,
		replacement,
	}) as SessionEntry;

const mockReceipt = (
	id: string,
	_anchorId: string,
	segmentIds: string[],
	branch: readonly SessionEntry[],
): VerifiedCheckpoint => ({
	id,
	segmentIds,
	originals: new Map(
		branch
			.filter((e) => segmentIds.includes(e.id))
			.map((e) => [e.id, JSON.stringify(e)]),
	),
});

describe("V2 recovery-gated exact pruning candidate evaluation (C1, C2, C3)", () => {
	it("disables pruning in V1 observe mode even when completedResearch candidates exist", () => {
		const branch: SessionEntry[] = [
			user("u1", "Investigate something"),
			toolCall("a1", "c1", "read", { path: "doc.txt" }, "u1"),
			toolResult("r1", "c1", "read", "Historical facts...", false, "a1"),
			taskNote(
				"n1",
				{
					taskId: "task:u1",
					active: true,
					references: [
						{
							id: "ref:research",
							kind: "evidence",
							sourceEntryIds: ["r1"],
							completedResearch: true,
						},
					],
				},
				"r1",
			),
		];

		const snapshot = buildTasks(branch);
		const receipt = mockReceipt("ckpt-1", "n1", ["continuity", "r1"], branch);
		linkCheckpoints(snapshot, [{ id: "ckpt-1", segmentIds: ["r1"] }]);

		const evalResult = evaluatePruneCandidates(snapshot, branch, [receipt], {
			mode: "observe",
			maxPruneTokens: 10000,
		});

		expect(evalResult.eligible).toHaveLength(0);
		expect(evalResult.ineligible[0].reason).toContain(
			"V1 observe mode cannot execute",
		);
	});

	it("rejects unverified recovery candidates when no active-branch checkpoint exists (E04)", () => {
		const branch: SessionEntry[] = [
			user("u1", "Investigate something"),
			toolCall("a1", "c1", "read", { path: "doc.txt" }, "u1"),
			toolResult("r1", "c1", "read", "Historical facts...", false, "a1"),
			taskNote(
				"n1",
				{
					taskId: "task:u1",
					active: true,
					references: [
						{
							id: "ref:research",
							kind: "evidence",
							sourceEntryIds: ["r1"],
							completedResearch: true,
						},
					],
				},
				"r1",
			),
		];

		const snapshot = buildTasks(branch);
		// No checkpoints linked
		const evalResult = evaluatePruneCandidates(snapshot, branch, [], {
			mode: "exact-prune",
			maxPruneTokens: 10000,
		});

		expect(evalResult.eligible).toHaveLength(0);
		expect(evalResult.ineligible[0].reason).toContain("Unverified recovery");
	});

	it("protects user requirements, error protocol evidence, and references with active consumers (C3)", () => {
		const branch: SessionEntry[] = [
			user("u1", "Critical acceptance criteria"),
			toolCall("a1", "c1", "bash", { command: "test.sh" }, "u1"),
			toolResult("r1", "c1", "bash", "Error: failed 0xDEAD", true, "a1"),
			toolCall("a2", "c2", "read", { path: "spec.txt" }, "r1"),
			toolResult("r2", "c2", "read", "spec content", false, "a2"),
			taskNote(
				"n1",
				{
					taskId: "task:u1",
					active: true,
					status: "running",
					requiredContextIds: ["ref:active-dep"],
					references: [
						{
							id: "ref:user-req",
							kind: "constraint",
							sourceEntryIds: ["u1"],
							completedResearch: true,
						},
						{
							id: "ref:error-fact",
							kind: "evidence",
							sourceEntryIds: ["r1"],
							precisionSensitive: true,
							completedResearch: true,
						},
						{
							id: "ref:active-dep",
							kind: "evidence",
							sourceEntryIds: ["r2"],
							completedResearch: true,
						},
					],
				},
				"r2",
			),
		];

		const snapshot = buildTasks(branch);
		linkCheckpoints(snapshot, [
			{ id: "ckpt-1", segmentIds: ["u1", "r1", "r2"] },
		]);

		const evalResult = evaluatePruneCandidates(
			snapshot,
			branch,
			[mockReceipt("ckpt-1", "n1", ["u1", "r1", "r2"], branch)],
			{
				mode: "exact-prune",
				maxPruneTokens: 10000,
			},
		);

		expect(evalResult.eligible).toHaveLength(0);
		const reasons = evalResult.ineligible.map((i) => i.reason).join(" ");
		expect(reasons).toContain("user constraint/acceptance source");
		expect(reasons).toContain("precision-sensitive protocol/error evidence");
		expect(reasons).toContain("active consumer dependency");
	});

	it("rejects splitting multi-call assistant exchanges or orphan tool results (C6, R13, E07)", () => {
		const branch: SessionEntry[] = [
			user("u1", "Run two tools"),
			{
				id: "a1",
				parentId: "u1",
				timestamp: "2026-11-05T00:00:00Z",
				type: "message",
				message: {
					role: "assistant",
					content: [
						{
							type: "toolCall",
							id: "c1",
							name: "read",
							arguments: { path: "f1" },
						},
						{
							type: "toolCall",
							id: "c2",
							name: "read",
							arguments: { path: "f2" },
						},
					],
					timestamp: 1,
				},
			} as unknown as SessionEntry,
			toolResult("r1", "c1", "read", "content 1", false, "a1"),
			toolResult("r2", "c2", "read", "content 2", false, "r1"),
			taskNote(
				"n1",
				{
					taskId: "task:u1",
					active: true,
					status: "completed",
					references: [
						{
							id: "ref:one",
							kind: "evidence",
							sourceEntryIds: ["r1"],
							completedResearch: true,
						},
					],
				},
				"r2",
			),
		];

		const snapshot = buildTasks(branch);
		linkCheckpoints(snapshot, [{ id: "ckpt-1", segmentIds: ["r1", "r2"] }]);

		const evalResult = evaluatePruneCandidates(
			snapshot,
			branch,
			[mockReceipt("ckpt-1", "n1", ["r1", "r2"], branch)],
			{
				mode: "exact-prune",
				maxPruneTokens: 10000,
			},
		);

		expect(evalResult.eligible).toHaveLength(0);
		expect(evalResult.ineligible[0].reason).toContain(
			"multiple tool calls; cannot omit exchange without breaking protocol",
		);
	});

	it("accepts safe candidate with single paired tool call and links paired assistant entry (C6)", () => {
		const branch: SessionEntry[] = [
			user("u1", "Research task"),
			toolCall("a1", "c1", "read", { path: "research.md" }, "u1"),
			toolResult("r1", "c1", "read", "old research data", false, "a1"),
			taskNote(
				"n1",
				{
					taskId: "task:u1",
					active: true,
					status: "completed",
					references: [
						{
							id: "ref:research",
							kind: "evidence",
							sourceEntryIds: ["r1"],
							completedResearch: true,
						},
					],
				},
				"r1",
			),
		];

		const snapshot = buildTasks(branch);
		linkCheckpoints(snapshot, [{ id: "ckpt-1", segmentIds: ["r1"] }]);

		const evalResult = evaluatePruneCandidates(
			snapshot,
			branch,
			[mockReceipt("ckpt-1", "n1", ["a1", "r1"], branch)],
			{
				mode: "exact-prune",
				maxPruneTokens: 10000,
			},
		);

		expect(evalResult.eligible, JSON.stringify(evalResult)).toHaveLength(1);
		expect(evalResult.eligible[0].sourceEntryId).toBe("r1");
		expect(evalResult.eligible[0].pairedEntryId).toBe("a1");
	});
});

describe("Request-local projection vs durable boundary draft lifecycles (C4, C5, C8, C9)", () => {
	it("projects request context locally without altering raw session entries or persisting edits (C4, C5)", () => {
		const branch: SessionEntry[] = [
			user("u1", "Goal prompt"),
			toolCall("a1", "c1", "read", { path: "f.txt" }, "u1"),
			toolResult("r1", "c1", "read", "secret old data", false, "a1"),
			user("u2", "Next prompt", "r1"),
		];

		const messages: AgentMessage[] = [
			{ role: "user", content: "Goal prompt" },
			{
				role: "assistant",
				content: [
					{
						type: "toolCall",
						id: "c1",
						name: "read",
						arguments: { path: "f.txt" },
					},
				],
			},
			{
				role: "toolResult",
				toolCallId: "c1",
				toolName: "read",
				content: [{ type: "text", text: "secret old data" }],
				isError: false,
			},
			{ role: "user", content: "Next prompt" },
		];

		const candidate = {
			referenceId: "ref:r1",
			sourceEntryId: "r1",
			category: "completed-research" as const,
			estimatedTokens: 50,
			checkpointId: "ckpt-1",
			pairedEntryId: "a1",
		};

		const projection = projectRequestContext(messages, [candidate], branch);

		// Verified request projection excludes the candidate and its paired call
		expect(projection.messages).toHaveLength(2);
		expect(projection.messages[0]).toMatchObject({
			role: "user",
			content: "Goal prompt",
		});
		expect(projection.messages[1]).toMatchObject({
			role: "user",
			content: "Next prompt",
		});
		expect(projection.reclaimedTokens).toBeGreaterThan(0);
		expect(projection.excludedEntryIds).toEqual(["r1", "a1"]);

		// Raw session entries and original messages array remain unchanged
		expect(branch).toHaveLength(4);
		expect(messages).toHaveLength(4);
	});

	it("creates durable context_edit boundary drafts and preserves other extensions' drafts (C8, C9, E12)", () => {
		const branch: SessionEntry[] = [
			user("u1", "Goal prompt"),
			toolCall("a1", "c1", "read", { path: "f.txt" }, "u1"),
			toolResult("r1", "c1", "read", "secret old data", false, "a1"),
		];

		const candidate = {
			referenceId: "ref:r1",
			sourceEntryId: "r1",
			category: "completed-research" as const,
			estimatedTokens: 50,
			checkpointId: "ckpt-1",
			pairedEntryId: "a1",
		};

		const otherExtensionDraft: CustomEntryDraft = {
			type: "custom",
			customType: "other-plugin-metadata",
			data: { state: "ok" },
		};

		const result = createPruneBoundaryDrafts([candidate], branch, [
			otherExtensionDraft,
		]);

		expect(result.drafts).toHaveLength(3);
		expect(result.drafts[0]).toBe(otherExtensionDraft); // preserved other extension
		expect(result.drafts[1]).toMatchObject({
			type: "context_edit",
			targetId: "r1",
			replacement: null,
		});
		expect(result.drafts[2]).toMatchObject({
			type: "context_edit",
			targetId: "a1",
			replacement: null,
		});
		expect(result.prunedTargetIds).toEqual(["r1", "a1"]);
		expect(result.reclaimedTokens).toBeGreaterThan(0);
	});

	it("prevents blind duplicate context_edits when targets are already omitted on branch (C8, E10)", () => {
		const branch: SessionEntry[] = [
			user("u1", "Goal prompt"),
			toolCall("a1", "c1", "read", { path: "f.txt" }, "u1"),
			toolResult("r1", "c1", "read", "secret old data", false, "a1"),
			contextEdit("e1", "r1", null, "r1"),
			contextEdit("e2", "a1", null, "e1"),
		];

		const candidate = {
			referenceId: "ref:r1",
			sourceEntryId: "r1",
			category: "completed-research" as const,
			estimatedTokens: 50,
			checkpointId: "ckpt-1",
			pairedEntryId: "a1",
		};

		const result = createPruneBoundaryDrafts([candidate], branch, []);
		expect(result.drafts).toHaveLength(0);
		expect(result.prunedTargetIds).toHaveLength(0);
	});

	it("restores omitted entry with original message content via context_edit boundary drafts (C7)", async () => {
		const branch: SessionEntry[] = [
			user("u1", "Goal prompt"),
			toolCall("a1", "c1", "read", { path: "f.txt" }, "u1"),
			toolResult("r1", "c1", "read", "exact original facts 0x42", false, "a1"),
			contextEdit("e1", "r1", null, "r1"),
		];

		const receipt = mockReceipt("ckpt-1", "r1", ["a1", "r1"], branch);

		const restore = await createRestoreBoundaryDrafts("r1", branch, [receipt]);

		expect(restore.drafts).toHaveLength(1);
		expect(restore.drafts[0]).toMatchObject({
			type: "context_edit",
			targetId: "r1",
			replacement: {
				content: [{ type: "text", text: "exact original facts 0x42" }],
			},
		});
		expect(restore.restoredTargetIds).toEqual(["r1"]);
	});

	it("reconciles branch prunes and identifies unverified context edits (C8, E10)", () => {
		const branch: SessionEntry[] = [
			user("u1", "Prompt"),
			toolResult("r1", "c1", "read", "facts", false, "u1"),
			contextEdit("e1", "r1", null, "r1"),
			contextEdit("e2", "orphan-target", null, "e1"),
		];

		const receipt = mockReceipt("ckpt-1", "r1", ["a1", "r1"], branch);
		const reconciliation = reconcileBranchPrunes(branch, [receipt]);

		expect(reconciliation.omittedTargetIds).toContain("r1");
		expect(reconciliation.omittedTargetIds).toContain("orphan-target");
	});
});

it("cannot discard extra conclusions bundled with a paired assistant tool call", () => {
	const a = toolCall("a", "call", "read", { path: "doc" }, "u");
	if (a.type !== "message" || a.message.role !== "assistant")
		throw Error("fixture");
	a.message.content.push({
		type: "text",
		text: "A still-required conclusion not declared redundant",
	});
	const branch = [
		user("u", "Goal"),
		a,
		toolResult("r", "call", "read", "research", false, "a"),
		taskNote("n", {
			taskId: "work",
			active: true,
			status: "completed",
			references: [
				{
					id: "ref",
					kind: "evidence",
					sourceEntryIds: ["r"],
					completedResearch: true,
				},
			],
		}),
	];
	const state = buildTasks(branch);
	const evaluation = evaluatePruneCandidates(
		state,
		branch,
		[mockReceipt("checkpoint", "n", ["a", "r"], branch)],
		{ mode: "exact-prune" },
	);
	expect(evaluation.eligible).toEqual([]);
});

it("compact mode cannot grant exact-prune eligibility", () => {
	const branch = [
		user("u", "Goal"),
		toolCall("a", "call", "read", {}, "u"),
		toolResult("r", "call", "read", "research", false, "a"),
	];
	const snapshot = buildTasks(branch);
	expect(
		evaluatePruneCandidates(
			snapshot,
			branch,
			[mockReceipt("c", "r", ["a", "r"], branch)],
			{ mode: "compact" },
		).eligible,
	).toEqual([]);
});
