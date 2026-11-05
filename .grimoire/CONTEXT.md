# Context

## Concepts

### Pi Agent
- **Definition:** The Pi coding agent host targeted by this repository's plugins. Plugin development follows the package and extension contracts for the relevant host version; this repository is not the host's source tree.
- **Synonyms:** Pi, pi-agent, Pi coding agent

### Pi Plugin Collection
- **Definition:** `pi-packages` is a personally developed and maintained collection of plugins for Pi Agent. Its identity must guide future development rather than inferring another project category from generic directory names or development-tool configuration. Plugins are organized as independently installable packages under `packages/<plugin-name>/`, as recorded in [ADR 0001](./adr/0001-independently-installable-pi-packages.md).
- **Relationships:**
  - depends on Pi Agent
  - contains Pi Plugin Package

### Pi Plugin Package
- **Definition:** An independently installable member of the Pi Plugin Collection, with its own package manifest and README under `packages/<plugin-name>/`. The collection is not a single mandatory all-plugins installation unit. Its development stack and extension layout follow [ADR 0002](./adr/0002-typescript-esm-plugin-development-stack.md), and its command and interactive TUI configuration conventions follow [ADR 0004](./adr/0004-unified-command-grammar-and-dynamic-tui-configuration.md). [ADR 0005](./adr/0005-versioned-plugin-support-library.md) permits an explicitly declared ordinary support-library dependency while preserving independent installation and lifecycle ownership.
- **Relationships:**
  - belongs to Pi Plugin Collection
  - depends on Pi Agent

### Pi Plugin Support Library
- **Definition:** An ordinary versioned dependency providing common mechanisms to Pi Plugin Packages, not an independently activated Pi plugin or collection manager. Consumer plugins own their instances and resource lifecycles; sharing implementation must not share mutable runtime ownership. See [ADR 0005](./adr/0005-versioned-plugin-support-library.md).
- **Synonyms:** Plugin Support Library, Support Library
- **Relationships:**
  - belongs to Pi Plugin Collection
  - references Pi Plugin Package

### Project Language
- **Definition:** English is the language for repository-maintained documentation and written project guidance, including README files, agent guidance, context, architectural decisions, and specifications. This is a human-language convention, not a programming-language selection.

## Architectural Decisions

- [ADR 0001: Independently installable Pi plugin packages](./adr/0001-independently-installable-pi-packages.md) records the per-package installation and dependency isolation boundary under `packages/<plugin-name>/`.
- [ADR 0002: TypeScript ESM plugin development stack](./adr/0002-typescript-esm-plugin-development-stack.md) records the TypeScript erasable-syntax, Node.js, Biome, Vitest, TypeBox, and host peer dependency baseline.
- [ADR 0003: Pi-hosted single-owner subscription maintenance](./adr/0003-pi-hosted-single-owner-subscription-maintenance.md) records the runtime and cross-process coordination constraints for `pi-quota-keeper` (previously `renew-session`).
- [ADR 0004: Unified command grammar and dynamic TUI configuration](./adr/0004-unified-command-grammar-and-dynamic-tui-configuration.md) records the `/<extension> <action> [other-args]` command convention, context-aware argument auto-completion, and installed-only interactive TUI settings panels across collection plugins.

- [ADR 0005: Versioned plugin support library with independent plugin lifecycles](./adr/0005-versioned-plugin-support-library.md) records the ordinary-library dependency boundary and partially supersedes ADR 0004's cross-package code restriction.
