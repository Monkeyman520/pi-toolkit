# Unified Command Grammar, Argument Completion, and Dynamic TUI Settings Panels

**Spec ID:** 0005
**Status:** Implemented
**Date:** 2026-04-20
**Endpoint:** Requirements and ticket decomposition only.

**Dependency-boundary revision (2026-11-04):** [ADR 0005](../adr/0005-versioned-plugin-support-library.md) and [Spec 0006](./0006-versioned-support-library-and-plugin-migrations.md) permit an explicitly declared ordinary versioned support-library dependency. They supersede only the blanket cross-package code restriction below; sibling source imports, implicit shared dependency instances, a shared runtime owner and a separately activated manager remain excluded. Existing commands, TUI behavior and installed-only discovery remain binding.

## Sources

- **U1 — Initial user request:** Replace JSON-only and raw-command-only plugin configuration and status display with interactive TUI / settings panels; never display uninstalled plugins or their configurations; add subcommand and argument auto-completion hints (such as `/quota` suggesting `enable ...` and `/auto-resume` suggesting `on`, `off`); and unify slash-command syntax to `/<extension> <action> [other-args]`.
- **U2 — Confirmed decisions:**
  - **1A (Per-plugin TUI panels + dynamic installed-only discovery):** Each installed plugin provides an interactive `SettingsList`-based TUI status and configuration panel, and loaded plugins discover each other dynamically over `pi.events` so users can switch between installed plugins in the TUI without ever showing uninstalled plugins or creating cross-package source dependencies.
  - **2A (Default TUI action on bare `/<extension>`):** Running `/<extension>` with no arguments in interactive TUI mode opens the plugin's interactive TUI surface (`pi-auto-resume` opens its status & settings panel; `pi-quota-keeper` opens its quota overview & wake-up settings panel; `pi-pretty-session` opens its session browser with a shortcut to its settings panel; and `/<extension> config` with no key/value arguments opens the settings panel directly). Non-TUI modes fall back to text notifications.
  - **3 (Unified `/<extension> <action> [other-args]` grammar, `/ps` alias retention, and multi-token completions):** Normalize subcommands across `/auto-resume`, `/quota`, `/pretty-session`, and `/ps`; retain `/ps` with full auto-completion parity; preserve backward compatibility for legacy `/quota <account-id> [details]` and `/ps info`; and implement multi-token `getArgumentCompletions(argumentPrefix)` across all commands.
  - **4 (Selected route):** Spec → Slice (`.grimoire/spec/0005-unified-commands-and-tui-settings.md` and `.grimoire/ticket/0002-unified-commands-and-tui-settings/`).
- **Project:** [Context](../CONTEXT.md), [ADR 0001](../adr/0001-independently-installable-pi-packages.md), [ADR 0002](../adr/0002-typescript-esm-plugin-development-stack.md), [ADR 0003](../adr/0003-pi-hosted-single-owner-subscription-maintenance.md), [ADR 0004](../adr/0004-unified-command-grammar-and-dynamic-tui-configuration.md), [Spec 0002](./0002-pi-auto-resume.md), [Spec 0003](./0003-pi-quota-keeper.md), [Spec 0004](./0004-pi-pretty-session.md), [package development reference](../../packages/README.md).
- **P1 — Official Pi extension and autocomplete contract:** [Pi extensions](https://pi.dev/docs/latest/extensions) (`docs/extensions.md`, `@earendil-works/pi-coding-agent`, and `@earendil-works/pi-tui` in installed Pi 1.5.0), specifically `pi.registerCommand()`, `getArgumentCompletions(argumentPrefix)`, `CombinedAutocompleteProvider` full-argument prefix replacement, `ctx.ui.custom()`, and `pi.events`.
- **P2 — Official Pi TUI component contract:** [Terminal UI](https://pi.dev/docs/latest/tui) (`docs/tui.md` and `@earendil-works/pi-tui` in installed Pi 1.5.0), specifically `SettingsList`, `SettingItem`, `SelectList`, `Input`, `Container`, `DynamicBorder`, and `getSettingsListTheme()`.

## Requirements

### C1. Independent package boundaries and installed-only visibility

Each plugin (`pi-auto-resume`, `pi-pretty-session`, and `pi-quota-keeper`) must remain independently installable under `packages/<plugin-name>/` with no undeclared sibling source imports or shared runtime bundle. [U1, U2; ADR 0001, ADR 0004]

- Packages that import `@earendil-works/pi-tui` components must declare `"@earendil-works/pi-tui": "*"` in `peerDependencies` (and matching `devDependencies` for local type checking and tests) per [ADR 0002](../adr/0002-typescript-esm-plugin-development-stack.md).
- No slash command, auto-completion provider, or TUI settings panel may hardcode or display uninstalled plugins or their configuration options. Only plugins actually loaded in the active Pi session may appear in any UI or switcher. [U1, U2; ADR 0001, ADR 0004]

### C2. Unified command grammar (`/<extension> <action> [other-args]`)

All collection plugins must expose a consistent `/<extension> <action> [other-args]` command structure: [U1, U2; ADR 0004]

- **`pi-auto-resume` (`/auto-resume`):**
  - Canonical actions:
    - `/auto-resume status` — display current session recovery status and active settings summary.
    - `/auto-resume on` — enable automatic recovery for the current session.
    - `/auto-resume off` — disable automatic recovery for the current session and cancel any pending timer.
    - `/auto-resume stop` — cancel any pending recovery without disabling future eligible recoveries.
    - `/auto-resume config [reload | <key> [value]]` (aliases `cfg`, `set`) — open the interactive TUI settings panel when invoked with no `<key>` in TUI mode; reload `pi-auto-resume.json` when given `reload`; or inspect/update a specific setting key (`enabled`, `network`, `throttle`, `quota`, `wake`, `retryDelayMs`, `quotaDelayMs`, `maxAttempts`).
    - `/auto-resume help` — display usage guidance.
  - Bare `/auto-resume` (no arguments): opens the interactive TUI status and configuration panel when `ctx.mode === "tui"`, or emits the status summary notification in non-TUI modes.
- **`pi-quota-keeper` (`/quota`):**
  - Canonical actions:
    - `/quota status [account-id]` (alias `view`) — display compact quota summary for all logged-in accounts or one exact `<account-id>`.
    - `/quota details [account-id]` — display detailed quota windows, reset times, credits, and wake-up status for all accounts or one exact `<account-id>`.
    - `/quota list` — list copyable account IDs, masked labels, and provider/authentication types.
    - `/quota refresh` — trigger an immediate quota poll through the active maintenance owner.
    - `/quota enable <account-id> <model-id> [window-id]` — enable scheduled wake-ups for `<account-id>` using `<model-id>` and optional `<window-id>`.
    - `/quota disable <account-id>` — disable scheduled wake-ups for `<account-id>`.
    - `/quota config [reload | <key> [value]]` — open the interactive TUI quota & settings panel when invoked with no `<key>` in TUI mode; reload `pi-quota-keeper.json` when given `reload`; or inspect/update `mode` (`reset` | `fixed`), `delayMs`, or `pollIntervalMs`.
    - `/quota help` — display usage guidance.
  - Backward compatibility: `/quota <account-id> [details]` continues to resolve as exact account lookup so existing [Spec 0003](./0003-pi-quota-keeper.md) U10 workflows remain unbroken.
  - Bare `/quota` (no arguments): opens the interactive TUI quota overview and configuration panel when `ctx.mode === "tui"`, or emits the compact quota summary notification in non-TUI modes.
- **`pi-pretty-session` (`/pretty-session` and short alias `/ps`):**
  - Both `/pretty-session` and `/ps` remain registered and share identical action parsing and completion behavior.
  - Canonical actions:
    - `/ps browse [current | all]` (alias `open`) — open the interactive TUI session & project browser.
    - `/ps status` (aliases `info`, `show`) — display current session and project metadata summary.
    - `/ps project` (alias `proj`) — display detailed project context (Git, manifest, session count).
    - `/ps summarize` (aliases `refresh`, `summary`, `regen`) — generate or refresh session title and description immediately.
    - `/ps rename [title] [| <description>]` (alias `name`) — set custom title/description and lock against automatic overwrite (prompting interactively in TUI mode when title is omitted).
    - `/ps unlock` — clear manual title lock so automatic updates resume.
    - `/ps list [current | all]` (alias `ls`) — list saved sessions with descriptions and metrics.
    - `/ps config [reload | <key> [value]]` (aliases `cfg`, `set`) — open the interactive TUI settings panel when invoked with no `<key>` in TUI mode; reload `pi-pretty-session.json` when given `reload`; or inspect/update a specific configuration key.
    - `/ps toggle <auto | llm | widget | status | lock | compact>` — toggle a boolean configuration target.
    - `/ps help` — display usage guidance.
  - Bare `/pretty-session` or `/ps` (no arguments): opens the interactive session browser in TUI mode (which includes a direct keyboard shortcut to open the TUI settings panel), or emits the session dashboard notification in non-TUI modes.

### C3. Multi-token argument auto-completion (`getArgumentCompletions`)

Every command registered by the three packages (`/auto-resume`, `/quota`, `/pretty-session`, and `/ps`) must provide `getArgumentCompletions(argumentPrefix)` returning matching `AutocompleteItem[] | null`: [U1, U2; ADR 0004, P1]

- **Prefix replacement invariant:** Pi's `CombinedAutocompleteProvider` passes the entire text after `/<command> ` as `argumentPrefix` and replaces that entire slice with `item.value`. Therefore, when completing token 2 or later (after `<action> `), each returned `AutocompleteItem.value` must include the normalized leading `<action>` and prior arguments (for example, `value: "enable anthropic:default"` or `value: "config mode fixed"`), while `label` and `description` present clear human-readable candidate text.
- **First-level (`<action>`) completion:** When `argumentPrefix` contains no whitespace, filter canonical `<action>` names matching the prefix and include concise descriptions of each action.
- **`/auto-resume` argument completions:**
  - Top-level actions: `status`, `on`, `off`, `stop`, `config`, `help`.
  - Under `config `: suggest `reload` and all valid setting keys (`enabled`, `network`, `throttle`, `quota`, `wake`, `retryDelayMs`, `quotaDelayMs`, `maxAttempts`) with current values in descriptions.
  - Under `config <key> `: suggest `true`/`false`/`on`/`off` for boolean keys and common valid numeric values for integer keys (`retryDelayMs`, `quotaDelayMs`, `maxAttempts`).
- **`/quota` argument completions:**
  - Top-level actions: `status`, `details`, `list`, `refresh`, `enable`, `disable`, `config`, `help`.
  - Under `status ` and `details `: suggest known `<account-id>` values from in-memory or persisted quota state (`pi-quota-keeper-state.json`), showing masked label and provider in `description`.
  - Under `enable `:
    - Token 2 (`/quota enable <prefix>`): suggest known `<account-id>` values (prioritizing accounts that support activation or best-effort wake-ups).
    - Token 3 (`/quota enable <account-id> <prefix>`): suggest available `<model-id>` values matching that account's provider from the active model registry (or previously configured models).
    - Token 4 (`/quota enable <account-id> <model-id> <prefix>`): suggest known quota `<window-id>` values for that account when multiple windows exist.
  - Under `disable `: suggest currently enabled `<account-id>` values from `config.enabledAccounts` (falling back to known account IDs).
  - Under `config `:
    - Token 2: suggest `reload`, `mode`, `delayMs`, `pollIntervalMs`.
    - Token 3: suggest `reset` and `fixed` for `mode`; suggest representative valid millisecond values (such as `0`, `30000`, `60000`, `300000`) for `delayMs` and `pollIntervalMs`.
- **`/pretty-session` and `/ps` argument completions:**
  - Top-level actions: `browse`, `status`, `project`, `summarize`, `rename`, `unlock`, `list`, `config`, `toggle`, `help`.
  - Under `browse ` and `list `: suggest `current` and `all`.
  - Under `toggle `: suggest `auto`, `llm`, `widget`, `status`, `lock`, `compact` with current boolean state in `description`.
  - Under `config `:
    - Token 2: suggest `reload` and all valid `PrettySessionConfig` keys (`enabled`, `autoSummarize`, `useLlm`, `updateEveryTurns`, `updateTokenDelta`, `summarizeOnCompact`, `protectManualName`, `showWidget`, `widgetPlacement`, `showStatus`, `maxTitleLength`, `maxDescriptionLength`, `model`).
    - Token 3: suggest `true`/`false` for boolean keys, `aboveEditor`/`belowEditor` for `widgetPlacement`, `default` plus available `provider/modelId` values for `model`, and representative valid integers for numeric keys.

### C4. Per-plugin interactive TUI status and settings panels

Each plugin must provide an interactive TUI panel using `ctx.ui.custom()` and `@earendil-works/pi-tui`'s `SettingsList` (with `getSettingsListTheme()` and `DynamicBorder`) that both displays current plugin state and edits/persists configuration without manual JSON editing: [U1, U2; ADR 0004, P2]

- **`pi-auto-resume` TUI panel (opened via `/auto-resume` or `/auto-resume config` in TUI mode):**
  - Header/status section displays current session recovery status (`idle`, `disabled`, `cancelled`, `waiting until ...`, etc.), attempt counter (`attempts / maxAttempts`), configuration file path, and any active config validation error.
  - `SettingsList` items allow:
    - Toggling `enabled` (`true` / `false`), `network`, `throttle`, `quota`, and `wake`.
    - Editing `retryDelayMs`, `quotaDelayMs`, and `maxAttempts` via value presets or an inline `Input` submenu with schema validation.
    - Executing immediate actions: cancel pending recovery (`stop`) and reload config from disk (`reload`).
  - Changes persist atomically to `pi-auto-resume.json` and immediately update the live `Recovery` instance and footer status.
- **`pi-quota-keeper` TUI panel (opened via `/quota` or `/quota config` in TUI mode):**
  - Header/status section displays coordination role (`owner` vs `follower`), active schedule (`mode`, `delayMs`, `pollIntervalMs`), and a concise per-account quota & wake-up overview for all discovered Pi accounts.
  - `SettingsList` items allow:
    - Triggering an immediate owner quota refresh (`refresh`) and reloading configuration (`reload`).
    - Toggling schedule `mode` (`reset` / `fixed`) and adjusting `delayMs` and `pollIntervalMs` (with validation against `configSchema`).
    - Per-account wake-up management for each discovered account: toggling wake-up `enabled` / `disabled`, selecting the wake-up `<model-id>` from a submenu of models available for that account's provider (or custom input), and selecting `<window-id>` when the account exposes multiple quota windows.
  - Changes persist atomically to `pi-quota-keeper.json`, request an owner refresh/sync while preserving single-owner constraints ([ADR 0003](../adr/0003-pi-hosted-single-owner-subscription-maintenance.md)), and refresh the panel view in place.
- **`pi-pretty-session` TUI panel (opened via `/pretty-session config`, `/ps config`, or a shortcut key inside `/ps browse`):**
  - Header/status section displays the current session's title, description, summary source (`llm`, `heuristic`, `manual`), manual lock state, context usage, and config file path/error state.
  - `SettingsList` items allow:
    - Toggling boolean settings (`enabled`, `autoSummarize`, `useLlm`, `summarizeOnCompact`, `protectManualName`, `showWidget`, `showStatus`).
    - Cycling `widgetPlacement` (`aboveEditor` / `belowEditor`).
    - Adjusting integer thresholds (`updateEveryTurns`, `updateTokenDelta`, `maxTitleLength`, `maxDescriptionLength`) via presets or an inline `Input` submenu.
    - Selecting or clearing `model` override (`default` or a model from `ctx.modelRegistry`).
    - Executing immediate session actions: `summarize` now, `unlock` manual title lock, and `reload` config from disk.
  - The interactive session browser (`/ps` or `/ps browse`) exposes a keyboard shortcut (shown in its footer hint) to open this settings panel directly.

### C5. Installed-only cross-plugin panel discovery via `pi.events`

When a user opens any plugin's TUI settings panel, the panel must dynamically discover whether other plugins from the collection are loaded in the same Pi session, without displaying uninstalled plugins or importing sibling packages: [U1, U2; ADR 0001, ADR 0004, P1]

- **Runtime event protocol:** Each loaded plugin subscribes on `pi.events` during `session_start` (and unsubscribes on `session_shutdown`) to a lightweight discovery event (for example, `pi-packages:ui:discover`) by invoking a callback or returning its descriptor (`id`, `title`, `command`, `summary`, and an `open(ctx)` handler).
- **Single-plugin behavior:** When only one plugin is installed/loaded in the session, its TUI panel renders cleanly for that plugin alone without dead switcher rows or placeholders for uninstalled plugins.
- **Multi-plugin switching:** When two or more plugins are loaded in the same session, each plugin's TUI settings panel includes a switcher item or submenu listing only the currently loaded plugins, allowing the user to switch directly to another installed plugin's TUI panel.

### C6. Non-TUI fallback, documentation, and verification

- **Non-TUI fallback:** When `ctx.mode !== "tui"` (such as print or non-interactive RPC checks), bare `/<extension>` and `/<extension> config` (with no key/value) must not hang on a TUI prompt; they must output their current status or configuration report via `ctx.ui.notify()`. [U2; P1]
- **Documentation and verification:** Each package's `README.md` must document the unified `/<extension> <action> [other-args]` commands, auto-completion support, and interactive TUI settings panel usage. Each package must pass its own `tsc --noEmit`, `biome check .`, `vitest run`, and standalone Pi smoke check (`node tests/pi-smoke.mjs`). [Project]

## Solution

### Integration Seams

| Seam | Connects | Expects | Provides |
| --- | --- | --- | --- |
| Command registration & completion | Plugin extension → Pi `registerCommand` / `CombinedAutocompleteProvider` | `argumentPrefix` (full string after `/<cmd> `) | `AutocompleteItem[]` whose `value` preserves completed tokens from `<action>` onward |
| Interactive TUI settings panel | Plugin command handler → `ctx.ui.custom()` & `SettingsList` | `ctx.mode === "tui"`, current plugin state, and TypeBox-validated config | Interactive keyboard/mouse configuration, live validation, and atomic JSON persistence |
| Dynamic installed-plugin discovery | Open TUI panel ↔ Loaded plugins via `pi.events` | Active session registrations on `pi.events` | Runtime list of only currently loaded plugin panels and direct panel-to-panel switching |
| Quota owner synchronization | `pi-quota-keeper` TUI panel → `Owner` / `pi-quota-keeper.json` | Validated config mutation or `refresh` action | Atomic config persistence and owner-coordinated state refresh without violating single-owner rules |

## End-to-End Tests

### Autocomplete subcommands and multi-token arguments
- **Given:** Any one of `pi-auto-resume`, `pi-pretty-session`, or `pi-quota-keeper` is loaded in Pi.
- **When:** The user types `/auto-resume `, `/quota enable `, `/quota config mode `, or `/ps config widgetPlacement `.
- **Then:** `getArgumentCompletions` returns matching action or argument suggestions whose `value` preserves the leading subcommand tokens so accepting a completion produces a valid `/<extension> <action> [other-args]` command line. [C2, C3]

### Configure a plugin interactively through its TUI panel
- **Given:** A plugin is loaded in TUI mode and the user runs `/auto-resume`, `/quota`, or `/ps config`.
- **When:** The user toggles a setting or selects a new value in the `SettingsList` panel.
- **Then:** The setting updates immediately in memory, persists atomically to the plugin's JSON file in `getAgentDir()`, and refreshes the plugin's live status/widget without manual JSON editing. [C2, C4]

### Uninstalled plugins never appear
- **Given:** Only one plugin (for example `pi-auto-resume`) is loaded in Pi without `pi-pretty-session` or `pi-quota-keeper`.
- **When:** The user inspects slash commands, completions, or opens the TUI settings panel.
- **Then:** Only `pi-auto-resume`'s commands and settings appear; no uninstalled sibling plugin or placeholder is shown. When a second plugin is also loaded in the same session, both loaded plugins discover each other over `pi.events` and allow switching between their panels. [C1, C5]

### Backward-compatible and canonical quota commands
- **Given:** `pi-quota-keeper` is loaded with discovered accounts.
- **When:** The user runs `/quota status <account-id>`, `/quota details <account-id>`, or legacy `/quota <account-id> details`.
- **Then:** All three resolve the exact account ID and return the expected quota view without breaking existing Spec 0003 workflows. [C2]

## Decisions

- **Choice:** Build per-plugin TUI panels with `@earendil-works/pi-tui` `SettingsList` and `ctx.ui.custom()`, linked at runtime via `pi.events`, rather than injecting into Pi's built-in `/settings`.
- **Reason/source:** Pi 1.5.0 intercepts `/settings` in `InteractiveMode` with a fixed `SettingsSelectorComponent` schema; `SettingsList` via `ctx.ui.custom()` provides the same native TUI experience while `pi.events` enables installed-only cross-plugin discovery without violating [ADR 0001](../adr/0001-independently-installable-pi-packages.md) ([ADR 0004](../adr/0004-unified-command-grammar-and-dynamic-tui-configuration.md), U2).
- **Choice:** Open the interactive TUI surface on bare `/<extension>` in TUI mode (`2A`), retain `/ps` alongside `/pretty-session` with full completion parity (`3`), and normalize commands to `/<extension> <action> [other-args]` while keeping legacy `/quota <account-id> [details]` compatibility.
- **Reason/source:** Confirmed by the user in U2 ([ADR 0004](../adr/0004-unified-command-grammar-and-dynamic-tui-configuration.md)).

## Out of Scope

- Modifying Pi host's built-in `/settings` command implementation.
- Creating a fourth mandatory "manager" package that users must install separately to configure individual plugins.
- Executing production code changes, installing dependencies, or running QA during refinement.