# Interactive Native Summaries & Enhanced Search

**Ticket ID:** T0005
**Source:** [Spec 0008 (v2.0)](../../spec/0008-enhanced-session-tree-explorer.md) §§R06, R07, R09
**Status:** Done

## Goal

Bring full feature parity with native Pi `/tree` branch summarization choices (No summary, Summarize, Custom prompt) while preserving safe navigation, and enhance search to highlight matching text across all message content and tool arguments.

## Affected Surfaces

- `packages/pi-session-tree-explorer/extensions/session-effects.ts`: Support interactive summarization dialog before dispatching `ctx.navigateTree(targetId, { summarize, customInstructions })`.
- `packages/pi-session-tree-explorer/extensions/search.ts` & `search-state.ts`: Match across tool parameters, results, and full message bodies; auto-reveal ancestor paths.
- `packages/pi-session-tree-explorer/extensions/tui.ts`: Connect summarization choice prompt and search reveal rendering.
- `packages/pi-session-tree-explorer/tests/summarization-and-search.test.ts`: Vitest unit tests for summary option propagation and search match paths.

## Approach

1. When navigating across branches (`sourceBranch !== targetBranch`):
   - If configured to prompt for summary, open a lightweight TUI selection modal:
     - 1: No summary (fast switch)
     - 2: Summarize (native Pi branch summary)
     - 3: Custom prompt (input field for custom summary instructions)
   - Disclose the source branch, target branch, and summarized turn range.
2. Dispatch native `ctx.navigateTree` with selected options.
3. Enhance `search.ts` document indexing to include tool invocation argument names, files, and outputs.
4. When a search result is accepted with `Enter`, temporarily expand its ancestor path in the Outline so the node is highlighted and visible.

## Dependencies and Coordination

- **Blocked by:** T0001 (Navigation effects pipeline).
- **Blocks:** T0008 (Verification).
- **Coordination risks:** Avoid blocking the custom TUI lifecycle during summarization prompts.

## Acceptance

- [x] Navigating between branches offers options: No summary, Summarize, Custom prompt.
- [x] Custom summary prompt passes instructions accurately to `ctx.navigateTree`.
- [x] Search query matches find tool call names, arguments, and full message text.
- [x] Selecting a search result expands its ancestor chain and highlights the matching node.
- [x] Automated tests in `tests/summarization-and-search.test.ts` pass.

## Out of Scope

- Implementing an external LLM summarizer (strictly delegates to Pi native `ctx.navigateTree`).
