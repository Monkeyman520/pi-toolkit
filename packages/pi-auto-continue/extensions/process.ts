import { spawn } from "node:child_process";

export const DEFAULT_MAX_OUTPUT_BYTES = 1024 * 1024;

export interface ShellCommandOptions {
	cwd?: string;
	env?: NodeJS.ProcessEnv;
	timeoutMs: number;
	signal?: AbortSignal;
	maxBytes?: number;
}

export type ShellCommandResult =
	| {
			ok: true;
			stdout: string;
			stderr: string;
			exitCode: number;
			truncated: boolean;
	  }
	| {
			ok: false;
			kind: "timeout" | "aborted" | "spawn_error" | "exit_error";
			stdout: string;
			stderr: string;
			exitCode: number | null;
			signal?: NodeJS.Signals | null;
			error: string;
			truncated: boolean;
	  };

function terminateProcessTree(pid: number | undefined): void {
	if (pid === undefined || pid <= 0) return;
	if (process.platform === "win32") {
		try {
			const killer = spawn("taskkill", ["/pid", String(pid), "/T", "/F"], {
				stdio: "ignore",
				windowsHide: true,
			});
			killer.unref?.();
			killer.on("error", () => {});
		} catch {
			// Best-effort process tree kill on Windows.
		}
		return;
	}
	try {
		process.kill(-pid, "SIGKILL");
	} catch {
		try {
			process.kill(pid, "SIGKILL");
		} catch {
			// Process already exited.
		}
	}
}

export function runShellCommand(
	command: string,
	options: ShellCommandOptions,
): Promise<ShellCommandResult> {
	const maxBytes = options.maxBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
	if (options.signal?.aborted) {
		return Promise.resolve({
			ok: false,
			kind: "aborted",
			stdout: "",
			stderr: "",
			exitCode: null,
			error: "Command aborted before start.",
			truncated: false,
		});
	}

	return new Promise<ShellCommandResult>((resolve) => {
		const isWin = process.platform === "win32";
		const shell = isWin ? process.env.ComSpec || "cmd.exe" : "sh";
		const args = isWin ? ["/d", "/s", "/c", `"${command}"`] : ["-c", command];
		const child = spawn(shell, args, {
			cwd: options.cwd,
			env: options.env ?? process.env,
			stdio: ["ignore", "pipe", "pipe"],
			windowsHide: true,
			windowsVerbatimArguments: isWin,
			detached: !isWin,
		});

		const stdoutChunks: Buffer[] = [];
		const stderrChunks: Buffer[] = [];
		let stdoutBytes = 0;
		let stderrBytes = 0;
		let truncated = false;
		let settled = false;
		let timedOut = false;
		let aborted = false;
		let forceCloseTimer: ReturnType<typeof setTimeout> | undefined;

		const cleanup = () => {
			clearTimeout(timeoutTimer);
			if (forceCloseTimer) {
				clearTimeout(forceCloseTimer);
				forceCloseTimer = undefined;
			}
			options.signal?.removeEventListener("abort", onAbort);
		};

		const finish = (result: ShellCommandResult) => {
			if (settled) return;
			settled = true;
			cleanup();
			resolve(result);
		};

		const collectStdout = () => Buffer.concat(stdoutChunks).toString("utf8");
		const collectStderr = () => Buffer.concat(stderrChunks).toString("utf8");

		const killAndScheduleForceFinish = (
			kind: "timeout" | "aborted",
			error: string,
		) => {
			if (settled) return;
			try {
				child.kill("SIGTERM");
			} catch {
				// Ignore kill errors if already exited.
			}
			terminateProcessTree(child.pid);
			child.stdout?.destroy();
			child.stderr?.destroy();
			// Ensure we never hang if a grandchild kept pipes open briefly.
			forceCloseTimer = setTimeout(() => {
				finish({
					ok: false,
					kind,
					stdout: collectStdout(),
					stderr: collectStderr(),
					exitCode: child.exitCode,
					signal: child.signalCode,
					error,
					truncated,
				});
			}, 250);
			forceCloseTimer.unref?.();
		};

		const onAbort = () => {
			if (settled || aborted) return;
			aborted = true;
			killAndScheduleForceFinish("aborted", "Command aborted.");
		};

		const timeoutTimer = setTimeout(() => {
			if (settled || timedOut) return;
			timedOut = true;
			killAndScheduleForceFinish(
				"timeout",
				`Command timed out after ${options.timeoutMs}ms.`,
			);
		}, options.timeoutMs);
		timeoutTimer.unref?.();

		options.signal?.addEventListener("abort", onAbort, { once: true });

		child.stdout?.on("data", (chunk: Buffer) => {
			if (stdoutBytes >= maxBytes) {
				truncated = true;
				return;
			}
			const remaining = maxBytes - stdoutBytes;
			if (chunk.length > remaining) {
				stdoutChunks.push(chunk.subarray(0, remaining));
				stdoutBytes += remaining;
				truncated = true;
			} else {
				stdoutChunks.push(chunk);
				stdoutBytes += chunk.length;
			}
		});

		child.stderr?.on("data", (chunk: Buffer) => {
			if (stderrBytes >= maxBytes) {
				truncated = true;
				return;
			}
			const remaining = maxBytes - stderrBytes;
			if (chunk.length > remaining) {
				stderrChunks.push(chunk.subarray(0, remaining));
				stderrBytes += remaining;
				truncated = true;
			} else {
				stderrChunks.push(chunk);
				stderrBytes += chunk.length;
			}
		});

		child.once("error", (err) => {
			finish({
				ok: false,
				kind: aborted ? "aborted" : "spawn_error",
				stdout: collectStdout(),
				stderr: collectStderr(),
				exitCode: null,
				error: `Failed to spawn command: ${err.message}`,
				truncated,
			});
		});

		child.once("close", (code, sig) => {
			const stdout = collectStdout();
			const stderr = collectStderr();
			if (aborted) {
				finish({
					ok: false,
					kind: "aborted",
					stdout,
					stderr,
					exitCode: code,
					signal: sig,
					error: "Command aborted.",
					truncated,
				});
				return;
			}
			if (timedOut) {
				finish({
					ok: false,
					kind: "timeout",
					stdout,
					stderr,
					exitCode: code,
					signal: sig,
					error: `Command timed out after ${options.timeoutMs}ms.`,
					truncated,
				});
				return;
			}
			if (code !== 0) {
				const detail = stderr.trim() || `exit code ${code ?? "null"}`;
				finish({
					ok: false,
					kind: "exit_error",
					stdout,
					stderr,
					exitCode: code,
					signal: sig,
					error: `Command failed (${detail})`,
					truncated,
				});
				return;
			}
			finish({
				ok: true,
				stdout,
				stderr,
				exitCode: 0,
				truncated,
			});
		});
	});
}
