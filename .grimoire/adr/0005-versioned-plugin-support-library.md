# Versioned plugin support library with independent plugin lifecycles

**Status:** Completed
**Date:** 2026-11-04
**Supersedes:** [ADR 0004](./0004-unified-command-grammar-and-dynamic-tui-configuration.md), only its blanket prohibition on cross-package code dependencies; its command, UI, event-discovery, and installed-only visibility decisions remain in force.

## Context

The first structural improvement pass, committed as `a598454`, centralized package-local settings metadata and strengthened isolation verification. It did not remove common configuration-file mechanisms, UI discovery implementations, or settings-panel scaffolding across the three plugins.

The user subsequently selected option A: plugins may depend on an ordinary versioned support library, rather than maintain synchronized source copies inside every plugin. Independent installation and independent lifecycle ownership remain binding under [ADR 0001](./0001-independently-installable-pi-packages.md). [ADR 0002](./0002-typescript-esm-plugin-development-stack.md) and [ADR 0003](./0003-pi-hosted-single-owner-subscription-maintenance.md) remain applicable.

## Decision

- Introduce an ordinary versioned support-library package for common plugin mechanisms. It is a dependency, not a fourth Pi plugin, collection loader, or mandatory separately activated manager.
- Each consuming plugin explicitly declares and distributes access to its required library dependency. Installed packages must not rely on undeclared sibling source, repository-relative links, or an incidental shared dependency instance.
- Reuse implementation without sharing ownership of mutable runtime state. Library classes or factories may create plugin-owned instances; the library must not establish a process-wide configuration manager, registry, scheduler, cancellation controller, or automatic background service.
- Each plugin continues to own its configuration schema/defaults and failure policy, runtime state, resource startup/cleanup, commands, business actions, and timers. Quota owner election and the activation ledger remain quota-keeper responsibilities.
- Cross-plugin panel discovery continues over `pi.events` and includes only currently loaded plugins. Sharing its protocol implementation does not introduce direct plugin-to-plugin imports or require a single physical library instance.
- Common configuration mechanisms and TUI scaffolding may be reused, but must preserve the consumers' distinct behavior rather than impose a universal policy.
- The library follows the repository's TypeScript ESM, erasable syntax, Node.js baseline, no-required-bundler/no-emitted-build, and host-provided peer dependency constraints.

## Consequences

- Common mechanism fixes can be maintained in one implementation rather than synchronized manually across plugins.
- Dependency delivery, version compatibility, and clean-environment Pi loading become explicit verification obligations.
- Compatible library copies must communicate through the preserved discovery protocol rather than shared module identity.
- Removing or stopping one plugin must neither stop another plugin's resources nor remove its event registrations.
- The rejected alternative was a canonical source synchronized into independent plugin-local copies: it preserves self-contained artifacts but retains distributed code copies and synchronization obligations.
- The concrete package name, initial version, compatible dependency ranges, and registry/source are not selected by this ADR. Their implementation must satisfy explicit, independently resolvable dependency delivery; this decision does not authorize external publication or credential setup.

The architectural choice is confirmed by the user. Status is Proposed because support-library implementation and consumer migrations have not started.


**Implementation evidence (2026-11-04):** The ordinary source-only support package and all three consumer migrations are realized. [Ticket set 0003](../ticket/0003-support-library-and-plugin-migrations/README.md#integrated-execution-evidence--2026-11-04) records 267 passing tests, all package checks, actual outside-checkout plugin-tarball/library Pi loading, separate library copies with baseline protocol interoperability, seven combinations, real terminal actions and lifecycle cleanup. External publication and live-service/physical sleep/other-platform claims are excluded. The earlier Proposed-status sentence describes recording time, not current implementation progress.
