# Provide the common discovery protocol and settings-panel shell

**Ticket ID:** T0003
**Source:** [Spec 0006](../../spec/0006-versioned-support-library-and-plugin-migrations.md) — R5, R6, R2; UI part of R9; [ADR 0005](../../adr/0005-versioned-plugin-support-library.md).
**Status:** Done

## Goal

Consumers can reuse one event-discovery implementation and one common panel shell while supplying domain-specific settings and actions.

## Affected Surfaces

- Support-library discovery types/guards/collection and TUI-shell API, component/interoperability fixtures and README.
- The existing `pi-packages:ui:discover` protocol and valid baseline descriptors; no plugin-to-plugin source import.

## Approach

Preserve the callback/descriptor protocol and expose explicit caller event-bus/context and cleanup ownership. Reuse theme, borders/container, list plumbing and switcher. Demonstrate distinct caller headers/items/actions without a built-in plugin catalog or global registry.

## Dependencies and Coordination

- **Blocked by:** T0001: requires the ordinary package/public exports and verified host TUI module boundary. It does not depend on T0002.
- **Blocks:** T0004, T0005 and T0006 require the discovery and panel-shell APIs for complete migrations.
- **Coordination:** Shared-library public contracts are owned by T0002/T0003; consumer changes must not invent divergent helper semantics. Serialize shared manifest, lockfile, export, README and integration-fixture writes or integrate isolated changes explicitly. Other tickets may prepare bounded consumer tests before a producer is accepted, but cannot claim migration acceptance without its contract.

## Acceptance

- [ ] Public protocol retains the event name, register callback, descriptor fields and valid baseline interoperability; discovery/deduplication semantics are documented.
- [ ] A migrated discovery reader and a baseline protocol fixture interoperate using an event bus; two independently resolved library copies also interoperate.
- [ ] Solo operation has no dead switcher; multiple loaded descriptors can be selected without exposing or activating absent plugins.
- [ ] Registration/cleanup is caller-owned and idempotent; one instance cannot remove another's registrations or depend on singleton module identity.
- [ ] Common theme, container/border, list input/render/search/cancel plumbing and switcher are implemented once; headers, items and actions remain caller supplied.
- [ ] Tests show two panel invocations have independent feedback/rendering state and callbacks target the correct caller.
- [ ] Navigation, cancellation, immediate action, reload/config-change and panel-switch paths are exercised through the provided shell; component evidence is not mislabeled as real terminal evidence.
- [ ] No library import starts lifecycle resources or invokes any plugin's business operation; library checks pass separately.

## Out of Scope

Migrating plugin business state, hardcoding settings catalogs, host `/settings` changes, new command grammar or domain-specific quota/session logic.

## Execution Authority

This ticket is a scoped work contract, not implementation or publication authorization. The current refinement writes Markdown only. For execution, pass the source spec, dependency results and user permissions to `grimoire-loop`; do not add requirements or silently change the settled library/ownership boundary.
