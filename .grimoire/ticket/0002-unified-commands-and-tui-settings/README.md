# Unified Command Grammar, Argument Completion, and Dynamic TUI Settings Panels

**Source:** [Spec 0005: Unified Command Grammar, Argument Completion, and Dynamic TUI Settings Panels](../../spec/0005-unified-commands-and-tui-settings.md), [ADR 0001](../../adr/0001-independently-installable-pi-packages.md), [ADR 0002](../../adr/0002-typescript-esm-plugin-development-stack.md), [ADR 0003](../../adr/0003-pi-hosted-single-owner-subscription-maintenance.md), [ADR 0004](../../adr/0004-unified-command-grammar-and-dynamic-tui-configuration.md).
**Ticket folder:** `.grimoire/ticket/0002-unified-commands-and-tui-settings/`

## Overview

Deliver unified `/<extension> <action> [other-args]` slash-command syntax, context-aware multi-token argument auto-completion (`getArgumentCompletions`), and interactive `SettingsList`-based TUI status and configuration panels across all three independently installable collection plugins (`pi-auto-resume`, `pi-quota-keeper`, and `pi-pretty-session`).

Loaded plugins dynamically discover each other at runtime over Pi's shared `pi.events` bus so users can switch between installed plugin panels in TUI mode, while uninstalled plugins never appear in commands, completions, or TUI panels.

## Shared Runtime Discovery Contract (`pi.events`)

To enable zero-dependency cross-plugin panel switching ([Spec 0005 C5](../../spec/0005-unified-commands-and-tui-settings.md#c5-installed-only-cross-plugin-panel-discovery-via-pievents)), all three packages use the following runtime event contract on `pi.events`:

- **Event name:** `"pi-packages:ui:discover"`
- **Event payload:**
  ```ts
  interface PluginUiDiscoverEvent {
    register(descriptor: {
      id: string;        // e.g. "pi-auto-resume" | "pi-quota-keeper" | "pi-pretty-session"
      title: string;     // Human-readable plugin title
      command: string;   // Canonical slash command, e.g. "/auto-resume"
      getSummary(): string;
      open(ctx: ExtensionContext): Promise<void>;
    }): void;
  }
  ```
- Each plugin registers its `pi.events.on("pi-packages:ui:discover", ...)` listener on `session_start` and removes it via the returned unsubscribe function on `session_shutdown`.
- When opening a TUI settings panel, the active plugin emits `"pi-packages:ui:discover"` to collect descriptors of all plugins currently loaded in the session. If more than one descriptor is returned, the panel renders a switcher item/submenu for jumping to another installed plugin's panel. If only one plugin is loaded, no switcher clutter or uninstalled plugin entry is shown.

## Delivery Surfaces

| Surface | Ownership |
| --- | --- |
| `packages/pi-auto-resume/` manifest (`@earendil-works/pi-tui` peer/dev dependency), command parser/completions, TUI settings panel, tests, README | T0001 |
| `packages/pi-quota-keeper/` manifest (`@earendil-works/pi-tui` peer/dev dependency), command parser/completions, TUI quota & wake-up settings panel, tests, README | T0002 |
| `packages/pi-pretty-session/` command parser/completions (`/pretty-session` and `/ps`), TUI settings panel & browser shortcut, tests, README, root README summary if needed | T0003 |

## Dependencies

No blocking edges exist between T0001, T0002, and T0003 because each package is independently installable under `packages/<plugin-name>/` ([ADR 0001](../../adr/0001-independently-installable-pi-packages.md)) and shares only the self-contained `pi.events` runtime discovery contract documented above.

## Coordination

| Tickets | Risk | Strategy |
| --- | --- | --- |
| T0001, T0002, T0003 | Drift in `pi.events` discovery payload or multi-token completion prefix handling | Follow the exact `"pi-packages:ui:discover"` payload and full-`argumentPrefix` replacement invariant defined in Spec 0005 C3 and C5; verify both standalone isolation and multi-plugin discovery in tests |
| T0001, T0002 | Adding `@earendil-works/pi-tui` to `package.json` | Keep `"@earendil-works/pi-tui": "*"` in `peerDependencies` and `"1.5.0"` in `devDependencies` per ADR 0002; update local lockfile cleanly |
| T0002 | Preserving Spec 0003 single-owner and backward-compatible command guarantees | Route TUI panel refreshes and config writes through `executeQuotaConfigCommand` and `owner.requestRefresh`; keep `/quota <account-id> [details]` working alongside `/quota status <account-id>` and `/quota details <account-id>` |

## Recommended Order

1. T0001, T0002, and T0003 may proceed in parallel in isolated package directories, or sequentially starting with **T0001** (`pi-auto-resume`), then **T0002** (`pi-quota-keeper`), then **T0003** (`pi-pretty-session`).
2. Each ticket must run its package's `npm run typecheck`, `npm run check`, `npm test`, and `npm run smoke`.

## Requirement Coverage

| Requirement | Ticket(s) |
| --- | --- |
| C1 Independent package boundaries & installed-only visibility | T0001, T0002, T0003 |
| C2 Unified command grammar (`/<extension> <action> [other-args]`) | T0001 (`/auto-resume`), T0002 (`/quota`), T0003 (`/pretty-session` and `/ps`) |
| C3 Multi-token argument auto-completion (`getArgumentCompletions`) | T0001, T0002, T0003 |
| C4 Per-plugin interactive TUI status and settings panels | T0001, T0002, T0003 |
| C5 Installed-only cross-plugin panel discovery via `pi.events` | T0001, T0002, T0003 |
| C6 Non-TUI fallback, documentation, and verification | T0001, T0002, T0003 |

## Ticket Index

| Ticket | File | Outcome |
| --- | --- | --- |
| T0001 | [T0001-auto-resume-commands-and-tui.md](./T0001-auto-resume-commands-and-tui.md) | Unified `/auto-resume` commands, argument auto-completion, and interactive TUI status/settings panel |
| T0002 | [T0002-quota-keeper-commands-and-tui.md](./T0002-quota-keeper-commands-and-tui.md) | Unified `/quota` commands, dynamic account/model/config auto-completion, and interactive TUI quota/wake-up settings panel |
| T0003 | [T0003-pretty-session-commands-and-tui.md](./T0003-pretty-session-commands-and-tui.md) | Unified `/pretty-session` (`/ps`) commands, argument auto-completion, and interactive TUI settings panel integrated with the session browser |

## Verification handoff (2026-04-20)

Plan: `.grimoire/plans/0002-unified-commands-and-tui-settings.md` (local; ignored by the Grimoire Git policy).

| Package | typecheck | Biome | Vitest | Pi RPC smoke |
| --- | --- | --- | --- | --- |
| pi-auto-resume | pass | pass | 22 passed | PASS |
| pi-quota-keeper | pass | pass | 175 passed | PASS |
| pi-pretty-session | pass | pass | 17 passed | PASS |

Covered by automated evidence: command parsing (including legacy `/quota <id> [details]` and `/ps info`), multi-token completion values preserving leading tokens, panel rendering via mocked `ctx.ui.custom()`, standalone panels omitting uninstalled plugins, switcher appearing when a second plugin registers on `pi.events`, and unchanged existing RPC behavior.

**Needs verification (human):** interactive keyboard use of each TUI panel in a real Pi TUI session, Tab/autocomplete popups in the real editor, and panel switching with two or three plugins loaded together. Ticket and spec statuses are left unchanged until that evidence exists; ADR 0004 is Testing.
