# Stop-hook evaluation, quota observation, and guarded pre-dispatch pipeline

**Ticket ID:** T0003
**Source:** [Spec 0012](../../spec/0012-pi-auto-continue.md) (C2, C3, C5, C6)
**Status:** Todo

## Goal

Implement pre-dispatch `stopFile` sentinel detection and one-shot `stopCommand` StopHook evaluation (reusing `extensions/process.ts`), and wire the generation- and `AbortController`-guarded pre-dispatch pipeline, provider quota-reset observation, and immediate `send`/`steer` queue dispatch (with `{ expandPromptTemplates, deliverAs }` and send-error rollback) into `extensions/index.ts`.

## Affected Surfaces

- `packages/pi-auto-continue/extensions/stop-hooks.ts` — `stopFileExists()`, `evaluateStopCommand()`, and `evaluatePreDispatchStopHooks()` returning `{ stop: false }` or `{ stop: true, reason }`.
- `packages/pi-auto-continue/extensions/index.ts` — Wire Pi lifecycle events (`session_start`, `session_shutdown`, `session_tree`, `model_select`, `input`, `agent_start`, `before_provider_request`, `after_provider_response`, `message_end`, `agent_settled`), 250ms tick loop, `AbortController` management for in-flight pre-dispatch work, queue-first dispatch (`Queue > Prompt Pipe > Prompt File > Direct`) with send-error rollback, immediate `sendQueuedItemNow(index, mode)` helper, 1-second deduplicated status updates, and optional dispatch notification (`notifyOnContinue`).
- `packages/pi-auto-continue/tests/stop-hooks.test.ts` — Unit tests for `stopFile` and `stopCommand` (exit code 0/`"1"`/empty continues; exit non-zero, stdout last non-empty line `"0"`, spawn error, timeout, and abort stop fail-closed; env vars including `PI_AUTO_CONTINUE_QUEUE_LENGTH` passed).

## Approach

- In `extensions/stop-hooks.ts`:
  - Check `stopFile` first (`access()` check; treat existing file or non-`ENOENT`/`ENOTDIR` error as present → `{ stop: true, reason: "stopped by sentinel file" }`).
  - If `stopCommand` is non-empty, call `runShellCommand()` with `timeoutMs: stopCommandTimeoutMs`, `cwd`, `signal`, and env vars `PI_AUTO_CONTINUE_ROUND`, `PI_AUTO_CONTINUE_MAX_ROUNDS`, `PI_AUTO_CONTINUE_QUEUE_LENGTH`, `PI_AUTO_CONTINUE_CWD`.
  - Fail closed on spawn failure, timeout, abort, or non-zero exit code; inspect last non-empty trimmed line of stdout — if `"0"`, return `{ stop: true, reason: "stopped by stopCommand" }`; otherwise continue.
- In `extensions/index.ts`:
  - Track `generation`, `dispatching`, and `activeAbort: AbortController | undefined`.
  - Any cancellation boundary (`stop()`, `session_shutdown`, `session_tree`, `model_select`, `input`, TUI Esc/Ctrl+C, `/auto-continue stop`, `agent_start`) aborts `activeAbort` immediately.
  - Pre-dispatch async flow when `controller.peekDue(now, idle)` triggers:
    1. Check `configManager.error` (fail closed if invalid).
    2. Set live phase status (`running stop hook...`), run `evaluatePreDispatchStopHooks(...)`; if stopped, disarm with reason (preserving queue), notify UI, and return.
    3. Determine source: if `controller.queueLength() > 0`, peek head queued item; otherwise set live phase status (`running prompt pipe...` when pipe mode) and call `resolveContinuationPrompt(...)` (disarm with reason on failure, preserving queue).
    4. Re-verify `revision === generation`, `ctx === targetCtx`, `targetCtx.isIdle() && !targetCtx.hasPendingMessages()`, and `controller.takeRound(Date.now(), true, due.at)` (which atomically dequeues the head item if `source === "queue"`).
    5. Call `pi.sendUserMessage(prompt, { expandPromptTemplates: effective.expandPromptTemplates })`; if it throws, restore any dequeued item to head via `controller.restoreAt(0, item)`, disarm cleanly, and notify warning.
    6. Emit concise info notification when `notifyOnContinue` is true.
  - Immediate send/steer helper (`dispatchQueuedNow(targetCtx, oneBasedIndex, mode: "send" | "steer")`):
    - Cancel any pending wait and abort in-flight pre-dispatch checks (manual user override).
    - Take item at `oneBasedIndex` (1-based).
    - Compute options: `{ expandPromptTemplates: effective.expandPromptTemplates }` when idle; when busy, add `deliverAs: mode === "steer" ? "steer" : "followUp"`.
    - Call `pi.sendUserMessage(item.text, options)`; if it throws, restore item via `controller.restoreAt(oneBasedIndex - 1, item)` and return error.

## Dependencies and Coordination

- **Blocked by:** T0001 (`ContinueController` queue/quota state and config), T0002 (`process.ts` and `prompts.ts`).
- **Blocks:** T0004 (commands and TUI attach to `index.ts`), T0005, T0006.
- **Coordination risks:** Keep command dispatch and immediate queue helpers cleanly factored so T0004 attaches `/auto-continue` command handlers and TUI panel without duplicating pre-dispatch logic.

## Acceptance

- [ ] `stopFile` existence cancels and disarms continuation without calling `pi.sendUserMessage()` and preserves queued items.
- [ ] `stopCommand` receives `PI_AUTO_CONTINUE_ROUND`, `PI_AUTO_CONTINUE_MAX_ROUNDS`, `PI_AUTO_CONTINUE_QUEUE_LENGTH`, and `PI_AUTO_CONTINUE_CWD`, continues on exit `0` with `"1"` or empty stdout, and stops/disarms on stdout `"0"`, non-zero exit, spawn failure, or timeout.
- [ ] Pre-dispatch pipeline gives continuation-queue items precedence over Prompt Pipe / Prompt File / Direct, passes `{ expandPromptTemplates }`, and restores a dequeued item if `sendUserMessage()` throws.
- [ ] Immediate `send`/`steer` helper dispatches immediately when idle (overriding delay/quota waits) and uses `deliverAs: "followUp"` / `"steer"` when busy, rolling back on send failure.
- [ ] Provider response/message events update quota-reset state cleanly for `quotaWait`.
- [ ] `bun run --cwd packages/pi-auto-continue typecheck`, `check`, and `test` pass.

## Out of Scope

- Long-running resident monitor subprocesses.
- Full CLI flag parser and TUI panel (T0004).
