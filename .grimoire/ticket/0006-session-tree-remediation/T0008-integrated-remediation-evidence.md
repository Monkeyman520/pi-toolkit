# Integrated remediation evidence and honest documentation

**Ticket ID:** T0008
**Source:** [All seven approved findings and evidence rules](./README.md); [Spec 0008](../../spec/0008-enhanced-session-tree-explorer.md) applicable R01-R15 regression contracts and E01-E07.
**Status:** In Progress

## Goal

Verify that the combined implementation resolves all seven findings in real interaction paths while preserving package/host contracts. Report source revision, actual outcomes and remaining limitations without repeating unsupported full-v1.0 claims.

## Affected surfaces

- tests/e2e-scenarios.test.ts, benchmark.test.ts, workload-generator.ts, pi-smoke.mjs and relevant producer regression tests in packages/pi-session-tree-explorer/.
- Actual isolated package/Pi loading and interactive usage; package README behavior, configuration, performance and compatibility claims.
- This ticket records execution evidence only after separately authorized execution; artifact creation is not a runtime test.

## Approach

Verify the actual assembled plugin, not only helpers or manually injected state. Preserve existing useful unit/host tests; strengthen the missing glue checks and complete-path measurements. Inspect combined diffs and ownership contracts so apparent improvement is not just smaller files or shifted complexity.

## Dependencies and coordination

- **Blocked by:** T0001, T0002, T0003, T0004, T0005, T0006 and T0007; every delivered outcome must be integrated before final acceptance.
- **Blocks:** None.
- **Coordination:** Producer-local tests/checks accompany each ticket. This ticket owns combined evidence and final package documentation, not late ownership of all tests or permission to modify unrelated systems.

## Acceptance

- [ ] Record execution revision/dirty state, original versus new failures, commands and unavailable checks. Run package-local npm run typecheck, npm run check, npm test and npm run smoke separately; an unchanged baseline pass is not proof of a repaired interaction.
- [ ] E01/default-filter tests use actual Actions/input/render to verify node versus branch semantics, hidden targets, virtual summary ancestry, roots and focus. Rendering itself must not change selection/leaf/revision.
- [ ] E02 types full-text queries, including j/k, then cancels/accepts/previews/clears through actual input. Verify query/results/reveals/folds and no unintended Navigate; do not inject final search results or manually invoke an unwired method.
- [ ] Verify all 73 Actions are reachable by effective bindings or the action/help surface and that mode/disabled checks prevent Preview/help session intents. Rebinding, timeouts, mode changes and non-Vim controls cannot duplicate or leak Actions.
- [ ] E03/E04 use actual Pi session APIs/files/editor outcomes for native Navigate and inclusive/before-prompt Fork, busy/canceled/failed cases and fresh replacement ownership. Only explicit safe operations mutate sessions; original fork source history remains intact and no model request is auto-sent.
- [ ] Refresh/label tests use host-owned entries/resolved labels and changed session/leaf evidence. Old labels/documents/metrics/intents cannot survive as current data; failed label/config effects do not claim success or corrupt safe local state.
- [ ] E05 verifies branch-correct metrics, unknown provenance, cache reuse across movement, relevant invalidation and late-work rejection. E06 verifies invalid updates/reload, failed persistence, project-to-global isolation, real setting effects and session-local restart restoration.
- [ ] Benchmark 100/1,000/5,000/20,000-entry workloads plus 10,000-entry first open with varied linear/wide/deep forks, long messages, labels, tools and compactions as applicable to R14/R15. Movement includes input/dispatch/render; search feedback includes query processing/publication/render; first open includes the assembled initial-view path, not index/projection alone.
- [ ] Retain the six R14 P95 targets: 5k index <200 ms, movement <16 ms, branch jump <20 ms, search feedback <100 ms, 10k first open <500 ms and cache hit <5 ms. Record hardware/OS/terminal/Node, dataset bytes/topology and sampling/warmup; publish measured results or explicit deviations under the existing spec, never weakened thresholds.
- [ ] Distinguish isolated Pi RPC loading/commands from real interactive Explorer open/close, labels/search/settings/navigation/fork evidence. Run the specified Windows Terminal, WSL and common Unix keyboard checks where available; missing platform/runtime evidence remains incomplete, not a pass.
- [ ] Inspect the combined tree: one Action authority, owned readonly session metadata, one search lifecycle, projection-owned navigation, valid layer provenance, observable settings and revision-safe nonblocking metrics. Remove obsolete competing private paths/imports/registrations introduced by the migrations.
- [ ] Update the package README to match verified behavior, permissions, setup/check commands, compatibility, configuration and measured performance. Do not claim full v1.0 acceptance from these seven fixes if unrelated spec requirements or required evidence remain outstanding; list those limitations.

## Out of scope

Inventing new requirements to satisfy a completion label, broad unrelated test rewrites, rewriting historical Spec/ticket completion records, adding a new repository-wide CI/infrastructure project, publication or claiming untested platforms. Follow the README's permissions and knowledge boundary.

## Execution evidence (provisional)

150 tests across 29 files and real isolated Pi RPC/native file checks pass. Scoped benchmarks and explicit CPU-contention deviation are recorded; real interactive/editor/platform and assembled latency evidence remain incomplete.

Whole-ticket acceptance is not granted here. See [current combined checkpoint](./README.md#current-checkpoint-u4-implemented-integrated-acceptance-incomplete) for revision, commands, separate Code Risk / Intent Check outcomes, performance scope and remaining runtime gates.

Windows-only follow-up: Steps 1/2 verified real TUI/editor/file outcomes; Step 3 was excluded. Step 4 recorded three confirmed blockers, independent-review startup failure and contention-specific timing misses. See [current evidence](./evidence/windows-2026-11-10/README.md); this ticket remains unaccepted pending its complete criteria.


### Follow-up — 2026-11-13

All three confirmed blockers are addressed. Current evidence is 159 tests / 32 files, Pi 1.5.2 loading/native file smoke, focused Windows TUI and repeated scoped timing reports. Whole-Spec acceptance and excluded-platform evidence remain incomplete. See [latest evidence](./evidence/windows-2026-11-13/README.md) and [results](./evidence/windows-2026-11-13/RESULTS.md). Fresh independent review is pending. This update supersedes the older provisional check counts/blocker state, not the ticket's acceptance criteria; status remains In Progress.


Independent S1001 requested two fixes; the producer reproduced and addressed them, with 177 tests / 33 files passing. Focused re-review S1002 is pending; the new GUI observation attempt is blocked by desktop-tool failure. See [review dispositions](./evidence/windows-2026-11-13/REVIEW.md). No whole-ticket acceptance is inferred.


**Independent review receipt:** S1003 approved the two S1001 fixes and directly related behavior, with no new defects in that focused static scope. [Receipt and remaining runtime boundaries](./evidence/windows-2026-11-13/REVIEW.md). This supersedes prior pending-review notes; it does not accept this ticket's whole criteria. Status remains In Progress.
