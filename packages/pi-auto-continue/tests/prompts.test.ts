import { describe, expect, it } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_CONTINUE_PROMPT, defaults } from "../extensions/loop.ts";
import { runShellCommand } from "../extensions/process.ts";
import {
	extractLastTagBlock,
	formatDirectPrompt,
	MAX_PROMPT_FILE_BYTES,
	readPromptFile,
	readQueueImportFile,
	resolveContinuationPrompt,
} from "../extensions/prompts.ts";

function nodeCmd(code: string): string {
	return `"${process.execPath}" -e "${code}"`;
}

describe("Direct prompt formatting and format tag extraction", () => {
	it("substitutes {round} and {maxRounds} in a single pass and falls back when blank", () => {
		expect(
			formatDirectPrompt("Round {round}/{maxRounds}", {
				round: 3,
				maxRounds: 10,
			}),
		).toBe("Round 3/10");
		expect(formatDirectPrompt("   \n\t  ", { round: 1, maxRounds: 5 })).toBe(
			DEFAULT_CONTINUE_PROMPT,
		);
	});

	it("extracts the last matching prefix...suffix block including multiline content", () => {
		const output = [
			"Reviewer notes...",
			"<continue>",
			"First draft prompt",
			"</continue>",
			"More analysis",
			"<continue>",
			"  Final line 1",
			"Final line 2  ",
			"</continue>",
			"Trailing summary",
		].join("\n");
		expect(extractLastTagBlock(output, "<continue>", "</continue>")).toBe(
			"Final line 1\nFinal line 2",
		);
		expect(
			extractLastTagBlock("no tags here", "<continue>", "</continue>"),
		).toBeUndefined();
		expect(
			extractLastTagBlock(
				"<continue>valid</continue> stray <continue>unclosed",
				"<continue>",
				"</continue>",
			),
		).toBe("valid");
	});
});

describe("Dynamic promptFile and queue import file parsing", () => {
	it("re-reads promptFile dynamically, normalizes CRLF/CR, and fails closed on empty/missing/oversized", async () => {
		const dir = await mkdtemp(join(tmpdir(), "pi-auto-continue-prompts-"));
		try {
			const filePath = join(dir, "prompt.txt");
			await writeFile(filePath, "  Line 1\r\nLine 2\rLine 3  ", "utf8");
			const first = await readPromptFile(filePath);
			expect(first).toEqual({ ok: true, text: "Line 1\nLine 2\nLine 3" });

			// Live edit
			await writeFile(filePath, "Updated live prompt", "utf8");
			const second = await readPromptFile(filePath);
			expect(second).toEqual({ ok: true, text: "Updated live prompt" });

			// Empty fails closed
			await writeFile(filePath, "  \r\n  ", "utf8");
			const empty = await readPromptFile(filePath);
			expect(empty.ok).toBe(false);

			// Missing fails closed
			const missing = await readPromptFile(join(dir, "does-not-exist.txt"));
			expect(missing.ok).toBe(false);

			// Oversized fails closed
			const bigPath = join(dir, "big.txt");
			await writeFile(bigPath, "a".repeat(MAX_PROMPT_FILE_BYTES + 10), "utf8");
			const oversized = await readPromptFile(bigPath);
			expect(oversized.ok).toBe(false);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it("parses queue import files with --- separators or line-based fallback", async () => {
		const dir = await mkdtemp(join(tmpdir(), "pi-auto-continue-import-"));
		try {
			const blockFile = join(dir, "blocks.md");
			await writeFile(
				blockFile,
				"Task 1 line 1\r\nTask 1 line 2\r\n---\r\n\r\nTask 2\r\n  ---  \r\n   \r\n---\r\nTask 3\r\n",
				"utf8",
			);
			expect(await readQueueImportFile(blockFile)).toEqual({
				ok: true,
				items: ["Task 1 line 1\nTask 1 line 2", "Task 2", "Task 3"],
			});

			const lineFile = join(dir, "lines.txt");
			await writeFile(
				lineFile,
				"\n  First task  \r\n\r\nSecond task\n",
				"utf8",
			);
			expect(await readQueueImportFile(lineFile)).toEqual({
				ok: true,
				items: ["First task", "Second task"],
			});

			const emptyFile = join(dir, "empty.txt");
			await writeFile(emptyFile, "  \n --- \n  ", "utf8");
			expect((await readQueueImportFile(emptyFile)).ok).toBe(false);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});
});

describe("Bounded subprocess execution and promptPipe resolution", () => {
	it("runs promptPipe cross-platform, extracts last tag block, and respects pipeRequireFormat", async () => {
		const cmd = nodeCmd(
			"console.log('prose <continue>first</continue> mid <continue>round=' + process.env.PI_AUTO_CONTINUE_ROUND + '</continue> end')",
		);
		const extracted = await resolveContinuationPrompt({
			settings: {
				...defaults,
				promptPipe: cmd,
				pipeFormatPrefix: "<continue>",
				pipeFormatSuffix: "</continue>",
				pipeRequireFormat: true,
			},
			round: 2,
			maxRounds: 5,
			queueLength: 0,
			cwd: process.cwd(),
		});
		expect(extracted).toEqual({
			ok: true,
			prompt: "round=2",
			mode: "pipe",
		});

		const plainCmd = nodeCmd("console.log('untagged output')");
		const fallback = await resolveContinuationPrompt({
			settings: {
				...defaults,
				promptPipe: plainCmd,
				pipeFormatPrefix: "<continue>",
				pipeFormatSuffix: "</continue>",
				pipeRequireFormat: false,
			},
			round: 1,
			maxRounds: 5,
			queueLength: 0,
			cwd: process.cwd(),
		});
		expect(fallback.ok).toBe(true);
		if (fallback.ok) {
			expect(fallback.prompt).toBe("untagged output");
			expect(fallback.warning).toContain("missing format tags");
		}

		const strictMissing = await resolveContinuationPrompt({
			settings: {
				...defaults,
				promptPipe: plainCmd,
				pipeFormatPrefix: "<continue>",
				pipeFormatSuffix: "</continue>",
				pipeRequireFormat: true,
			},
			round: 1,
			maxRounds: 5,
			queueLength: 0,
			cwd: process.cwd(),
		});
		expect(strictMissing.ok).toBe(false);
		if (!strictMissing.ok) {
			expect(strictMissing.reason).toBe(
				"promptPipe missing required format tags",
			);
		}
	});

	it("fails closed on non-zero exit, empty stdout, timeout, and AbortSignal cancellation", async () => {
		const failExit = await resolveContinuationPrompt({
			settings: {
				...defaults,
				promptPipe: nodeCmd("process.exit(3)"),
			},
			round: 1,
			maxRounds: 5,
			queueLength: 0,
			cwd: process.cwd(),
		});
		expect(failExit.ok).toBe(false);

		const emptyOut = await resolveContinuationPrompt({
			settings: {
				...defaults,
				promptPipe: nodeCmd("process.stdout.write('   \\n ')"),
			},
			round: 1,
			maxRounds: 5,
			queueLength: 0,
			cwd: process.cwd(),
		});
		expect(emptyOut.ok).toBe(false);

		const slowCmd = nodeCmd("setTimeout(() => console.log('late'), 10000)");
		const timedOut = await runShellCommand(slowCmd, {
			cwd: process.cwd(),
			timeoutMs: 150,
		});
		expect(timedOut.ok).toBe(false);
		if (!timedOut.ok) {
			expect(timedOut.kind).toBe("timeout");
		}

		const ac = new AbortController();
		const abortPromise = runShellCommand(slowCmd, {
			cwd: process.cwd(),
			timeoutMs: 10000,
			signal: ac.signal,
		});
		setTimeout(() => ac.abort(), 80);
		const aborted = await abortPromise;
		expect(aborted.ok).toBe(false);
		if (!aborted.ok) {
			expect(aborted.kind).toBe("aborted");
		}
	});
});
