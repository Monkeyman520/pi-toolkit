import { readFile, stat } from "node:fs/promises";
import { DEFAULT_CONTINUE_PROMPT, type Settings } from "./loop.ts";
import { DEFAULT_MAX_OUTPUT_BYTES, runShellCommand } from "./process.ts";

export const MAX_PROMPT_FILE_BYTES = DEFAULT_MAX_OUTPUT_BYTES;

function normalizeLineEndings(text: string): string {
	return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

export function extractLastTagBlock(
	output: string,
	prefix: string,
	suffix: string,
): string | undefined {
	if (!prefix || !suffix) return undefined;
	let searchFrom = output.length;
	while (searchFrom >= 0) {
		const start = output.lastIndexOf(prefix, searchFrom);
		if (start < 0) return undefined;
		const contentStart = start + prefix.length;
		const end = output.indexOf(suffix, contentStart);
		if (end >= 0) {
			return output.slice(contentStart, end).trim();
		}
		if (start === 0) return undefined;
		searchFrom = start - 1;
	}
	return undefined;
}

export function formatDirectPrompt(
	template: string,
	meta: { round: number; maxRounds: number },
): string {
	const base = template.trim() || DEFAULT_CONTINUE_PROMPT;
	return base.replace(/\{(round|maxRounds)\}/g, (_match, key: string) => {
		if (key === "round") return String(meta.round);
		return String(meta.maxRounds);
	});
}

async function readBoundedUtf8File(
	filePath: string,
	label: string,
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
	try {
		const info = await stat(filePath);
		if (!info.isFile()) {
			return {
				ok: false,
				error: `${label} is not a regular file: ${filePath}`,
			};
		}
		if (info.size > MAX_PROMPT_FILE_BYTES) {
			return {
				ok: false,
				error: `${label} exceeds ${MAX_PROMPT_FILE_BYTES} bytes: ${filePath}`,
			};
		}
		const raw = await readFile(filePath, "utf8");
		if (Buffer.byteLength(raw) > MAX_PROMPT_FILE_BYTES) {
			return {
				ok: false,
				error: `${label} exceeds ${MAX_PROMPT_FILE_BYTES} bytes: ${filePath}`,
			};
		}
		return { ok: true, text: normalizeLineEndings(raw) };
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		return {
			ok: false,
			error: `Failed to read ${label} (${filePath}): ${msg}`,
		};
	}
}

export async function readPromptFile(
	filePath: string,
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
	const loaded = await readBoundedUtf8File(filePath, "promptFile");
	if (!loaded.ok) return loaded;
	const trimmed = loaded.text.trim();
	if (!trimmed) {
		return { ok: false, error: `promptFile is empty: ${filePath}` };
	}
	return { ok: true, text: trimmed };
}

export async function readQueueImportFile(
	filePath: string,
): Promise<{ ok: true; items: string[] } | { ok: false; error: string }> {
	const loaded = await readBoundedUtf8File(filePath, "queue import file");
	if (!loaded.ok) return loaded;
	const separator = /^[ \t]*---[ \t]*$/m;
	const rawParts = separator.test(loaded.text)
		? loaded.text.split(separator)
		: loaded.text.split("\n");
	const items = rawParts.map((part) => part.trim()).filter(Boolean);
	if (items.length === 0) {
		return {
			ok: false,
			error: `queue import file contains no prompt items: ${filePath}`,
		};
	}
	return { ok: true, items };
}

export type PromptResolutionResult =
	| {
			ok: true;
			prompt: string;
			mode: "pipe" | "file" | "direct";
			warning?: string;
	  }
	| {
			ok: false;
			error: string;
			reason: string;
			aborted?: boolean;
	  };

export async function resolveContinuationPrompt(params: {
	settings: Settings;
	round: number;
	maxRounds: number;
	queueLength: number;
	cwd: string;
	signal?: AbortSignal;
}): Promise<PromptResolutionResult> {
	const { settings, round, maxRounds, queueLength, cwd, signal } = params;

	if (settings.promptPipe.trim()) {
		const res = await runShellCommand(settings.promptPipe, {
			cwd,
			timeoutMs: settings.pipeTimeoutMs,
			signal,
			maxBytes: MAX_PROMPT_FILE_BYTES,
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
					? "promptPipe timed out"
					: res.kind === "aborted"
						? "promptPipe aborted"
						: res.kind === "spawn_error"
							? "promptPipe spawn failed"
							: `promptPipe failed (exit ${res.exitCode ?? "unknown"})`;
			return {
				ok: false,
				error: `Prompt pipe error: ${res.error}`,
				reason,
				aborted: res.kind === "aborted",
			};
		}

		const normalized = normalizeLineEndings(res.stdout).trim();
		if (!normalized) {
			return {
				ok: false,
				error: "Prompt pipe returned empty stdout.",
				reason: "promptPipe returned empty output",
			};
		}

		const prefix = settings.pipeFormatPrefix.trim();
		const suffix = settings.pipeFormatSuffix.trim();
		if (prefix && suffix) {
			const extracted = extractLastTagBlock(normalized, prefix, suffix);
			if (extracted === undefined) {
				if (settings.pipeRequireFormat) {
					return {
						ok: false,
						error: `Prompt pipe output missing required format tags (${prefix}...${suffix}).`,
						reason: "promptPipe missing required format tags",
					};
				}
				return {
					ok: true,
					prompt: normalized,
					mode: "pipe",
					warning: `Prompt pipe output missing format tags (${prefix}...${suffix}); falling back to full stdout.`,
				};
			}
			if (!extracted) {
				return {
					ok: false,
					error: `Prompt pipe extracted empty content between ${prefix} and ${suffix}.`,
					reason: "promptPipe extracted empty format block",
				};
			}
			return { ok: true, prompt: extracted, mode: "pipe" };
		}

		return { ok: true, prompt: normalized, mode: "pipe" };
	}

	if (settings.promptFile.trim()) {
		const loaded = await readPromptFile(settings.promptFile.trim());
		if (!loaded.ok) {
			return {
				ok: false,
				error: loaded.error,
				reason: "promptFile unavailable or empty",
			};
		}
		return { ok: true, prompt: loaded.text, mode: "file" };
	}

	return {
		ok: true,
		prompt: formatDirectPrompt(settings.prompt, { round, maxRounds }),
		mode: "direct",
	};
}
