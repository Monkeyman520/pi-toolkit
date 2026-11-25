# Pi Auto Continue

**Source:** [Spec 0012: Pi Auto Continue](../../spec/0012-pi-auto-continue.md)
**Ticket folder:** `.grimoire/ticket/0010-pi-auto-continue/`

## Overview

Build `packages/pi-auto-continue/` as an independently installable (initially `"private": true`) Pi extension for explicitly armed multi-round continuation after normal task completion, featuring a session-local FIFO continuation queue (with immediate `send`/`steer`, `expandPromptTemplates`, multiline TUI editor, file import, disarm preservation, and quota-reset waiting), multi-mode prompt sources (Direct, dynamic `promptFile`, `promptPipe` with last-match tag extraction), and composable StopHooks (`maxRounds`, `onError`, `duration`, `until`, `stopFile`, one-shot `stopCommand`), composing orthogonally with `pi-auto-resume` under [ADR 0001](../../adr/0001-independently-installable-pi-packages.md), [ADR 0004](../../adr/0004-unified-command-grammar-and-dynamic-tui-configuration.md), [ADR 0005](../../adr/0005-versioned-plugin-support-library.md), [ADR 0008](../../adr/0008-bun-workspace-rolldown-and-bun-test-stack.md), and [ADR 0009](../../adr/0009-public-npm-trusted-publishing-and-stable-tag-releases.md).

## Delivery Surfaces

- `packages/pi-auto-continue/package.json`, `tsconfig.json`, `rolldown.config.mjs`, `README.md` — Independent package scaffold, build config, and documentation.
- `packages/pi-auto-continue/extensions/loop.ts` — Pure session-local continuation state machine, FIFO queue operations (preserved across disarm), `queueEmptyPolicy`, `onError: "defer" | "wait-quota" | "stop"`, quota-reset parser/floor (`quotaWait`, `quotaDelayMs`), `maxRounds`, `duration`/`until` deadlines, 1-second countdown status, and diagnostics.
- `packages/pi-auto-continue/extensions/config.ts` — Global `pi-auto-continue.json` TypeBox schema, `JsonConfigStore` fail-closed defaults, and scalar option validation/presets.
- `packages/pi-auto-continue/extensions/process.ts` — Cross-platform bounded subprocess runner with strict timeout and `AbortSignal` termination.
- `packages/pi-auto-continue/extensions/prompts.ts` — Multi-mode prompt resolution (Prompt Pipe + last-match tag extraction, dynamic UTF-8 `promptFile`, Direct `{round}`/`{maxRounds}` template) and `queue import` file parsing.
- `packages/pi-auto-continue/extensions/stop-hooks.ts` — Pre-dispatch `stopFile` sentinel check and one-shot `stopCommand` evaluator (env metadata including `PI_AUTO_CONTINUE_QUEUE_LENGTH`, strict timeout, fail-closed on spawn/timeout/non-zero/`"0"` stdout, `AbortSignal` cleanup).
- `packages/pi-auto-continue/extensions/commands.ts` — Unified `/auto-continue` command grammar (`start` with session-only overrides, `stop`, `queue` subcommands, `status`, `config`, `help`) and full-prefix multi-token `getArgumentCompletions`.
- `packages/pi-auto-continue/extensions/ui.ts` — Interactive TUI `SettingsList` panel, session arm/disarm toggle, queue actions/header, multiline editor integration, and `pi-packages:ui:discover` switching.
- `packages/pi-auto-continue/extensions/index.ts` — Pi lifecycle wiring (including provider response quota-reset observation), generation/abort-guarded pre-dispatch pipeline (`Queue > Prompt Pipe > Prompt File > Direct`), immediate `queue send`/`steer` with `{ expandPromptTemplates, deliverAs }` and send-error rollback, Esc/Ctrl+C handling, and 1-second status refresh.
- `packages/pi-auto-continue/tests/` — Unit, lifecycle/concurrency, candidate, and isolated real-Pi RPC smoke tests.
- `README.md` — Root package catalog entry.

## Dependencies

| Producer | Consumer | Why consumer cannot proceed first |
| --- | --- | --- |
| T0001 | T0002 | Prompt resolution and queue-file import use the package scaffold, config types, and round metadata defined in T0001. |
| T0001, T0002 | T0003 | Stop-hook evaluation and pre-dispatch wiring depend on the package scaffold, `ContinueController` queue/quota state from T0001, and `process.ts`/`prompts.ts` from T0002. |
| T0002, T0003 | T0004 | Commands (`start` flags, `queue` management/send/steer, `status`) and TUI panel surface prompt modes, queue/quota state, and pre-dispatch controls from T0001–T0003. |
| T0004 | T0005 | Full lifecycle, immediate send/steer, in-flight abort, and coexistence tests exercise the complete extension wiring (`index.ts` + commands + pre-dispatch pipeline). |
| T0005 | T0006 | Documentation, catalog entry, and isolated real-Pi RPC smoke verification require the verified complete package. |

## Coordination

| Tickets | Risk | Strategy |
| --- | --- | --- |
| T0002, T0003 | Both spawn cross-platform bounded child processes with `AbortSignal` and timeout termination | Share one small internal `runShellCommand()` helper in `extensions/process.ts` (introduced in T0002) so timeout/kill/stdout-bound behavior is consistent and tested once. |
| T0001, T0004 | Shared `config.ts` / `configOptions` key ordering and completion contracts | Define full default schema (including `queueEmptyPolicy`, `expandPromptTemplates`, `quotaWait`, `quotaDelayMs`) in T0001 so T0002–T0004 consume stable typed settings without repeated schema churn. |

## Recommended Order

1. **T0001** — Package scaffold, `config.ts`, and pure `loop.ts` state machine (including FIFO queue and quota-reset parsing/floor).
2. **T0002** — Bounded subprocess helper (`process.ts`), prompt resolver (`prompts.ts`), format tag extraction, and queue-import file parser.
3. **T0003** — StopHook evaluator (`stop-hooks.ts`) and guarded pre-dispatch + immediate `send`/`steer` + quota observation wiring in `index.ts`.
4. **T0004** — Unified `/auto-continue` commands (`start`, `stop`, `queue`, `status`, `config`), completions, multiline TUI editor, and TUI panel (`commands.ts`, `ui.ts`, `index.ts`).
5. **T0005** — Lifecycle, queue preservation/rollback, immediate `send`/`steer`, async-abort concurrency, and quota/`onError` coexistence regression suite.
6. **T0006** — Package `README.md`, root catalog update, standalone real-Pi RPC `pi-smoke.mjs`, and full workspace verification.

## Ticket Index

| Ticket | File | Outcome |
| --- | --- | --- |
| T0001 | [T0001-package-scaffold-config-and-state-machine.md](./T0001-package-scaffold-config-and-state-machine.md) | Independent `packages/pi-auto-continue/` scaffold, fail-closed config store, and `ContinueController` with FIFO queue and quota-reset timing |
| T0002 | [T0002-prompt-sources-and-format-extraction.md](./T0002-prompt-sources-and-format-extraction.md) | Direct, dynamic `promptFile`, `promptPipe` (timeout, abort, last-match tag extraction), and `queue import` parsing |
| T0003 | [T0003-stop-hooks-and-sentinel-checks.md](./T0003-stop-hooks-and-sentinel-checks.md) | `stopFile` sentinel, one-shot `stopCommand`, quota observation, and guarded pre-dispatch + immediate `send`/`steer` pipeline |
| T0004 | [T0004-commands-completions-and-tui-panel.md](./T0004-commands-completions-and-tui-panel.md) | `/auto-continue` unified grammar (`start`/`stop`/`queue`/`status`/`config`/`help`), multiline editor, completions, and TUI panel |
| T0005 | [T0005-lifecycle-concurrency-and-coexistence-tests.md](./T0005-lifecycle-concurrency-and-coexistence-tests.md) | Lifecycle, queue preservation/rollback, immediate `send`/`steer`, in-flight abort, and quota/`onError` coexistence regression tests |
| T0006 | [T0006-docs-catalog-and-standalone-pi-smoke.md](./T0006-docs-catalog-and-standalone-pi-smoke.md) | Package README, root catalog entry, isolated real-Pi RPC smoke test (queue, immediate send, pipe, stop-hook, quota/defer), and full workspace verification |
