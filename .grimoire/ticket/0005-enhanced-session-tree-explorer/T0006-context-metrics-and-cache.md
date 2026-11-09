# Show branch-correct context estimates with honest provenance

**Ticket ID:** T0006
**Source:** [Spec 0008](../../spec/0008-enhanced-session-tree-explorer.md) (R10; depth/snapshot contract in R02; R14-R15; E05); sources U1/U2/U3 and repository/host contracts as cited there
**Status:** Done

## Goal

Selected and viewport entries receive read-only Context metrics that honor compaction, path-local edits and historical model identity, without false precision or UI blocking.

## Affected Surfaces

Canonical projection adapter, model/window resolver, ContextMetrics service, bounded lazy cache/scheduler, provenance/detail integration and fixtures.

## Approach

Prefer public Pi 1.5.0 buildSessionProjection/buildSessionContext for a specified leaf and ctx.getContextUsage for the active position. Do not duplicate canonical projection unless a supported host actually lacks a required helper; any such compatibility gap returns to clarification if it changes the contract. Implement nullable/provenance results and lazy scheduling independently of the renderer through the Spec seam.

## Dependencies and Coordination

- **Blocked by:** T0001. See the relationship README for concrete producer reasons.
- **Blocks:** Integrated acceptance T0008.
- **Coordination risks:** T0007 consumes metrics/provenance fixtures and supplies viewport requests; neither needs the other's completed implementation to build against the Spec seam. T0005 owns replacement effects while both tickets share lifecycle invalidation contracts. T0003 supplies effective config through the agreed interface.

## Acceptance

- [x] ContextMetrics exposes nullable tokens/window/percentage, modelId, source and estimated. Zero is not used for unknown; active-context API data is not automatically labeled exact.
- [x] Historical effective context is projected read-only from the chosen node, not cumulative ancestor usage and not a temporary host resetLeaf or model request.
- [x] Fixtures cover multiple compactions, firstKeptEntryId/retain-none boundaries, summaries and system/tool checkpoints, branch summaries and path-local latest context edits with cross-branch isolation.
- [x] Historical model changes and selected/answering model distinctions resolve an appropriate context window or honestly return unknown; old nodes never silently borrow the active model window.
- [x] Estimate/usage-baseline/unknown displays preserve provenance even when display preferences hide a specific glyph. Prompt/tool/context/provider rewrite limitations are documented.
- [x] Cache keys include sessionId, revision, entryId, model identity and projection version; bounded LRU honors cacheSize. Compute selected then viewport then neighboring entries; folded descendants are not all eagerly evaluated.
- [x] Rapid selection/query/session/model changes cancel or version-gate obsolete work. Session replacement invalidates old caches/references, and rendering/input never awaits estimation.
- [x] Failure/unknown states and current active null usage have tests, alongside cache hit/invalidation behavior and raw/turn/branch depth presentation.
- [x] Pass typecheck/Biome/Vitest and actual Pi canonical-projection/context-usage comparison smoke without extra model calls or session changes. Preserve evidence distinguishing API estimates from actual request size.

## Out of Scope

Exact future provider-payload token guarantees, per-node model calls, modifications to model context assembly, changing compaction semantics and a global shared mutable cache.

## Coordination contract

Consume settled requirements and established solution choices from the Spec. Organize and verify them; do not invent or revise domain facts, requirements, architecture, constraints or acceptance semantics. Return needed new material decisions to refinement/clarification. CONTEXT/ADR recording is separately unauthorized and Pending; it does not block this ticket set. This artifact is not permission to start implementation, QA, staging or committing. Specialists return at the selected Spec -> tickets endpoint.