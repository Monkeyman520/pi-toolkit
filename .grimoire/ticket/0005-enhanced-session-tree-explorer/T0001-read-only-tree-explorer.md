# Open a read-only Explorer with correct tree navigation

**Ticket ID:** T0001
**Source:** [Spec 0008](../../spec/0008-enhanced-session-tree-explorer.md) (R01-R04; baseline R11, R13-R15; E01); sources U1/U2/U3 and repository/host contracts as cited there
**Status:** Done

## Goal

An independently loadable /stree opens and closes on the current session and navigates real topology without changing history or Session Leaf.

## Affected Surfaces

New package manifest/lockfile/development checks, extensions/index.ts, readonly Pi adapter, raw TreeIndex/depths, state, initial projection, Action registry, initial custom TUI, fixtures and package README.

## Approach

Deliver package setup with its first real consumer, not an empty scaffold ticket. Read the installed host API and official package/extension/TUI references before implementation. Index every Raw Entry type with original order and bounded malformed-data handling. Establish real/virtual ID and session-intent boundaries for later consumers. Provide direct Action-level verification for the complete node/branch inventory; minimal initial bindings expose j/k, H/L, ]b/[b, gp/gb/ge and close. Later T0002 supplies full mode-aware multi-key parsing; do not duplicate navigation algorithms there.

## Dependencies and Coordination

- **Blocked by:** None; first runnable slice.
- **Blocks:** T0002, T0003, T0005, T0006, and integrated acceptance T0008.
- **Coordination risks:** Publish stable snapshot/revision, real-versus-virtual selection, Action and ContextMetrics consumption seams from the Spec. Later features may use contract fixtures, not imports from another plugin. T0002 extends projection/input; T0005 alone owns Navigate/Fork effects; T0006 consumes the same read-only snapshots.

## Acceptance

- [x] Package independently discovers only its own extension through Pi; TypeScript ESM/erasable syntax, Node >=22.19.0 and host '*' peers match R01. No required emitted build or undeclared sibling import.
- [x] Actual Pi /stree opening/closing and current-leaf identification are demonstrated. Initial UI allows browsing and exiting even for an empty session; native /tree remains unaffected.
- [x] Index tests cover full entry types, original order, raw/turn/branch depth, chains, nested/wide forks, one/many roots, missing parents and invalid/cyclic relationships without unbounded traversal.
- [x] All 17 node Actions and 13 branch Actions from R04 have direct behavioral tests, including boundaries and visible-versus-raw target rules. Full configured-key access is completed in T0002, not silently omitted.
- [x] Normative D1/C2 cases distinguish node.nextSibling from branch.next, use nearest fork, handle selected fork nodes and nested forks, and do not rotate sibling branches across Roots.
- [x] Preferred leaf selection uses focused path, then recent visit, then last leaf in session order; raw-preorder fork/leaf traversal and branch.cycle behavior are tested.
- [x] Selection, focus/path and real Session Leaf remain separately owned. No browsing Action writes session entries, changes parentId/resetLeaf, or calls a model.
- [x] Run package-local typecheck, Biome and non-empty Vitest plus an isolated Pi loading/usage smoke. Document initial limitations honestly; the initial slice is not full v1.0.

## Out of Scope

Full key parser/filter/fold policies, external layered configuration, search, label mutation, session navigation/fork, historical metrics and final platform/performance claims.

## Coordination contract

Consume settled requirements and established solution choices from the Spec. Organize and verify them; do not invent or revise domain facts, requirements, architecture, constraints or acceptance semantics. Return needed new material decisions to refinement/clarification. CONTEXT/ADR recording is separately unauthorized and Pending; it does not block this ticket set. This artifact is not permission to start implementation, QA, staging or committing. Specialists return at the selected Spec -> tickets endpoint.