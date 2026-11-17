# Three-Tier State Architecture & Schema v2 Migration

**Ticket ID:** T0002
**Source:** [Spec 0008 (v2.0)](../../spec/0008-enhanced-session-tree-explorer.md) §§R03, R12, R13, ADR 0007
**Status:** Done

## Goal

Eliminate configuration masking caused by persisting full `displayOptions` snapshots into session view state files, establish strict 3-tier state isolation (Global Config, Session View State, Runtime State), and provide automatic migration for legacy `version: 1` state files.

## Affected Surfaces

- `packages/pi-session-tree-explorer/extensions/view-state.ts`: Update `ViewStateSchema` to version 2, purge full `displayOptions` from persisted schema, add migration logic from version 1, store only explicit overrides.
- `packages/pi-session-tree-explorer/extensions/index.ts`: Decouple `loadViewState` so it does not overwrite global `effectiveConfig.display` with cached defaults.
- `packages/pi-session-tree-explorer/extensions/types.ts`: Clarify `SessionViewState` vs `DisplayOptions` vs `ExplorerState` types.
- `packages/pi-session-tree-explorer/tests/view-state-migration.test.ts`: Vitest tests verifying v1 migration, non-pollution of global configs, and clean v2 persistence.

## Approach

1. Define `ViewStateV2Schema`:
   - `version: Type.Literal(2)`
   - `sessionId: Type.String()`
   - `focusedBranchId?: Type.String()`
   - `manualExpandedIds?: Type.Array(Type.String())`
   - `manualCollapsedIds?: Type.Array(Type.String())`
   - `selectedNodeId?: Type.String()`
   - `explicitDisplayOverrides?: Type.Record(Type.String(), Type.Boolean())` (only tracks keys explicitly modified by user in session)
2. In `loadViewState`:
   - If disk file has `version === 1`, execute migration: extract `manualExpandedIds`, `manualCollapsedIds`, `focusedBranchId`; discard the full `displayOptions` snapshot; migrate in memory and on next save write as `version: 2`.
3. In `saveViewState`:
   - Only persist explicit overrides and manual fold collections. Never write the complete `state.displayOptions` map.
4. Ensure `state.activeLeafId` is never read from or written to `view-state.json`; it is strictly retrieved from `sessionManager.getLeafId()`.

## Dependencies and Coordination

- **Blocked by:** None.
- **Blocks:** T0004 (Layout relies on unpolluted display options).
- **Coordination risks:** Shared `view-state.ts` and `index.ts` wiring; coordinate with T0001.

## Acceptance

- [x] Global configuration changes in `session-tree.json` (e.g. `showAssistantNodes: true`) immediately take effect in existing sessions without being overridden by old view state.
- [x] Loading a legacy `version: 1` view state file migrates cleanly to `version: 2` without throwing errors.
- [x] Saving view state produces a valid `version: 2` JSON file without full `displayOptions` snapshots.
- [x] Stale entry IDs in manual fold lists that no longer exist in the session are filtered during load.
- [x] Automated tests in `tests/view-state-migration.test.ts` pass.

## Out of Scope

- Managing settings of unrelated extensions.
