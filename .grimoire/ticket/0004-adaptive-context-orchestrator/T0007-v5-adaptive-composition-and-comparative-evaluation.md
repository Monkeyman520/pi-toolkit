# V5 adaptive strategy composition and comparative evaluation

**Ticket ID:** T0007
**Source:** [Spec 0007](../../spec/0007-adaptive-context-orchestrator.md) — R02, R07, R11, R12, R15, R16; scenarios E02, E09, E10, E13. [ADR 0006](../../adr/0006-task-aware-context-working-set-and-isolation.md).
**Status:** Todo

## Goal

Select and verify event-triggered combinations of available strategies, with evidence about task continuity and total cost rather than a fixed-watermark or compression-only success claim.

## Affected Surfaces

Candidate ranking/adaptation, ordered action orchestration, aggregate outcome feedback, prediction comparison, task fixtures/control traces and evaluation reports.

## Approach

Compose the delivered exact-prune, compaction and delegation capabilities through runtime validation. Use task/content/pressure evidence, rules first, semantic calls only at the justified triggers, and explicit no-op. Evaluate candidate utility and cache/coordination costs using real outcomes; no invented weights or superiority thresholds become acceptance facts.

## Dependencies and Coordination

- **Blocked by:** T0004, T0005 and T0006 provide actual verified executors/outcomes; a simulated executor alone cannot establish safe end-to-end strategy composition.
- **Blocks:** T0008 verifies integrated host-boundary behavior across the completed strategy set.
- **Coordination risks:** Evaluation fixtures must preserve comparable task outcomes and distinguish estimate quality from actual token/cost/cache measurements. Available/authorized stage capabilities constrain choices; V1 must remain passive.

## Acceptance

- [ ] Low-occupancy impending growth, high-occupancy near-completion, completed-research redundancy and phase-change fixtures produce evidence-backed candidates/no-op without a fixed order/watermark rule (E02).
- [ ] Ordered combinations can checkpoint/offload/delegate/prune/compact as appropriate; failed or stale prerequisites stop dependent actions and preserve recovery (E10).
- [ ] Only available, authorized, safe and budget-valid actions execute; confirmation-required steps cannot inherit permission from an earlier automatic exact-prune step (E09).
- [ ] Ordinary stable turns do not trigger mandatory extra model decisions; substantive task changes, forecast deterioration and semantic conflicts are explainable triggers.
- [ ] Prediction/decision traces identify estimated savings/continuity/recovery/risk/overhead and compare with observed results; task-dependent weighting is evaluated, not asserted optimal.
- [ ] Comparable adaptive and no-ACO/fixed-watermark or compaction-only runs report task success/continuity, recovery attempts/failures, mistaken decisions, total parent/child/management tokens/cost, latency and human interventions (E13).
- [ ] Cache-read/write/new-input effects and missing provider metrics are explicit. Reduced main-agent context alone cannot establish lower total cost or superiority.
- [ ] Controlled runtime composition and real representative-task evidence are distinguished; hypothetical percentage traces are not benchmark results.

## Out of Scope

Invented quantitative acceptance thresholds, unconditional “adaptive wins” claims, a strategy order fixed by occupancy, or adding new strategy types beyond the approved contract.

## Verification contract

Run the affected package's type check, Biome and Vitest separately and record the tested versions. Supply a controlled Pi loading/usage check for this ticket's delivered behavior; mock-only hooks and direct Node entry execution are insufficient. Keep the package README/configuration and permissions accurate as capabilities change. This ticket describes future verification, not checks already performed.
