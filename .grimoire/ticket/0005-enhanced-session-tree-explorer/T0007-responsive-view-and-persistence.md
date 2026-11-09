# Keep a readable responsive view and restore per-session preferences

**Ticket ID:** T0007
**Source:** [Spec 0008](../../spec/0008-enhanced-session-tree-explorer.md) (R11-R12; rendering portion of R03/R14; R13 precedence; R15; E06); sources U1/U2/U3 and repository/host contracts as cited there
**Status:** Todo

## Goal

Explorer adapts to terminal width, preserves compound states and restores user view preferences without polluting session history.

## Affected Surfaces

Viewport/overscan rendering, header/search/details/footer layout, Unicode truncation, view Actions, separate per-session state files and restart/replacement tests.

## Approach

Use T0002's actual focus/filter/manual-fold state and T0003's validated effective-config boundary. Render the ContextMetrics contract with synthetic fixtures before T0006 integration, rather than introducing a false dependency. Persist only the allowed state, with session identity and stale-ID filtering; accepted search reveals are temporary and must not become saved folds.

## Dependencies and Coordination

- **Blocked by:** T0002, T0003. See the relationship README for concrete producer reasons.
- **Blocks:** Integrated acceptance T0008.
- **Coordination risks:** Blocked on T0002's state to persist and T0003's real layering/persistence boundary. T0004 and T0006 can develop concurrently against stable search/status/metric seams; coordinate shared renderer wiring. T0005 must trigger disposal/rebinding on replacement.

## Acceptance

- [ ] Complete R11 layout at >=120, 80-119 and <80 columns, respecting configured context/model/detail visibility and keeping tree connectors aligned for long/wide Unicode text.
- [ ] Header/counts/mode, tree, search, selection details and key hints are present. Root/selection/active/label/hit/fold/estimated/unknown states can coexist without a single icon concealing other state.
- [ ] view.toggleDetails/toggleContext/cycleDepthMode/cycleLayout/reset are reachable. Integrate view.help/toggleVim from T0002 and view.reloadConfig from T0003 without duplicate handlers.
- [ ] Viewport plus configured overscan bounds rendered work; selection-only changes reuse the raw index and do not wait for context computation. Empty/filtered/malformed states retain refresh/settings/exit access.
- [ ] Persist view overrides, last filters/focus, manual folds/expansions, density and depth mode outside Session JSONL, isolated by sessionId under the resolved Pi agent directory.
- [ ] Do not persist search results/reveals, queued/running commands, obsolete computations or busy state. Ignore stale IDs; different and replacement sessions do not inherit old mutable ownership.
- [ ] Restart restoration observes configuration precedence and rememberManualOverrides; it does not append CustomEntry noise or mutate raw history.
- [ ] Tests use realistic fold/filter state plus estimated/unknown ContextMetrics fixtures; actual Pi resize/restart usage verifies display and persistence rather than claiming correctness from screenshots alone.
- [ ] Pass typecheck/Biome/Vitest and the slice's actual Pi TUI smoke; leave integrated cross-platform/performance evidence to T0008.

## Out of Scope

Persisting transient search/execution state, changing raw session history, exact token guarantees, native /tree replacement and new layout-density semantics beyond the supplied configurable behavior.

## Coordination contract

Consume settled requirements and established solution choices from the Spec. Organize and verify them; do not invent or revise domain facts, requirements, architecture, constraints or acceptance semantics. Return needed new material decisions to refinement/clarification. CONTEXT/ADR recording is separately unauthorized and Pending; it does not block this ticket set. This artifact is not permission to start implementation, QA, staging or committing. Specialists return at the selected Spec -> tickets endpoint.
