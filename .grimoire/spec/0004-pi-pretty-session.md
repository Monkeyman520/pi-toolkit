# Pi Pretty Session

**Spec ID:** 0004
**Status:** Implemented
**Date:** 2026-04-20
**Endpoint:** Requirements specification only; implementation is not part of this refinement.

## Sources

- **U1 — Initial user request:** Add a `pretty-session` plugin that automatically renames sessions, summarizes a `title` and generates a `description`, supports dynamic configuration updates, displays start time, last update time, context length, and other metadata, and helps quickly acquire project information.
- **U2 — Confirmed decisions:**
  - Package name and directory: `packages/pi-pretty-session`.
  - UI and command surface: sync generated `title` to the native session name via `pi.setSessionName(title)`; persist structured session metadata (`title`, `description`, timestamps, context usage, project summary) via `pi.appendEntry()`; display current-session metadata in a configurable TUI widget/status surface; and expose `/pretty-session` (with short alias `/ps`) for viewing detailed session/project info, browsing/searching historical sessions, switching sessions (`ctx.switchSession`), and manually triggering re-summarization or renaming.
  - Summarization and fallback: generate `title` and one-sentence `description` via an isolated, tool-free LLM request (`ctx.modelRegistry.complete` with the active session model or a configured model), falling back automatically to local heuristic extraction (from user prompts and active files) when no model/credentials are available or when the request fails.
  - Two-layer dynamic updates: (1) dynamic session re-summarization across the conversation lifecycle based on configurable triggers (initial turn completion, every N turns, context token growth threshold, and post-compaction), with configurable protection for manual `/name` titles; and (2) hot-reloading of `~/.pi/agent/pi-pretty-session.json` (via `getAgentDir()`) on `mtime` changes without restarting or `/reload`, alongside runtime configuration commands.
  - Project information scope: automatically collect and display current `cwd` project name and path, Git status (repository/branch, dirty working tree indicator, latest commit summary), project type and manifest summary (`package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`, etc. — package name, version, key scripts/workspace structure), and historical session count for the current project.
  - Selected refinement endpoint: Requirements specification (`.grimoire/spec/0004-pi-pretty-session.md`).
- **Project:** [Context](../CONTEXT.md), [ADR 0001](../adr/0001-independently-installable-pi-packages.md), [ADR 0002](../adr/0002-typescript-esm-plugin-development-stack.md), [package development reference](../../packages/README.md).
- **P1 — Official Pi extension contract:** [Pi extensions](https://pi.dev/docs/latest/extensions) (`docs/extensions.md` in installed Pi 1.5.0), covering `pi.setSessionName()`, `pi.getSessionName()`, `pi.appendEntry()`, `ctx.sessionManager`, `ctx.getContextUsage()`, `ctx.ui.setWidget()`, `ctx.ui.setStatus()`, `ctx.ui.custom()`, `ctx.switchSession()`, `ctx.modelRegistry.complete()`, `pi.registerCommand()`, and session/turn/compaction lifecycle events.
- **P2 — Official Pi session format and commands:** [Sessions](https://pi.dev/docs/latest/sessions) and [Session File Format](https://pi.dev/docs/latest/session-format) (`docs/sessions.md` and `docs/session-format.md` in installed Pi 1.5.0), covering `SessionHeader`, `SessionInfoEntry` (single `name` field), `CustomEntry` (excluded from LLM context), `SessionManager.list()` / `SessionManager.listAll()`, and built-in interactive command precedence (`/resume`, `/session`, `/name`).

## Requirements

### S1. Independent package and baseline compliance

`pi-pretty-session` must live under `packages/pi-pretty-session/` with its own `package.json`, `tsconfig.json`, `README.md`, and `extensions/index.ts`. It must install and run independently without `pi-auto-resume`, `pi-quota-keeper`, or any undeclared sibling code. It must follow the TypeScript ESM erasable-syntax baseline, Node.js >= 22.19.0 requirement, host `peerDependencies` contract (`@earendil-works/pi-coding-agent`, `@earendil-works/pi-agent-core`, `@earendil-works/pi-tui`, `typebox` as used), and separate TypeScript, Biome, Vitest, and Pi runtime smoke checks. [U1, U2; Project]

### S2. Automatic session title and description generation with fallback

The plugin must automatically summarize the active conversation into a concise `title` and a one-sentence `description`: [U1, U2; P1, P2]

- **Primary LLM summarization:** When an active session model or configured summarization model is available, issue an isolated, tool-free completion request (`ctx.modelRegistry.complete`) using conversation context from the active branch and project context to produce `title` and `description`. The summarization call must not mutate the foreground conversation transcript or inject messages into LLM context.
- **Local heuristic fallback:** When no model or authentication is available, when LLM summarization is disabled in configuration, or when the completion call fails or times out, derive `title` and `description` deterministically from local session evidence (initial/recent user messages and touched file paths) without failing or blocking the user's turn.
- **Native and structured persistence:** Apply the generated `title` via `pi.setSessionName(title)` so Pi's built-in `/resume` picker, terminal title, and footer display it immediately. Persist the full structured metadata (`title`, `description`, source `llm` vs `heuristic` vs `manual`, start timestamp, last updated timestamp, context usage snapshot, and project summary snapshot) as an extension `CustomEntry` (`pi.appendEntry()`) that does not pollute LLM context.

### S3. Dynamic session summary updates and manual-rename protection

Session summaries must update dynamically as the conversation evolves, governed by user configuration: [U1, U2; P1]

- **Initial and incremental triggers:** Generate an initial summary after the first completed turn (when the session has user/assistant activity). Re-summarize automatically when configured dynamic triggers fire: after every configured number of completed turns, when context token usage grows past a configured delta/threshold, or when context compaction (`session_compact`) completes.
- **Manual rename respect:** Distinguish plugin-generated session names from user-initiated renames (via `/name`, `/resume` rename, or `/pretty-session rename`). By default, a manual rename locks the custom title against automatic overwrite unless the user explicitly enables overwriting manual names in configuration or triggers a manual re-summarize command.
- **Branch and lifecycle safety:** Reconstruct active session metadata accurately on `session_start` and `session_tree` branch navigation, and cancel any in-flight background summarization on `session_shutdown` or session replacement so stale results never write to a replaced session.

### S4. Dynamic configuration hot-reloading and runtime adjustment

Plugin configuration in `pi-pretty-session.json` under Pi's agent directory (`getAgentDir()`, honoring `PI_CODING_AGENT_DIR`) must support dynamic updates without restarting Pi or running `/reload`: [U1, U2; Project, P1]

- **File hot-reload:** Check configuration file metadata (`mtime`) on lifecycle boundaries and command execution, reloading and validating changes with TypeBox whenever the file is created, modified, or removed (reverting to defaults on `ENOENT`).
- **Validation safety:** Reject unknown fields or invalid types via TypeBox validation. If a modified configuration file is malformed or invalid, surface a clear warning/error notification and preserve safe behavior rather than crashing the session.
- **Runtime command updates:** Allow users to inspect and dynamically toggle or update key configuration options (such as auto-rename enablement, dynamic update cadence/thresholds, widget visibility/placement, manual-name lock, and summarization model override) directly via `/pretty-session` (or `/ps`) subcommands, persisting or applying them immediately and refreshing the active UI.

### S5. Rich session metadata display (timestamps and context length)

The plugin must expose key session metrics both in the live session UI and in the interactive command view: [U1, U2; P1, P2]

- **Displayed session metrics:**
  - `title` and `description` (with an indicator of whether the summary is LLM-generated, heuristic, or manually set).
  - **Start time (开始时间):** Derived from the session header creation timestamp (`SessionHeader.timestamp`), formatted with both readable timestamp and relative age.
  - **Last update time (上次更新时间):** Derived from the latest message/activity timestamp in the session, updated on turn completion.
  - **Context length (上下文长度):** Derived from `ctx.getContextUsage()` and session entries, showing current context token count, model `contextWindow` capacity, usage percentage (`tokens / contextWindow (%)`), and message/turn counts.
- **TUI Widget and Status integration:** In TUI mode, render a compact, configurable session & project overview widget (`ctx.ui.setWidget`, supporting placement `aboveEditor` or `belowEditor` and toggleable visibility) and/or footer status (`ctx.ui.setStatus`), updating automatically when turns settle, compaction finishes, models change, or configuration updates.

### S6. Fast project information acquisition

The plugin must automatically inspect the session's working directory (`cwd`) and present structured project context to help users quickly orient themselves when starting, resuming, or browsing sessions: [U1, U2; P1]

- **Project identity:** Project display name and normalized/shortened working directory path (`cwd`).
- **Git repository status:** Current branch name (or detached HEAD ref), working tree cleanliness (dirty vs clean change count), and the latest commit short hash and subject when `cwd` is inside a Git repository; graceful non-Git indication otherwise.
- **Project type and manifest summary:** Non-destructive detection of standard project manifests in `cwd` (including `package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`), surfacing the declared package/module name, version, workspace/monorepo indicators, and key available scripts.
- **Project session history stats:** Total number of saved Pi sessions associated with the current project directory (via `SessionManager.list`).

### S7. Interactive command and cross-session browser (`/pretty-session` and `/ps`)

Because Pi's built-in `/resume`, `/session`, and `/name` commands take precedence in interactive mode, the plugin must register `/pretty-session` and short alias `/ps`: [U2; P1, P2]

- **Interactive session browser & project dashboard (TUI):** Opening `/pretty-session` or `/ps` (with no arguments or `list`/`browse`) in TUI mode launches a custom interactive component (`ctx.ui.custom`) that displays the current project overview alongside a searchable list of sessions (current project or all projects) showing each session's `title`, `description`, start time, last update time, context/message stats, and project `cwd`/branch, with actions to switch to a selected session (`ctx.switchSession`), rename it, or regenerate its summary.
- **Direct subcommands:** Support explicit subcommands for non-modal or scripted use, including viewing current session + project details (`info` / `project`), triggering immediate re-summarization (`summarize` / `refresh`), setting a custom title/description (`rename`), and viewing or updating configuration (`config` / `toggle`).

### S8. Truthful documentation and verification

`packages/pi-pretty-session/README.md` and root collection documentation (`README.md`, `packages/README.md`) must accurately document the new package, its commands, configuration schema and hot-reload behavior, UI surfaces, LLM vs heuristic summarization behavior, permissions (local filesystem reads for project manifests/config, `git` status inspection, and optional model completion calls), and verified commands. [U1, U2; Project, P1]

## Solution

### Package layout

```text
packages/pi-pretty-session/
├── package.json
├── tsconfig.json
├── biome.json
├── README.md
├── extensions/
│   └── index.ts       # Main Pi extension entry (with modular helpers under extensions/)
└── tests/
    ├── *.test.ts      # Vitest unit/integration tests
    └── pi-smoke.mjs   # Isolated real-Pi RPC smoke verification
```

### Seams

| Seam | Connects | Expects | Provides |
| --- | --- | --- | --- |
| Session lifecycle & state | Pi host (`ExtensionAPI`, `ReadonlySessionManager`) → `pi-pretty-session` | `session_start`, `turn_end`, `agent_settled`, `session_compact`, `session_tree`, `session_info_changed`, `session_shutdown`, `getContextUsage()` | Accurate start/update timestamps, context token/window metrics, and lifecycle-safe summary triggers |
| Native name & custom metadata persistence | `pi-pretty-session` → Pi `SessionManager` | `pi.setSessionName(title)` and `pi.appendEntry("pretty-session", metadata)` | Title visible in built-in `/resume`, footer, and terminal title; rich `description` and metrics persisted across reloads without entering LLM context |
| Title & description summarization | Conversation branch + project summary → `ctx.modelRegistry.complete()` or local heuristic | Active or configured model auth, bounded prompt, abort signal; fallback when unavailable/failed | Concise `title` and one-sentence `description` without mutating foreground conversation history |
| Dynamic configuration | `~/.pi/agent/pi-pretty-session.json` & `/ps config` → runtime state | TypeBox-validated JSON config and file `mtime` checks / command updates | Hot-reloaded settings and immediate UI/trigger reconfiguration without Pi restart |
| Project inspector | Session `cwd` → filesystem & `pi.exec("git", ...)` | Read-only access to `cwd` manifests (`package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`), Git metadata, and `SessionManager.list(cwd)` | Fast, structured project summary (name, path, Git branch/dirty/commit, manifest summary, project session count) |
| TUI presentation & session browser | Metadata + project info → `ctx.ui` (`setWidget`, `setStatus`, `custom`, `switchSession`) | Interactive TUI context or graceful non-TUI notification fallback | Persistent/toggleable session & project widget plus interactive `/pretty-session` (`/ps`) browser and switcher |

## End-to-End Tests

### Auto-summarize and rename on initial conversation
- **Given:** A new Pi session in a project directory with `pi-pretty-session` loaded and default configuration enabled.
- **When:** The user submits a prompt and the first assistant turn settles.
- **Then:** The plugin generates a `title` and `description` (via the active model or heuristic fallback if no model is callable), sets the native session name via `pi.setSessionName(title)`, appends a `pretty-session` custom metadata entry, and updates the session widget/status with the title, description, start time, last update time, context length, and project info. [S2, S5, S6]

### Dynamic re-summarization across turns and compaction
- **Given:** An existing session whose conversation continues past the configured turn interval or context-growth threshold, or undergoes `/compact`.
- **When:** The qualifying turn or compaction completes and the session name was not locked by a manual rename.
- **Then:** The plugin refreshes the `title`, `description`, last update time, and context length to reflect the updated conversation state. [S2, S3, S5]

### Manual rename lock protection
- **Given:** A session where the user manually sets a name via `/name`, `/pretty-session rename`, or `/resume` rename while manual-rename protection is enabled (default).
- **When:** Subsequent turns complete that would otherwise trigger dynamic auto-renaming.
- **Then:** The user's manual title is preserved and not overwritten by automatic summarization, while timestamps and context length continue to update. [S3, S5]

### Dynamic configuration hot-reload without restart
- **Given:** A running Pi session with `pi-pretty-session` loaded.
- **When:** The user modifies `pi-pretty-session.json` in the Pi agent directory (e.g., changing widget placement, update interval, or disabling auto-rename) or runs `/ps config` to update settings.
- **Then:** On the next command or lifecycle event, the new configuration takes effect immediately without restarting Pi or running `/reload`; if the JSON file is malformed, an explicit error notification is shown and safe operation continues. [S4]

### Fast project information inspection and session browser
- **Given:** A project directory containing a manifest (e.g., `package.json`) and Git repository with existing Pi sessions.
- **When:** The user invokes `/pretty-session` (or `/ps`) or `/ps project`.
- **Then:** The plugin displays the project name, path, Git branch, dirty status, latest commit summary, manifest details (package name, version, key scripts), and project session count, and in TUI browser mode allows searching sessions by title/description and switching to a selected session. [S5, S6, S7]

### Standalone package verification
- **Given:** `packages/pi-pretty-session` copied into an isolated directory outside the repository checkout without sibling packages.
- **When:** `npm run typecheck`, `npm run check`, `npm test`, and `npm run smoke` (real Pi RPC) are executed.
- **Then:** All static checks, unit tests, and the isolated real-Pi smoke test pass without requiring `pi-auto-resume` or `pi-quota-keeper`. [S1, S8]

## Decisions

- **Package identity `packages/pi-pretty-session`:** Matches the repository's `pi-<name>` package naming convention (`pi-auto-resume`, `pi-quota-keeper`) under [ADR 0001](../adr/0001-independently-installable-pi-packages.md) and [ADR 0002](../adr/0002-typescript-esm-plugin-development-stack.md). [U2]
- **Dual persistence (`pi.setSessionName` + `CustomEntry`):** Pi's native `session_info` entry stores only a single `name` string and built-in `/resume` cannot be overridden by an extension command. Writing `title` via `pi.setSessionName()` ensures native surfaces (`/resume`, footer, terminal title) work seamlessly, while `pi.appendEntry()` stores the full `description` and session/project metadata without adding tokens to LLM context. [U2; P1, P2]
- **LLM summarization with local heuristic fallback:** Uses `ctx.modelRegistry.complete()` in an isolated request for high-quality titles/descriptions while guaranteeing offline, unauthenticated, or error-path resilience through deterministic heuristic extraction. [U2; P1]
- **Two-layer dynamic configuration:** Covers both dynamic session summary updates as conversations evolve and hot-reloading of `pi-pretty-session.json` / runtime command adjustments without requiring a session restart. [U2]
- **Bounded project inspection:** Project metadata is limited to `cwd` identity, Git status/branch/latest commit, standard manifest summaries (`package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`), and project session counts, avoiding slow recursive filesystem scans or unrelated external network calls. [U2]

## Out of Scope

- Overriding or patching Pi's built-in `/resume`, `/session`, or `/name` command handlers internally (Pi dispatches built-in interactive slash commands before extension commands). [P1, P2]
- Cross-process background daemons or summarizing inactive session files while Pi is not running. [U2; Project]
- Modifying production plugin code, installing dependencies, or executing implementation/QA during this refinement stage. [U2]
