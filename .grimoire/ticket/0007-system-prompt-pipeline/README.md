# System Prompt Pipeline Ticket Set

**Source:** [Spec 0009](../../spec/0009-system-prompt-pipeline.md), the prototypes linked there, and its confirmed conversation contract.
**Status:** Done — implementation and selected verification complete; see [execution evidence](./verification.md).
**Selected endpoint:** Spec → tickets only. No code execution or CONTEXT/ADR changes.

## Overview

Generalize the prompt compatibility/dump prototypes into ordered conditional agent/request transformations, an opt-in Antigravity preset, private local exports and command-triggered one-shot before-only or paired capture. Request support initially covers Antigravity only. All before/after guarantees are plugin-local.

## Confirmed Edge Contracts

The user explicitly accepted these edge contracts during final clarification:

1. **Configuration composition:** global rules first, then project; same-ID project rules override global counterparts and new project rules append. Preserve declaring-file path origins.
2. **Capture reservation edges:** new command replaces the pending reservation; the next actual selected-stage event consumes it even on unsupported extraction/write failure, with no automatic retry. Session changes/reload clear it. No extra model request is started and transformations are unaffected.
3. **Section edges:** process all matching top-level occurrences; nested content belongs to its outer section without recursive matching; absent targets skip; malformed structure rolls back the rule.

No blocking requirements questions remain. New material decisions return to clarification rather than being invented downstream. Unknown provider payload paths remain a factual investigation, not permission to invent adapters. CONTEXT/ADR recording remains Pending due to absent authorization; this does not block artifact completion.

## Delivery Surfaces

Independent package/tooling and host hooks; rule and trusted-configuration contracts; Antigravity payload adapter; script/file actions; capture files/state; commands/completion; TUI settings/discovery; documentation and Pi evidence.

## Dependencies

| Producer | Consumer | Reason |
| --- | --- | --- |
| T0001 | T0002 | Request processing consumes the verified rule semantics. |
| T0001, T0002 | T0003 | Export requires both actual boundaries and supported extraction. |
| T0001, T0003 | T0004 | User-facing settings/commands must describe actual configuration and capture contracts. |
| T0001–T0004 | T0005 | Integrated acceptance needs the completed user-visible feature. |

## Coordination and Recommended Order

Recommended order: T0001 → T0002 → T0003 → T0004 → T0005. Provider-format fact gathering may proceed alongside T0001; presentation work may be sketched before its dependencies complete, within the settled contracts. Hook/configuration/command files need coordinated ownership; a shared file alone is not a dependency. This graph is acyclic.

## Coverage and Ticket Index

| Ticket | File | Outcome / coverage |
| --- | --- | --- |
| T0001 | [T0001-agent-rules-and-compatibility.md](./T0001-agent-rules-and-compatibility.md) | R1–R6, R8; E1–E5, E9, E11, E14, E16 |
| T0002 | [T0002-antigravity-request-adapter.md](./T0002-antigravity-request-adapter.md) | R2–R5, R8; E4–E6, E9 |
| T0003 | [T0003-exports-and-one-shot-commands.md](./T0003-exports-and-one-shot-commands.md) | R3, R7–R8; E7–E10, E12, E15 |
| T0004 | [T0004-configuration-tui-and-usage.md](./T0004-configuration-tui-and-usage.md) | R1, R6–R8; E10–E15 |
| T0005 | [T0005-integrated-verification.md](./T0005-integrated-verification.md) | R1–R8; E1–E16 |

All eight requirement groups and E1–E16 are covered by the set. Each ticket inherits the spec's source-traceability, permission and no-downstream-invention constraints. Requirements coverage, links and acyclic dependencies are checked. These artifacts are not runtime evidence or authorization to start implementation.

## Execution Handoff

The artifact-only endpoint above describes refinement history. The user's subsequent explicit `grimoire-loop` invocation authorized implementation and quality checks. All five tickets are now Done for the bounded scope. [Verification and joint assessment](./verification.md) records the 27 passing tests, frozen setup, Pi RPC/ConPTY evidence, resolved findings, criterion mapping and exclusions. CONTEXT/ADR recording and publication were not authorized or performed. The original acceptance checklists are retained as source criteria; verified outcomes are mapped in that record.
