# Authoritative Actions and mode-safe input

**Ticket ID:** T0001
**Source:** [Approved F1 and coordination contract](./README.md#finding-evidence); [Spec 0008](../../spec/0008-enhanced-session-tree-explorer.md) R04/R06/R07/R09/R11/R13.
**Status:** In Progress

## Goal

A configured key resolves and executes one legal Action for the current mode, and help accurately describes effective bindings and availability. Restore the specified behavior rather than preserving the reproduced Preview-fork and Escape conflicts.

## Affected surfaces

- actions.ts, keymap.ts, types.ts, and the dispatch/help portions of tui.ts under packages/pi-session-tree-explorer/extensions/.
- Binding defaults/diagnostics consumers in config-schema.ts and config.ts; keymap, Actions, TUI and session-operation tests.

## Approach

Make the existing Action catalog authoritative for IDs, defaults, permitted modes and enabled conditions. Resolution, validation, dispatch and help consume that authority; remove competing binding/help policy rather than adding a facade. Keep key parsing separate from business execution, and preserve the post-custom-UI intent executor.

## Dependencies and coordination

- **Blocked by:** None.
- **Blocks:** T0003, T0006 and T0008; their real input/configuration acceptance requires this dispatch boundary.
- **Coordination:** Agree mode/diagnostic integration with T0003/T0005/T0006. Serialize shared actions.ts/tui.ts edits; shared files do not block independent source work.

## Acceptance

- [ ] Catalog-derived defaults and effective help cover all 73 specified Actions. Actions without a default key remain reachable via configured bindings or the action/help surface; mode and unavailable/disabled status are truthful.
- [ ] Dispatch enforces permitted modes and enabled conditions for both key-resolved and programmatic Action dispatch. Preview/help input cannot emit normal-mode Navigate/Fork intents.
- [ ] Normal Enter navigates only a real target or expands a virtual summary; Search Enter accepts without Navigate. Normal Esc executes the specified search-clear behavior; q closes. No duplicate default assignment silently replaces that policy.
- [ ] Printable j/k edit Search text; arrows/Ctrl+n/p move matches. Alternative/configured bindings share the same Action semantics rather than a second non-Vim business path.
- [ ] Identical/conflicting bindings are checked per permitted mode; valid cross-mode reuse is not a conflict. Diagnostics identify invalid keys/actions or conflicts without duplicate execution.
- [ ] Ambiguous complete prefixes resolve once on timeout or disambiguation; incomplete prefixes reset. Mode change, configuration change and disposal cannot leak buffered/timed Actions into another mode or a closed Explorer.
- [ ] Keyboard/dispatch tests reproduce the baseline failures, then verify corrected mode transitions, overrides, non-Vim use, disabled Actions and truthful help. Session Actions still return intents and never replace sessions inside input handling.

## Out of scope

Changing public Action IDs, replacing native /tree, adding global Pi keybinding behavior, unrelated Action feature expansion, or extracting files solely to reduce line count. Follow the README's permissions and knowledge boundary.

## Execution evidence (provisional)

Catalog, mode-qualified bindings/dispatch/help, effective footer hints and catalog-owned settings; remediation-input, keymap, actions and E07 inventory tests. Original 73 IDs preserved; view.settings catalogs the existing link.

Whole-ticket acceptance is not granted here. See [current combined checkpoint](./README.md#current-checkpoint-u4-implemented-integrated-acceptance-incomplete) for revision, commands, separate Code Risk / Intent Check outcomes, performance scope and remaining runtime gates.

Windows-only follow-up: Steps 1/2 verified real TUI/editor/file outcomes; Step 3 was excluded. Step 4 recorded three confirmed blockers, independent-review startup failure and contention-specific timing misses. See [current evidence](./evidence/windows-2026-11-10/README.md); this ticket remains unaccepted pending its complete criteria.


### Follow-up — 2026-11-13

Bounded help/preview paging is catalog-owned and mode-qualified; the 80-Action inventory preserves all original 73 IDs. See [latest evidence](./evidence/windows-2026-11-13/README.md) and [results](./evidence/windows-2026-11-13/RESULTS.md). Fresh independent review is pending. This update supersedes the older provisional check counts/blocker state, not the ticket's acceptance criteria; status remains In Progress.


Independent S1001 requested two fixes; the producer reproduced and addressed them, with 177 tests / 33 files passing. Focused re-review S1002 is pending; the new GUI observation attempt is blocked by desktop-tool failure. See [review dispositions](./evidence/windows-2026-11-13/REVIEW.md). No whole-ticket acceptance is inferred.


**Independent review receipt:** S1003 approved the two S1001 fixes and directly related behavior, with no new defects in that focused static scope. [Receipt and remaining runtime boundaries](./evidence/windows-2026-11-13/REVIEW.md). This supersedes prior pending-review notes; it does not accept this ticket's whole criteria. Status remains In Progress.
