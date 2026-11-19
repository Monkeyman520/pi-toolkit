# Pi Session Tree Explorer

An independently installable interactive Session Explorer extension for Pi coding agents. Supports non-destructive browsing and live Preview, reachable branch tip navigation, an in-memory restoration stack, tool-call aggregation, smart folding, contextual search, two-tier branch comparison, branch bookmarks, and session statistics. Native `/tree` remains completely unchanged.

## Status

The **v2.0 Interactive Session Explorer** implementation (Spec 0008 / Ticket Set 0007) passes `tsc --noEmit`, Biome, Bun (including E01–E07 acceptance suites), and isolated Pi RPC loading/smoke checks on Windows x64 (Pi 1.5.2, Node.js >= 22.19.0). Live physical-terminal keyboard testing across WSL and Unix terminals remains external to automated headless verification.

### Approved configuration constraints (Spec 0008 U4)

- `session.forkPosition` accepts only `"at"` (`f` / `F` remain fixed At / Before actions).
- `navigation.skipHiddenNodes` and `search.preserveFoldState` accept only `true`. Conflicting non-default values produce validation diagnostics and are rejected cleanly.
- `fold.collapseLinearPaths` compresses linear chains into expandable virtual summaries without mutating raw topology.
- `session.busyBehavior = "wait"` prompts for post-UI confirmation, notifies visibly while waiting, and revalidates session identity and safety before executing.

## Compatibility, installation and resources

- Node.js >=22.19.0; TypeScript ESM with a Rolldown build.
- Verified against Pi `1.5.2` on Windows x64 (prior v1.0 evidence used Pi `1.5.0`). Wildcard peer ranges are not universal compatibility claims.
- Host peers: `@earendil-works/pi-coding-agent`, `@earendil-works/pi-ai`, `@earendil-works/pi-tui`, and `typebox`.
- Rolldown inlines the private [support library](../pi-plugin-support/README.md) where used. Pi SDKs and TypeBox remain host peers, and each plugin owns its state and lifecycle.
- Extension resource: `dist/index.js`.

After the package is available on npm, install it without a version pin:

```sh
pi install npm:@monkeyman520/pi-session-tree-explorer
pi update npm:@monkeyman520/pi-session-tree-explorer
```

Use `pi update --extensions` for all installed extensions. Pinned versions do not follow later releases. On a fresh launch after an update, Pi can show the bundled changelog under **Extension Updates**; the plugin does not poll for updates.

From the repository root, prepare the workspace and build before loading locally:

```sh
bun install --frozen-lockfile
bun run --cwd packages/pi-session-tree-explorer build
pi -e ./packages/pi-session-tree-explorer
# Or persist this local package:
pi install ./packages/pi-session-tree-explorer
```

## Commands and interaction

| Command                   | Behavior                                                                     |
| ------------------------- | ---------------------------------------------------------------------------- |
| `/stree`                  | Open Explorer in TUI; explain the interactive requirement in other modes     |
| `/stree config`           | Open the installed-plugin settings panel, or show a text summary outside TUI |
| `/stree config reload`    | Reload safely; retain the previous effective settings on failure             |
| `/stree config <key> [v]` | Inspect or update an existing setting                                        |
| `/stree help`             | Show command usage                                                           |

Settings panels are discovered over `pi.events` from actually loaded plugins (ADR 0004/0005). The Explorer's help panel links to settings with `s`.

### Core keys (87 cataloged Actions)

- **Navigation:** `j`/`k` or arrows move visible rows; `H`/`Left` and `L`/`Right` move logical parent/first child; `gg`/`G` root/last; `gc` current active leaf; `Ctrl+d`/`u` half-page.
- **Branch & Tip traversal:** `]b`/`[b` sibling branch; `gp`/`gb`/`ge` branch parent/root/preferred leaf; `]f`/`[f` and `]l`/`[l` fork/leaf traversal; `ga` active branch; `g` **Go to Branch Tip** (single-tip direct jump, multi-tip picker, explicit editor-restoration notice for user-message tips).
- **Preview & History Stack:** `Tab` or `p` opens/toggles non-destructive Preview (live dual-pane on `>= 100` columns with 60/40 split; modal overlay on `< 100` columns); `r` **Restore Previous** pops and restores prior active `leafId` from the in-memory navigation stack; `R` refreshes host snapshot.
- **Folding & Tool Aggregation:** `Space`/`l`/`h` toggle/expand/collapse (including in-place expansion of `[Tools ×N]` aggregates); `zR`/`zM` expand/collapse all; `za`/`zs`/`zc`/`zr` policy controls; `fold.mode = "smart"` expands short sessions (`< 20` turns) and folds tool chains/inactive branches in long sessions.
- **Search:** `/` opens Search (printable `j`/`k` edit query; arrows/`Ctrl+n`/`p` move results; `Enter` accepts and reveals ancestor paths with inline match highlighting; `Esc` cancels/clears).
- **Session & Metadata:** `Enter` executes native `navigateTree` (with optional 3-option branch summary prompt when `session.promptSummary = true`) or expands virtual summaries; `f`/`F` Fork At/Fork Before; `m` host label; `B` branch bookmark (`★[name]`); `gB` branch switcher; `gd` **Two-Tier Branch Diff** (zero-dep topology diff + progressive `git diff --stat`); `S` **Session Statistics**; `yi`/`yy` clipboard ID/content; `?` effective help; `q` close.

## Three-Tier State & Configuration

1. **Global Config:** Layered precedence `defaults -> global session-tree.json -> trusted .pi/session-tree.json -> runtime overrides`, validated via TypeBox (`session-tree.schema.json`).
2. **Session View State (`version: 2`):** Stored at `state/session-tree/<session-id>.json` outside Session JSONL. Persists only explicit user display overrides (`explicitDisplayOverrides`), manual fold sets, `focusedBranchId`, `selectedNodeId`, and `branchBookmarks`. Legacy `version: 1` files are automatically migrated on load, stripping full `displayOptions` snapshots so global config edits take effect immediately.
3. **Runtime State:** `sessionLeafId` is always sourced authoritatively from `ctx.sessionManager.getLeafId()`, decoupled from `selectedEntryId`, `previewNodeId`, and the in-memory `NavigationHistory` stack.

### Default configuration summary

- `vimMode`: `true`
- `navigation`: `initialFocus="active"`, `branchNavigationScope="nearest-fork"`, `branchWrap=false`, `focusFollowsSelection="branch-actions"`, `autoRevealTarget=true`, `skipHiddenNodes=true`
- `display`: `showAssistantNodes=false`, `showToolNodes=false`, `showThinkingNodes=false`, `showMetadataNodes=false`, `showCompactionNodes=true`, `depthMode="turn"`, `showDepth=true`, `maxMessageLength=80`, `layout="normal"`
- `fold`: `mode="focused-only"` (supports `"smart"`, `"all"`, `"active-only"`, `"depth-limited"`, `"manual"`), `collapseInactiveBranches=true`, `collapseLinearPaths=false`, `rememberManualOverrides=true`, `maxExpandDepth=0`
- `search`: `mode="fuzzy"`, `scope="all"`, `includeHiddenNodes=true`, `autoExpandMatches=true`, `preserveFoldState=true`, `caseSensitive=false`, `maxResults=100`
- `context`: `enabled=true`, `showTokens=true`, `showPercentage=true`, `showModel=false`, `estimateHistorical=true`, `showEstimateMarker=true`, `lazyEvaluation=true`, `cacheSize=512`
- `session`: `forkPosition="at"`, `navigateSummarize=false`, `promptSummary=false`, `confirmFork=false`, `busyBehavior="reject"`
- `performance`: `virtualRendering=true`, `renderOverscan=20`, `searchDebounceMs=40`

## Verification

After the root frozen install and build:

```sh
cd packages/pi-session-tree-explorer
bun run typecheck
bun run check
bun run test
bun run smoke
```

- `typecheck`: `tsc --noEmit` (zero errors).
- `check`: Biome lint & format check.
- `test`: Bun unit, integration, and E01–E07 acceptance suite.
- `smoke`: Isolated temporary production dependency install + live Pi RPC verification of `/stree` commands and native Navigate / Fork At / Fork Before safety.

## Permissions and risks

Extensions run with Pi's process privileges, not in a sandbox:
- Reads host session data, trusted configuration, and per-session view state.
- Writes global configuration and isolated per-session view files (`state/session-tree/<session-id>.json`).
- Invokes `git rev-parse`, `git diff --stat`, and `git status --short` read-only when running Branch Diff inside a Git workspace.
- Explicit labels, Navigate, and Fork use native host APIs; Fork creates independent session files.
- Clipboard Actions invoke `clip.exe`, `pbcopy`, `wl-copy`, or `xclip`.
- Pure browsing, search, stats, and context metrics do not issue model requests. Native branch summarization occurs only when explicitly configured or chosen by the user.
