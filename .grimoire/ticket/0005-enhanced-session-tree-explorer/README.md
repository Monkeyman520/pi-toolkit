# Enhanced Session Tree Explorer ticket set

**Source:** [Spec 0008](../../spec/0008-enhanced-session-tree-explorer.md)
**Ticket folder:** .grimoire/ticket/0005-enhanced-session-tree-explorer/
**Status:** In Progress; T0001-T0005 Done, T0006-T0008 Todo
**Date:** 2026-11-09
**Selected route:** grimoire-refine -> grimoire-spec -> grimoire-slice; stop at artifacts

## Overview and settled handoff

Deliver the full v1.0 independent Pi Session Tree Explorer, with /stree, Raw Tree / display projection separation, complete configurable Actions, focused folding, composable filters, full-text search/Preview/labels, safe Navigate/Fork, honest historical Context estimates and per-session view persistence.

- Browse, search, fold and filter never mutate raw topology or Session Leaf; explicit label/Navigate/Fork operations are separate effects.
- Selected Node, Focused Branch/path and actual Session Leaf are independent.
- Use nearest raw fork, preserve the normative D1/C2 cases, keep roots independent and do not confuse node siblings with sibling branches.
- Full v1.0 is final acceptance. P0/P1/P2 and U1's phases guide delivery rather than remove advanced actions, persistence or large/multiple-root safety.
- Search j/k are text; arrows/Ctrl+n/p select. Search Esc rolls back selection/folds/query; Search Enter accepts without Navigate and keeps query/reveal; normal Esc clears and selects nearest visible ancestor if needed.
- Node Label/User jumps follow visible order. Fork/leaf traversal uses raw preorder within the current Root, with the Spec's branch-subtree scope for leaf traversal. No default wrap; explicit branch.cycle is cyclic.
- Search scopes are all raw entries or focused subtree, ties use original session order. Filters intersect and may yield an empty state.
- Config precedence is defaults/global/trusted-project/runtime; objects merge, arrays replace. Invalid startup layers are ignored wholly; failed reload retains last valid effective config. Untrusted project config is not loaded.
- Pi 1.5.0 docs/types/source were inspected; no Explorer code or runtime compatibility result exists yet. Public historical projection helpers permit read-only estimates, but API availability does not prove correct final rendering or safe lifecycle behavior.
- No production code, runtime QA, git staging/commit or separate implementation plan was produced in refinement. Ticket acceptance describes future authorized execution, not checks already performed.

## Delivery surfaces

| Surface | Ownership / boundary |
| --- | --- |
| New independent package | package metadata, extensions/index.ts, actual resources, own dependency delivery and checks |
| Read-only adapter/index | full host entries, topology/order, revision, depths, current leaf |
| View state / projection | logical ancestry, real/virtual identity, policy/manual/search folding and filters |
| Action/input | stable Action IDs, mode-local key parsing, prefixes/conflicts/help |
| Configuration | TypeBox/schema, trusted file layers, settings/completions/installed-only discovery |
| Search/content | full raw-text index/ranking, temporary reveals, Preview/clipboard/explicit labels |
| Session effects | closed-UI intents, real-target validation, native Navigate/Fork and replacement cleanup |
| Context metrics | canonical read-only projection, historical model/window/provenance, lazy bounded cache |
| Responsive UI / state files | viewport, Unicode/width layouts, session-isolated persisted preferences |
| Verification / documentation | local tests plus actual isolated Pi, platform input, benchmarks, CI and real package catalog |

Small helper files may be combined. These are responsibility/seam contracts, not a required file per row. Do not introduce a separately activated manager or mutable process-wide ownership.

## Ticket index

| Ticket | File | Outcome |
| --- | --- | --- |
| T0001 | [T0001-read-only-tree-explorer.md](./T0001-read-only-tree-explorer.md) | Open a read-only Explorer with correct tree navigation |
| T0002 | [T0002-vim-folding-and-filters.md](./T0002-vim-folding-and-filters.md) | Navigate a filtered focused tree with complete Vim key parsing |
| T0003 | [T0003-trusted-configuration-and-settings.md](./T0003-trusted-configuration-and-settings.md) | Configure the Explorer through validated trusted layers and collection TUI |
| T0004 | [T0004-search-preview-and-labels.md](./T0004-search-preview-and-labels.md) | Find hidden history and inspect or explicitly label a real entry |
| T0005 | [T0005-safe-navigate-and-fork.md](./T0005-safe-navigate-and-fork.md) | Navigate or fork explicitly without stale session ownership |
| T0006 | [T0006-context-metrics-and-cache.md](./T0006-context-metrics-and-cache.md) | Show branch-correct context estimates with honest provenance |
| T0007 | [T0007-responsive-view-and-persistence.md](./T0007-responsive-view-and-persistence.md) | Keep a readable responsive view and restore per-session preferences |
| T0008 | [T0008-integrated-v1-validation.md](./T0008-integrated-v1-validation.md) | Verify full v1.0, performance, platform input and installability |

## Requirement coverage

T0008 verifies all rows end-to-end; it is not the sole owner of testing.

| Spec requirement | Primary delivering ticket(s) | Integrated evidence |
| --- | --- | --- |
| R01 Package/host/collection integration | T0001, T0003 | isolated loading, settings/completions/discovery |
| R02 Full raw topology/depth/safety | T0001 | malformed/multiple-root fixtures and original order |
| R03 Separate state/projection/effects | T0001, T0002, T0004, T0005 | E01-E04 browse and explicit mutation boundary |
| R04 Complete node/branch navigation | T0001, T0002 | 17 node + 13 branch Actions, D1/C2 fixtures |
| R05 Fold policies and intersecting filters | T0002 | 11 fold + 8 filter Actions; reveal precedence |
| R06 Modes/multi-key/custom input | T0002, T0003 | no duplicate dispatch; search j/k and overrides |
| R07 Raw full-text search | T0004 | 7 search Actions; E02 scope/rollback/reveal |
| R08 Preview/copy/labels/refresh/close | T0001 (close), T0004 | explicit label effect versus pure browse |
| R09 Navigate/Fork lifecycle | T0005 | E03-E04 actual host/file/editor outcomes |
| R10 Honest historical Context | T0006 | E05 canonical projection and unknown provenance |
| R11 Layout/view controls | T0007; T0002 (help/Vim), T0003 (reload) | all 8 view Actions, width/Unicode/input |
| R12 View-state persistence | T0007 | E06 restart/stale IDs/no transient leaks |
| R13 Validated config layers | T0003; T0007 (view precedence) | E06 trust, failure, schema/default examples |
| R14 Responsiveness/protection | T0001, T0002, T0004, T0006, T0007 | T0008 measures six P95 targets and deviations |
| R15 Tests/docs/platform/CI | Every ticket locally; T0008 integrated | E01-E07, full final DoD |

### Original design coverage

| U1 section(s) | Preserved contract / delivery |
| --- | --- |
| 1 Overview/goals/non-goals/principles | Spec intent, R01/R03/R09 and exclusions; T0001/T0005/T0008 |
| 2 UI and terminal width | R11; T0007 |
| 3 Entities and depth | R02/R03/R10; T0001/T0002/T0006 |
| 4 Complete Action system | R04-R11; T0001-T0007, audited in T0008 |
| 5 Precise branch semantics | R04; T0001/T0002 |
| 6 Folding/projection/virtual rows | R03/R05; T0002/T0004 |
| 7 Search | R07/R08 plus accepted U2/U3; T0004 |
| 8 Context | R10; T0006 |
| 9 Navigate/Fork | R09; T0005 |
| 10 Vim/keymap | R06/R13 plus accepted U2; T0002/T0003 |
| 11 Configuration | R13 plus accepted U3 and repository conventions; T0003 |
| 12 Architecture/dataflow | Spec seams, R02-R03; shared across delivering tickets |
| 13 Extension integration | R01/R09; T0001/T0003/T0005 |
| 14 Performance | R14; protected in producers, measured in T0008 |
| 15 Persistence | R12; T0007 |
| 16 Tests | R15/E01-E07; per-ticket and T0008 |
| 17 Phases | Value-oriented ticket order below; no separate implementation-plan artifact |
| 18 DoD | Complete R01-R15 and T0008, not just P0 |
| 19 Priorities | Delivery preference, not permission to drop scope (U2) |
| 20 Architecture/final deliverable | Spec seams/exclusions, independent complete package |

## Blocking dependencies

These are consumer prerequisites, not a list of every shared file.

| Producer | Consumer | Why consumer cannot be completed/verified first |
| --- | --- | --- |
| T0001 | T0002 | Requires actual indexed navigation, selection and Action registry for projected fold/filter/input behavior |
| T0001 | T0003 | Requires real extension registration/ownership for command, settings and installed-panel verification |
| T0001 | T0005 | Requires real IDs, session identity, Explorer return intents and closed-UI command boundary |
| T0001 | T0006 | Requires raw snapshot/revision/index and depth identities to verify read-only node metrics |
| T0002 | T0004 | Search acceptance/rollback must exercise actual filter/fold/reveal and mode behavior |
| T0002 | T0007 | Persistence must restore actual focus/filter/manual-fold state; rendering uses its projection |
| T0003 | T0007 | Restart/view overrides must obey the real effective-config and owned-file precedence |
| T0001 | T0008 | Integrated final acceptance must exercise this producer's actual delivered behavior |
| T0002 | T0008 | Integrated final acceptance must exercise this producer's actual delivered behavior |
| T0003 | T0008 | Integrated final acceptance must exercise this producer's actual delivered behavior |
| T0004 | T0008 | Integrated final acceptance must exercise this producer's actual delivered behavior |
| T0005 | T0008 | Integrated final acceptance must exercise this producer's actual delivered behavior |
| T0006 | T0008 | Integrated final acceptance must exercise this producer's actual delivered behavior |
| T0007 | T0008 | Integrated final acceptance must exercise this producer's actual delivered behavior |

The graph is acyclic. T0008's direct producer list deliberately includes all delivered slices so none is mistaken for optional acceptance.

## Parallel work and coordination

| Tickets | Relationship / risk | Coordination strategy |
| --- | --- | --- |
| T0002, T0003, T0005, T0006 | Parallel after T0001; shared Action/config/adapter wiring | Agree Spec seams, own separate behavior; integrate handler edits rather than impose false dependency chains |
| T0002, T0003 | Runtime key resolver versus on-disk schema/reload | Shared key validation diagnostics and binding-array contract; test each using fixtures |
| T0004, T0005 | Search/label effects versus Navigate/Fork; shared lifecycle guards | Search Enter selects only; one session-mutation ownership mechanism, no competing effect adapters |
| T0004, T0006 | Raw snapshot/revision readers | Independent search/metric cancellation; no shared mutable scheduler or unbounded full-text/context work |
| T0006, T0007 | Metrics service versus viewport/details | ContextMetrics fixture contract permits parallel work; integrate viewport priority/provenance before T0008 |
| T0003, T0007 | Settings layers versus per-session view files | Config owns effective defaults/trust; view store persists only allowed per-session preferences |
| T0005, T0006, T0007 | Replacement cleanup | Dispose all old ownership on shutdown; rebind to fresh session context |
| All producers | Shared entry/renderer/tests/README edits | Coordinate file ownership or serialize integration; shared files alone are not semantic blockers |

No sibling-plugin source changes are required by this set. A declared ordinary support-library dependency must preserve independent delivery and lifecycle; do not expand into a support-library redesign.

## Recommended order

1. **T0001:** First runnable, read-only browsing slice with navigation evidence.
2. **T0002:** Full input/fold/filter interaction. **T0003, T0005 and T0006 may proceed in parallel after T0001** using the Spec seams.
3. Prefer completing **T0005** early after the baseline for the P0 Navigate/Fork workflow; this is a priority preference, not a dependency on search/context.
4. **T0004** after T0002; **T0007** after T0002 and T0003. They can proceed alongside T0005/T0006 with coordinated integration.
5. **T0008** after all producers, for full v1.0 integrated evidence.

This is ticket relationship/order guidance, not a separate implementation plan. Tests and honest package documentation accompany each slice, not only the last ticket.

## Acceptance and evidence rules

- All 73 named Actions in the Spec are part of final acceptance: node 17, branch 13, fold 11, filter 8, search 7, session 9 and view 8. An absent default key does not make an Action optional.
- No generated UI example number is a measured token value or benchmark. Pi APIs/types prove availability, not Explorer runtime behavior.
- Benchmarks retain supplied targets: 5k index P95 <200ms; movement <16ms; branch jump <20ms; search feedback <100ms; 10k open <500ms; cache hit <5ms. The original DoD permits explicitly documented performance deviations, not silent threshold changes.
- Missing real Windows Terminal/WSL/Unix keyboard evidence, loading/usage evidence, safety tests or required functionality remains an execution acceptance blocker. Do not replace it with configuration inspection.
- A feature ready in an intermediate ticket does not imply full v1.0 readiness. Preserve separate static/unit/runtime/platform/performance results.

## Knowledge boundary, permissions and limitations

Specialist handoff: consume settled Spec requirements and established choices only. Trace assertions to U1/U2/U3, repository ADR/package contracts or verified installed host evidence. Decompose and sequence; do not invent or revise facts, architecture, constraints or acceptance semantics. Return a needed new material decision to refinement/clarification before proceeding; do not invent it and record it retrospectively.

The selected endpoint authorizes these Markdown artifacts only. No automatic implementation, runtime QA, staging/commit, Git policy changes, CONTEXT/ADR changes or separate planning stage.

**Pending knowledge persistence:** No explicit authorization was given for CONTEXT/ADR writes. Raw/display/branch and selected/focused/active terminology plus Extension-first/projection/Action/effect choices remain candidate knowledge, captured as task requirements in the Spec. Resume grimoire-record with an authorized batch if requested; pending permission alone does not block this artifact endpoint.

**Limitations:** Pi 1.5.0 was inspected, not runtime-tested for this new package. Final payload/context size can differ because of prompt/tool/extension/provider transformations. Exact timeout/scoring/cache/file decomposition choices remain implementation details within the Spec's outcomes, not new product assumptions.

## Execution handoff

On explicit user invocation, use grimoire-loop with this README and [Spec 0008](../../spec/0008-enhanced-session-tree-explorer.md). Begin at T0001; preserve Todo status until work is actually executed and verified. The refinement workflow stops here and does not invoke that execution workflow.