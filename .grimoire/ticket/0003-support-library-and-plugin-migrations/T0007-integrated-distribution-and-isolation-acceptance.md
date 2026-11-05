# Verify combined distributions, compatibility and structural outcomes

**Ticket ID:** T0007
**Source:** [Spec 0006](../../spec/0006-versioned-support-library-and-plugin-migrations.md) — R9 and integrated R1–R8 acceptance; E1–E6; [ADR 0005](../../adr/0005-versioned-plugin-support-library.md).
**Status:** Done

## Goal

The combined result demonstrates actual reuse and independent installation/lifecycle behavior, rather than isolated unit-test success or claims based on checkout imports.

## Affected Surfaces

- `tests/plugin-isolation.mjs`, distributed-library/consumer installation fixtures, real TUI interaction evidence and affected package tests.
- Collection/package/library READMEs and final integration evidence; final inspection of all migrated runtime consumers.

## Approach

Exercise versioned artifacts outside the checkout using documented dependency preparation. Extend the existing matrix for the new dependency layout and mixed baseline/migrated protocol fixtures, then inspect actual mechanism implementations and state ownership. Report unavailable environment/live evidence honestly; do not turn this ticket into new product features.

## Dependencies and Coordination

- **Blocked by:** T0004, T0005 and T0006: all three consumer artifacts must exist for full combined acceptance. Earlier producer/migration evidence may be reused only while applicable.
- **Blocks:** None; this is integrated acceptance of the scoped migration set.
- **Coordination:** Shared-library public contracts are owned by T0002/T0003; consumer changes must not invent divergent helper semantics. Serialize shared manifest, lockfile, export, README and integration-fixture writes or integrate isolated changes explicitly. Other tickets may prepare bounded consumer tests before a producer is accepted, but cannot claim migration acceptance without its contract.

## Acceptance

- [ ] The library and all three packages pass their own type, Biome and Vitest checks on the combined tree; separate standalone real Pi smoke checks pass.
- [ ] Clean isolated installation/load tests use selected plugin artifacts plus only declared dependencies; local-package dependency preparation is explicit and not an undeclared sibling/root link.
- [ ] All seven nonempty plugin combinations expose exactly their expected commands/descriptors and survive repeated session replacement/shutdown without accumulated or cross-removed resources.
- [ ] A valid baseline protocol fixture interoperates with migrated discovery; independently resolved compatible library copies do not rely on singleton identity.
- [ ] Configuration edits/reload, immediate actions, navigation/cancel and switching between loaded panels are exercised at the real TUI boundary; distinguish automated/manual interaction from component rendering and retain any evidence gap.
- [ ] Tests demonstrate each R3 policy, non-preset acceptance/schema rejection, session-local recovery cancellation, pretty-session obsolete-result rejection and quota two-process takeover/no-replay.
- [ ] Source inspection finds one implementation of common config mechanisms, discovery and shell; canonical metadata is consumed and the pretty-session owner actually governs its invariants. Document any retained private helper with its domain-specific reason.
- [ ] Manifests/exports/distribution contents and used host peer mapping match documentation; no mandatory emitted build, root workspace or manager plugin was introduced.
- [ ] Final evidence maps R1–R9/E1–E6 to commands/results or explicit gaps, states host/OS versions, and makes no live-provider, sleep/wake, other-platform or performance claim without evidence.

## Out of Scope

External publication, unapproved live services, incidental repository cleanup, new feature behavior, marking unavailable interaction/platform evidence as passed.

## Execution Authority

This ticket is a scoped work contract, not implementation or publication authorization. The current refinement writes Markdown only. For execution, pass the source spec, dependency results and user permissions to `grimoire-loop`; do not add requirements or silently change the settled library/ownership boundary.
