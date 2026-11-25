# Package scaffold, config store, and continuation/queue state machine

**Ticket ID:** T0001
**Source:** [Spec 0012](../../spec/0012-pi-auto-continue.md) (C1, C2, C3, C6)
**Status:** Todo

## Goal

Create the independent `packages/pi-auto-continue/` package following repository workspace/build conventions (`"private": true`, Rolldown bundling with inlined `pi-plugin-support`, external host peers), implement fail-closed global configuration (`pi-auto-continue.json`), and build the pure `ContinueController` state machine supporting explicit session arming, a disarm-preserving FIFO continuation queue, and concrete quota-reset timing.

## Affected Surfaces

- `packages/pi-auto-continue/package.json`, `tsconfig.json`, `rolldown.config.mjs`, `.gitignore` — Standalone workspace package configuration (modeled on `packages/pi-auto-resume/`).
- `packages/pi-auto-continue/extensions/loop.ts` — `Settings`, `SessionOverrides`, `QueueItem`, `defaults`, `parseQuotaResetTimeMs()`, `ContinueController` (arm/disarm preserving queue, FIFO queue operations `enqueue`/`prepend`/`remove`/`move`/`clear`/`restoreAt`, `queueEmptyPolicy`, `onError: "defer" | "wait-quota" | "stop"`, `quotaWait` / `quotaDelayMs`, `maxRounds`, `duration`/`until` deadlines, human-input wait reset, 1-second countdown formatting, diagnostics).
- `packages/pi-auto-continue/extensions/config.ts` — `AutoContinueConfigManager` backed by `pi-plugin-support/config` (`JsonConfigStore`) and TypeBox schema (`additionalProperties: false`).
- `packages/pi-auto-continue/extensions/index.ts` — Minimal entry point exporting the extension factory (expanded in T0003/T0004).
- `packages/pi-auto-continue/tests/loop.test.ts` — Deterministic unit tests for arming, FIFO queue operations, `queueEmptyPolicy`, `onError` modes, quota-reset parsing/waiting, deadlines, and config validation.

## Approach

- Mirror `packages/pi-auto-resume/` build setup (`tsconfig.base.json`, Rolldown bundling `extensions/index.ts` → `dist/index.js`, copying root `LICENSE` and `CHANGELOG.md` into `dist/`), keeping `"private": true` without modifying `scripts/release.ts`.
- Define complete typed `Settings` in `loop.ts` / `config.ts`:
  - `delayMs` (default `15000`, `100..86400000`), `maxRounds` (default `10`, `0..1000`), `onError` (`"defer" | "wait-quota" | "stop"`, default `"defer"`), `queueEmptyPolicy` (`"stop" | "continue"`, default `"stop"`), `expandPromptTemplates` (default `true`), `quotaWait` (default `true`), `quotaDelayMs` (default `30000`, `0..86400000`), `prompt` (default `"Continue to the next step."`), `promptFile` (`""`), `promptPipe` (`""`), `pipeFormatPrefix` (`""`), `pipeFormatSuffix` (`""`), `pipeRequireFormat` (`false`), `pipeTimeoutMs` (default `30000`, `1000..600000`), `stopFile` (`""`), `stopCommand` (`""`), `stopCommandTimeoutMs` (default `15000`, `1000..600000`), `notifyOnContinue` (`true`).
- In `ContinueController`:
  - Initialize `armed = false` (`status = "disarmed"`). Global config updates never auto-arm a disarmed session.
  - Maintain session-local FIFO `queue: QueueItem[]` (`{ id, text, createdAt }`) with `enqueue`, `prepend`, `removeAt` (1-based), `move` (1-based), `clear`, `peekHead`, `takeAt` (for immediate `send`/`steer`), and `restoreAt` (for rollback if `sendUserMessage` fails).
  - Track `quotaResetAt: number | undefined` and `quotaUnavailable: boolean` from provider response headers/errors (`Retry-After`, `anthropic-ratelimit-unified-5h/7d-reset`, `x-ratelimit-reset`, `x-ratelimit-reset-requests/tokens` including duration strings, structured `resets_at`/`reset_at`/`resetTime`/`resetsAt`). Clear quota state on normal assistant completion (`stopReason !== "error"`).
  - On `arm(overrides, now, idle)`: arm session; track `queueDrainMode = this.queue.length > 0`. If `idle && this.queue.length > 0`, immediately schedule head queued item at `Math.max(now + delayMs, quotaFloor)` (or pause with `"quota: reset time unavailable"` if `quotaWait && quotaUnavailable`).
  - On `settleTurn(aborted, now)`:
    - If `!armed`, record any quota reset info (for subsequent idle `arm`) and do not schedule.
    - If `aborted` or last assistant `stopReason === "aborted"`, `disarm("disarmed (aborted)")` (preserving queue).
    - If last assistant `stopReason === "error"`:
      - `"stop"` → `disarm("stopped on error")` (preserving queue).
      - `"wait-quota"` → if quota/rate-limit error with concrete reset time and `quotaWait` and `queue.length > 0`, schedule next queue dispatch at `resetTime + quotaDelayMs`; if quota error without concrete reset time, set status `"quota: reset time unavailable"` without guessing; otherwise defer.
      - `"defer"` → do not schedule; stay armed (`"armed (deferred error)"`) preserving queue.
    - Otherwise (normal completion):
      - If `queue.length === 0 && queueDrainMode && effective.queueEmptyPolicy === "stop"`, disarm cleanly with `"queue completed"`.
      - Otherwise check `maxRounds` and `deadlineMs`; if eligible, schedule `pending = { at: Math.max(now + delayMs, quotaFloor), nextRound: rounds + 1, source: queue.length > 0 ? "queue" : "loop" }`.
  - On `disarm(reason)`: clear `pending`, `armed = false`, `sessionOverrides = {}`, `deadlineMs = undefined`, record `lastStopReason`, **keep `queue` intact**.
  - On `resetSession()`: clears everything including `queue`.

## Dependencies and Coordination

- **Blocked by:** none.
- **Blocks:** T0002, T0003, T0004, T0005, T0006.
- **Coordination risks:** Adding a new workspace package requires verifying workspace resolution and confirming root `bun run check`, `typecheck`, `build`, and `test` include `packages/pi-auto-continue/`.

## Acceptance

- [ ] `packages/pi-auto-continue/` builds standalone `dist/index.js`, `dist/LICENSE`, and `dist/CHANGELOG.md` via Rolldown with `pi-plugin-support` inlined and host SDKs/TypeBox external.
- [ ] `ContinueController` starts disarmed and never schedules continuation on normal completion until explicitly armed.
- [ ] FIFO queue operations (`enqueue`, `prepend`, `removeAt`, `move`, `clear`, `takeAt`, `restoreAt`) work accurately; `disarm()` preserves queued items while `clear()` / `resetSession()` empties them.
- [ ] `queueEmptyPolicy: "stop"` disarms with `"queue completed"` once queued items finish; `"continue"` falls through to loop prompts.
- [ ] Quota-reset parsing handles `Retry-After`, Anthropic unified headers, `x-ratelimit-reset*` (including duration strings), and structured `resets_at` fields, applying `quotaResetAt + quotaDelayMs` when `quotaWait: true` and never fabricating missing reset times.
- [ ] `onError: "defer"`, `"wait-quota"`, and `"stop"` each follow their exact contract.
- [ ] Invalid or unknown fields in `pi-auto-continue.json` fail closed via `JsonConfigStore`.
- [ ] `bun run --cwd packages/pi-auto-continue typecheck`, `check`, `build`, and `test` pass.

## Out of Scope

- External subprocess execution (`promptPipe`, `stopCommand`) — T0002/T0003.
- Slash command parser and TUI panel — T0004.
- Modifying `scripts/release.ts` or public npm catalog.
