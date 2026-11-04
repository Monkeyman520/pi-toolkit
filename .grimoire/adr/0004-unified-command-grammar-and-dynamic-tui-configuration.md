# Unified command grammar and dynamic TUI configuration

**Status:** Completed
**Date:** 2026-04-20

## Context

Plugins in `pi-packages` (`pi-auto-resume`, `pi-pretty-session`, and `pi-quota-keeper`) previously relied on editing JSON files or running divergent slash commands with plain-text notifications for configuration and status display, and provided no slash-command argument auto-completion.

Two platform and architectural constraints shape how interactive configuration and command ergonomics can work across the collection:

- Pi's built-in `/settings` command is intercepted directly by the host (`InteractiveMode` and `SettingsSelectorComponent`) and does not expose an extension hook for injecting custom plugin settings rows. However, the host provides `@earendil-works/pi-tui` (`SettingsList`, `SelectList`, `Input`, `Container`), `getSettingsListTheme()`, and `ctx.ui.custom()`, as well as `getArgumentCompletions(argumentPrefix)` on `pi.registerCommand()` and the shared `pi.events` bus.
- [ADR 0001](./0001-independently-installable-pi-packages.md) requires each plugin under `packages/<plugin-name>/` to be an independently installable unit with no undeclared sibling source dependencies. The user explicitly required that configuration and display surfaces never show uninstalled plugins or their configurations, that commands follow a unified `/<extension> <action> [other-args]` format, and that subcommands and arguments provide interactive completion hints.

## Decision

- **Unified command grammar (`/<extension> <action> [other-args]`):** Every plugin command in the collection follows `/<extension> <action> [other-args]` (including documented short command aliases such as `/ps` for `/pretty-session`). Actionable operations and target selectors belong under explicit `<action>` subcommands rather than ad-hoc positional forms, though parsers may retain backward compatibility for legacy shorthand.
- **Multi-token argument auto-completion (`getArgumentCompletions`):** Every registered plugin command (and alias) provides `getArgumentCompletions(argumentPrefix)` returning `AutocompleteItem[] | null`. First-level completion suggests valid `<action>` subcommands (such as `on`, `off`, `status`, `enable`, `disable`, `config`); subsequent tokens suggest context-appropriate `<other-args>` (such as configuration keys, boolean/enum values, or discovered account/model/window identifiers). Because Pi's `CombinedAutocompleteProvider` replaces the full argument string after `/<command> `, multi-token completion items must return the complete argument string from the `<action>` token through the completed token.
- **Interactive TUI configuration and status panels:** In interactive TUI mode (`ctx.mode === "tui"`), invoking `/<extension> config` without a key/value argument opens an interactive `SettingsList`-based TUI panel via `ctx.ui.custom()` displaying live plugin status alongside editable configuration items that persist directly to the plugin's JSON configuration file. Invoking `/<extension>` with no arguments in TUI mode opens the plugin's primary interactive TUI surface (the status/settings panel for `pi-auto-resume` and `pi-quota-keeper`, and the interactive session browser with a direct settings-panel shortcut for `pi-pretty-session`). Non-TUI modes fall back to text notifications.
- **Installed-only dynamic discovery via `pi.events`:** Plugins must never hardcode a static catalog of sibling plugins or render settings for uninstalled packages. Each loaded plugin announces and queries active TUI configuration panels at runtime over Pi's shared `pi.events` event bus so that cross-plugin panel switching shows only plugins currently loaded in the active Pi session, without introducing cross-package code dependencies.

## Consequences

- Users can inspect status and modify configuration for any installed plugin interactively in TUI mode without manually editing JSON files or memorizing config keys.
- Uninstalled plugins remain completely absent from commands, completions, and TUI settings panels, preserving [ADR 0001](./0001-independently-installable-pi-packages.md).
- Packages that use `@earendil-works/pi-tui` components must declare `"@earendil-works/pi-tui": "*"` in `peerDependencies` (and matching local `devDependencies` for type checking and tests) per [ADR 0002](./0002-typescript-esm-plugin-development-stack.md).
- Slash commands across `pi-auto-resume`, `pi-pretty-session`, and `pi-quota-keeper` share a predictable `/<extension> <action> [other-args]` structure and interactive Tab/input auto-completion.

**Implementation evidence (2026-04-20):** All three packages implement the unified grammar, multi-token `getArgumentCompletions`, `SettingsList` TUI panels, and `pi-packages:ui:discover` installed-only discovery. Per-package `tsc --noEmit`, Biome, Vitest, and isolated Pi RPC smoke checks pass. Status is Testing because the interactive TUI panels and editor autocomplete were verified only with mocked `ctx.ui.custom()` renders and unit tests, not by manual keyboard use in a real Pi TUI session with multiple plugins loaded.