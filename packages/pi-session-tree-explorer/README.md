# Pi Session Tree Explorer

An independently installable Pi coding agent extension providing an enhanced session tree explorer with fast navigation, branch discovery, and read-only tree inspection.

## Current status (Ticket T0001)

This package delivers **T0001 (Read-only Tree Explorer foundation)**:
- Independent package setup under `packages/pi-session-tree-explorer/` with isolated dependencies, TypeScript ESM, erasable syntax, and Pi 1.5.0 compatibility.
- Core `TreeIndex` indexing all raw session entry types with original order, cycle protection, and safe handling of missing parents and multiple roots.
- Exact raw depth, turn depth, and branch depth calculations matching the specification.
- Complete 17 node navigation actions and 13 branch navigation actions with nearest-fork semantics, normative D1/C2 behavior, and separate ownership of Selected Node, Focused Branch, and Session Leaf.
- Initial interactive TUI component (`SessionTreeComponent`) launched via `/stree` in TUI mode with status markers, depth display, and single/multi-key dispatch (`j/k`, `H/L`, `]b/[b`, `gp/gb/ge`, `q`).
- Non-TUI modes (RPC/print) provide informative notifications without attempting to render interactive TUI.
- **Pure browsing guarantees:** Tree navigation never calls `resetLeaf()`, never appends session entries, and never modifies session history.

_Note on full v1.0 scope:_ Advanced mode-aware key sequence parsing, configurable layered JSON configuration, full-text fuzzy search/preview/labels, safe native Navigate/Fork At/Before session operations, historical Context estimates, and view state persistence are scheduled in subsequent tickets (T0002–T0008).

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

### Keybindings (Initial T0001 subset)

- `j` / `Down`: Next visible node
- `k` / `Up`: Previous visible node
- `H`: Parent node
- `L`: First child node (or enter child branch from fork point)
- `G`: Last visible node
- `Tab`: Jump to current Session Leaf
- `]b`: Next sibling branch at nearest fork
- `[b`: Previous sibling branch at nearest fork
- `gp`: Branch parent (nearest fork point)
- `gb`: Branch root
- `ge`: Branch leaf (prefers focused path, recent visit, or latest entry)
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
- `npm test`: Runs Vitest unit test suite covering `TreeIndex`, 17 node actions, 13 branch actions, action registry, and TUI rendering.
- `npm run smoke`: Copies the package to an isolated temporary directory, runs offline dependency installation via `npm ci --omit=dev`, spawns real Pi RPC process, and verifies command registration and non-TUI notification.

## Permissions and risks

This extension executes within Pi's process privileges:
- **Filesystem access:** Reads active session history via host SessionManager. Does not modify or write session JSONL files during browsing.
- **Process execution:** None.
- **Network access:** None. Purely local in-memory tree browsing.
