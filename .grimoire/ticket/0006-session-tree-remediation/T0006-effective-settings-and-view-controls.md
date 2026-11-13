# Effective settings and observable view controls

**Ticket ID:** T0006
**Source:** [Approved F6](./README.md#finding-evidence); [Spec 0008](../../spec/0008-enhanced-session-tree-explorer.md) R01/R04-R14 as applicable, especially R11-R13.
**Status:** In Progress

## Goal

Configuration accepted through /stree and its settings panel reaches the real feature owners. View controls affect rendered output, reload applies safe effective settings, and restart restores only valid session-local view preferences.

## Affected surfaces

- Plugin assembly in index.ts; ui.ts, commands.ts, config-schema.ts and config.ts application callers.
- Runtime option/state boundaries in actions.ts, navigation.ts, display.ts, search.ts, context-metrics.ts and tui.ts; state.ts/types.ts and view-state.ts restoration.
- Settings-to-behavior, responsive-view, persistence/restart and command integration tests; package README configuration documentation.

## Approach

Apply explicit configuration slices to the existing feature owners rather than passing a universal context object or reimplementing their behavior. T0001/T0003/T0004/T0007 own domain mechanisms and fixture-level settings support; this ticket owns plugin-entry-point wiring, safe reapplication, view controls and session view-state integration.

## Dependencies and coordination

- **Blocked by:** T0001, T0003, T0004, T0005 and T0007. The final settings-to-behavior tests require their real input/search/projection/configuration/metrics behavior, not substitute stubs.
- **Blocks:** T0008; combined acceptance needs the real assembled Explorer.
- **Coordination:** Agree per-feature option contracts before migrations; serialize index.ts/tui.ts integration. T0002 supplies the snapshot/model/usage data consumed through T0003/T0007.

## Acceptance

- [ ] Provide a source-traced settings-to-consumer matrix for the existing schema groups: vimMode/keybindings, navigation, display, fold, search, context, session and performance. Accepted fields are not silently dropped or replaced with hardcoded options; do not add new product settings.
- [ ] Opening /stree actually uses effective search mode/scope/case/result/debounce settings, navigation/focus/fold defaults, metrics/cache/display settings and viewport/overscan behavior. Tests exercise command/configuration -> component input -> outcome, not only configuration serialization.
- [ ] Supply actual host active-model and getContextUsage evidence through the snapshot/metrics boundary. The active row uses available host usage, including null/unknown provenance; historical rows do not silently inherit today's incompatible model window.
- [ ] d hides/shows the details region; c hides/shows context columns; depth/layout controls change output according to R11, not just state fields. Width breakpoints, model visibility and compound markers honor effective options.
- [ ] view.reloadConfig invokes real safe reload and reapplies valid settings; invalid reload leaves the prior safe runtime behavior and reports failure. Resets restore the appropriate effective defaults without resetting unrelated state or persisting temporary search state.
- [ ] The Explorer links to the existing settings panel; installed-only discovery, argument completion and non-TUI text behavior remain correct. Settings changes and effective help/bindings agree after application.
- [ ] Session-specific view persistence restores allowed filters/focus/manual folds/layout/depth and display preferences while respecting R12/R13; recompute derived focus paths, ignore stale/invalid IDs or values, and never restore old query/results/reveals/jobs.
- [ ] Session options preserve R09/U4: fixed position-specific Actions, summarize=false by default (explicit configuration opt-in retains native summarization cost), fork confirmation and default busy rejection. Opt-in wait requires explicit confirmation and visible waiting after UI close, then session/target/safety revalidation; no general mutation queue or hidden wait is introduced.
- [ ] Tests use different effective settings and restart/reload sequences to verify observable differences. If a field needs semantics not settled by the specification, return that material gap to refinement instead of inventing behavior or accepting a silent no-op.

## Out of scope

A new schema/settings product, global runtime context, native /tree integration, a separately activated manager, general mutation queues beyond the approved post-UI wait, or overwriting global settings with view state. Follow the README's permissions and knowledge boundary; U4 authorizes the settled Spec 0008 amendment.

## Execution evidence (provisional)

Approved U4 domains, expansion and confirmed waiting are implemented. Package README contains the actual feature-owner matrix; settings/view/input/plugin/contracts/transaction tests cover effects and unchanged-choice preservation.

Whole-ticket acceptance is not granted here. See [current combined checkpoint](./README.md#current-checkpoint-u4-implemented-integrated-acceptance-incomplete) for revision, commands, separate Code Risk / Intent Check outcomes, performance scope and remaining runtime gates.

Windows-only follow-up: Steps 1/2 verified real TUI/editor/file outcomes; Step 3 was excluded. Step 4 recorded three confirmed blockers, independent-review startup failure and contention-specific timing misses. See [current evidence](./evidence/windows-2026-11-10/README.md); this ticket remains unaccepted pending its complete criteria.


### Follow-up — 2026-11-13

Native metadata visibility and bounded inspection were verified in the real Windows TUI, including remapped n, Home/End and small-window preview. See [latest evidence](./evidence/windows-2026-11-13/README.md) and [results](./evidence/windows-2026-11-13/RESULTS.md). Fresh independent review is pending. This update supersedes the older provisional check counts/blocker state, not the ticket's acceptance criteria; status remains In Progress.


Independent S1001 requested two fixes; the producer reproduced and addressed them, with 177 tests / 33 files passing. Focused re-review S1002 is pending; the new GUI observation attempt is blocked by desktop-tool failure. See [review dispositions](./evidence/windows-2026-11-13/REVIEW.md). No whole-ticket acceptance is inferred.


**Independent review receipt:** S1003 approved the two S1001 fixes and directly related behavior, with no new defects in that focused static scope. [Receipt and remaining runtime boundaries](./evidence/windows-2026-11-13/REVIEW.md). This supersedes prior pending-review notes; it does not accept this ticket's whole criteria. Status remains In Progress.
