# V4 authorized bounded subagent delegation

**Ticket ID:** T0006
**Source:** [Spec 0007](../../spec/0007-adaptive-context-orchestrator.md) — R03, R05, R06, R10, R11, R12, R14, R15, R16; scenarios E05, E09, E10, E11, E14. [ADR 0006](../../adr/0006-task-aware-context-working-set-and-isolation.md).
**Status:** Done

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

- [x] Parent hands off goal, constraints, acceptance, allowed resources/work and necessary references, not the full conversation; children use independent contexts (R10).
- [x] Results contain deliverables/modified resources, conclusions, evidence, tests and unresolved issues; parent verifies/reconciles them rather than equating return with success.
- [x] Default confirmation, denial, explicit automation and unauthorized non-interactive behavior match R11; no authority bypasses other checks (E09).
- [x] Finite configured depth, concurrency and aggregate parent/child/coordination token limits are enforced, including exhausted-budget/no-launch cases (E11).
- [x] Overlapping writers and tightly coupled tasks are not scheduled as safely independent without resolving the risk; suitable independent tasks can run with bounded scope.
- [x] Authorized children recall only necessary allowed segments; possession of IDs does not bypass project/task-lineage scope (E05).
- [x] Failed/cancelled children remain unfinished/failed, do not cause unlimited replacement tasks, and cannot write stale parent-session state; checkpoints/outcomes reconcile on resume (E10).
- [x] Missing provider capability reports recommendation/local continuation instead of false execution; plugin cleanup affects only owned children/resources (E14).
- [x] A controlled Pi parent/child exercise measures main-agent working-set isolation alongside aggregate token/cost/latency, not parent savings alone.

## Out of Scope

Mandatory delegation of inseparable tasks; a particular third-party backend; default cross-project recall; unrestricted recursive dispatch; implementing native compaction as a prerequisite.

## Verification contract

Run the affected package's type check, Biome and Vitest separately and record the tested versions. Supply a controlled Pi loading/usage check for this ticket's delivered behavior; mock-only hooks and direct Node entry execution are insufficient. Keep the package README/configuration and permissions accurate as capabilities change. This ticket describes future verification, not checks already performed.

## T0006 execution receipt

**Outcome:** Done for the documented conservative V4 provider: single-request independent text children, staged deliverables and explicit parent reconciliation. Spec 0007 remains In Progress; ADR 0006 remains Implementing; T0007/T0008 remain Todo. No commit, push, publication, host fork, raw production JSONL rewrite or general multi-turn coding-agent provider is included.

**Route:** plan → implement/test → inline review + acceptance check → in-scope fixes → integrated verification → formatting → refreshed affected checks → report. Planning was useful for authority, provider selection, durable budget ownership and stale-session handling. Saved approach: `.grimoire/plans/0010-t0006-bounded-delegation.md` (ignored by the repository's existing plans policy). No delegation to development agents or human checkpoint was added.

### Delivered contract and acceptance evidence

| Criterion | Delivered behavior / evidence |
| --- | --- |
| Minimal independent contexts | Native Pi `modelRegistry.streamSimple`, one request per explicit contract; no parent transcript/tools/resource discovery. Installed-package RPC and actual ConPTY capture child provider-bound contexts. |
| Structured return, parent verification | Conclusions, staged deliverables, evidence, tests, unresolved issues; return is needs-verification, never success. Parent independently applies/reviews with ordinary tools; reconciliation re-verifies evidence and real current bytes, requires parent verification evidence, leaves completion declarations separate. Task report links child/parent/checkpoints. Unit malformed/out-of-scope/unresolved/corrupt evidence/current-byte checks plus Pi usage. |
| R11 authority | Separate delegate mode and operation-specific, runtime/branch/project/session/active-parent/child-ID/aggregate-bound grants; TUI confirmation/denial, RPC unauthorized recommendation/no UI wait and explicit automation exercised. V3 grants do not authorize V4; declarations/config/model/revoke invalidate V4 authority. |
| Finite limits | Depth 0–1 (no recursion), concurrency 1–8 (default 2), one scheduler batch, finite aggregate admission and output limits. Charges parent assistant/summary/auxiliary/nested-tool reported usage plus nonrefundable intent reservations and coordination bounds. Unknown required parent usage, orphan/unsafe child accounting and exhausted limits refuse further launches. Unit budgets/unknown/overrun/partial-intent tests; actual exhausted Pi no-launch and reservation restart assertions. |
| Independence and resources | Explicit delegatable/zero-risk task declarations, completed prerequisites/no unfinished consumers, graph conflict checks; exact declared writer resources; canonical existing project text files; per-batch read/write and write/write overlaps refused. No child writes reach the workspace. Unit overlap/unknown-independence tests and actual two-child independent Pi batch. |
| Necessary scoped evidence | Runtime-minted child segment grants with empty child receipt authority; only selected bounded segments enter the child. Actual allowed source without unrelated parent secret; foreign-ID refusal and inherited real-filesystem task/project/lineage/grant tests. Historical/current distinction retained. |
| Failure/cancellation/resume | No retry/replacement loop, one retained attempt per child ID, all reservations persisted before launch. Owned abort controllers/local deadline; generation/task/branch/model/config/signal checks suppress stale completion appends. Interrupted/cancelled/failed remain unfinished; resume reconstructs outcomes and reservations without restoring grants. Unit cancellation (including noncooperative provider), stale writes, malformed results and partial persistence plus actual persistent Pi restart. |
| Capability/ownership | Missing model/registry capability recommends local work, never false execution. Only owned controllers/state are reset; no foreign child/process/global resource cleanup. Missing-provider unit case, lifecycle regressions and source ownership review. |
| Combined measurement | Installed-Pi fixture observes main working set unchanged at 5 messages / 11016 serialized bytes; children receive 2653/2835 context bytes. Provider-reported parent 2020 + children 600 = 2620 aggregate tokens, with 41636 retained child/coordination admission units. Fixture parent/child/aggregate cost and cache counters are measured zero. Last controlled combined child/reconciliation latency ~215 ms; child callbacks ~2.84/4.08 ms. No representative-model quality, calibrated forecasting or superiority claim. |

### Verification receipt

Working directory: `packages/pi-context-aco`.

- Windows; Pi **1.5.0**, Node **26.13.0**, npm **11.20.0**; TypeScript **5.9.3**, Biome **2.6.4**, Vitest **4.1.12**, TypeBox **1.3.27**.
- `npm run typecheck` — pass, no emit.
- `npm run check -- --max-diagnostics=0` — pass; informational suggestions remain, no errors/warnings.
- `npm test` — **131 tests / 13 files passed** (16 new delegation cases plus one V4 config/command case).
- `npm run smoke`, `smoke:tasks`, `smoke:evidence`, `smoke:prune`, `smoke:compact`, `smoke:delegate` — all pass with actual isolated installed plugin tarballs and deterministic providers, not direct Node entry execution.
- Actual ConPTY: `tests/delegation-tui-smoke.py`, existing `tests/compaction-tui-smoke.py` and `tests/tui-smoke.py` — pass with the pre-existing isolated Python **3.12.15** / `pywinpty==3.1.2` environment at `C:/Users/Administrator/AppData/Local/Temp/pi-aco-v3-python/Scripts/python.exe`.
- `git diff --check` — pass. Review included complete modified surfaces, new contracts/executor/tests, existing task graph/evidence/lifecycle/permission callers and source acceptance; no confirmed blocking findings remain after fixes.

Review caught and fixed (with regressions): later dispatch after unknown/overrun accounting, parent summary/auxiliary/nested-tool token omissions, and new settings displacing established terminal keyboard positions. Initial formatter failures were corrected; the original settings ConPTY test now passes unchanged. Last production edits refreshed typecheck/full Vitest/Biome and affected V4 Pi/ConPTY evidence; unaffected V1–V3 runtime evidence was reused after the accounting-only edit.

### Capability and measurement limits

This provider deliberately supports independent single-request text analysis/proposals, not shell execution, arbitrary tools, recursive sessions, new-file creation or automatic application of child writes. Acceptance is explicit parent attestation plus mechanical evidence/byte checks, not a claim that arbitrary natural-language acceptance can be proven automatically. Necessary evidence is prefetched through child grants (8192-byte envelope per reference); truncated historical segments retain continuation metadata.

Admission units conservatively count text bytes/output bounds/framing/coordination, not an exact tokenizer. Provider output caps and cancellation are contractual, not an OS spending sandbox; unknown/overrun behavior blocks subsequent ACO dispatch but cannot undo incurred provider charges. Unreported hidden third-party model calls and unrelated future parent calls cannot be metered/capped by ACO. Reservations survive only as long as the host's session data (persistent Pi sessions were tested). General provider quality/performance and T0007/T0008's broader comparative/integration matrix remain outside this receipt.
