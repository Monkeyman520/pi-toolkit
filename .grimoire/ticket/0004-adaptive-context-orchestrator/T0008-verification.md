# T0008 integrated verification receipt

## Current verdict and source snapshot

**Final integrated acceptance: passed within the documented staged/compatibility boundary.** T0007's three-family real evaluation and task-fit/forecast/cost assessment are complete, including its failed artifacts and unknown charges. Final process-scoped proxy gates passed. Evaluation completion does not claim ACO superiority or that every benchmark task succeeded.

Sources: [T0008](./T0008-integrated-pi-lifecycle-recovery-and-isolation-evidence.md), [T0007](./T0007-v5-adaptive-composition-and-comparative-evaluation.md), [Spec 0007](../../spec/0007-adaptive-context-orchestrator.md), [ticket relationships](./README.md). Reused [plan 0012](../../plans/0012-t0008-integrated-host-evidence.md), saved locally in the ignored plans directory. This receipt supersedes the earlier independent-slice assessment, while preserving its evidence classification.

The subsequent explicit grimoire-loop continuation authorized fixtures, demonstrated in-scope production fixes and local QA. Route: reuse/revise plan → incremental tests/fixes → inline review/check → integrated verification → exact-file formatting/affected checks → report. At that local stage, no delegates, commits, pushes, publication, installed-host source changes, global dependency installation, real-model spending or user-session changes were authorized. The subsequent model/source/no-cap authority is recorded in the [representative receipt](./T0007-representative-evaluation.md).

Baseline commit: **e4d51a805ba3aea1fce62bf4b632c2c3c29161c9**, plus the complete tracked/untracked working-tree change set. Production changes are confined to provider availability, failed/partial-usage budget admission/reporting, legacy child decoding and interrupted-prune request/restoration safety in `extensions/delegation-contracts.ts`, `delegation.ts`, `evaluation.ts`, `index.ts` and `prune.ts`. Package boundaries, peers, strategy permission semantics and finite child limits are unchanged.

## Reproduction and executed gates

Windows; Pi **1.5.0**; Node **26.13.0**; npm **11.20.0**; TypeScript **5.9.3**, Biome **2.6.4**, Vitest **4.1.12**, TypeBox **1.3.27**. Run npm commands separately from `packages/pi-context-aco` after its documented setup.

| Executed command | Final result and scope |
| --- | --- |
| `npm run typecheck` | Passed; no emit and erasable syntax. |
| `npm run check -- --diagnostic-level=error` | Passed after scoped formatting; informational template advice is not an error. |
| `npm test` | Passed: **180 tests / 21 files** on the final source. Includes missing provider, both restore directions, zero/positive partial usage, legacy failed records, model guards, matching-horizon accounting and explicit proxy/empty identity propagation. |
| `npm run smoke` | Passed: normal packed-plugin loading, bundled dependency resolution, absent sibling activation, baseline provider transcript/tool-body equality, zero extra ACO model calls, parallel/blocked/unknown finalizations and resets. |
| `npm run smoke:tasks` | Passed: task-fit candidates/no-op, protection, declarations, tree/resume and V1 passivity. |
| `npm run smoke:evidence` | Passed: actual command/tool recall, historical bytes after workspace changes, store failure, corrupt restart fallback and task/project/tree/fork isolation. |
| `npm run smoke:prune` | Passed: request-local/durable omissions, original retention, verified restoration, branch isolation and corrupt-source refusal. |
| `npm run smoke:compact` | Passed: RPC no authority, scoped grants, invalid-summary refusal, explicit authority cannot bypass local/native input budgets, exact replacement/restoration, observed native completion/failure/cancellation/interference and restart/tree recovery. Rerun after exact-file formatting. |
| `npm run smoke:delegate` | Passed: real host child streams, minimal evidence, staged deliverables/parent verification, aggregate accounting; **12 adversarial scenarios** listed below. |
| `npm run smoke:adaptive` | Passed: actual executor composition and authority barriers, observed commit advancement, restoration, parent child-result reconciliation, native completion and restart without scheduling replay. Controlled comparison only. |
| `npm run smoke:lifecycle` | Passed: both peer load orders, retained foreign context/drafts, legal transcript/raw originals, reload/listener ownership, real retry success and exhaustion, no premature idle. |
| `npm run smoke:recovery` | Passed: real Pi with controlled readback/partial-write/held-I/O faults, restart and verified restoration; ordinary/custom invalid requests prevented; unmodified missing-provider runtime safely recommends with no reservation or edit. |
| `python tests/tui-smoke.py` | Passed: real ConPTY settings, keyboard persistence, full-prefix completion, loaded-only switch, reload/exit. |
| `python tests/compaction-tui-smoke.py` | Passed: local/native default confirmation, denial, approved replacement/restoration/native completion. |
| `python tests/delegation-tui-smoke.py` | Passed: child confirmation, denial/no launch and returned child remaining parent-unverified. |
| `git diff --check` | Passed. |

Terminal tests used the already-installed isolated interpreter `C:/Users/Administrator/AppData/Local/Temp/pi-aco-v3-python/Scripts/python.exe`: Python **3.12.15**, pywinpty **3.1.2**. No installation was needed. Terminal tests load the checkout; RPC smokes independently verify actual outside-checkout tarball/dependency delivery.

The nine RPC smokes were run with `ACO_TEST_ARTIFACTS=D:/pi-packages/.grimoire/ticket/0004-adaptive-context-orchestrator/T0008-artifacts`. [Retained command receipt](./T0008-artifacts/command-results.json) records commands/versions/results. Retained fixture evidence:
- [Recovery faults and persistence](./T0008-artifacts/recovery-host.json)
- [Delegation adversarial cases](./T0008-artifacts/delegation-adversarial.json)
- [Peer-a → ACO → peer-b](./T0008-artifacts/lifecycle-forward.json)
- [Peer-b → ACO → peer-a](./T0008-artifacts/lifecycle-reverse.json)

The JSON artifacts are **local-only and Git-ignored** by the repository's shared-Markdown policy; they have not been staged or published. The command/version table in this Markdown file is the portable receipt. Regenerate raw fixture evidence with the environment variable above when working from a fresh checkout.
Artifacts contain disposable synthetic task/session data, not user sessions or credentials. The writer omits repetitive UI/command-response/stream-delta events; provider transcripts, selected persisted branches and substantive lifecycle/usage records remain. Other smokes retain executable assertions/console results, not a complete raw transcript archive. Parallel smoke wall times are not benchmark latency.

## Demonstrated defects and fixes

### Missing registered provider

An unmodified isolated Pi configured with an unavailable provider exposes a placeholder model and a stream method. Before the fix, explicit authority caused a delegation intent/reservation and a failed child result despite the backend being absent. The focused Vitest regression and actual Pi assertion failed first.

Delegation now requires the host provider-lookup capability and a registered provider before reserving or dispatching. The real unavailable-provider run returns recommendation with zero intents, reservations, outcomes or context edits. Existing registered providers still pass actual child execution.

### Interrupted paired omission

A real host boundary first persisted a tool-result omission, then encountered an injected filesystem error when appending the paired assistant omission. After restart, the original implementation could send an unanswered call to the provider. A provider-transcript legality assertion demonstrated the defect; merely accepting the fixture response was not considered success.

Ordinary input is now refused while an ACO partial action leaves an illegal projection. A before-agent safety gate also aborts custom-triggered runs before provider dispatch. Explicit `/aco restore all` in enabled exact-prune mode re-verifies originals; request-local exact repair makes the recovery turn legal, and the existing completed boundary persists restoration. No blind durable retry or JSONL rewriting occurs. Ambiguous anchors, missing originals or verification failure refuse/abort instead of silently injecting guessed content. Unit tests cover either missing half, retained peer content and repeated assistant-message anchors.

If monitoring is disabled or the mode changed, select enabled exact-prune mode before scheduling this repair, or use native tree/session recovery. V1 still never filters or edits ordinary valid history; the safety gate can refuse a branch broken by an earlier ACO action.

## Fault-injection boundary and review

[Recovery runner](../../../packages/pi-context-aco/tests/recovery-pi-smoke.mjs) installs the package outside the checkout and loads its actual extension through a test wrapper. Readback and held reads use the existing EvidenceIO seam in the same Jiti graph. The partial-write fixture temporarily adapts the host-exported SessionManager append method to obstruct only the second edit's disposable session path with a directory; the real writer raises EISDIR, and the original file is restored unchanged. These are **privileged controlled faults inside real Pi**, not mock-only hook invocation, arbitrary JSONL editing, an unmodified OS outage, or a host fork. The wrapper/prototype adaptation is test-only and not shipped as a production extension dependency. Every fault must actually fire before its assertion can pass.

The runner verifies intent-only failures, one observed partial edit, no duplicate replay on restart, no invalid provider request before explicit recovery, raw-original equality, and no stale receipt after disable/reload/new-session invalidation during a held checkpoint.

Delegation scenarios: zero depth, excessive concurrency, exhausted aggregate budget, overlapping writers, foreign-checkpoint possession, malformed result, provider error, reported overrun, overrun blocking later dispatch, unauthorized child recall tool attempt, cancellation of an uncooperative child, and child/new-session replacement. Denied cases launch nothing; actual failed/cancelled children cannot reconcile as success; reservations/status persist on restart. A hostile child holding a real foreign checkpoint ID gets no corresponding bytes and cannot invoke parent recall tools.

Lifecycle assertions run both peer orderings. A real host retry chain emits two agent_end events but one final settled event for both retry success and exhausted attempts. ACO remains running during retry backoff; final host/ACO idle is observed afterward.

Inline review inspected the complete production diff, new/modified fixtures and relevant recovery/admission consumers, including untracked files. No remaining confirmed blocker was found in that inspected local scope. Initial failed runs included fixture module isolation, a shadowed independence precondition, an incorrect cancelled/interrupted expectation, and ambiguous restoration anchors; these were diagnosed and fixed rather than counted as passes. Broader provider/platform quality is not inferred.

## R01–R16 coverage

| Requirement | Current evidence / limits |
| --- | --- |
| R01 | Host smoke/lifecycle and all terminal controls: independent package, host peers, ordinary bundled dependency, loaded-only panels, prefix completion and truthful RPC behavior. |
| R02 | Host tasks/adaptive plus unit forecasts; P1/P2/P3 tail-only three-turn/provider-prompt scores in [final evaluation](./T0007-final-evaluation.md). No whole-run calibration or optimality claim. |
| R03 | Host tasks/delegate plus Unit tasks: task fields, explicit/inferred provenance, transitions and parent verification. No general real-project inference-accuracy claim. |
| R04 | Host tasks/prune/compact plus Unit dependency/protection/summary cases. Conservative extractive proof, not general paraphrase equivalence. |
| R05 | Host evidence/prune/recovery: persistence/readback, incomplete receipts, bounded recall and verified restoration. Mid-read failure is explicitly controlled injection. |
| R06 | Host evidence branch/project/task/fork/history and delegate necessary subset, foreign-ID denial and hostile child tool rejection. Unit grant/pagination boundaries supplement the host evidence. |
| R07 | Actual ordered executors/authority/commit barriers and real P1 no-op / P2 phase-change exact refusal / P3 bounded-review no-op assessment; [final evaluation](./T0007-final-evaluation.md). |
| R08 | Host prune/lifecycle/recovery: exact local and durable semantics, retained originals and explicit partial-action recovery without replay. |
| R09 | Host compact and V3 terminal: local proof/refusal/restoration, native prefix completion/failure and budget/authority separation. |
| R10 | Host delegate and V4 terminal: real bounded children, overlap/depth/concurrency/budget refusal, failed/overrun/cancelled children, minimal evidence, staged results and parent verification. |
| R11 | Host compact/delegate/adaptive and V3/V4 terminal: confirmation/denial/scoped grants/RPC refusal and independent budget/safety checks. Unit permission combinations remain additional evidence. |
| R12 | Host recovery/evidence/compact/adaptive/delegate: partial commit, readback failure, cancellation, replacement/reload, restart, verified restore and no stale write/replay. |
| R13 | Host transcript equality/legality and original retention; actual partial append regression now blocks invalid requests and repairs the explicit restore turn. Unit invalid split/structured error cases supplement. |
| R14 | Host lifecycle both orders/retries, finalized parallel/blocked calls, peer cleanup, replacement-session guards and actual missing registered provider. Missing SDK-method combinations additionally covered in Unit tests, not claimed as another host version. |
| R15 | Controlled mechanism comparisons plus six frozen real task/control runs, full tree/event/wire audits, independent quality checks, partial-usage correction, overhead/continuity/recovery/mistake/forecast analysis. Missing cache/invoice fields remain unknown; no superiority assertion. |
| R16 | Host V1 passivity, explicit V2–V5 capability/authority boundaries, completed T0007 evaluation and final integrated verification. Limited real outcome/format evidence does not expand the conservative delivered capabilities. |

## E01–E14 coverage

| Scenario | Current evidence / limits |
| --- | --- |
| E01 | Host normal packed-plugin smoke, lifecycle and actual terminal controls/passivity. |
| E02 | Host tasks/adaptive task-fit and unit forecasts plus real review no-op/phase-change comparisons; quantitative claims remain limited to measured retained samples. |
| E03 | Host tasks/compact plus Unit dependency/protection cases. |
| E04 | Host evidence store failure and recovery acknowledged-write/readback fault; prune corrupt-original refusal. |
| E05 | Host project/task denial, necessary actual child subset, foreign-ID refusal and hostile child recall-tool rejection; Unit grant isolation. |
| E06 | Host evidence/tasks/prune resume/fork/tree and explicitly historical replay after workspace changes. |
| E07 | Host smoke/prune/compact/lifecycle/recovery legal tool/system structure, exact evidence and original retention; Unit malformed structured exchange cases. |
| E08 | Host compact invalid-summary refusal, native cancellation/append failure/foreign override, observed success and verified recovery. |
| E09 | Host all higher-impact authority modes, actual terminal consent/denial and explicit grant budget refusal; Unit detailed guard combinations. |
| E10 | Host recovery partial append/readback/disable/reload/new-session and explicit restore; delegate held-child cancellation/replacement; adaptive dependent-step barrier/no restart replay. |
| E11 | Host actual child execution, depth/concurrency/budget/overlap refusal, failure/malformed/overrun handling, cancellation, retained reservations and aggregate accounting. |
| E12 | Host both peer orders, preserved request/boundary proposals, parallel/blocked/unknown calls and real retry success/exhaustion with final settled state. |
| E13 | Controlled composition plus completed P1/P2/P3 real adaptive/control task, prediction/cache/cost/quality/continuity/intervention reports in [final evaluation](./T0007-final-evaluation.md), with original failures and unknowns retained. |
| E14 | Host missing registered provider safely recommends without dispatch/reservation; lifecycle/delegate cleanup/replacement leaves unrelated peers functional. No claim about untested older SDKs. |

## Historical remaining checkpoint

[Representative evaluation protocol](./T0007-representative-evaluation-protocol.md) prepares real defect-replay tasks, independent acceptance, identical baseline policies, complete-run accounting and honest analysis. It is **not executed evidence**. The runner/task snapshots, final input hashes and model-specific measurement wiring must be finalized once the model/data/budget contract is known.

All local gates listed above passed. T0008 remains In Progress, blocked on T0007; no overall acceptance, live-provider benchmark, superiority claim or unperformed platform coverage is asserted. Model/source authority and the explicit no-evaluation-cap decision are now recorded; do not wait for those permissions again. Finish P2/P3 and required policy/prediction evidence before final acceptance.


## Authorized live-evaluation instrument refresh

The production snapshot above is unchanged by this continuation. After adding isolated opt-in evaluation/measurement helpers and optional event/timeout controls to the RPC test client, package typecheck, Biome (66 files), **156 tests / 19 files**, and all **nine installed-Pi RPC smokes** passed. Their local command receipt is `T0007-artifacts/rpc-gates.json`. Earlier actual ConPTY evidence still applies to the unchanged production/TUI behavior; it was not silently rerun or relabeled as a fresh terminal pass. Full T0007/T0008 acceptance remains open.


## Post-representative-defect verification refresh

Actual failed SDK replies exposed a second fail-closed gap: zero-default failure usage was treated as measured zero by parent admission/aggregate/UI reporting, and failed zero-usage children (including legacy records with an old true budget flag) could appear accounting-verified. Regressions were red before repair. Shared normalization makes these unavailable; old records are decoded without history rewriting, reservations are retained and further child dispatch is blocked. Successful reported zero remains valid. Model/service resets were not attributed to ACO or repaired by speculation.

Latest gates: `tsc --noEmit` passed; Biome **73 files**; Vitest **176 tests / 21 files**; all nine installed-Pi/RPC scripts and three actual ConPTY scripts passed after production normalization/legacy decoding changes. Controlled lifecycle tests additionally verify post-error refusal without new calls/intents/reservations in both peer orders. Evaluation-only workload helpers were subsequently tested/typechecked and included in the 176-test pass. Source loading/controlled tokens are not representative-model quality evidence. Local retained JSON: T0007 `rpc-gates-after-normalization.json`, `terminal-gates-after-normalization.json`, `normalized-zero-replay.json`; earlier T0008 evidence remains historical rather than overwritten. T0008 remains blocked on the incomplete T0007 comparisons. Subsequent P2 positive-partial admission replay added two failing-first regressions and a conservative failed/aborted-parent refusal. Separate typecheck/Biome and 179 tests/21 files pass; both installed peer-order lifecycle cases pass. Fresh complete runtime gates are retained as T0007 `*-after-positive-partial` JSON/logs, separately from the earlier snapshot.


## Final integrated verification and coverage closure

The earlier tables/remaining-checkpoint notes describe their dated stages; this section and the current R/E matrix are the final assessment. T0007 is accepted as a completed **failure-inclusive evaluation**, not a performance victory: [final criterion assessment](./T0007-final-evaluation.md) links all eight original criteria, three real coding families, independent delivered-code checks, matching-horizon forecast analysis, current qualitative task weighting, unknown totals/fees and controlled successful executor combinations. Every R01–R16 and E01–E14 has actual evidence in the matrix above; no document-only inspection substitutes for runtime tests.

Final combined source: TypeScript no-emit passed, Biome **74 files** passed, Vitest **180 tests / 21 files** passed. Actual Pi **1.5.0**; CLI probe identified Bun **1.4.4**, embedded Node API **26.3.0**, while development commands use Node **26.13.0**. Python/pywinpty versions and standalone tarball dependency setup remain as recorded above.

The user's final request selected `http://127.0.0.1:7890` for subsequent test processes. An opt-in test-only environment helper propagates that explicit credential-free route through empty verification profiles; it does not copy arbitrary proxy secrets or change global settings. Actual Pi's anonymous HEAD returned expected 404 and a PID-filtered **ESTABLISHED connection to 127.0.0.1:7890** was observed. No inference call was needed to prove routing.

With that environment, the final **serial** gate batch passed all **nine** installed-Pi/RPC scripts, all **three** actual ConPTY scripts and the positive/negative identity-separation smoke (**13/13 commands**). Retained local receipt: `T0007-artifacts/final-proxy/gates.json`; substantive runtime evidence under that directory; `proxy-pi-proof.json` records runtime/route observation. Model/bootstrap/startup failures in earlier batches and real tasks remain in their original records, not overwritten by these new gates. A proxy neither proves the cause of earlier socket/stall errors nor guarantees against future local startup pauses.

Review scope included all changed production paths, the complete tracked/untracked package diff and relevant fixture/client/environment/accounting/recovery/delegation consumers. Checks cover returned values, append boundaries, profile separation, authority, legal exchanges, partial usage and retained reservations. No unresolved confirmed blocker remained in this authorized staged scope. Expected advisory limits remain: 128-original checkpoint closure can refuse a real proposal; extractive summaries are not general paraphrase proof; child execution is single-request/text/staged; only the stated Windows/host stack is certified; native/third-party work and actual provider charges are not an OS-enforced budget.

T0008's final coverage receipt criterion is satisfied by this integrated matrix, current runtime gates and the linked completed T0007 assessment. No requirement or pass threshold was removed. No commit, push, publication, delegated agent, installed-host source change, global proxy change or user-session mutation was performed.
