# Establish the ordinary library package and distribution loadability

**Ticket ID:** T0001
**Source:** [Spec 0006](../../spec/0006-versioned-support-library-and-plugin-migrations.md) — R1, R2, R9; A2/A5; [ADR 0005](../../adr/0005-versioned-plugin-support-library.md).
**Status:** Done

## Goal

A versioned ordinary support package can be installed and loaded from a distribution artifact by real Pi outside the checkout, with the required host peers and without plugin activation or an emitted build.

## Affected Surfaces

- The new support-library package under `packages/`: manifest, explicit exports, source distribution, README, TypeScript/Biome/Vitest setup and tests.
- Dependency-delivery/loading fixtures; relevant library navigation in the collection/package references. No plugin behavior migration yet.

## Approach

Establish the package boundary and a representative public-module import using the host packages it actually needs. Choose and document concrete identity/version/source within R1; do not invent an npm publication, registry credential or automatically publish. Validate prepared versioned artifacts rather than a sibling-source link. This independently verifiable enabling ticket serves three actual consumers.

## Dependencies and Coordination

- **Blocked by:** None. This ticket proves the dependency boundary the shared mechanisms and all consumers rely on.
- **Blocks:** T0002 and T0003 require an established ordinary-package/export/host-peer loading boundary.
- **Coordination:** Shared-library public contracts are owned by T0002/T0003; consumer changes must not invent divergent helper semantics. Serialize shared manifest, lockfile, export, README and integration-fixture writes or integrate isolated changes explicitly. Other tickets may prepare bounded consumer tests before a producer is accepted, but cannot claim migration acceptance without its contract.

## Acceptance

- [ ] The library has its own manifest/version/README and source exports, no Pi resource registration/catalog and no dependency on any plugin.
- [ ] Used host SDK packages and `typebox` are `"*"` peers, not runtime duplicates; no required bundler/emitted-build or root workspace installation is introduced.
- [ ] Concrete delivery/preparation steps make the chosen version/source independently resolvable and reproducible; locally prepared distribution artifacts are acceptable evidence, undeclared checkout links are not.
- [ ] A real Pi fixture outside the checkout imports the distributed library through normal package resolution and exercises a representative exported capability with its actual host-peer imports.
- [ ] Importing the library starts no timers, watchers, sockets, plugin discovery registrations or credential/provider work.
- [ ] Library type check, Biome and Vitest pass separately; export/file inclusion and documented Pi loading evidence are recorded.
- [ ] If a proposed source requires publication credentials or the host cannot support source loading under A2, record the specific blocker; do not publish externally or silently introduce compilation.

## Out of Scope

Consumer migration, shared mechanism implementation beyond the loadability fixture, external publication/credentials, changing plugin private/public publication status without need.

## Execution Authority

This ticket is a scoped work contract, not implementation or publication authorization. The current refinement writes Markdown only. For execution, pass the source spec, dependency results and user permissions to `grimoire-loop`; do not add requirements or silently change the settled library/ownership boundary.
