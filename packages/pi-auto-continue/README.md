# Pi Auto Continue

An independently installable (**initially private**) Pi extension for **explicitly armed** multi-round continuation after normal task completion, combining a session-local FIFO continuation queue (with immediate `send`/`steer`, `expandPromptTemplates`, multiline TUI editor, file import, disarm preservation, and quota-reset waiting), multi-mode prompt sources (Direct, dynamic `promptFile`, one-shot `promptPipe` with last-match format tag extraction), and composable StopHooks (`maxRounds`, `onError`, `duration`, `until`, `stopFile`, one-shot `stopCommand`).

It is orthogonal to [Pi Auto Resume](../pi-auto-resume/README.md): `pi-auto-resume` recovers **interrupted** error turns, whereas `pi-auto-continue` advances work after **normal** completions (and optionally drains queued work after quota resets).

## Compatibility and resources

- Node.js >= 22.19.0; TypeScript ESM with a Rolldown build.
- Currently `"private": true` (staged outside the public `@monkeyman520/*` npm release catalog until validated and explicitly promoted).
- Requires Pi's `agent_settled`, provider response metadata, session lifecycle, TUI `SettingsList` / `editor` (`@earendil-works/pi-tui`), and `sendUserMessage` (`deliverAs`, `expandPromptTemplates`) APIs. Tested with Pi **1.6.0**, Windows, Node **26.13.1**.
- Exposed extension entry: `dist/index.js` (with `dist/CHANGELOG.md` and `dist/LICENSE` copied at build time). The `*` host peers (`@earendil-works/pi-coding-agent`, `@earendil-works/pi-tui`, `typebox`) are a host loader contract, not a compatibility claim across every Pi version.
- Zero dependency on `pi-auto-resume` or any sibling plugin. When other collection plugins are loaded in the same session, their TUI settings panels discover each other dynamically over `pi.events` (`pi-packages:ui:discover`) without showing uninstalled plugins.

## Install and use

From the repository root, prepare the workspace and build before loading locally:

```sh
bun install --frozen-lockfile
bun run --cwd packages/pi-auto-continue build
pi -e ./packages/pi-auto-continue
# Or persist this local package:
pi install ./packages/pi-auto-continue
```

Every Pi session starts **disarmed**. Global configuration (`pi-auto-continue.json`) supplies default parameters only and never automatically arms a session on startup.

Commands follow the unified `/auto-continue <action> [other-args]` format with full-prefix multi-token auto-completion (`getArgumentCompletions`):

- `/auto-continue` (no arguments): opens the interactive TUI status and settings panel in TUI mode, or prints the status summary in non-TUI modes.
- `/auto-continue start [options]`: explicitly arms the current session using global defaults overlaid with any session-only overrides (never mutating `pi-auto-continue.json`):
  - `--rounds <N>` / `-r <N>`: maximum automatic rounds (`0` = unlimited, `0..1000`).
  - `--delay <ms|spec>` / `-d <ms|spec>`: buffer delay before continuing (`100..86400000` ms or duration such as `5s`, `15s`).
  - `--duration <spec>`: session-only relative stop deadline from now (for example `30m`, `2h`, `1h30m`).
  - `--until <timestamp>`: session-only cutoff timestamp (`ISO-8601` or `YYYY-MM-DD HH:MM:SS`).
  - `--on-error defer|wait-quota|stop`: error turn handling policy.
  - `--queue-empty stop|continue`: behavior once the continuation queue finishes draining.
  - `--prompt <text>`: session-only direct prompt template (`{round}`, `{maxRounds}`).
  - `--prompt-file <path>`: session-only dynamic UTF-8 prompt file (`<= 1 MiB`).
  - `--prompt-pipe <cmd>`: session-only one-shot prompt pipe shell command.
  - `--format <prefix> <suffix>`: opening and closing tags for last-match extraction in Prompt Pipe mode.
  - `--stop-file <path>`: session-only sentinel file path.
  - `--stop-cmd <cmd>`: session-only one-shot pre-dispatch StopHook shell command.
- `/auto-continue stop`: cancels any pending wait or in-flight external command and disarms immediately **without clearing queued items**.
- `/auto-continue queue [subcommand]`: manage and immediately dispatch session-local FIFO queue items:
  - `queue` / `queue list`: show numbered queued items (1-based).
  - `queue add [text]`: append to the queue tail; omitting `<text>` in TUI mode opens Pi's multiline editor (`ctx.ui.editor()`).
  - `queue prepend <text>`: insert at queue head (position `1`).
  - `queue remove <index>`: remove 1-based item.
  - `queue move <from> <to>`: reorder item between 1-based positions.
  - `queue clear`: explicitly empty all queued items.
  - `queue import <file>`: import trimmed non-empty items from a local UTF-8 file (`<= 1 MiB`), split by standalone `---` divider lines when present or by non-empty lines otherwise.
  - `queue send [index]` (default `1`): dequeue and send immediately when idle (overriding active delay/quota waits, even while disarmed) or with `deliverAs: "followUp"` when busy.
  - `queue steer [index]` (default `1`): dequeue and send with `deliverAs: "steer"` when busy (or immediately when idle).
- `/auto-continue status`: show armed/disarmed state, live countdown or active phase, completed rounds, queue count and head preview, active prompt mode, active stop conditions/deadline, and last stop reason.
- `/auto-continue config [reload | <key> [<value>]]`: open the TUI settings panel (in TUI mode with no `<key>`), reload `pi-auto-continue.json` from disk, or view/update persisted defaults (pass `""` to clear a string key back to default).
- `/auto-continue help`: print command usage.

### User priority and cancellation

- Escape or Ctrl+C in TUI, `/auto-continue stop`, aborted turns, `model_select`, and `session_tree` immediately cancel pending waits, terminate any in-flight `promptPipe` or `stopCommand` child process, and disarm the session **while preserving queued items**.
- New human input (`source !== "extension"`) cancels the current pending countdown and aborts in-flight pre-dispatch checks without interrupting the user; if still armed, the next countdown begins after the user's turn completes normally.
- `session_shutdown` (including reload/replacement) cancels waits, kills in-flight subprocesses, disarms, and clears session-local queue state.
- While waiting, Pi's footer status (`auto-continue`) refreshes at 1-second granularity (for example `next queue item in 12s (q:3)` or `quota wait 4m 10s (q:3)`), deduplicated to avoid redundant redraws.

## Prompt sources, queue precedence, and StopHooks

Automatic rounds resolve prompts in strict precedence order:

1. **Continuation Queue:** When non-empty, the head queued item is dequeued at dispatch time (and rolled back to head if `pi.sendUserMessage()` throws). When the queue drains and `queueEmptyPolicy` is `"stop"` (default), the session disarms cleanly with `queue completed`; when `"continue"`, subsequent normal turns fall through to the configured loop prompt mode.
2. **Prompt Pipe (`promptPipe`):** Runs a one-shot shell command once per round with `pipeTimeoutMs` (default `30000` ms) and bounded stdout (`<= 1 MiB`). When both `pipeFormatPrefix` and `pipeFormatSuffix` are set, extracts the **last** matching `prefix...suffix` span (trimmed). If tags are missing, `pipeRequireFormat: false` warns and uses full stdout; `pipeRequireFormat: true` fails closed and disarms.
3. **Dynamic Prompt File (`promptFile`):** Re-reads a local UTF-8 file (`<= 1 MiB`) before each round with line endings normalized (`\r\n`/`\r` -> `\n`) and trimmed. Missing, unreadable, oversized, or empty files fail closed and disarm.
4. **Direct Template (`prompt`):** Uses `prompt` (default `"Continue to the next step."`) with single-pass literal substitution for `{round}` and `{maxRounds}`.

All queued and automatic dispatches forward `{ expandPromptTemplates }` (default `true`), allowing queued slash commands, skills, and prompt templates to expand like manual input.

### Pre-dispatch StopHooks

Before each automatic round dispatches, all active stop conditions are evaluated:

- `maxRounds`, `duration`/`until` deadlines, and `onError: "stop"`.
- `stopFile`: stops with `stopped by sentinel file` if the file exists on disk (or on unexpected filesystem errors).
- `stopCommand`: executes once per round with `stopCommandTimeoutMs` (default `15000` ms) and environment variables `PI_AUTO_CONTINUE_ROUND`, `PI_AUTO_CONTINUE_MAX_ROUNDS`, `PI_AUTO_CONTINUE_QUEUE_LENGTH`, and `PI_AUTO_CONTINUE_CWD`. Fails closed and disarms on spawn error, timeout, non-zero exit code, or when the last non-empty trimmed line of stdout is `"0"`. Continues when exit code is `0` and stdout is empty or ends with another value (such as `"1"`).

### Quota-reset waiting and coexistence with `pi-auto-resume`

- `onError: "defer"` (default): error turns do not schedule continuation or emit duplicate retries, keeping the session armed and the queue intact so Pi's built-in retry, `pi-auto-resume`, or manual retry can recover first.
- `onError: "wait-quota"`: for standalone usage without `pi-auto-resume`, quota/rate-limit errors with concrete reset evidence (`Retry-After`, `anthropic-ratelimit-unified-5h-reset`, `anthropic-ratelimit-unified-7d-reset`, `x-ratelimit-reset`, `x-ratelimit-reset-requests`, `x-ratelimit-reset-tokens`, or structured `resets_at`/`reset_at`/`resetTime`/`resetsAt` fields) schedule the next queued item for `resetTime + quotaDelayMs`. When no concrete reset time is reported, the controller pauses with `quota: reset time unavailable` and never fabricates a timestamp.
- Arming with `/auto-continue start` while idle and with a non-empty queue honors any already-observed `quotaResetAt + quotaDelayMs` floor (when `quotaWait: true`).

## Configuration

Store default settings in `<Pi agent dir>/pi-auto-continue.json` (`PI_CODING_AGENT_DIR` is respected). Changes are hot-reloaded automatically. Invalid, oversized (`> 1 MiB`), unreadable, or unknown fields fail closed (disarming any active loop and blocking `/auto-continue start`).

Defaults:

```json
{
	"delayMs": 15000,
	"maxRounds": 10,
	"onError": "defer",
	"queueEmptyPolicy": "stop",
	"expandPromptTemplates": true,
	"quotaWait": true,
	"quotaDelayMs": 30000,
	"prompt": "Continue to the next step.",
	"promptFile": "",
	"promptPipe": "",
	"pipeFormatPrefix": "",
	"pipeFormatSuffix": "",
	"pipeRequireFormat": false,
	"pipeTimeoutMs": 30000,
	"stopFile": "",
	"stopCommand": "",
	"stopCommandTimeoutMs": 15000,
	"notifyOnContinue": true
}
```

## Permissions and risks

- This extension runs with Pi's full OS user permissions and can send automated follow-up turns that invoke Pi tools and consume provider quota.
- **Unsandboxed shell execution:** `promptPipe` and `stopCommand` execute local shell commands (`cmd.exe /d /s /c` on Windows, `sh -c` on Unix) directly with Pi's full OS user permissions without sandboxing.
- External commands are **never** auto-loaded from project-local repository files; they come strictly from the user's global `pi-auto-continue.json` or explicit interactive `/auto-continue start ...` flags. Review any command before configuring or invoking it.
- No long-lived background daemon subprocesses are spawned; child processes are bounded by strict timeouts and terminated on timeout, cancellation, or `session_shutdown`.

## Development and verification

From the package directory after the root frozen install and build:

```sh
cd packages/pi-auto-continue
bun run typecheck
bun run check
bun run build
bun run test
bun run smoke
```

The smoke test packs the built tarball outside the workspace into an isolated temporary consumer directory without sibling packages, uses a synthetic offline provider fixture, and launches real `pi --mode rpc`. If `pi` is not directly executable on `PATH`, set `PI_BINARY` to the Pi executable path before running `bun run smoke`. Expected final output ends in `PASS`.
