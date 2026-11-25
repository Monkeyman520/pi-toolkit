# Pi Auto Continue (Explicitly Armed Multi-Round Continuation, Continuation Queue, Prompt Pipe, and Stop Hooks)

**Spec ID:** 0012
**Status:** Draft
**Date:** 2026-11-25
**Sources:**
- Conversation comparison between `packages/pi-auto-resume/` and `AutoContinue` (`ac`), and user request to refine P2 as an independently installable Pi plugin orthogonal to `pi-auto-resume`, extended with a FIFO continuation queue, immediate send/steer, and quota-reset waiting.
- Settled user decisions during refinement:
  - **U1 (Package identity & visibility):** Create `packages/pi-auto-continue/` with command `/auto-continue`, initially `"private": true` (outside the public npm release catalog until validated and explicitly promoted per [ADR 0009](../adr/0009-public-npm-trusted-publishing-and-stable-tag-releases.md)).
  - **U2 (Activation model):** Strictly session-local explicit arming (`disarmed` on every new session start). Global configuration (`pi-auto-continue.json`) stores default parameters and presets only and never auto-arms new sessions.
  - **U3 (External command & StopHook model):** Support one-shot Prompt Pipe commands (with strict timeout and last-match prefix/suffix tag extraction) and one-shot pre-dispatch StopHook commands (executed before each round with strict timeout; non-zero exit code, timeout/spawn failure, or stdout last non-empty line `"0"` stops the loop), alongside built-in stop conditions (`maxRounds`, `onError`, `duration`, `until`) and a local sentinel file (`stopFile`). Do not spawn long-lived daemon monitor subprocesses.
  - **U4 (Artifact route):** Author Spec `0012` and decompose into Ticket Set `0010`.
  - **U5 (Continuation queue & preferences):** Support a session-local FIFO continuation queue with:
    1. Disarm preservation: `/auto-continue stop`, Escape, Ctrl+C, turn abort, model selection, and tree navigation disarm automatic progression **without clearing queued items** (only explicit `queue clear` or session shutdown/replacement clears the queue).
    2. Template/command expansion: `expandPromptTemplates` defaults to `true` (configurable) when dispatching via `pi.sendUserMessage(content, { expandPromptTemplates })`, so queued slash commands, skills, and prompt templates expand like manual input.
    3. Quota-reset waiting: support waiting for concrete provider quota/rate-limit reset evidence (`quotaWait: true`, `quotaDelayMs: 30000`) both when used standalone and when coexisting cleanly with `pi-auto-resume`.
    4. Rich queue management & immediate dispatch: `queue add` (launching Pi's `ctx.ui.editor()` for multiline input when invoked with no text in TUI mode), `queue prepend`, `queue list`, `queue remove`, `queue move`, `queue clear`, `queue import <file>`, plus immediate `queue send [index]` (immediate when idle, `deliverAs: "followUp"` when busy) and `queue steer [index]` (`deliverAs: "steer"` when busy).
    5. Empty-queue policy: `queueEmptyPolicy: "stop" | "continue"` defaulting to `"stop"` (disarm once the queue drains rather than falling through to unbounded loop prompts unless configured otherwise).
- Project contracts: [CONTEXT.md](../CONTEXT.md), [Spec 0002](./0002-pi-auto-resume.md), [Spec 0011](./0011-pi-auto-resume-enhancements.md), [ADR 0001](../adr/0001-independently-installable-pi-packages.md), [ADR 0004](../adr/0004-unified-command-grammar-and-dynamic-tui-configuration.md), [ADR 0005](../adr/0005-versioned-plugin-support-library.md), [ADR 0008](../adr/0008-bun-workspace-rolldown-and-bun-test-stack.md), [ADR 0009](../adr/0009-public-npm-trusted-publishing-and-stable-tag-releases.md), and [packages/README.md](../../packages/README.md).

## Requirements

### C1. Independent package scaffold and workspace integration

- Create `packages/pi-auto-continue/` as a standalone Pi extension package with its own `package.json`, `tsconfig.json`, `rolldown.config.mjs`, `README.md`, `extensions/index.ts`, and `tests/`.
- Keep `"private": true` initially (outside the public npm release catalog in `scripts/release.ts` per [ADR 0009](../adr/0009-public-npm-trusted-publishing-and-stable-tag-releases.md)), while adhering to [ADR 0001](../adr/0001-independently-installable-pi-packages.md) and [ADR 0008](../adr/0008-bun-workspace-rolldown-and-bun-test-stack.md): `"type": "module"`, Node.js >= 22.19.0, Rolldown ESM bundle at `dist/index.js`, copied `dist/LICENSE` and `dist/CHANGELOG.md`, external `"*"` host peers (`@earendil-works/pi-coding-agent`, `@earendil-works/pi-tui`, `typebox`), and inlined private `pi-plugin-support`.
- Zero dependency on `pi-auto-resume` or any sibling plugin; register dynamically on `pi-packages:ui:discover` only while active in a session.
- Document `pi-auto-continue` accurately in the repository root `README.md` package catalog (noting its private/initial status).

### C2. Explicit session arming, user priority, and orthogonal cooperation with `pi-auto-resume`

- Every Pi session starts **disarmed**. Global configuration (`pi-auto-continue.json`) supplies defaults/presets only and must never automatically arm a session on startup.
- Arming occurs only when the user explicitly runs `/auto-continue start ...` or explicitly toggles the session armed state in the TUI panel.
- **Normal completion continuation:** When armed and a turn settles normally (`!aborted` and assistant `stopReason !== "error"` and `stopReason !== "aborted"`), schedule the next continuation after the configured buffer wait (`delayMs`, giving the user time to inspect or steer, and no earlier than any observed `quotaResetAt + quotaDelayMs` floor when `quotaWait` is enabled). When due while Pi is idle with no pending messages, evaluate stop conditions, resolve the next prompt (or dequeue the next continuation-queue item), and dispatch one `pi.sendUserMessage(prompt, { expandPromptTemplates })`.
- **Orthogonal error behavior (`onError: "defer" | "wait-quota" | "stop"`, default `"defer"`):**
  - `"defer"` (default): When a turn settles with an assistant error (`stopReason === "error"`), do not schedule an idle continuation for that error turn and do not emit a duplicate retry message. Stay armed (and preserve any queued items) so Pi's built-in retry, `pi-auto-resume`, or manual retry can recover the interrupted turn; once a later turn completes normally, continuation resumes cleanly.
  - `"wait-quota"`: For standalone usage without `pi-auto-resume`, when a turn fails due to quota/rate-limit exhaustion and concrete reset evidence is present (`quotaWait: true`), schedule the next queued continuation for `resetTime + quotaDelayMs` (never fabricate a reset time when absent; pause with `quota: reset time unavailable`). Non-quota errors still defer without fabricating retries.
  - `"stop"`: Immediately cancel and disarm the loop on any assistant error turn (matching `AutoContinue`'s `<error>` condition), while preserving queued items.
- **Idle-start with non-empty queue:** When the user runs `/auto-continue start` while Pi is already idle and the continuation queue is non-empty, schedule the head queued item using `Math.max(now + delayMs, quotaResetAt + quotaDelayMs)` (or pause if quota-exhausted without a known reset time), so users can queue tasks after hitting a quota wall and arm once to execute them after quota resets.
- **User priority and cancellation boundaries:**
  - Explicit `/auto-continue stop`, Escape or Ctrl+C in TUI, aborted turns (`aborted: true`), `session_tree`, and `model_select` immediately cancel any pending wait, abort any in-flight external command, and disarm the session **without clearing the continuation queue**.
  - `session_shutdown` (including session replacement/reload) cancels waits, aborts in-flight commands, disarms, and cleans up session-local queue and timers.
  - New human input (`input` where `source !== "extension"`) cancels the currently pending wait timer (and aborts any in-flight pre-dispatch check) without interrupting the user; while still armed, a new buffer wait starts only after the user's turn completes normally.

### C3. Continuation queue, immediate dispatch, and quota-reset waiting

- Maintain a session-local ordered FIFO continuation queue of prompt items (`id`, `text`, `createdAt`).
- **Queue management operations:**
  - `queue add [text]`: append an item to the tail; when invoked with no `text` in TUI mode, open Pi's multiline editor (`ctx.ui.editor()`) to author a multiline prompt.
  - `queue prepend <text>`: insert an item at the head (position `1`).
  - `queue list`: display numbered queued items (1-based) with concise previews.
  - `queue remove <index>`: remove the 1-based item.
  - `queue move <from> <to>`: reorder an item between 1-based positions.
  - `queue clear`: explicitly empty the queue.
  - `queue import <file>`: read a local UTF-8 file (`<= 1 MiB`), split into trimmed non-empty prompt items (separated by `---` divider lines when present, otherwise by non-empty lines), and append them to the queue.
- **Dispatch precedence & empty-queue policy (`queueEmptyPolicy: "stop" | "continue"`, default `"stop"`):**
  - When armed and the continuation queue is non-empty, queued items take precedence over Prompt Pipe, Prompt File, and Direct prompts (`Queue > Prompt Pipe > Prompt File > Direct`).
  - Never drop a queued item prematurely: dequeue only when actually dispatching to Pi, and if `pi.sendUserMessage()` throws, restore the item to its original head position, cancel/disarm safely, and notify the user.
  - Track whether the current armed run started in queue-draining mode (or consumed queued items): when the queue becomes empty and `queueEmptyPolicy === "stop"`, disarm cleanly with reason `"queue completed"` after the last queued turn finishes normally; when `queueEmptyPolicy === "continue"`, fall through to the configured Prompt Pipe / Prompt File / Direct mode on subsequent normal completions.
- **Immediate manual send & steer:**
  - `queue send [index]` (default `1`, head of queue):
    - Removes the target item and immediately calls `pi.sendUserMessage(item.text, { expandPromptTemplates })` when Pi is idle (cancelling any pending countdown and overriding an active delay or quota wait as an explicit user override, even if the loop is currently disarmed).
    - When Pi is currently busy (`!ctx.isIdle() || ctx.hasPendingMessages()`), delivers via `pi.sendUserMessage(item.text, { deliverAs: "followUp", expandPromptTemplates })` so Pi runs it immediately when the active turn finishes.
  - `queue steer [index]` (default `1`):
    - When Pi is busy, removes the target item and calls `pi.sendUserMessage(item.text, { deliverAs: "steer", expandPromptTemplates })` to steer the running agent immediately; when Pi is idle, dispatches directly via `pi.sendUserMessage(item.text, { expandPromptTemplates })`.
  - If `pi.sendUserMessage()` throws, restore the item to its prior queue index and report an error.
- **Template/command expansion (`expandPromptTemplates`, default `true`):**
  - Pass `{ expandPromptTemplates: settings.expandPromptTemplates }` when dispatching continuation and queued messages so slash commands, skills, and prompt templates expand naturally when enabled.
- **Quota-reset evidence parsing (`quotaWait`, default `true`; `quotaDelayMs`, default `30000`):**
  - Observe `before_provider_request`, `after_provider_response`, and `message_end` to capture concrete reset timestamps from `Retry-After`, `anthropic-ratelimit-unified-5h-reset`, `anthropic-ratelimit-unified-7d-reset`, `x-ratelimit-reset`, `x-ratelimit-reset-requests`, `x-ratelimit-reset-tokens` (including relative durations such as `500ms`, `20s`, `1m30s`), and structured `resets_at`/`reset_at`/`resetTime`/`resetsAt` fields.
  - Clear stale quota-wait state once a subsequent assistant turn succeeds normally (`stopReason !== "error"`). Never fabricate a reset timestamp when no concrete evidence is reported.

### C4. Multi-mode prompt resolution and format tag extraction

- When not consuming a continuation-queue item, resolve the next continuation prompt using explicit mode precedence:
  1. **Prompt Pipe (`promptPipe`):** Execute a configured external command once per round with strict timeout (`pipeTimeoutMs`, default `30000`, killing the process on timeout or cancellation) and bounded stdout capture (`<= 1 MiB`), using normalized trimmed stdout as the prompt.
  2. **Dynamic File (`promptFile`):** Re-read a local UTF-8 file (`<= 1 MiB`) before each round, normalizing `\r\n` and `\r` to `\n` and trimming surrounding whitespace (allowing live edits during a run).
  3. **Direct template (`prompt`):** Use the configured prompt string (default `"Continue to the next step."`), supporting single-pass literal substitution for `{round}` and `{maxRounds}`.
- **Format extraction (`pipeFormatPrefix` and `pipeFormatSuffix`):**
  - When both prefix and suffix are non-empty in Prompt Pipe mode, extract the **last** matching `prefix...suffix` span from stdout (trimmed), filtering out surrounding reviewer/analysis prose.
  - Controlled by `pipeRequireFormat` (boolean, default `false`): when `false`, missing tags emit a warning and fall back to full trimmed stdout; when `true`, missing tags cancel and disarm the loop cleanly without sending unfiltered output.
- **Fail-closed prompt resolution:** If `promptPipe` fails (non-zero exit code, spawn error, timeout, empty output, or missing required tags) or `promptFile` is missing, unreadable, oversized, or empty, cancel the pending round, disarm with an explicit diagnostic status, notify UI when available, and never send an empty or partial prompt.

### C5. Composable stop conditions and one-shot StopHook commands

- Evaluate all active stop conditions before scheduling/dispatching each automatic round. Any triggered condition immediately cancels the pending round and disarms the session with a clear stop reason (preserving queued items):
  1. **Round limit (`maxRounds`):** Non-negative integer (`0` = unlimited; default `10` for bounded unattended safety). Stops once completed automatic rounds reach `maxRounds`.
  2. **Error stop (`onError: "stop"`):** Disarms immediately on any assistant error turn.
  3. **Duration (`duration`):** Session-local relative duration from arming/command (e.g., `30m`, `2h`, `1h30m`). Stops once elapsed time reaches the deadline.
  4. **Absolute cutoff (`until`):** Session-local deadline timestamp (`ISO-8601` or `YYYY-MM-DD HH:MM:SS`). Stops once wall clock reaches the deadline.
  5. **Sentinel file (`stopFile`):** Stops if the configured local file exists on disk.
  6. **One-shot StopHook command (`stopCommand` with `stopCommandTimeoutMs`, default `15000`):** Executed once before each round with context env vars (`PI_AUTO_CONTINUE_ROUND`, `PI_AUTO_CONTINUE_MAX_ROUNDS`, `PI_AUTO_CONTINUE_QUEUE_LENGTH`, `PI_AUTO_CONTINUE_CWD`). Stops (fail closed) if:
     - Process fails to spawn or exceeds `stopCommandTimeoutMs` (process killed on timeout), OR
     - Process exits with non-zero exit code, OR
     - Last non-empty trimmed line of stdout is `"0"`.
     - Allows continuation when exit code is `0` and stdout last non-empty line is empty or not `"0"` (e.g., `"1"`).
- Child processes spawned by `promptPipe` or `stopCommand` must be terminated cleanly (no leaked handles or orphan processes on timeout, cancellation, or `session_shutdown`) and never execute when the session is disarmed.

### C6. Configuration, hot reload, and command-execution security boundary

- Store default settings in `<Pi agent dir>/pi-auto-continue.json` (`<= 1 MiB`), validated via `pi-plugin-support/config` (`JsonConfigStore`) and TypeBox (`additionalProperties: false`).
- Fail closed on invalid or unreadable configuration: disarm any active loop, refuse `/auto-continue start`, and surface a clear diagnostic error.
- Do **not** auto-load executable commands from project-local repository files; external commands (`promptPipe`, `stopCommand`) come strictly from the user's global `pi-auto-continue.json` or explicit interactive `/auto-continue start ...` arguments.
- Explicitly disclose in `packages/pi-auto-continue/README.md` that `promptPipe` and `stopCommand` execute local shell commands with Pi's full OS user permissions without sandboxing.

### C7. Unified command grammar, multi-token completions, TUI panel, and live observability

- Implement `/auto-continue <action> [other-args]` per [ADR 0004](../adr/0004-unified-command-grammar-and-dynamic-tui-configuration.md):
  - `/auto-continue` (no args): open interactive TUI status/settings panel in TUI mode, or print status summary in non-TUI mode.
  - `/auto-continue start [--rounds <N>] [--delay <ms|spec>] [--duration <spec>] [--until <timestamp>] [--on-error defer|wait-quota|stop] [--queue-empty stop|continue] [--prompt <text>] [--prompt-file <path>] [--prompt-pipe <cmd>] [--format <prefix> <suffix>] [--stop-file <path>] [--stop-cmd <cmd>]`: arm the current session using global defaults overlaid with any session-only overrides (never mutating `pi-auto-continue.json`).
  - `/auto-continue stop`: cancel any pending wait or in-flight external command and disarm immediately (preserving queued items).
  - `/auto-continue queue [add [text] | prepend <text> | list | remove <idx> | move <from> <to> | clear | import <file> | send [idx] | steer [idx]]`: manage and immediately dispatch continuation-queue items.
  - `/auto-continue status`: show armed/disarmed state, live countdown or active phase (including quota-reset wait if active), completed rounds (`rounds/maxRounds`), queue length + head preview, prompt mode, active stop conditions/deadline, and last stop reason.
  - `/auto-continue config [reload | <key> [<value>]]`: open TUI settings panel, reload from disk, or view/update persisted default settings in `pi-auto-continue.json`.
  - `/auto-continue help`: print command usage.
- Provide full-prefix multi-token `getArgumentCompletions` across `start`, `queue`, and `config`.
- Refresh Pi's status indicator (`ctx.ui.setStatus("auto-continue", ...)`) at 1-second granularity during buffer waits or quota waits (e.g., `auto-continue: next queue item in 12s (q:3)` or `auto-continue: quota wait 4m 10s (q:3)`) and while executing `stopCommand` / `promptPipe`, deduplicated to avoid redundant redraws.
- Emit a concise optional notification when a continuation round is dispatched (`notifyOnContinue`, default `true`).

### C8. Standalone verification and coexistence evidence

- Deterministic unit and lifecycle tests (`bun test`) covering state transitions, FIFO queue operations + rollback + `queueEmptyPolicy`, immediate `send`/`steer`, `expandPromptTemplates`, quota-reset parsing & waiting, prompt modes + last-match format extraction, all stop conditions + one-shot command timeout/abort cleanup, config fail-closed behavior, command parsing/completions, TUI rendering, and multi-instance isolation.
- Standalone isolated real-Pi RPC smoke test (`tests/pi-smoke.mjs`) packing the built tarball into a clean temporary directory outside the workspace and verifying:
  1. Disarmed default on session start (normal completion does not continue).
  2. Queue FIFO drain with `queueEmptyPolicy: "stop"` (disarms cleanly after draining queued items) and immediate `queue send` dispatch.
  3. Explicit `/auto-continue start` with Prompt Pipe + last-match format tag extraction and `maxRounds` stopping.
  4. One-shot `stopCommand` / `stopFile` halting continuation cleanly.
  5. Orthogonal error deferral (`onError: "defer"`) and standalone quota-reset waiting (`onError: "wait-quota"` with `Retry-After` / reset header).
- All workspace gates (`bun run check`, `bun run typecheck`, `bun run build`, `bun run test`) and package `smoke` pass cleanly.

## Solution

Organize `packages/pi-auto-continue/` with a strict separation between pure loop/queue/quota state management (`loop.ts`), cross-platform bounded subprocess helpers (`process.ts`), prompt & queue-file parsers (`prompts.ts`), stop-hook evaluators (`stop-hooks.ts`), schema-validated defaults (`config.ts`), command parsing/completions (`commands.ts`), TUI panel (`ui.ts`), and Pi lifecycle wiring (`index.ts`).

### Seams

| Seam | Connects | Expects | Provides |
| --- | --- | --- | --- |
| Loop, queue & quota state machine | `extensions/loop.ts` (Pi turn/provider lifecycle + tick → due round) | Explicit arm/disarm actions, queue mutations, provider response headers/errors, active session config (`delayMs`, `maxRounds`, `onError`, `queueEmptyPolicy`, `quotaWait`, `quotaDelayMs`, `deadlineMs`), `now`, `idle` | Armed/disarmed state, FIFO queue state (preserved across disarm), quota-reset floor, pending round schedule, 1-second countdown status, diagnostic snapshot, atomic dequeue-with-rollback support |
| Bounded subprocess runner | `extensions/process.ts` → OS shell child process | Shell command, `cwd`, `env`, `timeoutMs`, `maxBytes`, `AbortSignal` | Structured exit/stdout/stderr result with forced child termination on timeout or abort |
| Prompt & queue-import resolver | `extensions/prompts.ts` → filesystem / `process.ts` | Active prompt settings (`promptPipe`, `pipeFormatPrefix`/`Suffix`, `pipeRequireFormat`, `pipeTimeoutMs`, `promptFile`, `prompt`), round metadata, `AbortSignal`, or import file path | Resolved non-empty prompt text (or parsed queue item array) or structured fail-closed error |
| Stop-hook evaluator | `extensions/stop-hooks.ts` → filesystem / `process.ts` | `stopFile`, `stopCommand`, `stopCommandTimeoutMs`, round/queue/cwd env metadata, `AbortSignal` | `{ stop: false }` or `{ stop: true, reason }` (fail-closed on spawn/timeout/non-zero exit/`"0"` stdout) |
| Config store | `extensions/config.ts` → `pi-plugin-support/config` (`JsonConfigStore`) | Global `pi-auto-continue.json` (`<= 1 MiB`), TypeBox schema (`additionalProperties: false`) | Validated default settings (never auto-arming sessions) or fail-closed error state |
| Lifecycle & pre-dispatch boundary | `extensions/index.ts` → Pi ExtensionAPI + `AbortController` | Pi events (`session_start`, `session_shutdown`, `session_tree`, `model_select`, `input`, `agent_start`, `before_provider_request`, `after_provider_response`, `message_end`, `agent_settled`), TUI input (Esc/Ctrl+C) | Generation- and idle-guarded async stop-hook + prompt/queue dispatch with `{ expandPromptTemplates, deliverAs }`, immediate `send`/`steer`, and immediate child abort on cancel/shutdown |
| Unified command & TUI surface | `extensions/commands.ts`, `extensions/ui.ts` → Pi host (`ctx.ui.editor`, `SettingsList`) & `pi-plugin-support` | `/auto-continue` args, completion prefixes, `SettingsList` callbacks, `pi-packages:ui:discover` | Subcommand dispatch (`start`, `stop`, `queue`, `status`, `config`, `help`), full-prefix completions, multiline queue editor, live TUI panel, installed-only plugin switcher |

## End-to-End Tests

### Disarmed by default on fresh session
- **Given:** `pi-auto-continue` is loaded with valid global defaults in `pi-auto-continue.json`.
- **When:** A user sends a prompt and the assistant completes normally (`stopReason: "stop"`).
- **Then:** No continuation timer is scheduled and no follow-up message is sent.

### Continuation queue FIFO drain, empty-queue stop, and disarm preservation
- **Given:** User adds 2 items to the continuation queue (`queueEmptyPolicy: "stop"`), arms the session, and the current turn completes normally.
- **When:** Round 1 dispatches item 1, user presses Escape (or runs `/auto-continue stop`), then re-arms with `/auto-continue start` and item 2 dispatches and completes normally.
- **Then:** Item 2 is preserved across disarm, dispatches after re-arming with `{ expandPromptTemplates: true }`, and the session disarms automatically with `"queue completed"` once the queue is empty.

### Immediate `queue send` and `queue steer`
- **Given:** Continuation queue contains `[A, B]`.
- **When:** (a) Pi is idle (even while disarmed or waiting on a delay/quota countdown) and user runs `/auto-continue queue send`; or (b) Pi is busy and user runs `/auto-continue queue send` or `/auto-continue queue steer`.
- **Then:** (a) Item `A` is dequeued and sent immediately via `pi.sendUserMessage(A, { expandPromptTemplates })`; (b) When busy, `send` delivers via `deliverAs: "followUp"` and `steer` delivers via `deliverAs: "steer"`, leaving `[B]` intact.

### Quota-reset waiting (coexistence and standalone)
- **Given:** Continuation queue has `[Task 2]` and `quotaWait: true`, `quotaDelayMs: 500`.
- **When:** (a) Under `onError: "defer"`, Turn 1 fails with HTTP 429 + quota exhaustion and `Retry-After: 2`; or (b) Under `onError: "wait-quota"` (or starting while idle after observing `Retry-After: 2`), the queue waits for quota reset.
- **Then:** Under `defer`, `pi-auto-continue` does not emit a duplicate retry and waits for Turn 1 to finish normally before sending `Task 2`; under `wait-quota` / idle-start, `pi-auto-continue` waits until `now + 2500ms` (with 1s countdown) before sending `Task 2`, and pauses without guessing if no reset time was reported.

### Multi-round Prompt Pipe with format extraction
- **Given:** Empty queue, user runs `/auto-continue start --rounds 2 --delay 400 --prompt-pipe "<cmd>" --format "<continue>" "</continue>"`.
- **When:** The initial turn completes normally and the pipe command prints analysis prose containing two `<continue>...</continue>` blocks.
- **Then:** After the buffer delay, Pi receives only the **last** `<continue>...</continue>` block's trimmed content, advances through 2 rounds, and disarms after round 2 with status indicating round limit reached.

### One-shot StopHook command and sentinel file halt continuation
- **Given:** An armed session configured with `stopCommand` (or `stopFile`).
- **When:** Before the next round dispatches, `stopCommand` outputs `"0"` (or exits non-zero / times out), or `stopFile` is created on disk.
- **Then:** No user message is sent, the session disarms with an explicit stop reason (preserving any queued items), and no orphan child process remains.

### User interruption and shutdown abort in-flight pipe/hook
- **Given:** An armed session currently running a slow `promptPipe` or `stopCommand`.
- **When:** The user presses Escape/Ctrl+C, runs `/auto-continue stop`, submits new input, or shuts down the session.
- **Then:** The active `AbortController` terminates the child process immediately and no stale message is sent when the promise settles.

## Decisions

- **Choice:** Ship as a separate `"private": true` package `packages/pi-auto-continue/` (`/auto-continue`) rather than extending `pi-auto-resume`.
  - **Reason/source:** User decision **U1**; preserves `pi-auto-resume`'s interrupted-only safety contract ([Spec 0002](./0002-pi-auto-resume.md)), independent installation ([ADR 0001](../adr/0001-independently-installable-pi-packages.md)), and private staging before release-catalog promotion ([ADR 0009](../adr/0009-public-npm-trusted-publishing-and-stable-tag-releases.md)).
- **Choice:** Strictly session-local explicit arming (disarmed on every session start).
  - **Reason/source:** User decision **U2**; prevents routine interactive sessions from accidentally running unbounded autonomous loops.
- **Choice:** One-shot pre-dispatch `promptPipe` and `stopCommand` with strict timeouts and `AbortSignal` cleanup, rather than long-lived resident monitor subprocesses.
  - **Reason/source:** User decision **U3**; achieves `AutoContinue`'s multi-agent review pipe and scripted stop-gate capabilities with simpler cross-platform lifecycle management and zero background daemon/orphan-process risk.
- **Choice:** Integrate a session-local FIFO continuation queue with disarm preservation, `expandPromptTemplates: true` default, `queueEmptyPolicy: "stop"` default, `queue send`/`steer` immediate dispatch, `ctx.ui.editor()` multiline input, `queue import`, and independent quota-reset waiting (`quotaWait: true`).
  - **Reason/source:** User decision **U5**; enables queuing multi-step workflows (including slash commands/skills) that automatically drain after normal completions or quota resets while still allowing immediate user override.
- **Choice (Explicit Assumptions — reversible defaults):**
  - Default settings: `delayMs: 15000`, `maxRounds: 10` (`0` = unlimited), `onError: "defer"`, `queueEmptyPolicy: "stop"`, `expandPromptTemplates: true`, `quotaWait: true`, `quotaDelayMs: 30000`, `prompt: "Continue to the next step."`, `promptFile: ""`, `promptPipe: ""`, `pipeFormatPrefix: ""`, `pipeFormatSuffix: ""`, `pipeRequireFormat: false`, `pipeTimeoutMs: 30000`, `stopFile: ""`, `stopCommand: ""`, `stopCommandTimeoutMs: 15000`, `notifyOnContinue: true`.
  - External commands execute via platform shell (`cmd /d /s /c` on Windows with `windowsHide: true`, `sh -c` on Unix) using `child_process.spawn`, with bounded stdout/stderr buffering (`<= 1 MiB`) and forced termination on timeout/abort.
  - Human input (`source !== "extension"`) cancels the pending countdown wait (and aborts in-flight pre-dispatch checks) while keeping the loop armed for the next normal completion; explicit `/auto-continue stop`, Escape, Ctrl+C, abort, model change, or tree navigation disarms the loop while preserving queued items; `session_shutdown` clears everything.
  - No `CONTEXT.md` or ADR changes are required at this stage; all contracts conform to existing ADR 0001, ADR 0004, ADR 0005, ADR 0008, and ADR 0009.

## Test Plan

- Deterministic unit tests (`bun test`) covering:
  - `ContinueController` arm/disarm lifecycle, FIFO queue operations (`add`, `prepend`, `remove`, `move`, `clear`, rollback), disarm queue preservation, `queueEmptyPolicy` (`stop` vs `continue`), `delayMs`, `maxRounds`, `onError` (`defer` / `wait-quota` / `stop`), `quotaWait` / `resetTime()` parsing, `duration`/`until` deadline checks, human-input timer reset vs explicit disarm, and 1s countdown formatting.
  - Prompt & queue-import resolver: Direct placeholder substitution (`{round}`, `{maxRounds}`), dynamic `promptFile` reload + CRLF normalization + fail-closed errors, `promptPipe` stdout capture + timeout kill + abort kill + last-match tag extraction (`pipeRequireFormat: false` vs `true`), and `queue import` file parsing (`---` blocks and line-based fallback).
  - StopHook evaluator: `stopFile` detection, `stopCommand` exit code `0` vs non-zero, stdout `"0"` vs `"1"` vs empty, env var propagation (including `PI_AUTO_CONTINUE_QUEUE_LENGTH`), timeout/spawn fail-closed, and abort cleanup.
  - Command parser (`/auto-continue start ...`, `/auto-continue queue ...` including quoted strings/spaces), full-prefix multi-token `getArgumentCompletions`, TypeBox config validation, and TUI panel render/navigation/editor tests.
  - Lifecycle regression tests: factory inactivity, repeated `session_start`, multi-instance isolation, immediate `queue send` (idle + busy `followUp`) / `queue steer`, `expandPromptTemplates` option forwarding, send-error rollback, in-flight command abort on `session_shutdown`/`stop`/user input, and quota-wait / `onError: "defer"` coexistence.
- Isolated real-Pi RPC smoke test (`bun run --cwd packages/pi-auto-continue smoke`) verifying packed tarball loading and end-to-end flows outside the workspace.
- Workspace gates: `bun run check`, `bun run typecheck`, `bun run build`, `bun run test`.

## Out of Scope

- Fault-aware retry/backoff recovery of interrupted turns on network/5xx errors (owned by `pi-auto-resume`; both plugins compose orthogonally when installed together).
- Cross-session persistent queue storage on disk (queues are session-local and cleared on process exit/session replacement).
- Long-lived resident monitor subprocesses (`AutoContinue`'s streaming stdin/stdout daemon hook).
- Project-local auto-executed `.pi/auto-continue.json` files (external commands come only from user global config or explicit interactive `/auto-continue start` flags).
- Adding `pi-auto-continue` to `scripts/release.ts` or publishing to npm (remains `"private": true` until separately promoted).

## Future Evolution

- After real-world multi-agent workflow validation, evaluate promoting `pi-auto-continue` to `@monkeyman520/pi-auto-continue` in the public release catalog per [ADR 0009](../adr/0009-public-npm-trusted-publishing-and-stable-tag-releases.md).
- If users request project-specific loop presets (e.g., repo-checked-in reviewer pipe commands), add opt-in `.pi/auto-continue.json` gated strictly on `ctx.isProjectTrusted()` following `pi-prompt-pipeline`'s trust contract.
