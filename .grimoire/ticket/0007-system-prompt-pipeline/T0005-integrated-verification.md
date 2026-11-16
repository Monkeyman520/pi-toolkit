# Provide isolated Pi loading and integrated transformation/capture evidence without overstating live compatibility.

**Ticket ID:** T0005
**Source:** [Spec 0009](../../spec/0009-system-prompt-pipeline.md), R1–R8; E1–E16.
**Status:** Done — acceptance verified; see [execution evidence](./verification.md).

## Goal

Provide isolated Pi loading and integrated transformation/capture evidence without overstating live compatibility.

## Affected Surfaces

Package checks, Pi integration fixtures, isolated installation evidence, TUI/non-TUI usage and verification notes.

## Dependencies and Coordination

T0001–T0004: acceptance exercises their combined behavior.

Keep hook, configuration and command ownership coordinated across tickets. Shared files are merge risks, not additional semantic blockers.

## Acceptance

- [ ] Package-local tsc --noEmit, Biome and Vitest pass with recorded commands/results.
- [ ] Actual Pi loading/usage outside incidental repository dependencies activates this plugin without sibling plugins.
- [ ] All E1–E16 outcomes map to evidence; deterministic fixtures are labeled as fixtures rather than live-provider tests.
- [ ] Real command arming performs no provider request; subsequent actual hook events exhibit before-only and before+after one-shot semantics.
- [ ] Ordered peer-extension fixtures prove snapshots describe this plugin's boundary only.
- [ ] TUI entry/completion, non-TUI commands, reload/lifecycle and failure handling match the confirmed contracts.
- [ ] Any real Antigravity provider-path evidence is separately labeled; unavailable credentials/live tests remain explicit limitations rather than fabricated success.
- [ ] No prototype deletion, unrelated working-tree modifications, external publication or security-gateway claim is introduced.

## Knowledge and Scope Boundary

Consume only settled requirements and verified sources. Do not invent or revise domain facts, acceptance semantics, architecture or unconfirmed assumptions. Return material gaps to refinement before freezing behavior; authorized task artifacts do not authorize CONTEXT/ADR writes. Previously unprocessed knowledge remains Pending without blocking artifacts unless persistence is expressly required. Return results to the selected workflow; this ticket does not itself authorize implementation, shipping or a separate planning stage.
