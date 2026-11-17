# Responsive Dual-Pane (Outline + Preview) Layout

**Ticket ID:** T0004
**Source:** [Spec 0008 (v2.0)](../../spec/0008-enhanced-session-tree-explorer.md) §§R08, R11, ADR 0007
**Status:** Done

## Goal

Provide high-density, low-noise visualization for coding agents via a responsive dual-pane layout (60% Outline tree on left, 40% Node Preview on right for terminal width >= 100 columns), with automatic graceful fallback to single-column Outline with drawer/modal preview on narrow terminals (< 100 columns).

## Affected Surfaces

- `packages/pi-session-tree-explorer/extensions/ui.ts`: Implement dual-pane split rendering, border rendering, preview content formatting, and responsive column calculation.
- `packages/pi-session-tree-explorer/extensions/tui.ts`: Manage terminal resize events, cursor sync with preview updates, and modal preview fallback when width < 100 columns.
- `packages/pi-session-tree-explorer/extensions/inspection-view.ts`: Render rich preview content (role header, timestamp, turn depth, message text, tool invocation list with arguments and exit status).
- `packages/pi-session-tree-explorer/tests/responsive-layout.test.ts`: Vitest unit tests for layout math, column splitting, and narrow terminal fallback.

## Approach

1. Calculate available dimensions from Pi TUI `terminal.columns` and `terminal.rows`.
2. When `columns >= 100`:
   - Split width: `outlineWidth = Math.floor(columns * 0.60)`, `previewWidth = columns - outlineWidth - 1` (accounting for vertical divider).
   - Render Session Outline on left; render active node preview on right.
   - Cursor movement (`j`/`k`/`up`/`down`) in Outline immediately updates the content rendered in the Preview pane.
3. When `columns < 100`:
   - Render single-column Session Outline using full width.
   - Pressing `Tab` or `p` opens a full/bottom modal preview overlay. `Esc` closes the overlay and returns focus to the Outline.
4. Rich preview formatting:
   - For user/assistant messages: show header badge, turn count, token estimate, full message text (word-wrapped).
   - For tool groups or tool items: show tool name, parameters, execution status, and output summary.

## Dependencies and Coordination

- **Blocked by:** T0001 (Preview decoupling), T0002 (Clean view state), T0003 (Tool aggregation).
- **Blocks:** T0008 (Verification).
- **Coordination risks:** Terminal resize event handling and viewport scrolling coordination.

## Acceptance

- [x] On terminals with width >= 100 columns, Explorer displays dual-pane layout (60% Outline, 40% Preview).
- [x] Moving cursor in the Outline updates the Preview pane dynamically with zero flicker or lag.
- [x] On terminals with width < 100 columns, Explorer falls back to single-column Outline without text wrapping chaos.
- [x] In single-column fallback, pressing `Tab` or `p` opens a modal preview overlay that closes on `Esc`.
- [x] Resizing the terminal dynamically recalculates layout without UI corruption.
- [x] Automated tests in `tests/responsive-layout.test.ts` pass.

## Out of Scope

- Graphical HTML/web rendering (strictly ANSI terminal TUI).
