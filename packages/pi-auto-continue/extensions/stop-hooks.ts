import { access } from "node:fs/promises";
import { runShellCommand } from "./process.ts";

export type StopHookResult =
	| { stop: false }
	| { stop: true; reason: string; detail?: string; aborted?: boolean };

export async function stopFileExists(filePath: string): Promise<boolean> {
	try {
		await access(filePath);
		return true;
	} catch (err) {
		if (
			err instanceof Error &&
			"code" in err &&
			(err.code === "ENOENT" || err.code === "ENOTDIR")
		) {
			return false;
		}
		// Fail closed on unexpected filesystem errors (e.g. permission error).
		return true;
	}
}

export function lastNonEmptyTrimmedLine(text: string): string | undefined {
	const lines = text.split(/\r?\n|\r/);
	for (let i = lines.length - 1; i >= 0; i--) {
		const trimmed = lines[i]?.trim();
		if (trimmed) return trimmed;
	}
	return undefined;
}

export async function evaluateStopCommand(params: {
	command: string;
	timeoutMs: number;
	round: number;
	maxRounds: number;
	queueLength: number;
	cwd: string;
	signal?: AbortSignal;
}): Promise<StopHookResult> {
	const { command, timeoutMs, round, maxRounds, queueLength, cwd, signal } =
		params;
	const res = await runShellCommand(command, {
		cwd,
		timeoutMs,
		signal,
		env: {
			...process.env,
			PI_AUTO_CONTINUE_ROUND: String(round),
			PI_AUTO_CONTINUE_MAX_ROUNDS: String(maxRounds),
			PI_AUTO_CONTINUE_QUEUE_LENGTH: String(queueLength),
			PI_AUTO_CONTINUE_CWD: cwd,
		},
	});
	if (!res.ok) {
		const reason =
			res.kind === "timeout"
				? "stopCommand timed out"
				: res.kind === "aborted"
					? "stopCommand aborted"
					: res.kind === "spawn_error"
						? "stopCommand spawn failed"
						: "stopped by stopCommand";
		return {
			stop: true,
			reason,
			detail: res.error,
			aborted: res.kind === "aborted",
		};
	}

	const lastLine = lastNonEmptyTrimmedLine(res.stdout);
	if (lastLine === "0") {
		return {
			stop: true,
			reason: "stopped by stopCommand",
			detail: 'stopCommand returned "0"',
		};
	}

	return { stop: false };
}

export async function evaluatePreDispatchStopHooks(params: {
	stopFile: string;
	stopCommand: string;
	stopCommandTimeoutMs: number;
	round: number;
	maxRounds: number;
	queueLength: number;
	cwd: string;
	signal?: AbortSignal;
}): Promise<StopHookResult> {
	const stopFile = params.stopFile.trim();
	if (stopFile) {
		const exists = await stopFileExists(stopFile);
		if (exists) {
			return {
				stop: true,
				reason: "stopped by sentinel file",
				detail: stopFile,
			};
		}
	}

	const stopCommand = params.stopCommand.trim();
	if (stopCommand) {
		return evaluateStopCommand({
			command: stopCommand,
			timeoutMs: params.stopCommandTimeoutMs,
			round: params.round,
			maxRounds: params.maxRounds,
			queueLength: params.queueLength,
			cwd: params.cwd,
			signal: params.signal,
		});
	}

	return { stop: false };
}
