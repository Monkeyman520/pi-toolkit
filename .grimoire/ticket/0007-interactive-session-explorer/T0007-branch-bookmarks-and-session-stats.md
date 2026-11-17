# Branch Bookmarks & Session Statistics

**Ticket ID:** T0007
**Source:** [Spec 0008 (v2.0)](../../spec/0008-enhanced-session-tree-explorer.md) §R17, ADR 0007
**Status:** Done

## Goal

Enable developers to tag and bookmark important branches (e.g. `baseline`, `approach-a`, `failed-test`), switch between bookmarked tips quickly via a branch selector dialog, and inspect session-wide execution statistics (nodes, branches, tokens, tools).

## Affected Surfaces

- `packages/pi-session-tree-explorer/extensions/view-state.ts`: Store branch bookmark metadata (`branchBookmarks: Record<string, string>`) in session view state.
- `packages/pi-session-tree-explorer/extensions/actions.ts`: Register `branch.bookmark` and `view.stats` actions.
- `packages/pi-session-tree-explorer/extensions/tui.ts`: Branch picker dialog displaying bookmarked branches; session statistics dialog.
- `packages/pi-session-tree-explorer/extensions/inspection-view.ts`: Render session statistics breakdown.
- `packages/pi-session-tree-explorer/tests/branch-bookmarks.test.ts`: Vitest tests for bookmark storage, tip jumping from selector, and statistics calculation.

## Approach

1. In `view-state.ts`, add `branchBookmarks` to `ViewStateV2Schema` (mapping of branch root/tip ID to custom human-readable label).
2. Add action `branch.bookmark` to name or unbookmark a branch. Bookmarked branches show a distinct marker (e.g. `★ [baseline]`) in the Outline tree.
3. Add a dedicated branch switcher dialog (invoked via a hotkey or action menu):
   - Lists all bookmarked branches and active branch tips with their labels, message count, and last updated time.
   - Selecting a branch navigates immediately to its branch tip.
4. Add `view.stats` modal:
   - Aggregates total entries, turn count, branch count, cumulative token usage, and tool invocation counts across the entire session.

## Dependencies and Coordination

- **Blocked by:** T0001 (Navigation and tip resolution), T0002 (View state schema v2).
- **Blocks:** T0008 (Verification).
- **Coordination risks:** Coordinate bookmark labels with native host label events.

## Acceptance

- [x] Branches can be tagged with custom bookmarks and display clear visual indicators in the Outline.
- [x] Branch switcher dialog lists bookmarked branches and navigates directly to their branch tips.
- [x] Session statistics dialog accurately summarizes total nodes, branches, tokens, and tool usage.
- [x] Bookmarks persist cleanly in `session-tree/<session-id>.json` under schema v2.
- [x] Automated tests in `tests/branch-bookmarks.test.ts` pass.

## Out of Scope

- Synchronizing bookmarks across different machines or network repositories.
