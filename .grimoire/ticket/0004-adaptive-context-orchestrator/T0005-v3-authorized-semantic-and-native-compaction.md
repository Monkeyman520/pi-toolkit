# V3 authorized semantic replacement and native compaction

**Ticket ID:** T0005
**Source:** [Spec 0007](../../spec/0007-adaptive-context-orchestrator.md) — R09, R11, R12, R13, R14, R15, R16; scenarios E08, E09, E10. [ADR 0006](../../adr/0006-task-aware-context-working-set-and-isolation.md).
**Status:** Done

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

- [x] Summaries preserve conclusions, constraints, decision rationale, still-required exact details, provenance, dependencies and recovery references (R09).
- [x] Verification failure or inaccessible originals leaves the current representation usable and prevents a lossy commit; a plausible summary is not proof of equivalence (E08).
- [x] Local replacement uses supported context edits; native compaction is treated as prefix compaction, with customized summary and actual completion/failure observations.
- [x] Interactive default confirmation, denial and explicitly authorized automation behave as R11 requires for both strategies (E09).
- [x] Non-interactive proposals without applicable prior authorization do not mutate context or wait for unavailable UI confirmation.
- [x] Explicit authorization cannot bypass recovery/dependency/structure/scope/budget checks; V1 remains observation-only.
- [x] Native failure, cancellation or partial local commit reports actual state, stops dependent actions and retains verified recovery/checkpoint paths (E08, E10).
- [x] Controlled Pi local-edit and native-compaction cases demonstrate task continuity, raw-history preservation and recovery; management/model/cache costs are accounted without claiming universal losslessness.

## Out of Scope

Arbitrary-range compression through the native prefix API; blanket permission to compact from generic plugin enablement; controlling unrelated extensions' or host-native user/automatic compaction.

## Verification contract

Run the affected package's type check, Biome and Vitest separately and record the tested versions. Supply a controlled Pi loading/usage check for this ticket's delivered behavior; mock-only hooks and direct Node entry execution are insufficient. Keep the package README/configuration and permissions accurate as capabilities change. This ticket describes future verification, not checks already performed.

## T0005 execution receipt

**Outcome:** Done for the delivered conservative extractive V3 and its authorized T0004 prerequisite repairs. Spec 0007 remains In Progress, ADR 0006 remains Implementing, and T0006–T0008 remain pending. No commits, pushes, publishing, host fork, direct production JSONL rewriting or delegation occurred.

**Route:** persisted plan → prerequisite regression tests/repair → V3 implementation/test → inline defect review and acceptance check → affected fixes → final integrated verification → formatting/report. The initial prerequisite stop and user's explicit authorization to repair T0004 are retained in [plan 0009](../../plans/0009-t0005-authorized-compaction.md). No routine human checkpoint or delegated worker was added.

### Delivered behavior and acceptance evidence

| Acceptance | Implementation and evidence |
| --- | --- |
| Meaning, exact details, rationale, provenance and dependencies | `extensions/summary.ts` generates a bounded, readable dictionary/ordered-run extractive representation preserving every source-message JSON field and captured continuity field. An independent decoder roundtrip plus canonical-document comparison rejects changed sources, error metadata, references, unreferenced invented text and noncanonical additions. This is a deliberately conservative verifier, not general paraphrase equivalence. |
| Failed verification/inaccessible originals | Real-filesystem `recovery-boundary.test.ts` reproduces checkpoint deletion/stale verification, rejects uncovered restoration/reconciliation and restores protocol partners. Installed `smoke:prune` deletes an actual archived source after verification and proves both provider visibility and absence of durable omission. `compaction.test.ts` rejects plausible summaries and cancels scheduled work after recovery loss. |
| Supported local edits versus native prefix | Installed `smoke:compact` proves local `context_edit` replacement/restoration with unchanged raw result/metadata and a customized, actually persisted native compaction with Pi's prepared kept boundary. Only the owned request token is intercepted; arbitrary-range native compression is not advertised. |
| Default confirmation, denial and automation | Actual `compaction-tui-smoke.py` ConPTY dialogs cover local/native confirmation, Escape denial, approved local commit/restoration and native completion. Installed RPC covers recommendation-only proposals, no confirmation requests and operation/task/source-scoped grants. Grants have finite budgets and are not inherited on restart/tree navigation. |
| Non-interactive no-op | RPC proposals without an applicable prior grant return recommendations, do not schedule changes or wait for UI. Generic enablement/mode changes do not create authority. |
| Non-bypassable guards and V1 | V1 baseline provider-bound transcript/tool equality and zero extra model calls remain verified. Real archive bytes, active branch/task/scope, complete dependency analysis, legal call/result sequences, input/output/model-capacity estimates and mode remain independent checks. Revoked native requests retain guarded tokens so late preparation cannot fall through to host-default generation. |
| Failure, cancellation, partial outcomes and recovery | Digest-bound local action intents are reconciled with actual branch edits, not a successful draft return. Unit partial/interrupted append fixtures remain distinct from committed success, and later actions cannot retroactively complete earlier intents. Real Pi native cancellation, a session-file append failure and foreign-handler interference report non-success; supported tree navigation/verified recall recover originals. Failed native appends expose observed state/uncertainty; interrupted intents prevent blind retries. Local mid-append states are unit evidence, not a claimed process-crash/real-Pi local mid-write experiment. |
| Continuity, raw history and costs | Installed fixtures continue after local/native edits and persisted resume with exact decision/rationale/constraint sentinels in provider-bound context. Raw originals remain byte-equivalent and historically recallable; native prefix recovery uses the recorded tree anchor. Estimated before/after impact, management/latency timings, zero additional deterministic-summary model calls and host-estimated usage are separate. Provider-request count is unchanged during ACO native summarization; unavailable aggregate cache/token/cost metrics stay unavailable. |

### T0004 prerequisite corrections

- Replaced manifest-only/cached recovery authority with freshly digest-verified original bytes, bound to each actual source and paired message. Checkpoint capture includes necessary protocol partners.
- Restoration reads matched verified originals, restores legal exchanges, and reports **scheduled**, not immediate completion. Uncovered targets can no longer be called verified because any receipt exists.
- Added durable local intent/outcome reconstruction and conservative stop-on-partial behavior; preserved unrelated boundary proposals and explicit V1/V2/V3 mode separation.
- Fixed task-analysis aliasing that mutated stored declaration arrays and later invalidated their own schema. Added a failing-then-passing regression.
- Paired-call pruning cannot discard additional assistant conclusions/reasoning; unknown sizes and over-budget exchanges fail closed.

### Final verification

Environment: Windows, Node **26.13.0**, npm **11.20.0**, Pi **1.5.0**; package TypeScript **5.9.3**, Biome **2.6.4**, Vitest **4.1.12**, TypeBox **1.3.27**. Terminal checks used Python **3.12.15** and test-only **pywinpty 3.1.2** in a disposable external virtual environment.

From `packages/pi-context-aco/`, separately:
- `npm run typecheck`: passed.
- `npm run check`: passed, 39 files; zero errors/warnings, 53 existing informational suggestions (no unsafe rewrites).
- `npm test`: **114 tests / 12 files passed**.
- `npm run smoke`, `smoke:tasks`, `smoke:evidence`, `smoke:prune`, `smoke:compact`: all passed in independently installed tarball/isolated-agent Pi RPC runs. The evidence smoke's obsolete “not delivered” marketing-string assertion was updated to the required observation-only mode/authority behavior; it was not a strategy failure.
- `python tests/tui-smoke.py` and `python tests/compaction-tui-smoke.py`: passed actual ConPTY keyboard/dialog interaction, settings persistence/completion/loaded-panel switching/reload, default V3 permissions and recovery/completion.
- Formatting applied through the package's Biome script; affected static/unit/runtime checks refreshed afterward. `git diff --check` passed.

**Limitations:** local V3 supports one complete text tool-result contribution at a time. Unique/non-repetitive, multimodal/thinking, unverifiable or non-beneficial summaries fail closed. No general semantic paraphrase verifier, real-provider/model-quality benchmark, exact tokenizer accounting, fsync/power-loss guarantee, cross-platform/version guarantee or policy-superiority claim is made. Broader integrated lifecycle/co-loading fault matrices remain T0008, not implied by these controlled checks.
