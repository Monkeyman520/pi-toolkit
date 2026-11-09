# Find hidden history and inspect or explicitly label a real entry

**Ticket ID:** T0004
**Source:** [Spec 0008](../../spec/0008-enhanced-session-tree-explorer.md) (R07-R08; reveal portion of R03/R05; R14-R15; E02); sources U1/U2/U3 and repository/host contracts as cited there
**Status:** Done

## Goal

Full-text fuzzy/exact/regex search reaches hidden history with reversible reveal semantics; users can preview, copy and explicitly edit host labels.

## Affected Surfaces

Raw search index/ranker/query cancellation, search mode and snapshots, reveal overlay, Preview, clipboard adapter, label API effect, refresh and Action tests.

## Approach

Search the raw snapshot rather than projected rows, using the fold/reveal and input contracts delivered by T0002. Keep user acceptance distinct from Navigate. Co-locate labels with search because labels participate in ranking and labeled navigation; label editing remains an explicit effect, not a pure reducer operation. Coordinate shared mutation/lifecycle guards with T0005, but do not depend on Fork being implemented to test label API behavior.

## Dependencies and Coordination

- **Blocked by:** T0002. See the relationship README for concrete producer reasons.
- **Blocks:** Integrated acceptance T0008.
- **Coordination risks:** T0005 owns Navigate/Fork intent effects and replacement wiring; reuse ownership/safety checks rather than registering competing session mutation mechanisms. T0003 supplies validated settings but is not a hard blocker for search tests using the Spec configuration contract. T0007 renders the stable selection/query/status surfaces.

## Acceptance

- [x] All 7 search Actions and session.preview/copyId/copyContent/setLabel/refresh from R07-R08 are reachable and tested. session.close remains safe across search and preview flows.
- [x] Fuzzy default, exact-string and regex modes search full text, tool names, labels, IDs and timestamps, including hits beyond row truncation and hidden/collapsed entries.
- [x] Scope toggles between all raw entries and focused-branch subtree. Ranking includes label/prefix preference and recency/focus boosts; ties preserve original session order.
- [x] Entering Search snapshots prior query/selection/folds. Search Esc restores that snapshot; Search Enter selects and keeps query/reveal without Navigate. Normal Esc clears query/reveals and falls back to nearest visible ancestor if needed.
- [x] j/k enter text; arrows/Ctrl+n/p move results; normal n/N move matches. No normal-mode navigation or Session API is accidentally triggered by search typing/acceptance.
- [x] Hidden assistant results are temporarily rendered as real entries with Preview/Navigate eligibility; the underlying visibility config and manual folds are unchanged.
- [x] Long-text access, debounce, maxResults and query/session version cancellation keep old results from replacing new ones. Full-text coverage is not reduced to the lightweight summary index.
- [x] Preview exposes full content. Real IDs/text copy with honest success/failure; virtual summaries cannot impersonate raw IDs or label targets.
- [x] Label set/edit/clear uses Pi's host label API, updates markers/search and visible Label navigation, and is explicitly distinguished from browse-only invariance. Refresh handles missing/stale targets.
- [x] Pass typecheck/Biome/Vitest and actual Pi search/Preview/label smoke; test cancelled search rollback, accepted reveal/clear and late-result rejection.

## Out of Scope

Implicit Navigate on search acceptance, replacing raw text, model/network-backed search, new ranking-weight settings and global history outside the current session.

## Coordination contract

Consume settled requirements and established solution choices from the Spec. Organize and verify them; do not invent or revise domain facts, requirements, architecture, constraints or acceptance semantics. Return needed new material decisions to refinement/clarification. CONTEXT/ADR recording is separately unauthorized and Pending; it does not block this ticket set. This artifact is not permission to start implementation, QA, staging or committing. Specialists return at the selected Spec -> tickets endpoint.