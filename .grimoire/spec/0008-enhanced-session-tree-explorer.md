# Enhanced Session Tree Explorer

**Spec ID:** 0008
**Status:** Approved - Evolution v2.0 (Interactive Session Explorer for Coding Agents)
**Date:** 2026-11-13
**Endpoint:** Spec -> ticket set; no implementation or separate implementation-plan stage
**Tickets:** [0007 Interactive Session Explorer](../ticket/0007-interactive-session-explorer/README.md)

## Sources and precedence

- **U1:** The user's supplied "Enhanced Session Tree Explorer", version 1.0, sections 1-20, in the refinement conversation.
- **U2:** The user's first clarification: full v1.0 is the final acceptance scope; P0/P1/P2 determine delivery order, not feature removal. In Search mode, j/k enter text, arrows and Ctrl+n/p select results. The authorized endpoint is C: English Spec -> Ticket Set.
- **U3:** The user's subsequent "adopt" accepts all four clarification groups: search cancellation/acceptance/clearing, traversal order/search scopes, intersecting filters, and configuration failure/merge/trust behavior.
- **U4:** In the remediation conversation, the user approved amending this specification: preserve fixed f/F, visible-only node navigation and reversible fold semantics; reject conflicting non-default settings with diagnostics; compress linear paths into expandable virtual summaries; support busyBehavior=wait only with explicit confirmation and visible waiting after the Explorer closes.
- **U5:** The user's v2.0 refinement proposal: upgrade `pi-session-tree-explorer` to an **Interactive Session Explorer for Coding Agents**, addressing discoverability (complete branch reachability), comprehensibility (Outline + Preview layout, Tool call aggregation), operability (Preview vs Go decoupling, Branch Tip jumping, Restore Previous stack, branch diffing), and predictability (no accidental context mutations, strict 3-tier state isolation, schema migration).
- **U6:** The user's refinement clarification approving ADR 0007, responsive split layout (>=100 cols dual-pane, <100 single-pane fallback), two-tier branch diff (topology core + git progressive enhancement), and `Spec -> slice` delivery order.
- **R1:** [Package development reference](../../packages/README.md), [project context](../CONTEXT.md), [ADR 0001](../adr/0001-independently-installable-pi-packages.md), [ADR 0002](../adr/0002-typescript-esm-plugin-development-stack.md).
- **R2:** [ADR 0004](../adr/0004-unified-command-grammar-and-dynamic-tui-configuration.md), [ADR 0005](../adr/0005-versioned-plugin-support-library.md), and [ADR 0007](../adr/0007-interactive-session-explorer-navigation-and-state.md).
- **H1:** Installed Pi 1.5.0/1.5.2 package metadata and bundled docs/extensions.md, docs/session-format.md, docs/security.md; local public declarations in pi-coding-agent's dist/core/extensions/types.d.ts, dist/core/session-manager.d.ts and dist/index.d.ts.

U2-U4 settle v1.0 baselines; U5-U6 and ADR 0007 establish v2.0 Interactive Session Explorer architecture. Repository constraints remain binding.

## Intent and scope

Provide an independently installable, configurable Pi TUI Extension for browsing the current session tree, finding historical work, inspecting agent execution details, and explicitly navigating, restoring, or branching sessions. Prefer a standalone `/stree` command; retain native `/tree` as an unaffected fallback.

Core goals for coding agents:
1. **Discoverable:** All historical messages, branches, and branch tips are reachable and discoverable.
2. **Understandable:** Instantly grasp what each branch accomplished, how far it proceeded, and its outcomes via an Outline + Preview layout and Tool Call Aggregation.
3. **Actionable:** Preview without context mutation, navigate to branch tips, restore previous leaves, search, bookmark, and compare branches.
4. **Predictable:** UI operations never inadvertently alter active context; filtering and folding never cause historical nodes to become unaddressable.

No database, background service, alternate session store, session-format change or host patch is required.

## Requirements

### R01 - Package and host integration [U1 §§12-13, U2, R1-R2, H1]

- Own the extension under `packages/pi-session-tree-explorer/`, with `package.json`, `tsconfig.json`, `README.md` and `extensions/index.ts`.
- TypeScript ESM, erasable syntax, Node.js >= 22.19.0, TypeBox through `typebox`, Biome, Vitest and `tsc --noEmit`. No bundler or emitted build prerequisite.
- Used Pi SDKs and `typebox` are host-provided `"*"` peers; declare other runtime dependencies. Do not import sibling plugin sources or require incidental checkout dependencies.
- Expose only this package's actual resources through conventional discovery or an explicit Pi manifest. A versioned ordinary support-library dependency (`pi-plugin-support`) is permitted; it cannot share mutable runtime ownership or activate other plugins.
- `/stree` without arguments opens the primary Explorer in TUI mode. Preserve the collection's `/<extension> <action> [other-args]` grammar for command operations, including `/stree config` and context-aware multi-token argument completions. Non-TUI use must give a text response rather than attempting custom TUI.
- Participate in installed-only configuration-panel discovery over `pi.events` per ADR 0004/0005. Never display settings for uninstalled plugins or override native `/tree`.
- Use `ctx.ui.custom()` and the installed Component interface; close with the host-supported completion mechanism. UI input must not perform session replacement directly.

### R02 - Raw topology and safe indexing [U1 §§3,5,12,16, U3]

A Raw Entry is a real Pi entry with `id` and `parentId`. The SessionHeader is metadata, not a tree node. Index every entry type, not only messages. A Display Node is either a projected real entry or a virtual structural summary; never confuse its ID with a valid session-operation target.

Build read-only entry/parent/ordered-child maps, raw/turn/branch depths, fork/leaf sets and preorder IDs. Aim for O(N) construction. Preorder means parent before descendants with those ordered children.

- Raw depth: original parent-edge count from a root.
- Turn depth: number of user messages along the root-to-entry path.
- Branch depth: number of fork transitions along the raw path.
- Compute from original topology, not screen indentation or filtered rows.
- Branch lookup uses raw children and the nearest ancestor fork. Filtering must not invent or remove a raw fork.
- Multiple roots are separate branch-navigation domains.
- Missing parents, duplicate/invalid relationships and cycles must produce bounded safe degradation. Never rewrite the session file as part of browsing.

### R03 - Three-Tier State Architecture & Projection Decoupling [U1 §§1,3,6, U5, U6, ADR 0007]

Strictly separate state across three tiers to eliminate configuration masking and context corruption:
1. **Global Config:** System baseline defaults loaded from extension schema and user/project `session-tree.json`.
2. **Session View State:** Isolated per-session overrides stored under `~/.pi/agent/state/session-tree/<session-id>.json`. Stores **only explicit user overrides** (manual expanded/collapsed IDs, user-selected filter overrides, last cursor position). **Never save full `displayOptions` snapshots to disk.**
3. **Runtime State:** In-memory operational state:
   - `activeLeafId`: Always sourced authoritatively from `ctx.sessionManager.getLeafId()`. Never overridden by view state.
   - `selectedNodeId`: Tree cursor position in the Outline.
   - `previewNodeId`: Target node currently inspected in the Preview pane.
   - `navigationHistory`: In-memory stack of visited session leaves.

Selection, preview, filtering, and folding operations must never mutate `activeLeafId` or invoke `navigateTree`.

### R04 - Navigation, Tip Traversal, and Action Inventory [U1 §§4-5, U3, U5, U6]

Maintain one Action registry with stable `domain.action` IDs, descriptions, default keys, and permitted modes.

#### Node Actions

| ID | Outcome | Default normal-mode key(s) |
| --- | --- | --- |
| node.next | Next visible row | j, down |
| node.prev | Previous visible row | k, up |
| node.parent | Nearest logical visible parent | H, left |
| node.firstChild | First logical child | L, right |
| node.lastChild | Last logical child | gL |
| node.nextSibling | Next logical sibling | ]s |
| node.prevSibling | Previous logical sibling | [s |
| node.root | Root of the current tree | gg |
| node.last | Last visible row | G |
| node.current | Move cursor to current active leaf | Tab (in Outline) |
| node.pageDown | Move down half a viewport | ctrl+d |
| node.pageUp | Move up half a viewport | ctrl+u |
| node.nextUser | Next user node in current visible order | ]u |
| node.prevUser | Previous user node in current visible order | [u |

#### Branch Actions & Tip Navigation

| ID | Outcome | Default normal-mode key |
| --- | --- | --- |
| branch.next | Next sibling branch at nearest fork | ]b |
| branch.prev | Previous sibling branch at nearest fork | [b |
| branch.parent | Nearest fork defining the current branch | gp |
| branch.root | That branch's starting child | gb |
| branch.leaf | Preferred leaf of that branch | ge |
| branch.tip | **Go to Branch Tip** (reachable tip of current subtree) | g |
| branch.first | First branch at the same fork | g[ |
| branch.last | Last branch at the same fork | g] |
| branch.nextFork | Next raw fork in current Root's preorder | ]f |
| branch.prevFork | Previous raw fork in current Root's preorder | [f |
| branch.active | Focus/reveal the actual active branch | ga |

- **Go to Branch Tip (`branch.tip` / `g`):** Computes reachable leaves from the currently selected node/branch.
  - If exactly 1 tip exists: navigate directly to that tip.
  - If multiple tips exist: present an interactive picker list showing branch head, tip entry ID, message preview, and turn count.
  - If target tip is a User message: display explicit notice that navigating will restore the prompt into the editor.

#### Session Navigation & Restoration Actions

| ID | Outcome | Default normal-mode key |
| --- | --- | --- |
| session.navigate | Native Navigate (`navigateTree`) to selected node | enter |
| session.restorePrevious | **Restore Previous** active session leaf from stack | r |
| session.preview | Toggle/focus Preview pane or modal | Tab, p |
| session.fork | Fork including the selected real entry | f |
| session.forkBefore | Fork before an appropriate user entry | F |
| session.setLabel | Set/edit a real entry's Label | Shift+L, m |
| session.copyId | Copy real Entry ID | yi |
| session.copyContent | Copy node text | yy |
| session.refresh | Refresh host data | R |
| session.close | Close without session change | q |

### R05 - Smart Folding & Tool Call Aggregation [U1 §§4,6, U3, U5, U6]

| ID | Outcome | Default normal-mode key |
| --- | --- | --- |
| fold.toggle | Toggle selected subtree | space |
| fold.expand | Expand selected subtree | l |
| fold.collapse | Collapse selected subtree | h |
| fold.expandAll | Expand all | zR |
| fold.collapseAll | Collapse all | zM |
| fold.smart | Switch to smart fold mode | User binding |
| fold.activeOnly | Expand only the actual active path | za |
| fold.focusedOnly | Expand only the focused path | zs |
| fold.collapseSiblings | Collapse other sibling branches | zc |

#### Tool Call Aggregation
- Consecutive tool calls and results (e.g. `read`, `grep`, `bash`) within an assistant turn are aggregated in the projection into a virtual summary row: `▸ [Tools ×N] read, grep, bash`.
- Entering or expanding (`l` or `Enter`) on a Tool aggregate expands it in-place in the tree to show individual tool call names, arguments, and status.
- Selecting a Tool aggregate displays the full invocation sequence and execution results in the Preview pane.
- Tool aggregation never alters raw session topology or entry addressing; filtered or folded tools remain fully searchable and indexable.

#### Smart Fold Mode (`fold.mode = "smart"`)
- Short sessions (< 20 turns) are fully expanded by default.
- Long sessions preserve User messages, critical Assistant summaries, and branch fork points, while automatically collapsing verbose Tool chains into aggregated rows.
- Inactive branches display their branch root, tip summary, and collapsed node count.

### R06 - Modes and Configurable Key Parsing [U1 §§4,10, U2, U5]

Modes are `normal`, `search`, `preview`, and `help`.
- `normal`: tree navigation and commands.
- `search`: text query editing with printable keys; arrow/Ctrl+n/p navigation; Enter accepts search selection; Esc cancels and restores pre-search viewport.
- `preview`: scrollable inspection of node content, tool calls, and branch metadata.
- Help (`?`) displays effective keybindings and action descriptions.

### R07 - Contextual Search Over Raw History [U1 §§4,7, U2-U3, U5]

- Fuzzy, exact-string, and regex search across all raw entries (including hidden/collapsed tool nodes).
- Matches highlight in query results.
- Selecting a search hit automatically reveals its ancestor path in the Outline without permanently changing user fold settings.
- Esc in normal mode clears search highlights and restores prior fold state.

### R08 - Content Inspection & Preview Pane [U1 §§4,7,9, U5, U6]

- Preview pane dynamically updates whenever `selectedNodeId` changes in the Outline.
- Displays: role badge, turn depth, message timestamp, branch tip marker, full message text, tool call breakdown, and files changed (extracted from tool parameters where available).
- Scroll keys in Preview: Up/Down, PageUp/PageDown, Home/End.

### R09 - Explicit, Lifecycle-Safe Session Operations & History Stack [U1 §§9,13,16, U5, U6, H1]

- **Navigation History Stack:**
  - In-memory LIFO stack maintained across the session.
  - Whenever a successful `navigateTree` executes, the previous `activeLeafId` is pushed onto the stack.
  - `session.restorePrevious` (`r`) pops the previous leaf and calls `navigateTree(prevLeafId)`, restoring the prior working state.
- **Interactive Summarization:**
  - When navigating to a non-active branch, support native Pi branch summarization options:
    - *No summary:* switch branch directly without model calls.
    - *Summarize:* trigger native branch summarization.
    - *Custom prompt:* specify instructions for the summary.
  - Display the source branch, target branch, and the entry range subject to summarization.
- **Editor Restoration Transparency:**
  - Navigating to a user message triggers native restoration of that user prompt into the editor. The UI explicitly discloses this behavior before navigation.
- **Fork Safety:**
  - Fork At (`f`) and Fork Before (`F`) create independent session files via `ctx.fork`.
  - Revalidate host idle state before dispatching; handle busy states gracefully with `busyBehavior`.

### R10 - Honest Depth and Context Metrics [U1 §§3,8, H1]

- Display model-visible context tokens and percentage of context window using canonical ancestor-path projection.
- Distinguish active host usage, projection estimates (`~`), and unknown values (`—`). Never fabricate token counts.
- Bounded LRU cache; cancel stale asynchronous metric calculations upon navigation or session change.

### R11 - Responsive Outline + Preview Layout [U1 §§2,4,10,14, U5, U6]

- **Dual-Pane Layout (Terminal Width >= 100 Columns):**
  - Left pane (60%): Session Outline tree, turn hierarchy, tool aggregates, branch markers.
  - Right pane (40%): Node Preview pane with live updating inspection.
- **Responsive Single-Pane Fallback (Terminal Width < 100 Columns):**
  - Displays single-column Session Outline.
  - Pressing `Tab` or `p` opens a modal/drawer Preview view; pressing `Esc` returns to Outline.
- Dynamic resizing: handle `resize` events gracefully, clamping viewports and recomputing split ratios without UI corruption.

### R12 - Isolated Per-Session View State & Schema v2 Migration [U1 §15, U5, U6, ADR 0007]

- Saved under `state/session-tree/<session-id>.json` with `version: 2`.
- Stored fields:
  - `version: 2`
  - `sessionId: string`
  - `focusedBranchId?: string | null`
  - `manualExpandedIds?: string[]`
  - `manualCollapsedIds?: string[]`
  - `selectedNodeId?: string`
  - `explicitDisplayOverrides?: Partial<DisplayOptions>` (only keys explicitly changed by user command)
- **Automatic Migration:**
  - Upon loading a `version: 1` file, remove the polluted full `displayOptions` object, preserve `manualExpandedIds` and `manualCollapsedIds`, and upgrade to `version: 2`.
- Stale entry IDs that no longer exist in the active session are pruned silently.

### R13 - Validated Layered Configuration [U1 §§10-11,15, U3, U4]

- Layers: Defaults -> Global `session-tree.json` -> Project `.pi/session-tree.json` -> Runtime command overrides.
- TypeBox validation with field-level diagnostic reporting.
- Conflicting or invalid settings produce actionable warnings without crashing the Explorer.

### R14 - Large-Session Responsiveness [U1 §§7-8,12,14,16, U2]

- Virtual viewport rendering with overscan.
- Debounced search indexing; bounded memory usage for 10,000+ node sessions.

### R15 - Verification and Quality Assurance [U1 §§16-18, R1]

- TypeScript `tsc --noEmit` passing.
- Biome check passing.
- Vitest unit and integration test suite passing.
- Integration evidence verifying P0 navigation/state, P1 layout/tool aggregation, and P2 branch diffing.

### R16 - Two-Tier Branch Comparison (P2) [U5, U6]

- **Core Topology Diff (Zero Dependencies):**
  - Compare Branch A and Branch B:
    - Common ancestor node.
    - List of user turns on Branch A vs. Branch B.
    - Total tool invocations and breakdown by tool name.
    - Token consumption delta and outcome status.
- **Workspace File Diff (Progressive Enhancement):**
  - If the active session is located inside a Git repository, attempt to map branch tips to git commits/snapshots and generate `git diff --stat` summary.
  - If outside a Git repository or commit points cannot be resolved, gracefully degrade to displaying topology diff with an informative message.

### R17 - Branch Bookmarks & Session Statistics (P2) [U5]

- Name and pin key branches (e.g. `baseline`, `approach-a`, `failed-test`).
- Dedicated branch selector dialog for jumping directly between bookmarked branch tips.
- Session statistics summary: total nodes, branch count, token consumption, and tool distribution.

## Necessary Seams

| Seam | Connects | Expects | Guarantees |
| --- | --- | --- | --- |
| Navigation History Stack | `session.navigate` -> In-memory stack -> `session.restorePrevious` | Successful native `navigateTree` execution | Push prior `leafId` on jump; deterministic restore on `r` |
| Tool Aggregation Projection | Raw entry list -> Projection reducer | Consecutive tool calls/results in turn | Virtual aggregate `[Tools ×N]`; raw IDs unchanged |
| Responsive Dual-Pane Layout | Terminal dimensions -> TUI component layout | Terminal width & height | >=100 cols split (60/40); <100 cols single-pane with modal preview |
| Three-Tier View State | Disk persistence -> Explorer loader | `version: 2` schema / migration from v1 | Explicit overrides only; no full `displayOptions` pollution |
| Branch Tip Resolver | TreeIndex + selected node -> Tip list | Current subtree | Reachable leaf set; interactive picker if multiple |
| Two-Tier Branch Diff | Selected Branch A & B -> Diff View | Raw topology + optional Git environment | Always provides topology diff; progressive Git diff if available |

## Representative End-to-End Acceptance

### E01 - Decoupled Preview vs. Context Mutation [R03, R04, R08]
- **Given:** Active session leaf is `leaf-A`.
- **When:** User opens `/stree`, navigates cursor to historical node `node-X`, and presses `Tab` / `p` to inspect preview.
- **Then:** Preview pane displays `node-X` details and full text; host session `activeLeafId` remains unchanged at `leaf-A`.

### E02 - Branch Tip Jump & Restoration Stack [R04, R09]
- **Given:** Active leaf is `leaf-A`. User navigates to ancestor fork and presses `g` (Go to Branch Tip).
- **When:** Subtree has one reachable tip `leaf-B`; user confirms jump, then presses `r` (Restore Previous).
- **Then:** `navigateTree(leaf-B)` executes, previous leaf `leaf-A` is pushed onto history stack. Upon pressing `r`, `navigateTree(leaf-A)` executes and restores the initial active state.

### E03 - Multi-Tip Picker on Forked Subtree [R04]
- **Given:** A selected branch contains 3 distinct child branches with tips `tip-1`, `tip-2`, `tip-3`.
- **When:** User presses `g`.
- **Then:** An interactive branch tip selector opens showing all 3 tips with turn counts and message previews. Selecting `tip-2` navigates to it.

### E04 - Tool Aggregation and Live Preview [R05, R08, R11]
- **Given:** A turn with 12 consecutive tool calls (`read`, `grep`, `bash`).
- **When:** Explorer renders in >= 100 column terminal.
- **Then:** Outline renders a single line `▸ [Tools ×12] read, grep, bash`. Cursor selection on the aggregate updates the right-hand Preview pane showing the list of tool calls, arguments, and return statuses. Pressing `Enter` or `l` expands the 12 items in-place in the Outline.

### E05 - View State Migration from Legacy v1 [R03, R12]
- **Given:** A legacy view state file on disk with `version: 1` containing full `displayOptions: { showAssistantNodes: true, ... }`.
- **When:** Explorer opens this session.
- **Then:** Loader migrates state to `version: 2`, strips the full `displayOptions` snapshot, applies global configuration defaults, and preserves `manualExpandedIds`. Subsequent saves write clean `version: 2` format.

### E06 - Responsive Layout Fallback [R11]
- **Given:** Terminal width is resized from 120 columns to 80 columns.
- **When:** Explorer re-renders.
- **Then:** Dual-pane switches dynamically to single-column Outline without overlapping text or crashed UI; `Tab` / `p` opens a modal preview overlay.

### E07 - Two-Tier Branch Diff [R16]
- **Given:** Two distinct branches with a common ancestor.
- **When:** User selects both branches and triggers Branch Diff.
- **Then:** Diff view displays common ancestor, turn count differences, tool call comparison, and token usage. If in a git repository, it shows changed files; otherwise it indicates git diff is unavailable while preserving session topology diff.
