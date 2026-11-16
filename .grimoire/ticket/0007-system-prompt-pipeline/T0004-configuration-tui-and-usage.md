# Make the pipeline usable through trusted configuration, interactive settings and documented non-TUI commands.

**Ticket ID:** T0004
**Source:** [Spec 0009](../../spec/0009-system-prompt-pipeline.md), R1, R6–R8; E10–E15.
**Status:** Done — acceptance verified; see [execution evidence](./verification.md).

## Goal

Make the pipeline usable through trusted configuration, interactive settings and documented non-TUI commands.

## Affected Surfaces

Configuration entry/UI, installed-only panel discovery, command completions, package README and catalog references.

## Dependencies and Coordination

T0001 and T0003: requires the actual configuration and capture-command contracts. UI sketching can occur earlier without freezing unspecified semantics.

Keep hook, configuration and command ownership coordinated across tickets. Shared files are merge risks, not additional semantic blockers.

## Acceptance

- [ ] Global and trusted-project configuration semantics and declaring-file path resolution are accurately documented.
- [ ] TUI config entry follows repository conventions and cross-plugin discovery lists only loaded participants.
- [ ] Non-TUI command usage remains functional; multi-token completion returns the complete replacement argument string.
- [ ] Compatibility preset is opt-in and export defaults off.
- [ ] README describes supported host APIs and actual Antigravity request shapes; no all-provider or global-first/last claim.
- [ ] Permissions, non-sandboxed scripts and side effects, prompt-export privacy, incomplete extension observations and fail-open limitations are explicit.
- [ ] Install, checks and smoke instructions use the actual package name/resources rather than an unverified publication identity.

## Knowledge and Scope Boundary

Consume only settled requirements and verified sources. Do not invent or revise domain facts, acceptance semantics, architecture or unconfirmed assumptions. Return material gaps to refinement before freezing behavior; authorized task artifacts do not authorize CONTEXT/ADR writes. Previously unprocessed knowledge remains Pending without blocking artifacts unless persistence is expressly required. Return results to the selected workflow; this ticket does not itself authorize implementation, shipping or a separate planning stage.
