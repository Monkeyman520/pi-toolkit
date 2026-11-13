# Pi Session Tree Explorer

An independently installable Pi extension for browsing the current session tree, finding history and explicitly navigating or forking. Native /tree is unchanged.

## Status

Remediation is **in progress**, not accepted as complete v1.0. The [follow-up ticket set](../../.grimoire/ticket/0006-session-tree-remediation/README.md) tracks seven structural findings and combined verification against [Spec 0008](../../.grimoire/spec/0008-enhanced-session-tree-explorer.md).

The current changes cover mode-qualified Actions, readonly host snapshots/resolved labels, keyboard-driven search, projected navigation, transactional settings, effective view controls and a bounded lazy context-metrics lifecycle. Passing static/unit/RPC checks do not establish real interactive or cross-platform acceptance.

### Approved non-default policy

Spec 0008 U4 resolves the non-default behavior: `forkPosition` accepts only `at` (f/F remain fixed At/Before), while `skipHiddenNodes` and `preserveFoldState` accept only true. Conflicting values produce diagnostics. Linear-path compression creates expandable virtual summaries without changing raw topology. Opt-in `busyBehavior=wait` requires post-UI confirmation, notice, waiting and safety revalidation; exhaustive live busy/cancel/error acceptance remains pending.

## Compatibility, installation and resources

- Node.js >=22.19.0; TypeScript ESM with erasable syntax and no emitted build.
- Prior Windows loading/TUI evidence used Pi 1.5.0. The [current focused follow-up](../../.grimoire/ticket/0006-session-tree-remediation/evidence/windows-2026-11-13/README.md) uses the already-installed Pi 1.5.2 on Windows x64; no host upgrade was performed. Wildcard peers are not universal compatibility evidence.
- Host peers: @earendil-works/pi-coding-agent, @earendil-works/pi-ai, @earendil-works/pi-tui and typebox.
- Declared ordinary dependency: pi-plugin-support@0.1.0, with its archive under vendor/. No sibling plugin needs to load.
- Extension resource: extensions/index.ts.

From the repository root:

```sh
pi -e ./packages/pi-session-tree-explorer
```

Or install locally with `pi install ./packages/pi-session-tree-explorer`.

## Commands and interaction

| Command                     | Behavior                                                                     |
| --------------------------- | ---------------------------------------------------------------------------- |
| /stree                      | Open Explorer in TUI; explain the interactive requirement in other modes     |
| /stree config               | Open the installed-plugin settings panel, or show a text summary outside TUI |
| /stree config reload        | Reload safely; retain the previous effective settings on failure             |
| /stree config <key> [value] | Inspect or update an existing setting                                        |
| /stree help                 | Show command usage                                                           |

Settings panels are discovered over pi.events from actually loaded plugins. The Explorer's help panel links to settings with s.

### Core keys

- j/k or arrows: visible movement; H/Left and L/Right: logical parent/first child.
- gg/G: root/last; Tab: current leaf; Ctrl+d/u: half-page movement.
- ]b/[b: sibling branch; gp/gb/ge: branch parent/root/leaf; ]f/[f and ]l/[l: fork/leaf traversal.
- Space/l/h: toggle/expand/collapse; zR/zM: expand/collapse all; za/zs/zc: active/focused/sibling policy.
- /: Search. Printable j/k enter text; arrows/Ctrl+n/p move results. Enter accepts only; Esc cancels.
- Normal Esc clears search and temporary reveals; q closes. Preview/help Esc returns to the tree.
- Enter: native Navigate for a valid real entry, or expansion for an actual projected virtual summary.
- f/F: explicit Fork At/Fork Before. Fork Before is validated by the host-operation boundary.
- p: Preview; yi/yy: clipboard ID/content; m: edit a host label; r: refresh the coherent session snapshot.
- d/c: details/context-column visibility; D/C: depth metric/layout density; ?: effective Action help.
- In help/preview: Up/Down scroll lines, PageUp/PageDown or Ctrl+u/d page, Home/End reach first/last lines. These inspection-only Actions are remappable. The viewport reserves host footer space, keeps close hints visible when height permits, clamps on resize, and caches preview wrapping.

All 73 specified Actions remain in the catalog. The existing help-to-settings shortcut is cataloged as `view.settings`; six additional `view.scrollUp`, `view.scrollDown`, `view.pageUp`, `view.pageDown`, `view.firstLine` and `view.lastLine` Actions provide inspection scrolling (80 total). Unbound Actions can be assigned through keybindings. Effective help and footer hints use the same bindings; normal session Actions cannot run in Preview/help.

## Data and lifecycle

- Snapshot metadata is owned by this Explorer. Resolved bookmarks live in `TreeIndex.displayLabelsById`; raw native label-event payloads are preserved independently for inspection, copying and search. Metadata visibility controls label-event rows without dropping their descendants.
- Raw topology, IDs and message content are not rewritten by browsing. Selected Node, Focused Branch/path and actual Session Leaf remain distinct.
- Projection supplies logical relationships and explicit virtual anchors. Branch/Root traversal and sibling collapsing resolve those anchors before raw-tree lookup; focused branch/path IDs stay real even when selection is a virtual row. Raw destinations are reconciled back through the projection, not by rendering.
- Search owns debounce, indexed documents, reversible snapshots and result publication. Refresh/replacement/close invalidate obsolete work.
- Explicit session operations execute only after custom UI completes, revalidate the opened session/target and host safety, and preserve native cancellation/editor-restoration/fresh-context semantics.
- Display summaries are cached per content revision and thinking visibility; focus changes invalidate projection only when the effective fold policy uses focus. Search clear reuses the projection it requests.
- Context rendering uses cached/pending/unknown values; historical projections run through a bounded disposable queue. Selection changes do not masquerade as session revisions.
- Context metrics distinguish active host usage, canonical historical projection estimates and unknown values. Estimates remain marked; historical request usage is not summed as effective context size. Prompt/tools/extensions/provider changes may still affect the final payload.

## Configuration and view state

Configuration precedence is built-in defaults -> global agent-directory session-tree.json -> trusted-project .pi/session-tree.json -> runtime overrides. Nested fields merge; arrays replace. Invalid startup layers are ignored wholly with diagnostics. Failed reload/edits retain safe state.

Global edits persist the intended global layer rather than copying project/runtime overrides into it. Overlapping edits are serialized. TypeBox validation occurs before successful publication, and failed persistence is not reported as success.

Runtime wiring currently applies Vim/bindings, initial focus/branch wrap/focus following/reveal, display/type/depth/layout options, fold policy/manual-override restoration, search mode/scope/case/results/debounce, context visibility/model/estimate/cache options, native confirmation/summarization, and viewport/overscan options. The unresolved fields listed above and the remaining ticket criteria prevent full configuration acceptance.

Per-session view state lives under the host-resolved agent directory at state/session-tree/<session-id>.json, outside Session JSONL. It excludes search results/reveals/jobs. Loading validates the version, session identity and allowed value types and ignores stale entry IDs.

## Verification

Use the existing package-local development dependencies and scripts:

```sh
cd packages/pi-session-tree-explorer
npm run typecheck
npm run check
npm test
npm run smoke
```

Type checking, Biome, Vitest and isolated Pi usage are separate checks. The smoke script independently installs temporary offline dependencies and starts real Pi RPC to verify commands and native Navigate/Fork At/Before, replacement ownership and original history-file preservation. RPC does not verify the interactive Explorer or TUI editor restoration.

The remediation tests exercise input -> Actions -> search/projection/render, configuration failures, host-backed label ownership, cached/lazy metrics and controlled plugin assembly. Their mocked UI boundaries are not real terminal evidence. Fresh combined results, benchmark methods and remaining evidence belong in the follow-up ticket README; old helper-only benchmark numbers are not complete interaction-path guarantees.

## Permissions and risks

Extensions run with Pi's process privileges, not in a sandbox:

- Reads host session data, trusted configuration and per-session view files.
- Writes intended global configuration and isolated view files.
- Explicit labels/Navigate/Fork use native host APIs; Fork creates independent session files.
- Explicit clipboard Actions invoke clip.exe, pbcopy, wl-copy or xclip.
- Pure browsing/search/metrics do not issue model requests. Navigate defaults summarize=false; explicitly configuring navigateSummarize=true opts into native model/provider cost.

## Effective configuration: feature-owner matrix

Values flow from the layered `ConfigManager` through `SessionTreeComponent.applyConfiguration()`; they are not a second settings store.

| Schema group and fields                                                                                                                                                             | Runtime owner and observable behavior                                                                                                                                                                                                               | Regression evidence                                                                               |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `vimMode`, `keybindings`                                                                                                                                                            | Catalog + mode-qualified registry + dispatcher; remaps, prefix cancellation, Vim exposure and effective help share one authority.                                                                                                                   | `remediation-input.test.ts`, `keymap.test.ts`                                                     |
| `navigation`: initialFocus, focusFollowsSelection, autoRevealTarget, branchNavigationScope, branchWrap, skipHiddenNodes                                                             | Initial projection selection, Action selection transitions and projected targets; scope/wrap affect branch movement. skipHiddenNodes accepts only true.                                                                                             | `remediation-projection.test.ts`, `remediation-settings.test.ts`, `remediation-contracts.test.ts` |
| `display`: showAssistantNodes, showToolNodes, showThinkingNodes, showMetadataNodes, showCompactionNodes, depthMode, showDepth, layout, maxMessageLength, showNodeId, showTimestamps | Display projection owns visibility/depth; render owns bounded columns and compound root/current markers. Details/context view flags independently change output.                                                                                    | `remediation-settings.test.ts`, `remediation-projection.test.ts`, `responsive-view.test.ts`       |
| `fold`: mode, inactive branches, linear paths, maxExpandDepth, rememberManualOverrides                                                                                              | Projection + fold Actions; linear compression is an expandable summary with raw ownership. Expansion depth is bounded; manual-fold persistence is optional.                                                                                         | `remediation-contracts.test.ts`, `display.test.ts`, `view-state.test.ts`                          |
| `search`: mode, scope, case, hidden nodes, result limit, autoExpandMatches, preserveFoldState                                                                                       | SearchController owns query transitions, documents, temporary paths and restoration; search.ts matches/ranks. preserveFoldState accepts only true. Thinking and tool arguments are searchable.                                                      | `remediation-search.test.ts`, `remediation-plugin.test.ts`, `search.test.ts`                      |
| `context`: enabled, cacheSize, lazyEvaluation, estimateHistorical, showTokens, showPercentage, showModel, showEstimateMarker                                                        | Owned snapshot supplies live usage/model; MetricsController schedules selected/viewport/adjacent work before optional bounded prefetch. Revision cache and metrics rendering consume presentation flags. Disabling context schedules no estimation. | `remediation-snapshot.test.ts`, `remediation-metrics.test.ts`, `remediation-settings.test.ts`     |
| `session`: navigateSummarize, forkPosition, confirmFork, busyBehavior                                                                                                               | Post-UI session effects; Navigate defaults to summarize=false, with explicit configuration opt-in. Fixed f/F positions; only forkPosition=at is accepted. Wait is opt-in, confirmed/notified after close and revalidated.                           | `remediation-effects.test.ts`, `remediation-contracts.test.ts`, real RPC smoke                    |
| `performance`: searchDebounceMs, virtualRendering, renderOverscan                                                                                                                   | SearchController debounce, render windowing and metrics admission/overscan. No selection revision invalidates content metrics.                                                                                                                      | `remediation-search.test.ts`, `remediation-metrics.test.ts`, `remediation-benchmark.test.ts`      |

Unsupported conflicting values (`forkPosition=before`, `skipHiddenNodes=false`, `preserveFoldState=false`) produce validation diagnostics; remove/reset them instead of relying on an ignored option. All accepted values remain subject to Spec 0008 safety constraints. The estimate display always retains an approximate indicator.

Run the combined synthetic workload with `npm test -- tests/remediation-benchmark.test.ts --reporter=verbose`. It reports target comparisons; Vitest success alone does not mean timing targets were met (the deterministic complexity regression guards the eliminated quadratic search path). Optional `STREE_BENCH_REPORT` writes machine-readable evidence. The 15-second test-runner allowance does not change any interaction target. Search uses zero debounce and Enter flush. Both modeled and assembled command-handler/real SessionManager first-open paths are measured at an injected TUI boundary; ready-event queued movement includes pending canonical-estimate timers. None measures physical keyboard/terminal paint or proves native editor behavior.

For local CPU attribution, set `STREE_PROFILE_DIR` to an existing writable directory when running the remediation benchmark; it writes branch/search `.cpuprofile` files using an in-process Node inspector session (no listening socket). Profiling runs are diagnostic, not timing-acceptance evidence. The RPC smoke uses `pi` from PATH; `PI_BINARY` can select an already-installed executable.
