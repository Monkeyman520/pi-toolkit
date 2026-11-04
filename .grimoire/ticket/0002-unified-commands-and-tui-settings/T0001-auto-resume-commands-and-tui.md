# Unified /auto-resume commands, argument completion, and TUI settings panel

**Ticket ID:** T0001
**Source:** [Spec 0005](../../spec/0005-unified-commands-and-tui-settings.md) (C1-C6); [Spec 0002](../../spec/0002-pi-auto-resume.md); [ADR 0004](../../adr/0004-unified-command-grammar-and-dynamic-tui-configuration.md).
**Status:** Done

## Goal

Equip `pi-auto-resume` with the unified `/auto-resume <action> [other-args]` command surface, multi-token argument auto-completion (`getArgumentCompletions`), and an interactive `SettingsList`-based TUI status and configuration panel that discovers only installed plugins via `pi.events`.

## Affected Surfaces

- `packages/pi-auto-resume/package.json` (declare `"@earendil-works/pi-tui": "*"` in `peerDependencies` and `"1.5.0"` in `devDependencies`).
- `packages/pi-auto-resume/extensions/` (`index.ts`, `config.ts`, and command/TUI helper modules).
- `packages/pi-auto-resume/tests/` and `packages/pi-auto-resume/README.md`.

## Approach

- Normalize `/auto-resume` command parsing around `<action> [other-args]`: `status`, `on`, `off`, `stop`, `config [reload | <key> [value]]` (with aliases `cfg`, `set`), and `help`.
- Implement `getArgumentCompletions(argumentPrefix)` on `/auto-resume`:
  - Suggest `status`, `on`, `off`, `stop`, `config`, `help` at the first token.
  - Suggest `reload` and valid `Settings` keys (`enabled`, `network`, `throttle`, `quota`, `wake`, `retryDelayMs`, `quotaDelayMs`, `maxAttempts`) after `config `, and valid boolean (`true`, `false`, `on`, `off`) or integer preset values at the third token, preserving the full argument string in `AutocompleteItem.value`.
- Build an interactive TUI panel using `ctx.ui.custom()`, `SettingsList`, `getSettingsListTheme()`, and `DynamicBorder`:
  - Open on bare `/auto-resume` or `/auto-resume config` when `ctx.mode === "tui"` (falling back to text notifications in non-TUI modes).
  - Display live session recovery status, attempt counter, config path, and any validation error.
  - Allow toggling `enabled`, `network`, `throttle`, `quota`, and `wake`, editing `retryDelayMs`, `quotaDelayMs`, and `maxAttempts` (via preset cycling or `Input` submenu), stopping pending recovery (`stop`), and reloading config (`reload`).
- Register and query `"pi-packages:ui:discover"` on `pi.events` during active sessions so the TUI panel shows a plugin switcher only when other collection plugins are actually loaded in the session.

## Dependencies and Coordination

- **Blocked by:** None.
- **Blocks:** None.
- **Coordination risks:** Must follow the shared `"pi-packages:ui:discover"` event contract in the ticket-set README and preserve all existing [Spec 0002](../../spec/0002-pi-auto-resume.md) recovery boundaries.

## Acceptance

- [ ] `packages/pi-auto-resume/package.json` declares `"@earendil-works/pi-tui": "*"` in `peerDependencies` without bundling host packages in `dependencies`.
- [ ] `/auto-resume` supports `status`, `on`, `off`, `stop`, `config [reload | <key> [value]]`, and `help`; bare `/auto-resume` and `/auto-resume config` open the TUI settings panel when `ctx.mode === "tui"` and emit text notifications when `ctx.mode !== "tui"`.
- [ ] `getArgumentCompletions` returns matching top-level actions (including `on` and `off`), `config` keys, and key-appropriate values, with `item.value` preserving leading tokens so Pi's `CombinedAutocompleteProvider` constructs valid commands.
- [ ] Toggling or editing settings in the TUI panel validates and persists changes to `pi-auto-resume.json` and immediately updates the live `Recovery` state and footer status.
- [ ] Standalone loading shows only `pi-auto-resume` with no uninstalled plugin placeholders; when another plugin responder is registered on `pi.events`, the TUI panel exposes switching to that loaded plugin.
- [ ] `npm run typecheck`, `npm run check`, `npm test`, and `npm run smoke` pass in `packages/pi-auto-resume/`, and `README.md` accurately documents the commands, completions, and TUI panel.

## Out of Scope

- Cross-process quota polling or session summarization features belonging to other packages.