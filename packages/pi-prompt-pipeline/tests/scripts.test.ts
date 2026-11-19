import { expect, it } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	type PipelineContext,
	runPipeline,
	type SourcedRule,
} from "../extensions/pipeline.ts";

it("loads local files and native ESM scripts with context/options; errors roll back", async () => {
	const dir = await mkdtemp(join(tmpdir(), "prompt-script-"));
	try {
		await writeFile(join(dir, "text.txt"), "from-file");
		await writeFile(
			join(dir, "sync.mjs"),
			'export default (text,ctx)=>text+":"+ctx.ruleId+":"+ctx.options.suffix;',
		);
		await writeFile(
			join(dir, "async.mjs"),
			'export default async (text,ctx)=>text+":"+ctx.stage+":"+ctx.requestPath;',
		);
		await writeFile(join(dir, "bad.mjs"), "export default ()=>42;");
		await writeFile(
			join(dir, "throw.mjs"),
			'export default async ()=>{throw Error("private text");};',
		);
		const context: PipelineContext = {
			provider: "antigravity",
			model: "gemini-x",
			cwd: "different-cwd",
			stage: "request",
			extensions: [],
			customPrompt: false,
			options: {},
		};
		const base: SourcedRule = {
			id: "script",
			stage: "request",
			targets: ["all"],
			baseDir: dir,
			actions: [
				{ type: "file", path: "text.txt" },
				{ type: "script", path: "sync.mjs", options: { suffix: "OK" } },
				{ type: "script", path: "async.mjs" },
			],
		};
		const part = {
			text: "original",
			requestPath: "request.systemInstruction.parts[0].text",
		};
		const good = await runPipeline([part], [base], context);
		expect(good.parts[0].text).toBe(
			`from-file:script:OK:request:${part.requestPath}`,
		);
		for (const path of ["bad.mjs", "throw.mjs", "absent.mjs", "text.txt"]) {
			const bad = await runPipeline(
				[part],
				[
					{
						...base,
						actions: [
							{ type: "append", text: "lost" },
							{ type: "script", path },
						],
					},
				],
				context,
			);
			expect(bad.parts).toEqual([part]);
			expect(bad.failures).toEqual(["script"]);
		}
		const missing = await runPipeline(
			[part],
			[{ ...base, actions: [{ type: "file", path: "absent.txt" }] }],
			context,
		);
		expect(missing.parts).toEqual([part]);
		expect(missing.failures).toHaveLength(1);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});
