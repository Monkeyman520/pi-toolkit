# Enhanced Session Tree Explorer

**Spec ID:** 0008
**Status:** Ready for ticket execution; implementation not started
**Date:** 2026-11-09
**Endpoint:** Spec -> ticket set; no implementation or separate implementation-plan stage
**Tickets:** [0005 Enhanced Session Tree Explorer](../ticket/0005-enhanced-session-tree-explorer/README.md)

## Sources and precedence

- **U1:** The user's supplied "Enhanced Session Tree Explorer", version 1.0, sections 1-20, in the refinement conversation. This document preserves its requirements in English; the illustrative UI numbers and reference file layout are not measured results or mandatory file-per-module boundaries.
- **U2:** The user's first clarification: full v1.0 is the final acceptance scope; P0/P1/P2 determine delivery order, not feature removal. In Search mode, j/k enter text, arrows and Ctrl+n/p select results. The authorized endpoint is C: English Spec -> Ticket Set.
- **U3:** The user's subsequent "adopt" accepts all four clarification groups: search cancellation/acceptance/clearing, traversal order/search scopes, intersecting filters, and configuration failure/merge/trust behavior. The settled contract is reproduced below.
- **R1:** [Package development reference](../../packages/README.md), [project context](../CONTEXT.md), [ADR 0001](../adr/0001-independently-installable-pi-packages.md), [ADR 0002](../adr/0002-typescript-esm-plugin-development-stack.md).
- **R2:** [ADR 0004](../adr/0004-unified-command-grammar-and-dynamic-tui-configuration.md) and [ADR 0005](../adr/0005-versioned-plugin-support-library.md). ADR 0005 supersedes only ADR 0004's blanket shared-code restriction.
- **H1:** Installed Pi 1.5.0 package metadata and its bundled docs/extensions.md, docs/session-format.md, docs/security.md; matching local 1.5.0 public declarations in pi-coding-agent's dist/core/extensions/types.d.ts, dist/core/session-manager.d.ts and dist/index.d.ts. Host implementation inspection confirms Navigate's user/custom-message editor-restoration behavior. These are documentation/type/source evidence, not Explorer runtime evidence.
- Official reference entry points: [extensions](https://pi.dev/docs/latest/extensions), [packages](https://pi.dev/docs/latest/packages), [session format](https://pi.dev/docs/latest/session-format), [security](https://pi.dev/docs/latest/security). Online latest may differ; the installed supported version's contracts prevail.

U2/U3 resolve the conflicts in U1. Repository constraints remain binding. Do not treat the "Implementation Ready" label in U1 as a claim that code, performance, platform behavior, or host loading has been verified.

## Intent and scope

Provide an independently installable, configurable Pi TUI Extension for browsing the entire current session tree, efficiently finding historical work, and explicitly navigating or creating an independent session. Prefer a standalone /stree command; retain native /tree as an unaffected fallback.

All Action tables, filtering/search, safe Navigate/Fork At/Fork Before, context/depth display, configuration, responsive UI, state persistence and large-session protection below belong to final v1.0 acceptance. Intermediate slices may be incomplete but must not claim v1.0 completion. Suggested delivery priorities do not remove advanced actions, multiple-root safety or persistence.

No database, background service, alternate session store, session-format change or host patch is required.

## Requirements

### R01 - Package and host integration [U1 §§12-13, U2, R1-R2, H1]

- Own the extension under packages/<plugin-name>/, with package.json, tsconfig.json, README.md and extensions/index.ts. The working package name is pi-session-tree-explorer; it is not a reserved npm publication identity.
- TypeScript ESM, erasable syntax, Node.js >= 22.19.0, TypeBox through typebox, Biome, Vitest and tsc --noEmit. No bundler or emitted build prerequisite.
- Used Pi SDKs and typebox are host-provided "*" peers; declare other runtime dependencies. Do not import sibling plugin sources or require incidental checkout dependencies.
- Expose only this package's actual resources through conventional discovery or an explicit Pi manifest. A versioned ordinary support-library dependency is permitted, not mandated; it cannot share mutable runtime ownership or activate other plugins.
- /stree without arguments opens the primary Explorer in TUI mode. Preserve the collection's /<extension> <action> [other-args] grammar for command operations, including /stree config and context-aware multi-token argument completions. /stree config opens an interactive settings panel with live state and persistence; link it from the Explorer. Non-TUI use must give a text response rather than attempting custom TUI.
- Participate in installed-only configuration-panel discovery over pi.events per ADR 0004/0005. Never display settings for uninstalled plugins or override native /tree.
- Use ctx.ui.custom() and the installed Component interface; close with the host-supported completion mechanism. UI input must not perform session replacement directly.
- Compatibility documentation states the APIs required and the versions/platforms actually tested, not universal support inferred from "*" peers.

### R02 - Raw topology and safe indexing [U1 §§3,5,12,16, U3]

A Raw Entry is a real Pi entry with id and parentId. The SessionHeader is metadata, not a tree node. Index every entry type, not only messages. A Display Node is either a projected real entry or a virtual structural summary; never confuse its ID with a valid session-operation target.

Build read-only entry/parent/ordered-child maps, raw/turn/branch depths, fork/leaf sets and preorder IDs. Aim for O(N) construction, not repeated whole-tree scans per move. Sibling order follows session entry order. Preorder means parent before descendants with those ordered children.

- Raw depth: original parent-edge count from a root.
- Turn depth: number of user messages along the root-to-entry path (a user root counts as a user message). The illustrated synthetic Root has depth zero.
- Branch depth: number of fork transitions along the raw path, as in U1's example.
- Compute from original topology, not screen indentation or filtered rows.
- Branch lookup uses raw children and the nearest ancestor fork. Filtering must not invent or remove a raw fork.
- Multiple roots are separate branch-navigation domains. A search scoped to all entries can find other roots.
- Missing parents, duplicate/invalid relationships and cycles must produce bounded safe degradation, not infinite traversal or a crashed Explorer. Never repair or rewrite the session file as part of browsing.

### R03 - Separate state, projection and mutation [U1 §§1,3,6,12-13]

Keep Selected Node, Focused Branch/path and the host-managed Session Leaf separate. A leaf ID may be null or currently hidden. Track mode, query, scroll, manual expansion/collapse overrides and display options without changing host state.

- Raw entry IDs, real parentId and message content remain unchanged by projection.
- Filtering reconnects a real row to its nearest logical visible ancestor. Logical node parent/child/sibling navigation follows this projected hierarchy.
- Folded subtrees have virtual summary rows with an anchorEntryId, descendant count and fork count. Their IDs are not Raw Entry IDs. Compound states (selected, active, labeled, hit) can coexist.
- Enter on a virtual summary expands it; it never navigates. Fork/Fork Before require an explicit real entry; ask the user to enter/expand the branch rather than guessing a target.
- A hidden target branch is resolved first in raw topology, then to the nearest displayable target in that branch or a structural summary. Reveal necessary paths for explicit target jumps.
- Ordinary movement/search/folding/filter changes cannot resetLeaf, append custom entries, change raw parent links, send a model request or mutate the session. Explicit label editing is a separate mutating Session Action, not pure browsing.
- Selection-only changes reuse the TreeIndex. Session revisions invalidate dependent projections, searches and context work; old asynchronous work cannot overwrite a newer revision.

### R04 - Navigation and Action inventory [U1 §§4-5, U3]

Use one Action registry with stable domain.action IDs, descriptions, default keys, permitted modes, optional enabled predicate and execution. Key handling dispatches Actions rather than duplicating business behavior. Every action below must be reachable through a configured binding or the Explorer action/help surface even when no default binding is prescribed. No legal target means retain the current selection.

#### Node Actions

| ID | Outcome | Default normal-mode key(s) |
| --- | --- | --- |
| node.next | Next visible row | j, down |
| node.prev | Previous visible row | k, up |
| node.parent | Nearest logical visible parent | H |
| node.firstChild | First logical child | L |
| node.lastChild | Last logical child | gL |
| node.nextSibling | Next logical sibling | ]s |
| node.prevSibling | Previous logical sibling | [s |
| node.firstSibling | First logical sibling | gs |
| node.root | Root of the current tree | gg |
| node.last | Last visible row | G |
| node.current | Reveal/select the real Session Leaf | tab |
| node.pageDown | Move down half a viewport | ctrl+d |
| node.pageUp | Move up half a viewport | ctrl+u |
| node.nextLabel | Next labeled node in current visible order | ]m |
| node.prevLabel | Previous labeled node in current visible order | [m |
| node.nextUser | Next user node in current visible order | ]u |
| node.prevUser | Previous user node in current visible order | [u |

#### Branch Actions

| ID | Outcome | Default normal-mode key |
| --- | --- | --- |
| branch.next | Next sibling branch at nearest fork | ]b |
| branch.prev | Previous sibling branch at nearest fork | [b |
| branch.parent | Nearest fork defining the current branch | gp |
| branch.root | That branch's starting child | gb |
| branch.leaf | Preferred leaf of that branch | ge |
| branch.first | First branch at the same fork | g[ |
| branch.last | Last branch at the same fork | g] |
| branch.nextFork | Next raw fork in current Root's preorder | ]f |
| branch.prevFork | Previous raw fork in current Root's preorder | [f |
| branch.active | Focus/reveal the actual active branch | ga |
| branch.nextLeaf | Next leaf within the branch's leaf set, in raw preorder | ]l |
| branch.prevLeaf | Previous leaf within that set, in raw preorder | [l |
| branch.cycle | Explicit cyclic sibling-branch switch | User binding |

Fork/leaf traversal is confined to the current Root, uses raw preorder, and reveals targets when necessary. Leaf traversal retains U1's current-branch subtree scope inside that Root. Default branchWrap=false means non-cyclic next/previous actions stop at boundaries; branch.cycle is the explicitly cyclic action.

Nearest-fork examples are normative: A has B1 -> C1 -> D1, B2 -> C2 -> D2, and B3 -> C3. From D1, node.parent -> C1, node.nextSibling -> unchanged, branch.parent -> A, branch.root -> B1, branch.next -> B2, branch.prev -> unchanged, branch.leaf -> D1. From C2, branch.next -> B3, branch.prev -> B1 and branch.leaf -> D2.

A selected fork is located relative to its own ancestors, not automatically entered through one of its children. A nested fork takes precedence over an outer one; reaching the nearest fork's last branch does not continue to an outer fork. Hidden/collapsed targets preserve the raw choice. Different Roots do not become sibling branches.

A branch can have multiple leaves. branch.leaf prefers a leaf on its focused path, then its most recently visited leaf, then its last leaf in original session order. Do not unconditionally choose DFS's final node. branch.nextLeaf/prevLeaf enumerate the branch's leaves deterministically.

### R05 - Folding and composable filters [U1 §§4,6, U3]

| ID | Outcome | Default normal-mode key |
| --- | --- | --- |
| fold.toggle | Toggle selected subtree | space |
| fold.expand | Expand selected subtree | l |
| fold.collapse | Collapse selected subtree | h |
| fold.expandAll | Expand all | zR |
| fold.collapseAll | Collapse all | zM |
| fold.activeOnly | Expand only the actual active path | za |
| fold.focusedOnly | Expand only the focused path | zs |
| fold.collapseSiblings | Collapse other sibling branches | zc |
| fold.increaseDepth | Increase global expansion depth | z+ |
| fold.decreaseDepth | Decrease it | z- |
| fold.restoreDefault | Restore configured fold policy | zr |

Support all, focused-only, active-only, depth-limited and manual fold modes. Initially focus the active path; collapse non-focused branches. Branch actions update focus under the default focusFollowsSelection=branch-actions policy; j/k alone must not repeatedly refold the tree. Manual expansion can override policy. When enabled, linear-path compression changes display only, preserving raw depth, IDs and navigation identity.

Precedence: search temporary reveal > manual overrides > configured branch policy > default fold state. Removing a temporary reveal restores the underlying state rather than erasing manual overrides.

| ID | Outcome |
| --- | --- |
| filter.toggleAssistant | Toggle assistant-node visibility |
| filter.toggleTools | Toggle tool-result visibility |
| filter.toggleThinking | Toggle thinking-content visibility |
| filter.toggleMetadata | Toggle metadata-node visibility |
| filter.userOnly | Toggle user-only constraint |
| filter.branchOnly | Toggle branch-summary/fork-point constraint |
| filter.labeledOnly | Toggle labeled-only constraint |
| filter.reset | Restore configured filtering defaults |

Type toggles control entry visibility; userOnly, branchOnly and labeledOnly are independent intersecting constraints, not mutually exclusive presets. Thinking is message content, not a fabricated Raw Entry. Necessary structural summaries survive message-type filters. An unsatisfiable combination produces an empty-result state, not silently broadened filters. Hidden entries remain indexed and available to all-entry search and context projection. Default assistant/tool/thinking/metadata visibility is off; compaction visibility is on.

### R06 - Modes and configurable key parsing [U1 §§4,10, U2]

Modes are normal, search, preview and help. Open in normal mode. Support Vim single keys, modifier keys, multi-key sequences (gg, ]b, zM), alternative bindings and non-Vim arrow-based use. Pi's global keybindings.json is not assumed to implement multi-key sequences.

- Use mode-aware prefix state with a timeout: complete unambiguous binding executes once; a complete binding that is also a prefix waits for disambiguation/timeout; incomplete prefixes time out and reset.
- Detect identical bindings, invalid key descriptions and conflicting mode-local assignments; report actionable configuration diagnostics rather than firing two Actions.
- User binding arrays override each action's default array. Alternative keys must share the same Action behavior.
- Printable search input, including j/k, edits the query and never triggers normal-mode actions. Arrows and Ctrl+n/p move results. Enter accepts the result only.
- Help shows effective bindings, mode and disabled/unavailable actions. Prefix/mode transitions cannot leak an old command into another mode.

### R07 - Search over raw history [U1 §§4,7, U2-U3]

| ID | Outcome | Default key |
| --- | --- | --- |
| search.open | Enter search mode | / in normal |
| search.next | Next match | n in normal |
| search.prev | Previous match | N in normal |
| search.clear | Clear query and search reveals | esc in normal |
| search.accept | Select result and leave Search, without Navigate | enter in search |
| search.toggleRegex | Toggle regex search | User binding |
| search.toggleScope | Toggle all entries / focused-branch subtree | User binding |

Fuzzy search is default; support exact-string and regex modes with case-sensitivity control. Search message text (including full text rather than truncated row text), tool names, labels, entry IDs and time information. Search all Raw Entries including hidden/collapsed entries by default; the other scope is the focused branch's raw subtree.

Rank by text match with exact-label and title/summary-prefix preference, modest recency and focused-branch boosts. Equal scores use original session order. Fixed first-version ranking weights are acceptable; a weight-configuration framework is not required.

- Entering Search snapshots the previous selection, folds and query.
- Esc while searching cancels this attempt and restores that snapshot, including its prior query.
- Enter while searching accepts the selected result, retains the query and temporary reveal of its real ancestor path, then enters normal mode. A second Enter is needed for Navigate.
- Esc in normal mode clears query and temporary reveals. If selection becomes hidden, select its nearest visible ancestor.
- A hidden assistant hit is temporarily displayed as that real entry and permits Preview/Navigate. Do not persistently enable showAssistantNodes.
- Reveals cannot permanently erase fold/manual settings. Cancellation restores the pre-search state; accepted reveals persist until cleared.
- Build a lightweight search index on opening, with long text accessed as needed. Debounce continuous input; cancellation or version checks prevent stale results replacing newer queries/session revisions. Keep TUI input responsive and bound results.

### R08 - Content inspection and explicit metadata actions [U1 §§4,7,9]

| ID | Outcome | Default normal-mode key |
| --- | --- | --- |
| session.preview | Preview full selected-node content | p |
| session.copyId | Copy real Entry ID | yi |
| session.copyContent | Copy node text | yy |
| session.setLabel | Set/edit a real entry's Label | m |
| session.refresh | Refresh host data | r |
| session.close | Close without session change | q |

Preview must expose content hidden by single-line truncation without modifying history. Labels/bookmarks are real host labels, visible in navigation/search and markers; editing them is an explicit host mutation using the installed label API. Copy operations report unavailable clipboard/failure rather than pretending success. Virtual summaries cannot impersonate a Raw Entry for label or ID operations. Refresh handles stale entry IDs and session changes safely.

### R09 - Explicit, lifecycle-safe Session operations [U1 §§9,13,16, H1]

| ID | Outcome | Default normal-mode key |
| --- | --- | --- |
| session.navigate | Navigate within the current session | enter |
| session.fork | Fork including the selected real entry | f |
| session.forkBefore | Fork before an appropriate user entry; restore its prompt | F |

TUI returns an intent (close, navigate(entryId), fork(entryId, position)). After closing custom UI, the command handler revalidates target/session identity and safety, then calls the public command-context API. Serialize session mutations; do not move complex replacement work into the view reducer/input handler.

- Navigate uses ctx.navigateTree(entryId, { summarize: configuredValue }); default summarize=false, avoiding silent extra model charges. It keeps the session file and follows native semantics, not a promise that the resulting leaf always equals selected ID.
- In Pi 1.5.0, Navigate to user or custom-message entries restores editor text and uses their parent as the resulting leaf; other targets ordinarily use the target. Validate the supported host behavior and reflect it honestly.
- Fork At uses ctx.fork(entryId, { position: "at" }); create an independent session through that entry, including it, without restoring an editor prompt.
- Fork Before uses position="before" only for suitable user-message targets; omit the selected user prompt from the retained path and restore it for editing. Fork is not another branch in the original session. U1's test term "Fork After" means inclusive Fork At, not a third API position.
- Do not auto-send a model request after a fork. Honor configured confirmation. Browse/close/cancel cannot silently fork or navigate.
- During responses, compaction or other navigation/mutation conflicts, browsing remains usable where the host permits it; unsafe session actions reject with a useful message by default. Host API rejection remains authoritative even after an idle check.
- Waiting, if provided, must be explicitly accepted and visibly indicated; never silently waitForIdle while blocking the Explorer. No queue/wait feature is required merely by the default reject policy.
- On successful replacement discard old sessionManager, Pi/context references, listeners/tasks/caches and bind to the fresh session lifecycle. A withSession callback uses only its replacement ctx; captured old objects are not safe.
- Handle missing entries (notify/refresh), ineligible targets, busy rejection, extension cancellation and API exceptions separately. Cancellation/failure retains the original session/leaf as guaranteed by the host; never claim success before confirmation. User content in the editor is not automatically submitted.

### R10 - Honest depth and Context metrics [U1 §§3,8, H1]

Default row metric is effective model-visible context tokens / the applicable model's context window, not cumulative historical token consumption. Historical input/output/cost totals may appear separately in details and must be named distinctly.

A ContextMetrics result carries entryId, nullable tokens/contextWindow/percentage, optional modelId, source active-context | projection-estimate | unknown, and estimated. Null is unknown, never zero. Percentage is unknown if its inputs are unknown.

- For the active entry use ctx.getContextUsage() when available. That host API itself reports an estimate based on assistant usage plus trailing estimates and may report null; active-context does not automatically mean exact.
- Historical entries use a read-only ancestor-path projection. Pi 1.5.0 publicly exports buildSessionProjection(entries, leafId) and buildSessionContext(entries, leafId); prefer these canonical helpers to duplicated semantics.
- Apply the relevant latest compaction, firstKeptEntryId, summary, retained range and system-prompt/tool checkpoint. Preserve branch summaries. Apply only the path's effective context edits, with latest applicable edit winning. Other branch edits cannot leak into the estimate.
- Resolve model identity/window from that historical path, accounting for model changes and selected versus answering model where relevant. Unknown/unreliable restoration remains unknown; do not silently use today's active model window for old entries.
- Estimate model-visible messages; do not sum all ancestor usage, temporarily reset the host leaf, mutate context, or issue a model request per node.
- Distinguish a known usage baseline, a projection estimate (~ or equivalent estimate marker), and unknown (—). An observed earlier request's usage is not an exact future request size.
- Current/extension prompt changes, tools, context hooks and provider rewrites may change the final payload; disclose these limitations. Estimation failure produces unknown/error detail, not a confident fabricated value.
- Cache by session ID, revision, entry ID, model identity and projection version, with bounded LRU capacity. Compute selected node first, then viewport, then adjacent entries; do not evaluate every hidden descendant of a collapsed subtree.
- Cancel/version-gate obsolete work and invalidate on relevant session/model/projection changes and replacement. Rendering must not wait for estimates.

### R11 - Responsive TUI and view controls [U1 §§2,4,10,14]

| ID | Outcome |
| --- | --- |
| view.toggleDetails | Show/hide detail region |
| view.toggleContext | Show/hide context columns |
| view.cycleDepthMode | Cycle raw / turn / branch depth |
| view.cycleLayout | Cycle display density |
| view.help | Show effective shortcut help |
| view.toggleVim | Enable/disable Vim input |
| view.reloadConfig | Reload configuration safely |
| view.reset | Restore view defaults |

Show session identity, entry/branch counts, mode, search field, tree viewport, selected-node details and contextual action hints. Details include real ID, selected depth, branch position and context provenance where available.

Markers support Root (●), ordinary (◇), selection (◆), current leaf (◉), folded/expanded (▸/▾), labeled (★), estimated (~ or ≈) and unknown (—), with theme colors/priority so compound state is not lost.

Width >=120 columns supports node, depth, tokens, percentage and model; 80-119 supports node/depth/tokens/percentage; <80 keeps node/depth and moves Context into details. Respect showModel and other visibility settings. Single-line truncation uses terminal display width, preserving tree connectors/alignment for long and wide Unicode text. Preview supplies full text. An empty/filtered/malformed tree still permits configuration, refresh and exit.

### R12 - Independent per-session View State [U1 §15]

Persist view-state overrides, last filters, last focus, manual folds/expansions, density and depth mode outside Session JSONL, isolated by session ID, for example under the Pi agent directory's state/session-tree/<session-id>.json.

Do not persist search results/reveals, running commands, stale estimation jobs or agent-busy status. Ignore stale entry IDs when restoring; a different or replacement session cannot inherit old ownership/caches. Do not flood CustomEntry records with view state. Effective configuration precedence in R13 still applies.

### R13 - Validated layered configuration [U1 §§10-11,15, U3, R2, H1]

Provide the Extension-owned session-tree.json and session-tree.schema.json, not a claim that Pi natively loads them.

Layers: built-in defaults -> global agent-directory session-tree.json -> trusted project's .pi/session-tree.json -> runtime overrides. Honor the host's resolved agent-directory conventions rather than assuming the default home path. Nested objects merge field by field; arrays replace wholesale, including an action's binding array.

- Validate every configuration value with a TypeBox-backed schema; errors identify the exact field location. Type/keymap diagnostics must not trigger duplicate actions.
- At startup, ignore an invalid layer as a whole and report it; other valid layers continue. A failed reload retains the last valid effective configuration rather than partially applying changes.
- Do not load untrusted project configuration; use the supported trust API (isProjectTrusted in Pi 1.5.0). No configuration executes code or injects executable callbacks.
- Interactive configuration follows R01's settings/completion/discovery contract and persists intended user configuration without turning temporary search state into defaults.
- Reference defaults below are normative U1 nested defaults. Earlier flat illustrative snippets describe concepts, not a second competing configuration format.

| Group | Defaults |
| --- | --- |
| top level | vimMode=true |
| navigation | initialFocus=active; branchNavigationScope=nearest-fork; branchWrap=false; focusFollowsSelection=branch-actions; autoRevealTarget=true; skipHiddenNodes=true |
| display | showAssistantNodes=false; showToolNodes=false; showThinkingNodes=false; showMetadataNodes=false; showCompactionNodes=true; depthMode=turn; showDepth=true; maxMessageLength=80; showNodeId=false; showTimestamps=false; layout=normal |
| fold | mode=focused-only; collapseInactiveBranches=true; collapseLinearPaths=false; rememberManualOverrides=true; maxExpandDepth=0 |
| search | mode=fuzzy; scope=all; includeHiddenNodes=true; autoExpandMatches=true; preserveFoldState=true; caseSensitive=false; maxResults=100 |
| context | enabled=true; showTokens=true; showPercentage=true; showModel=false; estimateHistorical=true; showEstimateMarker=true; lazyEvaluation=true; cacheSize=512 |
| session | forkPosition=at; navigateSummarize=false; confirmFork=false; busyBehavior=reject |
| performance | virtualRendering=true; renderOverscan=20; searchDebounceMs=40 |
| keybindings | Defaults in R04-R09, with per-action array overrides |

maxExpandDepth=0 has no limiting effect while the default focused-only policy is active; it is not a claim that the default Explorer must hide its whole focused path. branchNavigationScope has the settled nearest-fork behavior; speculative global-branch traversal is excluded below. Values/settings must not override safety invariants: hiding an estimate marker cannot misrepresent an estimate as exact; disabling lazy evaluation cannot make rendering await all context work; binding changes cannot enable session actions while unsafe.

### R14 - Large-session responsiveness [U1 §§7-8,12,14,16, U2]

Use a cached raw index, viewport rendering plus overscan, affected-view recomputation, bounded search results and lazy/cancellable context work. Large-session safeguards avoid full-tree context precomputation, bound concurrent estimates, allow staged search and keep refresh/exit usable. Session changes and continuous input cannot publish obsolete results.

The following are benchmark targets, not already measured guarantees:

| Workload | Target |
| --- | --- |
| 5,000-entry index build | P95 <200ms |
| 5,000-entry up/down movement | P95 <16ms |
| Branch jump | P95 <20ms |
| Search input feedback | P95 <100ms |
| 10,000-entry first open | P95 <500ms |
| Context cache hit | P95 <5ms |

Record hardware/OS, terminal, Node/Bun version, dataset bytes and topology, workload and sampling method. Final acceptance requires measured results meeting targets or explicit documented deviations, as U1's DoD allows; never silently lower a target or claim platform results without evidence.

### R15 - Verification and documentation [U1 §§16-18, R1]

Each package must pass separate no-emit type checking, Biome and non-empty Vitest checks, plus actual isolated Pi loading/usage evidence. Tests cover Actions, state, projection and effects, not just manifests.

- Index fixtures: one/many roots, chains, wide/nested forks, missing parents, cycles/invalid links and large trees.
- Branch fixtures: all normative D1/C2 outcomes, boundaries, nested forks, hidden/collapsed targets, focused/recent/fallback leaves and browse-only leaf invariance.
- Fold/filter/search fixtures: all modes, manual precedence, cancellation rollback, accepted reveal/clear, hidden full-text hits, intersecting filters/empty states, scope, stable ranking, version cancellation.
- Keymap fixtures: single/modifier/multi-key inputs, ambiguous prefixes/timeouts, duplicate/invalid bindings, user overrides, mode changes, j/k search text and no duplicate firing.
- Context fixtures: ordinary paths, multiple compactions and retain boundaries, system checkpoints/tools, context edits, branch summaries, model changes, unknown model/window/usage, failures and invalidation/replacement.
- Host integration: /stree open/close, current leaf, pure browsing without session writes, native Navigate/editor restoration, Fork At/Before independent files, original session preservation, cancelled/failed/busy actions, fresh-context replacement and restart restoration.
- Dataset sizes: 100, 1,000, 5,000 and 20,000 entries, plus the 10,000 first-open target. Vary linear/wide/deep topology, assistant/tool density, compactions, long text and labels.
- Verify basic real keyboard behavior in Windows Terminal, WSL and a common Unix terminal; mocks or Windows-only testing do not establish all three.
- Document actual install/development/check/smoke commands, schema and example config, actions, compatibility, permissions and verified limitations. Extensions have full Pi-process privileges; disclose session reads, config/state writes, explicit label/navigation/fork effects and clipboard access. No hidden model/network cost is permitted.
- Supply CI quality gates for the package's actual checks and clearly separate controlled host/runtime evidence from unsupported provider/platform claims. Rerun API/session/context/input regression checks after Pi upgrades.

## Solution and necessary seams

Use Extension-first + Action-driven + Raw Tree / View Projection separation. Logical responsibilities are adapter, index/projection, Explorer state, Action registry, key parser, search, context metrics/cache, configuration/view-state and custom TUI. Small files may be combined; U1's reference file tree is not a mandatory abstraction count.

| Seam | Connects | Expects | Guarantees |
| --- | --- | --- | --- |
| Session snapshot | Readonly host session -> index/search/projection | Complete entries, ID, current leaf, revision/model identity | Original relationships and immutable browse input; no host mutation |
| Raw/view projection | Index + state -> navigation/renderer | Filters, logical ancestry, manual/policy/search folds | Stable real/virtual identity; no invented raw parents |
| Action dispatch | Key parser/action surface -> state/effects | Mode-qualified Action ID and current state | One action per resolution, enabled checks and pure browse transitions |
| Search reveal | Raw search -> view state | Ranked real entry + matching query/session version | Temporary path exposure and reversible state, separate from Navigate |
| Context metrics | Canonical projection/model resolver -> viewport/details | Entry/model/revision and cancellation identity | Estimate/unknown provenance, branch-correct read-only result |
| Session intent | Custom TUI -> command handler -> host | Closed UI, real target, current identity and safety | Explicit validated operation; cancellation/errors honest |
| Replacement lifecycle | Host shutdown/start/withSession -> package resources | Fresh context and session identity | Old references/tasks/caches cannot write into replacement |
| Settings and persistence | Validated layers + runtime TUI -> owned files/view state | Trust, schema, session isolation and ADR discovery | Safe failure policy, independent ownership, no session-history pollution |

## Representative end-to-end acceptance

### E01 - Browse and distinguish sibling versus branch [R02-R06,R09]
- **Given:** The A/B1/B2/B3 fixture, active D1 and default filters.
- **When:** Open /stree, move/select D1, use node.parent, return, use node.nextSibling, then branch.next.
- **Then:** Targets are C1, unchanged D1 and B2 respectively; focus updates only under the configured branch behavior. Session Leaf and session-file contents remain unchanged throughout browsing.

### E02 - Cancel, accept and clear a hidden full-text result [R03,R05-R08]
- **Given:** A collapsed branch, hidden assistant entry, prior query and manual folds.
- **When:** Search for text beyond the row-summary truncation, type j/k, cancel; repeat and accept; Preview; press normal Esc.
- **Then:** j/k are query text; cancellation restores the exact prior query/selection/folds. Acceptance selects/reveals the real hidden hit but does not Navigate. Preview shows full content. Clear restores underlying folds/filters and falls back to the nearest visible ancestor if the selected hit becomes hidden.

### E03 - Inclusive versus before-prompt fork [R08-R09]
- **Given:** A saved original session, eligible user entry and idle host.
- **When:** Invoke Fork At and, in a separate run, Fork Before.
- **Then:** Each produces a distinct independent session; At retains the entry without editor restoration, Before omits/restores that user prompt. Original history remains intact, no automatic model turn occurs, and replacement operation uses only fresh context. Cancelled or rejected cases do not falsely report success.

### E04 - Native Navigate and busy rejection [R09]
- **Given:** An eligible real entry and a session operation conflict.
- **When:** Request Navigate while busy, then retry after safe completion with summarization off.
- **Then:** Busy rejection leaves the branch intact and is explained. Successful retry uses the same session file and native leaf/editor semantics; no implicit summarization model charge occurs.

### E05 - Branch-correct historical context [R02,R10]
- **Given:** Paths with model changes, compaction checkpoints, retained boundaries, branch summaries and diverging context edits.
- **When:** Select historical nodes rapidly, then inspect an entry whose model window is unavailable.
- **Then:** Context follows only each node's applicable projection; stale results do not overwrite new selection. Missing values are unknown, estimates are marked, and no host leaf reset, model request or raw-history change occurs.

### E06 - Layer failure, trust and restart [R01,R12-R13]
- **Given:** Valid global configuration, malformed or untrusted project configuration and saved session-specific view state.
- **When:** Open, edit settings through /stree config, attempt invalid reload and restart.
- **Then:** Invalid startup layers are wholly ignored with field diagnostics; untrusted files are not loaded. Reload preserves last valid settings. Valid persisted view state returns, stale IDs are ignored, search tasks/reveals are not resurrected, and no uninstalled plugin panel appears.

### E07 - Complete v1.0 evidence [R01-R15]
- **Given:** The final extension, isolated dependency setup and generated datasets.
- **When:** Run each documented check, actual Pi usage, platform keyboard checks and benchmarks.
- **Then:** Evidence distinguishes passing automated checks, actual runtime/platform observations and documented performance deviations; all required actions/configuration/UI surfaces are reachable and no feature is dropped because it was P2.

## Decisions, limitations and recording status

- Full v1.0 scope with ordered intermediate delivery: U2. Search and filter/config clarifications: U3. No unconfirmed product assumptions are used to fill these contracts.
- Independent package/stack: R1. Command grammar, interactive settings, completions and installed-only discovery: R2. These apply in addition to U1, not as permission to replace /tree.
- Pi 1.5.0 is the inspected API baseline, not a universal minimum-version assertion or tested compatibility result. Verify final APIs in the installation used for execution.
- Exact prefix-timeout duration, scoring weights, cache internals, density cosmetics, numeric validation bounds beyond supplied values and helper file decomposition remain reversible implementation details; they must satisfy the specified outcomes.
- **Pending knowledge persistence:** The user authorized Spec/ticket writes, not CONTEXT/ADR writes. Candidate domain knowledge: Raw Entry/Display Node/Branch/Fork Point and separated Selected/Focused/Leaf concepts. Candidate architectural decisions: Extension-first, read-only projection, Action dispatch and explicit session-effect separation. They are captured here as task requirements, not recorded as project-wide knowledge. Resume grimoire-record only after explicit authorization; this pending authorization does not block the selected artifact endpoint.
- No code, runtime QA, staging, commit, host patch or separate implementation plan is authorized by this refinement output.

## Out of scope and future triggers [U1 §§1,5,13,20]

No session JSONL redesign; merging independent histories; deleting/rewriting historical nodes; model context-construction changes; device sync; model requests per historical node; Git GUI; database/background service or additional tree store. Pure view-state persistence cannot append session-history noise.

Native /tree replacement/integration, upstream TreeList reuse/public Action hooks, and branch.nextGlobal/branch.prevGlobal are future options, not v1.0 requirements. Consider native integration only after extension usage/performance evidence; do not presume an extension can safely override a built-in command. External publication is not authorized.

## Artifact handoff

Execute the linked ticket set against R01-R15, preserving U2/U3 and the host/repository boundaries. Ticket decomposition may organize, sequence and test these outcomes but cannot invent requirements or broaden permissions. Return new material semantic gaps to clarification. Spec/ticket authoring is complete only after source/coverage/link/dependency readback; implementation completion requires R15 evidence. The next user-invoked execution workflow is grimoire-loop, not automatically started here.
