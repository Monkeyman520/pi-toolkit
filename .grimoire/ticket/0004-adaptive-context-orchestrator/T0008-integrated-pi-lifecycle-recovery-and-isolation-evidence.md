# Integrated Pi lifecycle, recovery and isolation evidence

**Ticket ID:** T0008
**Source:** [Spec 0007](../../spec/0007-adaptive-context-orchestrator.md) — R01, R05, R06, R08, R09, R10, R11, R12, R13, R14, R15, R16; scenarios E01, E04, E05, E06, E07, E08, E09, E10, E11, E12, E13, E14. [ADR 0006](../../adr/0006-task-aware-context-working-set-and-isolation.md).
**Status:** Done — final R01–R16/E01–E14 integration coverage and proxied Pi gates verified

## Goal

Establish actual Pi-host evidence for the complete ACO contract across request projection, persistence, branching, authorization, extension composition and failure recovery.

## Affected Surfaces

Integrated Pi/RPC/terminal fixtures and evidence, packaged dependency delivery, lifecycle/fault-injection scenarios, compatibility and permission documentation. Fixes discovered here remain within the source contract; new semantic requirements return to refinement.

## Approach

This is independent integration-risk verification, not a replacement for each ticket's package tests and runtime smoke checks. Exercise the whole strategy set through real host boundaries, including multiple extension orderings, non-interactive authorization, TUI controls and restart/branch recovery.

## Dependencies and Coordination

- **Blocked by:** T0007 supplies the integrated available-strategy orchestration and evaluation outputs; earlier producers supply their own local evidence.
- **Blocks:** None.
- **Coordination risks:** Use controlled sessions and declared dependencies outside the checkout; avoid touching user sessions or implying external publication/live-provider coverage that was not performed. Preserve exact reproduction/version/evidence references in the package documentation.

## Acceptance

- [x] Package-local type check, Biome and Vitest pass separately; actual outside-checkout Pi loading resolves declared dependencies and activates no sibling plugin (E01).
- [x] Real terminal interaction verifies TUI settings/status, complete-prefix argument completion and loaded-only discovery; non-TUI behavior remains truthful and non-blocking.
- [x] Provider-bound requests and persisted sessions prove V1 passivity, valid tool/system structure, exact durable omissions/local replacements, preserved originals and native-compaction completion/failure (E01, E07, E08).
- [x] Fault-injected store/readback failure, partial append, cancellation/reload/session replacement and restart demonstrate no unsupported success, blind duplicate commit or stale-session write; verified restoration is exercised (E04, E10).
- [x] Resume/fork/tree changes honor active task/branch state; changed-file historical replay is not confused with current facts (E06).
- [x] Cross-project/unrelated-task/unauthorized-child recall is denied, while necessary authorized child evidence remains available (E05).
- [x] Every higher-impact action covers confirmation, denial, explicit automation, non-interactive missing authority and non-bypassable safety/budget checks (E09).
- [x] Parent/child bounds, overlapping-write denial, failed-child handling and aggregate-cost evidence are exercised with an actual supported delegation capability (E11).
- [x] Co-loaded context/boundary transformations preserve prior/later proposals and legal messages; parallel/blocked tools, retries and settled state behave correctly (E12).
- [x] Missing capabilities fail safely; reload/shutdown close only ACO-owned resources, leaving another loaded plugin functional (E14).
- [x] The README distinguishes verified versions/commands, controlled fixtures, comparative measurements and unperformed real-service/platform work. Metrics are not invented where unavailable (E13).
- [x] A final R01–R16/E01–E14 coverage receipt links actual evidence and any limitations; document inspection alone is not labeled runtime verification.

## Out of Scope

External publication/credential setup, unrelated plugin refactoring, new host APIs, fabricated benchmark success, or silently weakening requirements to pass a test.

## Verification contract

Run the affected package's type check, Biome and Vitest separately and record the tested versions. Supply a controlled Pi loading/usage check for this ticket's delivered behavior; mock-only hooks and direct Node entry execution are insufficient. Keep the package README/configuration and permissions accurate as capabilities change. This ticket describes future verification, not checks already performed.

## T0008 execution receipt

The explicit user invocation authorizes this ticket's independent implementation/QA work. [Plan 0012](../../plans/0012-t0008-integrated-host-evidence.md) records the approach. The [integrated verification receipt](./T0008-verification.md) maps every R01–R16/E01–E14, commands/versions, actual Pi/terminal assertions, unit-only evidence and remaining gaps. New controlled peer fixtures verify real context/boundary composition in both load orderings and listener ownership through reload/shutdown. That initial independent slice needed no production/dependency changes; the subsequent continuation's two production fixes are recorded below and in the current receipt.

The subsequent continuation supplied the remaining controlled host fault, delegation, retry and unavailable-provider evidence and fixed two reproduced safety defects. Final local checks passed: 145 tests, nine Pi/RPC smokes and three actual ConPTY tests. The coverage receipt retains current evidence and limits. **Waiting for user:** T0007 real-model execution needs model/data/budget decisions; its evaluation and final T0008 acceptance remain open. No commit or publication was performed.


## Final acceptance

T0007 is complete with its original negative samples and limitations retained. The [final coverage receipt](./T0008-verification.md#final-integrated-verification-and-coverage-closure) maps R01–R16/E01–E14 to actual evidence and the [final comparative evaluation](./T0007-final-evaluation.md). Current gates: typecheck, Biome (74 files), 180 tests/21 files, nine outside-checkout Pi/RPC smokes, three actual ConPTY scripts and identity-separation checks. All 13 runtime commands ran serially with the explicitly approved process-local proxy; actual Pi-to-127.0.0.1:7890 socket evidence is retained. Prior failures were not overwritten. Earlier waiting-for-permission statements are historical; no model/data/budget decision remains outstanding. No commit, push or publication occurred.
