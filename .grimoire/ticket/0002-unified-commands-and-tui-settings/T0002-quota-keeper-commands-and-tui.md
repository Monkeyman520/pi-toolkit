# Unified /quota commands, dynamic argument completion, and TUI settings panel

**Ticket ID:** T0002
**Source:** [Spec 0005](../../spec/0005-unified-commands-and-tui-settings.md) (C1-C6); [Spec 0003](../../spec/0003-pi-quota-keeper.md); [ADR 0003](../../adr/0003-pi-hosted-single-owner-subscription-maintenance.md); [ADR 0004](../../adr/0004-unified-command-grammar-and-dynamic-tui-configuration.md).
**Status:** Done

## Goal

Equip `pi-quota-keeper` with the unified `/quota <action> [other-args]` command surface (while preserving legacy account-lookup compatibility), dynamic multi-token argument auto-completion for actions, accounts, models, windows, and config keys, and an interactive `SettingsList`-based TUI quota overview and wake-up configuration panel.

## Affected Surfaces

- `packages/pi-quota-keeper/package.json` (declare `"@earendil-works/pi-tui": "*"` in `peerDependencies` and `"1.5.0"` in `devDependencies`).
- `packages/pi-quota-keeper/extensions/` (`index.ts`, `commands.ts`, `coordination.ts`, and TUI panel module).
- `packages/pi-quota-keeper/tests/` and `packages/pi-quota-keeper/README.md`.

## Approach

- Update `parseQuotaArgs` and `quotaUsage` in `commands.ts` to support canonical `/quota <action> [other-args]`:
  - `status [account-id]` (alias `view`), `details [account-id]`, `list`, `refresh`, `enable <account-id> <model-id> [window-id]`, `disable <account-id>`, `config [reload | mode | delayMs | pollIntervalMs] [value]`, and `help`.
  - Keep backward compatibility for `/quota <account-id> [details]` so existing Spec 0003 U10 callers and tests continue to work.
- Implement `getArgumentCompletions(argumentPrefix)` on `/quota`:
  - First token suggests `status`, `details`, `list`, `refresh`, `enable`, `disable`, `config`, `help`.
  - `status ` and `details ` suggest known `<account-id>` values from cached/in-memory state (`state.snapshots`).
  - `enable ` suggests known `<account-id>` values at token 2, provider-matching `<model-id>` values from `ctx.modelRegistry` / configured models at token 3, and account `<window-id>` values at token 4.
  - `disable ` suggests enabled `<account-id>` values from `config.enabledAccounts` (or known accounts).
  - `config ` suggests `reload`, `mode`, `delayMs`, `pollIntervalMs` at token 2, and `reset`/`fixed` or millisecond presets at token 3.
  - Ensure all multi-token `AutocompleteItem.value` strings preserve the leading action and completed arguments.
- Build an interactive TUI panel using `ctx.ui.custom()`, `SettingsList`, `SelectList`, `Input`, `getSettingsListTheme()`, and `DynamicBorder`:
  - Open on bare `/quota` or `/quota config` (with no key/value) when `ctx.mode === "tui"`, falling back to text notifications when `ctx.mode !== "tui"`.
  - Render live maintenance role (`owner`/`follower`), schedule summary, and per-account quota windows/credits/wake-up status in the panel header.
  - Provide interactive items to trigger owner `refresh`, toggle `mode` (`reset`/`fixed`), edit `delayMs` and `pollIntervalMs`, and configure per-account wake-ups (`enable`/`disable`, selecting `<model-id>` and optional `<window-id>` via submenu) for discovered accounts.
  - Persist config updates atomically to `pi-quota-keeper.json` and request owner synchronization without violating [ADR 0003](../../adr/0003-pi-hosted-single-owner-subscription-maintenance.md).
- Participate in `"pi-packages:ui:discover"` on `pi.events` so only loaded plugins appear in cross-plugin panel switching.

## Dependencies and Coordination

- **Blocked by:** None.
- **Blocks:** None.
- **Coordination risks:** Preserve all Spec 0003 single-owner, truthfulness, and U10/U11 invariants; follow the shared `"pi-packages:ui:discover"` contract.

## Acceptance

- [ ] `packages/pi-quota-keeper/package.json` declares `"@earendil-works/pi-tui": "*"` in `peerDependencies`.
- [ ] `/quota` supports canonical `status [account-id]`, `details [account-id]`, `list`, `refresh`, `enable <account-id> <model-id> [window-id]`, `disable <account-id>`, `config [reload | <key> [value]]`, and `help`, while keeping legacy `/quota <account-id> [details]` working.
- [ ] `getArgumentCompletions` suggests actions, discovered `<account-id>`s, provider `<model-id>`s, `<window-id>`s, and `config` keys/values with full-prefix `item.value` replacement strings.
- [ ] Bare `/quota` and `/quota config` open the interactive TUI quota & settings panel in TUI mode and fall back to text notifications in non-TUI mode.
- [ ] Updating global schedule settings or per-account wake-ups in the TUI panel writes `pi-quota-keeper.json`, synchronizes through the owner when available, and updates the displayed state.
- [ ] Only installed/loaded plugins appear in the TUI panel; uninstalled plugins are never shown.
- [ ] `npm run typecheck`, `npm run check`, `npm test`, and `npm run smoke` pass in `packages/pi-quota-keeper/`, and `README.md` is updated.

## Out of Scope

- Harvested external credentials, fabricated quota numbers, or multi-owner polling.