# Navigation History Stack, Branch Tip Navigation, and Preview Decoupling

**Ticket ID:** T0001
**Source:** [Spec 0008 (v2.0)](../../spec/0008-enhanced-session-tree-explorer.md) §§R03, R04, R09
**Status:** Done

## Goal

Decouple browsing and preview from context mutation, introduce an in-memory session navigation history stack to allow instant restoration of prior session states (`r`), and provide safe reachable branch tip navigation (`g`) with multi-tip selection and user-prompt restoration notices.

## Affected Surfaces

- `packages/pi-session-tree-explorer/extensions/actions.ts`: Register `branch.tip` (`g`), `session.restorePrevious` (`r`), `session.goCurrent` (Tab in tree), ensure `session.preview` does not emit navigation intents.
- `packages/pi-session-tree-explorer/extensions/session-effects.ts`: Implement `NavigationHistoryStack` tracking true `leafId` changes; execute `restorePrevious` via `ctx.navigateTree`; validate user-prompt notice on user tip targets.
- `packages/pi-session-tree-explorer/extensions/navigation.ts`: Implement reachable tip discovery from the selected subtree; compute single tip vs multi-fork tip lists.
- `packages/pi-session-tree-explorer/extensions/keymap.ts`: Bind `g` to `branch.tip`, `r` to `session.restorePrevious`, `p` and `Tab` to preview.
- `packages/pi-session-tree-explorer/tests/navigation-stack.test.ts`: Vitest unit tests for stack push/pop, tip calculation, and user message notice.

## Approach

1. Create a dedicated `NavigationHistory` class holding previous `leafId` strings. Pushing occurs strictly after `ctx.navigateTree` completes successfully.
2. In `navigation.ts`, add `findReachableBranchTips(index: TreeIndex, startEntryId: string): string[]`. Traverse descendants down to entries that have no children in raw topology.
3. For `branch.tip` (`g`):
   - If 1 tip: emit navigate intent to that tip.
   - If > 1 tip: trigger a TUI modal/picker showing each candidate tip with role, preview text, and turn depth.
   - If target tip is a `user` message: display confirmation/warning that native navigation will restore prompt text into the editor.
4. For `session.restorePrevious` (`r`): Pop top leaf from history stack and navigate. If stack is empty, display notification "No previous navigation history".
5. Ensure `session.preview` (`Tab` / `p`) only changes internal `previewNodeId` and never touches `activeLeafId` or calls `ctx.navigateTree`.

## Dependencies and Coordination

- **Blocked by:** None.
- **Blocks:** T0004 (Dual-pane layout consumes preview and tip navigation actions).
- **Coordination risks:** Shared `session-effects.ts` edits; coordinate with T0002.

## Acceptance

- [x] Browsing, cursor movement, and pressing `Tab`/`p` updates preview without changing session `activeLeafId`.
- [x] Successful `navigateTree` pushes previous `leafId` onto navigation history stack.
- [x] Pressing `r` restores previous session leaf and pops the stack.
- [x] Pressing `g` on a branch with a single tip jumps directly to that tip.
- [x] Pressing `g` on a branch with multiple fork tips displays a picker and navigates to the user's choice.
- [x] Navigating to a user-message tip presents an explicit prompt restoration notice.
- [x] Automated tests in `tests/navigation-stack.test.ts` pass.

## Out of Scope

- Disk persistence of navigation history (stack is strictly in-memory per session).
