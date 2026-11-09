# Pi Session Tree Explorer

An independently installable Pi coding agent extension providing an enhanced session tree explorer with fast navigation, branch discovery, and read-only tree inspection.

## Current status (Tickets T0001 & T0002)

This package delivers **T0001 (Read-only Tree Explorer foundation)** and **T0002 (Vim Navigation, Folding & Filter Projections)**:
- Independent package setup under `packages/pi-session-tree-explorer/` with isolated dependencies, TypeScript ESM, erasable syntax, and Pi 1.5.0 compatibility.
- Core `TreeIndex` indexing all raw session entry types with original order, cycle protection, and safe handling of missing parents and multiple roots.
- Exact raw depth, turn depth, and branch depth calculations matching the specification.
- Complete 17 node navigation actions and 13 branch navigation actions with nearest-fork semantics, normative D1/C2 behavior, and separate ownership of Selected Node, Focused Branch, and Session Leaf.
- **11 Fold Actions & 5 Fold Modes:** `all`, `focused-only`, `active-only`, `depth-limited`, `manual`. Default `focused-only` keeps focus on active/selected branch, collapsing inactive sibling branches into informative virtual summaries (`▸ Branch [N nodes, M forks]`). `Enter` or `fold.toggle` on a virtual summary expands it directly without session navigation.
- **8 Composable Filter Actions:** Independent intersecting constraints for Assistant, Tools, Thinking, and Metadata toggles, plus `userOnly`, `branchOnly`, and `labeledOnly` intersection. Hidden node chains reconnect to nearest visible ancestors without mutating raw `parentId`.
- **Mode-Aware Keymap Parser:** State machine with configurable prefix disambiguation timeout (default 800ms), duplicate/conflict detection, Vim multi-key sequences (`gg`, `gL`, `gs`, `gp`, `gb`, `ge`, `ga`, `g[`, `g]`, `]b`, `[b`, `]f`, `[f`, `]m`, `[m`, `]u`, `[u`, `]l`, `[l`, `]s`, `[s`, `zR`, `zM`, `za`, `zs`, `zc`, `z+`, `z-`, `zr`), and non-Vim mode arrow navigation.
- **Search-Mode Input Isolation:** In search mode, printable keys (including `j` and `k`) type query text; arrows and `Ctrl+n` / `Ctrl+p` navigate matches; `Enter` accepts selection (retaining query/reveals without triggering session navigation); `Esc` cancels and restores prior state.
- **Help View Overlay:** Press `?` to open live shortcut help showing effective bindings and modes.
- **Pure browsing guarantees:** Tree navigation and folding never call `resetLeaf()`, never append session entries, and never modify session history.

_Note on full v1.0 scope:_ Configurable layered JSON configuration files (T0003), full-text fuzzy search ranker/preview/label editing (T0004), safe native Navigate/Fork session operations (T0005), historical Context estimates (T0006), and view state persistence (T0007) are scheduled in subsequent tickets.

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
- `npm test`: Runs Vitest unit test suite (6 test files, 43 tests passed) covering `TreeIndex`, 17 node actions, 13 branch actions, 11 fold actions, 8 filter actions, keymap parser, and TUI rendering.
- `npm run smoke`: Copies the package to an isolated temporary directory, runs offline dependency installation via `npm ci --omit=dev`, spawns real Pi RPC process, and verifies command registration and non-TUI notification.

## Permissions and risks

This extension executes within Pi's process privileges:
- **Filesystem access:** Reads active session history via host SessionManager. Does not modify or write session JSONL files during browsing.
- **Process execution:** None.
- **Network access:** None. Purely local in-memory tree browsing.
