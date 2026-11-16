# Apply the same rules to recognized Antigravity system-instruction payload text without modifying unrelated request data.

**Ticket ID:** T0002
**Source:** [Spec 0009](../../spec/0009-system-prompt-pipeline.md), R2–R5, R8; E4–E6, E9.
**Status:** Done — acceptance verified; see [execution evidence](./verification.md).

## Goal

Apply the same rules to recognized Antigravity system-instruction payload text without modifying unrelated request data.

## Affected Surfaces

Antigravity payload inspection/fixtures, request hook, system-text extraction/write-back and diagnostics.

## Dependencies and Coordination

T0001: uses its verified rule semantics and execution contract. Provider-format investigation can run in parallel without assuming payload paths.

Keep hook, configuration and command ownership coordinated across tickets. Shared files are merge risks, not additional semantic blockers.

## Acceptance

- [ ] Actual provider source or runtime evidence establishes supported Antigravity payload paths/shapes; evidence is recorded without credentials or private prompts.
- [ ] Supported system text is transformed with request-stage conditions and requestPath context.
- [ ] Unrelated fields, non-text parts and user messages are preserved; rules are not applied by recursively walking all strings.
- [ ] Unknown providers/shapes remain unchanged and diagnostically distinguishable from successful extraction.
- [ ] Per-rule failure retains the entering prompt/payload state and does not block the request.
- [ ] Actual Pi request-hook usage and provider-shaped fixture tests distinguish plugin-local output from subsequent handler changes.

## Knowledge and Scope Boundary

Consume only settled requirements and verified sources. Do not invent or revise domain facts, acceptance semantics, architecture or unconfirmed assumptions. Return material gaps to refinement before freezing behavior; authorized task artifacts do not authorize CONTEXT/ADR writes. Previously unprocessed knowledge remains Pending without blocking artifacts unless persistence is expressly required. Return results to the selected workflow; this ticket does not itself authorize implementation, shipping or a separate planning stage.
