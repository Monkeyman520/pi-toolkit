import type { PromptPart } from "./pipeline.ts";

function record(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === "object" && !Array.isArray(value);
}
export interface RequestView {
	parts: PromptPart[];
	replace(parts: PromptPart[]): unknown;
}
/** pi-antigravity 0.14.0 buildRequest and toEnterpriseGenerateBody, not generic recursive discovery. */
export function extractAntigravity(
	payload: unknown,
	provider: string,
): RequestView | undefined {
	if (provider !== "antigravity" || !record(payload)) return;
	const wrapped = record(payload.request);
	const body = wrapped ? payload.request : payload;
	if (!record(body) || (!wrapped && !Array.isArray(body.contents))) return;
	const instruction = body.systemInstruction;
	if (!record(instruction) || !Array.isArray(instruction.parts)) return;
	const raw = instruction.parts;
	if (
		!raw.every(
			(p) => record(p) && (!("text" in p) || typeof p.text === "string"),
		)
	)
		return;
	const prefix = wrapped ? "request." : "";
	const indices: number[] = [];
	const parts: PromptPart[] = [];
	raw.forEach((part, index) => {
		if (record(part) && typeof part.text === "string") {
			indices.push(index);
			parts.push({
				text: part.text,
				requestPath: `${prefix}systemInstruction.parts[${index}].text`,
			});
		}
	});
	if (!parts.length) return;
	return {
		parts,
		replace(next) {
			if (next.length !== parts.length)
				throw new Error("System part count changed");
			const changed = raw.map((p) => (record(p) ? { ...p } : p));
			indices.forEach((index, i) => {
				changed[index] = { ...changed[index], text: next[i].text };
			});
			const updated = {
				...body,
				systemInstruction: { ...instruction, parts: changed },
			};
			return wrapped ? { ...payload, request: updated } : updated;
		},
	};
}
