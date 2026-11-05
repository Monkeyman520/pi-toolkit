# V1 task/context references and explainable recommendations

**Ticket ID:** T0002
**Source:** [Spec 0007](../../spec/0007-adaptive-context-orchestrator.md) — R03, R04, R07, R15, R16; scenarios E02, E03. [ADR 0006](../../adr/0006-task-aware-context-working-set-and-isolation.md).
**Status:** Done

## Goal

Make V1 task-aware: maintain task state and available required-context/source references, and explain when to recommend a strategy or no-op without executing it. The complete semantic context graph is not a V1 delivery prerequisite; T0004 establishes it before automatic pruning.

## Affected Surfaces

ACO task state, phase/task-dependency analysis, protected source references, candidate planning, recommendation/status output and their tests/documentation.

## Approach

Combine user intent, available plans, tools, resource changes and tests with explicit declarations. Retain source IDs, protected/active consumers and inference uncertainty. Generate proposed actions/combinations with estimated benefit, cost, recovery and risk. Use rules/metadata first and extra model reasoning only at the semantic triggers established by R07.

## Dependencies and Coordination

- **Blocked by:** T0001 supplies the runtime pressure/event/control boundary used to verify recommendations in Pi.
- **Blocks:** T0004 consumes protected dependencies for safe pruning; T0006 consumes task independence/write-conflict analysis.
- **Coordination risks:** T0003 may proceed in parallel against the spec's source/scope/checkpoint contracts. Agree reference shapes without requiring a storage engine or shared mutable global state.

## Acceptance

- [x] Task identity, declared/inferred phase/status, dependencies, required context, future-token estimate, delegatability and write-conflict risk retain their R03 meanings.
- [x] An assistant's latest statement alone cannot establish a confident phase transition; plan/task/subagent/test transitions are reassessment signals (E03).
- [x] Available required-context/source references and protection declarations remain inspectable for recommendations; pinned constraints, active acceptance, unfinished work and critical decisions are not represented as disposable. Full semantic-node classification and equivalence checks are delivered by T0004 before automatic pruning (R04).
- [x] Exact protocol/code/error evidence with an active consumer is not discarded simply because planning completed.
- [x] Explicit dependency declarations and uncertainty are visible; graph state follows the active branch rather than unrelated session entries.
- [x] High-occupancy near-completion and low-occupancy impending exploration produce explainable no-op/proactive candidates respectively, without a fixed watermark mandate (E02).
- [x] Recommendations support composable strategies, cost/risk/recovery reasoning and no-op. Routine turns do not require extra LLM decisions without a substantive trigger (R07).
- [x] V1 still performs no context/result mutation, offload, compaction or subagent dispatch; recommendation traces distinguish model overhead and estimated savings from measurements.

## Out of Scope

Executing recommendations; calibrated adaptive weights or performance claims; treating a plausible summary or one successful filtered request as safety proof.

## Verification contract

Run the affected package's type check, Biome and Vitest separately and record the tested versions. Supply a controlled Pi loading/usage check for this ticket's delivered behavior; mock-only hooks and direct Node entry execution are insufficient. Keep the package README/configuration and permissions accurate as capabilities change. The execution receipt below records actual checks; the contract itself is not runtime evidence.

## T0002 execution receipt — 2026-11-05

**Outcome:** Done for T0002. T0001 + T0002 complete the controlled V1 observation/recommendation milestone. Spec 0007 stays In Progress and ADR 0006 stays Implementing; T0003–T0008 are not delivered or authorized. No delegation, commit/publication, host modification, evidence-store or strategy-executor work occurred.

**Owner and delivery:** `packages/pi-context-aco/`; new `extensions/tasks.ts` (schema, bounded active-branch reconstruction, inference/protection) and `extensions/recommend.ts` (conditional proposals/no-op), integrated with the existing adapter, commands, TUI and tests. New controls: `/aco tasks`, `/aco recommend`, `/aco declare <JSON>` and the metadata-only `aco_task` tool. README documents declaration schema/examples, provenance, overhead, privacy and bounded uncertainty.

### Acceptance evidence

| Criterion | Evidence and limits |
| --- | --- |
| C1 — TaskState meanings | Schema/analysis tests cover all task fields, declared/inferred/unknown provenance, dependency cycles and normalized resource conflicts. Concrete overlap overrides declared zero risk with an inferred overlap indicator, not a probability. |
| C2 — multi-signal transitions | User/plan/tool/resource/test signals, tentative corroborated phase inference and reassessment triggers are tested. Assistant prose alone proves neither phase nor completion; missing test exit status is unknown and numeric failure without `isError` is still failure. Actual Pi exercises explicit plan transitions and declaration tools. Subagent-return classification is unit-fixture evidence, not live worker dispatch. |
| C3 — protected references | Inspectable source IDs, dependencies, active consumers and protected user constraints/acceptance/critical decisions. Tests cover transitive source aliases and reference/task dependency closure, including completed producers needed by unfinished consumers. Full semantic/equivalence verification remains T0004. |
| C4 — exact evidence after planning | Unit regressions and actual Pi E03 show that planning completion/`completedResearch` cannot make required exact protocol/error evidence disposable. Original evidence is unchanged; no summary claims exact recoverability. |
| C5 — branch scope | Active raw-branch metadata reconstruction; actual Pi tree navigation and persisted resume exclude abandoned-branch tasks. Foreign source IDs, malformed updates and dependency cycles are rejected before append. No new archive/recall store was introduced. |
| C6 — E02 | Actual deterministic Pi provider: low occupancy plus declared large exploration yields proactive conditional proposals; >80% occupancy plus a fitting bounded review remainder yields no-op. These are controlled decision paths, not calibrated recognition or policy superiority. |
| C7 — composition/cost/overhead | Tests cover checkpoint/offload/prune composition, delegation/compaction prerequisites, uncertainty, risks and no-op. Stable assessment inputs are reused. There are zero extra classifier/decision-model requests; declaration definition/call/result still consume normal parent-model context, not separately attributable measured management tokens. |
| C8 — strict V1 | Existing actual Pi control transcript/tool-body equality remains after normalizing timestamps/durations and only the intentionally added declaration-tool loadout. Strategy capability/authority stays disabled and recommendations report `executed: false`. No context/result transformation, offload, compaction initiation or dispatch occurs. Savings/recovery costs remain estimates/ceilings or unknown, never measured reclamation. |

### Execution and review

Followed `.grimoire/plans/0006-t0002-task-aware-recommendations.md` (ignored under existing Git policy): test-first implementation → testing → inline implementation review and requirements check → confirmed fixes/regressions → formatting and final affected verification. This was an inline self-review, not an independent delegated review.

Confirmed and fixed: transitive source aliases; completed-producer/unfinished-consumer protection; failed tests without `isError`; normalized relative/absolute paths against active session cwd; optimistic declared risk versus concrete overlap; visible resource-attribution overflow instead of silently complete independence; unverified completion-claim wording; compiler/lint integration errors. Final review/check found no remaining T0002 blocker.

### Final verification

Environment: Windows, Pi 1.5.0, Node 26.13.0, npm 11.20.0, TypeScript 5.9.3, Biome 2.6.4 and Vitest 4.1.12. Actual terminal testing used Python 3.12.15 with temporary test-only pywinpty 3.1.2.

From `packages/pi-context-aco/`, each passed separately:

- `npm run typecheck` — `tsc --noEmit`.
- `npm run check -- --diagnostic-level=warn` — 19 files, no errors/warnings. Optional informational style suggestions remain; no unsafe blanket rewrite.
- `npm test` — **62 tests / 4 files**.
- `npm run smoke` — actual outside-checkout installed tarball and bundled support, Pi RPC/control-provider passivity and original lifecycle/reset checks.
- `npm run smoke:tasks` — actual installed package, E02/E03, real source IDs, command/tool provenance, atomic rejection, tree isolation and persisted resume; no extra decision requests or strategy execution.

From the repository root:

- `PYTHONPATH='C:/Users/Administrator/AppData/Local/Temp/aco-t0001-pydeps' python packages/pi-context-aco/tests/tui-smoke.py` — actual ConPTY settings/persistence, full-prefix Tab, task/recommendation inspection, loaded-only panels, reload and orderly exit.
- `node scripts/package-support.mjs --check` — archive parity.
- `git diff --check` — tracked whitespace; new package sources separately checked by Biome.

### Limits and authorization

No native plan-file parser, verified Git/workspace audit, semantic equivalence engine, recovery store/receipt, executor or worker runtime. Resource attribution is bounded; overflow is explicitly incomplete, not proof of independence. Rules-first inference remains tentative and uncalibrated. Controlled provider/unit/terminal evidence is not real-project accuracy, latency/savings/superiority, manual visual GUI testing, other-version/platform support or a new four-plugin coexistence matrix.

T0003 and later tickets await explicit user selection. Existing uncommitted refinement/T0001 work was preserved; nothing was staged, committed or published.
