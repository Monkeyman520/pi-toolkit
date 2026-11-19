import { expect, it } from "bun:test";
import { extractAntigravity } from "../extensions/request.ts";

it("extracts only consumer system text and writes back without touching non-text parts", () => {
	const payload = {
		project: "p",
		model: "gemini-test",
		request: {
			systemInstruction: {
				role: "user",
				parts: [
					{ text: "a", metadata: 1 },
					{ inlineData: { data: "same" } },
					{ text: "b" },
				],
			},
			contents: [{ text: "a" }],
		},
		requestId: "id",
	};
	const view = extractAntigravity(payload, "antigravity");
	expect(view?.parts.map((p) => p.text)).toEqual(["a", "b"]);
	expect(view?.parts[0].requestPath).toBe(
		"request.systemInstruction.parts[0].text",
	);
	const next = view?.replace([{ text: "A" }, { text: "B" }]);
	expect(next).toEqual({
		...payload,
		request: {
			...payload.request,
			systemInstruction: {
				...payload.request.systemInstruction,
				parts: [
					{ text: "A", metadata: 1 },
					{ inlineData: { data: "same" } },
					{ text: "B" },
				],
			},
		},
	});
	expect(payload.request.systemInstruction.parts[0].text).toBe("a");
});
it("supports source-verified enterprise body and rejects unknown shape/provider", () => {
	expect(
		extractAntigravity(
			{ systemInstruction: { parts: [{ text: "e" }] }, contents: [] },
			"antigravity",
		)?.parts,
	).toEqual([{ text: "e", requestPath: "systemInstruction.parts[0].text" }]);
	for (const value of [
		null,
		{},
		{ request: { systemInstruction: "no" } },
		{ request: { systemInstruction: { parts: [{ text: 1 }] } } },
	])
		expect(extractAntigravity(value, "antigravity")).toBeUndefined();
	expect(
		extractAntigravity(
			{ request: { systemInstruction: { parts: [{ text: "x" }] } } },
			"openai",
		),
	).toBeUndefined();
});
