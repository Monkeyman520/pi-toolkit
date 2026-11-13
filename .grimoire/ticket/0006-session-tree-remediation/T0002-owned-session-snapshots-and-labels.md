# Owned session snapshots, labels and refresh

**Ticket ID:** T0002
**Source:** [Approved F2](./README.md#finding-evidence); [Spec 0008](../../spec/0008-enhanced-session-tree-explorer.md) R02/R03/R08/R09/R10/R12.
**Status:** In Progress

## Goal

Browsing uses a coherent readonly host snapshot with resolved labels, session/leaf identity and revision/model evidence. Explicit label changes use the host API; refresh and replacement cannot leave stale ownership behind.

## Affected surfaces

- index.ts, tree-index.ts, types.ts, state.ts; label/refresh Actions and snapshot consumers in search.ts, display.ts and tui.ts.
- Session identity guards in session-effects.ts and replacement cleanup; host-backed label/refresh, immutability and session-operation tests.

## Approach

Move snapshot acquisition and coherent replacement behind the session adapter. Separate resolved metadata from host-owned raw entries; do not assign a label onto a borrowed entry. Publish snapshot identity/revisions to consumers, which retain ownership of their own caches/jobs. Preserve the pure indexing and closed-UI session-intent seams.

## Dependencies and coordination

- **Blocked by:** None.
- **Blocks:** T0003/T0007/T0008; search, metrics and integrated tests require trustworthy refresh/replacement identity.
- **Coordination:** Agree identity and invalidation contracts with T0003/T0007; agree real/display identity with T0004. Do not build a universal runtime context or cross-feature scheduler.

## Acceptance

- [ ] Readonly indexing/projection/search/preview cannot change host entry objects, IDs, parent links, message content or Session Leaf. Tests use Pi's in-memory SessionManager or equivalent host-backed evidence, not only detached fixtures.
- [ ] Existing host labels are resolved on opening and after refresh; display, label navigation and search use that resolved metadata. Label set/edit/clear invokes supported host APIs and reflects confirmed results without assigning entry.label on a host-owned object.
- [ ] Failed label operations do not leave a successful local label or false success notification. Async label/refresh completion is observed and causes the appropriate render/invalidation; rejection is handled rather than becoming an unhandled promise.
- [ ] Refresh publishes entries, resolved labels, session identity, actual leaf and applicable model/revision evidence together, with explicit invalidation/disposal signals to projection/search/metrics consumers. Verify publication and invalidation at this adapter boundary; T0003/T0007 verify their consumers cannot publish removed entries or prior-session results.
- [ ] Refresh supplies stale selection/focus/manual IDs to the agreed projection reconciliation boundary without repairing host/raw topology or adding session-history noise. T0004 owns the target policy; T0008 verifies the combined refresh-to-selection behavior.
- [ ] After custom UI closes, an intent is checked against the opened/current session identity, real target and host safety before mutation. Refresh/replacement, including during asynchronous confirmation/work, cannot execute an old-session intent against a replacement session.
- [ ] Close/replacement disposes old references/work; withSession uses only the fresh replacement context. Existing busy, extension-cancellation, error, independent-fork and editor-restoration contracts remain intact.
- [ ] Regression tests cover existing labels on reopen, raw alias immutability, failed writes, changed leaf/session, removed entries and stale asynchronous completion; snapshot consumers are exercised at the actual refresh boundary.

## Out of scope

A second session store, deep-cloning all host data without a demonstrated need, session-format changes, shared process-wide ownership, or changes to native Navigate/Fork semantics. Follow the README's permissions and knowledge boundary.

## Execution evidence (provisional)

Owned metadata, resolved host labels and coherent refresh/replacement evidence; remediation-snapshot/plugin/effects tests and native RPC history-file preservation.

Whole-ticket acceptance is not granted here. See [current combined checkpoint](./README.md#current-checkpoint-u4-implemented-integrated-acceptance-incomplete) for revision, commands, separate Code Risk / Intent Check outcomes, performance scope and remaining runtime gates.

Windows-only follow-up: Steps 1/2 verified real TUI/editor/file outcomes; Step 3 was excluded. Step 4 recorded three confirmed blockers, independent-review startup failure and contention-specific timing misses. See [current evidence](./evidence/windows-2026-11-10/README.md); this ticket remains unaccepted pending its complete criteria.


### Follow-up — 2026-11-13

Raw native label-event payloads and resolved bookmark annotations now have separate storage and consumers; real SessionManager clearing/relabeling regressions and native Windows label inspection pass. See [latest evidence](./evidence/windows-2026-11-13/README.md) and [results](./evidence/windows-2026-11-13/RESULTS.md). Fresh independent review is pending. This update supersedes the older provisional check counts/blocker state, not the ticket's acceptance criteria; status remains In Progress.


**Independent review receipt:** S1003 approved the two S1001 fixes and directly related behavior, with no new defects in that focused static scope. [Receipt and remaining runtime boundaries](./evidence/windows-2026-11-13/REVIEW.md). This supersedes prior pending-review notes; it does not accept this ticket's whole criteria. Status remains In Progress.
