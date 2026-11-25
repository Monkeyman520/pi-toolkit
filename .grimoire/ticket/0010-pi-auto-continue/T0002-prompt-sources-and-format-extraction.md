# Prompt sources, bounded subprocess execution, format extraction, and queue import

**Ticket ID:** T0002
**Source:** [Spec 0012](../../spec/0012-pi-auto-continue.md) (C3, C4, C6)
**Status:** Todo

## Goal

Implement multi-mode continuation prompt resolution—Prompt Pipe (`promptPipe` + last-match `pipeFormatPrefix`/`pipeFormatSuffix` extraction), dynamic UTF-8 file (`promptFile`), and Direct template (`{round}`, `{maxRounds}`)—plus local file parsing for `/auto-continue queue import <file>`, backed by a reusable bounded cross-platform subprocess runner with strict timeout and `AbortSignal` termination.

## Affected Surfaces

- `packages/pi-auto-continue/extensions/process.ts` — Cross-platform bounded `runShellCommand(command, options)` helper (`cmd /d /s /c` on Windows with `windowsHide: true`, `sh -c` on Unix; bounded stdout/stderr <= 1 MiB; strict timeout + `AbortSignal` termination).
- `packages/pi-auto-continue/extensions/prompts.ts` — `extractLastTagBlock()`, `formatDirectPrompt()`, `readPromptFile()`, `readQueueImportFile()`, and `resolveContinuationPrompt()` implementing precedence (`promptPipe` > `promptFile` > `prompt` > default) and fail-closed error results.
- `packages/pi-auto-continue/tests/prompts.test.ts` — Unit tests for Direct placeholders, dynamic file reload + CRLF normalization + failure cases, `queue import` parsing (`---` blocks and line-based fallback), format tag extraction (single/multiple/multiline/missing + `pipeRequireFormat`), and real short-lived subprocess execution, timeout kill, and `AbortSignal` cancellation.

## Approach

- In `extensions/process.ts`:
  - Spawn using platform shell (`process.platform === "win32"` → `cmd.exe /d /s /c <command>` with `windowsHide: true`; Unix → `sh -c <command>`), `stdin: "ignore"`, piped `stdout`/`stderr`, passing merged `env` and `cwd`.
  - Cap collected stdout/stderr bytes (1 MiB) so runaway output cannot OOM Pi.
  - Enforce `timeoutMs` timer and `signal?: AbortSignal`; on timeout or abort, terminate the child cleanly (clear timers on exit) and return a structured `{ ok: false, kind: "timeout" | "aborted" | "spawn_error" | "exit_error", ... }` result without throwing unhandled rejections.
- In `extensions/prompts.ts`:
  - `extractLastTagBlock(output, prefix, suffix)`: `output.lastIndexOf(prefix)` → find `suffix` after prefix → return trimmed inner text.
  - `readQueueImportFile(filePath)`: verify regular file `<= 1 MiB`, read UTF-8, normalize `\r\n`/`\r` → `\n`; if standalone `---` separator lines exist, split by `/^\s*---\s*$/m` into multiline items; otherwise split by newline; trim and discard empty entries; fail if missing/unreadable/oversized/no items.
  - `resolveContinuationPrompt(...)`:
    1. If `promptPipe` is non-empty: run `runShellCommand`, fail on error/timeout/abort/empty stdout; if both `pipeFormatPrefix` and `pipeFormatSuffix` are non-empty, extract last match (if missing and `pipeRequireFormat` is `true`, return failure; if `false`, return warning + full trimmed stdout).
    2. Else if `promptFile` is non-empty: verify regular file `<= 1 MiB`, read UTF-8, normalize `\r\n`/`\r` → `\n`, trim; fail if missing/unreadable/oversized/empty.
    3. Else: substitute `{round}` and `{maxRounds}` in `prompt` in a single pass.

## Dependencies and Coordination

- **Blocked by:** T0001 (requires package scaffold and `Settings` types).
- **Blocks:** T0003 (`process.ts` and `prompts.ts`), T0004 (commands/UI integrate prompt modes and `queue import`), T0005, T0006.
- **Coordination risks:** `extensions/process.ts` is consumed by T0003 (`stop-hooks.ts`); keep its option/return contract general (`command`, `cwd`, `env`, `timeoutMs`, `signal`, `maxBytes`).

## Acceptance

- [ ] Direct prompts substitute `{round}` and `{maxRounds}` in a single pass and fall back to default when blank.
- [ ] `promptFile` re-reads file contents dynamically on every call, normalizes `\r\n` and `\r` to `\n`, trims whitespace, and fails cleanly when missing, oversized, or empty.
- [ ] `readQueueImportFile()` parses both `---`-separated multiline blocks and single-line lists, rejects empty/missing/oversized files, and trims whitespace.
- [ ] `extractLastTagBlock()` extracts the last matching `prefix...suffix` span (including multiline content) and handles missing tags according to `pipeRequireFormat`.
- [ ] `promptPipe` runs a real command cross-platform, returns trimmed stdout, fails closed on non-zero exit or empty output, and kills the child cleanly on timeout or `AbortSignal`.
- [ ] `bun run --cwd packages/pi-auto-continue typecheck`, `check`, and `test` pass.

## Out of Scope

- StopHook evaluation (`stopFile`, `stopCommand`) — T0003.
- Pi lifecycle wiring — T0003/T0004.
