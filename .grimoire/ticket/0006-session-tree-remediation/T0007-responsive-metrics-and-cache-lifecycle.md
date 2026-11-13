# Responsive context metrics and cache lifecycle

**Ticket ID:** T0007
**Source:** [Approved F7 and F6 context/performance consumer](./README.md#finding-evidence); [Spec 0008](../../spec/0008-enhanced-session-tree-explorer.md) R03/R10/R11/R13/R14.
**Status:** In Progress

## Goal

Selection movement reuses applicable context results and unaffected projections. Rendering remains responsive without waiting for context estimation, and obsolete work cannot publish after snapshot/model/projection changes or replacement.

## Affected surfaces

- context-metrics.ts and its owner in tui.ts; invalidation/revision transitions in actions.ts, state.ts and types.ts.
- Snapshot/model/usage integration from T0002; viewport/details consumption and context/performance option boundary for T0006.
- Cache, context provenance, stale-work, TUI and interaction-path benchmark tests.

## Approach

Separate session/projection identity from selection/view invalidation. Keep a bounded plugin-owned metrics lifecycle that prioritizes selection and visible/adjacent entries; rendering consumes cached/pending/unknown results. Retain the canonical host projection helper and explicit estimate provenance instead of duplicating host context semantics.

## Dependencies and coordination

- **Blocked by:** T0002; correct invalidation requires actual coherent snapshot/session/model identity.
- **Blocks:** T0006/T0008; runtime context options and final responsiveness evidence require this owner.
- **Coordination:** Accept feature-local context/performance settings in fixture tests; T0006 wires them from real configuration. Search and metrics own separate bounded work/cancellation, sharing snapshot identity only.

## Acceptance

- [ ] Selection-only movement does not rebuild TreeIndex or discard applicable context cache entries. Reuse unaffected logical projection structure; selection/viewport decoration changes do not masquerade as a raw-session revision.
- [ ] Cache identity includes session, relevant revision/projection version, entry and applicable model identity. Real changes invalidate dependent results; ordinary view changes do not cause blanket misses.
- [ ] Rendering neither computes historical projections synchronously nor awaits all estimates. Selected-node work is prioritized, then viewport and bounded adjacent/overscan work; collapsed/hidden descendants are not eagerly estimated.
- [ ] Work and cache capacity are bounded. Close/refresh/model/session/projection changes cancel or version-gate obsolete publication; completion/failure is observed and requests the appropriate render without writing stale state.
- [ ] The feature accepts the existing context/performance options, including cache capacity and visibility controls; disabling lazy evaluation cannot make rendering wait for the whole tree. Preserve estimate markers even when a cosmetic setting would otherwise misrepresent estimates as exact.
- [ ] Active-context uses available host usage and preserves null values; historical metrics use branch-correct canonical projection and historical model/window resolution. Compaction/retain boundaries/context edits remain respected; unknown model/window/failure stays unknown rather than borrowing an incompatible active window.
- [ ] Context estimates represent effective model-visible messages, not a sum of historical request usage. No host leaf reset, model request, raw-history mutation or replacement happens while estimating.
- [ ] Tests verify cache object/hit reuse across actual j/k input, relevant invalidation, viewport priority, bounded work and late completion after close/replacement. Measure complete movement/render paths against the existing R14 target rather than only navigation helpers.

## Out of scope

Changing the host projection algorithm, adding a tokenization service/network request, unbounded full-tree precomputation, lowering performance targets or introducing a shared global scheduler. Follow the README's permissions and knowledge boundary.

## Execution evidence (provisional)

Revision-qualified estimates, selected/viewport/adjacent admission, bounded background queue, cache reuse/disposal and disabled-context scheduling; remediation-metrics/settings tests plus scoped interaction benchmarks.

Whole-ticket acceptance is not granted here. See [current combined checkpoint](./README.md#current-checkpoint-u4-implemented-integrated-acceptance-incomplete) for revision, commands, separate Code Risk / Intent Check outcomes, performance scope and remaining runtime gates.

Windows-only follow-up: Steps 1/2 verified real TUI/editor/file outcomes; Step 3 was excluded. Step 4 recorded three confirmed blockers, independent-review startup failure and contention-specific timing misses. See [current evidence](./evidence/windows-2026-11-10/README.md); this ticket remains unaccepted pending its complete criteria.


### Follow-up — 2026-11-13

CPU sampling identified redundant projection/text work; component-owned revision/thinking caches and projection reuse improve scoped timings. Two full-suite contention runs meet the unchanged recorded comparisons; physical timing remains unmeasured. See [latest evidence](./evidence/windows-2026-11-13/README.md) and [results](./evidence/windows-2026-11-13/RESULTS.md). Fresh independent review is pending. This update supersedes the older provisional check counts/blocker state, not the ticket's acceptance criteria; status remains In Progress.


**Independent review receipt:** S1003 approved the two S1001 fixes and directly related behavior, with no new defects in that focused static scope. [Receipt and remaining runtime boundaries](./evidence/windows-2026-11-13/REVIEW.md). This supersedes prior pending-review notes; it does not accept this ticket's whole criteria. Status remains In Progress.
