# Pi Pretty Session

**Spec ID:** 0004
**Status:** Implemented
**Date:** 2026-04-20
**Endpoint:** Requirements specification only; implementation is not part of this refinement.

## Sources

- **U1 — Initial user request:** Add a `pretty-session` plugin that automatically renames sessions, summarizes a `title` and generates a `description`, supports dynamic configuration updates, displays start time, last update time, context length, and other metadata, and helps quickly acquire project information.
- **U2 — Confirmed initial decisions:**
  - Package name and directory: `packages/pi-pretty-session`.
  - UI and command surface: sync generated `title` to the native session name via `pi.setSessionName(title)`; persist structured session metadata (`title`, `description`, timestamps, context usage, project summary) via `pi.appendEntry()`; display current-session metadata in a configurable TUI widget/status surface; and expose `/pretty-session` (with short alias `/ps`) for viewing detailed session/project info, browsing/searching historical sessions, switching sessions (`ctx.switchSession`), and manually triggering re-summarization or renaming.
  - Summarization and fallback: generate `title` and one-sentence `description` via an isolated, tool-free LLM request (`ctx.modelRegistry.complete` with the active session model or a configured model), falling back automatically to local heuristic extraction (from user prompts and active files) when no model/credentials are available or when the request fails.
  - Two-layer dynamic updates: (1) dynamic session re-summarization across the conversation lifecycle based on configurable triggers (initial turn completion, every N turns, context token growth threshold, and post-compaction), with configurable protection for manual `/name` titles; and (2) hot-reloading of `~/.pi/agent/pi-pretty-session.json` (via `getAgentDir()`) on `mtime` changes without restarting or `/reload`, alongside runtime configuration commands.
  - Project information scope: automatically collect and display current `cwd` project name and path, Git status (repository/branch, dirty working tree indicator, latest commit summary), project type and manifest summary (`package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`, etc. — package name, version, key scripts/workspace structure), and historical session count for the current project.
- **U3 — Title & summary optimization requirements:**
  1. **Title-once / continuous-summary mode:** Add a configuration option (`titleUpdateMode: "once" | "dynamic"`) controllable via config file hot-reload, `/ps config`, `/ps toggle`, and the TUI settings panel. When set to `"once"`, determine and write `title` (and sync to Pi's native session name) only on the initial summary trigger; on subsequent automatic triggers (`updateEveryTurns`, `contextDeltaTokens`, or `/compact`), do not update `title` (preserving the existing `title`, keeping `manualLocked: false`, and retaining the original `source` status distinct from manual locks), while continuing to update `description` and session metrics. Manual `/ps summarize` still forces refreshing both `title` and `description`.
  2. **Duplicate title deduplication with local timestamp suffix:** When generating or updating a session title, check whether any other historical session in the same project (or current session directory) already uses the same title. If a duplicate exists, automatically append a ` [YYYY-MM-DD HH:mm:ss]` local-time suffix (prioritizing the session's creation timestamp `createdAt`), reserving the suffix length budget before truncating the base title so `maxTitleLength` never truncates the timestamp suffix, and avoiding duplicate suffix concatenation when retaining an existing title during summary-only updates.
  3. **Strict conciseness for title and description:** Tighten default length budgets (`maxTitleLength` and `maxDescriptionLength`) and the heuristic assembly strategy to avoid redundant multi-segment concatenation or abrupt trailing truncation. Optimize the LLM summarization prompt to require `title` to be an ultra-concise phrase (directly naming the topic without filler modifiers or trailing punctuation) and `description` to be a single highly condensed sentence (directly stating core objective and current progress without meta-boilerplate such as `"本会话旨在……"` or `"This session aims to..."`).
  4. **Strip expanded Skill blocks and command prefixes from user messages:** Before extracting user messages for heuristic summarization or building LLM conversation excerpts, identify and strip Pi-expanded `<skill ...>...</skill>` blocks as well as leading `/skill:xxx`, `/...`, and `$...` command prefixes, retaining only the user's real prompt text. If a message contains only a skill block with no extra user input, extract only the concise skill name as a fallback clue so full `SKILL.md` instructions never pollute generated titles or descriptions.
  5. **Configurable generation language for `title` and `description`:** Add a `language` configuration option supporting `"auto"` (follow the conversation's primary language) or an explicit target language (such as `"zh-CN"`, `"en"`, `"ja"`), adjustable via `pi-pretty-session.json` hot-reload, `/ps config`, and the TUI settings panel. In LLM mode, inject explicit language constraints into the summarization prompt so persisted `title` and `description` strictly use the configured language even when the conversation is in another language. In Heuristic fallback mode, localize label prefixes (`Latest:`, `Outcome:`, `Files:`, `Project:`, skill fallback prefix) and empty-session fallback title/description to the effective language, balancing character/word budgets across CJK and Latin text.
- **U4 — Confirmed optimization decisions:**
  - `titleUpdateMode` defaults to `"once"` (union `"once" | "dynamic"`); `/ps toggle title` (and aliases `titlemode`, `titleupdatemode`) cycles between `"once"` and `"dynamic"`.
  - `language` defaults to `"auto"` with preset candidates `["auto", "zh-CN", "en", "ja"]` (schema accepts preset values or valid BCP-47 language tags). Under `"auto"`, heuristic fallback detects dominant conversation language from user/assistant text (CJK/kana character presence vs Latin) and applies matching localized labels and length rules.
  - Default length budgets tighten to `maxTitleLength: 40` (schema integer range `24..120`, minimum `24` guaranteeing space for a base title plus the 22-character ` [YYYY-MM-DD HH:mm:ss]` deduplication suffix) and `maxDescriptionLength: 100` (schema integer range `24..280`).
  - Title deduplication runs whenever a title is generated or updated (initial auto-summary, `"dynamic"` auto-summary, manual `/ps summarize`, and `/ps rename`), inspecting other sessions in `SessionManager.list(cwd, sessionDir)` (excluding the current session by `sessionId` and normalized `sessionFile`) against both native `SessionInfo.name` and persisted `pretty-session` entry `title`. Any existing trailing ` [\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}]` suffix on the candidate title is stripped before matching and before truncating/appending a fresh suffix. Summary-only updates (`updateTitle: false`) preserve the current title verbatim without re-running deduplication.
  - Selected refinement endpoint: Updated requirements specification (`.grimoire/spec/0004-pi-pretty-session.md`); no `CONTEXT.md` or ADR changes required.
- **Project:** [Context](../CONTEXT.md), [ADR 0001](../adr/0001-independently-installable-pi-packages.md), [ADR 0002](../adr/0002-typescript-esm-plugin-development-stack.md), [ADR 0004](../adr/0004-unified-command-grammar-and-dynamic-tui-configuration.md), [ADR 0005](../adr/0005-versioned-plugin-support-library.md), [package development reference](../../packages/README.md).
- **P1 — Official Pi extension contract:** [Pi extensions](https://pi.dev/docs/latest/extensions) (`docs/extensions.md` in installed Pi), covering `pi.setSessionName()`, `pi.getSessionName()`, `pi.appendEntry()`, `ctx.sessionManager`, `ctx.getContextUsage()`, `ctx.ui.setWidget()`, `ctx.ui.setStatus()`, `ctx.ui.custom()`, `ctx.switchSession()`, `ctx.modelRegistry.complete()`, `pi.registerCommand()`, and session/turn/compaction lifecycle events.
- **P2 — Official Pi session format, commands, and skills:** [Sessions](https://pi.dev/docs/latest/sessions), [Session File Format](https://pi.dev/docs/latest/session-format), and [Skills](https://pi.dev/docs/latest/skills) (`docs/sessions.md`, `docs/session-format.md`, and `docs/skills.md` in installed Pi), covering `SessionHeader`, `SessionInfoEntry` (single `name` field), `CustomEntry` (excluded from LLM context), `SessionManager.list()` / `SessionManager.listAll()`, built-in interactive command precedence (`/resume`, `/session`, `/name`), and `<skill name="..." location="...">...</skill>` prompt expansion.

## Requirements

### S1. Independent package and baseline compliance

`pi-pretty-session` must live under `packages/pi-pretty-session/` with its own `package.json`, `tsconfig.json`, `README.md`, and `extensions/index.ts`. It must install and run independently without `pi-auto-resume`, `pi-quota-keeper`, or any undeclared sibling code (using the declared `pi-plugin-support` library dependency per ADR 0005). It must follow the TypeScript ESM erasable-syntax baseline, Node.js >= 22.19.0 requirement, host `peerDependencies` contract (`@earendil-works/pi-coding-agent`, `@earendil-works/pi-ai`, `@earendil-works/pi-tui`, `typebox` as used), and separate TypeScript, Biome, Vitest, and Pi runtime smoke checks. [U1, U2; Project]

### S2. Concise, skill-clean, language-aware session title and description generation

The plugin must automatically summarize the active conversation into a concise `title` and a single-sentence `description` within strict length budgets (defaulting to `maxTitleLength: 40` with range `24..120`, and `maxDescriptionLength: 100` with range `24..280`): [U1, U2, U3, U4; P1, P2]

- **Primary LLM summarization and prompt discipline:** When `useLlm` is enabled and an active session model or configured summarization model is available, issue an isolated, tool-free completion request (`ctx.modelRegistry.complete`) using conversation excerpts from the active branch and project context. The prompt must explicitly require:
  - `title`: an ultra-concise topic phrase directly identifying the core subject, with no filler modifiers, quotes, or trailing punctuation, within `maxTitleLength`.
  - `description`: a single, highly condensed sentence stating the core objective and current progress/outcome directly, explicitly prohibiting meta-openers or boilerplate (such as `"本会话旨在…"`, `"用户希望…"`, `"This session focuses on..."`, or `"In this conversation..."`), within `maxDescriptionLength`.
  - The summarization call must not mutate the foreground conversation transcript or inject messages into LLM context.
- **Skill block and command prefix stripping:** Before extracting user message text for either LLM conversation excerpts or local heuristic summarization, strip Pi-expanded `<skill\b[^>]*>[\s\S]*?<\/skill>` blocks (capturing the `name` attribute when present) as well as leading `/skill:<name>`, `/<command>`, and `$<skill-name>` command tokens so only the user's real prompt text remains. When a user message consists solely of a skill expansion or skill command with no additional user prompt text, emit only a concise skill name clue (e.g., `Skill: <name>` or localized equivalent) so `SKILL.md` body instructions never pollute titles, descriptions, or LLM summarization prompts.
- **Configurable generation language (`language`):** Support `language` in configuration (defaulting to `"auto"`, with presets `"auto"`, `"zh-CN"`, `"en"`, `"ja"` and support for valid BCP-47 language tags):
  - **LLM mode:** When `language` is `"auto"`, instruct the model to write `title` and `description` in the dominant natural language of the user's conversation. When `language` specifies an explicit target language (e.g., `"zh-CN"`, `"en"`, `"ja"`), instruct the model that `title` and `description` must be generated strictly in that target language even if the conversation transcript is in another language.
  - **Heuristic fallback mode:** Resolve the effective language (using the configured target language, or detecting dominant CJK/kana vs Latin characters from conversation text when `language === "auto"`). Adapt heuristic label prefixes (such as `Latest:` / `最新:` / `最新:`, `Outcome:` / `进展:` / `結果:`, `Files:` / `文件:` / `ファイル:`, `Project:` / `项目:` / `プロジェクト:`, and skill fallback labels) as well as empty-session default title/description templates to the effective language.
- **Tightened local heuristic fallback:** When no model or authentication is available, when `useLlm` is disabled, or when the completion call fails or times out, derive `title` and `description` deterministically without blocking the turn. Rather than hard-concatenating multiple long segments and slicing mid-phrase at the end, assemble heuristic descriptions selectively within `maxDescriptionLength` (prioritizing core task intent and the single most informative progress/outcome or touched-file clue that fits within the language-aware character/word budget).
- **Native and structured persistence:** Apply generated or updated `title` values via `pi.setSessionName(title)` so Pi's built-in `/resume` picker, terminal title, and footer display it immediately. Persist the full structured metadata (`title`, `description`, source `llm` vs `heuristic` vs `manual`, `manualLocked`, start timestamp, last updated timestamp, context usage snapshot, and project summary snapshot) as an extension `CustomEntry` (`pi.appendEntry()`) that does not pollute LLM context.

### S3. Title update policy (`titleUpdateMode`), dynamic summary updates, and duplicate title deduplication

Session summaries must update dynamically as the conversation evolves, governed by user configuration and title stability rules: [U1, U2, U3, U4; P1, P2]

- **Initial and incremental triggers:** Generate an initial summary after the first completed turn (when the session has user/assistant activity). Re-summarize automatically when configured triggers fire: after every `updateEveryTurns` completed turns, when context token usage grows by at least `contextDeltaTokens`, or when context compaction (`session_compact`) completes while `summarizeOnCompact` is enabled.
- **Title update mode (`titleUpdateMode: "once" | "dynamic"`):**
  - When `titleUpdateMode` is `"once"` (default), automatic summarization determines, deduplicates, and writes `title` (and syncs to `pi.setSessionName(title)`) only on the session's initial summary generation (when no prior summary exists or `summarizedAtTurn === 0`). On subsequent automatic triggers (`turn_interval`, `context_delta`, `compact`), automatic summarization must **not** overwrite `title` or call `pi.setSessionName`; it must preserve the existing `title`, keep `manualLocked: false`, and preserve the existing `source` (`"llm"` or `"heuristic"`, distinct from `"manual"`), while updating `description` and session metrics.
  - When `titleUpdateMode` is `"dynamic"`, automatic triggers refresh both `title` and `description` unless blocked by an active manual-rename lock.
  - Explicit manual execution of `/ps summarize` (or `/ps refresh`) always forces refreshing both `title` and `description` regardless of `titleUpdateMode` or prior `manualLocked` state.
- **Manual rename respect:** Distinguish plugin-generated session names (including `titleUpdateMode: "once"` retained titles) from user-initiated renames (via `/name`, `/resume` rename, or `/ps rename`). When `protectManualName` is enabled (default), a user-initiated rename sets `source: "manual"` and `manualLocked: true`, locking the custom title against automatic overwrite even in `"dynamic"` mode until `/ps unlock` or `/ps summarize` is run.
- **Duplicate title deduplication with timestamp suffix:**
  - Whenever a session title is newly generated or updated (initial automatic summary, `"dynamic"` automatic title update, manual `/ps summarize`, or `/ps rename`), inspect other saved sessions in the current project / session directory (`SessionManager.list(cwd, sessionDir)`, excluding the active session by `sessionId` and normalized `sessionFile`) to check whether any other session already has the same title (matching against either native `SessionInfo.name` or persisted `pretty-session` custom entry `title`).
  - Before checking for duplicates or appending a suffix, strip any existing trailing ` [\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}]` suffix from the candidate base title.
  - If the candidate title collides with another session's title, format a local-time suffix ` [YYYY-MM-DD HH:mm:ss]` (22 characters including the leading space) from the active session's creation timestamp (`metrics.createdAt` / `SessionHeader.timestamp`, falling back to current time only if unavailable). Reserve the 22-character suffix budget first, truncate the base title to `maxTitleLength - 22` characters, and append ` [YYYY-MM-DD HH:mm:ss]` so the full timestamp suffix is never truncated by `maxTitleLength`.
  - When an automatic summary update retains the existing title (`updateTitle: false`, such as subsequent turns in `titleUpdateMode: "once"` or when `manualLocked` is preserved), keep the existing title as-is without re-running deduplication or re-appending a timestamp suffix.
- **Branch and lifecycle safety:** Reconstruct active session metadata accurately on `session_start` and `session_tree` branch navigation, and cancel any in-flight background summarization on `session_shutdown` or session replacement so stale results never write to a replaced session.

### S4. Dynamic configuration hot-reloading and runtime adjustment

Plugin configuration in `pi-pretty-session.json` under Pi's agent directory (`getAgentDir()`, honoring `PI_CODING_AGENT_DIR`) must support dynamic updates without restarting Pi or running `/reload`: [U1, U2, U3, U4; Project, P1]

- **File hot-reload:** Check configuration file metadata (`mtime`) on lifecycle boundaries and command execution, reloading and validating changes with TypeBox whenever the file is created, modified, or removed (reverting to defaults on `ENOENT`).
- **Validation safety:** Validate all fields—including `titleUpdateMode` (`"once" | "dynamic"`, default `"once"`), `language` (default `"auto"`, presets `["auto", "zh-CN", "en", "ja"]` or valid BCP-47 tag), `maxTitleLength` (integer `24..120`, default `40`), and `maxDescriptionLength` (integer `24..280`, default `100`)—and reject unknown fields or invalid types via TypeBox validation. If a modified configuration file is malformed or invalid, surface a clear warning/error notification and preserve the previous valid configuration rather than crashing the session.
- **Runtime command and TUI updates:** Allow users to inspect and dynamically update or toggle configuration options (including `/ps config titleUpdateMode <once|dynamic>`, `/ps config language <auto|zh-CN|en|ja|...>`, `/ps toggle title` to switch `titleUpdateMode` between `"once"` and `"dynamic"`, plus existing boolean toggles `auto|llm|widget|status|lock|compact` and interactive TUI `SettingsList` items) directly via `/pretty-session` (`/ps`), persisting and applying changes immediately and refreshing the active UI.

### S5. Rich session metadata display (timestamps and context length)

The plugin must expose key session metrics both in the live session UI and in the interactive command view: [U1, U2, U3; P1, P2]

- **Displayed session metrics:**
  - `title` and `description` (with an indicator of whether the summary is `llm`, `heuristic`, or `manual (locked)`, keeping `titleUpdateMode: "once"` auto-generated titles labeled with their actual `llm` / `heuristic` source rather than `manual (locked)`).
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

Because Pi's built-in `/resume`, `/session`, and `/name` commands take precedence in interactive mode, the plugin must register `/pretty-session` and short alias `/ps`: [U2, U3, U4; Project, P1, P2]

- **Interactive session browser & project dashboard (TUI):** Opening `/pretty-session` or `/ps` (with no arguments or `list`/`browse`) in TUI mode launches a custom interactive component (`ctx.ui.custom`) that displays the current project overview alongside a searchable list of sessions (current project or all projects) showing each session's `title`, `description`, start time, last update time, context/message stats, and project `cwd`/branch, with actions to switch to a selected session (`ctx.switchSession`), rename it, or regenerate its summary.
- **Direct subcommands and completions:** Support explicit subcommands and context-aware completions for viewing current session + project details (`info` / `status` / `project`), triggering immediate re-summarization (`summarize` / `refresh`), setting a custom title/description (`rename`), unlocking a manual title (`unlock`), and viewing or updating configuration (`config` / `toggle`, including `titleUpdateMode`, `language`, and `/ps toggle title`).

### S8. Truthful documentation and verification

`packages/pi-pretty-session/README.md` and root collection documentation (`README.md`, `packages/README.md`) must accurately document the package, its commands, configuration schema (including `titleUpdateMode`, `language`, and updated `maxTitleLength` / `maxDescriptionLength` defaults) and hot-reload behavior, duplicate title timestamp deduplication, skill-block stripping, LLM vs localized heuristic summarization behavior, permissions, and verified commands. [U1, U2, U3, U4; Project, P1]

## Solution

### Package layout

```text
packages/pi-pretty-session/
├── package.json
├── tsconfig.json
├── biome.json
├── README.md
├── extensions/
│   ├── index.ts          # Main Pi extension entry & lifecycle wiring
│   ├── config.ts         # TypeBox config schema, hot-reload store, setOption & toggleOption
│   ├── summarizer.ts     # Skill stripping, language-aware LLM & heuristic summarization, trigger logic
│   ├── session-state.ts  # Session state owner, title-once preservation, duplicate title deduplication
│   ├── commands.ts       # Command parser & argument completions (/ps config, /ps toggle)
│   ├── display.ts        # Status line, widget, dashboard, and config report formatting
│   ├── browser.ts        # Historical session enrichment & interactive TUI session browser
│   ├── project.ts        # Fast Git, manifest, and session-count project inspector
│   └── ui.ts             # Interactive TUI SettingsList panel & plugin switcher integration
└── tests/
    ├── *.test.ts         # Vitest unit/integration tests
    └── pi-smoke.mjs      # Isolated real-Pi RPC smoke verification
```

### Seams

| Seam | Connects | Expects | Provides |
| --- | --- | --- | --- |
| Session lifecycle & state | Pi host (`ExtensionAPI`, `ReadonlySessionManager`) → `SessionState` | `session_start`, `agent_settled`, `session_compact`, `session_tree`, `session_info_changed`, `session_shutdown`, `getContextUsage()` | Accurate start/update timestamps, context token/window metrics, and lifecycle-safe summary triggers respecting `titleUpdateMode` and `manualLocked` |
| Native name, deduplication & custom metadata persistence | `SessionState` → `SessionManager.list(cwd, sessionDir)` & Pi `SessionManager` | Candidate `title`, `updateTitle` flag, active `sessionId`/`sessionFile`, `createdAt`, `maxTitleLength`, `pi.setSessionName(title)`, `pi.appendEntry("pretty-session", metadata)` | Deduplicated title with reserved ` [YYYY-MM-DD HH:mm:ss]` local-time suffix on collision (never truncated by `maxTitleLength`, never duplicated on summary-only updates), synced to native surfaces and persisted in `CustomEntry` |
| Skill-clean, language-aware summarization | Conversation branch + project summary + `PrettySessionConfig` → `ctx.modelRegistry.complete()` or local heuristic | User/assistant entries (with `<skill>...</skill>` blocks and command prefixes stripped), `language` (`"auto"` or target tag), `maxTitleLength`, `maxDescriptionLength`, abort signal | Concise topic phrase `title` and boilerplate-free single-sentence `description` in the configured/detected language, with localized heuristic fallback |
| Dynamic configuration | `~/.pi/agent/pi-pretty-session.json`, `/ps config`, `/ps toggle`, TUI `SettingsList` → `ConfigManager` | TypeBox-validated JSON config (`titleUpdateMode`, `language`, length budgets, triggers, UI flags) and file `mtime` checks / command updates | Hot-reloaded settings, boolean and two-state mode toggling (`/ps toggle title`), and immediate UI/summarizer reconfiguration without Pi restart |
| Project inspector | Session `cwd` → filesystem & `pi.exec("git", ...)` | Read-only access to `cwd` manifests (`package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`), Git metadata, and `SessionManager.list(cwd)` | Fast, structured project summary (name, path, Git branch/dirty/commit, manifest summary, project session count) |
| TUI presentation & session browser | Metadata + project info → `ctx.ui` (`setWidget`, `setStatus`, `custom`, `switchSession`) | Interactive TUI context or graceful non-TUI notification fallback | Persistent/toggleable session & project widget, TUI settings panel, and interactive `/pretty-session` (`/ps`) browser and switcher |

## End-to-End Tests

### Title-once mode preserves initial title while continuously updating summary
- **Given:** A new Pi session with default configuration (`titleUpdateMode: "once"`, `updateEveryTurns: 3`).
- **When:** The first assistant turn settles, and later the conversation reaches turn 4 (or exceeds `contextDeltaTokens` or runs `/compact`).
- **Then:** After turn 1, both `title` and `description` are generated, `pi.setSessionName(title)` is called, and metadata is persisted with `manualLocked: false` and `source: "llm"` (or `"heuristic"`). On turn 4, `description` and session metrics refresh to reflect the latest progress, while the initial `title` remains unchanged, `manualLocked` remains `false`, `source` retains its non-manual value, and running `/ps summarize` manually still forces refreshing both `title` and `description`. [S2, S3, S5]

### Duplicate title deduplication with reserved timestamp suffix budget
- **Given:** A project directory that already contains a saved historical session titled `"Refactor Auth Middleware"` (either in native `SessionInfo.name` or `pretty-session` entry metadata), and a new session created at local time `2026-11-18 14:40:40` with `maxTitleLength: 40`.
- **When:** The new session generates or is renamed to a colliding title (or a long colliding title approaching `maxTitleLength`), and later performs a summary-only update (`updateTitle: false`).
- **Then:** The plugin strips any pre-existing timestamp suffix before matching, detects the duplicate among other sessions in the project, reserves 22 characters for ` [2026-11-18 14:40:40]`, truncates the base title within the remaining budget (`<= 18` chars), and writes the deduplicated title ending with the complete `[2026-11-18 14:40:40]` suffix. Subsequent summary-only updates preserve that title without appending a second timestamp suffix. [S2, S3]

### Skill block stripping and command prefix cleanup in heuristic and LLM excerpts
- **Given:** A user message beginning with a Pi-expanded `<skill name="grimoire-refine" location="...">...full SKILL.md instructions...</skill>` block followed by `$grimoire-refine optimize session titles`, or a user message containing only a `<skill name="pdf" location="...">...</skill>` block with no trailing prompt text.
- **When:** `pi-pretty-session` builds the LLM conversation excerpt and computes the local heuristic summary.
- **Then:** The `<skill>...</skill>` body and leading `$grimoire-refine` / `/skill:...` prefix are stripped so only `"optimize session titles"` enters the heuristic extractor and LLM prompt excerpt; for a skill-only message, only the concise skill name clue (`Skill: pdf` / localized equivalent) is used, preventing `SKILL.md` content from polluting `title` or `description`. [S2]

### Configurable language and strict conciseness across LLM and heuristic modes
- **Given:** A session configured with `language: "zh-CN"` (or `"en"`, `"ja"`, or `"auto"`) and tightened budgets (`maxTitleLength: 40`, `maxDescriptionLength: 100`).
- **When:** Summarization runs via LLM or falls back to local heuristics on an English, Chinese, or mixed-language conversation.
- **Then:** In LLM mode, the system prompt enforces the target language and forbids filler modifiers, trailing title punctuation, and meta-openers (`"本会话旨在…"`, `"This session aims to..."`). In Heuristic mode, labels (`最新:`/`进展:`/`文件:`/`项目:` vs `Latest:`/`Outcome:`/`Files:`/`Project:`) and empty-session defaults match the configured or auto-detected conversation language, and secondary segments are bounded or omitted cleanly rather than overflowing into awkward multi-segment truncation. [S2, S4]

### Dynamic configuration hot-reload and runtime toggling without restart
- **Given:** A running Pi session with `pi-pretty-session` loaded.
- **When:** The user modifies `pi-pretty-session.json` (e.g., setting `titleUpdateMode: "dynamic"` or `language: "zh-CN"`), runs `/ps config language en`, runs `/ps toggle title`, or updates settings in the TUI settings panel.
- **Then:** On the next lifecycle event or immediately upon command execution, the updated configuration is validated, persisted, and applied without restarting Pi or running `/reload`; malformed config files surface an error notification while retaining the previous valid configuration. [S4, S7]

### Standalone package verification
- **Given:** `packages/pi-pretty-session` copied into an isolated directory outside the repository checkout without sibling packages.
- **When:** `npm run typecheck`, `npm run check`, `npm test`, and `npm run smoke` (real Pi RPC) are executed.
- **Then:** All static checks, unit tests, and the isolated real-Pi smoke test pass without requiring `pi-auto-resume` or `pi-quota-keeper`. [S1, S8]

## Decisions

- **Package identity `packages/pi-pretty-session`:** Matches the repository's `pi-<name>` package naming convention under [ADR 0001](../adr/0001-independently-installable-pi-packages.md), [ADR 0002](../adr/0002-typescript-esm-plugin-development-stack.md), and [ADR 0005](../adr/0005-versioned-plugin-support-library.md). [U2]
- **Dual persistence (`pi.setSessionName` + `CustomEntry`):** Pi's native `session_info` entry stores only a single `name` string and built-in `/resume` cannot be overridden by an extension command. Writing `title` via `pi.setSessionName()` ensures native surfaces (`/resume`, footer, terminal title) work seamlessly, while `pi.appendEntry()` stores the full `description` and session/project metadata without adding tokens to LLM context. [U2; P1, P2]
- **Default `titleUpdateMode: "once"` with distinct `source` preservation:** Defaulting `titleUpdateMode` to `"once"` stabilizes session titles in `/resume` and `/ps browse` after the first turn while allowing `description` and metrics to evolve continuously. Keeping `manualLocked: false` and preserving the original `"llm" | "heuristic"` `source` distinguishes policy-stabilized titles from user-locked manual renames (`source: "manual", manualLocked: true`). Supporting `/ps toggle title` alongside `/ps config titleUpdateMode` follows [ADR 0004](../adr/0004-unified-command-grammar-and-dynamic-tui-configuration.md). [U3, U4]
- **Pre-reserved local timestamp suffix for duplicate titles:** Appending ` [YYYY-MM-DD HH:mm:ss]` (22 characters, formatted in local time from `createdAt`) only when another session in the same project/directory shares the base title keeps unique titles clean while making colliding titles immediately distinguishable in `/resume` and `/ps`. Reserving the 22-character suffix budget before truncating the base title (with `maxTitleLength` minimum raised to `24`) guarantees the timestamp is never cut off. [U3, U4; P2]
- **Tightened default length budgets (`40 / 100`) and anti-boilerplate prompt/heuristics:** Lowering default `maxTitleLength` from `60` to `40` and `maxDescriptionLength` from `160` to `100`, combined with prompt prohibitions on meta-openers and selective heuristic segment assembly, prevents verbose titles and truncated multi-part descriptions in compact TUI widgets and session pickers. [U3, U4]
- **Skill expansion stripping with skill-name fallback:** Pi prepends `<skill name="..." location="...">...</skill>` blocks to user messages when skills are invoked. Stripping those blocks and command prefixes before summarization prevents `SKILL.md` instructions from masquerading as user intent, while falling back to the skill's `name` attribute when no user body text exists preserves a meaningful clue. [U3, U4; P2]
- **Configurable `language` (`"auto"` default + explicit language overrides) across LLM and heuristic paths:** Supporting `language` in both the LLM system prompt and local heuristic labels/templates ensures consistent presentation whether LLM summarization succeeds or falls back to local extraction. [U3, U4]

## Out of Scope

- Overriding or patching Pi's built-in `/resume`, `/session`, or `/name` command handlers internally (Pi dispatches built-in interactive slash commands before extension commands). [P1, P2]
- Cross-process background daemons or summarizing inactive session files while Pi is not running. [U2; Project]
- Modifying production plugin code, installing dependencies, or executing implementation/QA during this refinement stage. [U2, U4]
