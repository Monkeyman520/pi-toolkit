import { randomUUID } from "node:crypto";
import { type Static, Type } from "typebox";
import { Check } from "typebox/value";

const sourceRequest = Type.Object(
	{
		sourceEntryIds: Type.Array(Type.String({ minLength: 1, maxLength: 128 }), {
			minItems: 1,
			maxItems: 64,
			uniqueItems: true,
		}),
	},
	{ additionalProperties: false },
);
const stepSchema = Type.Union([
	Type.Object(
		{ kind: Type.Literal("checkpoint"), request: sourceRequest },
		{ additionalProperties: false },
	),
	Type.Object(
		{ kind: Type.Literal("offload"), request: sourceRequest },
		{ additionalProperties: false },
	),
	Type.Object(
		{ kind: Type.Literal("prune"), request: sourceRequest },
		{ additionalProperties: false },
	),
	Type.Object(
		{ kind: Type.Literal("semantic"), request: Type.Unknown() },
		{ additionalProperties: false },
	),
	Type.Object(
		{ kind: Type.Literal("delegate"), request: Type.Unknown() },
		{ additionalProperties: false },
	),
	Type.Object(
		{ kind: Type.Literal("native") },
		{ additionalProperties: false },
	),
]);
const schema = Type.Object(
	{ steps: Type.Array(stepSchema, { minItems: 1, maxItems: 8 }) },
	{ additionalProperties: false },
);
export type CompositionStep = Static<typeof stepSchema>;
export interface StepResult {
	status: "complete" | "pending" | "blocked";
	evidence: unknown;
}
export interface CompositionAdapter {
	guard(): () => void;
	execute(step: CompositionStep): Promise<StepResult>;
	inspect(step: CompositionStep, previous: StepResult): Promise<StepResult>;
}
interface Run {
	id: string;
	status: "running" | "complete" | "pending" | "blocked";
	steps: CompositionStep[];
	results: (StepResult & { latencyMs: number })[];
	error?: string;
}
/** Owns ordering, not executor authority, safety validation or transactional rollback. */
export class Composer {
	private run?: Run;
	private check?: () => void;
	private busy = false;
	private generation = 0;
	report() {
		return this.run ? structuredClone(this.run) : null;
	}
	cancel(reason: string) {
		this.generation++;
		if (
			this.run &&
			(this.run.status === "pending" || this.run.status === "running")
		) {
			this.run.status = "blocked";
			this.run.error = reason;
		}
	}
	async start(raw: unknown, adapter: CompositionAdapter) {
		if (this.busy || this.run?.status === "pending")
			throw Error("Composition already pending");
		if (!Check(schema, raw) || JSON.stringify(raw).length > 65536)
			throw Error("Invalid bounded composition");
		this.check = adapter.guard();
		this.run = {
			id: randomUUID(),
			status: "running",
			steps: structuredClone(raw.steps),
			results: [],
		};
		return this.drive(adapter, false);
	}
	async advance(adapter: CompositionAdapter) {
		if (this.busy || this.run?.status !== "pending")
			throw Error("No pending composition to advance");
		return this.drive(adapter, true);
	}
	private async drive(adapter: CompositionAdapter, inspect: boolean) {
		const run = this.run;
		if (!run || !this.check) throw Error("Composition unavailable");
		const generation = this.generation;
		const check = () => {
			if (generation !== this.generation) throw Error("Composition cancelled");
			this.check?.();
		};
		this.busy = true;
		try {
			check();
			if (inspect) {
				const index = run.results.length - 1,
					previous = run.results[index],
					started = performance.now();
				const observed = await adapter.inspect(run.steps[index], previous);
				check();
				run.results[index] = {
					...observed,
					latencyMs: previous.latencyMs + performance.now() - started,
				};
				if (observed.status !== "complete") {
					run.status = observed.status;
					return this.report() as Run;
				}
			}
			while (run.results.length < run.steps.length) {
				check();
				const started = performance.now();
				const result = await adapter.execute(run.steps[run.results.length]);
				check();
				run.results.push({ ...result, latencyMs: performance.now() - started });
				if (result.status !== "complete") {
					run.status = result.status;
					return this.report() as Run;
				}
			}
			run.status = "complete";
		} catch (error) {
			run.status = "blocked";
			run.error = String(error);
		} finally {
			this.busy = false;
		}
		return this.report() as Run;
	}
}
