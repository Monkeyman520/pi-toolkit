# Pi Session Tree Explorer

An independently installable Pi coding agent extension providing an enhanced session tree explorer with fast navigation, branch discovery, and read-only tree inspection.

## Current status (Tickets T0001, T0002, T0003, T0004 & T0005)

This package delivers **T0001 (Read-only Tree Explorer foundation)**, **T0002 (Vim Navigation, Folding & Filter Projections)**, **T0003 (Layered Configuration & Settings Panel)**, **T0004 (Full-Text Search, Preview & Label Metadata)**, and **T0005 (Safe Native Navigate & Fork Session Operations)**:
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
- **Conflict & Busy Safety:** Rejects operations safely with clear feedback during agent streaming, manual/automatic compaction, or concurrent navigation.
- **Clean Replacement Lifecycle:** Discards old session references and caches upon replacement, binding cleanly to the fresh session context.
- **Clipboard Integration:** Copy real Entry ID (`yi`) and node content (`yy`). Refuses virtual branch summaries with informative feedback.
- **Label Management (`m`):** Sets or clears bookmark labels via host API.
- **Host Refresh (`r`):** Reloads session entries from host SessionManager without restarting explorer.
- **Validated 4-Layer Configuration:** Precedence: `Built-in Defaults` -> `Global session-tree.json` -> `Trusted Project .pi/session-tree.json` -> `Runtime Overrides`.
- **Interactive TUI Settings Panel & Autocompletion:** `/stree config` opens interactive `SettingsList` panel; autocompletion suggests subcommands, keys, and values.
- **Installed-Only Panel Discovery:** Uses `pi.events` protocol (`pi-packages:ui:discover`) to announce and discover loaded collection plugin panels without hardcoded cross-package imports.

_Note on full v1.0 scope:_ Historical Context estimates (T0006) and view state persistence (T0007) are scheduled in subsequent tickets.

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
- `npm test`: Runs Vitest unit test suite (12 test files, 76 tests passed) covering `TreeIndex`, 17 node actions, 13 branch actions, 11 fold actions, 8 filter actions, keymap parser, layered config, multi-token completions, search engine, preview overlay, clipboard, label metadata, and safe Navigate / Fork session operations.
- `npm run smoke`: Copies the package to an isolated temporary directory, runs offline dependency installation via `npm ci --omit=dev`, spawns real Pi RPC process, and verifies command registration, `/stree config`, `/stree config reload`, and non-TUI notifications.

## Permissions and risks

This extension executes within Pi's process privileges:
- **Filesystem access:** Reads active session history via host SessionManager. Reads and writes `session-tree.json` configuration files. Creates new session files when explicit Fork operations (`f` or `F`) are invoked.
- **Process execution:** Uses system clipboard commands (`clip` on Windows, `pbcopy` on macOS, `wl-copy`/`xclip` on Linux) only when `yi` or `yy` copy actions are explicitly invoked by the user.
- **Network access:** None. Purely local in-memory tree browsing.
