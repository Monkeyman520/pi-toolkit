# Pi Context ACO

**V1 observation/recommendations, V2 verified recovery/exact pruning, and T0005 V3 scoped extractive/native compaction** for the Adaptive Context Orchestrator. V1 remains observation-only. V3 explicitly proposes mechanically verified local summaries or native prefix compaction, requiring confirmation by default or operation/source/task/session-scoped automation authorization. T0006 V4 adds explicitly authorized independent single-request children with staged deliverables and parent reconciliation. T0007 adds opt-in command-only adaptive composition and controlled comparison reporting. Representative-task evaluation remains pending; V5 is not fully accepted.

## Compatibility and resources

- Node.js >= 22.19.0, TypeScript ESM/erasable syntax, no bundler/emitted build.
- Verified with Pi **1.5.0**, Windows, Node **26.13.0**, npm **11.20.0**.
- One extension: `extensions/index.ts`; command `/aco`; metadata declaration tool `aco_task` and read-only historical recall tool `aco_recall`. No provider, skill or prompt registration.
- Uses host-native `modelRegistry.streamSimple` for V4 children, usage/model/session read APIs, finalized-tool/turn/session/model/compaction/settled events, custom metadata, commands/completion and standard TUI components. Missing information remains unknown; no raw-history fallback edits.
- Used host SDKs and TypeBox are host-provided `"*"` peers, not bundled implementations or claims about every host version.
- Ordinary `pi-plugin-support@0.1.0` provides config I/O, loaded-panel discovery and TUI composition. Its versioned archive is shipped in `vendor/`, resolved by the development lockfile and bundled as an ordinary source-only npm dependency. No undeclared sibling imports, shared mutable manager or registry publication is assumed.

## Setup

From this package directory:

```sh
npm ci --ignore-scripts --legacy-peer-deps
pi -e .
```

From the collection root after setup: `pi -e ./packages/pi-context-aco`. Persistent local registration: `pi install ./packages/pi-context-aco`. Pi does not install a local package's dependencies for you.

## Commands and declaration tool

| Command                                  | Result                                                                                                                                                              |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/aco`, `/aco config`                    | Standard interactive status/settings panel in TUI; current JSON report in non-TUI modes.                                                                            |
| `/aco status`                            | Current pressure, task/reference state, provenance, recommendation, capability and management measurements.                                                         |
| `/aco trace`                             | Current report plus the latest 50 in-memory numeric/assessment snapshots.                                                                                           |
| `/aco tasks`                             | Active-branch tasks, protected source references, signal families, dependency conflicts and coverage limits.                                                        |
| `/aco recommend`                         | Conditional actions/no-op, reasons, risks, recovery/authority prerequisites, estimated/unknown gains and costs.                                                     |
| `/aco prune`                             | Inspect prune candidates, active exclusions, and before/after measurements.                                                                                         |
| `/aco restore <id\|all>`                 | Schedule exact restoration of edited entries and necessary tool pairs from freshly verified originals at the next completed turn boundary; not an immediate commit. |
| `/aco summarize <JSON>`                  | Propose one complete text tool-result replacement; accepts `sourceEntryIds` (one ID) and optional `summary` to verify.                                              |
| `/aco compact`                           | Propose native host-selected history-prefix compaction, not arbitrary-range compression.                                                                            |
| `/aco compaction`                        | Inspect scoped grants, pending/proposed versus observed actions, native outcomes and recovery references.                                                           |
| `/aco authorize <JSON>`                  | Explicit runtime-only grant: V3 operation/task/source/input-summary bounds, or V4 delegate/declared-child IDs/aggregate bound.                                      |
| `/aco revoke`                            | Revoke grants and cancel pending ACO work; already-issued native request tokens remain guarded against default-generation fallback.                                 |
| `/aco declare <JSON>`                    | Validate and append an explicit partial task update as `aco-task` metadata. No strategy authorization.                                                              |
| `/aco on`, `/aco off`                    | Persistently enable/disable sampling, declarations and explicit checkpoint/recall operations. Status inspection still works.                                        |
| `/aco config reload`                     | Reload settings and reset the growth baseline.                                                                                                                      |
| `/aco config <key> [value]`, `/aco help` | Read/validate/save a setting, or show usage.                                                                                                                        |

Tab suggestions preserve the entire argument prefix, including `config <key> <value>`; JSON is free-form schema-validated input. Numeric presets are suggestions, not the allowed-value boundary. The TUI switcher lists only loaded collection-protocol panels, never a static catalog or injected native `/settings` rows.

The model may call **`aco_task`** with exactly the same declaration object. It appends metadata and returns a normal tool acknowledgement/recommendation; it cannot execute tools, delegate, compact, prune, offload, request continuation or grant authority. Its definition and ordinary call/result consume parent-model context. There are **zero extra classifier/decision-model calls**, not zero overall tool overhead. Disabled monitoring does not remove this declared tool schema; execution refuses metadata updates until enabled.

### Declaration contract

Updates are partial: omitted fields keep their prior declared values. A new task is selected only with `active: true`, or when there is no active task. Fields are:

- Required `taskId`; optional `active`, `title`, `phase` (`explore|plan|implement|test|review|null`), `status` (`pending|running|completed|blocked`).
- `dependencies` (task IDs), `requiredContextIds` (reference IDs), `estimatedFutureTokens`, `delegatable`, `writeConflictRisk`, `writeResources` (paths), `remainingSteps`, `planStatus`.
- Nullable future-token/remaining-step/risk/delegatability values mean explicitly unknown. Numeric estimates/claims are never measurements.
- `references`: each has `id`, `kind` (`constraint|decision|evidence|artifact|checkpoint`), existing active-branch `sourceEntryIds`, optional `dependencies`, `pinned`, `precisionSensitive`, `completedResearch` and nullable `estimatedTokens`.

Example workload declaration:

```text
/aco declare {"taskId":"explore-api","active":true,"phase":"explore","status":"running","estimatedFutureTokens":200000,"delegatable":true}
```

Near-completion example, which can favor no-op even at high occupancy if the declared remainder fits:

```text
/aco declare {"taskId":"finish","active":true,"phase":"review","remainingSteps":1,"estimatedFutureTokens":1000}
```

Obtain real source IDs from the references shown by `/aco tasks`; do not copy placeholder IDs as facts. A decision can reference evidence through `dependencies`, while a task identifies its required decision/evidence references through `requiredContextIds`. Unknown task/reference dependencies are visible and inhibit unconditional independence/disposal claims. Foreign source IDs, cyclic task dependencies, invalid values and oversized updates are rejected before append. An append failure is not reported as successful persistence.

IDs are bounded nonempty identifier strings, titles at most 256 characters, each update at most 32 references/relationship items and 32768 serialized characters. State is bounded to 64 tasks and 256 references; merged source/dependency lists are bounded to 128 per reference. Invalid stored records or capacity loss produce explicit limited coverage, not silently disposable evidence. Pinning/precision/source relationships are conservative and additive; V1 offers no unpin/equivalence-verification API.

## Explicit checkpoints and historical recall

- `/aco checkpoint <JSON>`: capture selected active-branch originals and active-task continuity; requires a persistent Pi session.
- `/aco evidence`: re-verify the latest 64 active-task checkpoint attempts and inspect segment IDs/sizes, incomplete/invalid records and the last usable historical checkpoint. It does not load bodies into model context.
- `/aco recall <JSON>`: display one historical segment in the UI/non-TUI notification. **Commands do not inject recall into model context.**
- **`aco_recall`**: the same recall request as a normal model tool; only its requested bounded result becomes model-visible. No background model call/continuation is requested.

Reference examples (replace placeholders with IDs from `/aco tasks`, checkpoint output and `/aco evidence`):

```text
/aco checkpoint {"sourceEntryIds":["REAL_SOURCE_ENTRY_ID"],"unresolvedWork":["run regression tests"]}
/aco recall {"checkpointId":"REAL_CHECKPOINT_UUID","segmentId":"REAL_SOURCE_ENTRY_ID","budgetBytes":4096,"offset":0}
```

Checkpoint input accepts 1–64 unique source IDs and optional `unresolvedWork` (at most 32 strings, each 1024 characters). It captures the active task's declared/observed plan/status, latest test/resource facts and their source provenance, selected/required decision/reference dependency closure, unresolved relationships and caller-declared unresolved work. Unknown/limited task analysis remains labelled, not silently complete. Related source entries are included automatically; more than 128 originals rejects the checkpoint rather than claiming partial continuity is complete. Original segments are exact JSON serialization of the host's raw source-entry objects, including structured tool results and error semantics—not summaries or a later re-read of file paths.

The three tiers remain distinct: current Pi working set (unchanged by checkpoint/recall themselves), structured continuity/index, and original segment files. Storage is `<getAgentDir()>/pi-context-aco/evidence/<canonical-cwd-sha256>/<checkpoint-uuid>/`, normally under `~/.pi/agent`. The canonical session cwd defines this project's scope, not a guessed Git root. Each checkpoint is immutable: an intent metadata entry precedes exclusive local writes, rename and SHA-256 readback of the captured originals; only then is a digest-bound commit receipt appended. Files alone or a write acknowledgement cannot authorize recall. No direct session JSONL edits or storage backend dependency.

Active raw-branch intent/commit pairs and task identity supply authority; possession of an ID does not. Resume/reload and tree navigation re-verify active-path receipts; forks inherit only receipts on their copied path and retain the origin session/task/source provenance. Unrelated project/task/branch and ungranted child scopes are denied. The host-only `EvidenceStore.grant` seam can issue a runtime-local child-session capability for an explicit necessary segment subset; it is not exposed to tools/commands and does not dispatch children. T0006 must bind actual child sessions to this trusted boundary; caller-supplied identity is not authentication.

Recall takes `checkpointId`, `segmentId` (a source ID or `continuity`), required `budgetBytes` (512–32768), and optional nonnegative UTF-16 `offset`. The **entire serialized JSON text**, including provenance/escaping, fits the UTF-8 byte budget; this is not an exact token budget. Callers must choose a byte budget fitting their model context allowance. Pagination returns `nextOffset` or null and never splits surrogate pairs. Too-small provenance budgets fail explicitly. Only the selected segment plus its bounded manifest is read, not the whole archive. Every result is `historical: true, currentSourceVerified: false`; use the ordinary file/environment tools to reacquire current facts after workspace changes.

Safety bounds: 4 MiB per segment, 16 MiB per checkpoint, 256 KiB manifest, one checkpoint writer per extension instance. Invalid/oversized requests, readback failures, append failures and cancelled/stale session/branch work never justify unloading. Restart marks intent-only attempts incomplete and corrupt commits invalid; earlier verified checkpoints remain usable. Snapshots remain historical, never silently restored over current task decisions. Storage is not a transaction with Pi's session writer and does not promise fsync/power-loss durability; reconciliation and future consumers must verify persisted receipts/content again. Orphan/partial files are retained, not automatically retried, adopted or deleted.

## V3 extractive summaries and native prefix compaction

`mode=compact` makes these explicit command-driven capabilities available; it does **not** grant automation or enable adaptive policy execution. This mode does not automatically run V2 pruning. Default `mode=observe` refuses all ACO strategy execution, even with a grant.

### Verification boundary

The delivered verifier is intentionally conservative: **verbatim extractive summaries**, not general LLM paraphrase equivalence. It deduplicates repeated text lines into a readable dictionary with ordered repetition runs, retains complete source-message metadata (including tool identity, error state and structured details), and includes source/task/dependency/checkpoint provenance. An independent decoder must reproduce every persisted JSON source field and continuity field exactly. Thus conclusions, constraints, rationale and required precision are retained rather than guessed disposable. A plausible paraphrase, changed provenance, unsupported content (including multimodal/thinking blocks), inaccessible originals, unknown dependencies or a non-beneficial/over-budget summary is rejected with the existing representation intact. Unique text may not compress at all; no general semantic-losslessness or real-model task-quality claim is made.

Local replacement currently supports **one complete text tool-result message** per request. The result's role, call ID, tool name, error semantics and details stay unchanged; the supported append-only `context_edit` replaces only its content. No raw-history rewrite or extra provider/model call occurs. System prompts/tool declarations are untouched. No new model-callable authorization/execution tool is registered.

### Usage and authority

Reference examples: replace every placeholder with IDs from `/aco tasks`, a proposal and `/aco evidence`.

```text
/aco config mode compact
/aco checkpoint {"sourceEntryIds":["REAL_RESULT_ID"]}
/aco summarize {"sourceEntryIds":["REAL_RESULT_ID"]}
```

A verified active-task checkpoint must already cover every affected original. Checkpointing a tool result also captures its complete call/result exchange. Verification re-reads digest-bound original bytes, not cached manifest membership; executors bind those bytes to the actual branch source. Verification retains at most the latest 64 receipts and 32 MiB of originals per request; exceeding this coverage is not permission to mutate.

In a TUI, each strategy requests confirmation by default. Escape/denial leaves it unapplied. **RPC/print/non-interactive mode never waits for a confirmation dialog:** without applicable prior authorization it returns a recommendation and does not mutate context.

Explicit automation is separate from enablement, a model proposal or permission to store evidence:

```text
/aco authorize {"operation":"semantic","taskId":"ACTIVE_TASK_ID","sourceEntryIds":["REAL_RESULT_ID"],"maxInputTokens":64000,"maxSummaryTokens":8000}
/aco summarize {"sourceEntryIds":["REAL_RESULT_ID"]}
/aco revoke
```

Use `operation:"native"` for native compaction. Grants are bounded to the current cwd/session/task, existing branch anchor, selected source IDs and finite budgets. They are runtime-only, not inherited by restarted/forked sessions, and cleared on tree navigation/reload/shutdown. An inapplicable grant does not approve another strategy or source. No generic auto-compact boolean is provided. Commands are the trusted user-facing authorization boundary; other privileged extensions, tools or OS processes are not sandboxed by it.

For native compaction, an unauthorized `/aco compact` proposal reports the currently visible source IDs. Checkpoint that scope and confirm or authorize `native` for it before retrying. The `session_before_compact` hook customizes **only ACO's uniquely identified request**, using Pi's actual prefix preparation and kept boundary, including any previous summary. Raw history remains. Other user/host/extension compactions are neither cancelled nor customized by ACO.

### Completion, recovery and costs

Local work is scheduled for a completed `turn_end`; no continuation/model turn is requested automatically. Drafts mean **proposed**, not committed. Digest-bound action intents are reconciled against actual raw-branch edits; partial/not-committed actions inhibit dependent strategies and are never blindly replayed. Conflicting drafts, changed task/session/branch/config/model, revoked authority or failed re-verification cancel the proposal. `/aco restore` re-verifies and restores exact original content and any omitted protocol partners. A restoration command's scheduling acknowledgement is not completion.

Native `ctx.compact()` initiation means **requested**, not success. Actual persisted completion/callbacks and error/cancellation events establish terminal outcomes; a different summary from another extension is reported as interference, not successful ACO verification. Session-append failure may leave in-memory state different from disk: outcomes expose observed compaction IDs/uncertainty and never promise an atomic transaction. Interrupted native intents without terminal evidence block blind retry. A lost/replaced session cannot receive stale completion writes.

Inspect `/aco compaction` and `/aco evidence` after a failure. Verified `aco_recall`/command recall remains historical. Native recovery can navigate through Pi's ordinary `/tree` to the recorded pre-compaction `anchorId`, then re-verify the checkpoint; ACO does not silently overwrite newer task decisions or auto-navigate the user's tree.

Sizes/savings and finite budgets are **UTF-16/JSON-length ÷ 4 estimates**, not tokenizer measurements. Checkpoints, current scope/dependencies, legal tool sequences, configured input/output ceilings and known model capacity are required independently of authorization. Local generation/verification latency is measured; deterministic summary generation makes zero additional model calls/tokens. Ordinary tool declarations/results, retained summary content and host/other-extension work still have costs. Native reported usage is retained when available; aggregate provider input/cache-read/cache-write/cost gaps remain unavailable. Prefix-cache disruption and model interpretation of this extractive format are not claimed beneficial universally.

## Task understanding and protection

The active **raw branch**, not all session entries or cached global state, reconstructs declarations on resume/tree/fork/reload. An undeclared conversation starts with an observed task tied to the first user source; follow-ups remain evidence for it until an explicit task switch. Declaration provenance is `command` or `tool`, not a claim of authenticated human authorship or independently verified success.

The rules-first analyzer combines user-intent hints, available declared/observed plan state, finalized tool activity, successful tool-reported file touches and test outcomes. Inferred phases require corroborating independent signal families and remain **tentative**. Assistant prose alone cannot prove phase, plan completion, passing tests or task success. Numeric tool exit status may establish a reported test result; an absent exit status is unknown. A successful test does not complete the task. Resource touches are not a Git/workspace audit.

User-message requirement/acceptance sources, pinned constraints/critical decisions, precision-sensitive/error sources and unfinished task dependencies are protected. Protection follows declared reference dependencies, source aliases and task dependencies, including completed producer tasks still needed by unfinished consumers. Planning completion or `completedResearch: true` cannot override protection. V2 graph/dependency protection is enforced by the pruning boundary; V3's bounded extractive equivalence verification is separate from declaration claims.

Write overlaps use normalized relative/absolute paths within the active session cwd, case-folded on Windows. Concrete overlap overrides a declared zero risk with an inferred overlap indicator (1, **not** a calibrated probability). Symlinks, shell-script modifications and true task independence still require verification.

Recommendations can combine checkpoint → offload → prune, delegation or compaction candidates, or no-op. Their order depends on task/pressure/content evidence, not fixed occupancy tiers. Every action is conditional on later implementations and the applicable recovery, dependency, message-structure, authority and budget checks. Savings are estimates/ceilings or unknown, never measured reclaimed context. Cache-prefix disruption, semantic loss, latency and coordination overhead remain visible uncertainties. There is no calibrated utility/accuracy/superiority claim.

Assessments are reused for unchanged active-branch/pressure inputs; substantive source/plan/task/test/subagent-return changes trigger reassessment. Model reasoning is not mandatory: this V1 uses **no additional model judgment calls** and leaves unsupported semantics uncertain.

## Pressure and settings

Configuration is `<getAgentDir()>/pi-context-aco.json` (normally `~/.pi/agent/pi-context-aco.json`). Read on startup/reload and explicit `config reload`; no polling timer/watcher. Panel/command saves apply immediately after successful serialized atomic replacement. Invalid/unreadable/oversized settings disable sampling without silent rewrite. Cross-process locking/merging/fsync durability is not promised.

| Setting                    | Default | Allowed values / meaning                                                                                                                         |
| -------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `enabled`                  | true    | Boolean; sampling/declaration control, never authority.                                                                                          |
| `historySize`              | 6       | Integer 2–50; recent comparable completed-turn deltas.                                                                                           |
| `horizonTurns`             | 3       | Integer 1–20; prediction horizon.                                                                                                                |
| `reserveTokens`            | 4096    | Integer 0–1000000; forecast reserve, not an execution budget.                                                                                    |
| `persistTraces`            | false   | Boolean; append numeric/assessment counters as `aco-monitor` metadata on completed turns.                                                        |
| `mode`                     | observe | `observe` (V1), `exact-prune` (V2), `compact` (V3), or `delegate` (V4), plus opt-in `adaptive` composition; none grants higher-impact authority. |
| `maxCompactInputTokens`    | 64000   | Integer 1–1000000; estimated input ceiling for V3, not permission.                                                                               |
| `maxSummaryTokens`         | 8000    | Integer 1–100000; estimated summary ceiling for V3, not permission.                                                                              |
| `maxPruneTokens`           | 64000   | Integer 0–1000000; maximum tokens pruned per turn/request.                                                                                       |
| `maxDelegationDepth`       | 1       | Integer 0–1; zero refuses dispatch, one permits native children; recursion is unavailable.                                                       |
| `maxDelegationConcurrency` | 2       | Integer 1–8; one batch at a time; reject oversized batches rather than silently queue them.                                                      |
| `maxDelegationTokens`      | 200000  | Integer 0–10000000; parent + retained child + coordination admission budget; zero refuses dispatch.                                              |
| `maxChildOutputTokens`     | 2000    | Integer 128–8000; passed as provider maxTokens (clamped to model maximum), also bounds result bytes.                                             |

Defaults are **uncalibrated tunables**. Pi current context tokens are estimated (last usage plus trailing-message estimates), not exact post-filter/request counts. Capacity is observed model configuration. Growth uses recent comparable completed-turn means; model/window/projection/compaction/tree changes, unknown usage and shrinking readings invalidate baselines.

Tool size is explicitly `ceil(UTF-16 text length / 4)`, not a tokenizer; multimodal/unsupported bodies stay unknown. Recent per-tool/limit maxima estimate announced bursts, with unknown calls and nested overlap disclosed. Projected tokens = current + max(mean growth × horizon, known pending estimates) + reserve. Unknown components can add more. Declared future task work is considered separately. `burstRisk` is a capacity fraction, not a probability.

Provider input/output/cache tokens and costs are **last-response reported measurements**, not aggregate task costs. Missing metrics stay unavailable. Management sampling/analysis milliseconds measure only those local calculations; declaration overhead is not separately attributable from parent-model usage. Reclaimable/protected token sizes and recovery cost remain unknown without the later semantic/recovery capabilities.

The monitor retains at most 50 trace snapshots, 50 growth deltas, 64 tool-history signatures × 10 sizes and 256 pending calls. Overflow is explicitly uncertain until reset. Historical traces are not fresh growth baselines after restart.

## V4 independent children (T0006)

Command-only proposals: `/aco delegate <JSON>`, `/aco delegation` (outcomes/reservations/authority; durable in persistent Pi sessions), `/aco reconcile <JSON>`. No model-callable execution or permission-minting tool is added. Complete declarations/checkpoints before authorizing: declarations, configuration/model changes and revoke cancel owned work and revoke grants.

Reference example (substitute actual task/receipt/source IDs; do not run placeholders):

```text
/aco declare {"taskId":"parent","active":true}
/aco declare {"taskId":"inspect-api","active":false,"delegatable":true,"writeConflictRisk":0,"writeResources":[]}
/aco config mode delegate
/aco authorize {"operation":"delegate","taskIds":["inspect-api"],"maxTokens":200000}
/aco delegate {"tasks":[{"taskId":"inspect-api","goal":"Inspect the supplied API evidence","constraints":["Read-only; do not claim tests executed"],"acceptance":["Report API risks with evidence"],"resources":[{"path":"src/api.ts","write":false}],"evidence":[{"checkpointId":"REAL_CHECKPOINT_ID","segmentId":"REAL_SOURCE_ENTRY_ID"}]}]}
/aco delegation
/aco reconcile {"id":"REAL_CHILD_ID","accepted":true,"verification":["Parent independently reviewed acceptance/evidence; record actual tests or why none apply"]}
```

Omit `authorize` for confirmation-by-default in the terminal. RPC/print/JSON without applicable explicit authority recommend only and never wait on UI. V3 grants never authorize delegation. Grants are runtime-only and scoped to project/session/active parent, declared child IDs, branch anchor and aggregate ceiling; mode/enablement alone never authorizes execution. Existing independent task declarations must explicitly say delegatable and zero conflict risk, have resolved completed dependencies and no unfinished consumers/conflicts. These are declarations, not a semantic proof: the parent must judge coupling.

Each child is **one independent text model request** through the current host registry, not an SDK session fork and not a general coding-agent subprocess. It receives explicit goal, constraints, acceptance, allowed work/resources and bounded selected evidence only. No parent transcript, ambient instructions, tools or exploration history is copied. Selected existing UTF-8 files are at most 32768 bytes each; canonical aliases, symlinks, outside-project files and multi-link files are refused. Proposed writes must also appear in the child's declared `writeResources`. Read/write and write/write overlaps in a batch are rejected. Necessary historical segments use host-minted child grants, not IDs as authority, with an 8192-byte provenance envelope per reference; a partial segment is labeled by its continuation offset. Request a different explicit slice locally if that bound is insufficient.

Child JSON contains `conclusions`, `deliverables:[{path,content}]`, `evidence`, `tests` and `unresolvedIssues`. These are bounded claims, not trusted tests or success. ACO never writes deliverables to the workspace. Review/apply them and run appropriate tests with normal parent tools first. Reconciliation re-verifies referenced historical evidence and real current file bytes against proposed deliverables or original snapshots, requires explicit parent verification evidence, and rejects unresolved issues. It records **parent-attested** verified/rejected results, leaves task completion declarations unchanged, and exposes child/task/checkpoint links in `/aco tasks`. This is historical verification, not a continuing guarantee of workspace freshness.

Admission accounting charges reported parent assistant, summary, auxiliary usage and nested tool tokens across the whole session tree, retained reservations for every child intent (including failed/interrupted attempts), text input bytes plus 4096 framing units, bounded output and conservative request/result coordination. It is deliberately conservative, not an exact tokenizer or forecast. Missing required parent/summary usage refuses launch; unreported hidden third-party model activity cannot be metered by ACO. Child measured tokens/cost/cache/latency are reported separately; unknown usage, orphan reservations or a detected overrun blocks later dispatches for that session. Continue locally rather than silently resetting its ledger. The provider receives an output cap and abort signal with a 60-second local deadline; provider-side metering/cancellation compliance is not an OS-enforced spending limit. ACO cannot cap unrelated future parent requests or already-incurred provider charges. No refund, automatic retry or replacement is performed; one attempt per declared child ID is retained across restart/branch navigation. Persisted intents without results remain interrupted, never successful. Reload/tree/session changes suppress stale result writes; explicit cancellation retains unfinished status. Cleanup aborts only ACO-owned controllers.

No general multi-turn child tool execution, shell testing, new-file creation, unrestricted recursion or adaptive selection is claimed. Inseparable work stays local. These restrictions are the delivered provider's conservative capability boundary, not new requirements on other plugins.

## T0007 adaptive composition (opt-in)

Set `/aco config mode adaptive`; enablement is **not** higher-impact authority. Status/trace includes `adaptiveDecision`, `composition` and active-branch `aggregateUsage`. Task/phase changes, deteriorating forecasts and dependency/conflict evidence are named triggers; unchanged assessments are reused. No mandatory classifier or semantic decision request is added. Low occupancy can prompt action for impending growth; bounded near-completion can select no-op at high occupancy.

- `/aco compose`: execute the selected exact-redundancy candidate (checkpoint then prune), or report no-op/parameters-needed recommendations. No idle background strategy scheduler is added.
- `/aco compose <JSON>`: submit `{"steps":[...]}`, 1–8 ordered steps, at most 65536 serialized characters.
- `/aco advance`: inspect the pending executor result and advance only after verified completion. This is not an automatic retry or a new authority grant.
- `/aco composition`: inspect current runtime scheduling/results. Restart never replays a composition.

Steps are `checkpoint`, `offload` or `prune` with `request:{"sourceEntryIds":[...]}`; `semantic` with the normal summarize request; `delegate` with the normal bounded child contract; or `native` without a request. Offload is an alias for the same immutable verified archive operation, not a new strategy or permission. Each executor revalidates availability, branch/task dependencies, originals, legal messages, authority and budgets. Exact pruning does not authorize semantic/native/delegate steps. Default consent and scoped grants are unchanged.

Example structure only (replace real IDs before use):

```text
/aco compose {"steps":[{"kind":"checkpoint","request":{"sourceEntryIds":["REAL_OLD_ID","REAL_RETAINED_ID"]}},{"kind":"prune","request":{"sourceEntryIds":["REAL_OLD_ID"]}},{"kind":"semantic","request":{"sourceEntryIds":["REAL_RETAINED_ID"]}}]}
```

Prune/semantic replacements await an ordinary completed turn boundary; no extra parent turn is requested. Native compaction awaits actual persisted completion. Returned children wait for ordinary explicit parent reconciliation before dependent steps. Use `advance` afterward. Failed/denied/partial/stale steps stop dependent work, preserve recovery evidence and make no atomic rollback claim. A restored-but-previously-edited source remains ineligible for another prune. Declaration/configuration/model/tree/revoke/session changes cancel owned scheduling. Do not interleave independent context-edit proposals with a pending composition.

The current selection policy compares task fit/continuity, estimated capacity relief and child isolation, exposes alternatives and recovery/risk/overhead/cache uncertainties, and has **no calibrated weights or optimality claim**. It does not synthesize child contracts or arbitrary semantic summaries. Prediction comparison is the prior horizon projection versus the next assessment's host estimate, explicitly **not** a matched-horizon forecast accuracy score. Action receipts expose estimated before/after sizes separately from persisted execution.

Aggregate usage distinguishes parent, child and management provider-reported input/output/cache-read/cache-write/tokens/cost. Missing fields, missing child results and absent native usage remain unavailable, not measured zero. Local rules/extractive generation add zero decision-model calls; normal tool schemas/results, parent turns, child work, storage, coordination and cache invalidation still cost resources. Totals cover the active branch, not all spending across abandoned branches or hidden third-party calls; currency/tariff comparability is not independently certified.

`npm run smoke:adaptive` packs/installs the real plugin outside the checkout and exercises actual Pi checkpoint→prune, independent semantic consent, summary→offload, restoration, child-return→parent-verification→checkpoint, native→checkpoint and restart/no-replay. It compares the same deterministic task turns against no ACO, reporting outcomes, restoration, fixture tokens/cost/cache, wall time and scripted controls. Optional `ACO_EVALUATION_OUTPUT` saves its JSON report. Fixture usage is length/4 with a zero tariff and no cache simulation: **not live provider measurement or a representative-model benchmark**. Reduced context does not establish lower aggregate cost or superiority. Real representative task evidence and task-dependent policy/weight evaluation are still required for T0007 completion.

## Permissions and boundaries

Extensions have Pi's OS privileges; this is not a sandbox. ACO reads host session/usage/tool metadata, writes its own settings, declarations and optional numeric traces. **Explicit checkpoints copy selected original source-entry content and task continuity into a separate local archive**, which may contain sensitive user/tool data and resource paths. No encryption or automatic expiry/garbage collection is provided; protect the agent directory and remove its evidence directory manually when no longer needed (retained receipts then correctly fail verification). Other privileged extensions/tools or local users with filesystem access are outside these policy isolation guarantees. Ordinary model tool arguments/results still follow Pi's session/provider lifecycle. Unrequested bodies are never automatically archived or injected; numeric traces omit bodies.

V4 delegation explicitly sends only selected task/resource/evidence bytes to the currently configured Pi model provider, using its existing credentials. Consent or scoped automation is required; there is no default evidence upload. Children have no shell, filesystem tools, provider tools, extension discovery, recursive delegation or direct workspace writes. ACO does not apply staged deliverables: the parent uses ordinary tools independently, then reconciles. No evidence deletion or automatic continuation is added. Explicitly authorized V3 actions can replace model-visible text results or initiate native prefix compaction; they preserve raw history and use only the declared local evidence archive. Native user/host/other-extension behavior is not governed by ACO. Only ACO-owned listeners/status/state are closed.

T0004 V2 verified exact pruning/restoration and T0005 V3 bounded extractive/native compaction are delivered. V4 bounded children/staged proposals are delivered by T0006; T0007 adds controlled V5 combinations; representative-task comparison evidence remains pending.

## Verification

From this directory, run separately:

```sh
npm run typecheck
npm run check
npm test
npm run smoke
npm run smoke:tasks
npm run smoke:evidence
npm run smoke:prune
npm run smoke:compact
npm run smoke:delegate
npm run smoke:adaptive
```

Smoke tests require installed Pi/npm and the prepared npm cache. All install actual plugin tarballs outside the checkout, use an isolated agent directory and deterministic in-process provider, and make no live provider requests.

- `smoke`: T0001 controls/passivity, model-bound conversation/tool-body equality against no ACO (normalizing only timestamps/durations and the intentionally added `aco_task`/`aco_recall` schemas), no extra model calls, parallel/blocked/unknown outcomes, metadata non-visibility and model/external-edit/native-compaction resets.
- `smoke:tasks`: actual E02/E03 workload/no-op decisions, protected exact evidence, command/tool declaration provenance, atomic invalid-update rejection, tree isolation, persisted resume and no strategy/extra model calls.
- `smoke:evidence`: actual Pi command/tool recall and provider-bound visibility, historical replay after workspace changes, real persistence failure, corrupt restart fallback, incomplete records, task/project/tree/fork isolation and disabled control. Child-subset grants, verification fault injection, append cancellation and selective/Unicode pagination are real-filesystem Vitest evidence, not live worker dispatch.
- `smoke:prune`: installed Pi exact pruning in real RPC session, covering V1 observe passivity, request-local projection, durable context_edit omission, verified restoration from evidence store, and branch-relative isolation.
- `smoke:compact`: installed Pi local summary/rejection/restoration, protected exact evidence, unauthorized RPC no-UI behavior, scoped grants, actual native prefix completion, cancellation, real session-file append failure, foreign-handler interference, restart continuity and supported tree recovery. Deterministic fixture provider, not a general-model quality benchmark.
- `smoke:delegate`: isolated installed Pi parent/children, allowed evidence without parent history, structured staged deliverables, independent parent byte checks, persisted reservations/outcomes with revoked restart authority, exhausted no-launch case, parent working-set bytes alongside aggregate provider tokens/cost/cache and latency. Controlled fixture, not a live quality/cost benchmark.
- Optional V4 terminal check: `python tests/delegation-tui-smoke.py` in Python 3.12 with test-only `pywinpty==3.1.2`. Actual ConPTY default confirmation, Escape denial/no launch, confirmed isolated child and needs-verification outcome.
- Optional V3 terminal check: `python tests/compaction-tui-smoke.py` in the same isolated Python 3.12 / `pywinpty==3.1.2` environment. Actual ConPTY dialogs verify local/native default confirmation, Escape denial, approved local commit/restoration and native completion.
- Optional actual Windows ConPTY keyboard test: `python tests/tui-smoke.py`, using Python 3.12 with test-only `pywinpty==3.1.2` in an isolated Python environment. It covers settings/persistence, full-prefix Tab completion, task/recommendation inspection, loaded-only panel switching, real reload and orderly exit. Its `--approve` flag applies only to its disposable directory.

Evidence is recorded in [T0001](../../.grimoire/ticket/0004-adaptive-context-orchestrator/T0001-v1-context-monitor-and-plugin-control.md), [T0002](../../.grimoire/ticket/0004-adaptive-context-orchestrator/T0002-v1-task-context-graph-and-recommendations.md), [T0003](../../.grimoire/ticket/0004-adaptive-context-orchestrator/T0003-v2-scoped-evidence-store-checkpoints-and-recall.md) and [T0004](../../.grimoire/ticket/0004-adaptive-context-orchestrator/T0004-v2-recovery-gated-exact-pruning.md). The T0005 receipt records V3 and prerequisite repair evidence. Controlled fixtures, unit assertions and actual host/terminal interaction are separate evidence classes. Manual visual GUI testing, other host/Node/platform versions, real-project inference accuracy and adaptive-policy superiority are not claimed.
