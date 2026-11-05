# Adaptive Context Orchestrator ticket set

**Source:** [Spec 0007](../../spec/0007-adaptive-context-orchestrator.md), including its settled conversation handoff S1–S6.
**Ticket folder:** `.grimoire/ticket/0004-adaptive-context-orchestrator/`
**Status:** In Progress — T0001/T0002 verified Done; controlled V1 observation/recommendations complete. T0003–T0008 remain Todo.
**Architecture:** [ADR 0006](../../adr/0006-task-aware-context-working-set-and-isolation.md), alongside the collection's [package reference](../../../packages/README.md) and ADRs referenced by the spec.

## Overview and execution handoff

Deliver ACO as an independently installable Pi plugin: observe → predict → decide → execute → verify. Optimize continuity and a recoverable task-dependent working set, not compression alone.

Settled constraints:

- The complete contract is in scope with V1–V5 delivery. V1 is observation/recommendation only, including task/phase awareness and available context references; metadata persistence does not authorize strategy execution. The complete semantic graph is established with V2 automatic-pruning protection, not added as a V1 prerequisite.
- Later automatic exact offloading/pruning requires verified recovery, dependency protection, legal messages, scope and budget checks before effects.
- Semantic replacement, ACO-initiated native global compaction and delegation require user confirmation by default. Applicable explicit authorization can permit automation but cannot bypass safety/budget checks. Unauthorized non-interactive proposals remain recommendations.
- Evidence is isolated by project and current task session lineage; authorized children receive necessary segments, not default cross-project access or whole-parent history. No default remote upload.
- Historical evidence recovery is distinct from current workspace fact acquisition.
- Preserve raw history and active branch semantics; use supported host interfaces, not direct JSONL rewriting or mutable methods assumed on read-only extension contexts.
- Use the established package stack, unified commands/completion/TUI configuration, loaded-only discovery and independent ownership. No host fork or mandatory collection manager.
- The formulas, interface sketches and percentages in the original proposal are illustrative. No storage engine, delegation provider, publication identity, literal command/package name, calibrated weights, budget values or forecast/benchmark thresholds have been selected. Choose mechanisms within the contract; do not invent approved behavior or measured performance.

**Current permissions:** Refinement produced documentation only. Explicit `grimoire-loop T0001` and `grimoire-loop T0002` invocations subsequently authorized those tickets' implementation and quality checks. Their [T0001](./T0001-v1-context-monitor-and-plugin-control.md#t0001-execution-receipt--2026-11-05) and [T0002](./T0002-v1-task-context-graph-and-recommendations.md#t0002-execution-receipt--2026-11-05) receipts record completion. Other tickets, staging/committing/publishing and requirement changes remain unauthorized.

**Record result:** ACO/Context Working Set concepts and the ADR index are in [CONTEXT](../../CONTEXT.md). ADR 0006 contains the confirmed boundaries and dated authorization clarification. No qualifying knowledge update or blocking behavioral question remains pending.

## Delivery Surfaces

| Surface | Ownership / outcomes |
| --- | --- |
| New plugin package | T0001 owns initial package setup, manifest/tooling, host wiring, configuration/UI and isolated loading; each later consumer extends its own behavior/tests/docs. |
| Pressure/task/context state | T0001 observes real/estimated usage; T0002 adds task phases, protected source references and recommendations; T0004 completes the semantic context graph before automatic pruning. |
| Evidence and continuity | T0003 owns scoped originals/index/checkpoints/recall, readback verification, historical freshness distinction and branch reconstruction. |
| Exact execution boundary | T0004 establishes the full dependency/protection graph and first consumes guarded storage/projection/append-only edits, valid-message checks and partial-commit/restoration behavior. |
| Higher-impact strategies | T0005 provides confirmed/authorized local/native compaction; T0006 provides independently bounded dispatch, child recall and parent reconciliation. |
| Adaptive evaluation | T0007 composes actual executors, records cost/cache/task outcomes and compares controls without invented success thresholds. |
| Integrated host evidence | T0008 validates real Pi persistence/projection/lifecycle, faults, isolation, TUI/non-TUI permissions, co-loaded extensions and documentation claims. |

Shared machinery belongs with its first real consumer. No separate global refactor/scaffolding ticket is required, and ordinary support-library reuse must preserve plugin-owned state and independent installation.

## Dependencies

These are semantic blockers for completing/verifying the consumer, not a prohibition on drafting tests or working against agreed contracts.

| Producer | Consumer | Why consumer cannot be completed/verified first |
| --- | --- | --- |
| T0001 | T0002 | Recommendations need the actual installed observation/control boundary and runtime evidence. |
| T0001 | T0003 | Store/recall integration needs the installed lifecycle/configuration owner. |
| T0002 | T0004 | Exact pruning must validate active/protected task/context dependencies. |
| T0003 | T0004 | Unloading requires persisted/readback-verified originals and recovery checkpoints. |
| T0004 | T0005 | Local semantic replacement needs the guarded durable edit/restoration and partial-failure boundary. |
| T0002 | T0006 | Delegation needs task independence/dependency/write-conflict evidence. |
| T0003 | T0006 | Children need scoped verified recall and parent continuity checkpoints. |
| T0004 | T0007 | Adaptive composition must use a real exact-prune executor and its outcomes. |
| T0005 | T0007 | Adaptive composition must use verified local/native compaction and authority checks. |
| T0006 | T0007 | Adaptive composition must use bounded actual delegation and aggregate outcomes. |
| T0007 | T0008 | Final host-boundary evidence requires the integrated strategy set and decision/outcome flow. |

## Coordination

| Tickets | Risk | Strategy |
| --- | --- | --- |
| T0002, T0003 | Shared task/source/context IDs and checkpoint provenance | Parallel work against the spec's explicit reference/scope contract; do not make semantic inference a prerequisite for storage fixtures. |
| T0004, T0005, T0006 | Shared validation, authority, budget, result and status/config surfaces | Coordinate ownership and integrate compatible changes; shared files alone do not add blockers. Delegation does not require local/native compaction. |
| T0005, T0006 | Default confirmation and non-interactive authorization behavior may drift | Use the same R11 authority semantics and shared fixtures; do not infer broader permission from generic enablement. |
| T0001–T0008 | Later features could accidentally activate during V1 | Preserve an explicit observation-only boundary and regression evidence in every stage; setup/UI capability listings must remain truthful. |
| T0004–T0008 | Session edits coexist with other context-changing extensions and retries | Verify actual final projections/proposals, legal messages and settled lifecycle; do not assume load order makes ACO authoritative. |
| T0007, T0008 | Measurement claims can conflate main-agent savings, raw accounting and aggregate cost | Share comparable fixtures and label estimates, provider gaps and actual evidence; preserve task-success and recovery outcomes. |

## Recommended Order and stage exits

1. T0001 establishes a usable passive monitor; T0002 completes task-aware V1 recommendations. V1 exit requires both and proves no strategy executes.
2. T0003 can proceed alongside T0002 after T0001 using explicit source/task fixtures. T0004 then completes recovery-gated V2 pruning.
3. T0005 delivers V3 compaction. T0006 delivers V4 delegation; implementation can proceed independently once T0002/T0003 are ready, coordinating shared authority/guard surfaces. V3/V4 numbering describes delivery milestones, not a requirement that delegation depend on compaction.
4. T0007 delivers evaluated V5 compositions after all executors are verifiable.
5. T0008 establishes integrated real-host evidence across the set.

The dependency graph is acyclic. Each producer has its own tests and Pi smoke evidence; final integration is not permission to defer local verification. A stage is delivered only when its relevant contracts/evidence pass, not when a document or stub exists.

## Ticket Index

| Ticket | File / outcome | Stage | Blocked by | Status |
| --- | --- | --- | --- | --- |
| T0001 | [V1 context monitor and independent plugin control](./T0001-v1-context-monitor-and-plugin-control.md) | V1 | None | Done |
| T0002 | [V1 task/context references and explainable recommendations](./T0002-v1-task-context-graph-and-recommendations.md) | V1 | T0001 | Done |
| T0003 | [V2 scoped evidence store, checkpoints and recall](./T0003-v2-scoped-evidence-store-checkpoints-and-recall.md) | V2 | T0001 | Todo |
| T0004 | [V2 recovery-gated exact pruning and restoration](./T0004-v2-recovery-gated-exact-pruning.md) | V2 | T0002, T0003 | Todo |
| T0005 | [V3 authorized semantic replacement and native compaction](./T0005-v3-authorized-semantic-and-native-compaction.md) | V3 | T0004 | Todo |
| T0006 | [V4 authorized bounded subagent delegation](./T0006-v4-authorized-bounded-subagent-delegation.md) | V4 | T0002, T0003 | Todo |
| T0007 | [V5 adaptive strategy composition and comparative evaluation](./T0007-v5-adaptive-composition-and-comparative-evaluation.md) | V5 | T0004, T0005, T0006 | Todo |
| T0008 | [Integrated Pi lifecycle, recovery and isolation evidence](./T0008-integrated-pi-lifecycle-recovery-and-isolation-evidence.md) | Cross-stage | T0007 | Todo |

## Requirements coverage

A listed ticket owns the mapped acceptance or its integrated proof; shared invariants are not redefined in each ticket.

| Spec requirement | Tickets |
| --- | --- |
| R01 | T0001, T0008 |
| R02 | T0001, T0007 |
| R03 | T0002, T0006 |
| R04 | T0002, T0004 |
| R05 | T0003, T0006, T0008 |
| R06 | T0003, T0006, T0008 |
| R07 | T0002, T0007 |
| R08 | T0004, T0008 |
| R09 | T0005, T0008 |
| R10 | T0006, T0008 |
| R11 | T0004, T0005, T0006, T0007, T0008 |
| R12 | T0003, T0004, T0005, T0006, T0007, T0008 |
| R13 | T0004, T0005, T0008 |
| R14 | T0001, T0003, T0004, T0005, T0006, T0008 |
| R15 | T0001, T0002, T0004, T0005, T0006, T0007, T0008 |
| R16 | T0001, T0002, T0003, T0004, T0005, T0006, T0007, T0008 |

## End-to-end scenario coverage

| Spec scenario | Tickets |
| --- | --- |
| E01 | T0001, T0008 |
| E02 | T0001, T0002, T0007 |
| E03 | T0002 |
| E04 | T0003, T0004, T0008 |
| E05 | T0003, T0006, T0008 |
| E06 | T0003, T0004, T0008 |
| E07 | T0004, T0008 |
| E08 | T0005, T0008 |
| E09 | T0005, T0006, T0007, T0008 |
| E10 | T0004, T0005, T0006, T0007, T0008 |
| E11 | T0006, T0008 |
| E12 | T0004, T0008 |
| E13 | T0007, T0008 |
| E14 | T0001, T0006, T0008 |

## Completion and limits

The refinement endpoint is complete when these documents and source/coverage/dependency links are checked; this is not implementation completion. During execution, every ticket needs observable acceptance, package-local typecheck/Biome/Vitest and affected Pi runtime evidence. T0008 supplies the integrated receipt, and T0007 supplies comparison evidence; neither may replace measurements with hypothetical percentages or promise unsupported superiority.

If execution exposes a needed new requirement, permission, domain fact or architecture choice outside this contract, return it to refinement. Do not invent it downstream or treat an implementation convenience as approval. Relevant official APIs/types/examples and any proposed third-party backend still require implementation-time verification.

To execute, the user may invoke `grimoire-loop` against this README, starting with T0001 (then T0002 for the V1 milestone). This document does not start that workflow.
