# V2 recovery-gated exact pruning and restoration

**Ticket ID:** T0004
**Source:** [Spec 0007](../../spec/0007-adaptive-context-orchestrator.md) — R04, R08, R11, R12, R13, R14, R15, R16; scenarios E04, E06, E07, E10, E12. [ADR 0006](../../adr/0006-task-aware-context-working-set-and-isolation.md).
**Status:** Todo

## Goal

Reduce the actual model-visible working set through recoverable exact offloading/pruning while preserving task dependencies, raw history and valid model messages.

## Affected Surfaces

Full semantic context graph/protection checks and the first strategy executor, runtime validation/commit/restoration, request-local projection, supported append-only edits, action/checkpoint outcomes and before/after measurements.

## Approach

Keep shared execution guards with this first consuming strategy. Validate current task/branch, protected dependencies, recoverability, structure, scope and budgets before effects. Distinguish reversible request projection from durable boundary drafts. Handle partial persistence explicitly rather than assuming a transaction across the store and session.

## Dependencies and Coordination

- **Blocked by:** T0002 provides active/protected consumers and candidate reasoning; T0003 provides verified persisted originals, checkpoints and scoped recovery.
- **Blocks:** T0005 uses the validated edit/recovery boundary for local semantic replacements; T0007 needs this actual exact-prune executor for combinations.
- **Coordination risks:** Other extensions can modify context/boundary proposals. Preserve their fields/proposals and verify final legal context. T0006 may develop against the shared validation/outcome contract without requiring pruning to launch a child.

## Acceptance

- [ ] Redundant/obsolete candidates are checked using dependencies and recoverability, not age or occupancy alone; V1 mode cannot execute this capability (R08, R16).
- [ ] Persist/readback recovery, current branch/scope, protected content, structural and budget checks precede unload; failure preserves the affected original (E04).
- [ ] The full R04 semantic graph tracks segment kinds/categories, source/task/dependency/summary/storage metadata, estimated size/relevance/recoverability and pinned/active consumers, supporting explicit declarations as well as identified inference. Protected constraints/decisions/unfinished state and active exact evidence cannot be automatically removed without a verified equivalent representation.
- [ ] Request-local filtering and durable context_edit omission have separate observable lifecycles. One successful filtered request does not authorize persistence (E07).
- [ ] Source IDs/raw history/metadata/accounting remain intact; no JSONL rewriting or assumed mutable extension SessionManager is used.
- [ ] Paired tool exchanges and system/tool declarations remain legal; tool identity/call IDs/error meaning and structured content are preserved or explicitly validated (R13, E07).
- [ ] A controlled Pi request actually excludes the permitted content, while verified restoration makes its original contribution available again; branch navigation demonstrates branch-relative effects (E06).
- [ ] Storage failure, cancellation, partial session append and session replacement stop dependent actions, reconcile persisted state on restart and cannot yield blind duplicate edits or stale-session writes (E10).
- [ ] Before/after context evidence is separated from preserved session accounting, estimated savings and cache/cost effects (R15); boundary-handler composition and parallel-call fixtures preserve correct proposals (E12).

## Out of Scope

Newly generated semantic replacements and ACO-initiated global compaction (T0005); deletion of raw originals; using exact-prune permission to bypass higher-impact authorization.

## Verification contract

Run the affected package's type check, Biome and Vitest separately and record the tested versions. Supply a controlled Pi loading/usage check for this ticket's delivered behavior; mock-only hooks and direct Node entry execution are insufficient. Keep the package README/configuration and permissions accurate as capabilities change. This ticket describes future verification, not checks already performed.
