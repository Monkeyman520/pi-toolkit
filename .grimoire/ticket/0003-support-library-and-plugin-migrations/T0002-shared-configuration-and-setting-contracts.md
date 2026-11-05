# Provide shared configuration mechanisms and canonical-setting support

**Ticket ID:** T0002
**Source:** [Spec 0006](../../spec/0006-versioned-support-library-and-plugin-migrations.md) — R3, R4, R2; configuration part of R9; [ADR 0005](../../adr/0005-versioned-plugin-support-library.md).
**Status:** Done

## Goal

Configuration I/O/change tracking and schema-aligned setting support have one reusable implementation with testable consumer-policy boundaries, not a universal plugin manager.

## Affected Surfaces

- Support-library configuration/setting API, contract tests and README examples.
- Baseline policy characterization from the three existing config owners; consumers remain on their existing implementations until their migration ticket.

## Approach

Define common load/change/persist behavior behind a contract simpler than the mechanism. Accept explicit caller targets, schemas, size bounds and policy inputs; expose enough failure information for the R3 policy table. Centralize mechanism rather than copy existing managers into library files or absorb quota scheduling. Keep non-derivable human metadata and dynamic candidates explicit.

## Dependencies and Coordination

- **Blocked by:** T0001: public API/export and distributable host-peer resolution must exist before this shared implementation can be accepted.
- **Blocks:** T0004, T0005 and T0006 need these common configuration/setting guarantees.
- **Coordination:** Shared-library public contracts are owned by T0002/T0003; consumer changes must not invent divergent helper semantics. Serialize shared manifest, lockfile, export, README and integration-fixture writes or integrate isolated changes explicitly. Other tickets may prepare bounded consumer tests before a producer is accepted, but cannot claim migration acceptance without its contract.

## Acceptance

- [ ] Library API documentation distinguishes absent, valid, invalid and unreadable inputs, caller-owned reload state, force/content checks and persistence outcomes.
- [ ] One implementation provides bounded JSON loading/validation integration and temporary-file/rename persistence; per-plugin limits and error policies are not hardcoded.
- [ ] Contract tests demonstrate auto-resume fail-closed, pretty-session keep-safe and quota reject/pause policies through explicit caller policy rather than shared state.
- [ ] Tests cover forced reload and changed content at unchanged mtime where used, repeat-error behavior, deletion/default handling and independent paths/instances.
- [ ] Persistence tests cover validation rejection and I/O failure without false durable success; retain permissions and atomic replacement without claiming new locking/rollback guarantees.
- [ ] Schema-based type classification and canonical metadata consumption support existing completions/panel candidates, aliases and dynamic sources without inventing numeric presets from bounds.
- [ ] Valid non-preset values remain valid; invalid values remain rejected; quota maps are not forced into generic scalar UI settings.
- [ ] Library checks and affected contract tests pass; library imports do not initiate a watcher or discover another plugin.

## Out of Scope

Migrating all consumer files in this ticket; quota ownership/ledger/credential I/O; new global synchronization or changed consumer failure policy.

## Execution Authority

This ticket is a scoped work contract, not implementation or publication authorization. The current refinement writes Markdown only. For execution, pass the source spec, dependency results and user permissions to `grimoire-loop`; do not add requirements or silently change the settled library/ownership boundary.
