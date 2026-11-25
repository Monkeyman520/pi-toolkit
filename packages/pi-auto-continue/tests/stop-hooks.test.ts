import { describe, expect, it } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	evaluatePreDispatchStopHooks,
	evaluateStopCommand,
	lastNonEmptyTrimmedLine,
	stopFileExists,
} from "../extensions/stop-hooks.ts";

function nodeCmd(code: string): string {
	return `"${process.execPath}" -e "${code}"`;
}

describe("stopFile sentinel and stdout line helper", () => {
	it("extracts the last non-empty trimmed line", () => {
		expect(lastNonEmptyTrimmedLine("  \nlog line\r\n  0  \r\n  ")).toBe("0");
		expect(lastNonEmptyTrimmedLine("1\n\n")).toBe("1");
		expect(lastNonEmptyTrimmedLine("   \r\n\t  ")).toBeUndefined();
	});

	it("detects sentinel file existence cleanly", async () => {
		const dir = await mkdtemp(join(tmpdir(), "pi-auto-continue-stopfile-"));
		try {
			const filePath = join(dir, "STOP");
			expect(await stopFileExists(filePath)).toBe(false);
			expect(
				await evaluatePreDispatchStopHooks({
					stopFile: filePath,
					stopCommand: "",
					stopCommandTimeoutMs: 5000,
					round: 1,
					maxRounds: 5,
					queueLength: 2,
					cwd: dir,
				}),
			).toEqual({ stop: false });

			await writeFile(filePath, "halt", "utf8");
			expect(await stopFileExists(filePath)).toBe(true);
			const res = await evaluatePreDispatchStopHooks({
				stopFile: filePath,
				stopCommand: "",
				stopCommandTimeoutMs: 5000,
				round: 1,
				maxRounds: 5,
				queueLength: 2,
				cwd: dir,
			});
			expect(res.stop).toBe(true);
			if (res.stop) {
				expect(res.reason).toBe("stopped by sentinel file");
			}
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});
});

describe("one-shot stopCommand evaluation", () => {
	it("continues on exit 0 with '1' or empty stdout and propagates context env vars", async () => {
		const cwd = process.cwd();
		const checkEnv = nodeCmd(
			"const ok = process.env.PI_AUTO_CONTINUE_ROUND === '3' && process.env.PI_AUTO_CONTINUE_MAX_ROUNDS === '10' && process.env.PI_AUTO_CONTINUE_QUEUE_LENGTH === '4' && Boolean(process.env.PI_AUTO_CONTINUE_CWD); console.log(ok ? '1' : '0');",
		);
		expect(
			await evaluateStopCommand({
				command: checkEnv,
				timeoutMs: 5000,
				round: 3,
				maxRounds: 10,
				queueLength: 4,
				cwd,
			}),
		).toEqual({ stop: false });

		expect(
			await evaluateStopCommand({
				command: nodeCmd("process.stdout.write('   \\n')"),
				timeoutMs: 5000,
				round: 1,
				maxRounds: 5,
				queueLength: 0,
				cwd,
			}),
		).toEqual({ stop: false });
	});

	it("stops fail-closed on stdout '0', non-zero exit, timeout, and AbortSignal", async () => {
		const cwd = process.cwd();

		const zeroOut = await evaluateStopCommand({
			command: nodeCmd("console.log('checking...'); console.log('0');"),
			timeoutMs: 5000,
			round: 1,
			maxRounds: 5,
			queueLength: 1,
			cwd,
		});
		expect(zeroOut.stop).toBe(true);
		if (zeroOut.stop) {
			expect(zeroOut.reason).toBe("stopped by stopCommand");
		}

		const nonZero = await evaluateStopCommand({
			command: nodeCmd("process.exit(2)"),
			timeoutMs: 5000,
			round: 1,
			maxRounds: 5,
			queueLength: 1,
			cwd,
		});
		expect(nonZero.stop).toBe(true);
		if (nonZero.stop) {
			expect(nonZero.reason).toBe("stopped by stopCommand");
		}

		const slow = nodeCmd("setTimeout(() => console.log('1'), 10000)");
		const timedOut = await evaluateStopCommand({
			command: slow,
			timeoutMs: 150,
			round: 1,
			maxRounds: 5,
			queueLength: 0,
			cwd,
		});
		expect(timedOut.stop).toBe(true);
		if (timedOut.stop) {
			expect(timedOut.reason).toBe("stopCommand timed out");
		}

		const ac = new AbortController();
		const abortPromise = evaluateStopCommand({
			command: slow,
			timeoutMs: 10000,
			round: 1,
			maxRounds: 5,
			queueLength: 0,
			cwd,
			signal: ac.signal,
		});
		setTimeout(() => ac.abort(), 80);
		const aborted = await abortPromise;
		expect(aborted.stop).toBe(true);
		if (aborted.stop) {
			expect(aborted.reason).toBe("stopCommand aborted");
			expect(aborted.aborted).toBe(true);
		}
	});
});
