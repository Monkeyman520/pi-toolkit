# Pi Pretty Session

An independently installable Pi extension that automatically names sessions, summarizes a concise `title` and one-sentence `description`, supports dynamic configuration hot-reloading, displays live session metrics (start time, last updated time, context length), and collects project information to help you orient quickly.

## Compatibility and resources

- Node.js >= 22.19.0; TypeScript ESM, no bundler or emitted build.
- Requires Pi's `setSessionName`, `appendEntry`, `sessionManager`, `getContextUsage`, `modelRegistry.complete`, `ui.setWidget`/`ui.setStatus`/`ui.custom`, `switchSession`, and lifecycle hooks (`session_start`, `agent_settled`, `session_compact`, `session_tree`, `session_info_changed`, `session_shutdown`). Tested with Pi **1.5.0**, Windows, Node **26.13.0**.
- One extension entry resource: `extensions/index.ts`. Host `*` peers follow Pi's extension loading contract rather than claiming compatibility with every host version.
- No dependency on `pi-auto-resume`, `pi-quota-keeper`, or other sibling packages. No npm publication is claimed.

## Install and use

From this collection checkout:

```sh
pi -e ./packages/pi-pretty-session
# Or register the individual package in your personal Pi settings:
pi install ./packages/pi-pretty-session
```

Runtime imports are Node built-ins and Pi-provided host modules (`@earendil-works/pi-coding-agent`, `@earendil-works/pi-ai`, `@earendil-works/pi-tui`, `typebox`). Prepare local development dependencies separately below when running static checks and unit tests.

### User-facing behavior

1. **Automatic session naming & summarization:**
   - After the first completed conversation turn, `pi-pretty-session` summarizes the active branch into a concise `title` and a one-sentence `description`.
   - When `useLlm` is enabled (default) and a session or configured model is callable, it issues an isolated, tool-free `ctx.modelRegistry.complete()` request that does not mutate the foreground conversation transcript. When no model/credentials are available or the request fails, it falls back automatically to deterministic local heuristic extraction from user prompts and touched file paths.
   - The generated `title` is written via `pi.setSessionName(title)` (so Pi's built-in `/resume` picker, footer, and terminal title show it immediately), while the full structured metadata (`title`, `description`, summary source, start/update timestamps, context token usage, and project summary) is persisted as a `pretty-session` custom entry via `pi.appendEntry()` without adding tokens to LLM context.
2. **Dynamic summary updates & manual-rename lock:**
   - Re-summarizes automatically when configured triggers fire: every `updateEveryTurns` completed turns, when context usage grows by `contextDeltaTokens`, or after `/compact` (`summarizeOnCompact`).
   - Manual renames (via `/name`, `/resume` rename, or `/ps rename`) automatically lock the custom title against dynamic overwrite while `protectManualName` is enabled (default). Run `/ps unlock` or `/ps summarize` to resume or force title generation.
3. **Live session metrics & project context:**
   - Displays a configurable TUI widget (`aboveEditor` or `belowEditor`) and footer status bar entry showing the session `title`, `description`, **start time**, **last update time**, **context length** (`tokens / contextWindow (%)`), turn/message counts, and **project info** (project name and shortened path, Git branch, dirty file count, latest commit summary, detected manifest `package.json`/`pyproject.toml`/`Cargo.toml`/`go.mod` name/version/scripts, and saved session count for the project).

### Commands

Pi dispatches built-in interactive commands (`/resume`, `/session`, `/name`) before extension commands, so this plugin exposes `/pretty-session` and its short alias `/ps` following the unified `/<extension> <action> [other-args]` convention with multi-token argument auto-completion (`getArgumentCompletions`):

- `/ps` or `/ps browse [current|all]`: Open the interactive TUI session & project browser (search sessions by title, description, project, or branch; press `Enter` to switch sessions via `ctx.switchSession`, `Tab` to toggle Current Project vs All Projects, `Ctrl+G` to re-summarize, `Ctrl+R` to rename, `Ctrl+W` to toggle the widget, `Ctrl+S` to open the TUI settings panel). In non-TUI modes (such as RPC), outputs the formatted session and project dashboard notification.
- `/ps status` (or `/ps info`): Show the current session's title, description, start time, last update time, context length, project overview, and active configuration.
- `/ps project`: Refresh and display detailed project information (path, Git branch/dirty count/latest commit, manifest details and scripts, project session count).
- `/ps summarize` (or `/ps refresh`): Immediately generate/refresh the session title and description (overriding any manual-name lock).
- `/ps rename <title> [| <description>]`: Set a custom session title (and optional description) and lock it against automatic overwrite.
- `/ps unlock`: Clear the manual title lock so automatic dynamic updates can update the title again.
- `/ps list [current|all]`: List saved sessions for the current project (or `all` projects) with their descriptions, timestamps, and context metrics.
- `/ps config [reload | <key> [<value>]]`: Open the interactive `SettingsList` TUI configuration panel (when invoked with no `<key>` in TUI mode), force a reload from disk (`reload`), or dynamically view/update and persist a setting (for example `/ps config updateEveryTurns 5`, `/ps config widgetPlacement belowEditor`, `/ps config model openai/gpt-4o-mini`, or `/ps config model default`).
- `/ps toggle <auto|llm|widget|status|lock|compact>`: Toggle boolean settings at runtime without restarting Pi.
- `/ps help`: Display command usage.

## Configuration

Create or edit `pi-pretty-session.json` in Pi's agent directory (normally `~/.pi/agent`; `PI_CODING_AGENT_DIR` is respected). Changes to `pi-pretty-session.json` are **hot-reloaded automatically** on file modification without restarting Pi or running `/reload`.

All fields are optional. Defaults:

```json
{
	"enabled": true,
	"useLlm": true,
	"updateEveryTurns": 3,
	"contextDeltaTokens": 8000,
	"summarizeOnCompact": true,
	"protectManualName": true,
	"showWidget": true,
	"widgetPlacement": "aboveEditor",
	"showStatus": true,
	"maxTitleLength": 60,
	"maxDescriptionLength": 160,
	"summaryTimeoutMs": 15000
}
```

Optional `model` (`"provider/modelId"` or `"modelId"`) overrides the active session model for summarization calls. Unknown fields or out-of-range values are rejected by TypeBox validation; if `pi-pretty-session.json` becomes malformed, the extension notifies the user and retains the previous safe configuration rather than crashing the session.

## Permissions and risks

This extension runs with Pi's full operating-system process privileges:

- **Filesystem access:** Reads local project manifests (`package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`), saved session JSONL files in Pi's session directory, and `pi-pretty-session.json` in Pi's agent directory. Writes `pi-pretty-session.json` when updating settings via `/ps config` or `/ps toggle`, and appends `session_info` / `pretty-session` custom entries to the active session.
- **Process execution:** Runs read-only `git` commands (`rev-parse`, `symbolic-ref`, `status --porcelain`, `log -1`) with bounded timeouts in the session working directory.
- **Model/network usage:** When `enabled` and `useLlm` are active, sends bounded conversation excerpts to the active or configured model via `ctx.modelRegistry.complete()`, which can consume model tokens/quota. Set `"useLlm": false` (or run `/ps toggle llm`) for strictly local heuristic summarization.

## Development and verification

Use the package-local npm lockfile and npm 11.20.0:

```sh
cd packages/pi-pretty-session
npm ci --ignore-scripts --legacy-peer-deps
npm run typecheck
npm run check
npm test
npm run smoke
```

`typecheck` (`tsc --noEmit`), Biome (`biome check .`), and Vitest (`vitest run`) are separate checks. `.npmrc` disables dependency lifecycle scripts. No JavaScript is emitted.

The smoke test requires an installed Pi binary. If `pi` is not directly executable (for example a Windows command shim), set `PI_BINARY` to the actual executable path. PowerShell example:

```powershell
$env:PI_BINARY = 'C:\path\to\pi.exe'
npm run smoke
```

The smoke test copies only this package into a temporary directory without sibling plugins or `node_modules`, initializes a temporary Git repository and `package.json`, configures an isolated Pi agent directory and a synthetic provider, and launches real Pi RPC. It verifies `/pretty-session` and `/ps` command registration, automatic LLM session naming and description generation after the first turn, start/update timestamps and context length reporting, project Git and manifest inspection, manual rename locking, dynamic `pi-pretty-session.json` hot-reloading (`widgetPlacement: "belowEditor"`, `updateEveryTurns: 1`), explicit `/ps summarize` override, and clean shutdown. Expected output ends in `PASS`.
