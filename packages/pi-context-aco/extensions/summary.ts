import { isDeepStrictEqual } from "node:util";
import { Type } from "typebox";
import { Check } from "typebox/value";

export interface SummarySource {
	id: string;
	message: Record<string, unknown>;
}
const MAX_BYTES = 4 * 1024 * 1024;
const note =
	"Verified extractive historical summary. Dictionary lines are verbatim. Runs [lineIndex,count] preserve exact order and repetition. All conclusions, constraints, rationale, exact details and tool/error metadata remain in the source records. Historical evidence is not a current-workspace assertion.";
const schema = Type.Object(
	{
		format: Type.Literal("aco-extractive-v1"),
		note: Type.Literal(note),
		continuity: Type.Unknown(),
		dictionary: Type.Array(Type.String(), { maxItems: 100000 }),
		sources: Type.Array(
			Type.Object(
				{
					id: Type.String(),
					message: Type.Record(Type.String(), Type.Unknown()),
				},
				{ additionalProperties: false },
			),
			{ minItems: 1, maxItems: 64 },
		),
	},
	{ additionalProperties: false },
);
export function generateSummary(
	sources: readonly SummarySource[],
	continuity: unknown,
): string {
	const dictionary: string[] = [];
	const index = new Map<string, number>();
	const encode = (text: string) => {
		const runs: [number, number][] = [];
		for (const line of text.match(/[^\n]*\n|[^\n]+$/g) ?? []) {
			let id = index.get(line);
			if (id === undefined) {
				id = dictionary.length;
				dictionary.push(line);
				index.set(line, id);
			}
			const last = runs.at(-1);
			if (last?.[0] === id) last[1]++;
			else runs.push([id, 1]);
		}
		return runs;
	};
	const encoded = sources.map((source) => {
		const message = structuredClone(source.message);
		const content = message.content;
		if (typeof content === "string")
			message.content = { runs: encode(content) };
		else if (Array.isArray(content))
			message.content = content.map((b) => {
				if (b.type === "text" && typeof b.text === "string") {
					const { text, ...rest } = b;
					return { ...rest, runs: encode(text) };
				}
				if (b.type === "toolCall") return b;
				throw Error(
					"Unsupported summary content: only exact text and tool-call blocks are verifiable",
				);
			});
		else throw Error("Summary source content is unavailable");
		return { id: source.id, message };
	});
	const summary = JSON.stringify({
		format: "aco-extractive-v1",
		note,
		continuity,
		dictionary,
		sources: encoded,
	});
	if (Buffer.byteLength(summary) > MAX_BYTES)
		throw Error("Summary exceeds bound");
	return summary;
}
export function decodeSummary(summary: string): {
	sources: SummarySource[];
	continuity: unknown;
} {
	if (Buffer.byteLength(summary) > MAX_BYTES)
		throw Error("Summary exceeds bound");
	const doc: unknown = JSON.parse(summary);
	if (!Check(schema, doc)) throw Error("Invalid extractive summary");
	let bytes = 0;
	const decode = (value: unknown) => {
		if (!Array.isArray(value) || value.length > 100000)
			throw Error("Invalid extractive runs");
		return value
			.map((run) => {
				if (
					!Array.isArray(run) ||
					run.length !== 2 ||
					!Number.isSafeInteger(run[0]) ||
					!Number.isSafeInteger(run[1]) ||
					run[0] < 0 ||
					run[0] >= doc.dictionary.length ||
					run[1] < 1 ||
					run[1] > MAX_BYTES
				)
					throw Error("Invalid extractive run");
				const text = doc.dictionary[run[0]];
				bytes += Buffer.byteLength(text) * run[1];
				if (bytes > 16 * MAX_BYTES)
					throw Error("Decoded summary exceeds bound");
				return text.repeat(run[1]);
			})
			.join("");
	};
	const sources = doc.sources.map((source) => {
		const message = structuredClone(source.message);
		const content = message.content;
		if (
			content &&
			typeof content === "object" &&
			!Array.isArray(content) &&
			"runs" in content
		)
			message.content = decode(content.runs);
		else if (Array.isArray(content))
			message.content = content.map((b) => {
				if (b.type === "text") {
					const { runs, ...rest } = b;
					if ("text" in rest) throw Error("Ambiguous summary text");
					return { ...rest, text: decode(runs) };
				}
				if (b.type === "toolCall") return b;
				throw Error("Unsupported summary block");
			});
		else throw Error("Invalid summary content");
		return { id: source.id, message };
	});
	return { sources, continuity: doc.continuity };
}
export function verifySummary(
	summary: string,
	sources: readonly SummarySource[],
	continuity: unknown,
) {
	try {
		const decoded = decodeSummary(summary);
		return (
			summary === generateSummary(sources, continuity) &&
			isDeepStrictEqual(decoded.sources, JSON.parse(JSON.stringify(sources))) &&
			isDeepStrictEqual(
				decoded.continuity,
				JSON.parse(JSON.stringify(continuity)),
			)
		);
	} catch {
		return false;
	}
}
