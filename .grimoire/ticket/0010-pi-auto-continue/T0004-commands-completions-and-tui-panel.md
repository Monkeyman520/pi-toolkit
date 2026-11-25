# Unified /auto-continue commands, queue subcommands, completions, and interactive TUI panel

**Ticket ID:** T0004
**Source:** [Spec 0012](../../spec/0012-pi-auto-continue.md) (C2, C3, C7)
**Status:** Todo

## Goal

Implement the unified `/auto-continue <action> [other-args]` command grammar (including session-only `start` overrides and full `queue` management/immediate dispatch subcommands with TUI multiline editor support), full-prefix multi-token `getArgumentCompletions`, and the interactive TUI `SettingsList` panel with `pi-packages:ui:discover` cross-plugin switching per [ADR 0004](../../adr/0004-unified-command-grammar-and-dynamic-tui-configuration.md).

## Affected Surfaces

- `packages/pi-auto-continue/extensions/commands.ts` — Command parser (`default`, `start` with quoted flag parsing, `stop`, `queue`, `status`, `config`, `help`) and full-prefix multi-token `getArgumentCompletions`.
- `packages/pi-auto-continue/extensions/ui.ts` — Interactive TUI `SettingsList` panel (session arm/disarm toggle, persisted default settings including `queueEmptyPolicy`, `expandPromptTemplates`, `quotaWait`, `quotaDelayMs`, queue actions such as send-next/add-via-editor/clear, stop/reload actions, diagnostic header with `truncateToWidth`, installed-only `pluginSwitcherItem`).
- `packages/pi-auto-continue/extensions/index.ts` — Register `/auto-continue` command (including `queue add` launching `ctx.ui.editor()` when invoked without text in TUI mode and `queue import <file>`), wire `DISCOVER_EVENT` (`pi-auto-continue`), and wire TUI Escape/Ctrl+C disarming (preserving queue).
- `packages/pi-auto-continue/tests/commands-and-ui.test.ts` — Unit tests for `start`/`queue`/`config` parsing (including quoted strings/spaces), multi-token completions, config suggestions contract, and TUI panel render/action/discovery tests.

## Approach

- Implement shell-style token splitting in `commands.ts` for `/auto-continue start ...` so quoted arguments work naturally.
- Supported `start` session-only flags (never written to `pi-auto-continue.json`):
  - `--rounds <N>` / `-r <N>`
  - `--delay <ms|duration>` / `-d <ms|duration>`
  - `--duration <spec>`
  - `--until <timestamp>`
  - `--on-error defer|wait-quota|stop`
  - `--queue-empty stop|continue`
  - `--prompt <text>`
  - `--prompt-file <path>`
  - `--prompt-pipe <cmd>`
  - `--format <prefix> <suffix>`
  - `--stop-file <path>`
  - `--stop-cmd <cmd>`
- Supported `queue` subcommands:
  - `/auto-continue queue` or `/auto-continue queue list`
  - `/auto-continue queue add [text]` (empty text in TUI mode opens `ctx.ui.editor("Auto Continue — Queue Prompt", "")`; non-TUI empty text returns usage error)
  - `/auto-continue queue prepend <text>`
  - `/auto-continue queue remove <index>`
  - `/auto-continue queue move <from> <to>`
  - `/auto-continue queue clear`
  - `/auto-continue queue import <file>`
  - `/auto-continue queue send [index]` (default `1`)
  - `/auto-continue queue steer [index]` (default `1`)
- In `ui.ts`:
  - First item toggles session armed state (`armed` / `disarmed`, session-only — never writes an auto-arm flag to disk).
  - Subsequent scalar setting rows edit and persist default parameters in `pi-auto-continue.json` (`delayMs`, `maxRounds`, `onError`, `queueEmptyPolicy`, `expandPromptTemplates`, `quotaWait`, `quotaDelayMs`, `pipeRequireFormat`, `pipeTimeoutMs`, `stopCommandTimeoutMs`, `notifyOnContinue`).
  - Action rows for `Send Next Queued Item`, `Clear Queue`, `Stop Auto-Continue`, and `Reload Config File`.
  - Header displays armed/disarmed badge, live status/countdown (or quota wait), round count, queue count + head preview, active prompt source, active stop conditions/deadline, and last stop reason.
  - Dynamically discover sibling loaded panels via `pi-plugin-support/discovery` without hardcoding uninstalled plugins.

## Dependencies and Coordination

- **Blocked by:** T0002 (prompt options and `readQueueImportFile`), T0003 (stop-hook options and `index.ts` lifecycle/dispatch helpers).
- **Blocks:** T0005, T0006.
- **Coordination risks:** Ensure `getArgumentCompletions` returns full replacement prefixes from `<action>` through the completed token per ADR 0004, and ensure `SettingsList` action items do not freeze list navigation on Enter.

## Acceptance

- [ ] `/auto-continue start` parses quoted flags accurately, applies them only to the current session without modifying `pi-auto-continue.json`, refuses to arm when config is invalid, and rejects unknown/malformed flags.
- [ ] `/auto-continue queue` subcommands (`add`, TUI multiline editor on bare `add`, `prepend`, `list`, `remove`, `move`, `clear`, `import`, `send`, `steer`) parse and execute cleanly with clear errors on out-of-range indices.
- [ ] `/auto-continue stop`, `/auto-continue status`, `/auto-continue config [reload | <key> [value]]`, and `/auto-continue help` behave consistently in TUI and non-TUI modes.
- [ ] `getArgumentCompletions` suggests subcommands, `start` flags/values, `queue` subcommands, and `config` keys/values with complete argument prefixes.
- [ ] TUI panel renders armed state, queue count/preview, diagnostics, and editable defaults, handles actions without freezing navigation, and displays `Switch Installed Plugin` only when sibling plugins register on `pi-packages:ui:discover`.
- [ ] `bun run --cwd packages/pi-auto-continue typecheck`, `check`, and `test` pass.

## Out of Scope

- End-to-end real Pi RPC smoke test (T0006).
- Multi-instance concurrency stress tests (T0005).
