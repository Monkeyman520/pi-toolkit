/** Verified bytes are request-local evidence, never cached authority. */
export interface VerifiedCheckpoint {
	id: string;
	segmentIds: string[];
	originals: ReadonlyMap<string, string>;
}

import { randomUUID } from "node:crypto";
import type {
	ExtensionContext,
	SessionEntry,
} from "@earendil-works/pi-coding-agent";
import { type Static, Type } from "typebox";
import { Check } from "typebox/value";
import {
	type Access,
	type EvidenceIO,
	EvidenceStore,
	projectKey,
	type Receipt,
	receiptSchema,
} from "./evidence.ts";
import { exchangeTargets } from "./prune.ts";
import { buildTasks } from "./tasks.ts";

const sourceId = Type.String({ minLength: 1, maxLength: 128 });
export const checkpointSchema = Type.Object(
	{
		sourceEntryIds: Type.Array(sourceId, {
			minItems: 1,
			maxItems: 64,
			uniqueItems: true,
		}),
		unresolvedWork: Type.Optional(
			Type.Array(Type.String({ maxLength: 1024 }), { maxItems: 32 }),
		),
	},
	{ additionalProperties: false },
);
export const recallSchema = Type.Object(
	{
		checkpointId: Type.String({ pattern: "^[a-f0-9-]{36}$" }),
		segmentId: sourceId,
		budgetBytes: Type.Integer({ minimum: 512, maximum: 32768 }),
		offset: Type.Optional(Type.Integer({ minimum: 0 })),
	},
	{ additionalProperties: false },
);
const attemptSchema = Type.Object(
	{
		version: Type.Literal(1),
		id: receiptSchema.properties.id,
		scope: receiptSchema.properties.scope,
		anchorId: sourceId,
	},
	{ additionalProperties: false },
);
type Attempt = Static<typeof attemptSchema>;
const owned = (e: SessionEntry) =>
	e.type === "custom" &&
	(e.customType === "aco-evidence-intent" ||
		e.customType === "aco-evidence-commit");
const stableBranch = (ctx: ExtensionContext) =>
	ctx.sessionManager.getBranch().filter((e) => !owned(e));
const fingerprint = (ctx: ExtensionContext) =>
	JSON.stringify([
		ctx.sessionManager.getSessionId(),
		stableBranch(ctx).map((e) => e.id),
	]);
export interface RecoveryReport {
	scope: { project: string; taskId: string; sessionId: string } | null;
	historical: true;
	checkpoints: {
		id: string;
		status: "verified" | "incomplete" | "invalid";
		segments?: { id: string; bytes: number }[];
		error?: string;
	}[];
	lastUsableId: string | null;
	issues: string[];
}
export class Continuity {
	readonly store: EvidenceStore;
	private append: (type: string, data: unknown) => void;
	private busy = false;
	private generation = 0;

	constructor(
		root: string,
		append: (type: string, data: unknown) => void,
		io?: EvidenceIO,
	) {
		this.store = new EvidenceStore(root, io);
		this.append = append;
	}
	invalidate() {
		this.generation++;
	}
	async getActiveCheckpoints(
		ctx: ExtensionContext,
		isCurrent: () => boolean = () => true,
	): Promise<VerifiedCheckpoint[]> {
		const check = this.guard(ctx, isCurrent);
		const access = await this.access(ctx);
		check();
		const result: VerifiedCheckpoint[] = [];
		let retainedBytes = 0;
		for (const receipt of access.receipts.slice(-64).reverse()) {
			try {
				const { originals } = await this.store.readCheckpoint(receipt, access);
				const bytes = [...originals.values()].reduce(
					(n, raw) => n + Buffer.byteLength(raw),
					0,
				);
				if (retainedBytes + bytes > 32 * 1024 * 1024) break;
				retainedBytes += bytes;
				result.push({
					id: receipt.id,
					segmentIds: [...originals.keys()],
					originals,
				});
			} catch {
				// Invalid evidence cannot authorize an edit; inspection exposes the fault.
			}
			check();
		}
		return result;
	}
	private guard(ctx: ExtensionContext, isCurrent: () => boolean) {
		const key = fingerprint(ctx),
			generation = this.generation;
		return () => {
			if (
				!isCurrent() ||
				generation !== this.generation ||
				key !== fingerprint(ctx)
			)
				throw Error(
					"ACO session/task/branch changed or operation cancelled; no recovery claim",
				);
		};
	}
	async access(ctx: ExtensionContext): Promise<Access> {
		const project = await projectKey(ctx.cwd),
			branch = ctx.sessionManager.getBranch(),
			taskId = buildTasks(branch, ctx.cwd).activeTaskId;
		if (!taskId) throw Error("Active task unavailable");
		const receipts: Receipt[] = [];
		const seen = new Set<string>(),
			intents = new Map<string, Attempt>();
		for (const entry of branch) {
			if (
				entry.type === "custom" &&
				entry.customType === "aco-evidence-intent" &&
				Check(attemptSchema, entry.data) &&
				seen.has(entry.data.anchorId)
			)
				intents.set(entry.data.id, entry.data);
			if (
				entry.type === "custom" &&
				entry.customType === "aco-evidence-commit" &&
				Check(receiptSchema, entry.data)
			) {
				const r = entry.data,
					intent = intents.get(r.id);
				if (
					r.scope.project === project &&
					r.scope.taskId === taskId &&
					intent &&
					r.anchorId === intent.anchorId &&
					r.scope.sessionId === intent.scope.sessionId &&
					r.scope.project === intent.scope.project &&
					r.scope.taskId === intent.scope.taskId
				)
					receipts.push(r);
			}
			seen.add(entry.id);
		}
		return {
			project,
			taskId,
			sessionId: ctx.sessionManager.getSessionId(),
			receipts,
		};
	}
	async checkpoint(
		ctx: ExtensionContext,
		raw: unknown,
		isCurrent: () => boolean,
	) {
		if (this.busy) throw Error("ACO checkpoint already in progress");
		if (!ctx.sessionManager.getSessionFile?.())
			throw Error(
				"A persistent Pi session is required for restart-recoverable checkpoints",
			);
		if (!Check(checkpointSchema, raw))
			throw Error("Invalid checkpoint request");
		const check = this.guard(ctx, isCurrent);
		check();
		this.busy = true;
		try {
			const access = await this.access(ctx);
			check();
			const branch = stableBranch(ctx),
				snapshot = buildTasks(branch, ctx.cwd);
			const task = snapshot.tasks.find((t) => t.taskId === access.taskId);
			const anchor = branch.at(-1);
			if (!task || !anchor) throw Error("Task/source state unavailable");
			const required = new Set(task.requiredContextIds);
			for (const ref of snapshot.references)
				if (ref.sourceEntryIds.some((id) => raw.sourceEntryIds.includes(id)))
					required.add(ref.id);
			let changed = true;
			while (changed) {
				changed = false;
				for (const ref of snapshot.references)
					if (required.has(ref.id))
						for (const dep of ref.dependencies)
							if (!required.has(dep)) {
								required.add(dep);
								changed = true;
							}
			}
			const references = snapshot.references.filter((r) => required.has(r.id));
			const sourceIds = new Set([
				...raw.sourceEntryIds,
				...task.signals.map((s) => s.sourceEntryId),
				...Object.values(task.provenance).flatMap((p) => p.sourceEntryIds),
				...references.flatMap((r) => r.sourceEntryIds),
			]);
			// Omitting/restoring a tool result also needs its complete protocol exchange.
			for (const sourceId of [...sourceIds])
				for (const pairedId of exchangeTargets(sourceId, branch))
					sourceIds.add(pairedId);
			const sources = [...sourceIds].map((id) => {
				const entry = branch.find((e) => e.id === id);
				if (!entry)
					throw Error("Checkpoint source is not on the active branch");
				return { id, original: JSON.stringify(entry) };
			});
			if (sources.length > 128)
				throw Error(
					"Checkpoint exceeds 128 original source segments; no complete recovery claim",
				);
			const scope = {
					project: access.project,
					taskId: access.taskId,
					sessionId: access.sessionId,
				},
				anchorId = anchor.id,
				id = randomUUID();
			const continuity = JSON.stringify({
				version: 1,
				scope,
				anchorId,
				historical: true,
				task,
				references,
				sourceEntryIds: [...sourceIds],
				unresolvedWork: raw.unresolvedWork ?? [],
				coverage: snapshot.coverage,
				issues: snapshot.issues,
				unresolvedContextIds: [...required].filter(
					(id) => !references.some((r) => r.id === id),
				),
			});
			check();
			this.append("aco-evidence-intent", { version: 1, id, scope, anchorId });
			const receipt = await this.store.persist({
				id,
				scope,
				anchorId,
				continuity,
				sources,
			});
			check();
			this.append("aco-evidence-commit", receipt);
			// An append acknowledgement is not a durable transaction. Ensure the host's active path actually contains it.
			const committed = await this.access(ctx);
			check();
			if (
				!committed.receipts.some(
					(r) => r.id === id && r.digest === receipt.digest,
				)
			)
				throw Error("Checkpoint receipt not visible on active branch");
			return {
				checkpointId: id,
				recoverable: true,
				historical: true,
				unloaded: false,
				sourceEntryIds: [...sourceIds],
				segments: ["continuity", ...sourceIds],
			};
		} finally {
			this.busy = false;
		}
	}
	async recall(ctx: ExtensionContext, raw: unknown, isCurrent: () => boolean) {
		if (!Check(recallSchema, raw)) throw Error("Invalid recall request");
		const check = this.guard(ctx, isCurrent);
		check();
		const access = await this.access(ctx);
		check();
		const result = await this.store.recall(
			raw.checkpointId,
			raw.segmentId,
			access,
			raw.budgetBytes,
			raw.offset ?? 0,
		);
		check();
		return result;
	}
	async reconcile(ctx: ExtensionContext): Promise<RecoveryReport> {
		const result: RecoveryReport = {
			scope: null,
			historical: true,
			checkpoints: [],
			lastUsableId: null,
			issues: [],
		};
		let access: Access;
		try {
			access = await this.access(ctx);
		} catch (error) {
			result.issues.push(
				error instanceof Error ? error.message : String(error),
			);
			return result;
		}
		const check = this.guard(ctx, () => true);
		result.scope = {
			project: access.project,
			taskId: access.taskId,
			sessionId: access.sessionId,
		};
		const attempts: Attempt[] = [];
		const receipts = new Map(access.receipts.map((r) => [r.id, r]));
		for (const entry of ctx.sessionManager.getBranch()) {
			if (entry.type !== "custom" || !owned(entry)) continue;
			if (
				entry.customType === "aco-evidence-commit" &&
				(!Check(receiptSchema, entry.data) ||
					(entry.data.scope.project === access.project &&
						entry.data.scope.taskId === access.taskId &&
						!receipts.has(entry.data.id)))
			)
				result.issues.push("Invalid/orphaned evidence receipt ignored");
			if (entry.customType !== "aco-evidence-intent") continue;
			if (!Check(attemptSchema, entry.data)) {
				result.issues.push("Invalid checkpoint intent ignored");
				continue;
			}
			const a = entry.data;
			if (
				a.scope.project === access.project &&
				a.scope.taskId === access.taskId
			)
				attempts.push(a);
		}
		const selected = attempts.slice(-64);
		if (selected.length < attempts.length)
			result.issues.push(
				"Reconciliation limited to latest 64 task attempts; older receipts remain explicitly recallable",
			);
		for (const attempt of selected.reverse()) {
			const receipt = receipts.get(attempt.id);
			if (
				!receipt ||
				receipt.anchorId !== attempt.anchorId ||
				JSON.stringify(receipt.scope) !== JSON.stringify(attempt.scope)
			) {
				result.checkpoints.push({
					id: attempt.id,
					status: "incomplete",
					error:
						"Intent has no matching active-branch commit; storage alone is not recovery authority",
				});
				continue;
			}
			try {
				const manifest = await this.store.verify(receipt, access);
				result.checkpoints.push({
					id: attempt.id,
					status: "verified",
					segments: manifest.segments.map((s) => ({
						id: s.id,
						bytes: s.bytes,
					})),
				});
				result.lastUsableId ??= attempt.id;
			} catch (error) {
				result.checkpoints.push({
					id: attempt.id,
					status: "invalid",
					error: error instanceof Error ? error.message : String(error),
				});
			}
		}
		try {
			check();
		} catch {
			result.scope = null;
			result.checkpoints = [];
			result.lastUsableId = null;
			result.issues.push(
				"Reconciliation superseded by session/task/branch change; retry inspection",
			);
		}
		return result;
	}
}
