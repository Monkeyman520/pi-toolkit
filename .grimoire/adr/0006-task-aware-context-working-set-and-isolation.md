# Task-aware context working set and isolation

**Status:** Implementing
**Date:** 2026-11-05

## Context

The user proposed an Adaptive Context Orchestrator (ACO) for Pi and accepted the refinement recommendations: describe the complete ACO requirements with staged delivery, begin with observation and recommendations only, permit later automatic exact offloading/pruning only after recovery verification, and isolate memory to a project and the current task's session lineage. The selected refinement endpoint is a requirements specification followed by independently verifiable tickets, not implementation.

Current occupancy alone does not establish whether intervention benefits a task: a nearly completed task can tolerate high occupancy, while upcoming broad exploration can require intervention at low occupancy. A recoverable historical source is also not necessarily an accurate description of the current workspace.

**Authorization clarification (2026-11-05):** The initial recording left the three higher-impact strategies' default authorization unsettled. The user subsequently confirmed confirmation-by-default, optional explicit automation authorization, non-bypassable safety/budget checks, and recommendation-only behavior without authorization in non-interactive modes. This completes the previously open choice rather than reversing an earlier authorization decision.

## Decision

- Treat model-visible context as a task-dependent working set that can be loaded, unloaded, and recovered, distinct from the preserved raw session history. Do not make fixed occupancy watermarks the sole strategy-selection basis; account for the task, content dependencies/value, and projected growth.
- Define the complete ACO requirements while delivering capabilities in stages. V1 observes usage and growth, predicts pressure, identifies task phases, and presents strategy recommendations; it does not automatically rewrite model context or execute the recommended strategies.
- In later stages, automatic exact offloading/pruning is permitted only after recovery has been verified. Semantic replacement, global compaction, and subagent delegation require user confirmation by default. A user may explicitly authorize automatic execution, but authorization never bypasses recovery verification, dependency protection, or budget limits. In non-interactive modes, these actions remain recommendations unless prior explicit authorization applies.
- Scope persistent context by project and the current task's session lineage. Authorized subagents may access necessary evidence in that scope. Do not enable cross-project sharing or remote upload by default.
- Distinguish historical evidence replay from reacquiring current facts. Recovering an earlier source must not silently establish that it still describes the current files or environment.

## Consequences

- Observation-only delivery can establish real measurements without exposing users to unverified automatic context mutation.
- Future execution requires recovery evidence rather than a token-saving estimate alone; unavailable or unverifiable recovery cannot justify automatic removal.
- Memory and recall interfaces must preserve project/task-lineage authorization rather than treating storage location or possession of an evidence ID as sufficient access.
- The package remains subject to [ADR 0001](./0001-independently-installable-pi-packages.md), [ADR 0002](./0002-typescript-esm-plugin-development-stack.md), and the command/UI and independent-lifecycle boundaries in [ADR 0004](./0004-unified-command-grammar-and-dynamic-tui-configuration.md) and [ADR 0005](./0005-versioned-plugin-support-library.md).
- This decision selects neither a storage engine nor a delegation provider, and does not claim implementation or runtime verification. Proposed denotes recorded but unrealized work, not a lack of user approval of the decisions above.

**Implementation progress (2026-11-05):** The final sentence above describes the original recording state. The [T0001 receipt](../ticket/0004-adaptive-context-orchestrator/T0001-v1-context-monitor-and-plugin-control.md#t0001-execution-receipt--2026-11-05) establishes the passive monitoring/control foundation; the [T0002 receipt](../ticket/0004-adaptive-context-orchestrator/T0002-v1-task-context-graph-and-recommendations.md#t0002-execution-receipt--2026-11-05) completes controlled task-aware V1 observation/recommendations with package checks and actual Pi RPC/ConPTY evidence. Status stays Implementing because storage, full semantic safety and all strategy/isolation execution capabilities remain pending; this is not full ADR realization.
