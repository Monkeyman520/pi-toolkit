# V5 adaptive strategy composition and comparative evaluation

**Ticket ID:** T0007
**Source:** [Spec 0007](../../spec/0007-adaptive-context-orchestrator.md) — R02, R07, R11, R12, R15, R16; scenarios E02, E09, E10, E13. [ADR 0006](../../adr/0006-task-aware-context-working-set-and-isolation.md).
**Status:** In Progress — controlled composition verified; representative-task evaluation and policy validation remain open

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

- [x] Low-occupancy impending growth, high-occupancy near-completion, completed-research redundancy and phase-change fixtures produce evidence-backed candidates/no-op without a fixed order/watermark rule (E02).
- [x] Ordered combinations can checkpoint/offload/delegate/prune/compact as appropriate; failed or stale prerequisites stop dependent actions and preserve recovery (E10).
- [x] Only available, authorized, safe and budget-valid actions execute; confirmation-required steps cannot inherit permission from an earlier automatic exact-prune step (E09).
- [x] Ordinary stable turns do not trigger mandatory extra model decisions; substantive task changes, forecast deterioration and semantic conflicts are explainable triggers.
- [ ] Prediction/decision traces identify estimated savings/continuity/recovery/risk/overhead and compare with observed results; task-dependent weighting is evaluated, not asserted optimal.
- [ ] Comparable adaptive and no-ACO/fixed-watermark or compaction-only runs report task success/continuity, recovery attempts/failures, mistaken decisions, total parent/child/management tokens/cost, latency and human interventions (E13).
- [x] Cache-read/write/new-input effects and missing provider metrics are explicit. Reduced main-agent context alone cannot establish lower total cost or superiority.
- [ ] Controlled runtime composition and real representative-task evidence are distinguished; hypothetical percentage traces are not benchmark results.

## Out of Scope

Invented quantitative acceptance thresholds, unconditional “adaptive wins” claims, a strategy order fixed by occupancy, or adding new strategy types beyond the approved contract.

## Verification contract

Run the affected package's type check, Biome and Vitest separately and record the tested versions. Supply a controlled Pi loading/usage check for this ticket's delivered behavior; mock-only hooks and direct Node entry execution are insufficient. Keep the package README/configuration and permissions accurate as capabilities change. This ticket describes future verification, not checks already performed.


## T0007 execution receipt

### Contract and delivered scope

The user's explicit grimoire-loop invocation of this ticket, followed by “continue”, authorizes this implementation and quality loop. Route: persisted plan → implementation/test-first slices → inline review + acceptance check → related fixes → integrated checks → scoped formatting → report. Plan: [0011](../../plans/0011-t0007-adaptive-composition.md). No delegated writes, commits, pushes, publication, discretionary human checkpoint or T0008 execution.

New package-local modules own rules-first selection (`policy.ts`), bounded ordering (`composition.ts`), actual executor adaptation (`adaptive.ts`) and honest usage/comparison records (`evaluation.ts`). Existing Continuity, exact-prune drafts, Compactor and Delegator still own their independent guards. The opt-in `adaptive` mode exposes `compose [JSON]`, `advance` and `composition`; V1 remains passive. No new strategy or decision-model dependency is added.

Composition runs command-only, with explicit advancement after persisted edit/native completion or parent child-result reconciliation. This deliberately adds no unbounded idle scheduler or automatic parent continuation. Arbitrary supplied ordering is not silently reordered; unavailable/unauthorized/stale/failed prerequisites stop dependent work. Offload uses the existing verified archive operation. Runtime scheduling is not replayed after restart.

### Verification over the integrated implementation

Windows; Node **26.13.0**, npm **11.20.0**, Pi **1.5.0**; package tooling TypeScript **5.9.3**, Biome **2.6.4**, Vitest **4.1.12**, TypeBox **1.3.27**.

| Command from `packages/pi-context-aco` | Result / evidence |
| --- | --- |
| `npm run typecheck` | Passed; no emit and erasable syntax. |
| `npm run check` | Passed after formatting changed sources and README; 76 informational style suggestions, no errors/warnings. |
| `npm test` | Passed: **142 tests, 16 files**. New policy/composition/accounting tests cover task-fit order changes, pending/commit authority barriers, cancellation/staleness, unknown usage and comparison identity. |
| `npm run smoke` | Passed; isolated installed package, passive transcript/tool equality and zero extra model calls. |
| `npm run smoke:tasks` | Passed; actual Pi E02/E03 task/pressure/no-op, protection, branch/resume and passivity. |
| `npm run smoke:prune` | Passed; actual projection/durable omission/restoration and branch isolation. |
| `npm run smoke:compact` | Passed; actual default RPC refusal, scoped grants, summaries/native completion, cancellation/interference, real session append failure and recovery. |
| `npm run smoke:delegate` | Passed; installed parent/children, necessary evidence, reservations, independent parent verification and restart authority revocation. |
| `npm run smoke:adaptive` | Passed; actual packed/independently installed Pi composition: checkpoint→prune→independently unauthorized semantic barrier; authorized semantic→offload; restoration; child→parent-reconciliation→checkpoint; native→checkpoint; restart/no replay. |
| `git diff --check` | Passed. |

A deliberate mutation inverted the pending-versus-complete inspection gate; `composition.test.ts` failed because the semantic step launched prematurely. The mutation was restored before final checks. Earlier failed test runs included invalid phase names in new test data, a smoke expectation about the existing restored-source restriction, and waiting for an inapplicable RPC event. These were test defects, not acceptance evidence.

Actual Pi also exposed a new native race: writing coordinator metadata after launching asynchronous native preparation invalidated Continuity's strict branch snapshot. Pending native receipt persistence now uses the executor's existing durable intent; coordinator terminal records wait for verification. The installed composition smoke reproduced failure before and passed after this fix. Review additionally retained edited-source exclusion, stale-session trace-write suppression, cancellation of owned executors, interrupted/uncertain-native refusal and superseded-summary detection.

### Comparison and acceptance assessment

[Controlled comparison JSON](./T0007-controlled-evaluation.json) records equivalent deterministic parent task turns, not representative model performance. Both runs met the fixture's scripted continuity assertion; adaptive restoration succeeded once with zero recovery failures. No-ACO/adaptive parent projection sizes were **123067 / 76893 bytes**; fixture total parent tokens **185453 / 140370**; measured wall times **811.52 / 3220.03 ms** in this parallel smoke run. The larger adaptive latency includes scripted management/storage actions. Child/management model tokens were zero **within this paired window**; the later child/native mechanism checks are outside that comparison. Fixture usage is text-length/4 with zero tariffs and cache counters, not live provider metering or proof of savings. Scripted grants/control commands are explicitly identified; zero human interventions does not mean no control overhead.

- Acceptance 1–4: matched within the selected rules-first/controlled-runtime boundary, including task-specific order changes rather than occupancy thresholds and independent higher-impact authority.
- Acceptance 5: partial. Decisions expose estimates/continuity/recovery/risk/overhead/cache and prior-projection versus next-host-estimate comparison; executor receipts distinguish actual persisted effects from estimates. This is not matched-horizon forecast scoring, calibrated utility or representative task-dependent weighting evaluation.
- Acceptance 6: controlled comparison supplied; **real representative-task comparison remains missing**. Passing fixture assertions cannot establish task success/continuity on an actual coding workload.
- Acceptance 7: matched disclosure/accounting boundary. Provider gaps remain unknown and neither smaller parent context nor synthetic counters imply lower total cost/superiority.
- Acceptance 8: evidence classes are explicitly distinguished, but **no representative-task evidence exists yet**. No hypothetical percentage trace is called a benchmark.

### Remaining work and verdict

**Issues remaining, not Done.** The enabled implementation/static/unit/controlled-Pi gates passed and inline review found no remaining confirmed code blocker in the inspected diff. T0007 still cannot establish full acceptance: run real comparable representative coding tasks with trustworthy success/continuity/recovery/mistake/token/cost/cache/latency/intervention evidence and evaluate the task-dependent policy (without inventing an optimality threshold). No external provider benchmark, live spending or project-data upload was performed. The current no-ACO fixture control and explicit parameter requirements are documented, not substitutes for that evidence. T0008 remains unexecuted and blocked on T0007 completion.
