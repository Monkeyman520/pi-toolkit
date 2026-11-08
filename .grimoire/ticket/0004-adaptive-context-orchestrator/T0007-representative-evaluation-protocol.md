# T0007 representative evaluation protocol

**State:** Execution authorized; P1 pilot inputs/acceptance frozen before live inference. Results remain separate evidence, not implied acceptance.
**Sources:** [T0007](./T0007-v5-adaptive-composition-and-comparative-evaluation.md), [Spec 0007](../../spec/0007-adaptive-context-orchestrator.md), [plan 0011](../../plans/0011-t0007-adaptive-composition.md), [continuation plan](../../plans/0012-t0008-integrated-host-evidence.md).
**Baseline repository commit:** e4d51a805ba3aea1fce62bf4b632c2c3c29161c9. Finalize separate input/acceptance hashes before running; current working-tree solutions/receipts must not leak into baseline task input.

## Authority and isolation

Prepare two disposable copies from the same frozen package snapshot, with identical model, tool loadout, prompt, acceptance tests and the same recorded budget policy. No real user sessions, credentials or unrelated repository data belong in the task input. Host credentials stay outside transcripts. A local real model is acceptable; a remote model additionally needs approval for source transmission and spending. Existing authentication is not consent.

The initial continuation authorized preparation only. The subsequent user decision authorizes the remote model and source transmission described below. Before execution, record:
- Exact provider/model/version and whether local or remote.
- Allowed input files/data and output/log retention location.
- Per-run time/output-token limits; aggregate parent/child/management token limit and, when applicable, a total fee cap/currency.
- Concurrency (start serially), pilot size and permission for later repetitions.

### Recorded user execution authority

- Remote provider/model: installed `pi-antigravity` 0.11.0, `antigravity/gemini-3.8-flash`, thinking `high`; model fallback is rejected before inference transmission by test-only transport instrumentation. The provider's built-in fallback would otherwise permit Gemini 3.7, even with a pinned runtime ID.
- Data: isolated `pi-context-aco` package source copies, public host SDK declaration references and their verification output may be sent. No credentials or unrelated repository/user-session data is task input.
- The user explicitly requested no token, fee or wall-time cap for now, but complete recording. This supersedes the protocol's proposed finite evaluation limits, not the plugin's existing finite child safety budgets and scoped grants.
- Serial P1 control/adaptive pilot first, then P2/P3/repetitions as needed for the existing evaluation plan. Preserve failures; do not sample until favorable.
- Use fresh isolated session directories, an installed immutable candidate and separate task copies. ACO configuration/evidence is per-run; do not persist RPC settings changes in the credential-owning user agent directory. Normal provider-owned authentication/refresh remains outside transcripts.
- Guard task tools to source paths and frozen local verification commands. These are defense in depth, not an OS sandbox: generated TypeScript tests execute with host permissions. No credentials are copied into task input.
- Retain local raw JSONL/JSON under `T0007-artifacts/` (Git-ignored); share Markdown receipts only. Subscription fees and unreported cache writes remain unavailable, not zero. Record server usage metadata, whole-session events (including retries/abandoned entries), commands and elapsed times.

## Proposed frozen coding tasks

These are actual repository defect replays discovered by T0008, not scripted successful provider responses. The model must inspect and modify code and run tests.

| Task | Input goal | Independent acceptance |
| --- | --- | --- |
| P1 missing provider admission | Fix delegation when Pi exposes a placeholder model and stream method but its provider is unregistered. Preserve existing scoped authorization and finite budgets. | In actual isolated Pi, explicit authority plus missing provider yields recommendation, zero reservations/intents/dispatch and no context edit. A registered controlled provider still works. Full package checks pass. |
| P2 interrupted exact pruning | Handle a tool exchange whose first omission persists and second append fails; resume and recover without raw-history rewrite or blind replay. | Actual host detects partial state; ordinary and custom-triggered runs cannot send illegal messages; explicit verified restoration produces legal request context and append-only recovery; source objects stay intact. |
| P3 near-completion review | Review the completed P1/P2 change against its original criteria and remaining work. An unchanged correct result is allowed; do not manufacture an optimization. | Independent findings audit distinguishes true defects from test/tool prerequisites. Exact evidence remains available; no unnecessary intervention is required to claim success. |

Start with P1 under two policies to verify instrumentation. Expand to P2/P3 and agreed repetitions before evaluating task-dependent policy tradeoffs; the pilot alone is not full V5 acceptance. Ensure hidden verifier code does not disclose the known solution to the model.

## Comparable policies and controls

1. Control: no ACO loaded.
2. Adaptive: load the identical candidate ACO package, select adaptive mode and declare the same task/acceptance/source evidence. Log all ACO-specific grants/compositions/advancements and parent reconciliation as management actions.
3. Do not send extra problem hints only to the adaptive model. If management requires a human or script, record its content and cost/time. Management must enforce existing guards, not bypass them.
4. Freeze evaluator decisions before runs. A failed run remains in the report; do not rerun until a favorable sample appears.
5. Record cache state/run order. Run serially or randomize the approved repeated order; concurrent smoke-test wall times are not representative latency measurements.

## Measurement record

For each run retain source/input/acceptance hashes, model/configuration, policy, task result, actual code diff, verifier output and redacted provider/session evidence. Record:
- Task success and continuity from independent verification, not the agent's claim.
- Recovery attempts/failures, mistaken interventions and their concrete evidence.
- Parent, child and management input/output/cache-read/cache-write/token/cost usage, including retries and abandoned branches.
- Missing values as unavailable, not zero. Zero model-management calls do not erase command/storage/coordination overhead.
- Wall time, scripted controls and human interventions.
- Predictions with timestamps and stated horizons, compared with observations at matching horizons; distinguish host estimates and provider reports.
- Authority refusals, safety/budget failures and interrupted work.

Existing branchAccounting reports only active-branch accounting; use the whole run's persisted usage/events for comparative totals, with deduplication of child intent/result records. CompareRuns checks task/acceptance identity, not task correctness or statistical significance.

## Analysis and release gate

Explain when exact pruning, compaction, delegation or no-op helped or harmed continuity, cost, cache and latency. Evaluate the current uncalibrated task-fit policy; do not invent an optimum weight or mandatory savings percentage. Less parent context does not prove lower aggregate cost.

Update T0007 only when its original outstanding criteria have real comparable evidence. T0008's final receipt then incorporates those results and refreshes checks affected by any resulting changes. Neither this protocol nor controlled-provider fixtures establish representative task success, forecast accuracy, measured savings or superiority.


## Instrument revision after pilot 03

Pilot 03 control was stopped for verification/inference identity separation after a test instantiated the default ModelRuntime. Its 100 HTTP attempts and 3,706,859 reported server tokens remain recorded, not discarded or called task success; adaptive never started. The [receipt](./T0007-representative-evaluation.md#safety-stop-and-corrected-pilot-04) documents limits of the credential-prefix audit. Pilot 04 freezes a revised input/prompt with task-local public SDK declarations, while independent acceptance is unchanged. Shell/post-run checks now use empty offline test profiles and stripped environments. Positive/negative actual-Pi tool execution proves the default-runtime identity separation before renewed inference. This is not an OS sandbox. Existing model/source/no-cap authority is unchanged; this safety stop is not an imposed budget/time limit.
