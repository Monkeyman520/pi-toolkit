# V4 authorized bounded subagent delegation

**Ticket ID:** T0006
**Source:** [Spec 0007](../../spec/0007-adaptive-context-orchestrator.md) — R03, R05, R06, R10, R11, R12, R14, R15, R16; scenarios E05, E09, E10, E11, E14. [ADR 0006](../../adr/0006-task-aware-context-working-set-and-isolation.md).
**Status:** Todo

## Goal

Offload suitable independent tasks to authorized independent child contexts without whole-history copying, unsafe concurrent writes or unbounded aggregate cost.

## Affected Surfaces

Delegation capability adapter, minimal task/result contracts, configured scheduling bounds, write-conflict checks, child evidence access, cancellation and parent graph/checkpoint reconciliation.

## Approach

Choose/verify an actual delegation provider within the spec rather than silently mandating a referenced project. Feed explicit task constraints/resources/acceptance and authorized evidence references to children. Enforce depth/concurrency/total-token limits and preserve failure/cancellation state. Reuse agreed validation/authorization contracts where available without requiring a compaction feature.

## Dependencies and Coordination

- **Blocked by:** T0002 supplies task/dependency/independence/conflict analysis; T0003 supplies verified scoped evidence and continuity checkpoints.
- **Blocks:** T0007 requires a bounded delegation executor and aggregate outcomes for combinations.
- **Coordination risks:** T0004/T0005 may change shared guard/authority/status contracts. Coordinate those files/interfaces; they are not additional semantic blockers for delegation. Validate overlapping resource claims before concurrent writers, rather than treating shared files as a reason to delegate anyway.

## Acceptance

- [ ] Parent hands off goal, constraints, acceptance, allowed resources/work and necessary references, not the full conversation; children use independent contexts (R10).
- [ ] Results contain deliverables/modified resources, conclusions, evidence, tests and unresolved issues; parent verifies/reconciles them rather than equating return with success.
- [ ] Default confirmation, denial, explicit automation and unauthorized non-interactive behavior match R11; no authority bypasses other checks (E09).
- [ ] Finite configured depth, concurrency and aggregate parent/child/coordination token limits are enforced, including exhausted-budget/no-launch cases (E11).
- [ ] Overlapping writers and tightly coupled tasks are not scheduled as safely independent without resolving the risk; suitable independent tasks can run with bounded scope.
- [ ] Authorized children recall only necessary allowed segments; possession of IDs does not bypass project/task-lineage scope (E05).
- [ ] Failed/cancelled children remain unfinished/failed, do not cause unlimited replacement tasks, and cannot write stale parent-session state; checkpoints/outcomes reconcile on resume (E10).
- [ ] Missing provider capability reports recommendation/local continuation instead of false execution; plugin cleanup affects only owned children/resources (E14).
- [ ] A controlled Pi parent/child exercise measures main-agent working-set isolation alongside aggregate token/cost/latency, not parent savings alone.

## Out of Scope

Mandatory delegation of inseparable tasks; a particular third-party backend; default cross-project recall; unrestricted recursive dispatch; implementing native compaction as a prerequisite.

## Verification contract

Run the affected package's type check, Biome and Vitest separately and record the tested versions. Supply a controlled Pi loading/usage check for this ticket's delivered behavior; mock-only hooks and direct Node entry execution are insufficient. Keep the package README/configuration and permissions accurate as capabilities change. This ticket describes future verification, not checks already performed.
