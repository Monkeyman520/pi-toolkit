# Live countdown status bar and session diagnostics

**Ticket ID:** T0005
**Source:** [Spec 0011](../../spec/0011-pi-auto-resume-enhancements.md) (R6, R7)
**Status:** Done

## Goal

Improve runtime observability by showing a live 1-second remaining countdown in the status indicator while waiting to resume, enriching `/auto-resume status` and the TUI panel header with recent failure diagnostics and guardrail state, and emitting an optional concise notification when an automatic continuation fires.

## Affected Surfaces

- `packages/pi-auto-resume/extensions/recovery.ts` — Add dynamic status formatting (`formatStatus(now)` with 1-second countdown and attempt progress) and a structured diagnostic snapshot (`lastCause`, truncated `lastError`, `attempts`, `totalAttempts`, `pendingAt`, `guardUntilMs`).
- `packages/pi-auto-resume/extensions/config.ts` — Add optional `notifyOnResume` boolean (default `true`) to schema, options, completions, and TUI panel.
- `packages/pi-auto-resume/extensions/index.ts` — Refresh rendered status from `formatStatus(now)` inside `tick()` only when the text changes (deduplicated via `lastRenderedStatus`), enrich `/auto-resume status` output, and emit info notification on dispatch when `notifyOnResume` is enabled.
- `packages/pi-auto-resume/extensions/ui.ts` — Render diagnostic summary lines (countdown/status, session totals, last interruption summary, active guardrail/sentinel) in the TUI settings panel header and expose `notifyOnResume` in `SettingsList`.
- `packages/pi-auto-resume/tests/recovery.test.ts`, `tests/lifecycle.test.ts`, and `tests/config-candidates.test.ts`.

## Approach

- Format pending wait status cleanly using human-readable remaining durations (e.g., `12s`, `2m 15s`, `1h 05m`) alongside next attempt progress (e.g., `throttle: retrying in 12s (1/5)`), rounding up to whole seconds so the 250ms `tick()` loop only triggers `ctx.ui.setStatus()` once per second when the string changes.
- Record single-line, whitespace-collapsed, length-bounded (e.g., max 120 chars) `lastError` and `lastCause` whenever a failure is evaluated (both scheduled and skipped/excluded) so `/auto-resume status` explains why a failure did or did not trigger recovery.
- Keep `recovery.status` backward-compatible or synchronized with `formatStatus(Date.now())` so existing tests and plugin discovery `getSummary()` stay clear and accurate.
- When `pi.sendUserMessage()` succeeds for an automatic recovery and `settings.notifyOnResume` is `true` and `ctx.hasUI` is true, call `ctx.ui.notify(...)` with a concise message naming the cause and attempt count.

## Dependencies and Coordination

- **Blocked by:** T0004 (diagnostics display `totalAttempts` / `maxTotalAttempts`, active session `guardUntilMs`, and `stopFile` sentinel state).
- **Blocks:** T0006 (documentation and integrated verification).
- **Coordination risks:** Shared edits to `recovery.ts`, `index.ts`, `ui.ts`, and `config-candidates.test.ts`; verify existing TUI panel rendering tests in `recovery.test.ts` continue to pass and assert updated status lines.

## Acceptance

- [ ] While waiting to resume, `ctx.ui.setStatus()` displays a human-readable remaining countdown and attempt progress, updating at 1-second boundaries without redundant calls on unchanged 250ms ticks.
- [ ] `/auto-resume status` reports current status, consecutive and cumulative session attempt counts, last interruption cause and truncated error summary (when recorded), active session time guardrail (when set), and configured `stopFile` (when set).
- [ ] The TUI settings panel header displays the enriched diagnostic status cleanly within narrow terminal widths (`truncateToWidth`).
- [ ] Dispatching a recovery emits a concise info notification when `notifyOnResume: true` and suppresses it when `notifyOnResume: false`.
- [ ] `bun run --cwd packages/pi-auto-resume typecheck`, `check`, and `test` pass.

## Out of Scope

- Persistent cross-session recovery history files or external telemetry/logging sinks.
