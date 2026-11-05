import { randomUUID } from "node:crypto";
import type {
	ExtensionContext,
	SessionEntry,
} from "@earendil-works/pi-coding-agent";
import { type Static, Type } from "typebox";
import { Check } from "typebox/value";
import type { Settings } from "./config.ts";
import type { Continuity } from "./continuity.ts";
import {
	bytes,
	childResultSchema,
	delegationPermissionSchema,
	delegationSchema,
	hash,
	instructions,
	parentUsage,
	type Resource,
	reconciliationSchema,
	resource,
	type TaskContract,
	validateResult,
} from "./delegation-contracts.ts";
import { buildTasks } from "./tasks.ts";

const snapshotSchema = Type.Object(
	{
		path: Type.String(),
		canonical: Type.String(),
		write: Type.Boolean(),
		digest: Type.String(),
	},
	{ additionalProperties: false },
);
const intentSchema = Type.Object(
	{
		version: Type.Literal(1),
		id: Type.String(),
		taskId: Type.String(),
		parentTaskId: Type.String(),
		sessionId: Type.String(),
		project: Type.String(),
		reservedTokens: Type.Integer({ minimum: 1, maximum: 10000000 }),
		inputBound: Type.Integer({ minimum: 1 }),
		outputBound: Type.Integer({ minimum: 1 }),
		checkpoints: Type.Array(Type.String()),
		resources: Type.Array(snapshotSchema),
		contract: delegationSchema.properties.tasks.items,
	},
	{ additionalProperties: false },
);
type Intent = Static<typeof intentSchema>;
const outcomeSchema = Type.Object(
	{
		id: Type.String(),
		status: Type.Union([
			Type.Literal("needs-verification"),
			Type.Literal("failed"),
			Type.Literal("cancelled"),
		]),
		result: Type.Optional(childResultSchema),
		error: Type.Optional(Type.String()),
		latencyMs: Type.Number(),
		budgetVerified: Type.Boolean(),
		tokens: Type.Union([Type.Number(), Type.Null()]),
		cost: Type.Union([Type.Number(), Type.Null()]),
		cacheRead: Type.Union([Type.Number(), Type.Null()]),
		cacheWrite: Type.Union([Type.Number(), Type.Null()]),
	},
	{ additionalProperties: false },
);
type Outcome = Static<typeof outcomeSchema>;
const finite = (v: unknown): number | null =>
	typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null;
const owned = (e: SessionEntry) =>
	e.type === "custom" && e.customType.startsWith("aco-delegation-");
const signature = (ctx: ExtensionContext) =>
	JSON.stringify([
		ctx.cwd,
		ctx.model?.provider,
		ctx.model?.id,
		ctx.sessionManager.getSessionId(),
		ctx.sessionManager
			.getBranch()
			.filter((e) => !owned(e))
			.map((e) => e.id),
	]);
const scope = (ctx: ExtensionContext) =>
	JSON.stringify([
		ctx.cwd,
		ctx.sessionManager.getSessionId(),
		buildTasks(ctx.sessionManager.getBranch(), ctx.cwd).activeTaskId,
	]);
export class Delegator {
	private append: (type: string, data: unknown) => void;
	private continuity: Continuity;
	private settings: () => Settings | undefined;
	private generation = 0;
	private busy = false;
	private controllers = new Map<string, AbortController>();
	private grants: {
		scope: string;
		anchor: string;
		permission: Static<typeof delegationPermissionSchema>;
	}[] = [];
	constructor(
		append: (type: string, data: unknown) => void,
		continuity: Continuity,
		settings: () => Settings | undefined,
	) {
		this.append = append;
		this.continuity = continuity;
		this.settings = settings;
	}
	reset(ctx?: ExtensionContext) {
		if (ctx)
			for (const id of this.controllers.keys()) {
				if (this.intents(ctx).some((i) => i.id === id)) {
					try {
						this.append("aco-delegation-result", {
							id,
							status: "cancelled",
							error:
								"Owned work explicitly cancelled; provider final usage unknown",
							latencyMs: 0,
							budgetVerified: false,
							tokens: null,
							cost: null,
							cacheRead: null,
							cacheWrite: null,
						});
					} catch {}
				}
			}
		this.generation++;
		this.grants = [];
		for (const c of this.controllers.values()) c.abort();
	}
	private guard(ctx: ExtensionContext) {
		const key = signature(ctx),
			config = JSON.stringify(this.settings()),
			generation = this.generation;
		return () => {
			if (
				generation !== this.generation ||
				key !== signature(ctx) ||
				config !== JSON.stringify(this.settings()) ||
				ctx.signal?.aborted
			)
				throw Error(
					"Delegation cancelled: parent session/task/branch/configuration changed",
				);
		};
	}
	authorize(ctx: ExtensionContext, raw: unknown) {
		if (!Check(delegationPermissionSchema, raw))
			throw Error(
				"Delegation authorization requires operation, taskIds and finite maxTokens",
			);
		const tasks = buildTasks(ctx.sessionManager.getBranch(), ctx.cwd);
		if (
			!tasks.activeTaskId ||
			raw.taskIds.some((id) => !tasks.tasks.some((t) => t.taskId === id))
		)
			throw Error("Authorization task scope unavailable");
		const anchor = ctx.sessionManager.getBranch().at(-1)?.id;
		if (!anchor || this.grants.length >= 16)
			throw Error("Authorization anchor/capacity unavailable");
		this.grants.push({
			scope: scope(ctx),
			anchor,
			permission: structuredClone(raw),
		});
		return { authorized: raw, persistent: false };
	}
	private intents(ctx: ExtensionContext, all = false): Intent[] {
		const branch =
			all && typeof ctx.sessionManager.getEntries === "function"
				? ctx.sessionManager.getEntries()
				: ctx.sessionManager.getBranch();
		return branch.flatMap((e) =>
			e.type === "custom" &&
			e.customType === "aco-delegation-intent" &&
			Check(intentSchema, e.data)
				? [e.data]
				: [],
		);
	}
	report(ctx: ExtensionContext) {
		const branch = ctx.sessionManager.getBranch();
		const intents = this.intents(ctx);
		const outcomes = intents.map((intent) => {
			const returned = branch
				.filter(
					(e) =>
						e.type === "custom" &&
						e.customType === "aco-delegation-result" &&
						Check(outcomeSchema, e.data) &&
						e.data.id === intent.id,
				)
				.at(-1);
			const outcome =
				returned?.type === "custom" ? (returned.data as Outcome) : undefined;
			const reviewEntry = branch
				.filter(
					(e) =>
						e.type === "custom" &&
						e.customType === "aco-delegation-review" &&
						Check(reconciliationSchema, e.data) &&
						e.data.id === intent.id,
				)
				.at(-1);
			const review =
				reviewEntry?.type === "custom" &&
				Check(reconciliationSchema, reviewEntry.data)
					? reviewEntry.data
					: undefined;
			const status = review
				? review.accepted
					? "verified"
					: "rejected"
				: (outcome?.status ??
					(this.controllers.has(intent.id) ? "running" : "interrupted"));
			return {
				...intent,
				...outcome,
				status,
				verification: review?.verification ?? [],
			};
		});
		return {
			provider:
				"Pi modelRegistry.streamSimple; independent single-request text child",
			depth: 1,
			recursiveDispatch: false,
			active: this.controllers.size,
			reservedTokens: this.intents(ctx, true).reduce(
				(n, i) => n + i.reservedTokens,
				0,
			),
			outcomes,
			authority: this.grants
				.filter(
					(g) =>
						g.scope === scope(ctx) && branch.some((e) => e.id === g.anchor),
				)
				.map((g) => g.permission),
			accounting:
				"Admission charges parent reported tokens + retained child input-byte/output reservations + bounded coordination. Not a cap on unrelated future parent calls; provider overrun/unknown usage fails closed. Child tests are unverified claims.",
		};
	}
	async run(ctx: ExtensionContext, raw: unknown) {
		const settings = this.settings();
		if (!settings?.enabled || settings.mode !== "delegate")
			throw Error("Delegation mode is not enabled");
		if (!Check(delegationSchema, raw) || bytes(raw) > 65536)
			throw Error("Invalid bounded delegation contract");
		if (this.busy)
			throw Error(
				"Delegation batch already active; no unsafe concurrent scheduler",
			);
		if (!ctx.model || typeof ctx.modelRegistry?.streamSimple !== "function")
			return {
				status: "recommendation",
				ids: [],
				reason: "Delegation provider unavailable; continue locally",
			};
		if (settings.maxDelegationDepth < 1)
			throw Error("Delegation depth budget exhausted");
		if (raw.tasks.length > settings.maxDelegationConcurrency)
			throw Error("Delegation concurrency budget exceeded");
		this.busy = true;
		try {
			const check = this.guard(ctx),
				branch = ctx.sessionManager.getBranch(),
				graph = buildTasks(branch, ctx.cwd);
			if (!graph.activeTaskId) throw Error("Parent active task unavailable");
			if (new Set(raw.tasks.map((t) => t.taskId)).size !== raw.tasks.length)
				throw Error("Duplicate task");
			for (const task of raw.tasks) {
				const node = graph.tasks.find((t) => t.taskId === task.taskId);
				if (
					!node ||
					node.taskId === graph.activeTaskId ||
					node.delegatable !== true ||
					node.writeConflictRisk !== 0 ||
					node.unresolvedDependencies.length ||
					node.conflictWith.length ||
					node.status === "completed" ||
					node.dependencies.some(
						(id) =>
							graph.tasks.find((t) => t.taskId === id)?.status !== "completed",
					) ||
					graph.tasks.some(
						(t) =>
							t.status !== "completed" && t.dependencies.includes(task.taskId),
					)
				)
					throw Error("Task is not demonstrably independent; continue locally");
				if (this.intents(ctx, true).some((i) => i.taskId === task.taskId))
					throw Error(
						"Task already has a delegation attempt; inspect/reconcile, no automatic replacement",
					);
			}
			const access = await this.continuity.access(ctx);
			check();
			const prepared: {
				task: TaskContract;
				resources: Resource[];
				evidence: string[];
				id: string;
				prompt: string;
				inputBound: number;
				reservedTokens: number;
			}[] = [];
			for (const task of raw.tasks) {
				const resources = await Promise.all(
					task.resources.map((r) => resource(ctx.cwd, r.path, r.write)),
				);
				check();
				if (
					new Set(resources.map((r) => r.canonical)).size !== resources.length
				)
					throw Error("Resource overlap/alias within task");
				const node = graph.tasks.find((t) => t.taskId === task.taskId);
				if (
					resources.some(
						(r) => r.write && !node?.writeResources.includes(r.path),
					)
				)
					throw Error("Writer resource absent from task declaration");
				const id = randomUUID(),
					evidence: string[] = [];
				for (const ref of task.evidence) {
					const child = {
						project: access.project,
						taskId: access.taskId,
						sessionId: id,
					};
					const token = await this.continuity.store.grant(
						ref.checkpointId,
						access,
						child,
						[ref.segmentId],
					);
					check();
					evidence.push(
						await this.continuity.store.recall(
							ref.checkpointId,
							ref.segmentId,
							{ ...child, receipts: [] },
							8192,
							0,
							token,
						),
					);
					check();
				}
				const prompt = JSON.stringify({
					contract: task,
					resources: resources.map((r) => ({
						path: r.path,
						write: r.write,
						content: r.content,
						digest: r.digest,
					})),
					evidence,
				});
				// Text-only upper accounting estimate: UTF-8 bytes plus serialization framing reserve.
				const inputBound =
					bytes(instructions) + Buffer.byteLength(prompt) + 4096;
				const reservedTokens =
					inputBound + settings.maxChildOutputTokens * 5 + 4096 + bytes(task);
				prepared.push({
					task,
					resources,
					evidence,
					id,
					prompt,
					inputBound,
					reservedTokens,
				});
			}
			for (let i = 0; i < prepared.length; i++)
				for (let j = 0; j < i; j++)
					if (
						prepared[i].resources.some((a) =>
							prepared[j].resources.some(
								(b) => a.canonical === b.canonical && (a.write || b.write),
							),
						)
					)
						throw Error("Unsafe read/write resource overlap");
			const reserved = prepared.reduce((n, p) => n + p.reservedTokens, 0);

			const allEntries =
				typeof ctx.sessionManager.getEntries === "function"
					? ctx.sessionManager.getEntries()
					: branch;
			for (const old of this.intents(ctx, true)) {
				const entry = allEntries.find(
					(e) =>
						e.type === "custom" &&
						e.customType === "aco-delegation-result" &&
						Check(outcomeSchema, e.data) &&
						e.data.id === old.id,
				);
				if (
					!(
						entry?.type === "custom" &&
						Check(outcomeSchema, entry.data) &&
						entry.data.budgetVerified
					)
				)
					throw Error(
						"Prior child accounting unknown/overrun; further dispatch blocked",
					);
			}
			const used =
				this.intents(ctx, true).reduce((n, i) => n + i.reservedTokens, 0) +
				parentUsage(allEntries);
			if (used + reserved > settings.maxDelegationTokens)
				throw Error(
					"Aggregate parent/child/coordination token budget exhausted",
				);
			const permitted = this.grants.some(
				(g) =>
					g.scope === scope(ctx) &&
					branch.some((e) => e.id === g.anchor) &&
					raw.tasks.every((t) => g.permission.taskIds.includes(t.taskId)) &&
					used + reserved <= g.permission.maxTokens,
			);
			let authority = permitted ? "authorized" : "recommendation";
			if (!permitted && ctx.mode === "tui" && ctx.hasUI)
				authority = (await ctx.ui.confirm(
					"ACO delegation",
					JSON.stringify({
						tasks: raw.tasks,
						reservedTokens: reserved,
						parentAndPrior: used,
						stagedWrites: true,
					}),
				))
					? "confirmed"
					: "denied";
			check();
			if (authority === "recommendation" || authority === "denied")
				return {
					status: authority,
					ids: [],
					reason: "No applicable delegation authority; continue locally",
				};
			// Persist every reservation before launching any member. Partial appends remain interrupted, never retried.
			for (const p of prepared) {
				check();
				for (const r of p.resources) {
					const now = await resource(ctx.cwd, r.path, r.write);
					check();
					if (now.digest !== r.digest || now.canonical !== r.canonical)
						throw Error("Resource changed before dispatch");
				}
				const intent: Intent = {
					version: 1,
					id: p.id,
					taskId: p.task.taskId,
					parentTaskId: graph.activeTaskId,
					project: access.project,
					sessionId: ctx.sessionManager.getSessionId(),
					reservedTokens: p.reservedTokens,
					inputBound: p.inputBound,
					outputBound: settings.maxChildOutputTokens,
					checkpoints: [...new Set(p.task.evidence.map((e) => e.checkpointId))],
					resources: p.resources.map(({ content: _content, ...rest }) => rest),
					contract: p.task,
				};
				this.append("aco-delegation-intent", intent);
			}
			const settled = await Promise.allSettled(
				prepared.map(async (p) => {
					const controller = new AbortController();
					this.controllers.set(p.id, controller);
					const abort = () => controller.abort();
					ctx.signal?.addEventListener("abort", abort, { once: true });
					const start = performance.now();
					const timer = setTimeout(
						() => controller.abort(Error("Child deadline exceeded")),
						60000,
					);
					const outcome: Outcome = {
						id: p.id,
						status: "failed",
						latencyMs: 0,
						budgetVerified: false,
						tokens: null,
						cost: null,
						cacheRead: null,
						cacheWrite: null,
					};
					try {
						check();
						controller.signal.throwIfAborted();
						const model = ctx.model;
						if (!model) throw Error("Provider/model unavailable");
						const maxTokens = Math.min(
							settings.maxChildOutputTokens,
							model.maxTokens,
						);
						const response = ctx.modelRegistry
							.streamSimple(
								model,
								{
									systemPrompt: instructions,
									messages: [
										{ role: "user", content: p.prompt, timestamp: Date.now() },
									],
								},
								{
									signal: controller.signal,
									maxTokens,
									sessionId: p.id,
									timeoutMs: 60000,
								},
							)
							.result();

						let removeAbort = () => {};
						const cancelled = new Promise<never>((_, reject) => {
							const onAbort = () =>
								reject(Error("Child cancelled or timed out"));
							controller.signal.addEventListener("abort", onAbort, {
								once: true,
							});
							removeAbort = () =>
								controller.signal.removeEventListener("abort", onAbort);
							if (controller.signal.aborted) onAbort();
						});
						const reply = await Promise.race([response, cancelled]).finally(
							() => removeAbort(),
						);
						outcome.tokens = finite(reply.usage?.totalTokens);
						outcome.cost = finite(reply.usage?.cost?.total);
						outcome.cacheRead = finite(reply.usage?.cacheRead);
						outcome.cacheWrite = finite(reply.usage?.cacheWrite);
						check();
						controller.signal.throwIfAborted();
						if (reply.stopReason !== "stop")
							throw Error("Child incomplete/error: " + reply.stopReason);
						if (
							outcome.tokens === null ||
							outcome.tokens > p.inputBound + settings.maxChildOutputTokens ||
							finite(reply.usage?.output) === null ||
							reply.usage.output > maxTokens
						)
							throw Error(
								"Child token usage unavailable or exceeds reservation",
							);
						outcome.budgetVerified = true;
						if (reply.content.some((c) => c.type !== "text"))
							throw Error("Child must return text JSON, not tools/thinking");
						const text = reply.content
							.filter((c) => c.type === "text")
							.map((c) => c.text)
							.join("");
						outcome.result = validateResult(
							text,
							p.resources,
							settings.maxChildOutputTokens,
						);
						outcome.status = "needs-verification";
					} catch (error) {
						outcome.status = controller.signal.aborted ? "cancelled" : "failed";
						outcome.error = String(error).slice(0, 2048);
					} finally {
						clearTimeout(timer);
						outcome.latencyMs = performance.now() - start;
						ctx.signal?.removeEventListener("abort", abort);
						try {
							check();
							this.append("aco-delegation-result", outcome);
						} finally {
							this.controllers.delete(p.id);
						}
					}
				}),
			);
			check();
			return {
				status: settled.some((s) => s.status === "rejected")
					? "incomplete"
					: "returned",
				completed: false,
				ids: prepared.map((p) => p.id),
				outcomes: this.report(ctx).outcomes.filter((o) =>
					prepared.some((p) => p.id === o.id),
				),
			};
		} finally {
			this.busy = false;
		}
	}
	async reconcile(ctx: ExtensionContext, raw: unknown) {
		if (!Check(reconciliationSchema, raw))
			throw Error("Parent verification evidence required");
		if (this.busy)
			throw Error("Wait for active delegation batch before reconciliation");
		const check = this.guard(ctx),
			access = await this.continuity.access(ctx);
		check();
		const outcome = this.report(ctx).outcomes.find((o) => o.id === raw.id);
		if (
			!outcome ||
			outcome.project !== access.project ||
			outcome.parentTaskId !== access.taskId
		)
			throw Error("Delegation outcome outside active task/lineage scope");
		if (outcome.status !== "needs-verification" || !outcome.result)
			throw Error("Only a returned unfinished child can be reconciled");
		if (raw.accepted) {
			if (outcome.result.unresolvedIssues.length)
				throw Error("Child has unresolved issues");

			for (const ref of outcome.contract.evidence) {
				await this.continuity.store.recall(
					ref.checkpointId,
					ref.segmentId,
					access,
					8192,
				);
				check();
			}
			for (const r of outcome.resources) {
				const actual = await resource(ctx.cwd, r.path, r.write);
				check();
				const deliverable = outcome.result.deliverables.find(
					(d) => d.path === r.path,
				);
				if (
					actual.canonical !== r.canonical ||
					actual.digest !== (deliverable ? hash(deliverable.content) : r.digest)
				)
					throw Error(
						"Parent resource/deliverable verification failed; apply/review independently first",
					);
			}
		}
		check();
		this.append("aco-delegation-review", raw);
		// Do not auto-complete task declarations: semantic success is an explicit parent attestation.
		return {
			reconciled: true,
			accepted: raw.accepted,
			taskId: outcome.taskId,
			verification: raw.verification,
			graphStatus:
				"unchanged; declare completion separately after verifying acceptance",
		};
	}
}
