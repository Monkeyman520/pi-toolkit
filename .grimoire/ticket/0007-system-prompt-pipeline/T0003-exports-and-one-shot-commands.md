# Export configured local boundary snapshots and reserve exactly one actual agent/request event through a command.

**Ticket ID:** T0003
**Source:** [Spec 0009](../../spec/0009-system-prompt-pipeline.md), R3, R7–R8; E7–E10, E12, E15.
**Status:** Done — acceptance verified; see [execution evidence](./verification.md).

## Goal

Export configured local boundary snapshots and reserve exactly one actual agent/request event through a command.

## Affected Surfaces

Capture ownership/state, prompt-file output, hook observation, command and completions.

## Dependencies and Coordination

T0001 and T0002: requires verified boundaries and supported system-text extraction for both stages. Capture-edge behavior is settled in Spec R7 and the README.

Keep hook, configuration and command ownership coordinated across tickets. Shared files are merge risks, not additional semantic blockers.

## Acceptance

- [ ] Export is off by default; configured selections cover all four plugin-local sampling points.
- [ ] Command selects agent/request and before-only/before+after using the repository command grammar and contextual completions.
- [ ] Arming a reservation causes no extra run or request.
- [ ] Next actual selected-stage event captures the requested side(s) once; later events are not captured by that reservation.
- [ ] Before-only export does not suppress transformations or alter rule matching.
- [ ] Correlated before/after files represent the same event and report actual paths in the user-directory default location.
- [ ] Unknown extraction and write failure never masquerade as successful capture and do not block requests.
- [ ] Repeated commands, failed attempts and lifecycle transitions follow the confirmed reservation contract (E15).
- [ ] Tests cover rule rollback snapshots, one-shot consumption, disabled export, failures, and plugin-local ordering.

## Knowledge and Scope Boundary

Consume only settled requirements and verified sources. Do not invent or revise domain facts, acceptance semantics, architecture or unconfirmed assumptions. Return material gaps to refinement before freezing behavior; authorized task artifacts do not authorize CONTEXT/ADR writes. Previously unprocessed knowledge remains Pending without blocking artifacts unless persistence is expressly required. Return results to the selected workflow; this ticket does not itself authorize implementation, shipping or a separate planning stage.
