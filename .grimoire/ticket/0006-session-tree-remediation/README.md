# Session Tree Explorer remediation

**Source contract:** [Spec 0008](../../spec/0008-enhanced-session-tree-explorer.md), requirements R01-R15 as applicable to the seven approved audit findings.
**Ticket folder:** .grimoire/ticket/0006-session-tree-remediation/
**Status:** In Progress; implementation and local checks advanced, integrated acceptance incomplete; no ticket accepted as Done.
**Route:** grimoire-loop (explicitly invoked); existing tickets used directly, no separate plan artifact.
**Source snapshot:** clean `03f4468b8333c9b2ce298f2b2a91ce2ec6747fa4`; audit range `b990dfa^..03f4468`.

## Latest follow-up — 2026-11-13

The three Windows-review blockers (raw native label payload ownership, metadata-label filtering and unbounded help/preview) are addressed with failing-first regressions and focused real Windows evidence. Inspection scrolling uses six additional catalog-owned Actions; all original 73 IDs remain (80 total including view.settings). Measured redundant projection/summary work was also removed without changing timing targets.

Pre-review checks: Biome 61 files, type check, 159 tests / 32 files, isolated Pi RPC/native file smoke and diff whitespace checks pass. Three unprofiled reports (isolated and two normal full-suite contention runs) meet all recorded scoped comparisons; physical timing and broad acceptance remain unverified.

See [latest evidence](./evidence/windows-2026-11-13/README.md) and [essential native/timing results](./evidence/windows-2026-11-13/RESULTS.md). Independent review S1003 approved the focused fixes after S1001's two Required findings were addressed. The older checkpoints below are historical. All tickets remain In Progress pending whole-criterion acceptance. WSL/common Unix Step 3 remains excluded, not passed or waived. The earlier verified QA terminal was closed without disturbing shared Terminal; the later launch/window query failed, leaving its GUI-resource outcome unverified, while no task-owned Pi/cmd processes were observed.

### Independent review follow-up

S1001 independently requested changes for wrapped-line argument overflow and raw branch traversal from virtual summaries. Both were reproduced and fixed, including adjacent Root/sibling-boundary cases. S1003 independently approved this focused scope with no new/directly related defects. Current checks: 177 tests / 33 files, Biome 62 files, type check and smoke; updated scoped timing reports meet unchanged targets. [Review receipt](./evidence/windows-2026-11-13/REVIEW.md) preserves static/runtime distinctions and the blocked newer GUI cases. No whole-ticket acceptance label changes; Step 3 remains excluded.

## Conversation contract and permissions

The user approved follow-up tickets for **all seven structural findings, including correcting the reproduced behavior failures**, rather than restricting execution to behavior-preserving restructuring. The existing Spec 0008 defines the intended behavior; a new specification would duplicate that contract.

Initial approval authorized this new Markdown ticket set. The subsequent explicit grimoire-loop invocation authorized serial implementation and verification, and the user's U4 yes authorized the specific Spec 0008 configuration clarifications. No staging/commit/push, CONTEXT/ADR edits, original-delivery-ticket changes, host upgrades or repository-wide infrastructure changes are authorized.

Preserve independent installation, public commands and Action IDs, native /tree, host-owned APIs, raw topology/message content, and the closed-custom-UI session-intent boundary. The behavioral corrections restore the specification; they do not authorize new product features, a host patch, a session-format migration, sibling-plugin changes, or a support-library redesign. Do not split files mechanically or introduce a universal context object, process-wide runtime owner, or forwarding-only facade.

Repository constraints come from [CONTEXT](../../CONTEXT.md), [ADR 0001](../../adr/0001-independently-installable-pi-packages.md), [ADR 0002](../../adr/0002-typescript-esm-plugin-development-stack.md), [ADR 0004](../../adr/0004-unified-command-grammar-and-dynamic-tui-configuration.md), [ADR 0005](../../adr/0005-versioned-plugin-support-library.md) and the [package reference](../../../packages/README.md). Retain TypeScript ESM/erasable syntax, Node >=22.19.0, Biome, Vitest, TypeBox through typebox, tsc --noEmit, used host peers with wildcard ranges and no required bundler/emitted build. Collection panel discovery remains installed-only over pi.events.

## Finding evidence

F1-F7 below identify the preceding grimoire-improve audit in this conversation. Its observations were checked against the clean source snapshot. Repository paths and original line ranges are navigation evidence; recheck them against the execution revision.

| Finding | Verified source and observation | Delivering ticket |
| --- | --- | --- |
| F1: Action authority | [actions.ts](../../../packages/pi-session-tree-explorer/extensions/actions.ts):78, [keymap.ts](../../../packages/pi-session-tree-explorer/extensions/keymap.ts):142, [tui.ts](../../../packages/pi-session-tree-explorer/extensions/tui.ts):446-475. Binding/mode/help policy has competing owners; Preview + f emits a fork intent; normal Esc after accepted search closes without clearing. | T0001 |
| F2: Session snapshot ownership | [index.ts](../../../packages/pi-session-tree-explorer/extensions/index.ts):186-191,268-272; actions.ts:1261-1280. Indexed entries alias host entries, resolved host labels are not read, label Actions assign entry.label, and refresh replaces only index fields. An in-memory Pi SessionManager probe confirmed missing existing labels and raw-entry mutation. | T0002 |
| F3: Search lifecycle | tui.ts:102-140,478-499; actions.ts:976-1133. Typing /needle changes the query but yields no results; manual runSearch finds the entry. [E02's test](../../../packages/pi-session-tree-explorer/tests/e2e-scenarios.test.ts):212,223 injects results instead of exercising that connection. | T0003 |
| F4: Projected navigation | [display.ts](../../../packages/pi-session-tree-explorer/extensions/display.ts):372,413; [navigation.ts](../../../packages/pi-session-tree-explorer/extensions/navigation.ts):135-255; tui.ts:272-279. Navigation reconstructs raw ancestry despite projected visibleParentId. A virtual summary's parent stays unchanged; a hidden branch target b is replaced with root r during render. | T0004 |
| F5: Configuration provenance/validity | [config.ts](../../../packages/pi-session-tree-explorer/extensions/config.ts):170-220,257-287. Editing an unrelated setting copies a project-only value into global settings. A schema-rejected maxMessageLength=1 remains effective after rejection. | T0005 |
| F6: Effective settings reach consumers | index.ts:208-264; tui.ts:50,109-120,383-438. Search/cache options are hardcoded, adapter model/usage inputs are omitted, and details/context flags change without changing rendered output. | T0006, with feature contracts supplied by T0001-T0005/T0007 |
| F7: Revision/cache/render lifecycle | actions.ts:44-75; tui.ts:145-190,383. Selection changes invalidate projection and context-cache reuse; render computes context synchronously. | T0007 |

The audit passed package-local type checking, Biome, **99 tests in 17 files**, and isolated Pi RPC smoke on Node v26.13.0/Windows. These are baseline observations, not remediation acceptance. RPC smoke covered isolated loading/commands and non-TUI notifications, not real interactive Explorer correctness.

A diagnostic 5,000-entry linear-tree probe measured **42.72 ms P95 key-to-render** over 20 alternating moves after initial render (100 columns). This is a hotspot reproduction, not a complete R14 benchmark: its terminal/hardware/dataset evidence was not recorded to the specification's full standard. Do not substitute it, helper-only timing, or the old README's numbers for execution measurements.

## Settled ownership changes and preserved contracts

| Before | After / owner obligation | Contract |
| --- | --- | --- |
| Raw key -> global binding map -> unchecked Action; separate help | One effective catalog -> mode-qualified resolution -> guarded execution and effective help | Stable Action IDs, permitted modes, one dispatch, explicit session intents |
| Borrowed entries + direct label writes + partial index refresh | Owned readonly snapshot and resolved metadata -> coherent refresh/replacement and revision publication | Raw host entries unchanged; labels use supported host APIs |
| Query edits / result injection / reveals maintained separately | Search lifecycle owns query/options, bounded work, result publication and reversible transitions | Search Enter accepts only; cancel/clear preserve underlying fold/filter policy |
| Raw ancestor scans + virtual string decoding + render repair | Projection owns logical relationships and target resolution; transitions reconcile selection | Raw nearest-fork choice and real/virtual identity stay distinct |
| Effective merged config written globally before validation | Layer provenance -> validated candidate -> intended-layer persistence -> publication | Trusted-layer precedence, whole-array replacement, safe failure |
| Config fields and view flags disconnected from consumers | Explicit feature settings slices and runtime view state reach actual behavior/rendering | Existing schema/defaults/safety constraints remain authoritative |
| View version used as session revision; render estimates context | Session/projection identity separate from view changes; bounded metrics lifecycle supplies cached/pending results | Honest provenance, canonical projection, responsive rendering |

These are responsibility contracts, not prescribed class/file names or a separate implementation plan.

## Ticket index

| Ticket | File | Outcome |
| --- | --- | --- |
| T0001 | [T0001-authoritative-actions-and-modes.md](./T0001-authoritative-actions-and-modes.md) | Mode-safe configurable Actions and truthful help |
| T0002 | [T0002-owned-session-snapshots-and-labels.md](./T0002-owned-session-snapshots-and-labels.md) | Readonly coherent session refresh, labels and replacement ownership |
| T0003 | [T0003-keyboard-driven-search-lifecycle.md](./T0003-keyboard-driven-search-lifecycle.md) | Real keyboard search with reversible reveals and stale-work rejection |
| T0004 | [T0004-projection-owned-navigation.md](./T0004-projection-owned-navigation.md) | Correct virtual/hidden navigation without render-time state repair |
| T0005 | [T0005-transactional-layered-configuration.md](./T0005-transactional-layered-configuration.md) | Valid settings updates without project-to-global leakage |
| T0006 | [T0006-effective-settings-and-view-controls.md](./T0006-effective-settings-and-view-controls.md) | Settings and view controls work through the real plugin entry point |
| T0007 | [T0007-responsive-metrics-and-cache-lifecycle.md](./T0007-responsive-metrics-and-cache-lifecycle.md) | Reusable caches and nonblocking, revision-safe context metrics |
| T0008 | [T0008-integrated-remediation-evidence.md](./T0008-integrated-remediation-evidence.md) | Verify the combined remediation through interaction, host usage and measured workloads |

## Requirement coverage

Only the approved findings and their necessary regression boundaries are being remediated. This set does not reopen every unrelated gap that may exist under the broader specification.

| Required outcome / applicable spec contract | Primary owner | Integrated check |
| --- | --- | --- |
| F1; R04/R06, mode-qualified dispatch/help and all 73 Actions reachable | T0001 | T0008 keyboard/override/disabled-action coverage |
| F2; R02/R03/R08/R09, snapshots, labels, refresh, identity and replacement | T0002 | T0008 host immutability, label restoration and stale-intent rejection |
| F3; R03/R05/R07, typed full-text search, scopes, cancellation, acceptance and clear | T0003 | T0008 E02 through actual input rather than injected search results |
| F4; R02-R05, projected parent/child/sibling navigation, hidden branch targets and focus | T0004 | T0008 E01/default filters, virtual rows and multiple roots |
| F5; R01/R13, trusted layers, validation, intended persistence and reload rollback | T0005 | T0008 E06 invalid edits, write failure and cross-project isolation |
| F6; R01/R04-R14 as applicable, settings consumers and view-state restoration | T0006; domain mechanisms remain with T0001/T0003/T0004/T0007 | T0008 settings-to-behavior and restart evidence |
| F7; R03/R10/R14, revision separation, bounded lazy estimates, cache reuse/invalidation | T0007 | T0008 E05 and complete interaction-path benchmarks |
| Preserved package, host, permission and documentation contracts; R01/R09/R15 | Every ticket locally; T0008 combined | Isolated Pi usage, native Navigate/Fork regression, honest package documentation |

## Blocking dependencies

Edges mean the consumer cannot complete its integrated acceptance without the producer's behavior, not that all development must wait. Agree fixture-level interfaces first; shared files alone do not imply an edge.

| Producer | Consumer | Blocking reason |
| --- | --- | --- |
| T0001 | T0003 | Keyboard acceptance requires actual mode-safe search/clear/accept dispatch |
| T0002 | T0003 | Refresh/replacement rejection requires the coherent snapshot/revision boundary |
| T0004 | T0003 | Hidden-hit reveal/clear must use corrected projected-target reconciliation |
| T0002 | T0007 | Context cache/work invalidation requires real session/model/projection identity |
| T0001 | T0006 | Runtime bindings, reload and help must reach the authoritative catalog/dispatch path |
| T0003 | T0006 | Effective search settings must be verified against the working typed-query lifecycle |
| T0004 | T0006 | Navigation/fold settings must affect real projected navigation and focus |
| T0005 | T0006 | Settings application/reload must consume the validated effective configuration |
| T0007 | T0006 | Context/performance settings must reach the nonblocking metrics owner |
| T0001-T0007 | T0008 | Combined acceptance must exercise every delivered outcome, not mocks of unfinished producers |

The graph is acyclic. T0006 transitively consumes T0002 through its feature producers; the direct T0008 edges retain explicit integrated accountability.

## Coordination and recommended order

1. T0001, T0002, T0004 and T0005 have no semantic blockers. Prefer mode safety and snapshot ownership first. They are parallel candidates only with separately authorized, isolated writers and coordinated integration.
2. Complete T0003 after T0001/T0002/T0004; T0007 after T0002. Search and metrics share snapshot identity, not a universal job scheduler.
3. Complete T0006 against those real feature owners and T0005; then T0008 against the combined tree.

| Tickets | Coordination risk | Boundary / integration rule |
| --- | --- | --- |
| T0001/T0003/T0004 | actions.ts, keymap.ts, tui.ts, mode/selection/reveal transitions | Catalog owns action legality; projection owns target mapping; search owns temporary search state |
| T0002/T0003/T0007 | Snapshot revisions and disposal | Snapshot producer publishes identity; each consumer owns its own work and invalidation |
| T0002/T0004 | types.ts, entry IDs versus display IDs | Agree readonly metadata/raw-view identity; do not leak virtual IDs into host effects |
| T0001/T0005/T0006 | Config validation, commands, panel/reload and bindings | Key diagnostics from catalog; layer validity from ConfigManager; application from runtime adapter |
| T0003/T0004/T0007/T0006 | Per-feature settings and tui.ts | Feature tickets accept explicit settings in their own tests; T0006 owns command-to-feature wiring, application and view controls |
| All producers/T0008 | Shared tests/README, package loading and performance claims | Tests accompany producers; serialize shared writes and verify the combined tree before claiming acceptance |

## Verification and evidence rules

Every delivering ticket adds tests at its stable behavior boundary and runs affected permitted checks when execution is later authorized. T0008 does not replace producer verification.

- Run the package's actual `typecheck`, `check`, `test`, and isolated Pi `smoke` scripts separately; retain failures/unavailable checks rather than relabel them as passes.
- Use actual keyboard -> dispatch -> state/effects -> render tests for integration claims. Do not inject final search results, manually call an unwired search method, or check only a flag/action count.
- Preserve all 73 Action contracts and canonical Pi context projection. Keep host mutation after custom UI completion, real target/session revalidation, busy/cancellation checks, summarize=false by default and fresh replacement-context use.
- Benchmark index build, movement, branch jump, search feedback, first open and cache hits against unchanged R14 targets; include complete relevant interaction paths. Record hardware/OS, terminal, Node, dataset bytes/topology, warmup and sampling. Allow only explicitly documented deviations under the existing spec, not silent threshold reductions.
- Keep real Pi loading, interactive Windows Terminal/WSL/Unix evidence, mocks, and diagnostic probes distinct. Missing required platform evidence remains unverified; no broad v1.0 acceptance follows from RPC smoke.
- Update the package README during execution to reflect verified behavior and limitations. This set does not authorize rewriting historical completion records, installing infrastructure, or introducing a new repository-wide CI project.

## Knowledge boundary and execution handoff

Consume settled requirements and established solution choices only. Organize, express, decompose and sequence them; do not invent or revise domain facts, requirements, constraints, acceptance semantics, architecture or unconfirmed assumptions. Trace meaningful choices to Spec 0008, the approved audit/conversation contract above or the applicable repository ADRs.

If execution needs a new material fact or decision, suspend that part and return it to refinement/clarification before proceeding. Do not invent it and record it retrospectively. File decomposition, scheduling internals and exact helper names remain reversible implementation details within these contracts; they do not permit changing the semantics.

**Recording:** No CONTEXT/ADR write permission was granted. The original raw/display/selected/focused/leaf terminology and responsibility choices remain unpersisted project-knowledge candidates; they are task requirements here, not new project-wide ADRs. This permission boundary does not block the selected ticket endpoint.

**Assumptions/limitations:** No additional product assumption is adopted. The source snapshot must be revalidated before execution; baseline passing tests do not establish correctness of the repaired interactions. The full test corpus and cross-platform UI were not exhaustively inspected in the audit.

After explicit user invocation, hand this README and Spec 0008 to **grimoire-loop**. Recheck the source revision, execute dependency-ready Todo tickets, and retain incomplete/blocker status where evidence is missing. Refinement stops at these artifacts; it does not start execution or a separate plan stage.


## Current checkpoint: U4 implemented; integrated acceptance incomplete

The user answered yes to the proposed clarification and Spec 0008 amendment. The clarification gate is released; **no further requirements decision is pending**. Spec U4 now rejects conflicting forkPosition/hidden-node/fold-preservation values, defines expandable linear summaries, and authorizes confirmed/visible post-UI waiting with revalidation. It does not disable the existing explicit navigateSummarize=true opt-in; summarize=false remains the default.

All seven producer mechanisms are implemented and have local regression evidence. Every producer and T0008 remains **In Progress**, not accepted Done; acceptance checkboxes deliberately remain unchecked while the integrated evidence gaps below remain open. Do not replay their implementation as untouched Todo work.

### Latest follow-up: Windows-only QA (Steps 1, 2 and 4)

The user explicitly required Steps 1/2/4 in order and excluded Step 3. **No WSL/common Unix testing or host upgrade was performed.** This update supersedes the earlier native-UI gaps and provisional clean-source observations below.

- Steps 1/2 now have real Pi **1.5.0 Windows Terminal** evidence: typed search/cancel/accept/preview/clear, virtual expansion/parent navigation, resolved-label refresh, settings/non-Vim behavior, live reload, remapping and reopen. Native Navigate restored the expected editor prompt in the original session; Fork At retained the target in an independent session; Fork Before excluded it and restored its prompt. Both source files remained byte-identical and zero agent starts occurred.
- Package source fingerprint remains `f801a259d771994e0001400504f94af220ced077`; this follow-up changed evidence/ticket documentation only.
- Step 4's independent reviewer could not start: `Cannot locate the Pi CLI in the installed host package`. No independent review receipt exists.
- A scoped parent source/evidence pass confirmed **three remaining blockers**: unbounded/unpaged help (and the same long-preview rendering risk); snapshot decoration overwrites native label-event payload; default metadata filtering does not hide native type=label. These are not fixed or waived by passing tests.
- Repeated Biome/typecheck/**150 tests in 29 files**/real RPC smoke passed. Isolated headless timings meet their scoped comparisons. Under full-suite contention search was **144.05 ms** against <100 ms, branch movement **39.49 ms** against <20 ms and queued movement **19.12 ms** against <16 ms. The documented 155.53 ms historical deviation remains relevant; no target is weakened.
- All tickets remain In Progress. No whole-ticket acceptance is granted while these defects and review/evidence limitations remain.
- Cleanup of the disposable terminal failed through the desktop tool; only its own window may need manual closure. The shared WindowsTerminal process was not killed.

See [Windows QA/review evidence](./evidence/windows-2026-11-10/README.md) for screenshots, native editor/session/file assertions, source reproductions, both benchmark reports, scope and cleanup details.

Next work is to resolve the three confirmed findings, obtain an available independent review and explicitly disposition performance deviations. Do not run the excluded Step 3 without a later user instruction.

### Current revision and commands

- HEAD: `03f4468b8333c9b2ce298f2b2a91ce2ec6747fa4`; all changes remain uncommitted.
- Changed-package fingerprint: `f801a259d771994e0001400504f94af220ced077`. Recompute with the command in the historical checkpoint before reusing evidence.
- Executable checks and the final isolated benchmark ran at package fingerprint `761b1b6067fa0b9ef0f7bba8bc51a1a40ec492f1`; only package README evidence wording changed afterward.
- Latest package-local checks: `npm run format`, `npm run check` (57 files, no diagnostics), `npm run typecheck`, `npm test` (**150 tests / 29 files**) and `npm run smoke` passed. `git diff --check` passed.
- Smoke independently installs the package offline in isolation and uses real Pi 1.5.0 RPC with offline seeded history. It verifies native Navigate, Fork At/Before retained entries, independent replacement session identity/file, replacement callback cleanup, original history byte preservation and no automatically started assistant turn. **RPC does not prove TUI editor restoration**: Pi 1.5.0's RPC command actions omit the TUI restoration path; those invalid RPC assertions were removed, not relabeled as passing.
- No commits/pushes, CONTEXT/ADR edits, original delivery-ticket changes, host upgrades or repository-wide infrastructure changes were made.

### Earlier provisional Code Risk (before Windows-only QA)

Inspected the actual changed catalog/key resolver/dispatcher, snapshot adapter, search controller/documents, display target ownership, configuration/panel publication, session effects, view-state restoration and metrics/cache callers. Confirmed regression cases were fixed and exercised red -> green:

- Cold linear search built branch metadata with repeated ancestor walks (1,001,000 parent lookups for 1,000 entries). Preorder-derived branch ownership is now linear; scoped collection is iterative, including a 20k deep regression.
- Context-disabled rendering still scheduled estimation; the disabled case now schedules zero jobs.
- Remapped keys and hints diverged: named keys/modifier aliases and explicit search bindings now resolve consistently; footers/help read effective bindings. The existing help settings shortcut is the catalog-owned `view.settings` Action. All original 73 Action IDs remain, plus that remappable existing capability.
- Settings could close before pending writes finished, then reapply stale effective values. The real SettingsList Enter path with a gated write now proves the panel waits before returning.
- Compression selection changes reused stale structure and merged virtual rows lost ownership. Cache selection dependencies are conditional on compression, and owned raw ranges resolve through explicit projection metadata.
- Unrelated settings changes reset current filters/folds/search choices. Differential application now preserves unchanged choices and reconfigures relevant consumers only.
- Duplicate IDs no longer create duplicate edges; cyclic/missing historical context targets are normalized/rejected without altering raw entries. Thinking/tool arguments are searchable; content copying does not prepend search-only ID/role metadata.

No confirmed unresolved code blocker was established in those inspected paths after the fixes. Coverage remains partial for physical keyboard protocols and live native TUI/editor outcomes. Headless ready-event queueing during pending canonical estimates is now measured. A fresh independent reviewer was attempted, but delegation failed at spawn with `Cannot locate the Pi CLI in the installed host package`; no child review ran. This source assessment is not represented as an independent clean-review receipt.

### Earlier Intent Check (superseded by Windows-only QA above)

- Windows Terminal launch and window-state tools returned unknown-outcome failures. Read-only OS inspection found no task-owned pi/cmd process; only the task's isolated fixture was removed. No blind retry, unrelated-window action or platform pass is claimed.
- Available WSL Arch Linux reports Pi **1.3.0**, Node v26.12.0, with script/tmux available. The required Pi 1.5.0 baseline is unavailable there; it was not upgraded implicitly. Matching-version WSL/common Unix terminal keyboard checks remain unperformed.
- Native TUI open/close, actual keyboard/search/settings/label interactions and Navigate/Fork Before editor restoration still need real terminal evidence. Controlled UI/SessionManager tests and RPC/file evidence do not substitute for those outcomes. Busy/cancel/wait failure/replacement cases are covered at the post-UI effect boundary, not through a live provider turn.
- The modeled 10k open is supplemented by the actual assembled command handler, real SessionManager and first render across ten fresh configuration/view-state samples. Ready-setImmediate event scheduling measures pending-estimate queueing on a 5k native-history snapshot. Both still inject the TUI boundary rather than driving a physical terminal, so T0008 interactive acceptance remains incomplete.
- A CPU-contended earlier full-suite search measurement was **155.53 ms**, above the unchanged 100 ms target. The isolated current workload below meets its scoped comparison; the contended deviation is retained, not waived. The benchmark's Vitest pass asserts structural/finite measurements, not automatic satisfaction of all timing targets.
- All 73 original Action contracts, explicit native /tree independence, host-owned raw content and default no-summary behavior are preserved. No broad v1.0/Spec 0008 acceptance is claimed.

### Earlier synthetic performance evidence

Environment: win32/x64, 11th Gen Intel(R) Core(TM) i7-1165G7 @ 2.80GHz, Node v26.13.0; **headless 120-column injected TUI boundary**, no physical terminal. Method: index20; movement20 warmup+100 samples; ready-setImmediate queued native-history movement20 warmup+100 enqueue-to-render samples with live estimate timers; branch50; cold+warm search20 (debounce=0, Enter flush); modeled first open10; actual stree command+real SessionManager+headless first render10 (fresh config/view IO); cache1000; 5k/25MB snapshot/render3; P95=floor(n*.95). The assembled sample runs the actual registered handler against real SessionManager history and fresh configuration/view lookup, not a copied initial-view algorithm. Ready-event queueing uses setImmediate so it does not add an intentional timer sleep before input is ready. Search flushes on Enter with zero debounce (the default 40 ms wait is not measured). Payload-heavy snapshot/render is an additional diagnostic, not a new R14 target.

| Workload | P95 | Unchanged comparison | Samples |
| --- | --- | --- | --- |
| index5k | 15.63 ms | <200 ms | 20 |
| movement5k | 2.43 ms | <16 ms | 100 |
| branch5k | 4.61 ms | <20 ms | 50 |
| search5kLinear | 62.00 ms | <100 ms | 20 |
| firstOpen10kHeadless | 79.58 ms | <500 ms | 10 |
| cacheHit | 0.02 ms | <5 ms | 1000 |
| snapshotRender5k25MBHeadless | 234.42 ms | <500 ms | 3 |
| assembledCommandFirstOpen10kHeadless | 60.24 ms | <500 ms | 10 |
| queuedMovement5kWithPendingEstimates | 6.06 ms | <16 ms | 100 |

Dataset JSON bytes (all four topologies are indexed at every size; not every interaction is repeated at every size):

| Entries | Linear | Wide | Deep | Mixed |
| --- | --- | --- | --- | --- |
| 100 | 20470 | 17880 | 14977 | 19755 |
| 1000 | 207669 | 180780 | 152226 | 200319 |
| 5000 | 1051668 | 912780 | 774225 | 1015221 |
| 10000 | 2106668 | 1827780 | 1551725 | 2033851 |
| 20000 | 4246667 | 3677780 | 3136724 | 4102029 |

Additional 5,000-entry long-message dataset: **25,705,270 bytes**, three owned-snapshot/render samples. The real SessionManager 10k linear-user dataset is **1,798,885 bytes**. Reproduce with `npm test -- tests/remediation-benchmark.test.ts --reporter=verbose`; optional STREE_BENCH_REPORT records the complete JSON report. Do not equate these numbers with physical terminal latency. The assembled handler is tested, but the real TUI/paint/editor boundary remains unverified.

Measurement correction: a setTimeout-based queued probe read about 17.94 ms, but an empty timer alone measured 16.43 ms P95 on this Windows host. That was a timer-wait artifact, not established input-processing cost. The ready-event workload instead measures enqueue-to-render while actual estimate timers can run. A tentative input-idle deferral was compared and reverted: the valid baseline already met the target and no compelling change justified delaying metrics. No performance target or runtime setting was weakened.

### Earlier resume guidance (superseded by the latest Windows-only scope)

1. Revalidate HEAD/dirty state/fingerprint, Spec U4 and actual changes.
2. Obtain matching-version interactive Windows Terminal/WSL/common Unix evidence when the desktop/host prerequisite is available, without unauthorized host installation or upgrades.
3. Verify native editor outcomes, live controls and remaining real-terminal/full-workload latency evidence; retain or resolve the explicit timing deviation.
4. Reassess Code Risk and Intent Check against that exact tree; accept whole tickets only when their complete evidence supports Done. No unresolved configuration choice requires asking the same permission again.

## Historical checkpoint: clarification required (superseded by U4)

The user explicitly invoked grimoire-loop after creating this set. Execution used the existing tickets as its approach: serial implementation, targeted regression testing, affected fixes, provisional source/intent assessment and verification of the current combined tree. No separate plan artifact, parallel writers, commit/push, CONTEXT/ADR edit or Spec 0008 edit was performed.

### Current source and evidence

- Base/HEAD remains `03f4468b8333c9b2ce298f2b2a91ce2ec6747fa4`; implementation, tests, package README and this new ticket set are uncommitted.
- Current changed-package content fingerprint: `32d17e91ff027f6b4ebd15a69d8cef4f4d18a93f`, computed with `git ls-files --modified --others --exclude-standard packages/pi-session-tree-explorer | sort | git hash-object --stdin-paths | git hash-object --stdin`. Recompute before reusing evidence.
- Latest combined checks from packages/pi-session-tree-explorer: `npm run format`, `npm run check` (54 files, no diagnostics), `npm run typecheck`, `npm test` (**125 tests / 26 files**) and `npm run smoke` all passed. `git diff --check` also passed.
- Isolated smoke starts real Pi RPC with offline temporary dependencies and verifies commands/non-TUI behavior. It is not interactive Explorer or native session-mutation/editor/file evidence.
- Major reproduced regressions were exercised red -> green. Additional persisted-view validation was challenged by temporarily bypassing its guard: the corruption test failed for invalid layout publication, the fault was restored, and the complete suite subsequently passed.
- A headless diagnostic measured 5,000-entry normal-mode key-to-render P95 **2.11 ms** over 100 alternating j/k moves at 100 columns, after initial render, 300 ms for estimates and 10 warmup moves. Environment: Windows x64, Intel i7-1165G7 @2.80 GHz, Node v26.13.0; 637,778-byte JSON dataset of linear user entries. This preceded the final key-validation/search-text cleanup (normal movement path unchanged), is not a physical-terminal/full-open measurement, and does not replace T0008's full workload evidence.

### Implemented mechanisms, not whole-ticket acceptance

| Finding | Current changes / supporting tests |
| --- | --- |
| F1 | Catalog-derived defaults, mode-qualified keys/dispatch/help, prefix disposal, normal Escape clearing, shared arrow alternatives, invalid-modifier diagnostics and printable Unicode search input; remediation-input.test.ts and existing keymap/TUI tests |
| F2 | New session-snapshot.ts captures owned entry metadata/resolved host labels; coherent refresh and operation identity, observed async effects and cleanup; remediation-snapshot.test.ts, remediation-effects.test.ts, remediation-plugin.test.ts |
| F3 | New search-state.ts owns debounced query execution, results, snapshots, reveal/cancel/accept/clear and revision/disposal invalidation; remediation-search.test.ts exercises actual input |
| F4 | Projected ancestry and explicit anchor lookup, correct preorder, transition-time target reconciliation and no render-time selection repair; remediation-projection.test.ts includes hidden branch choice and non-sticky summary expansion |
| F5 | ConfigManager keeps layer provenance, serializes edits, validates/persists before publication and returns defensive settings; failed reload preserves safe state; remediation-config.test.ts plus existing configuration/panel tests |
| F6 | Actual plugin wiring for supported feature settings/model/usage, details/context controls, safe reload/settings link, host label editing and validated session view restoration; remediation-settings.test.ts, remediation-plugin.test.ts, view-state.test.ts; **remaining semantics below block completion** |
| F7 | New metrics-controller.ts owns bounded/disposable prioritized work and revision-keyed caches; projection reuse across selection; canonical content estimates replace cumulative usage and unsupported historical windows remain unknown; remediation-metrics.test.ts includes reprioritization and disposal |

The original delivery tests were retained. The old Escape-to-close assertion was corrected to q under R07. Session-operation UI tests now create a fresh component for each closed interaction and use actual projected summaries rather than fabricated virtual IDs.

Formal ticket acceptance checkboxes remain unchecked: green local checks do not verify every compound criterion or the final host/platform/performance gates. The ticket statuses are not promoted to Done from this partial evidence. Resume from actual source/diff and this checkpoint rather than blindly replaying a Todo ticket's writes.

### Code Risk and Intent Check disposition

The current local regression/static/RPC gates pass. Provisional source inspection covered the changed ownership/dispatch/configuration/search/projection/async-effects/cache seams and added files. It does not establish a final clean joint review of the unfinished set.

**Confirmed intent blockers:** T0006 still lacks settled semantics for the non-default settings listed below; accepting their schema values is not equivalent to implementing them. Other feature-setting integration/edge-case checks remain to finish after clarification.

**Needs verification:** Full combined criterion-by-criterion review/check, actual Pi interactive open/close/search/settings/labels, native Navigate/Fork file/editor/replacement cases, Windows Terminal/WSL/Unix keyboard evidence, and complete R14 interaction/open/workload benchmarks. Missing evidence is not a product failure or a passing gate. T0008 remains incomplete.

### Required user decision before remaining implementation

Spec 0008 mandates f = Fork At, F = Fork Before, visible-row node navigation and reversible fold restoration, while admitting configuration values whose alternative behavior is not defined:

1. What should `session.forkPosition=before` change without violating the fixed f/F contracts?
2. What does `navigation.skipHiddenNodes=false` change while node Actions remain visible-only?
3. What may `search.preserveFoldState=false` change while cancel/clear must preserve underlying manual folds?
4. Does `fold.collapseLinearPaths=true` compress only indentation or replace intermediate rows with expandable virtual summaries?
5. Should the optional `session.busyBehavior=wait` path be delivered through explicit confirmation and visible waiting after the Explorer closes? It currently rejects unsafe operations rather than silently waiting.

Recommended clarification for user approval: preserve the mandatory f/F, visible-node and reversible-fold behavior; reject incompatible non-default values in items 1-3 with actionable diagnostics rather than pretending they work; define linear compression as expandable virtual summaries preserving raw identity; implement item 5 only through explicit confirmation/visible waiting with revalidation. This changes the accepted configuration contract, so **permission to amend Spec 0008 is requested, not assumed**. The user may instead define other compatible meanings.

Resume after that decision: update only newly authorized source artifacts, finish the per-feature settings matrix and remaining producer criteria, rerun affected checks, complete the joint review/check and available integrated evidence, and report unavailable gates honestly. No overall remediation acceptance has been claimed.
