# Interactive Session Explorer for Coding Agents

**Source:** [Spec 0008 (v2.0)](../../spec/0008-enhanced-session-tree-explorer.md)
**Ticket folder:** .grimoire/ticket/0007-interactive-session-explorer/

## Overview

Evolve `pi-session-tree-explorer` from a basic visual tree into a full interactive Session Explorer for Coding Agents across three prioritized phases:
- **Phase 1 (P0): Navigation & State Integrity:** In-memory navigation history stack (`r` restore), branch tip routing (`g`), explicit preview decoupling, 3-tier view state isolation, and legacy v1 state migration.
- **Phase 2 (P1): Responsive Layout & Tool Aggregation:** Dual-pane Outline + Preview layout (with responsive narrow terminal fallback), projection-level Tool call aggregation (`[Tools ×N]`), smart folding, and interactive native branch summarization.
- **Phase 3 (P2): Branch Management & Analytics:** Two-tier branch diff (topology + progressive git diff), branch bookmarks/names, and session statistics.
- **Combined Verification:** End-to-end acceptance checks, type checks, Biome, Vitest test suite, and Pi TUI integration evidence.

## Delivery Surfaces

- `packages/pi-session-tree-explorer/extensions/view-state.ts`: 3-tier view state schema v2, migration from v1, non-polluting persistence.
- `packages/pi-session-tree-explorer/extensions/session-effects.ts`: Navigation history stack, safe tip navigation, restore previous effect, interactive summarization.
- `packages/pi-session-tree-explorer/extensions/display.ts` & `types.ts`: Projection-level tool call aggregation (`virtual:tool-group`), smart fold reducer.
- `packages/pi-session-tree-explorer/extensions/ui.ts` & `tui.ts`: Responsive dual-pane layout (>=100 cols split 60/40, <100 cols single-pane with modal preview), live preview pane.
- `packages/pi-session-tree-explorer/extensions/actions.ts` & `keymap.ts`: Keybindings for tip navigation (`g`), restore previous (`r`), branch diff, and preview.
- `packages/pi-session-tree-explorer/extensions/branch-diff.ts` (new): Two-tier branch comparison engine.
- `packages/pi-session-tree-explorer/tests/`: Vitest test suites covering state migration, navigation stack, tool aggregation, and responsive layout.

## Dependencies

| Producer | Consumer | Why consumer cannot proceed first |
| --- | --- | --- |
| T0001 | T0004 | Layout and Preview pane consume decoupled preview and navigation stack contracts |
| T0002 | T0004 | View state loader v2 must provide clean display options before layout initialization |
| T0003 | T0004 | Dual-pane outline rendering displays aggregated tool items produced by projection |
| T0001, T0003 | T0006 | Branch diff compares turns and aggregated tools along branches |
| T0001..T0007 | T0008 | Final integration verification requires all phase deliveries |

## Coordination

| Tickets | Risk | Strategy |
| --- | --- | --- |
| T0001, T0002 | Shared `session-effects.ts` / `index.ts` setup | Implement T0001 navigation effects first, then connect T0002 state loader |
| T0003, T0004 | Shared `tui.ts` and `ui.ts` | Complete projection-level aggregation contracts before embedding into dual-pane layout |

## Recommended Order

1. **T0001 (P0):** Navigation History Stack, Branch Tip Navigation, and Preview Decoupling
2. **T0002 (P0):** Three-Tier State Architecture & Schema v2 Migration
3. **T0003 (P1):** Tool Call Aggregation & Smart Fold Mode
4. **T0004 (P1):** Responsive Dual-Pane (Outline + Preview) Layout
5. **T0005 (P1):** Interactive Native Summaries & Enhanced Search
6. **T0006 (P2):** Two-Tier Branch Comparison (Topology + Git Diff)
7. **T0007 (P2):** Branch Bookmarks & Session Statistics
8. **T0008:** Comprehensive Verification & Documentation

## Ticket Index

| Ticket | File | Outcome |
| --- | --- | --- |
| T0001 | [T0001-navigation-history-and-restore.md](./T0001-navigation-history-and-restore.md) | Navigation stack, `r` restore, `g` branch tip, preview decoupling |
| T0002 | [T0002-three-tier-state-and-v2-migration.md](./T0002-three-tier-state-and-v2-migration.md) | 3-tier state isolation, schema v2, legacy v1 migration |
| T0003 | [T0003-tool-call-aggregation-and-smart-fold.md](./T0003-tool-call-aggregation-and-smart-fold.md) | Virtual tool group projection, in-place toggle, smart fold mode |
| T0004 | [T0004-responsive-outline-preview-layout.md](./T0004-responsive-outline-preview-layout.md) | Dual-pane 60/40 layout on >=100 cols, single-pane fallback on <100 cols |
| T0005 | [T0005-interactive-summarization-and-context-search.md](./T0005-interactive-summarization-and-context-search.md) | Interactive native summarization dialog, query highlighting |
| T0006 | [T0006-two-tier-branch-diff.md](./T0006-two-tier-branch-diff.md) | Zero-dep session topology diff + progressive Git workspace diff |
| T0007 | [T0007-branch-bookmarks-and-session-stats.md](./T0007-branch-bookmarks-and-session-stats.md) | Named branch bookmarks, branch tip picker, session stats |
| T0008 | [T0008-interactive-explorer-verification.md](./T0008-interactive-explorer-verification.md) | TypeScript, Biome, Vitest suites, and Pi TUI evidence |
