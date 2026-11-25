# Lifecycle, concurrency, queue, abort, and orthogonal coexistence tests

**Ticket ID:** T0005
**Source:** [Spec 0012](../../spec/0012-pi-auto-continue.md) (C2, C3, C5, C7, C8)
**Status:** Todo

## Goal

Add thorough lifecycle, concurrency, queue-integrity, immediate-dispatch, cancellation, and error/quota-coexistence regression tests for `packages/pi-auto-continue/` verifying factory inactivity, session cleanup, multi-instance isolation, disarm queue preservation, send-error rollback, immediate termination of in-flight `promptPipe`/`stopCommand` processes on cancel/shutdown, and clean `onError` (`defer` / `wait-quota` / `stop`) behavior.

## Affected Surfaces

- `packages/pi-auto-continue/tests/lifecycle.test.ts` — Full extension lifecycle and concurrency test suite (modeled on `packages/pi-auto-resume/tests/lifecycle.test.ts`).
- Targeted bug fixes in `packages/pi-auto-continue/extensions/` if any race or leak is uncovered by the suite.

## Approach

- Exercise the real `extensions/index.ts` factory with mocked Pi `ExtensionAPI` / `ExtensionContext` (including `ctx.ui.editor`) and real temp files / short-lived Node child scripts (`process.execPath -e ...` for deterministic cross-platform `promptPipe` and `stopCommand` fixtures).
- Cover:
  1. Factory inactivity before `session_start` (0 timers, 0 discovery registrations), repeated `session_start` cleanup, and complete timer/listener/abort/queue cleanup on `session_shutdown`.
  2. Multi-instance isolation on a shared `EventBus` (shutting down instance A does not affect instance B's timer, queue, pending round, or panel registration).
  3. 1-second countdown status deduplication on 250ms ticks (no redundant `setStatus()` calls within the same second).
  4. Continuation queue lifecycle: FIFO drain with `{ expandPromptTemplates: true }`, `queueEmptyPolicy: "stop"` vs `"continue"`, queue preservation across `/auto-continue stop`/Esc/Ctrl+C/abort/`model_select`/`session_tree`, explicit `queue clear`, rollback to head when `pi.sendUserMessage()` throws, and TUI `ctx.ui.editor()` multiline `queue add`.
  5. Immediate dispatch: `queue send` while idle (overriding pending delay/quota wait and even while disarmed), `queue send` while busy (`deliverAs: "followUp"`), and `queue steer` while busy (`deliverAs: "steer"`).
  6. In-flight slow `promptPipe` / `stopCommand` aborted cleanly on `/auto-continue stop`, TUI Esc/Ctrl+C, new human `input`, `session_tree`, `model_select`, and `session_shutdown` — verifying zero late `sendUserMessage()` calls.
  7. Orthogonal error & quota handling: `onError: "defer"` (error turn does not consume queue or emit duplicate retry; subsequent normal completion resumes queue drain), `onError: "wait-quota"` (concrete `Retry-After` schedules queue after `resetTime + quotaDelayMs`; missing reset time pauses cleanly), idle `/auto-continue start` honoring an already-observed `quotaResetAt`, and `onError: "stop"` disarming while keeping queue intact.
  8. Delayed `session_start` config load race cannot resurrect an older session's resources.

## Dependencies and Coordination

- **Blocked by:** T0004 (requires full command, queue, UI, and lifecycle integration).
- **Blocks:** T0006 (documentation and standalone real-Pi smoke verification).
- **Coordination risks:** Use `process.execPath -e ...` for child-process fixtures in tests so they run identically on Windows and Unix without relying on `sleep` or bash-only syntax.

## Acceptance

- [ ] Lifecycle tests verify zero timers/registrations before `session_start`, clean replacement on repeated `session_start`, and zero leaks on `session_shutdown`.
- [ ] Multi-instance isolation test confirms stopping one instance leaves sibling instances untouched.
- [ ] Queue preservation across disarm, rollback on `sendUserMessage()` error, `queueEmptyPolicy`, `expandPromptTemplates`, TUI editor add, and immediate `send`/`steer` (idle + busy) all pass deterministically.
- [ ] In-flight `promptPipe` and `stopCommand` abort tests confirm no stale `sendUserMessage()` fires after cancel, human input, or shutdown.
- [ ] `onError: "defer"`, `"wait-quota"`, and `"stop"` plus quota-reset countdown scenarios pass deterministically.
- [ ] 1-second status countdown deduplication is verified.
- [ ] `bun run --cwd packages/pi-auto-continue typecheck`, `check`, and `test` pass.

## Out of Scope

- Live LLM provider calls or physical terminal keyboard testing.
