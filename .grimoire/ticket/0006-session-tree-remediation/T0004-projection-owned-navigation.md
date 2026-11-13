# Projection-owned logical navigation and selection

**Ticket ID:** T0004
**Source:** [Approved F4 and F6 navigation/fold consumer](./README.md#finding-evidence); [Spec 0008](../../spec/0008-enhanced-session-tree-explorer.md) R02-R05/R11/R13.
**Status:** In Progress

## Goal

Logical node navigation follows the actual projected hierarchy, including virtual summaries. Explicit branch/current/fork/leaf jumps preserve their raw target choice and reconcile it to a displayable target before rendering.

## Affected surfaces

- display.ts, navigation.ts, selection/focus/fold Actions in actions.ts, types.ts and state.ts.
- Selection guard and projection consumption in tui.ts; navigation, folds/filters, TUI and E01 regression tests.

## Approach

Make projection authoritative for logical relationships and real/virtual target resolution. Navigation consumes that hierarchy rather than independently reconstructing visible ancestry from raw parents. Reconcile selection in the responsible transition; render observes the result without selecting another row. Preserve raw nearest-fork resolution independently of display filtering.

## Dependencies and coordination

- **Blocked by:** None; raw TreeIndex and projection fixtures already exist.
- **Blocks:** T0003/T0006/T0008; reversible hidden-result search, navigation settings and final interaction checks require correct target mapping.
- **Coordination:** Agree selection/reveal interfaces with T0003 and refresh integration with T0002. T0001 owns mode legality, not projected topology.

## Acceptance

- [ ] Parent/first-child/last-child/sibling Actions use the projected logical hierarchy for both real rows and virtual summaries. The reproduced parent-of-virtual-summary case returns its logical parent.
- [ ] Real raw IDs and virtual display IDs remain distinct; virtual target resolution uses the projection's explicit anchor relationship rather than distributed string parsing as the semantic authority.
- [ ] Under default hidden assistant/tool filters, the normative D1/C2 branch cases retain their raw choice. Jumping to hidden branch b resolves within that branch or reveals its necessary path; rendering cannot replace it with unrelated root r.
- [ ] Current-leaf, fork and leaf jumps handle hidden/collapsed targets, multiple roots, boundaries and missing targets according to R03/R04. No legal target retains selection; raw forks are never invented by filters.
- [ ] Focus follows the specified navigation policy; ordinary j/k does not repeatedly refold the tree under the default branch-actions policy. Expose navigation/fold settings for T0006 without hardcoding a competing policy.
- [ ] Manual/policy/search reveal precedence and intersecting filters remain intact, including empty results. Restoring configured fold/filter defaults uses effective defaults rather than resetting unrelated options or raw topology.
- [ ] Repeated render calls do not change selected/focused/leaf state, revisions, or host entries. Selection reconciliation is verified as a transition outcome before render.
- [ ] Tests cover projected virtual parent/child/sibling behavior, hidden raw branch choices, default filters, nested forks and multiple roots, plus raw depths and browse-only leaf invariance.

## Out of scope

New branch traversal scopes, changing nearest-fork or leaf preference semantics, merging roots, altering raw parent links, and a general-purpose graph/navigation framework. Follow the README's permissions and knowledge boundary.

## Execution evidence (provisional)

Projected parent/child/target ownership, collapsed/linear summary ranges, transition-time reconciliation and merged-summary remapping; remediation-projection/contracts and navigation tests.

Whole-ticket acceptance is not granted here. See [current combined checkpoint](./README.md#current-checkpoint-u4-implemented-integrated-acceptance-incomplete) for revision, commands, separate Code Risk / Intent Check outcomes, performance scope and remaining runtime gates.

Windows-only follow-up: Steps 1/2 verified real TUI/editor/file outcomes; Step 3 was excluded. Step 4 recorded three confirmed blockers, independent-review startup failure and contention-specific timing misses. See [current evidence](./evidence/windows-2026-11-10/README.md); this ticket remains unaccepted pending its complete criteria.


### Follow-up — 2026-11-13

Native metadata labels hide without losing descendants. Focus-irrelevant policies reuse projection; focus-sensitive folding and revision invalidation have explicit regressions. See [latest evidence](./evidence/windows-2026-11-13/README.md) and [results](./evidence/windows-2026-11-13/RESULTS.md). Fresh independent review is pending. This update supersedes the older provisional check counts/blocker state, not the ticket's acceptance criteria; status remains In Progress.


Independent S1001 requested two fixes; the producer reproduced and addressed them, with 177 tests / 33 files passing. Focused re-review S1002 is pending; the new GUI observation attempt is blocked by desktop-tool failure. See [review dispositions](./evidence/windows-2026-11-13/REVIEW.md). No whole-ticket acceptance is inferred.


**Independent review receipt:** S1003 approved the two S1001 fixes and directly related behavior, with no new defects in that focused static scope. [Receipt and remaining runtime boundaries](./evidence/windows-2026-11-13/REVIEW.md). This supersedes prior pending-review notes; it does not accept this ticket's whole criteria. Status remains In Progress.
