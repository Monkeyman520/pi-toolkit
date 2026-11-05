# Migrate auto-resume without changing recovery or session ownership

**Ticket ID:** T0004
**Source:** [Spec 0006](../../spec/0006-versioned-support-library-and-plugin-migrations.md) — R8/auto-resume; R1–R6; applicable R9; [ADR 0005](../../adr/0005-versioned-plugin-support-library.md).
**Status:** Done

## Goal

An independently installed auto-resume uses the common configuration/discovery/panel mechanisms without changing recovery decisions or session-local controls.

## Affected Surfaces

- `packages/pi-auto-resume/package.json`, lockfile, README and dependency preparation.
- `extensions/config.ts`, `commands.ts`, `ui.ts`, `index.ts` and affected `recovery.ts` interactions.
- Package configuration-candidate, lifecycle and recovery tests; standalone Pi smoke.

## Approach

Use the shared APIs with the existing schema/defaults and fail-closed policy. Supply domain-specific header/items/actions to the panel shell and register discovery within the session. Keep Recovery and retry timing local; remove replaced private I/O/protocol/shell implementations.

## Dependencies and Coordination

- **Blocked by:** T0002 and T0003: both shared contracts are required to implement and verify this complete consumer migration.
- **Blocks:** T0007 requires the migrated auto-resume artifact and package-level evidence.
- **Coordination:** Shared-library public contracts are owned by T0002/T0003; consumer changes must not invent divergent helper semantics. Serialize shared manifest, lockfile, export, README and integration-fixture writes or integrate isolated changes explicitly. Other tickets may prepare bounded consumer tests before a producer is accepted, but cannot claim migration acceptance without its contract.

## Acceptance

- [ ] The declared ordinary library dependency resolves outside the checkout without installing or activating either sibling plugin; documented local setup does not assume Pi installs local dependencies.
- [ ] Configuration remains `pi-auto-resume.json`, with the 1 MiB bound, existing schema/defaults, partial persistence, reload behavior, errors and fail-closed disabling.
- [ ] Session-only on/off does not become a persisted global toggle; explicit config/panel saves retain their current behavior.
- [ ] Completion keys, candidate order, aliases, full-prefix replacement and valid non-preset settings remain compatible through canonical definitions.
- [ ] Panel toggles, stop and reload update only this instance's Recovery/config/status and preserve existing feedback/navigation/non-TUI fallback.
- [ ] The session-owned discovery listener and terminal-input/timer resources do not accumulate on repeated start and are removed without stopping another instance.
- [ ] Pending continuation cancellation, eligibility, reset/delay/attempt bounds and no continuation of idle/completed work remain covered.
- [ ] Replaced private configuration mechanics, discovery definitions and common panel shell are removed; retained adapters contain domain policy rather than relocated duplicate mechanisms.
- [ ] Package type check, Biome, Vitest and isolated real Pi smoke pass with the distributed library dependency.

## Out of Scope

New recovery policy, provider polling, quota activation, changes to other plugins' implementation or shared runtime state.

## Execution Authority

This ticket is a scoped work contract, not implementation or publication authorization. The current refinement writes Markdown only. For execution, pass the source spec, dependency results and user permissions to `grimoire-loop`; do not add requirements or silently change the settled library/ownership boundary.
