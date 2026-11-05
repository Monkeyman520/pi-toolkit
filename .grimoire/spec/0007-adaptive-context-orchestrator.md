# Adaptive Context Orchestrator

**Spec ID:** 0007
**Status:** In Progress
**Date:** 2026-11-05
**Selected endpoint:** Requirements specification → ticket set; no implementation or implementation-plan authorization.

## Sources and settled handoff

| Source | Contract carried into this specification |
| --- | --- |
| S1 — User's nine-section ACO proposal in this refinement conversation | Task-aware working sets; observe/predict/decide/execute/verify loop; pressure, task and context analysis; four composable strategies; dependency graph; recoverability and message integrity; cache/cost measurement; event-triggered hybrid control; V1–V5 delivery and evaluation. The formulas, interface sketches and percentage trace are illustrations, not calibrated models, mandatory wire schemas or measured results. |
| S2 — User acceptance: “按照建议 接受” | Define the complete staged ACO contract; V1 is observation/recommendation only; later automatic exact offloading/pruning requires recovery verification; default memory scope is project plus current task's session lineage, with authorized subagent access; distinguish historical evidence from current workspace facts; select Spec → Slice. |
| S3 — User confirmation: “是” to the authorization recommendation | Semantic replacement, global compaction and delegation require confirmation by default. Explicit authorization may permit automation, but cannot bypass recovery verification, dependency protection or budget checks. Without applicable authorization, non-interactive execution produces recommendations, not these actions. |
| S4 — [Project context](../CONTEXT.md), [ADR 0001](../adr/0001-independently-installable-pi-packages.md), [ADR 0002](../adr/0002-typescript-esm-plugin-development-stack.md), [ADR 0004](../adr/0004-unified-command-grammar-and-dynamic-tui-configuration.md), [ADR 0005](../adr/0005-versioned-plugin-support-library.md), [package reference](../../packages/README.md) | Independently installable plugin, package-local ownership and checks, selected stack, unified commands/completion/TUI configuration and installed-only discovery. |
| S5 — [ADR 0006](../adr/0006-task-aware-context-working-set-and-isolation.md) | Recorded working-set, staged rollout, isolation and authorization decisions, including the dated clarification. |
| S6 — Installed Pi 1.5.0 documentation, inspected during refinement | Relevant sections of `docs/extensions.md` and `docs/session-format.md` under the installed host documentation directory. Public references: [Extensions](https://pi.dev/docs/latest/extensions), [Session Format](https://pi.dev/docs/latest/session-format). These are capability/documentation evidence, not plugin runtime tests or a promise about every host version. |

**Intent:** Maintain task continuity with a smaller, recoverable main-agent working set rather than maximizing a compression percentage. A task approaching completion may need no intervention at high occupancy; a large upcoming exploration may need intervention at low occupancy.

**Permissions:** This refinement writes only knowledge records, this specification and its selected ticket set. It does not implement the plugin, run implementation QA, stage, commit, publish or modify the Pi host.

**Assumptions and limitations:** No calibrated weights, forecast accuracy targets, budget values, package/publication identity, storage engine or delegation provider have been selected. These are not silently supplied here. Implementations may choose mechanisms within this contract; numerical policy must be explicit and evaluated, not represented as proven optimal. The third-party projects named in S1 are research leads, not verified dependencies or required providers. No blocking behavioral choice remains after S3.

## Requirements

### R01 — Independent Pi plugin and user control

**Sources:** S4, S5.

Deliver ACO as an independently installable collection plugin under `packages/<plugin-name>/`, with its own manifest, README, TypeScript configuration and `extensions/index.ts`. Follow the TypeScript ESM/erasable-syntax, Node.js >= 22.19.0, TypeBox, Biome, Vitest and no-emitted-build baseline. Used host SDKs and `typebox` are host-provided peers with `"*"` ranges; other runtime dependencies are declared.

The plugin owns its settings, runtime state, handlers, cancellation and cleanup. It may use an explicitly declared ordinary support-library dependency, not undeclared sibling source or a separately activated collection manager. Loading or stopping ACO must not implicitly activate or stop unrelated plugins.

Expose status and configuration through the established `/<extension> <action> [other-args]` grammar, multi-token argument completion, interactive TUI configuration and non-TUI text fallback. Discover only loaded plugin panels through the established event protocol. Show active stage/mode, authorization, configured budgets, measurements versus estimates, recommendations and action outcomes; do not imply a planned capability is already active. Literal package/command names remain implementation naming choices, not new behavior.

### R02 — Pressure observation and forecast

**Sources:** S1 §§1–2, S2, S6.

Observe active-model context capacity and usage, recent net growth, predicted upcoming growth/burst risk, projected usage, reclaimable/protected content estimates and recovery cost. Use tool identity/input, recent comparable results and available task expectations as forecast evidence rather than occupancy alone.

Separate measured, estimated and unavailable values. Pi usage combines the last assistant usage with estimates for trailing messages; it is not a precise post-filter token count for every request. Insufficient history or unavailable model/cache information must remain identifiable rather than become a fabricated zero or confident prediction. A model/window change or context intervention must not be misclassified as ordinary task growth.

The proposal's forecast expresses current usage plus estimated future growth plus reserve divided by capacity. Its horizon, reserve and estimation inputs must be inspectable; no particular watermarks, sample count, accuracy guarantee or weights are mandated. Later measurements must be comparable with prior predictions to assess forecast quality.

### R03 — Task state and meaningful transitions

**Sources:** S1 §§2,5,7.

Represent task identity, phases `explore/plan/implement/test/review`, statuses `pending/running/completed/blocked`, task dependencies, required context references, expected future tokens, delegatability and shared-resource write-conflict risk. Distinguish inferred/uncertain state from an explicit declaration; do not force unsupported phase certainty.

Use the user goal, available plan, tool activity, modified resources and test state together; the last assistant message alone is insufficient evidence. Support explicit task/dependency declarations as well as inference. Plan completion, task switching, subagent returns and stage-test completion are opportunities for reassessment, not proof that all earlier evidence is disposable.

### R04 — Context dependency graph and protected information

**Sources:** S1 §§2,5.

Track semantic segments rather than only scoring individual messages. Nodes identify their task, source session entries, dependencies, summary, optional storage reference, estimated token size, relevance/recoverability and pinned/active state. Preserve the meanings of constraint, decision, evidence, artifact and checkpoint nodes without freezing S1's TypeScript sketch into an unverified SDK contract.

Represent both task-to-context and conclusion-to-evidence dependencies and identify active consumers. Classify user constraints/acceptance criteria, decisions, active evidence, completed research, reproducible data, redundant content and execution state so policy can distinguish their treatment.

Protect user requirements, current acceptance conditions, unfinished task state and critical decisions by default. No automatic prune may remove them without a verified equivalent representation. Inference, age, low relevance, a completed plan, or a plausible summary alone is not equivalence verification. Preserve precision-sensitive protocol details, code paths and errors while active decisions depend on them.

### R05 — Recoverable offloading, checkpoints and bounded recall

**Sources:** S1 §§1,4–7, S2.

Provide current working set, structured summary/index and full evidence storage as distinct tiers. Persist task/plan state, decisions, source references, raw evidence and checkpoints sufficient to recover continuity. Retain latest execution facts, modified-resource references, test outcomes and unresolved work without presenting obsolete checkpoints as current.

Offloading must retain context/evidence IDs, source-entry IDs, task relationships and a recovery route. Persist and verify recoverable original evidence before removing its model-visible contribution. Recall must support a requested evidence segment rather than unconditionally injecting the entire store; its output remains subject to context/budget controls.

A storage write acknowledgment alone, an index without retrievable content, or an old source path without its original bytes is not recovery verification. Failed storage, missing evidence or failed verification leaves the affected content in the working set and reports the failure.

### R06 — Scope, provenance and current-fact recovery

**Sources:** S2, S5, S6.

Default storage/recall scope is the project plus the current task's session lineage. A subagent receives only authorized necessary references; possession of an ID is not authorization. Do not default to cross-project access or remote upload. Keep scope and source provenance through summaries, checkpoints and recalls.

Honor the active session branch when rebuilding graph/task state and applying edits. Resume, fork and tree navigation must not import decisions or pruning state from an unrelated branch merely because entries share a file.

Separate historical replay from reading current source/environment state. If the workspace changed, recalled evidence must remain identified as historical; current-state claims require reacquisition or applicable freshness verification. Returning the earlier bytes is successful historical recovery, not proof those bytes still describe the workspace.

### R07 — Event-triggered hybrid planner and composable strategies

**Sources:** S1 §§1,3,7.

Generate candidates from pressure, task state and context dependencies; support ordered combinations of offloading, exact pruning, semantic compaction and delegation, including proactive actions at low occupancy. No beneficial safe candidate means no intervention.

Use rules and existing metadata first. Additional model reasoning is for substantive task changes, materially worsened forecasts or semantic conflicts, not a mandatory call every turn. The model can assess semantic value, suggest tasks and summarize; runtime owns measurements, storage/recovery checks, dependency/permission enforcement and budgets.

Explain estimated main-agent savings, task continuity, recovery, loss/failure risk and token/latency/coordination overhead for decisions. The suggested utility formula is a candidate evaluation framework, not calibrated truth; weights must be evaluated on actual tasks and may vary by task type. Neither a fixed strategy order nor forced delegation is required.

### R08 — Exact pruning and request-local versus durable effects

**Sources:** S1 §§3–4,7, S2, S6.

Identify redundant, obsolete or currently unneeded contributions using dependencies and recoverability, not time alone. Runtime may automatically execute exact offloading/pruning in later stages only when recovery, protected-content, authorization-scope, structural and budget checks pass.

Use request-local `context` projection for reversible filtering and append-only `context_edit` for durable omission/replacement of supported targets. Temporary filtering does not alter raw session history or prove semantic safety; promote an edit only after explicit dependency/protection and recovery checks, not merely because one request appeared to succeed.

Retain source IDs and a verified route for restoring the original model-visible contribution. Replacing content with newly generated semantic text belongs to R09, not the automatic exact-prune permission. Preserve raw history, metadata and accounting; do not directly rewrite session JSONL.

### R09 — Local semantic replacement and native global compaction

**Sources:** S1 §§3–4,7, S3, S6.

Support structured summaries for selected semantic segments, maintaining conclusions, constraints, decision rationale, exact details still required, provenance, dependencies and recovery references. Verify the proposed replacement against active requirements and recoverable sources before it can replace model-visible originals. Failed verification must not apply a lossy replacement.

Local replacement uses supported append-only edits; native compaction summarizes an earlier prefix and is not an arbitrary-range compression API. Customize native summaries through `session_before_compact` and observe completion/failure of `ctx.compact()`; initiating compaction is not evidence it succeeded.

Both local semantic replacement and ACO-initiated global compaction obey R11. Recovery/dependency verification is mandatory even with explicit automation permission. Do not claim that a summary can be guaranteed lossless for every task.

### R10 — Delegation with minimal task contracts and bounded ownership

**Sources:** S1 §§3–5,7, S3.

Delegate only a task judged sufficiently independent. Pass a task contract containing goal, constraints, acceptance, relevant resources/context references and allowed work, not the entire parent history. Results identify conclusions, deliverables/modified files, evidence references, tests and unresolved issues, not the complete exploration transcript.

Provide authorized segment recall to children and reconcile returned state with the parent task graph/checkpoint. A subagent return or test report is evidence to verify, not automatic task success.

Enforce configured finite delegation depth, concurrency and aggregate token budgets, including parent/child coordination. Detect overlapping writes/shared-resource conflicts before scheduling independent writers. Tasks with tight shared information or unsafe write conflicts may remain local. Observe cancellation and account for unfinished/failed children; do not report their work as completed or start unlimited replacements.

No delegation backend is mandated. Missing/unavailable delegation capability yields a recommendation or local continuation, not a false claim of execution. All ACO-initiated delegation follows R11.

### R11 — Authorization is separate from safety

**Sources:** S2, S3, S5.

| Operation | Default ACO behavior |
| --- | --- |
| V1 observations, forecasts, task/graph assessment, recommendations | Allowed; no strategy execution. |
| Later exact offloading/pruning | May execute automatically only after the corresponding recovery/dependency/structure/scope/budget checks pass. |
| Semantic replacement, ACO-initiated global compaction, subagent delegation | Request user confirmation before execution unless applicable explicit user authorization permits automation. |
| Same higher-impact actions in non-interactive mode without applicable authorization | Recommend only; do not execute or hang waiting for unavailable confirmation. |

Authorization must identify the operations and scope it covers; a model proposal, tool call, high occupancy, generic plugin enablement or permission to store evidence is not itself permission to run all strategies. A declined or inapplicable approval leaves the proposed action unapplied. Explicit authorization never disables recovery verification, dependency protection, structure validation, isolation or budgets.

These rules govern ACO's actions. They do not claim to disable host-native user commands/automatic compaction or to govern unrelated extensions.

### R12 — Verifiable commits, recovery and failures

**Sources:** S1 §§7–8, S2, S6.

Before a strategy changes the working set, establish a recoverable checkpoint/source mapping, verify its external content where unloading/replacement is involved, validate the action against current task/branch/dependencies and confirm applicable authority and budgets. Execute ordered actions only while their prerequisites remain satisfied; do not continue a composition after a prerequisite fails.

Pi boundary draft validation is not a transactional persistence guarantee. Interrupted writes, partial append sequences, failed compaction and cancelled model/storage work must remain distinguishable from committed success. On restart/reload, reconcile recorded actions with actual persisted context and evidence before retrying or claiming completion. Never compound uncertainty by blindly reapplying a partial strategy.

Provide restoration from verified sources/checkpoints after an invalid or ineffective edit and keep its outcome observable. Recovery failure must surface explicitly, not erase the last usable representation. Evaluate actual results separately from the proposal's estimated savings.

### R13 — Valid model messages and truthful tool evidence

**Sources:** S1 §7, S6.

Keep system prompt/tool declarations and legal assistant-tool-result relationships intact. Omission must not leave an orphan tool result or an unanswered tool call; prefer safe result-body replacement or complete legal boundaries where necessary. Preserve tool identity, call IDs and error semantics rather than recasting an execution error as success.

Tool-result transformations must preserve required structured information or explicitly account for its removal; Pi may drop structured content when content is replaced without a matching structured patch. Archive recoverable originals before a permitted transformation. V1 observes results without truncating, summarizing or replacing them.

### R14 — Pi lifecycle, capability boundary and extension composition

**Sources:** S1 §4, S4, S6.

Use supported host APIs/events rather than a host fork or direct JSONL mutation. Observe turn/tool activity, use `pi.appendEntry()` for extension metadata, and reconstruct active state on session events. Custom entries are metadata, not automatically model-visible memory.

`ctx.sessionManager` in extension contexts is a read-only view; do not assume mutable SessionManager methods are exposed there. Use supported actionable boundary drafts such as `turn_end` for `context_edit` commits and account for other handlers' proposals/previews. Preserve fields and proposals not owned by ACO and handle composition failures without corrupting the request.

`tool_result` is not emitted for every failed/blocked/unknown call; observe finalized calls through the appropriate completion event. Parallel completions may interleave, and `tool_call` state need not contain sibling results. Do not manufacture dependencies from an assumed serial order. `agent_end` is not necessarily final idle; account for retries/continuations and settled state when acting at completion.

State compatibility in terms of actual required APIs and verified host versions, not wildcard peers. If a required capability is missing, report it and do not run the unsupported action; observation/recommendation must not silently turn into raw-history edits. Close only ACO-owned background work on shutdown/reload and prevent stale-session asynchronous work from editing a replacement session.

### R15 — Costs, cache and task outcomes, not compression alone

**Sources:** S1 §§3,7–8.

For proposed/executed actions, record their reason, affected references, predicted versus observed working-set impact, recovery/validation outcome, model-call overhead and execution latency. Measure effective model-context usage separately from preserved raw-history accounting.

Report cache-read/cache-write/new-input cost and total tokens/cost, including semantic reasoning, compaction and delegated work where reported. Unavailable provider metrics remain unavailable; reduced parent context is not automatically lower aggregate cost or latency. Consider prefix-cache disruption when ranking pruning/reordering proposals.

Evaluate task success, continuity, recovery attempts/failures, mistaken decisions, total tokens/cost, latency and human interventions alongside working-set savings. Compare adaptive combinations with no-ACO/fixed-watermark or compaction-only controls on comparable tasks and record tradeoffs. V5 cannot claim superiority from the proposal's hypothetical percentages or from token savings alone. Do not invent acceptance thresholds or adaptive weights before evidence exists.

### R16 — Staged delivery without premature mutation

**Sources:** S1 §8, S2, S3.

| Stage | Observable delivered outcome | Safety/delivery boundary |
| --- | --- | --- |
| V1 | Context monitor, growth/burst/projection evidence, task/phase awareness, explainable recommendations and baseline traces | Observation/recommendation only. No ACO filtering, result-body rewriting, durable edits, semantic replacement, native compaction initiation or subagent dispatch. Metadata persistence is allowed and is not strategy execution. |
| V2 | Scoped context store, checkpoints/recall and dependency-aware verified exact pruning with before/after evidence | Establish the full context dependency/protection checks before automatic pruning. Recovery precedes unloading; preserve legal messages and branch isolation; report/restore failed edits. |
| V3 | Verified local semantic summaries and ACO-initiated native prefix compaction | Confirmation or explicit automation authority, plus non-bypassable checks. |
| V4 | Authorized bounded task delegation and result reconciliation | Minimal contracts, scoped evidence, write-conflict protection and total-cost accounting. |
| V5 | Evaluated event-driven adaptive combinations | Run only capabilities actually available/authorized; verify ordered prerequisites and compare with controls. |

The full contract is in scope; V1 is the first deliverable, not a claim that V2–V5 have shipped. Shared execution guards are obligations of the first consuming strategy rather than an unrelated pre-refactoring project.

## Solution and integration contracts

The established loop is observe → predict → decide → execute → verify. The logical pressure monitor, task/context analyzers, strategy planner, runtime executor and persistent context store exchange the information below. These are ownership seams, not a prescribed source-file/class layout.

| Seam | Expects | Provides / guarantee |
| --- | --- | --- |
| Pi runtime → observation | Usage/capacity, lifecycle/tool events, active session/branch and available model metrics | Timestamped measured/estimated/unavailable pressure and task evidence; finalized tool outcomes; no V1 mutation. |
| Task/context analysis → planner | Task state, context nodes, source IDs, active dependencies/protection and recovery metadata | Evidence-backed candidates/no-op and uncertainties; explicit declarations remain distinguishable from inference. |
| Planner/model → runtime executor | Ordered actions, affected sources/task scope, expected benefit/cost/risk, authorization request | Runtime independently validates current dependencies, recoverability, structure, permissions and budgets before effects. A semantic proposal has no execution authority. |
| Executor ↔ store/recall | Project/task-lineage scope, evidence segments, checkpoints, source mappings and requested recall | Verifiable persisted originals and scoped recovery; no loss of the current usable representation on failed persistence/verification. |
| Executor ↔ Pi projection/session | Supported context messages and append-only boundary proposals | Request-local versus durable semantics, preserved raw history, branch-relative edits, composition-aware commits and observable partial failures. |
| Delegation ↔ parent/store | Minimal task contract, allowed resources, configured bounds and evidence scope | Independently bounded child work, authorized recall, structured results and parent reconciliation, without implicit whole-history copying. |
| User/UI/config → executor | Confirmation or explicit automatic permission and configured budgets | Inspectable authority/mode; unauthorized non-interactive proposals do not execute. |
| Outcome evaluation → planner/user | Observed usage/cost/cache/task/recovery results and baseline traces | Explainable predicted/actual differences and evidence for later adaptation, not an invented optimal score. |

### Verified host semantics

S6 supports request-local `context` transformation and append-only branch-relative `context_edit` entries with `targetId` and null/content replacement. Original entries remain intact in raw history/UI/accounting. The latest edit on the active branch wins.

S6 also supports custom metadata entries, actionable boundary drafts, custom compaction and tool-result transformations. It does not provide an atomic transaction across external evidence and session persistence. Native `ctx.compact()` initiates asynchronously and must be observed for completion/failure. Compatibility and runtime behavior still require implementation-time checks.

## End-to-End Tests

These scenarios define required input-to-outcome evidence, not tests already run.

| ID | Given / when | Then |
| --- | --- | --- |
| E01 | ACO alone is installed outside the checkout and Pi starts in V1; a large result arrives | Correct resources/status/config load without siblings or a build; measured/estimated pressure updates; provider-bound messages and tool results are unchanged by ACO and no strategy executes. |
| E02 | A nearly completed high-occupancy task and a low-occupancy task about to read a large corpus are supplied as controlled traces | The planner can recommend no-op for the former and a proactive candidate for the latter, explaining task/growth evidence rather than obeying a watermark. Unknown forecast inputs remain unknown; model/window changes do not look like bursts. |
| E03 | Exploration completes, a decision depends on exact interface evidence, and implementation begins | A phase transition triggers reassessment; decision/active evidence remain protected, expendable research becomes a candidate, and uncertainty/explicit dependencies are visible. |
| E04 | V2 offloads completed research; persistence or readback verification is fault-injected | Verified originals become recallable by segment before any removal. On either failure the affected original remains model-visible and no successful unload is claimed. |
| E05 | Evidence is stored for project A/task lineage A; another project, unrelated task or unauthorized child requests its ID | Recall is denied without disclosing content; an authorized child can retrieve only its allowed necessary evidence. |
| E06 | A pruned branch is resumed/forked/navigated and an old source file has changed | Task/graph/edit state follows the active branch; historical recall returns identified old evidence, while a current-state request reacquires or verifies freshness rather than asserting the old source is current. |
| E07 | A candidate would omit one half of a tool exchange, drop a pinned constraint, or replace a structured error result inconsistently | Runtime rejects/adjusts it to a valid protected representation, preserving error semantics and valid messages. A passing filtered request alone cannot authorize a persistent prune. |
| E08 | Local summary verification fails, or ACO-initiated native compaction fails after starting | No failed summary is committed as equivalent; failure is reported and original evidence/checkpoint remains recoverable; compaction initiation is not logged as completion. |
| E09 | Each higher-impact strategy is proposed in TUI and non-interactive modes, with missing/denied/explicit permission | Confirmation is required by default; denial/no applicable authority has no effect; non-interactive unauthorized work remains recommendation-only. Explicit authority permits execution only when all safety and budget checks pass. |
| E10 | A multi-action proposal encounters a storage failure, partial session append, cancellation or replacement-session event | Later dependent actions stop; observed partial state is recorded/reconciled on resume, verified recovery is available, and stale work neither edits a new session nor blindly duplicates a commit. |
| E11 | Independent and overlapping-write tasks are offered for delegation, including an exhausted depth/concurrency/token budget | Only authorized safely bounded tasks launch with minimal contracts; unsafe overlaps/exhausted budgets do not launch. Results/modified files/tests/unresolved work reconcile without declaring failed children successful. |
| E12 | Other context/boundary handlers run before/after ACO; tools complete in parallel, a call is blocked, and the run retries | Preserved proposals/fields, valid final context, finalized-call coverage and correct task state are demonstrated without assuming serial tools or final idle at the first agent_end. |
| E13 | Adaptive composition and control policies run comparable task fixtures with cache and cost reporting | Predicted/observed parent impact, total parent/child/management costs, cache effects, task success, recovery and intervention counts are reported. Missing provider metrics are explicit; parent savings alone do not establish V5 superiority. |
| E14 | A required mutation/delegation capability is unavailable; ACO is reloaded/stopped alongside another plugin | Unsupported actions remain unapplied and clearly reported; ACO-owned resources close, unrelated plugin resources survive and no raw-history fallback occurs. |

## Decisions and traceability

- **Complete contract, staged delivery:** S1/S2/S5. V1 establishes observability before automatic context change; the stages are not implementation evidence.
- **Working-set rather than watermark control:** S1/S2/S5. Occupancy, task progress, content value and anticipated growth can point to different decisions.
- **Recovery and authorization are separate gates:** S1/S3/S5. User consent does not make evidence expendable or remove dependency/budget constraints.
- **Project/task-lineage memory and authorized children:** S2/S5. Useful cross-agent recall does not justify default cross-project sharing or remote upload.
- **Hybrid event-driven decisions:** S1. Runtime enforces mechanical safety; semantic judgment may use the model only where warranted.
- **Existing Pi extension contracts, not a host fork:** S1/S4/S6. Capability checks and honest version evidence remain necessary.
- **Mechanisms left selectable:** S1–S6 do not choose SQLite versus files, a delegation package, literal package/command naming, exact forecasting thresholds or calibrated weights. Such choices cannot weaken this contract or be claimed as approved architecture simply because an example mentioned them.

## Test Plan and evidence requirements

- Trace deterministic fixtures to R01–R16 and E01–E14, including unknown usage, branch changes, pinned/active dependencies, historical freshness, partial writes and both authorization modes.
- Exercise real Pi request projection and session persistence in controlled runs: inspect provider-bound messages, legal tool pairs, original history, durable edits, compaction completion and restart recovery. Mock-only event handlers do not prove this boundary.
- Verify TUI configuration, argument completion and installed-only discovery with actual terminal interaction, plus non-interactive behavior. Test co-loading with other context-changing extensions where the claims depend on ordering.
- Run package-local `tsc --noEmit`, Biome and Vitest separately, then isolated Pi loading/usage with actual declared dependencies. Record the tested host/Node versions and commands; no direct Node entry execution substitutes for Pi.
- Report cache/cost/latency and task outcomes honestly. Controlled fixtures can verify decisions/invariants; real representative tasks are needed to evaluate prediction quality, summary reliability and policy tradeoffs. No performance or superiority claim follows from this document.
- Recheck required official APIs/types/examples at implementation time. Third-party references require their own compatibility, permissions and dependency verification before adoption.

## Out of Scope

- Implementing code, running plugin QA or starting implementation from this refinement.
- A Pi host fork, direct session JSONL rewriting, destructive deletion of raw evidence, or replacing host-native context management globally.
- V1 execution of the four strategies.
- Default cross-project memory sharing, default remote evidence upload or a mandatory shared collection manager.
- Mandating the unverified third-party projects, a storage backend, published identity, invented numeric policy, benchmark victory or lossless-summary guarantee.
