# V2 scoped evidence store, checkpoints and recall

**Ticket ID:** T0003
**Source:** [Spec 0007](../../spec/0007-adaptive-context-orchestrator.md) — R05, R06, R12, R14, R16; scenarios E04, E05, E06. [ADR 0006](../../adr/0006-task-aware-context-working-set-and-isolation.md).
**Status:** Todo

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

- [ ] Checkpoints/index/raw evidence preserve task/plan/decision state, latest execution facts, unresolved work and original source-entry references (R05).
- [ ] Requested segments can be recalled within a supplied context budget without loading the entire store.
- [ ] Readback verifies original content, not only a successful write or index/path; injected persistence/verification failures cannot be reported as recoverable offloads (E04).
- [ ] Project/task-session-lineage checks deny another project, unrelated task and unauthorized child even if they know an evidence ID; authorized necessary child recall succeeds (E05).
- [ ] No default remote upload or cross-project sharing is introduced; source/scope provenance survives summaries/checkpoints/recall.
- [ ] Resume/fork/tree navigation follows active branch scope and does not import unrelated decisions; historical replay after a file changes is not presented as current source (E06).
- [ ] Interrupted storage/checkpoint work is distinguishable from complete persistence; restart reconciliation and failure reporting preserve the last usable evidence (R12).
- [ ] Controlled Pi recall/restart checks demonstrate metadata-versus-model-visible behavior. Stage/mode status does not claim that exact pruning is already delivered.

## Out of Scope

Removing/replacing model-visible messages; semantic summaries as substitute originals; cross-project sharing, default remote storage or mandatory storage backend selection.

## Verification contract

Run the affected package's type check, Biome and Vitest separately and record the tested versions. Supply a controlled Pi loading/usage check for this ticket's delivered behavior; mock-only hooks and direct Node entry execution are insufficient. Keep the package README/configuration and permissions accurate as capabilities change. This ticket describes future verification, not checks already performed.
