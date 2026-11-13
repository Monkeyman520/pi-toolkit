# Keyboard-driven, reversible search lifecycle

**Ticket ID:** T0003
**Source:** [Approved F3 and F6 search consumer](./README.md#finding-evidence); [Spec 0008](../../spec/0008-enhanced-session-tree-explorer.md) R03/R05-R08/R13/R14.
**Status:** In Progress

## Goal

Typing in Search produces current bounded results, permits explicit selection/Preview, and supports exact cancellation/acceptance/clear semantics without stale work or persistent fold/filter changes.

## Affected surfaces

- Search state and Actions in state.ts, types.ts and actions.ts; search.ts and the input/search portions of tui.ts.
- Snapshot/revision and projection integration supplied by T0002/T0004; search, keyboard, folding and E02 interaction tests.

## Approach

Give query/options, result publication and reversible search transitions one lifecycle owner. Connect real query editing to debounced search; qualify work with query and snapshot identity. Keep search execution separate from presentation and from Navigate. Expose explicit search/performance settings for T0006's runtime wiring.

## Dependencies and coordination

- **Blocked by:** T0001 for real mode-safe input; T0002 for refresh/replacement identity; T0004 for hidden-hit reveal and selection reconciliation. Fixture-level search work may proceed before their integration.
- **Blocks:** T0006/T0008; configuration and final keyboard acceptance must exercise a working query lifecycle.
- **Coordination:** Search owns temporary reveals and snapshots; projection owns target resolution; the adapter owns session identity. Do not duplicate those owners or share mutable job control with metrics.

## Acceptance

- [ ] Typing /needle through component input searches real full-text documents and displays matching results without a manual runSearch call or injected final results. Backspace and continuous printable input, including j/k, update the same lifecycle.
- [ ] Fuzzy/exact/regex mode, case sensitivity, all/focused-subtree scope, result bounds and debounce accept the existing specified settings. Query or relevant option changes reevaluate results using preserved ranking/tie rules.
- [ ] Full text beyond row truncation, labels, IDs/time and tool metadata remain searchable across hidden/collapsed entries. Selection reveals a real hit/path without persistently enabling message-type filters.
- [ ] Search open snapshots prior query/selection/folds/reveals. Esc cancels this attempt and restores that snapshot; no canceled-attempt results survive to drive n/N against the restored query.
- [ ] Search Enter accepts only the selected result, retains its query/reveal and returns to normal; a separate explicit Navigate is required. Normal Esc clears query/reveals and reconciles hidden selection to the nearest visible ancestor under the existing contract.
- [ ] Empty results and subsequent searches remain usable. Temporary reveals do not erase manual overrides; clear/cancel restores underlying fold/filter policy rather than broadening it.
- [ ] New query, snapshot refresh, session replacement or close prevents obsolete results from publishing. Refresh after document creation cannot return a removed entry or old resolved label.
- [ ] Tests drive keyboard -> dispatch -> search -> projection -> render for E02, options/scope changes, no-result/cancel cases and stale work. Search never mutates the host leaf, issues a model request or directly replaces the session.

## Out of scope

New ranking configuration, new search scopes, a general job framework or session mutation on search acceptance. T0006 owns entry-point settings wiring, not a second search implementation. Follow the README's permissions and knowledge boundary.

## Execution evidence (provisional)

Typed query/debounce/accept/cancel/clear, full content, hidden reveals, scoped deep traversal and revision rejection; remediation-search/input/plugin tests. Search document branch ownership now has a deterministic linear-lookup regression.

Whole-ticket acceptance is not granted here. See [current combined checkpoint](./README.md#current-checkpoint-u4-implemented-integrated-acceptance-incomplete) for revision, commands, separate Code Risk / Intent Check outcomes, performance scope and remaining runtime gates.

Windows-only follow-up: Steps 1/2 verified real TUI/editor/file outcomes; Step 3 was excluded. Step 4 recorded three confirmed blockers, independent-review startup failure and contention-specific timing misses. See [current evidence](./evidence/windows-2026-11-10/README.md); this ticket remains unaccepted pending its complete criteria.


### Follow-up — 2026-11-13

Search clear reuses its requested projection; native historical label payloads remain searchable, and existing lifecycle regressions still pass. See [latest evidence](./evidence/windows-2026-11-13/README.md) and [results](./evidence/windows-2026-11-13/RESULTS.md). Fresh independent review is pending. This update supersedes the older provisional check counts/blocker state, not the ticket's acceptance criteria; status remains In Progress.


**Independent review receipt:** S1003 approved the two S1001 fixes and directly related behavior, with no new defects in that focused static scope. [Receipt and remaining runtime boundaries](./evidence/windows-2026-11-13/REVIEW.md). This supersedes prior pending-review notes; it does not accept this ticket's whole criteria. Status remains In Progress.
