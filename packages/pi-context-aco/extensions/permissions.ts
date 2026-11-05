import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { type Static, Type } from "typebox";
import { Check } from "typebox/value";
import { buildTasks } from "./tasks.ts";
export type Operation = "semantic" | "native";
export const permissionSchema = Type.Object(
	{
		operation: Type.Union([Type.Literal("semantic"), Type.Literal("native")]),
		taskId: Type.String({ minLength: 1, maxLength: 128 }),
		sourceEntryIds: Type.Array(Type.String({ minLength: 1, maxLength: 128 }), {
			minItems: 1,
			maxItems: 64,
			uniqueItems: true,
		}),
		maxInputTokens: Type.Integer({ minimum: 1, maximum: 1000000 }),
		maxSummaryTokens: Type.Integer({ minimum: 1, maximum: 100000 }),
	},
	{ additionalProperties: false },
);
type Permission = Static<typeof permissionSchema>;
const scope = (ctx: ExtensionContext) =>
	JSON.stringify([
		ctx.cwd,
		ctx.sessionManager.getSessionId(),
		buildTasks(ctx.sessionManager.getBranch(), ctx.cwd).activeTaskId,
	]);
export class Permissions {
	private grants: (Permission & { scope: string; anchorId: string })[] = [];
	private generation = 0;
	reset() {
		this.grants = [];
		this.generation++;
	}
	guard() {
		const generation = this.generation;
		return () => {
			if (generation !== this.generation)
				throw Error("ACO authorization changed or revoked");
		};
	}
	grant(ctx: ExtensionContext, raw: unknown) {
		if (!Check(permissionSchema, raw))
			throw Error(
				"Invalid explicit authorization; operation, task, sources and finite budgets required",
			);
		const branch = ctx.sessionManager.getBranch(),
			task = buildTasks(branch, ctx.cwd).activeTaskId;
		if (
			raw.taskId !== task ||
			raw.sourceEntryIds.some((id) => !branch.some((e) => e.id === id))
		)
			throw Error(
				"Authorization task/source scope does not match active branch",
			);
		if (this.grants.length >= 16)
			throw Error("Authorization capacity exhausted; revoke old grants");
		const anchorId = branch.at(-1)?.id;
		if (!anchorId) throw Error("Authorization branch unavailable");
		this.generation++;
		const grant = { ...structuredClone(raw), scope: scope(ctx), anchorId };
		this.grants.push(grant);
		return grant;
	}
	inspect(ctx?: ExtensionContext) {
		return this.grants
			.filter(
				(g) =>
					!ctx ||
					(g.scope === scope(ctx) &&
						ctx.sessionManager.getBranch().some((e) => e.id === g.anchorId)),
			)
			.map((g) => ({ ...g }));
	}
	async allow(
		ctx: ExtensionContext,
		operation: Operation,
		sourceEntryIds: string[],
		inputTokens: number,
		summaryTokens: number,
	) {
		const branch = ctx.sessionManager.getBranch();
		if (
			this.grants.some(
				(g) =>
					g.scope === scope(ctx) &&
					g.operation === operation &&
					branch.some((e) => e.id === g.anchorId) &&
					sourceEntryIds.every((id) => g.sourceEntryIds.includes(id)) &&
					inputTokens <= g.maxInputTokens &&
					summaryTokens <= g.maxSummaryTokens,
			)
		)
			return "authorized" as const;
		// RPC exposes UI methods too, but must not wait for unavailable interactive consent.
		if (ctx.mode !== "tui" || !ctx.hasUI) return "recommendation" as const;
		const confirmed = await ctx.ui.confirm(
			"ACO context change",
			`${operation}: ${sourceEntryIds.join(", ")}. Estimated input ${inputTokens}; summary bound ${summaryTokens} tokens. Originals must be verified separately. Allow this scoped action?`,
		);
		return confirmed ? ("confirmed" as const) : ("denied" as const);
	}
}
