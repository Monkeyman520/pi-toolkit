# Verify full v1.0, performance, platform input and installability

**Ticket ID:** T0008
**Source:** [Spec 0008](../../spec/0008-enhanced-session-tree-explorer.md) (R01-R15; E01-E07; final Definition of Done); sources U1/U2/U3 and repository/host contracts as cited there
**Status:** Todo

## Goal

Produce honest integrated evidence that the complete independently installed v1.0 satisfies the Spec, or explicitly identify remaining acceptance blockers.

## Affected Surfaces

Integrated unit/host/TUI tests, dataset generator/benchmarks, package-local check/smoke commands, CI gates, configuration examples/schema, README and actual package catalog documentation.

## Approach

Combine the already tested slices; this is integrated acceptance, not a substitute for per-ticket verification. Generate the specified topology/text/compaction/label workloads, measure named operations and verify actual host lifecycle and cross-platform input. Use outside-checkout installation with declared dependency delivery. Keep measured shortcomings visible; do not silently remove P2 features or relax source targets.

## Dependencies and Coordination

- **Blocked by:** T0001, T0002, T0003, T0004, T0005, T0006, T0007. See the relationship README for concrete producer reasons.
- **Blocks:** None.
- **Coordination risks:** All producers block integrated completion because their actual feature paths must be exercised together. Collect their local evidence rather than rerunning solely as mock tests. Changes uncovered here stay within the Spec; new semantic decisions return to clarification. CI settings changes happen only during authorized implementation, not this artifact-writing session.

## Acceptance

- [ ] Every R01-R15 outcome and every Action in the Spec maps to executable tests or explicitly recorded user-visible verification; all E01-E07 scenarios are exercised with source traceability.
- [ ] Package-local tsc --noEmit, Biome and non-empty Vitest pass separately; CI runs the actual supported quality gates. No bundling/emitted build is required.
- [ ] Actual isolated Pi installation/loading outside sibling availability proves dependency/resource discovery and /stree behavior. Unrelated sibling plugins are not activated; installed-only configuration discovery still works.
- [ ] Actual host scenarios verify browse-only file/leaf invariance, native Navigate/editor outcomes, distinct independent Fork At/Before, original history preservation, busy/compaction/cancel/error behavior and no stale references after replacement.
- [ ] Integrated search cancellation/acceptance/clear, intersecting filters, key prefix conflicts/mode changes, trust/layer/reload policy, labels/clipboard feedback and restart restoration meet the adopted clarifications.
- [ ] Context projection comparison covers compaction/system/tools/edit/model boundaries and unknown provenance; no estimate is advertised as exact future payload size.
- [ ] Benchmark 100/1,000/5,000/20,000-entry linear/wide/deep and mixed-content fixtures, plus 10,000-entry first open; include long text, tools, compactions and labels. Collect all six R14 P95 metrics with environment, bytes and sampling method.
- [ ] Performance targets are met or each deviation is explicitly documented as allowed by the original DoD; no fabricated P95 or silently lowered target is accepted. Verify stale-task cancellation and refresh/exit remain responsive.
- [ ] Basic real keyboard interactions are verified in Windows Terminal, WSL and a common Unix terminal. Missing platform access is a remaining acceptance blocker, not a passing mocked check.
- [ ] README/schema/examples/catalog describe real resources, install/setup/check/smoke commands, effective actions/configuration, compatibility, full-process permissions, explicit file/session/clipboard effects, estimate limitations and verified evidence.
- [ ] Final readiness distinguishes completed artifacts, passing automated checks, actual runtime/platform evidence and any remaining blockers. No claim of v1.0 completion while a required advanced/P2 feature is absent.

## Out of Scope

External publication/credentials, host patches, upstream /tree integration, introducing a separate implementation-plan stage and accepting untested platforms as verified.

## Coordination contract

Consume settled requirements and established solution choices from the Spec. Organize and verify them; do not invent or revise domain facts, requirements, architecture, constraints or acceptance semantics. Return needed new material decisions to refinement/clarification. CONTEXT/ADR recording is separately unauthorized and Pending; it does not block this ticket set. This artifact is not permission to start implementation, QA, staging or committing. Specialists return at the selected Spec -> tickets endpoint.
