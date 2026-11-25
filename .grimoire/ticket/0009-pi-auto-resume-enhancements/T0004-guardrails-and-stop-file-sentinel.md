# Wait-cap, attempt-budget, time guardrails, and stop-file sentinel

**Ticket ID:** T0004
**Source:** [Spec 0011](../../spec/0011-pi-auto-resume-enhancements.md) (R3, R4, R7)
**Status:** Done

## Goal

Add configurable safety bounds for unattended recovery—single-wait cap (`maxWaitMs`, default `0`), cumulative session recovery limit (`maxTotalAttempts`, default `0`), session-only time guardrails (`/auto-resume guard`), and a local `stopFile` sentinel check—without introducing external shell command execution.

## Affected Surfaces

- `packages/pi-auto-resume/extensions/recovery.ts` — Track cumulative `totalAttempts`, enforce `maxWaitMs`, `maxTotalAttempts`, and session deadline (`guardUntilMs`), and expose guardrail state/mutators.
- `packages/pi-auto-resume/extensions/config.ts` — Add optional `maxWaitMs` (default `0`), `maxTotalAttempts` (default `0`), and `stopFile` (optional string) to TypeBox schema and option metadata.
- `packages/pi-auto-resume/extensions/commands.ts` — Add `/auto-resume guard [status | clear | duration <spec> | until <timestamp>]` parsing and full-prefix multi-token `getArgumentCompletions`.
- `packages/pi-auto-resume/extensions/index.ts` — Execute guard commands and perform async `stopFile` existence check inside the generation/idle-guarded pre-dispatch path (and clear session guardrails on session replacement/shutdown).
- `packages/pi-auto-resume/extensions/ui.ts` — Expose `maxWaitMs` and `maxTotalAttempts` in the TUI `SettingsList` panel.
- `packages/pi-auto-resume/tests/recovery.test.ts`, `tests/lifecycle.test.ts`, and `tests/config-candidates.test.ts`.

## Approach

- **Wait cap (`maxWaitMs`):** Default `0` (disabled). When `maxWaitMs > 0` and `(at - now) > maxWaitMs` in `Recovery.failed()`, do not schedule `pending`; set status to a clear message (e.g., `wait exceeds maxWaitMs`).
- **Cumulative session cap (`maxTotalAttempts`):** Default `0` (disabled). Track `totalAttempts` separately from consecutive `attempts`; do not reset `totalAttempts` on `userInput()` or `completed()`, only on a fresh `Recovery` instance (`session_start`). Block scheduling/firing when `maxTotalAttempts > 0 && totalAttempts >= maxTotalAttempts`.
- **Session time guardrails (`/auto-resume guard`):**
  - `guard duration <spec>` accepts human-friendly positive durations (e.g., `30m`, `2h`, `1h30m`, `3600s`, or plain seconds) and sets `guardUntilMs = now + durationMs`.
  - `guard until <timestamp>` accepts ISO-8601 or `YYYY-MM-DD HH:MM:SS` local/explicit timestamps; reject past or unparseable timestamps with a clear error.
  - `guard clear` removes the active deadline; `guard` / `guard status` shows current guardrail status.
  - Never persist `guardUntilMs` to `pi-auto-resume.json`; check expiration both at `failed()` and `take()` (and cancel pending waits immediately if expired during `tick()`).
- **Sentinel file (`stopFile`):**
  - When `stopFile` is configured (non-empty trimmed path), check existence via `fs/promises.access` / `stat` before dispatching a due recovery (and optionally before scheduling).
  - If present, cancel recovery without calling `sendUserMessage()`, set status to `stopped by sentinel file`, and notify UI when available.
  - Never spawn shell commands or child processes.

## Dependencies and Coordination

- **Blocked by:** T0001 (`maxWaitMs` evaluates the final scheduled wait time after backoff and extended reset-header parsing).
- **Blocks:** T0005 (diagnostics surface guardrail and sentinel state), T0006 (integrated verification).
- **Coordination risks:** Shares the pre-dispatch async helper in `index.ts` with T0003 (`resumePromptFile`) and shared config/command files with T0001–T0003. Ensure `stopFile` check runs before sending the user message and respects generation/cancellation guards.

## Acceptance

- [ ] With `maxWaitMs: 0` (default), long quota resets still schedule normally; with `maxWaitMs > 0`, any computed wait exceeding `maxWaitMs` is rejected with an explicit status.
- [ ] `maxTotalAttempts > 0` stops further automatic recoveries after N total session recoveries even if successful turns or user prompts occurred in between; `0` preserves unlimited session total.
- [ ] `/auto-resume guard duration <spec>`, `/auto-resume guard until <timestamp>`, `/auto-resume guard status`, and `/auto-resume guard clear` parse cleanly, provide multi-token completions, enforce expiration on scheduling/firing, and do not write to `pi-auto-resume.json`.
- [ ] Creating the configured `stopFile` cancels pending recovery without calling `sendUserMessage()` and reports sentinel cancellation in status.
- [ ] Session shutdown or replacement clears session-local guardrails and `totalAttempts`.
- [ ] `bun run --cwd packages/pi-auto-resume typecheck`, `check`, and `test` pass.

## Out of Scope

- External shell command stop hooks (`--stop-hook`) or persistent background monitor processes.
- Idle-task loop limits (normal task completion still never triggers continuation).
