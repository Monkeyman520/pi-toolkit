# Transient server classification, backoff, and reset-header parsing

**Ticket ID:** T0001
**Source:** [Spec 0011](../../spec/0011-pi-auto-resume-enhancements.md) (R1, R7)
**Status:** Done

## Goal

Expand `pi-auto-resume` failure recovery to recognize transient upstream server errors (`server` category) and stream aborts (`network`), apply configurable exponential backoff with jitter when no longer provider retry hint applies, and parse additional rate-limit reset headers including relative duration formats.

## Affected Surfaces

- `packages/pi-auto-resume/extensions/recovery.ts` — `Cause`, `Settings`, `defaults`, `classify()`, `resetTime()`, and `Recovery.failed()` scheduling logic.
- `packages/pi-auto-resume/extensions/config.ts` — Optional `server`, `retryBackoffFactor`, and `maxRetryDelayMs` schema fields, validation bounds, and `configOptions` presets.
- `packages/pi-auto-resume/extensions/commands.ts` — Support new config keys in `/auto-resume config` and `getArgumentCompletions`.
- `packages/pi-auto-resume/extensions/ui.ts` — Expose `server`, `retryBackoffFactor`, and `maxRetryDelayMs` in the TUI `SettingsList` panel.
- `packages/pi-auto-resume/tests/recovery.test.ts` and `packages/pi-auto-resume/tests/config-candidates.test.ts`.

## Approach

- Extend `Cause` to `"network" | "server" | "throttle" | "quota"`.
- In `classify(error, status)`:
  - Keep built-in exclusions first (`context-full`, `max_tokens`/output length, `401`/`403`, invalid key/token, unauthorized, forbidden).
  - Match `quota` before generic `429` throttling.
  - Expand `network` to include common socket/stream aborts (`ECONNABORTED`, `premature close`, `UND_ERR_*`, abrupt stream termination).
  - Match `server` for HTTP `500`, `502`, `503`, `504`, `529` and transient server error phrases (`overloaded_error`, `overloaded`, `service unavailable`, `bad gateway`, `gateway timeout`, `internal server error`).
- In `resetTime(headers, error, now)`:
  - Add `x-ratelimit-reset-requests` and `x-ratelimit-reset-tokens`.
  - Add a duration parser handling `ms`, `s`, `m`, `h` tokens (e.g., `500ms`, `20s`, `1m30s`, `2h5m10s`) relative to `now`, alongside existing epoch/ISO/Retry-After formats.
- In `Recovery.failed()`:
  - Compute non-quota base delay as `min(maxRetryDelayMs, retryDelayMs * retryBackoffFactor ** attempts)` (using consecutive attempt count before increment), plus bounded jitter when `retryBackoffFactor > 1`. Inject an optional deterministic random source into `Recovery` so unit tests remain deterministic.
  - When `retryBackoffFactor === 1`, preserve exact `retryDelayMs` timing without jitter so existing fixed-delay callers and tests remain predictable.
  - Ensure `at >= reset` whenever concrete `resetTime` is present.

## Dependencies and Coordination

- **Blocked by:** none.
- **Blocks:** T0002 (custom rules reference expanded `Cause`), T0004 (`maxWaitMs` evaluates scheduled wait times), T0006 (integrated verification).
- **Coordination risks:** Touches shared schema and completion key order in `config.ts`, `ui.ts`, and `config-candidates.test.ts`; keep key ordering explicit and tested.

## Acceptance

- [ ] HTTP `500/502/503/504/529` and `overloaded_error` / `service unavailable` / `bad gateway` classify as `"server"` and respect `server: false` to disable recovery.
- [ ] Stream/socket abort errors (`ECONNABORTED`, `premature close`, `UND_ERR_SOCKET`) classify as `"network"`.
- [ ] Built-in exclusions (`401`/`403`, invalid API key, context window exceeded, max_tokens) still return `undefined` even if accompanied by HTTP 5xx/429.
- [ ] `resetTime()` parses `x-ratelimit-reset-requests` / `x-ratelimit-reset-tokens` with duration values (`500ms`, `20s`, `1m30s`) and still returns `undefined` when no concrete reset evidence exists.
- [ ] Consecutive non-quota failures back off according to `retryBackoffFactor`, cap at `maxRetryDelayMs`, respect `Retry-After` as a lower bound, and keep exact `retryDelayMs` when `retryBackoffFactor === 1`.
- [ ] New scalar config keys validate through TypeBox, persist via `/auto-resume config`, complete in `getArgumentCompletions`, and render/save in the TUI `SettingsList`.
- [ ] Existing V1 `pi-auto-resume.json` files without the new keys continue to load cleanly.
- [ ] `bun run --cwd packages/pi-auto-resume typecheck`, `check`, and `test` pass.

## Out of Scope

- Custom user-supplied regex patterns (T0002).
- `maxWaitMs` wait-cap enforcement (T0004).
- Live countdown formatting (T0005).
