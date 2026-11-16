# Independently loadable agent-stage transformations with condition selection, ordered section actions and an opt-in Antigravity compatibility preset.

**Ticket ID:** T0001
**Source:** [Spec 0009](../../spec/0009-system-prompt-pipeline.md), R1–R6, R8; E1–E5, E9, E11, E14, E16.
**Status:** Done — acceptance verified; see [execution evidence](./verification.md).

## Goal

Independently loadable agent-stage transformations with condition selection, ordered section actions and an opt-in Antigravity compatibility preset.

## Affected Surfaces

Package manifest/tooling, rule/configuration contracts, section matching, agent hook, compatibility fixtures and diagnostics.

## Dependencies and Coordination

None within this set. Configuration composition and section-edge behavior are settled in Spec R1/R4 and the README.

Keep hook, configuration and command ownership coordinated across tickets. Shared files are merge risks, not additional semantic blockers.

## Acceptance

- [ ] Package follows the independent-installation and host-peer baseline; no undeclared sibling source imports.
- [ ] Provider/model wildcards, custom-prompt condition and observable extension all/any/none conditions select the expected rules without claiming exhaustive extension detection.
- [ ] All requested targets/aliases and actions work in declared order; tags and unselected text survive.
- [ ] File and synchronous/asynchronous script actions use their declaring configuration directory and the documented context; privileges are explicit.
- [ ] A failed rule rolls back all its text edits, retains previous successful rules and permits subsequent rules and model processing.
- [ ] Explicitly enabled preset changes only the requested intro sentence and docs-index line on matching Antigravity Gemini non-custom prompts.
- [ ] Tests cover each action, conditions, ordering, missing files, invalid regexes, script failures/results, and the confirmed section-edge policy (E16).
- [ ] Global/trusted-project behavior follows the confirmed composition contract (E14) and preserves path origins.

## Knowledge and Scope Boundary

Consume only settled requirements and verified sources. Do not invent or revise domain facts, acceptance semantics, architecture or unconfirmed assumptions. Return material gaps to refinement before freezing behavior; authorized task artifacts do not authorize CONTEXT/ADR writes. Previously unprocessed knowledge remains Pending without blocking artifacts unless persistence is expressly required. Return results to the selected workflow; this ticket does not itself authorize implementation, shipping or a separate planning stage.
