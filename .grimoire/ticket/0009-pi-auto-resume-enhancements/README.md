# Pi Auto Resume Enhancements

**Source:** [Spec 0011: Pi Auto Resume Enhancements](../../spec/0011-pi-auto-resume-enhancements.md) (building on [Spec 0002](../../spec/0002-pi-auto-resume.md))
**Ticket folder:** `.grimoire/ticket/0009-pi-auto-resume-enhancements/`

## Overview

Deliver the settled P0 and P1 enhancements to `packages/pi-auto-resume/` while strictly preserving its interrupted-task-only recovery contract, local-file-only permission boundary (no shell command execution), backward compatibility with existing `pi-auto-resume.json` files, and standalone packaging under [ADR 0001](../../adr/0001-independently-installable-pi-packages.md), [ADR 0004](../../adr/0004-unified-command-grammar-and-dynamic-tui-configuration.md), [ADR 0005](../../adr/0005-versioned-plugin-support-library.md), and [ADR 0008](../../adr/0008-bun-workspace-rolldown-and-bun-test-stack.md).

## Delivery Surfaces

- `packages/pi-auto-resume/extensions/recovery.ts` — Failure classification (`server`, stream aborts, custom patterns), extended `resetTime()` duration/header parsing, exponential backoff + jitter, guardrails (`maxWaitMs`, `maxTotalAttempts`, session deadline), countdown formatting, and diagnostic snapshot.
- `packages/pi-auto-resume/extensions/config.ts` — Backward-compatible TypeBox schema additions, fail-closed regex validation for custom patterns, config option metadata/presets.
- `packages/pi-auto-resume/extensions/commands.ts` — Unified `/auto-resume` subcommands (including `guard`), config key/value parsing, and full-prefix multi-token `getArgumentCompletions`.
- `packages/pi-auto-resume/extensions/index.ts` — Async pre-dispatch boundary (`stopFile` sentinel check, dynamic `resumePromptFile` / `resumePrompt` template resolution with generation + idle guards), 1-second countdown status refresh, enriched status output, and dispatch notification.
- `packages/pi-auto-resume/extensions/ui.ts` — Updated TUI `SettingsList` items and diagnostics header.
- `packages/pi-auto-resume/tests/` — Deterministic unit tests (`recovery.test.ts`, `config-candidates.test.ts`, `lifecycle.test.ts`) and isolated real-Pi RPC smoke test (`pi-smoke.mjs`).
- `packages/pi-auto-resume/README.md` — Accurate documentation of new categories, backoff, prompt/file options, guardrails, sentinel file, custom patterns, and permissions.

## Dependencies

| Producer | Consumer | Why consumer cannot proceed first |
| --- | --- | --- |
| T0001 | T0002 | Custom match patterns target the expanded `Cause` union (including `"server"`) and plug into the updated `classify()` pipeline. |
| T0001 | T0004 | `maxWaitMs` wait-cap enforcement evaluates the final scheduled wait produced by the backoff and extended reset-header timing logic. |
| T0004 | T0005 | Enriched status and TUI diagnostics report cumulative `totalAttempts` / `maxTotalAttempts`, active session time guardrails, and `stopFile` state introduced in T0004. |
| T0001, T0002, T0003, T0004, T0005 | T0006 | Documentation and standalone Pi RPC smoke verification must reflect and test the complete integrated feature set. |

## Coordination

| Tickets | Risk | Strategy |
| --- | --- | --- |
| T0001, T0002, T0003, T0004, T0005 | Shared package files (`recovery.ts`, `config.ts`, `commands.ts`, `index.ts`, `ui.ts`, `tests/config-candidates.test.ts`) | Execute sequentially in recommended order or keep schema/key-order additions cleanly separated and reconcile `config-candidates.test.ts` on each schema addition. |
| T0003, T0004 | Shared pre-dispatch async flow in `index.ts` (`tick()` triggering `stopFile` check + `resumePromptFile` load before `sendUserMessage`) | Define one clear generation-checked async dispatch helper so sentinel checks and prompt loading cannot race with cancellation, user input, or overlapping ticks. |

## Recommended Order

1. **T0001** — Classification (`server`, stream aborts), backoff + jitter, and extended reset-header parsing (foundation for timing and `Cause`).
2. **T0002** — Custom exclude/match patterns (builds directly on T0001's classifier).
3. **T0003** — Customizable `resumePrompt` + dynamic `resumePromptFile` (can run in parallel with T0002/T0004 with shared-file coordination, or sequentially right after T0002).
4. **T0004** — Wait-cap (`maxWaitMs`), cumulative attempt limit (`maxTotalAttempts`), session time guardrails (`/auto-resume guard`), and `stopFile` sentinel.
5. **T0005** — Live 1-second countdown status bar, enriched diagnostics, and dispatch notification.
6. **T0006** — README update, extended isolated Pi RPC smoke test, and full workspace verification.

## Ticket Index

| Ticket | File | Outcome |
| --- | --- | --- |
| T0001 | [T0001-classification-backoff-and-reset-headers.md](./T0001-classification-backoff-and-reset-headers.md) | Transient `server` category, stream-abort coverage, exponential backoff + jitter, and extended reset-header duration parsing |
| T0002 | [T0002-custom-match-and-exclude-patterns.md](./T0002-custom-match-and-exclude-patterns.md) | Fail-closed `customExcludePatterns` and per-cause `customMatchPatterns` with strict exclusion precedence |
| T0003 | [T0003-custom-resume-prompt-and-file.md](./T0003-custom-resume-prompt-and-file.md) | Configurable `resumePrompt` placeholders and dynamic `resumePromptFile` loading with safe cancellation on read failure |
| T0004 | [T0004-guardrails-and-stop-file-sentinel.md](./T0004-guardrails-and-stop-file-sentinel.md) | `maxWaitMs`, `maxTotalAttempts`, session `/auto-resume guard` (`duration`/`until`/`clear`), and `stopFile` sentinel |
| T0005 | [T0005-live-countdown-and-diagnostics.md](./T0005-live-countdown-and-diagnostics.md) | 1-second live status countdown, enriched `/auto-resume status` & TUI diagnostics, and resume dispatch notification |
| T0006 | [T0006-docs-and-standalone-pi-verification.md](./T0006-docs-and-standalone-pi-verification.md) | Updated package README, extended standalone Pi RPC smoke test, and full workspace verification |
