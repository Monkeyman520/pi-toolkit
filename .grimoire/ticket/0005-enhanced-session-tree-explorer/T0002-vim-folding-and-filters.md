# Navigate a filtered focused tree with complete Vim key parsing

**Ticket ID:** T0002
**Source:** [Spec 0008](../../spec/0008-enhanced-session-tree-explorer.md) (R03-R06; help/Vim controls in R11; R14-R15; E01); sources U1/U2/U3 and repository/host contracts as cited there
**Status:** Done

## Goal

All node/branch/fold/filter Actions operate consistently through mode-aware configurable key sequences while preserving raw topology and stable focus.

## Affected Surfaces

Visible-tree projection, Explorer reducer/state, fold policies/overrides, logical navigation adapters, input parser, Action bindings/help, view.toggleVim and tests.

## Approach

Build on T0001's real navigation and Action registry. Keep filter projection separate from raw topology; represent collapsed subtrees with explicit virtual rows. Implement all fold modes and full keymap resolution together so tests cover the actual user interaction rather than a disconnected parser. Consume keybinding objects directly; T0003 handles disk validation/layering. Expose a temporary-reveal overlay seam for T0004 without implementing search ranking here.

## Dependencies and Coordination

- **Blocked by:** T0001. See the relationship README for concrete producer reasons.
- **Blocks:** T0004, T0007, and integrated acceptance T0008.
- **Coordination risks:** T0003 owns on-disk keymap/configuration and reload transaction semantics; agree on parser validation diagnostics and Action defaults. T0004 consumes reveal/cancel snapshots. T0007 consumes stable fold/filter/focus state for persistence. Changes to shared Explorer wiring require coordination, not additional semantic blockers.

## Acceptance

- [x] All 11 fold and 8 filter Actions in R05 are implemented and reachable; all R04 node/branch Actions use the same registry through configured keys.
- [x] Hidden assistant chains reconnect to the nearest logical visible parent without modifying real parentId. Nested raw fork targets resolve correctly even when filtered or folded.
- [x] Focused-only defaults focus the active path; branch actions update focus while j/k alone does not refold. all/active-only/depth-limited/manual modes and manual overrides have behavior tests.
- [x] Search-overlay > manual > policy > default precedence is verified using injected reveal state. Removing it preserves underlying manual settings for T0004.
- [x] Virtual summaries expose anchor/count/fork metadata, expand on Enter and cannot be mistaken for a raw session target. Test linear-path display compression when enabled without losing raw identity/depth.
- [x] Type visibility and userOnly/branchOnly/labeledOnly intersect; necessary structural summaries remain. Impossible combinations show an empty state rather than relaxed filters.
- [x] Single, modifier, alternative, multi-key and prefix-ambiguous bindings work once per resolution. Duplicate/invalid/conflicting bindings are diagnosed; timeout and mode changes clear stale prefixes.
- [x] Search-mode j/k become query text; arrows/Ctrl+n/p select and Enter dispatches accept, not Navigate. Input contract tests can use a search-state fixture before T0004.
- [x] view.help shows effective keys/modes and unavailable actions; view.toggleVim supports non-Vim arrows. selection-only movement does not rebuild TreeIndex.
- [x] Pass typecheck, Biome, Vitest and an actual Pi TUI keyboard smoke for this slice; preserve browse-only session-file and leaf invariants.

## Out of Scope

Search ranking, disk config trust/layering, explicit Session API effects, full persistence and historical context estimates.

## Coordination contract

Consume settled requirements and established solution choices from the Spec. Organize and verify them; do not invent or revise domain facts, requirements, architecture, constraints or acceptance semantics. Return needed new material decisions to refinement/clarification. CONTEXT/ADR recording is separately unauthorized and Pending; it does not block this ticket set. This artifact is not permission to start implementation, QA, staging or committing. Specialists return at the selected Spec -> tickets endpoint.
