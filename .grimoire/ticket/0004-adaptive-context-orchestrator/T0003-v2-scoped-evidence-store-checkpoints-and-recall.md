# V2 scoped evidence store, checkpoints and recall

**Ticket ID:** T0003
**Source:** [Spec 0007](../../spec/0007-adaptive-context-orchestrator.md) — R05, R06, R12, R14, R16; scenarios E04, E05, E06. [ADR 0006](../../adr/0006-task-aware-context-working-set-and-isolation.md).
**Status:** Done

## Goal

Make task evidence and continuity state verifiably recoverable through scoped segment recall before any consumer unloads them.

## Affected Surfaces

ACO persistent evidence/index/checkpoint records, source mappings and storage verification, recall interface/tool, project/task-lineage access controls and resume/branch reconstruction.

## Approach

Implement the three-tier working-set/index/raw-evidence contract without prescribing files versus SQLite. Keep metadata distinct from model-visible recall. Store original content with source/task/branch provenance, verify retrieval, and distinguish historical evidence from reacquiring current files. This ticket supplies recovery; it does not itself prune.

## Dependencies and Coordination

- **Blocked by:** T0001 supplies the installed plugin lifecycle/configuration boundary for storage ownership and runtime recall.
- **Blocks:** T0004 needs verified evidence before unloading; T0006 needs authorized segment recall and continuity checkpoints for children.
- **Coordination risks:** Can proceed alongside T0002 using explicit task/scope/source fixtures from the agreed spec. Align IDs and checkpoints; storage does not need semantic inference to demonstrate authorized recall.

## Acceptance

- [x] Checkpoints/index/raw evidence preserve task/plan/decision state, latest execution facts, unresolved work and original source-entry references (R05).
- [x] Requested segments can be recalled within a supplied context budget without loading the entire store.
- [x] Readback verifies original content, not only a successful write or index/path; injected persistence/verification failures cannot be reported as recoverable offloads (E04).
- [x] Project/task-session-lineage checks deny another project, unrelated task and unauthorized child even if they know an evidence ID; authorized necessary child recall succeeds (E05).
- [x] No default remote upload or cross-project sharing is introduced; source/scope provenance survives summaries/checkpoints/recall.
- [x] Resume/fork/tree navigation follows active branch scope and does not import unrelated decisions; historical replay after a file changes is not presented as current source (E06).
- [x] Interrupted storage/checkpoint work is distinguishable from complete persistence; restart reconciliation and failure reporting preserve the last usable evidence (R12).
- [x] Controlled Pi recall/restart checks demonstrate metadata-versus-model-visible behavior. Stage/mode status does not claim that exact pruning is already delivered.

## Out of Scope

Removing/replacing model-visible messages; semantic summaries as substitute originals; cross-project sharing, default remote storage or mandatory storage backend selection.

## Verification contract

Run the affected package's type check, Biome and Vitest separately and record the tested versions. Supply a controlled Pi loading/usage check for this ticket's delivered behavior; mock-only hooks and direct Node entry execution are insufficient. Keep the package README/configuration and permissions accurate as capabilities change. The execution receipt below records actual checks; the verification contract itself is not runtime evidence.

## T0003 execution receipt — 2026-11-05

**Outcome:** Done for T0003's recovery foundation, not full V2 pruning. Spec 0007 remains In Progress; ADR 0006 remains Implementing. T0004–T0008, commits, publishing, host changes and strategy execution remain outside this invocation.

**Delivery:** `packages/pi-context-aco/extensions/evidence.ts` owns immutable local originals, manifest integrity, selective budgeted recall and host-only necessary-child grants. `extensions/continuity.ts` owns checkpoint capture, active task/branch intent/receipt authority, source mappings, cancellation and reconciliation. The existing adapter exposes `/aco checkpoint <JSON>`, `/aco evidence`, `/aco recall <JSON>` and `aco_recall`. Checkpoints are explicit; no archive is created merely by sampling. Package/collection READMEs and capability/help text reflect the delivered boundary.

### Acceptance evidence

| Criterion | Evidence |
| --- | --- |
| C1 — continuity and originals | Real-filesystem tests preserve active task/plan/decision/reference state, caller-declared unresolved work, latest failed test/resource facts, source IDs and structured error originals. Snapshot analysis limitations stay explicit. Source segments serialize the original host entry objects; paths/summaries are not substitutes. |
| C2 — selective budgeted recall | Tests instrument file reads: a selected source plus manifest is read, not another segment or the full archive. Whole JSON output fits the supplied UTF-8 byte budget (512–32768), including provenance/escaping; Unicode pagination reconstructs exact text. Bytes are not claimed to be exact tokens. |
| C3 — verification/failures, E04 storage portion | Original byte equality plus SHA-256 readback precedes a receipt. Injected writes, reads, wrong readback, rename and commit-append failures never report successful recovery. Actual installed Pi encounters an unwritable storage root; no usable checkpoint is claimed and the original remains model-visible. No unloading implementation exists here. |
| C4 — scope/child seam, E05 | Active-branch matching intents/receipts, canonical project and active task determine authority. Unit/filesystem tests deny cross-project/task, missing-branch receipts, guessed/traversal IDs, ungranted/forged/wrong-session child capabilities and non-necessary segments; explicitly granted necessary child recall succeeds. Actual Pi denies unrelated task and another project/session. This is the host-only child policy seam, not live worker dispatch or authenticated provider integration (T0006). |
| C5 — local provenance | No remote/network integration or new runtime dependency. Scope/source IDs survive structured continuity and recall envelopes; origin session survives actual clone. Archive/privacy/retention/OS privilege limits are documented. |
| C6 — branch/history, E06 recovery portion | Actual Pi tree navigation excludes abandoned receipts; clone inherits only its copied path, not newer corrupt evidence. Resume re-verifies persisted records. Actual built-in file-read output is archived, the workspace file changes, and recall still returns the old output explicitly historical/current-source-unverified. Current facts use ordinary file/environment reacquisition, not a freshness claim. |
| C7 — interrupted work/restart | Intent-only records are incomplete, corrupt originals invalidate newer commits, orphan commits do not authorize recall, stale/cancelled writes cannot append a receipt, and superseded reconciliation cannot claim old-branch usability. Actual process restart reports incomplete/corrupt attempts and retains the older usable checkpoint. Partial files are not adopted/retried/deleted. |
| C8 — host visibility/status | Actual provider-bound requests omit checkpoint metadata/continuity until an explicit `aco_recall` tool result. Command recall is UI-only. Status identifies T0003 as the V2 recovery foundation and says exact pruning/compaction/delegation are unavailable. Existing actual Pi passivity and task smokes remain passing. |

### Route, review and limits

Used persisted plan `.grimoire/plans/0007-t0003-scoped-evidence-and-recall.md` (ignored by existing Git policy): plan → test-first implementation → tests → inline code-risk review and acceptance check → affected fixes → integrated verification → targeted formatting and refreshed checks. No delegation or human checkpoint was requested. Reviews were inline self-review, not an independent review.

Confirmed and fixed during checks: malformed test-provider content parsing/RPC notification field assumptions, orphan commit authorization, persistent-session prerequisite, stale session/tree completions and superseded reconciliation, surrogate-safe response budgeting and integration typing/formatting. Final review/check found no remaining T0003 blocker. The `npx biome` launcher was unavailable in this environment; the installed package-local Biome executable performed targeted safe formatting instead. No unsafe bulk lint fixes were applied.

Filesystem storage was chosen within the ticket's backend-neutral contract. Recall uses an explicit **byte** allowance rather than inventing a calibrated tokenizer; callers own model-budget conversion. Checkpoint content/manifest limits and latest-64 reconciliation coverage are disclosed. No fsync/power-loss or cross-file transaction guarantee, automatic expiry/encryption, live child backend, exact pruning, semantic equivalence, semantic compaction or performance/savings superiority is claimed. Other privileged tools/extensions/local filesystem users are outside the policy isolation boundary.

### Final verification

Windows; Pi **1.5.0**, Node **26.13.0**, npm **11.20.0**, TypeScript **5.9.3**, Biome **2.6.4**, Vitest **4.1.12**.

From `packages/pi-context-aco/`, separately executed and passing after the final code/format changes:

- `npm run typecheck` — `tsc --noEmit`.
- `npm run check -- --diagnostic-level=warn` — 25 files; no errors/warnings. Optional informational style suggestions remain.
- `npm test` — **80 tests / 6 files** (62 pre-change baseline tests also passed before implementation).
- `npm run smoke` — isolated installed tarball/support dependency, unchanged provider-bound conversation/tool bodies except declared ACO schemas, no extra model calls, existing lifecycle/configuration controls.
- `npm run smoke:tasks` — installed Pi V1 E02/E03, protected references, declaration provenance, branch/resume isolation.
- `npm run smoke:evidence` — installed Pi storage failures, metadata versus explicit model-visible recall, original built-in-read history after file changes, corruption/restart fallback, task/project/tree/clone isolation, disabled operations and no pruning.

From the root: `node scripts/package-support.mjs --check` (archive parity) and `git diff --check` passed. No new manual GUI/ConPTY session, live provider, live dispatched child, other platform/version or full integrated T0008 coexistence evidence is claimed. Only documentation/status records changed after behavioral verification; their content was read back.
