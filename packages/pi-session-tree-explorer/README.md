# Pi Session Tree Explorer

An independently installable Pi coding agent extension providing an enhanced session tree explorer with fast navigation, branch discovery, and read-only tree inspection.

## Current status (Tickets T0001, T0002, T0003 & T0004)

This package delivers **T0001 (Read-only Tree Explorer foundation)**, **T0002 (Vim Navigation, Folding & Filter Projections)**, **T0003 (Layered Configuration & Settings Panel)**, and **T0004 (Full-Text Search, Preview & Label Metadata)**:
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
  - Multi-tier ranking: Exact label match (+500), label substring (+300), summary prefix (+200), fulltext (+100), recency boost (+0..30), and focused branch boost (+40). Ties broken by original session order.
  - **Reversible Search Reveals:**
    - Opening search (`/`) snapshots pre-search selection, query, and manual folds.
    - Search cancellation (`Esc` in search mode) restores the pre-search snapshot completely.
    - Search acceptance (`Enter` in search mode) selects match and retains query and ancestor reveal path **without triggering session navigation**.
    - Clearing in normal mode (`Esc` in normal mode) clears search query and temporary reveals; if the selected entry becomes hidden, it automatically falls back to its nearest visible ancestor.
    - Hidden assistant matches are temporarily exposed as real entries with preview/navigation eligibility, without permanently modifying `displayOptions.showAssistantNodes`.
- **Full Content Preview Overlay (`p`):** Formats and displays complete un-truncated text, role, model, tool details, and timestamps. Exits on `p`, `q`, or `Esc`.
- **Clipboard Integration:** Copy real Entry ID (`yi`) and node content (`yy`). Refuses virtual branch summaries with informative feedback.
- **Label Management (`m`):** Sets or clears bookmark labels via host API, updating markers and search ranking.
- **Host Refresh (`r`):** Reloads session entries from host SessionManager without restarting explorer.
- **Validated 4-Layer Configuration:** Precedence: `Built-in Defaults` -> `Global session-tree.json` -> `Trusted Project .pi/session-tree.json` -> `Runtime Overrides`.
- **Interactive TUI Settings Panel & Autocompletion:** `/stree config` opens interactive `SettingsList` panel; autocompletion suggests subcommands, keys, and values.
- **Installed-Only Panel Discovery:** Uses `pi.events` protocol (`pi-packages:ui:discover`) to announce and discover loaded collection plugin panels without hardcoded cross-package imports.
- **Pure browsing guarantees:** Tree navigation, search, and folding never call `resetLeaf()`, never append session entries, and never modify session history.

_Note on full v1.0 scope:_ Safe native Navigate/Fork session operations (T0005), historical Context estimates (T0006), and view state persistence (T0007) are scheduled in subsequent tickets.

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

### Keybindings

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

- `Space` / `Enter`: Toggle fold of selected node or virtual branch summary
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

#### Inspection & Metadata

- `p`: Toggle full-content preview overlay
- `yi`: Copy Entry ID to clipboard
- `yy`: Copy full node text content to clipboard
- `m`: Set or toggle bookmark label
- `r`: Refresh session entries from host

#### Controls

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
- `npm test`: Runs Vitest unit test suite (11 test files, 69 tests passed) covering `TreeIndex`, 17 node actions, 13 branch actions, 11 fold actions, 8 filter actions, keymap parser, layered config, multi-token completions, search engine, preview overlay, clipboard, and label metadata.
- `npm run smoke`: Copies the package to an isolated temporary directory, runs offline dependency installation via `npm ci --omit=dev`, spawns real Pi RPC process, and verifies command registration, `/stree config`, `/stree config reload`, and non-TUI notifications.

## Permissions and risks

This extension executes within Pi's process privileges:
- **Filesystem access:** Reads active session history via host SessionManager. Reads and writes `session-tree.json` configuration files. Does not modify or write session JSONL files during browsing.
- **Process execution:** Uses system clipboard commands (`clip` on Windows, `pbcopy` on macOS, `wl-copy`/`xclip` on Linux) only when `yi` or `yy` copy actions are explicitly invoked by the user.
- **Network access:** None. Purely local in-memory tree browsing.
