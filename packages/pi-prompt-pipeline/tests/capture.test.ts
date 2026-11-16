import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { Capture } from "../extensions/capture.ts";

const roots: string[] = [];
afterEach(async () => {
	await Promise.all(
		roots.splice(0).map((p) => rm(p, { recursive: true, force: true })),
	);
});
it("consumes the selected stage exactly once; replacement and clear are explicit", () => {
	const capture = new Capture();
	capture.arm("agent", "before");
	capture.arm("request", "both");
	expect(capture.take("agent", [])).toEqual([]);
	expect(capture.take("request", [])).toEqual(["before", "after"]);
	expect(capture.take("request", [])).toEqual([]);
	capture.arm("agent", "before");
	capture.clear();
	expect(capture.take("agent", [])).toEqual([]);
	expect(capture.take("agent", ["agent.after"])).toEqual(["after"]);
});
it("writes a correlated pair without serializing arbitrary request fields", async () => {
	const directory = await mkdtemp(join(tmpdir(), "prompt-capture-"));
	roots.push(directory);
	const capture = new Capture();
	capture.arm("request", "both");
	const sides = capture.take("request", []);
	const outputs = await capture.write(
		directory,
		"request",
		sides,
		[
			{
				text: "before",
				requestPath: "request.systemInstruction.parts[0].text",
			},
		],
		[{ text: "after", requestPath: "request.systemInstruction.parts[0].text" }],
		{ provider: "antigravity", model: "gemini-test" },
	);
	expect(outputs.paths).toHaveLength(2);
	expect(outputs.failed).toBe(false);
	const snapshots = await Promise.all(
		outputs.paths.map(async (p) => JSON.parse(await readFile(p, "utf8"))),
	);
	expect(snapshots[0].captureId).toBe(snapshots[1].captureId);
	expect(snapshots.map((s) => s.parts[0].text)).toEqual(["before", "after"]);
	expect(await readdir(directory)).toHaveLength(2);
	expect(capture.take("request", [])).toEqual([]);
});
it("a failed write consumes the attempt and reports no success", async () => {
	const directory = await mkdtemp(join(tmpdir(), "prompt-capture-failure-"));
	roots.push(directory);
	await writeFile(join(directory, "file"), "");
	const capture = new Capture();
	capture.arm("agent", "before");
	const sides = capture.take("agent", []);
	const result = await capture.write(
		join(directory, "file", "blocked"),
		"agent",
		sides,
		[{ text: "x" }],
		[{ text: "y" }],
		{ provider: "p", model: "m" },
	);
	expect(result.failed).toBe(true);
	expect(result.paths).toEqual([]);
	expect(capture.take("agent", [])).toEqual([]);
});
