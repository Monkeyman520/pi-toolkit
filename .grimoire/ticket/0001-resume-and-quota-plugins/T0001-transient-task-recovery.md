# Recover transiently interrupted Pi tasks

**Ticket ID:** T0001
**Source:** [Pi Auto Resume](../../spec/0002-pi-auto-resume.md), A1-A6; network/timeout/throttling slice.
**Status:** In Progress

## Goal

Deliver `pi-auto-resume` as an independently installable plugin that resumes configured transiently interrupted work without reactivating normal completion, deliberate stops, or unrelated sessions.

## Affected Surfaces

- `packages/pi-auto-resume/`: package metadata, TypeScript configuration, extension resources, tests, and README.
- Pi session/error/input/lifecycle integration and provider throttling hints.
- Collection catalog/package-reference wording when the package actually exists.

## Dependencies and Coordination

- **Blocked by:** None.
- **Blocks:** T0002 requires the owning-session recovery and cancellation contract.
- **Independent of:** T0003-T0005; no dependency on quota maintenance.
- Coordinate collection-level documentation edits with T0004.

## Acceptance

- [ ] Determine from applicable official Pi docs and the tested host which evidence distinguishes interruption, explicit abort, normal completion, busy/internal retry, and replacement/shutdown; do not assume every `agent_end` means final idle.
- [ ] With the network/timeout category enabled, a controlled interruption followed by recovery continues the original conversation without manual continue; disabling that category prevents plugin continuation.
- [ ] Configured temporary throttling observes provider-supplied retry timing where available rather than immediately duplicating a known rejected attempt.
- [ ] Normal completion, explicit stop, context-full, and output-length ceiling fixtures never trigger this plugin's recovery.
- [ ] An explicit stop or session replacement while recovery is pending cancels that old recovery; no message reaches a replacement session.
- [ ] Host retry/queued continuation already handling the same work does not produce an extra plugin recovery request.
- [ ] Multiple work sessions retain separate recovery ownership.
- [ ] Metadata/resources/dependencies match ADRs 0001/0002; no undeclared sibling imports, required bundler, or emitted build.
- [ ] The README documents supported causes/configuration, exclusions, compatibility, permissions, and real setup/verification commands; it does not claim T0002 outcomes are already complete.
- [ ] Run separate package TypeScript no-emit, Biome, and meaningful Vitest checks, plus a Pi standalone load/usage check without the quota package. Record actual results and update the catalog truthfully.

## Out of Scope

Subscription-reset waiting and wake-specific recovery (T0002); quota polling/display/activation; automatic continuation after successful completion.
