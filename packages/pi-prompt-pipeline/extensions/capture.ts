import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { PromptPart } from "./pipeline.ts";
import type { Point, Stage } from "./schema.ts";
export type Side = "before" | "after";
export class Capture {
	private pending?: { stage: Stage; mode: "before" | "both" };
	arm(stage: Stage, mode: "before" | "both") {
		this.pending = { stage, mode };
	}
	clear() {
		this.pending = undefined;
	}
	get status() {
		return this.pending ? `${this.pending.stage} ${this.pending.mode}` : "none";
	}
	// Synchronous consumption happens before awaits, including unsupported extraction.
	take(stage: Stage, points: Point[]): Side[] {
		const sides = new Set<Side>();
		for (const side of ["before", "after"] as const)
			if (points.includes(`${stage}.${side}`)) sides.add(side);
		if (this.pending?.stage === stage) {
			sides.add("before");
			if (this.pending.mode === "both") sides.add("after");
			this.pending = undefined;
		}
		return (["before", "after"] as const).filter((s) => sides.has(s));
	}
	async write(
		directory: string,
		stage: Stage,
		sides: Side[],
		before: PromptPart[],
		after: PromptPart[],
		identity: { provider: string; model: string },
	) {
		const captureId = randomUUID(),
			paths: string[] = [];
		let failed = false;
		if (!sides.length) return { paths, failed };
		try {
			await mkdir(directory, { recursive: true, mode: 0o700 });
		} catch {
			return { paths, failed: true };
		}
		for (const side of sides) {
			const path = join(
				directory,
				`${Date.now()}-${captureId}-${stage}.${side}.json`,
			);
			try {
				await writeFile(
					path,
					`${JSON.stringify(
						{
							captureId,
							stage,
							side,
							...identity,
							parts: side === "before" ? before : after,
						},
						null,
						2,
					)}\n`,
					{ encoding: "utf8", flag: "wx", mode: 0o600 },
				);
				paths.push(path);
			} catch {
				failed = true;
			}
		}
		return { paths, failed };
	}
}
