# Configurable recovery prompt and dynamic prompt file

**Ticket ID:** T0003
**Source:** [Spec 0011](../../spec/0011-pi-auto-resume-enhancements.md) (R2, R7)
**Status:** Done

## Goal

Replace the hardcoded continuation message with a configurable `resumePrompt` template supporting `{cause}`, `{attempt}`, and `{maxAttempts}` placeholders, plus an optional `resumePromptFile` dynamically re-read before each recovery dispatch with safe fail-closed error handling.

## Affected Surfaces

- `packages/pi-auto-resume/extensions/config.ts` — Add optional `resumePrompt` and `resumePromptFile` string fields to TypeBox schema, validation bounds, and `setOption` / `configOptions` support.
- `packages/pi-auto-resume/extensions/recovery.ts` — Return structured trigger metadata (cause, attempt, maxAttempts) from `take()` (or reservation helper) and provide safe placeholder formatting.
- `packages/pi-auto-resume/extensions/index.ts` — Resolve prompt text (including async `resumePromptFile` read with generation, cancellation, and idle re-checks) before calling `pi.sendUserMessage()`.
- `packages/pi-auto-resume/extensions/commands.ts` and `extensions/ui.ts` — Support viewing/setting `resumePrompt` and `resumePromptFile` via `/auto-resume config` and displaying active prompt source in status/TUI.
- `packages/pi-auto-resume/tests/recovery.test.ts`, `tests/lifecycle.test.ts`, and `tests/config-candidates.test.ts`.

## Approach

- Keep default continuation text identical to V1 (`"Continue the interrupted task from where it stopped."`) when neither `resumePrompt` nor `resumePromptFile` is configured.
- Implement single-pass placeholder replacement for `{cause}`, `{attempt}`, and `{maxAttempts}` (avoiding recursive replacement if substituted values ever contain braces).
- When `resumePromptFile` is non-empty:
  - Read the UTF-8 file dynamically before each dispatch (enforcing a reasonable byte limit, e.g., <= 1 MiB, and normalizing `\r\n` and `\r` to `\n`, then trimming outer whitespace).
  - Guard the async dispatch flow against overlapping ticks (`dispatching` lock), session generation changes (`revision !== generation`), cancellation during read, and `ctx.isIdle() && !ctx.hasPendingMessages()` re-verification before calling `pi.sendUserMessage()`.
  - If the file is missing, unreadable, oversized, or empty after trimming, cancel the recovery cleanly, set an explicit diagnostic status, notify UI when available, and do not send a message.
- Allow clearing `resumePrompt` / `resumePromptFile` cleanly via config (e.g., empty string or editing JSON).

## Dependencies and Coordination

- **Blocked by:** none.
- **Blocks:** T0006 (documentation and integrated verification).
- **Coordination risks:** Shares pre-dispatch async boundary in `index.ts` with T0004 (`stopFile` sentinel); structure the pre-dispatch helper cleanly so sentinel checks and prompt loading run in one guarded async path without race conditions. Also shares `config.ts` / `config-candidates.test.ts` with T0001/T0004.

## Acceptance

- [ ] With default config, continuation still sends `"Continue the interrupted task from where it stopped."`.
- [ ] Configured `resumePrompt` substitutes `{cause}`, `{attempt}`, and `{maxAttempts}` accurately for each recovery dispatch.
- [ ] Configured `resumePromptFile` is re-read on every recovery attempt (runtime edits take effect on the next attempt without restarting Pi) with CRLF/CR normalization and whitespace trimming.
- [ ] Missing, unreadable, or empty `resumePromptFile` cancels the pending recovery, sets a clear diagnostic status, and sends no user message.
- [ ] If session shutdown, cancellation, or new user input occurs while `resumePromptFile` is being read asynchronously, no message is dispatched after the read completes.
- [ ] `bun run --cwd packages/pi-auto-resume typecheck`, `check`, and `test` pass.

## Out of Scope

- Per-cause prompt override maps.
- Shell command prompt pipes (`-rpp` / external command execution).
