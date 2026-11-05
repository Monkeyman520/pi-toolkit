# Migrate pretty-session and concentrate session/summary ownership

**Ticket ID:** T0005
**Source:** [Spec 0006](../../spec/0006-versioned-support-library-and-plugin-migrations.md) — R7; R8/pretty-session; R1–R6; applicable R9; [ADR 0005](../../adr/0005-versioned-plugin-support-library.md).
**Status:** Done

## Goal

An independently installed pretty-session uses shared mechanisms and a cohesive package-local owner for metadata and summary-task lifecycle/writeback.

## Affected Surfaces

- `packages/pi-pretty-session/package.json`, lockfile, README and dependency preparation.
- `extensions/index.ts`, `config.ts`, `commands.ts`, `ui.ts`, and the package-local state owner; relevant `summarizer.ts`, `project.ts`, `browser.ts`, `display.ts` consumers.
- Package config/candidate/display/summary/lifecycle tests and standalone Pi smoke.

## Approach

Migrate common mechanisms and move cohesive metadata reconstruction/persistence, summary cancellation/result acceptance and required session/project identity behind one local owner. Let the entry point adapt host events and commands. Choose a class/function/file shape only when it actually concentrates invariants; do not move this domain into the support library.

## Dependencies and Coordination

- **Blocked by:** T0002 and T0003: require configuration/setting and panel/discovery contracts. No dependency on T0004 or T0006.
- **Blocks:** T0007 requires the migrated pretty-session artifact, ownership evidence and package checks.
- **Coordination:** Shared-library public contracts are owned by T0002/T0003; consumer changes must not invent divergent helper semantics. Serialize shared manifest, lockfile, export, README and integration-fixture writes or integrate isolated changes explicitly. Other tickets may prepare bounded consumer tests before a producer is accepted, but cannot claim migration acceptance without its contract.

## Acceptance

- [ ] The ordinary dependency resolves with only this plugin installed outside the checkout; both `/ps` and `/pretty-session` remain registered and equivalent.
- [ ] Configuration retains the 1 MiB bound, previous-safe behavior on invalid input, defaults on missing reload, partial persistence, aliases and model-default clearing.
- [ ] Commands/completions, browser actions, project/metrics display, widget behavior and schema/preset acceptance remain compatible using canonical definitions/shared shell.
- [ ] A cohesive local owner is the authority for metadata reconstruction/persistence, summary cancellation and acceptance of results for the current session; the entry no longer maintains competing versions of that state/sequencing.
- [ ] Manual-title protection, explicit summarize override, trigger/fallback/timeout behavior, native-name feedback suppression and metadata-entry format remain unchanged.
- [ ] Late results after cancellation, supersession, tree navigation, replacement, shutdown or existing manual-action cancellation cannot append metadata, rename the active session or replace active-session associated state.
- [ ] Another plugin or pretty-session instance retains its own state/resources; repeated session start/shutdown does not leak timers/listeners/controllers.
- [ ] Actual consumers call the owner; obsolete parallel state/writeback paths and duplicate shared-mechanism code are removed. File-size reduction or a forwarding facade alone is insufficient.
- [ ] Package type check, Biome, Vitest and isolated real Pi smoke pass; ownership/writeback tests and public UI/command outcomes are recorded.

## Out of Scope

A universal session-state framework, new metadata formats or summary features, changed manual-lock policy, moving pretty-session domain logic into the library.

## Execution Authority

This ticket is a scoped work contract, not implementation or publication authorization. The current refinement writes Markdown only. For execution, pass the source spec, dependency results and user permissions to `grimoire-loop`; do not add requirements or silently change the settled library/ownership boundary.
