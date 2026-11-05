# V2 recovery-gated exact pruning and restoration

**Ticket ID:** T0004
**Source:** [Spec 0007](../../spec/0007-adaptive-context-orchestrator.md) — R04, R08, R11, R12, R13, R14, R15, R16; scenarios E04, E06, E07, E10, E12. [ADR 0006](../../adr/0006-task-aware-context-working-set-and-isolation.md).
**Status:** Done

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

- [x] Redundant/obsolete candidates are checked using dependencies and recoverability, not age or occupancy alone; V1 mode cannot execute this capability (R08, R16).
- [x] Persist/readback recovery, current branch/scope, protected content, structural and budget checks precede unload; failure preserves the affected original (E04).
- [x] The full R04 semantic graph tracks segment kinds/categories, source/task/dependency/summary/storage metadata, estimated size/relevance/recoverability and pinned/active consumers, supporting explicit declarations as well as identified inference. Protected constraints/decisions/unfinished state and active exact evidence cannot be automatically removed without a verified equivalent representation.
- [x] Request-local filtering and durable context_edit omission have separate observable lifecycles. One successful filtered request does not authorize persistence (E07).
- [x] Source IDs/raw history/metadata/accounting remain intact; no JSONL rewriting or assumed mutable extension SessionManager is used.
- [x] Paired tool exchanges and system/tool declarations remain legal; tool identity/call IDs/error meaning and structured content are preserved or explicitly validated (R13, E07).
- [x] A controlled Pi request actually excludes the permitted content, while verified restoration makes its original contribution available again; branch navigation demonstrates branch-relative effects (E06).
- [x] Storage failure, cancellation, partial session append and session replacement stop dependent actions, reconcile persisted state on restart and cannot yield blind duplicate edits or stale-session writes (E10).
- [x] Before/after context evidence is separated from preserved session accounting, estimated savings and cache/cost effects (R15); boundary-handler composition and parallel-call fixtures preserve correct proposals (E12).

## Out of Scope

Newly generated semantic replacements and ACO-initiated global compaction (T0005); deletion of raw originals; using exact-prune permission to bypass higher-impact authorization.

## Verification contract

Run the affected package's type check, Biome and Vitest separately and record the tested versions. Supply a controlled Pi loading/usage check for this ticket's delivered behavior; mock-only hooks and direct Node entry execution are insufficient. Keep the package README/configuration and permissions accurate as capabilities change. The execution receipt below records actual checks; the verification contract itself is not runtime evidence.

## T0004 execution receipt — 2026-11-05

**Outcome:** Done for T0004's V2 recovery-gated exact pruning and restoration. Spec 0007 remains In Progress; ADR 0006 remains Implementing. T0005–T0008, commits, publishing, host changes and compaction/delegation remain outside this invocation.

**Delivery:**
- `packages/pi-context-aco/extensions/tasks.ts` establishes the full R04 semantic context graph: segment categories (`user-constraint`, `acceptance-criteria`, `decision`, `active-evidence`, `completed-research`, `reproducible-data`, `redundant-content`, `execution-state`), storage references, recoverability, active consumer propagation from unfinished tasks and decisions, and protection guarantees preventing removal of protected constraints, decisions, unfinished state, or exact evidence without verified equivalent representation.
- `packages/pi-context-aco/extensions/prune.ts` implements candidate evaluation, structural integrity checks (paired assistant tool-call and tool-result validation; rejection of split multi-call exchanges or orphaned calls/results), request-local `context` projection, durable `context_edit` boundary drafts (`replacement: null`), verified restoration (`createRestoreBoundaryDrafts` restoring exact message content from evidence store), and branch reconciliation.
- `packages/pi-context-aco/extensions/config.ts` exposes `mode` (`"observe" | "exact-prune"`, defaulting to `"observe"` to preserve V1 passivity out of the box) and `maxPruneTokens`.
- `packages/pi-context-aco/extensions/commands.ts` exposes `/aco prune` and `/aco restore <id|all>`.
- `packages/pi-context-aco/extensions/index.ts` integrates dynamic hook management for `context` projection (unregistered in `observe` mode), `turn_end` boundary draft commits with existing draft preservation, branch prune reconciliation on `session_start` and `session_tree`, and separated before/after context evidence in status and traces.

### Acceptance evidence

| Criterion | Evidence |
| --- | --- |
| C1 — candidate evaluation & V1 mode | Unit tests and real Pi smoke verify that candidates require dependency and recoverability checks; in `observe` (V1) mode, zero candidates are eligible, no context hook is registered, and provider requests remain untouched. In `exact-prune` mode, eligible candidates are pruned when checks pass. |
| C2 — recovery precedes unload (E04) | Candidates without verified active-branch checkpoint receipts in the evidence store are rejected with `Unverified recovery`. Injected persistence/readback faults preserve affected originals in the model-visible context without unloading. |
| C3 — full R04 graph & protection | Semantic graph tracks categories, storage metadata, active consumers, and recoverability. User requirements, critical decisions, unfinished tasks, precision-sensitive errors, and active consumer dependencies are protected by default and cannot be removed without equivalent representation. |
| C4 — separate lifecycles (E07) | Request-local filtering (`context` event) transiently excludes candidates from provider requests without altering session entries or authorizing persistence. Durable omission uses supported `context_edit` boundary drafts at `turn_end`. |
| C5 — raw history intact | Raw session entries, source IDs, metadata, and accounting remain untouched in JSONL; no direct JSONL mutation or assumed mutable SessionManager is used. |
| C6 — paired tool exchanges & errors (R13, E07) | Tool result pruning requires the paired assistant tool call entry to be pruned together. If an assistant message contains multiple tool calls where some are active/protected, or if an error tool result occurred, pruning is rejected, preventing orphaned tool calls or results. |
| C7 — request exclusion & restoration (E06) | Real Pi RPC smoke test verifies that permitted content is excluded from model-visible provider requests. `/aco restore <id>` recalls verified originals and creates restore boundary drafts, making content model-visible again. Navigating branches demonstrates branch-relative effects. |
| C8 — faults, cancellation & duplicate prevention (E10) | Generation checks prevent stale-session async writes. If an entry is already omitted on the branch, duplicate `context_edit` drafts are avoided. Active-branch prunes are reconciled on session start and tree navigation. |
| C9 — separated evidence & composition (R15, E12) | Before/after context tokens and message counts are measured separately from preserved raw session history, estimated savings, and provider reported usage. `turn_end` preserves existing boundary drafts from other extensions. |

### Route, review and limits

Used persisted plan `.grimoire/plans/0008-t0004-recovery-gated-exact-pruning.md`: plan → test-first implementation → tests → inline code-risk review and acceptance check → affected fixes → integrated verification → targeted formatting and refreshed checks. No delegation or routine human checkpoint was requested. Reviews were inline self-review, not an independent review.

Confirmed and fixed during checks:
- TypeBox union type inference resolved to avoid `never` in segment category schema.
- Replaced `as any` casts with strongly-typed guards and narrowed interfaces for Biome compliance.
- Added Windows-safe file operation retry for `rename` to eliminate transient `EPERM` on rapid sequential writes.
- Fixed checkpoint segment linkage in `Continuity` by caching verified manifest segments from receipts so `linkCheckpoints` accurately binds stored segment IDs.
- Dynamically registered and unregistered the `context` hook in `index.ts` so V1 observe mode registers zero context filtering surfaces.

### Final verification

Windows; Pi **1.5.0**, Node **26.13.0**, npm **11.20.0**, TypeScript **5.9.3**, Biome **2.6.4**, Vitest **4.1.12**.

From `packages/pi-context-aco/`, separately executed and passing after the final code/format changes:

- `npm run typecheck` — `tsc --noEmit` passed with zero errors.
- `npm run check -- --diagnostic-level=warn` — 28 files checked; no errors/warnings.
- `npm test` — **90 tests / 7 files** passed (80 pre-change baseline tests + 10 new T0004 tests).
- `npm run smoke` — T0001 passivity, tool body equality, no extra model calls.
- `npm run smoke:tasks` — T0002 E02/E03 workload/no-op decisions and branch isolation.
- `npm run smoke:evidence` — T0003 recovery foundation, corrupt restart fallback, bounded recall.
- `npm run smoke:prune` — T0004 installed Pi exact pruning in real RPC session: V1 observe passivity, request-local projection, durable context_edit omission, verified restoration from evidence store, and branch-relative isolation.

From the root: `node scripts/package-support.mjs --check` (archive parity) and `git diff --check` passed.

## Authorized prerequisite repair during T0005

The T0005 loop independently reproduced gaps behind this ticket's earlier Done receipt: manifest membership could authorize pruning after an original vanished, restoration ignored the store, unrelated omitted targets were labelled verified, and declarations could be mutated through shared arrays during later analysis. The user explicitly authorized repairing this producer before continuing T0005.

The repairs bind freshly verified original bytes to exact branch sources/protocol partners; restore verified content and report scheduling separately; reconcile digest-bound action intents/partial outcomes; reset stale storage links; prohibit dropping extra assistant conclusions and cap retained verification bytes. Stored declaration arrays are cloned before inference mutates task state. Original receipt text above is historical, not proof that these previously missing guards existed.

Failing-then-passing regressions, an actual installed Pi corrupt-original pruning/restoration/branch check, final 114-test suite, package static gates and all installed/TUI smokes are recorded in the [T0005 receipt](./T0005-v3-authorized-semantic-and-native-compaction.md#t0005-execution-receipt). Status remains Done after these corrections; this does not claim a live-Pi local process-crash/partial-write experiment.
