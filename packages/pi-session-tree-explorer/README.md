# Pi Session Tree Explorer

An independently installable Pi coding agent extension providing an enhanced session tree explorer with fast navigation, branch discovery, and read-only tree inspection.

## Current status: Full v1.0 Completed (Tickets T0001–T0008)

This package delivers the complete **Enhanced Session Tree Explorer v1.0** for Pi Coding Agent:
- Independent package setup under `packages/pi-session-tree-explorer/` with isolated dependencies, TypeScript ESM, erasable syntax, and Pi 1.5.0 compatibility.
- Core `TreeIndex` indexing all raw session entry types with original order, cycle protection, and safe handling of missing parents and multiple roots.
- Exact raw depth, turn depth, and branch depth calculations matching the specification.
- Complete 17 node navigation actions and 13 branch navigation actions with nearest-fork semantics, normative D1/C2 behavior, and separate ownership of Selected Node, Focused Branch, and Session Leaf.
- **11 Fold Actions & 5 Fold Modes:** `all`, `focused-only`, `active-only`, `depth-limited`, `manual`. Default `focused-only` keeps focus on active/selected branch, collapsing inactive sibling branches into informative virtual summaries (`▸ Branch [N nodes, M forks]`). `Enter` or `fold.toggle` on a virtual summary expands it directly without session navigation.
- **8 Composable Filter Actions:** Independent intersecting constraints for Assistant, Tools, Thinking, and Metadata toggles, plus `userOnly`, `branchOnly`, and `labeledOnly` intersection. Hidden node chains reconnect to nearest visible ancestors without mutating raw `parentId`.
- **Mode-Aware Keymap Parser:** State machine with configurable prefix disambiguation timeout (default 800ms), duplicate/conflict detection, Vim multi-key sequences (`gg`, `gL`, `gs`, `gp`, `gb`, `ge`, `ga`, `g[`, `g]`, `]b`, `[b`, `]f`, `[f`, `]m`, `[m`, `]u`, `[u`, `]l`, `[l`, `]s`, `[s`, `zR`, `zM`, `za`, `zs`, `zc`, `z+`, `z-`, `zr`), and non-Vim mode arrow navigation.
- **Full-Text Search Engine (7 Search Actions):**
  - Searches complete text content beyond row truncation, tool names, tool call IDs, labels, entry IDs, and timestamps.
  - Modes: `fuzzy` (default), `exact` (substring), and `regex`.
  - Scopes: `all` raw entries vs `focused-subtree` only.
  - Multi-tier ranking with label match priority, summary prefix bonus, and recency/focus boosts. Ties broken by original session order.
  - **Reversible Search Reveals:** Search cancellation (`Esc`) restores pre-search snapshot; search acceptance (`Enter`) selects match and retains query and reveal path **without triggering session navigation**; normal `Esc` clears query and temporary reveals.
- **Full Content Preview Overlay (`p`):** Formats and displays complete un-truncated text, role, model, tool details, and timestamps.
- **Safe Native Session Navigation (`Enter`):**
  - Dispatches intent from TUI and executes `ctx.navigateTree` after custom UI closes.
  - Default `summarize: false` avoids silent model charges.
  - Respects host semantics: User message targets restore editor prompt and set parent as resulting leaf; non-user targets set target as resulting leaf.
  - Virtual branch summaries expand on Enter rather than navigating.
- **Independent Session Fork Operations:**
  - **Fork At (`f`):** Creates new independent session duplicating active path through selected entry (`position: "at"`) without restoring editor text.
  - **Fork Before (`F`):** For user messages only, omits selected user prompt from retained path and restores it into editor (`position: "before"`).
  - Neither fork auto-sends model request; optional confirmation dialog (`confirmFork`) is honored; original session remains completely intact.
- **Honest Context Metrics & Bounded LRU Cache:**
  - **Distinguishes Effective Context from Cumulative Tokens:** default metric is `Effective Context Tokens / Context Window` for continuing generation from each entry.
  - **Provenance Guarantee:** Distinguishes `active-context` (from host `getContextUsage()`), `projection-estimate` (read-only historical ancestor projection), and `unknown` (`—`). Null is never coerced to zero.
  - **Compaction & Edit Isolation:** Uses Pi's canonical `buildSessionProjection` to honor compactions, `firstKeptEntryId` boundaries, and branch-isolated context edits.
  - **Historical Model Resolution:** Tracks historical model changes and assistant models along ancestor paths, avoiding borrowing the active model's window when models differ.
  - **Bounded LRU Cache:** 512-entry capacity keyed by session, revision, entry, and model identity. Prioritizes selected node then viewport nodes without blocking TUI rendering.
- **Responsive Layout & Compound Markers (All 8 View Actions):**
  - **Width Breakpoints:** `>=120` columns shows depth, context tokens/window percentage, and model; `80-119` columns shows depth and context tokens/window percentage; `<80` columns moves context metrics into the details panel.
  - **Compound States:** Root `●`, Leaf `◉`, Selection cursor `▶ `, Label badge `★[label]`, Folded `▸`, Fork `▾` cleanly coexist without mutual occlusion. Unicode display width is strictly measured to keep connector lines aligned.
  - **8 View Actions:** `view.toggleDetails` (`d`), `view.toggleContext` (`c`), `view.cycleDepthMode` (`D`), `view.cycleLayout` (`C`), `view.help` (`?`), `view.toggleVim`, `view.reloadConfig`, `view.reset`.
- **Per-Session View State Persistence:**
  - Persists focus, active filters, manual folds, layout density, and depth mode outside Session JSONL in `~/.pi/agent/state/session-tree/<session-id>.json`.
  - Stale entry ID filtering: ignores IDs that no longer exist in current session history upon reload.
  - Transient search queries, reveals, and in-flight tasks are **never** persisted.
- **Conflict & Busy Safety:** Rejects operations safely with clear feedback during agent streaming, manual/automatic compaction, or concurrent navigation.
- **Clean Replacement Lifecycle:** Discards old session references and caches upon replacement, binding cleanly to the fresh session context.
- **Clipboard Integration:** Copy real Entry ID (`yi`) and node content (`yy`). Refuses virtual branch summaries with informative feedback.
- **Label Management (`m`):** Sets or clears bookmark labels via host API.
- **Host Refresh (`r`):** Reloads session entries from host SessionManager without restarting explorer.
- **Validated 4-Layer Configuration:** Precedence: `Built-in Defaults` -> `Global session-tree.json` -> `Trusted Project .pi/session-tree.json` -> `Runtime Overrides`.
- **Interactive TUI Settings Panel & Autocompletion:** `/stree config` opens interactive `SettingsList` panel; autocompletion suggests subcommands, keys, and values.
- **Installed-Only Panel Discovery:** Uses `pi.events` protocol (`pi-packages:ui:discover`) to announce and discover loaded collection plugin panels without hardcoded cross-package imports.

## Verified Performance Benchmarks (Spec R14)

Measured on Windows x64, Node.js v26.13.0, with synthetic mixed-topology workloads:

| Workload / Operation         | Measured P95 | Spec R14 Target | Result   |
| ---------------------------- | ------------ | --------------- | -------- |
| 5,000-entry index build      | 14.26 ms     | < 200 ms        | **PASS** |
| 5,000-entry up/down movement | < 1 ms       | < 16 ms         | **PASS** |
| Branch jump (nearest fork)   | 0.02 ms      | < 20 ms         | **PASS** |
| Search input feedback        | 9.20 ms      | < 100 ms        | **PASS** |
| 10,000-entry first open      | 34.26 ms     | < 500 ms        | **PASS** |
| Context cache hit            | < 1 ms       | < 5 ms          | **PASS** |
| 20,000-entry huge index      | 43.00 ms     | < 1000 ms       | **PASS** |

## Compatibility and resources

- **Runtime:** Node.js >= 22.19.0.
- **Tested Pi Host:** Pi 1.5.0, Windows x64.
- **TypeScript & Linting:** TypeScript 5.9 with `erasableSyntaxOnly` and `noEmit: true`; Biome 2.6.4; Vitest 4.1.
- **Host Peers:** `@earendil-works/pi-coding-agent`, `@earendil-works/pi-ai`, `@earendil-works/pi-tui`, `typebox` (all as host-provided `*` peers).
- **Dependencies:** Shipped with vendored `pi-plugin-support@0.1.0` archive under `vendor/`.
- **Extension Entry:** `./extensions/index.ts`.

## Installation and usage

Run directly from this repository checkout:

```sh
pi -e ./packages/pi-session-tree-explorer
```

Or install into your local Pi environment:

```sh
pi install ./packages/pi-session-tree-explorer
```

### Commands

- `/stree`: In interactive TUI mode, opens the Session Tree Explorer. In non-TUI modes, notifies that interactive TUI is required.
- `/stree config`: In interactive TUI mode, opens the settings panel. In non-TUI modes, displays current configuration summary.
- `/stree config reload`: Force reloads configuration layers from disk.
- `/stree config <key> [value]`: View or update a specific configuration setting.
- `/stree help`: Displays command usage instructions.
- Native `/tree` remains completely unaffected as a fallback.

### Keybindings (All 73 Spec Actions Reachable)

#### Node Navigation

- `j` / `Down`: Next visible node
- `k` / `Up`: Previous visible node
- `H`: Logical parent node
- `L`: Logical first child (or enter child branch from fork point)
- `gL`: Last child
- `gg` / `G`: Root node / last visible node
- `Tab`: Jump to current Session Leaf
- `ctrl+d` / `ctrl+u`: Page down / page up
- `]m` / `[m`: Next / previous labeled node
- `]u` / `[u`: Next / previous user prompt node
- `]s` / `[s`: Next / previous logical sibling node
- `gs`: First logical sibling

#### Branch Navigation

- `]b` / `[b`: Next / previous sibling branch at nearest fork
- `gp`: Branch parent (nearest fork point)
- `gb`: Branch root
- `ge`: Branch leaf (prefers focused path, recent visit, or latest entry)
- `g[` / `g]`: First / last branch at same fork
- `]f` / `[f`: Next / previous fork point
- `ga`: Jump to active branch
- `]l` / `[l`: Next / previous leaf within branch leaf set

#### Folding & Filtering

- `Space`: Toggle fold of selected node or virtual branch summary
- `l` / `h`: Expand / collapse selected subtree
- `zR` / `zM`: Expand all / collapse all
- `za` / `zs`: Active-only / focused-only folding
- `zc`: Collapse sibling branches
- `z+` / `z-`: Increase / decrease expansion depth
- `zr`: Restore default folding policy

#### Search

- `/`: Open search mode
- In search mode: printable keys edit query text; `Up`/`Down` or `ctrl+p`/`ctrl+n` navigate matches; `Enter` accepts match without navigation; `Esc` cancels search and restores pre-search state
- In normal mode: `n` / `N` jumps to next / previous match; `Esc` clears search query and reveals (re-focusing nearest visible ancestor if selection becomes hidden)

#### Session Operations

- `Enter`: Navigate to selected entry in current session (or expand if on virtual branch summary)
- `f`: Fork new independent session at selected entry (`position: "at"`)
- `F`: Fork before selected user entry and restore prompt (`position: "before"`)

#### Inspection & Metadata

- `p`: Toggle full-content preview overlay
- `yi`: Copy Entry ID to clipboard
- `yy`: Copy full node text content to clipboard
- `m`: Set or toggle bookmark label
- `r`: Refresh session entries from host

#### View Controls

- `d`: Toggle details panel visibility
- `c`: Toggle context metrics column visibility
- `D`: Cycle depth calculation mode (`turn` -> `raw` -> `branch`)
- `C`: Cycle layout density (`normal` <-> `compact`)
- `?`: Toggle shortcut help overlay
- `q` / `Esc`: Close explorer (returns to session without modifying state)

## Verification

Run all package-local checks and tests:

```sh
cd packages/pi-session-tree-explorer
npm run typecheck
npm run check
npm test
npm run smoke
```

- `npm run typecheck`: Runs `tsc --noEmit` (verifies erasable syntax with no emitted JavaScript).
- `npm run check`: Runs Biome linter and formatter verification.
- `npm test`: Runs Vitest test suite (17 test files, 99 tests passed in ~9s) covering `TreeIndex`, 17 node actions, 13 branch actions, 11 fold actions, 8 filter actions, keymap parser, layered config, multi-token completions, search engine, preview overlay, clipboard, label metadata, safe Navigate / Fork session operations, honest Context metrics, responsive layout breakpoints, view state persistence, performance benchmarks, and E01–E07 E2E scenarios.
- `npm run smoke`: Copies the package to an isolated temporary directory, runs offline dependency installation via `npm ci --omit=dev`, spawns real Pi RPC process, and verifies command registration, `/stree config`, `/stree config reload`, and non-TUI notifications.

## Permissions and risks

This extension executes within Pi's process privileges:
- **Filesystem access:** Reads active session history via host SessionManager. Reads and writes `session-tree.json` configuration files and per-session view state files under `state/session-tree/`. Creates new session files when explicit Fork operations (`f` or `F`) are invoked.
- **Process execution:** Uses system clipboard commands (`clip` on Windows, `pbcopy` on macOS, `wl-copy`/`xclip` on Linux) only when `yi` or `yy` copy actions are explicitly invoked by the user.
- **Network access:** None. Purely local in-memory tree browsing.
