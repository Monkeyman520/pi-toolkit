# V3 authorized semantic replacement and native compaction

**Ticket ID:** T0005
**Source:** [Spec 0007](../../spec/0007-adaptive-context-orchestrator.md) — R09, R11, R12, R13, R14, R15, R16; scenarios E08, E09, E10. [ADR 0006](../../adr/0006-task-aware-context-working-set-and-isolation.md).
**Status:** Todo

## Goal

Preserve required task meaning through verified local summaries and native prefix compaction with confirmation-by-default and honest recovery/completion evidence.

## Affected Surfaces

Semantic summary generation/verification, local replacement payloads, native compaction hooks/callbacks, authorization UI/configuration, runtime checks and strategy outcome accounting.

## Approach

Consume the exact-edit/recovery boundary, adding semantic equivalence checks and the confirmed authorization policy. Distinguish selected-segment replacement from native history-prefix compaction. Observe completion/error rather than treating an asynchronous compaction request as success.

## Dependencies and Coordination

- **Blocked by:** T0004 supplies actual guarded append-only edits/restoration and partial-failure outcomes required to verify local semantic replacement safely.
- **Blocks:** T0007 requires verified compaction executors for adaptive combinations.
- **Coordination risks:** T0006 implements the same authorization semantics for dispatch and may proceed in parallel. Coordinate common permission/config/result fields without imposing a semantic dependency between delegation and compaction.

## Acceptance

- [ ] Summaries preserve conclusions, constraints, decision rationale, still-required exact details, provenance, dependencies and recovery references (R09).
- [ ] Verification failure or inaccessible originals leaves the current representation usable and prevents a lossy commit; a plausible summary is not proof of equivalence (E08).
- [ ] Local replacement uses supported context edits; native compaction is treated as prefix compaction, with customized summary and actual completion/failure observations.
- [ ] Interactive default confirmation, denial and explicitly authorized automation behave as R11 requires for both strategies (E09).
- [ ] Non-interactive proposals without applicable prior authorization do not mutate context or wait for unavailable UI confirmation.
- [ ] Explicit authorization cannot bypass recovery/dependency/structure/scope/budget checks; V1 remains observation-only.
- [ ] Native failure, cancellation or partial local commit reports actual state, stops dependent actions and retains verified recovery/checkpoint paths (E08, E10).
- [ ] Controlled Pi local-edit and native-compaction cases demonstrate task continuity, raw-history preservation and recovery; management/model/cache costs are accounted without claiming universal losslessness.

## Out of Scope

Arbitrary-range compression through the native prefix API; blanket permission to compact from generic plugin enablement; controlling unrelated extensions' or host-native user/automatic compaction.

## Verification contract

Run the affected package's type check, Biome and Vitest separately and record the tested versions. Supply a controlled Pi loading/usage check for this ticket's delivered behavior; mock-only hooks and direct Node entry execution are insufficient. Keep the package README/configuration and permissions accurate as capabilities change. This ticket describes future verification, not checks already performed.
