# Navigate or fork explicitly without stale session ownership

**Ticket ID:** T0005
**Source:** [Spec 0008](../../spec/0008-enhanced-session-tree-explorer.md) (R09; effect/virtual boundaries in R03/R08; R15; E03-E04); sources U1/U2/U3 and repository/host contracts as cited there
**Status:** Todo

## Goal

Enter, f and F perform distinct safe native Navigate, inclusive Fork At and prompt-restoring Fork Before operations after custom UI closes.

## Affected Surfaces

Explorer result/intents, command-handler effect adapter, target/identity/busy validation, cancellation/error reporting, session shutdown/start/withSession cleanup, host integration fixtures.

## Approach

Implement Session Actions behind the established real/virtual target boundary rather than inside TUI reducers. Revalidate after UI closes, serialize mutations and rely on actual host conflict rejection as well as preflight checks. Check installed command-context signatures and replacement lifecycle. Keep pure browsing available without promising that a host command can always open mid-response.

## Dependencies and Coordination

- **Blocked by:** T0001. See the relationship README for concrete producer reasons.
- **Blocks:** Integrated acceptance T0008.
- **Coordination risks:** Can proceed alongside T0002/T0003/T0006 using T0001 intents and Spec configuration fixtures. T0004's search acceptance must return a selection, not reuse Navigate intent; coordinate explicit label mutation and shared lifecycle ownership. T0007 state and T0006 caches subscribe to the same fresh-session boundary.

## Acceptance

- [ ] session.navigate/fork/forkBefore dispatch distinct intents, close custom UI before Session API work, revalidate real target/session identity and never use a virtual summary as a guessed target.
- [ ] Navigate calls public navigateTree with default summarize=false in the same session file; explicit summarization configuration is honored without hidden model cost.
- [ ] User/custom-message Navigate follows the installed host's parent-leaf/editor-restoration semantics; tests do not incorrectly assert selectedId always equals newLeafId.
- [ ] Fork At passes position=at and retains the selected entry in an independent session without restoring editor text. Fork Before passes before only for suitable user messages, omits that prompt and restores it to the editor.
- [ ] Neither fork auto-sends a model request; configured confirmation is honored; original session history remains intact. The label 'Fork After' in the original test list is not implemented as a new API position.
- [ ] Responses, manual/automatic compaction and concurrent navigation conflicts reject safely. No implicit idle wait or concurrent mutation occurs; any optional waiting requires explicit visible consent.
- [ ] Missing entries, invalid targets, busy rejection, host cancellation and exceptions receive honest distinct feedback; cancellation/rejection cannot report successful replacement.
- [ ] Actual host replacement shuts down old resources and uses fresh session context only. Captured old pi/ctx/sessionManager, caches and late tasks cannot write after replacement.
- [ ] Pure browse/close/cancel does not change leaf/session file; real Navigate/Fork tests verify the expected file/leaf/editor outcomes instead of treating mutation as browse.
- [ ] Pass typecheck/Biome/Vitest and actual isolated Pi Navigate/Fork At/Before, cancellation and replacement smoke; exercise busy/compaction rejection with controlled evidence.

## Out of Scope

Host session-format changes, direct session-file rewriting, merging histories, automatic prompt submission, hidden summarize charges and a required queue/wait feature.

## Coordination contract

Consume settled requirements and established solution choices from the Spec. Organize and verify them; do not invent or revise domain facts, requirements, architecture, constraints or acceptance semantics. Return needed new material decisions to refinement/clarification. CONTEXT/ADR recording is separately unauthorized and Pending; it does not block this ticket set. This artifact is not permission to start implementation, QA, staging or committing. Specialists return at the selected Spec -> tickets endpoint.
