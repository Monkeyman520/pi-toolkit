# Unified /pretty-session (/ps) commands, argument completion, and TUI settings panel

**Ticket ID:** T0003
**Source:** [Spec 0005](../../spec/0005-unified-commands-and-tui-settings.md) (C1-C6); [Spec 0004](../../spec/0004-pi-pretty-session.md); [ADR 0004](../../adr/0004-unified-command-grammar-and-dynamic-tui-configuration.md).
**Status:** Done

## Goal

Align `pi-pretty-session` (`/pretty-session` and `/ps`) with the unified `/<extension> <action> [other-args]` command surface, add full multi-token argument auto-completion to both `/pretty-session` and `/ps`, and add an interactive `SettingsList`-based TUI configuration panel accessible from `/ps config`, `/pretty-session config`, the session browser, and `pi.events` discovery.

## Affected Surfaces

- `packages/pi-pretty-session/extensions/` (`index.ts`, `commands.ts`, `browser.ts`, and TUI settings panel module).
- `packages/pi-pretty-session/tests/` and `packages/pi-pretty-session/README.md`.
- Root `README.md` and `packages/README.md` only if command/UI summary descriptions need alignment.

## Approach

- Ensure `parsePrettySessionArgs` and usage text highlight canonical `/<extension> <action> [other-args]` actions (`browse [current|all]`, `status` with `info`/`show` aliases, `project`, `summarize`, `rename`, `unlock`, `list [current|all]`, `config [reload | <key> [value]]`, `toggle <target>`, `help`).
- Implement shared `getArgumentCompletions(argumentPrefix)` and attach it to both `/pretty-session` and `/ps`:
  - First token suggests `browse`, `status`, `project`, `summarize`, `rename`, `unlock`, `list`, `config`, `toggle`, `help`.
  - `browse ` and `list ` suggest `current`, `all`.
  - `toggle ` suggests `auto`, `llm`, `widget`, `status`, `lock`, `compact`.
  - `config ` suggests `reload` and all `PrettySessionConfig` keys at token 2, and valid boolean (`true`, `false`), placement (`aboveEditor`, `belowEditor`), model (`default` plus available models), or numeric preset values at token 3, preserving leading tokens in `AutocompleteItem.value`.
- Build an interactive TUI settings panel using `ctx.ui.custom()`, `SettingsList`, `getSettingsListTheme()`, and `DynamicBorder`:
  - Open when `/pretty-session config` or `/ps config` is invoked with no key/value in TUI mode, or when the user presses the settings shortcut (e.g., `Ctrl+S` or `c`) inside the `/ps` session browser.
  - Display live session title, description, summary source, manual lock state, context usage, and config file status.
  - Allow editing all `PrettySessionConfig` options (`enabled`, `autoSummarize`, `useLlm`, `summarizeOnCompact`, `protectManualName`, `showWidget`, `widgetPlacement`, `showStatus`, `updateEveryTurns`, `updateTokenDelta`, `maxTitleLength`, `maxDescriptionLength`, `model`) plus immediate actions (`summarize`, `unlock`, `reload`), persisting to `pi-pretty-session.json` and refreshing widget/status immediately.
- Register and query `"pi-packages:ui:discover"` on `pi.events` so loaded collection plugins can switch panels in TUI mode without ever showing uninstalled plugins.

## Dependencies and Coordination

- **Blocked by:** None.
- **Blocks:** None.
- **Coordination risks:** Keep `/pretty-session` and `/ps` completions and handlers strictly identical; follow the shared `"pi-packages:ui:discover"` contract.

## Acceptance

- [ ] Both `/pretty-session` and `/ps` expose identical `<action> [other-args]` parsing and multi-token `getArgumentCompletions`.
- [ ] `getArgumentCompletions` suggests actions, `browse`/`list` scopes, `toggle` targets, and `config` keys/values with full-prefix `item.value` replacement strings.
- [ ] Invoking `/pretty-session config` or `/ps config` (with no key) in TUI mode, or pressing the settings shortcut in the session browser, opens the interactive `SettingsList` panel; non-TUI mode emits the formatted config report via `ctx.ui.notify()`.
- [ ] Modifying settings in the TUI panel persists to `pi-pretty-session.json` and immediately updates the active widget/footer status.
- [ ] Standalone loading shows only `pi-pretty-session`; when other plugins register on `pi.events`, the panel switcher lists only those loaded plugins.
- [ ] `npm run typecheck`, `npm run check`, `npm test`, and `npm run smoke` pass in `packages/pi-pretty-session/`, and `README.md` is updated.

## Out of Scope

- Overriding Pi's built-in `/resume`, `/session`, or `/name` commands.