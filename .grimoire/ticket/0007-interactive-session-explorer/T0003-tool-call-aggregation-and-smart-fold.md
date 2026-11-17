# Tool Call Aggregation & Smart Fold Mode

**Ticket ID:** T0003
**Source:** [Spec 0008 (v2.0)](../../spec/0008-enhanced-session-tree-explorer.md) §§R02, R05, ADR 0007
**Status:** Done

## Goal

Reduce noise in coding agent sessions by grouping consecutive tool invocations and results into virtual summary nodes (`[Tools ×N] names...`) in the projection layer, supporting in-place expansion, and introducing a `smart` fold mode for balancing context clarity and detail.

## Affected Surfaces

- `packages/pi-session-tree-explorer/extensions/display.ts`: Implement tool aggregation reducer in projection generation; synthesize virtual aggregate nodes with ID `virtual:tool-group:<first-entry-id>`.
- `packages/pi-session-tree-explorer/extensions/types.ts`: Add `toolGroup` fields to `DisplayNode` (toolNames, count, statusSummary, isExpanded).
- `packages/pi-session-tree-explorer/extensions/actions.ts`: Support `Enter` or `l` expanding/collapsing `virtual:tool-group` nodes in-place.
- `packages/pi-session-tree-explorer/extensions/config-schema.ts`: Add `fold.mode = "smart"` option to schema and defaults.
- `packages/pi-session-tree-explorer/tests/tool-aggregation.test.ts`: Vitest unit tests verifying consecutive tool grouping, virtual node properties, and in-place expansion.

## Approach

1. In `display.ts`, during tree projection walk:
   - Identify consecutive sequences of tool-call / tool-result entries belonging to the same turn.
   - When tool aggregation is active, collapse them into a single `DisplayNode`:
     - `id`: `virtual:tool-group:<id>`
     - `label`: `▸ [Tools ×${N}] ${distinctToolNames.join(", ")}`
     - `kind`: `virtual-tool-group`
     - `toolCount`: N
     - `toolNames`: array of tool names
   - If user explicitly expands this virtual node (`state.manualExpandedIds.includes(node.id)`), render the child tool nodes underneath it indented.
2. Ensure `virtual:tool-group` IDs are never dispatched as real session targets to `ctx.navigateTree` or `ctx.fork`.
3. In `smart` fold mode:
   - For short sessions (< 20 turns): render all User + Assistant nodes expanded.
   - For long sessions: automatically fold tool aggregates and inactive branch bodies, retaining branch roots, branch tips, and fork points.

## Dependencies and Coordination

- **Blocked by:** None.
- **Blocks:** T0004 (Dual-pane outline renders the aggregated tool nodes).
- **Coordination risks:** Coordinate virtual node identification with search and navigation modules.

## Acceptance

- [x] Consecutive tool calls within a turn collapse into a single `[Tools ×N] ...` line in the Outline projection.
- [x] Pressing `Enter` or `l` on a tool aggregate toggles in-place expansion, revealing individual tool rows.
- [x] Raw topology, entry IDs, and searchability of individual tool entries remain completely intact.
- [x] `fold.mode = "smart"` automatically groups tools in long sessions while keeping user turns and assistant milestones visible.
- [x] Automated tests in `tests/tool-aggregation.test.ts` pass.

## Out of Scope

- Merging tool output contents into disk session JSONL files.
