# Pi Auto Resume Enhancements (Resilience, Customization, Guardrails, and Observability)

**Spec ID:** 0011
**Status:** Implemented
**Date:** 2026-11-25
**Sources:**
- Conversation comparison between `packages/pi-auto-resume/` and `AutoContinue` (`ac`), and user request to land the recommended P0/P1 enhancements in `pi-auto-resume` while preserving interrupted-task-only recovery boundaries.
- Settled user decisions during refinement:
  - **U1 (Pre-recovery stop check):** Support a local sentinel file (`stopFile`) plus built-in time/attempt guardrails only; **do not execute external shell commands**.
  - **U2 (Resume prompt customization):** Support a global `resumePrompt` string with `{cause}`, `{attempt}`, and `{maxAttempts}` placeholders plus an optional `resumePromptFile` dynamically re-read on each recovery attempt.
  - **U3 (Max wait cap default):** Default `maxWaitMs` to `0` (unlimited / disabled) so existing subscription quota-reset waits remain unchanged unless explicitly configured.
  - **U4 (Artifact route):** Author an additive follow-up spec (`0011`) keeping [Spec 0002](./0002-pi-auto-resume.md) intact as the V1 contract, and decompose into an executable ticket set.
- Project contracts: [CONTEXT.md](../CONTEXT.md), [Spec 0002](./0002-pi-auto-resume.md), [ADR 0001](../adr/0001-independently-installable-pi-packages.md), [ADR 0004](../adr/0004-unified-command-grammar-and-dynamic-tui-configuration.md), [ADR 0005](../adr/0005-versioned-plugin-support-library.md), [ADR 0008](../adr/0008-bun-workspace-rolldown-and-bun-test-stack.md), and [packages/README.md](../../packages/README.md).

## Requirements

### R1. Transient server failures, stream aborts, retry backoff, and reset-header parsing

- Add an independently configurable `server` recovery category (boolean, default `true`) covering transient upstream server failures: HTTP `500`, `502`, `503`, `504`, `529`, and matching provider messages such as `overloaded_error`, `service unavailable`, `bad gateway`, `gateway timeout`, and `internal server error`.
- Expand `network` failure detection to cover common stream and socket abort failures (such as `ECONNABORTED`, `premature close`, `UND_ERR_*`, and abrupt stream termination) in addition to existing connection/timeout patterns.
- Preserve [Spec 0002](./0002-pi-auto-resume.md) negative boundaries unconditionally: context-full errors, output-length/`max_tokens` limits, and authentication/permission errors (`401`/`403`, invalid key/token, unauthorized, forbidden) must never be classified as recoverable, regardless of HTTP status or custom rules.
- Support configurable exponential backoff with jitter for non-quota retries (`network`, `server`, `throttle`) via `retryBackoffFactor` and `maxRetryDelayMs`. Setting `retryBackoffFactor` to `1` preserves fixed `retryDelayMs` timing. When a provider supplies a concrete retry/reset hint (`Retry-After` or reset header), recovery must never fire earlier than that hint.
- Extend `resetTime()` to parse additional standard rate-limit reset headers (`x-ratelimit-reset-requests`, `x-ratelimit-reset-tokens`) and relative duration strings (such as `500ms`, `20s`, `1m30s`, `2h5m`). Never fabricate a reset timestamp when no concrete service evidence exists.

### R2. Configurable recovery prompt and dynamic prompt file

- Replace the hardcoded continuation message in `extensions/index.ts` with configurable `resumePrompt` (optional string, defaulting to `"Continue the interrupted task from where it stopped."`).
- Support safe literal placeholder substitution in the resolved prompt text for `{cause}`, `{attempt}`, and `{maxAttempts}`.
- Support optional `resumePromptFile` (optional UTF-8 local file path) dynamically re-read before each automatic continuation is dispatched, normalizing `\r\n` and `\r` line endings to `\n` and trimming outer whitespace.
- Resolution precedence: when `resumePromptFile` is configured (non-empty path), read it dynamically; otherwise use `resumePrompt` (falling back to the built-in default).
- If `resumePromptFile` is configured but missing, unreadable, oversized, or empty at dispatch time, fail safely without crashing: cancel the pending recovery, surface a clear diagnostic status/notification, and do not silently substitute an unexpected prompt.

### R3. Time, wait-cap, and cumulative attempt guardrails

- Add `maxWaitMs` (optional integer, default `0` meaning disabled/unlimited). When a pending recovery's computed wait (`at - now`) exceeds a positive `maxWaitMs`, do not schedule the wait; record an explicit status indicating the wait exceeded `maxWaitMs`.
- Add `maxTotalAttempts` (optional integer, default `0` meaning disabled/unlimited) to bound cumulative automatic recoveries across the entire Pi session. Unlike `maxAttempts` (which resets after human input or a successful assistant response), `maxTotalAttempts` does not reset during the session until the session is replaced or restarted.
- Add session-scoped time guardrails managed through unified `/auto-resume` commands (not persisted to global `pi-auto-resume.json`):
  - A maximum remaining active duration from the command invocation (e.g., `/auto-resume guard duration <spec>`).
  - An absolute cutoff timestamp (e.g., `/auto-resume guard until <timestamp>`).
  - Inspection and clearing of active session guardrails (e.g., `/auto-resume guard status` / `/auto-resume guard clear`).
- When a session time guardrail has expired (at failure settlement or when a pending recovery becomes due), cancel/skip automatic continuation and set an explicit status.

### R4. File-sentinel pre-recovery stop check

- Add optional `stopFile` (optional local file path, empty/omitted by default) to `pi-auto-resume.json`.
- Before scheduling or dispatching an automatic recovery continuation, check whether `stopFile` exists on disk.
- If `stopFile` exists, cancel the pending recovery without sending a user message and set an explicit status identifying the sentinel stop.
- Execute **no** external shell commands, scripts, or child processes; `pi-auto-resume` retains its local-file-only permission profile.

### R5. Custom error match and exclusion patterns

- Add optional `customExcludePatterns` (array of pattern strings) and `customMatchPatterns` (array of `{ pattern, cause }` entries targeting `network`, `server`, `throttle`, or `quota`) to `pi-auto-resume.json`.
- Enforce strict evaluation precedence:
  1. Built-in exclusions and `customExcludePatterns` always reject recovery first.
  2. Built-in classifiers and `customMatchPatterns` determine the cause.
  3. Category toggles (`network`, `server`, `throttle`, `quota`) and quota concrete-reset-time evidence requirements still govern eligibility.
- Validate pattern syntax and bounded array/pattern lengths during configuration loading (case-insensitive JS `RegExp` compilation). Invalid patterns fail configuration validation closed via `JsonConfigStore` with an explicit error message rather than throwing during turn settlement.

### R6. Live countdown status bar and session diagnostics

- While a recovery wait is pending, update the Pi status indicator at 1-second granularity with a human-readable remaining countdown and attempt progress (for example, `throttle: retrying in 12s (1/5)`), avoiding unnecessary `ctx.ui.setStatus()` calls when the formatted status string has not changed.
- Enrich `/auto-resume status` and the interactive TUI settings panel header with:
  - Cumulative session recovery count (`totalAttempts` and `maxTotalAttempts` if set).
  - Last observed interruption cause and a truncated, single-line error summary (when present).
  - Active session time guardrail (`until` / remaining duration) and configured `stopFile` state when set.
- Emit a concise info notification when an automatic continuation is dispatched (configurable via optional `notifyOnResume` boolean, default `true`), while remaining safe in non-UI/RPC modes.

### R7. Backward compatibility, unified command/TUI contract, and standalone verification

- Existing valid `pi-auto-resume.json` files must continue to load without migration; all newly introduced fields are optional with backward-compatible defaults, while `additionalProperties: false` and fail-closed invalid-config handling remain intact.
- Expose new scalar configuration options through `/auto-resume config`, multi-token `getArgumentCompletions`, and the interactive `SettingsList` panel per [ADR 0004](../adr/0004-unified-command-grammar-and-dynamic-tui-configuration.md), without introducing uninstalled plugins or sibling imports ([ADR 0001](../adr/0001-independently-installable-pi-packages.md), [ADR 0005](../adr/0005-versioned-plugin-support-library.md)). Structured array fields (`customExcludePatterns`, `customMatchPatterns`) and free-text/path fields may be edited directly in `pi-auto-resume.json` (with hot reload) and viewed/set via `/auto-resume config` where practical.
- Preserve every [Spec 0002](./0002-pi-auto-resume.md) safety invariant: normal completion, explicit user stop (`stop`, Escape, Ctrl+C), session replacement/shutdown, model selection, and session tree navigation never trigger or resurrect old work; asynchronous file/sentinel reads before dispatch must re-check session generation and idle/cancellation state before calling `pi.sendUserMessage()`.
- Update `packages/pi-auto-resume/README.md` to document new categories, backoff, prompt/file options, guardrails, sentinel file, custom patterns, and permissions.
- Verify with root/package `check`, `typecheck`, `build`, `test`, and isolated real-Pi RPC `smoke` per [ADR 0008](../adr/0008-bun-workspace-rolldown-and-bun-test-stack.md).

## Solution

Extend `packages/pi-auto-resume/` in place while keeping `Recovery` pure and deterministic for core state transitions and keeping filesystem I/O (`resumePromptFile`, `stopFile`, `pi-auto-resume.json`) isolated to async boundary helpers invoked by `extensions/index.ts`.

### Seams

| Seam | Connects | Expects | Provides |
| --- | --- | --- | --- |
| Classification & reset parser | `extensions/recovery.ts` (provider response + assistant error → decision) | Error text, HTTP status, response headers, compiled custom exclude/match rules, current timestamp | `Cause` (`network \| server \| throttle \| quota`) or exclusion, plus concrete `resetTime` (epoch ms or duration-derived ms) |
| Recovery state machine & backoff | `extensions/recovery.ts` (settled turn + tick → due trigger) | Settings (`server`, backoff, `maxWaitMs`, `maxTotalAttempts`), session time guardrail deadline, deterministic RNG/jitter hook for tests, `now`, `idle` | Pending schedule (`at`, `cause`, `attempt`), formatted 1-second countdown status, diagnostic snapshot, single-fire reservation |
| Pre-dispatch async boundary | `extensions/index.ts` → filesystem + Pi `sendUserMessage` | Reserved recovery trigger, current `generation`, `stopFile` path, `resumePromptFile` / `resumePrompt`, `ctx.isIdle() && !ctx.hasPendingMessages()` | Verified sentinel absence and resolved prompt text before dispatch; clean cancellation without sending if generation/idle/sentinel/file check fails |
| Config schema & hot reload | `extensions/config.ts` → `pi-plugin-support/config` (`JsonConfigStore`) | `pi-auto-resume.json` (<= 1 MiB), TypeBox schema with `additionalProperties: false`, regex syntax validation | Validated `Settings` + compiled custom pattern rules, or fail-closed disabled state with diagnostic error |
| Unified command & TUI surface | `extensions/commands.ts`, `extensions/ui.ts` → Pi host command/TUI APIs | `/auto-resume` args, `getArgumentCompletions` prefix, `SettingsList` interactions | Subcommand parsing (`status`, `on`, `off`, `stop`, `guard`, `config`, `help`), full-prefix multi-token completions, live status/diagnostics header, and persisted scalar updates |

## End-to-End Tests

### Transient server failure with exponential backoff
- **Given:** `server: true`, `retryDelayMs: 1000`, `retryBackoffFactor: 2`, `maxRetryDelayMs: 5000`, `maxAttempts: 3`.
- **When:** Consecutive turns fail with HTTP `529` / `overloaded_error` and no `Retry-After` header.
- **Then:** First retry schedules around `1000ms`, second around `2000ms`, third around `4000ms` (within configured jitter bounds, capped at `5000ms`), and never fires before due time.

### OpenAI-style duration reset header respected
- **Given:** `throttle: true`, `retryDelayMs: 1000`.
- **When:** A turn fails with HTTP `429` and header `x-ratelimit-reset-requests: 1m30s`.
- **Then:** Recovery schedules no earlier than `now + 90000ms` and displays a live countdown in status.

### Exclusion precedence over custom match rules
- **Given:** `customMatchPatterns` includes a pattern matching `"token"` mapped to `network`, and `customExcludePatterns` includes `"maintenance_halt"`.
- **When:** One turn fails with `"invalid api token"` (built-in exclusion) and another fails with `"fetch failed: maintenance_halt"` (custom exclusion).
- **Then:** Neither turn schedules recovery; both report `not eligible`.

### Custom resume prompt and dynamic file loading
- **Given:** `resumePromptFile` points to a local file containing `"Resume ({cause} #{attempt}/{maxAttempts})"`.
- **When:** An eligible network error occurs, the file content is updated before the retry fires, and the wait elapses while Pi is idle.
- **Then:** Pi receives the updated file content with `{cause}`, `{attempt}`, and `{maxAttempts}` substituted. If the file is deleted or empty before dispatch, recovery cancels with a diagnostic status and sends no message.

### Wait-cap, cumulative attempt limit, and session time guardrail
- **Given:** `maxWaitMs: 60000`, `maxTotalAttempts: 2`, or `/auto-resume guard duration 5m`.
- **When:** (a) A quota error reports a reset 2 hours away; (b) Two recoveries succeed across separate prompts and a third interruption occurs; or (c) The 5-minute session guardrail elapses.
- **Then:** In each case, recovery is not dispatched and status clearly identifies the active guardrail reason (`wait exceeds maxWaitMs`, `session attempt limit reached`, or `guardrail expired`).

### Stop-file sentinel cancels pending recovery
- **Given:** `stopFile` is configured to a local file path and a network recovery is pending.
- **When:** The sentinel file is created on disk before the recovery fires.
- **Then:** At dispatch check, pending recovery is cancelled without calling `sendUserMessage()`, and status reports cancellation by the sentinel file.

### Isolated real Pi RPC smoke verification
- **Given:** A freshly packed `@monkeyman520/pi-auto-resume` tarball installed into a clean temporary consumer directory outside the workspace.
- **When:** Loaded into real `pi --mode rpc` with a synthetic provider fixture exercising existing V1 flows plus enhanced features (e.g., 5xx server recovery, custom prompt template/file, stop-file sentinel cancellation, and backward-compatible config persistence).
- **Then:** All assertions pass cleanly with zero load errors, zero continuation after normal completion, and clean process shutdown.

## Decisions

- **Choice:** Restrict pre-recovery external stopping to a local sentinel file (`stopFile`) plus built-in guardrails; exclude shell command execution.
  - **Reason/source:** User decision **U1**. Preserves `pi-auto-resume`'s local-file-only permission boundary and avoids project-trust / child-process lifecycle risk.
- **Choice:** Support global `resumePrompt` (with `{cause}`, `{attempt}`, `{maxAttempts}`) plus dynamic `resumePromptFile`, without per-cause prompt maps or shell prompt pipes.
  - **Reason/source:** User decision **U2**. Captures `AutoContinue`'s practical runtime-editable prompt capability (`-rpio`) while keeping schema and TUI manageable.
- **Choice:** Default `maxWaitMs` to `0` (disabled/unlimited).
  - **Reason/source:** User decision **U3**. Avoids breaking users who rely on unattended waits across 5-hour or longer subscription quota resets.
- **Choice:** Author an additive follow-up spec (`0011`) and ticket set rather than mutating [Spec 0002](./0002-pi-auto-resume.md).
  - **Reason/source:** User decision **U4**, consistent with prior follow-up specs (`0005`, `0006`, `0008`).
- **Choice (Explicit Assumptions — reversible defaults):**
  - `server` defaults to `true`; `retryBackoffFactor` defaults to `2` (range `1`–`10`, integer or finite number; jitter ±10% or 0–10% capped at `maxRetryDelayMs`, with `retryBackoffFactor: 1` disabling backoff and jitter for exact fixed-delay compatibility in deterministic tests); `maxRetryDelayMs` defaults to `300000` (5 minutes); `maxTotalAttempts` defaults to `0` (unlimited); `notifyOnResume` defaults to `true`.
  - Session time guardrails (`/auto-resume guard ...`) are session-local and never persisted to `pi-auto-resume.json` so expired deadlines do not leak into future sessions.
  - Unreadable/empty explicit `resumePromptFile` cancels the pending recovery with a diagnostic rather than silently falling back, matching the plugin's fail-closed safety model.
  - No `CONTEXT.md` or ADR changes are required because all work remains package-local under existing [ADR 0001](../adr/0001-independently-installable-pi-packages.md), [ADR 0004](../adr/0004-unified-command-grammar-and-dynamic-tui-configuration.md), [ADR 0005](../adr/0005-versioned-plugin-support-library.md), and [ADR 0008](../adr/0008-bun-workspace-rolldown-and-bun-test-stack.md) boundaries.

## Test Plan

- Deterministic unit tests (`bun test`) covering:
  - `classify()` for HTTP `500/502/503/504/529`, overload phrases, stream aborts, built-in exclusions, and custom exclude/match precedence.
  - `resetTime()` for `x-ratelimit-reset-requests`, `x-ratelimit-reset-tokens`, compound duration strings (`1h2m3s`, `500ms`), and invalid/empty headers.
  - Backoff progression, cap (`maxRetryDelayMs`), jitter determinism via injected clock/random provider, and `Retry-After` lower-bound preservation.
  - `maxWaitMs`, `maxTotalAttempts`, session `guard` (`duration`/`until`/`clear`), and `stopFile` sentinel cancellation.
  - `resumePrompt` placeholder substitution and dynamic `resumePromptFile` reload/error handling.
  - 1-second countdown status formatting and deduplication, plus enriched `/auto-resume status` and TUI panel rendering.
  - Config schema validation (valid non-presets, fail-closed invalid regexes, backward compatibility with minimal V1 JSON files) and `config-candidates.test.ts` updates.
  - Lifecycle regression tests (`tests/lifecycle.test.ts`) verifying generation guards during async `stopFile`/`resumePromptFile` reads, multi-instance isolation, and clean shutdown.
- Standalone real-Pi RPC smoke test (`bun run smoke`) verifying built `dist/index.js` outside the workspace.
- Full workspace checks: `bun run check`, `bun run typecheck`, `bun run build`, `bun run test`.

## Out of Scope

- Automatic continuation after normal task completion (`Idle` loop / `AutoContinue`-style autonomous multi-round driving). If desired later, that belongs in a separate opt-in plugin so `pi-auto-resume`'s interrupted-only safety contract remains intact.
- Shell command execution for prompt generation (`Prompt Pipe`) or external command stop hooks (`--stop-hook`).
- Per-cause prompt override maps (`resumePrompts` per cause).
- Account switching, quota polling, or subscription activation (owned by `pi-quota-keeper`).

## Future Evolution

- If users later request autonomous idle-loop driving with external Prompt Pipe / StopHook orchestration, evaluate a separate sibling plugin (e.g., `pi-auto-continue`) that composes orthogonally with `pi-auto-resume`.
- If custom error patterns prove hard to edit via raw JSON, consider adding a dedicated TUI or `/auto-resume config edit` editor shortcut modeled on `pi-prompt-pipeline`.
