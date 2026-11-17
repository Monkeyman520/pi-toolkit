# Two-Tier Branch Comparison (Topology + Git Diff)

**Ticket ID:** T0006
**Source:** [Spec 0008 (v2.0)](../../spec/0008-enhanced-session-tree-explorer.md) §R16, ADR 0007
**Status:** Done

## Goal

Provide a powerful two-tier branch comparison capability for coding agents: a core zero-dependency session topology diff (common ancestor, turns, tool calls, token/depth delta, outcomes) combined with progressive workspace file diffing via git when operating within a git repository.

## Affected Surfaces

- `packages/pi-session-tree-explorer/extensions/branch-diff.ts` (new): Implement topology comparison engine and optional git diff subprocess executor.
- `packages/pi-session-tree-explorer/extensions/actions.ts`: Register `branch.diff` action.
- `packages/pi-session-tree-explorer/extensions/tui.ts`: Add branch comparison selection dialog (select Branch A and Branch B) and comparison results view.
- `packages/pi-session-tree-explorer/tests/branch-diff.test.ts`: Vitest tests for common ancestor computation, turn/tool diff calculation, and git fallback handling.

## Approach

1. **Topology Comparison (Core Level, Zero Dependencies):**
   - Given `branchAId` and `branchBId`:
   - Trace ancestor chains to locate the nearest common ancestor node.
   - Collect unique nodes on Branch A path from common ancestor to tip.
   - Collect unique nodes on Branch B path from common ancestor to tip.
   - Compute metrics: turn count delta, tool calls breakdown (e.g. Branch A: 4 bash, 2 edit; Branch B: 1 bash, 8 edit), token usage delta, and final outcome status.
2. **Workspace Git Diff (Progressive Enhancement):**
   - Check if the current workspace is a git repository (`git rev-parse --is-inside-work-tree`).
   - If git is available and branch points associate with git commits or working trees, invoke `git diff --stat` or summary.
   - If git is unavailable or fails, gracefully return topology diff alone with a clear message: "Workspace file diff unavailable (outside git repository or uncommitted changes)".
3. Display results in a structured TUI comparison view with scrollable sections.

## Dependencies and Coordination

- **Blocked by:** T0001 (Navigation and tip resolution), T0003 (Tool aggregation).
- **Blocks:** T0008 (Verification).
- **Coordination risks:** Subprocess execution safety and timeout management.

## Acceptance

- [x] Selecting two branches computes and displays the common ancestor node correctly.
- [x] Displays side-by-side or sectioned breakdown of turns, tool calls, and token consumption.
- [x] If inside a git repository, displays file modification summary.
- [x] If outside a git repository, displays topology diff cleanly without errors or crashes.
- [x] Automated tests in `tests/branch-diff.test.ts` pass.

## Out of Scope

- Merging git branches or running merge conflict resolution tools.
