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
- **Definition:** An independently installable member of the Pi Plugin Collection, with its own package manifest and README under `packages/<plugin-name>/`. The collection is not a single mandatory all-plugins installation unit. Its target development stack (Bun workspace, TypeScript ESM, Biome, Rolldown bundling, `bun test`) is recorded in [ADR 0008](./adr/0008-bun-workspace-rolldown-and-bun-test-stack.md) (superseding [ADR 0002](./adr/0002-typescript-esm-plugin-development-stack.md)), its public `@monkeyman520/*` npm/GitHub release contract is recorded in [ADR 0009](./adr/0009-public-npm-trusted-publishing-and-stable-tag-releases.md), and its command and interactive TUI configuration conventions follow [ADR 0004](./adr/0004-unified-command-grammar-and-dynamic-tui-configuration.md). [ADR 0005](./adr/0005-versioned-plugin-support-library.md) and ADR 0008 govern reuse of the private support library while preserving independent installation and lifecycle ownership.
- **Relationships:**
  - belongs to Pi Plugin Collection
  - depends on Pi Agent

### Pi Plugin Support Library
- **Definition:** A permanently private internal workspace library providing common mechanisms to Pi Plugin Packages, not an independently activated Pi plugin, public npm package, or collection manager. Consumer plugins inline its code at build time via Rolldown (replacing the earlier `vendor/*.tgz` bundled-dependency mechanism under [ADR 0008](./adr/0008-bun-workspace-rolldown-and-bun-test-stack.md)) and continue to own their instances and resource lifecycles without sharing mutable runtime ownership. See [ADR 0005](./adr/0005-versioned-plugin-support-library.md) and [ADR 0008](./adr/0008-bun-workspace-rolldown-and-bun-test-stack.md).
- **Synonyms:** Plugin Support Library, Support Library
- **Relationships:**
  - belongs to Pi Plugin Collection
  - references Pi Plugin Package

### Adaptive Context Orchestrator
- **Definition:** The experimental task-aware Pi context-management capability under development in this collection. It treats model-visible context as a recoverable working set, selecting interventions using task needs, context dependencies/value, and projected pressure rather than occupancy watermarks alone. Its staged delivery and memory-isolation boundaries are recorded in [ADR 0006](./adr/0006-task-aware-context-working-set-and-isolation.md). The [pi-context-aco](../packages/pi-context-aco/README.md) package currently provides V1 passive monitoring/task references/recommendations, V2 scoped evidence/verified exact pruning/restoration and T0005's V3 bounded extractive/local and native-prefix compaction. V1 remains observation-only; V3 requires confirmation or scoped explicit automation plus independent recovery/dependency/structure/budget checks. T0006 adds confirmation/scoped-authorized single-request independent children, bounded aggregate admission, necessary scoped evidence, staged deliverables and explicit parent reconciliation; T0007 adds opt-in command-only guarded adaptive composition and controlled Pi comparison evidence; T0007/T0008 complete the bounded V5 representative comparison, task-fit/forecast assessment and integrated host coverage. Negative coding trials and unknown costs remain retained; acceptance is not a proof of performance superiority or optimal weights.
- **Synonyms:** ACO

- **Maturity:** Experimental; pending optimization and broader real-task/provider/platform testing. Completed staged acceptance is not stable-release approval. Prefer observation-first controlled evaluation; do not default to adaptive intervention, infer savings from isolated totals, or relax authorization/recovery/dependency/message/budget guards to obtain a successful action.
- **Relationships:**
  - depends on Pi Agent
  - references Context Working Set

### Context Working Set
- **Definition:** The information currently presented to the model for the active task, distinct from preserved raw session history and externally stored evidence. Unloading information from this set does not authorize destruction of the original evidence. Historical recovery and reacquiring current workspace facts are distinct operations.
- **Relationships:**
  - belongs to Adaptive Context Orchestrator

### Session Explorer State Tiers
- **Definition:** The 3-tier state architecture for session tree exploration: Global Config (base defaults), Session View State (per-session explicit user overrides, manual expansion overrides, and last selection, avoiding full snapshot pollution), and Runtime State (in-memory tracking of activeLeafId from SessionManager, selectedNodeId, and previewNodeId).
- **Relationships:**
  - belongs to Pi Plugin Package
  - references Pi Agent

### Tool Call Aggregation
- **Definition:** Virtual projection-level clustering of consecutive tool invocations and results into collapsible summaries (e.g. `[Tools ×N] names...`) in the session outline without altering raw session entry topology or addressing.
- **Relationships:**
  - belongs to Pi Plugin Package

### Branch Tip Navigation and History
- **Definition:** Safe routing from any subtree or historical node to its reachable branch tip(s) with multi-fork resolution, paired with an in-memory session navigation stack supporting deterministic restoration (`Restore Previous`) of prior active session leaves.
- **Relationships:**
  - belongs to Pi Plugin Package
  - references Pi Agent
### Project Language
- **Definition:** English is the language for repository-maintained documentation and written project guidance, including README files, agent guidance, context, architectural decisions, and specifications. This is a human-language convention, not a programming-language selection.

## Architectural Decisions

- [ADR 0001: Independently installable Pi plugin packages](./adr/0001-independently-installable-pi-packages.md) records the per-package installation and dependency isolation boundary under `packages/<plugin-name>/`.
- [ADR 0002: TypeScript ESM plugin development stack](./adr/0002-typescript-esm-plugin-development-stack.md) *(Superseded by ADR 0008)* records the original package-local npm, Vitest, and no-bundler baseline.
- [ADR 0003: Pi-hosted single-owner subscription maintenance](./adr/0003-pi-hosted-single-owner-subscription-maintenance.md) records the runtime and cross-process coordination constraints for `pi-quota-keeper` (previously `renew-session`).
- [ADR 0004: Unified command grammar and dynamic TUI configuration](./adr/0004-unified-command-grammar-and-dynamic-tui-configuration.md) records the `/<extension> <action> [other-args]` command convention, context-aware argument auto-completion, and installed-only interactive TUI settings panels across collection plugins.

- [ADR 0005: Versioned plugin support library with independent plugin lifecycles](./adr/0005-versioned-plugin-support-library.md) records the ordinary-library dependency boundary and partially supersedes ADR 0004's cross-package code restriction.

- [ADR 0006: Task-aware context working set and isolation](./adr/0006-task-aware-context-working-set-and-isolation.md) records ACO's task-dependent working-set model, observation-only first delivery, recovery-gated later exact offloading/pruning, and project/task-session-lineage memory isolation.

- [ADR 0007: Interactive session explorer navigation, state tiers, and inspection](./adr/0007-interactive-session-explorer-navigation-and-state.md) records the decoupled navigation vs. preview model, 3-tier view state architecture, projection-level tool aggregation, and branch tip restoration stack for `pi-session-tree-explorer`.

- [ADR 0008: Bun workspace, Rolldown bundling, and bun test stack](./adr/0008-bun-workspace-rolldown-and-bun-test-stack.md) records the migration to a private root Bun workspace, shared Biome/TypeScript configuration, Rolldown ESM bundling with inlined `pi-plugin-support`, and `bun test` (superseding ADR 0002 and partially superseding ADR 0005's distribution mechanism).

- [ADR 0009: Public npm Trusted Publishing and stable tag-triggered releases](./adr/0009-public-npm-trusted-publishing-and-stable-tag-releases.md) records the `@monkeyman520/*` MIT public release catalog (initially 5 plugins, configurable exclusion of `pi-context-aco`, permanent exclusion of `pi-plugin-support`), unified `vX.Y.Z` tag-triggered OIDC npm publication (`latest` dist-tag verification + root `CHANGELOG.md` for native Pi update checks) + GitHub Release (`make_latest: true`) pipeline with idempotent retry, and PR/`main` CI checks.
