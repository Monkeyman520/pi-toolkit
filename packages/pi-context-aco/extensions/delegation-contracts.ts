import { createHash } from "node:crypto";
import { lstat, realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import { type Static, Type } from "typebox";
import { Check } from "typebox/value";
import { fileIO } from "./evidence.ts";

const text = () => Type.String({ minLength: 1, maxLength: 2048 });
const list = () => Type.Array(text(), { maxItems: 32 });
const id = () => Type.String({ minLength: 1, maxLength: 128 });
export const taskContractSchema = Type.Object(
	{
		taskId: id(),
		goal: text(),
		constraints: list(),
		acceptance: Type.Array(text(), { minItems: 1, maxItems: 32 }),
		resources: Type.Array(
			Type.Object(
				{
					path: Type.String({ minLength: 1, maxLength: 512 }),
					write: Type.Boolean(),
				},
				{ additionalProperties: false },
			),
			{ maxItems: 16 },
		),
		evidence: Type.Array(
			Type.Object(
				{ checkpointId: id(), segmentId: id() },
				{ additionalProperties: false },
			),
			{ maxItems: 16 },
		),
	},
	{ additionalProperties: false },
);
export const delegationSchema = Type.Object(
	{ tasks: Type.Array(taskContractSchema, { minItems: 1, maxItems: 8 }) },
	{ additionalProperties: false },
);
export const delegationPermissionSchema = Type.Object(
	{
		operation: Type.Literal("delegate"),
		taskIds: Type.Array(id(), { minItems: 1, maxItems: 8, uniqueItems: true }),
		maxTokens: Type.Integer({ minimum: 1, maximum: 10000000 }),
	},
	{ additionalProperties: false },
);
export const childResultSchema = Type.Object(
	{
		conclusions: list(),
		deliverables: Type.Array(
			Type.Object(
				{
					path: Type.String({ minLength: 1, maxLength: 512 }),
					content: Type.String({ maxLength: 32768 }),
				},
				{ additionalProperties: false },
			),
			{ maxItems: 16 },
		),
		evidence: list(),
		tests: list(),
		unresolvedIssues: list(),
	},
	{ additionalProperties: false },
);
export const reconciliationSchema = Type.Object(
	{
		id: id(),
		accepted: Type.Boolean(),
		verification: Type.Array(text(), { minItems: 1, maxItems: 32 }),
	},
	{ additionalProperties: false },
);
export type TaskContract = Static<typeof taskContractSchema>;
export type ChildResult = Static<typeof childResultSchema>;
export const hash = (s: string) => createHash("sha256").update(s).digest("hex");
export const bytes = (v: unknown) => Buffer.byteLength(JSON.stringify(v));
export interface Resource {
	path: string;
	canonical: string;
	write: boolean;
	digest: string;
	content: string;
}
export async function resource(
	cwd: string,
	path: string,
	write: boolean,
): Promise<Resource> {
	const root = await realpath(cwd),
		requested = resolve(root, path),
		canonical = await realpath(requested);
	const rel = relative(root, canonical);
	if (
		isAbsolute(path) ||
		rel === ".." ||
		rel.startsWith(".." + sep) ||
		isAbsolute(rel) ||
		canonical !== requested ||
		(await lstat(requested)).isSymbolicLink()
	)
		throw Error("Resource must be an existing non-aliased project file");
	const info = await stat(canonical);
	if (!info.isFile() || info.nlink !== 1)
		throw Error("Resource must be a single-link regular file");
	const content = await fileIO.read(canonical, 32768);
	if (content.includes("\u0000") || content.includes("\ufffd"))
		throw Error("Only bounded UTF-8 text resources supported");
	return {
		path,
		canonical:
			process.platform === "win32" ? canonical.toLowerCase() : canonical,
		write,
		digest: hash(content),
		content,
	};
}
export function parentUsage(branch: SessionEntry[]) {
	let tokens = 0;
	for (const e of branch) {
		const usage =
			e.type === "message"
				? e.message.role === "assistant" || e.message.role === "toolResult"
					? e.message.usage
					: undefined
				: e.type === "usage" ||
						e.type === "compaction" ||
						e.type === "branch_summary"
					? e.usage
					: undefined;
		const requiresUsage =
			e.type === "usage" ||
			e.type === "compaction" ||
			e.type === "branch_summary" ||
			(e.type === "message" && e.message.role === "assistant");
		if (!usage && !requiresUsage) continue;
		const n = usage?.totalTokens;
		if (typeof n !== "number" || !Number.isFinite(n) || n < 0)
			throw Error(
				"Parent token usage unknown; aggregate budget cannot admit delegation",
			);
		tokens += n;
	}
	return tokens;
}
export const instructions =
	"ACO independent child. Use only the explicit contract and supplied resources. No parent history or ambient tools are available. Do not claim tests executed. Return only JSON matching this schema: " +
	JSON.stringify(childResultSchema) +
	". Deliverables are staged proposals for parent verification, not writes. Evidence is historical unless explicitly checked current. Do not include an exploration transcript.";
export function validateResult(
	raw: string,
	resources: Resource[],
	outputLimit: number,
): ChildResult {
	if (Buffer.byteLength(raw) > outputLimit * 4)
		throw Error("Child result exceeds coordination bound");
	const value: unknown = JSON.parse(raw);
	if (!Check(childResultSchema, value))
		throw Error("Invalid structured child result");
	if (
		new Set(value.deliverables.map((d) => d.path)).size !==
			value.deliverables.length ||
		value.deliverables.some(
			(d) => !resources.some((r) => r.path === d.path && r.write),
		)
	)
		throw Error("Child deliverables exceed allowed work/resources");
	return value;
}
