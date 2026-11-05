# Migrate quota-keeper while preserving single-owner maintenance

**Ticket ID:** T0006
**Source:** [Spec 0006](../../spec/0006-versioned-support-library-and-plugin-migrations.md) — R8/quota-keeper; R1–R6; A3 and applicable R9; [ADR 0005](../../adr/0005-versioned-plugin-support-library.md).
**Status:** Done

## Goal

An independently installed quota-keeper reuses common config/discovery/panel mechanics without weakening ownership, credential or activation-ledger boundaries.

## Affected Surfaces

- `packages/pi-quota-keeper/package.json`, lockfile, README and dependency preparation.
- `extensions/coordination.ts` configuration portion, `commands.ts`, `ui.ts`, `index.ts`; owner/schedule/accounts/wakeups callers as compatibility surfaces.
- Package config/candidate/coordination/lifecycle tests and two-process standalone Pi smoke.

## Approach

Use shared configuration-file mechanics, canonical scalar setting metadata and the common discovery/panel shell. Retain account enable/disable/model/window operations and config application in the quota domain. Do not make the support library responsible for State, Owner, credential resolution or wake-up scheduling.

## Dependencies and Coordination

- **Blocked by:** T0002 and T0003: require both shared mechanism contracts. No dependency on T0004 or T0005.
- **Blocks:** T0007 requires the migrated quota artifact and single-owner evidence.
- **Coordination:** Shared-library public contracts are owned by T0002/T0003; consumer changes must not invent divergent helper semantics. Serialize shared manifest, lockfile, export, README and integration-fixture writes or integrate isolated changes explicitly. Other tickets may prepare bounded consumer tests before a producer is accepted, but cannot claim migration acceptance without its contract.

## Acceptance

- [ ] The plugin installs outside the checkout with only its declared ordinary dependencies; no sibling activation and no hidden shared dependency root are required.
- [ ] The 2 MiB config bound, defaults/independent account maps, invalid-read rejection/maintenance pause and existing config-command behavior remain intact.
- [ ] Account/model/window configuration is still domain-owned; cached panel display after failure does not resume maintenance or overwrite corrupt state.
- [ ] Owner-forwarded refresh, config application and existing polling cadence are retained; generic config reuse adds no watcher or extra poller.
- [ ] Exactly one OS owner performs fixture quota maintenance per shared directory; follower refresh and crash/exit takeover preserve existing behavior.
- [ ] Intent-before-side-effect, corrupt-ledger refusal, no replay, account-pinned requests, secret-free snapshots and unchanged foreground transcript remain covered.
- [ ] Panel config/account selection/refresh/reload, canonical/legacy quota commands and dynamic account/provider/model/window completions retain current behavior.
- [ ] Private configuration-file/protocol/common-shell duplicates are removed without moving Owner, state/ledger or credential responsibilities into the library.
- [ ] Package type check, Biome, Vitest and isolated two-process real Pi smoke pass with the distributed dependency; shutdown aborts work before owner release.

## Out of Scope

New quota policies/providers, changes to coordination scope or ledger formats, generic cross-plugin scheduler, live credential or activation requests.

## Execution Authority

This ticket is a scoped work contract, not implementation or publication authorization. The current refinement writes Markdown only. For execution, pass the source spec, dependency results and user permissions to `grimoire-loop`; do not add requirements or silently change the settled library/ownership boundary.
