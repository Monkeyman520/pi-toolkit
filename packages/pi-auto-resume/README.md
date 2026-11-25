# Pi Auto Resume

An independently installable Pi extension that resumes **interrupted** tasks after configured network/stream failures, transient upstream server errors, temporary throttling, or subscription quota resets. It does not keep a completed agent running.

## Compatibility and resources

- Node.js >= 22.19.0; TypeScript ESM with a Rolldown build.
- Requires Pi's `agent_settled`, response metadata, session lifecycle, TUI `SettingsList` (`@earendil-works/pi-tui`), and user-message APIs. Tested with Pi **1.5.0**, Windows, Node **26.13.0**.
- Exposed extension entry: `dist/index.js`. The `*` host peers are a loader contract, not a claim of compatibility with every Pi version.
- No dependency on Pi Quota Keeper or other sibling plugins. When other collection plugins are installed in the same session, their TUI settings panels discover each other dynamically over `pi.events` without displaying uninstalled plugins.

## Install and use

After the package is available on npm, install it without a version pin:

```sh
pi install npm:@monkeyman520/pi-auto-resume
pi update npm:@monkeyman520/pi-auto-resume
```

Use `pi update --extensions` for all installed extensions. Pinned versions do not follow later releases. On a fresh launch after an update, Pi can show the bundled changelog under **Extension Updates**; the plugin does not poll for updates.

From the repository root, prepare the workspace and build before loading locally:

```sh
bun install --frozen-lockfile
bun run --cwd packages/pi-auto-resume build
pi -e ./packages/pi-auto-resume
# Or persist this local package:
pi install ./packages/pi-auto-resume
```

Runtime imports are Node built-ins and Pi-provided host modules; npm installs use the prebuilt entry.

Commands follow the unified `/auto-resume <action> [other-args]` format with interactive subcommand and argument auto-completion (`getArgumentCompletions`):

- `/auto-resume` (no arguments): opens the interactive TUI status and settings panel in TUI mode, or prints the status summary in non-TUI modes.
- `/auto-resume status`: show current session recovery status, attempt counts, last interruption summary, active session guardrail/sentinel, and configuration path.
- `/auto-resume on` / `/auto-resume off`: enable or disable automatic recovery for the current session.
- `/auto-resume stop`: cancel any pending recovery wait immediately.
- `/auto-resume guard [status | clear | duration <spec> | until <timestamp>]`: inspect, set, or clear session-only time guardrails (for example `duration 2h` or `until 2026-11-26 08:00:00`). Session guardrails are never written to `pi-auto-resume.json`.
- `/auto-resume config [reload | <key> [<value>]]`: open the interactive TUI settings panel (when invoked with no `<key>` in TUI mode), force reload from disk (`reload`), or view/update and persist a scalar setting to `pi-auto-resume.json` (pass `""` to clear a string key back to default).
- `/auto-resume help`: show command usage.

In TUI mode, Escape or Ctrl+C also cancels pending recovery. While waiting to resume, the status indicator shows a 1-second live countdown with attempt progress (for example `throttle: retrying in 12s (1/5)`). RPC clients should use `/auto-resume stop` to cancel a pending idle wait; aborting an active run is also respected.

## Configuration

Configure settings interactively via `/auto-resume` or `/auto-resume config` in TUI mode, or create/edit `pi-auto-resume.json` in Pi's agent directory (normally `~/.pi/agent`; `PI_CODING_AGENT_DIR` is respected). Changes to `pi-auto-resume.json` are hot-reloaded automatically without restarting Pi or running `/reload`.

All fields are optional. Existing V1 config files continue to load without migration. Defaults:

```json
{
	"enabled": true,
	"network": true,
	"server": true,
	"throttle": true,
	"quota": true,
	"wake": true,
	"retryDelayMs": 10000,
	"retryBackoffFactor": 2,
	"maxRetryDelayMs": 300000,
	"quotaDelayMs": 30000,
	"maxAttempts": 5,
	"maxWaitMs": 0,
	"maxTotalAttempts": 0,
	"notifyOnResume": true,
	"resumePrompt": "Continue the interrupted task from where it stopped.",
	"resumePromptFile": "",
	"stopFile": "",
	"customExcludePatterns": [],
	"customMatchPatterns": []
}
```

Unknown fields, invalid types, invalid regex patterns, and unreadable/malformed configuration disable recovery rather than silently enabling it. Bounds:

- `retryDelayMs` and `maxRetryDelayMs`: 1–86400000ms; `retryBackoffFactor`: 1–10 (setting `1` disables exponential backoff and jitter for exact fixed delays; attempts after the first scale exponentially up to `maxRetryDelayMs` with up to +10% jitter while still respecting any longer provider retry hint).
- `quotaDelayMs`: 0–86400000ms; `maxAttempts`: 1–100.
- `maxWaitMs`: 0–604800000ms (`0` = unlimited; positive values skip waits longer than the cap).
- `maxTotalAttempts`: 0–10000 (`0` = unlimited; positive values cap cumulative automatic recoveries across the entire session, unlike `maxAttempts` which resets on human input or a successful response).
- `resumePrompt`: supports `{cause}`, `{attempt}`, and `{maxAttempts}` placeholders. When `resumePromptFile` is set, that UTF-8 local file (<= 1 MiB) is re-read before each dispatch with line endings normalized; if missing, unreadable, oversized, or empty, recovery cancels cleanly without sending a message.
- `stopFile`: when set to a local file path, recovery is cancelled with `stopped by sentinel file` if that file exists on disk.
- `customExcludePatterns` (up to 50 regex strings) and `customMatchPatterns` (up to 50 `{ "pattern": "...", "cause": "network" | "server" | "throttle" | "quota" }` entries) are edited in `pi-auto-resume.json`. Built-in exclusions (context-full, output-length/`max_tokens`, HTTP 401/403, auth/permission errors) and `customExcludePatterns` always take precedence over built-in and custom match rules.

Recovery waits for Pi's own retries and queued work to settle first. A new human prompt resets the consecutive recovery-attempt budget (`maxAttempts`) without resetting cumulative `maxTotalAttempts`. A successful response also clears consecutive attempts. Excluded errors are never reclassified merely because an HTTP 429 or 5xx occurred.

Subscription exhaustion requires concrete reset evidence: `Retry-After`, supported Anthropic/unified reset headers, `x-ratelimit-reset`, `x-ratelimit-reset-requests`, `x-ratelimit-reset-tokens` (including relative durations such as `500ms`, `20s`, `1m30s`), or structured `resets_at`/`reset_at`/`resetTime`/`resetsAt` error data. Without that evidence, status says reset time unavailable and no subscription retry is scheduled. No quota is invented and this package does not poll account quotas.

Wake is detected by a timer gap; one eligible pending recovery is reevaluated. Sleep alone does not start work. Normal completion, explicit abort/stop, context-full/output-length errors, model changes, session replacement, and tree navigation never reactivate old work. Recovery waits and session guardrails are session-local and do not survive process exit. Long waits are intended for TUI/RPC sessions, not a short-lived print invocation.

## Permissions and risks

This extension runs with Pi's full process privileges. Automatic continuation can resume tool-using work with the same permissions as the original task and can consume provider usage. Review unattended-work safety before enabling it. Configuration, optional `resumePromptFile`, and optional `stopFile` sentinel checks read local files only; this package executes **no external shell commands or scripts**, and does not copy credential files, switch accounts, install a service, or send separate subscription-activation messages.

## Development and verification

Rolldown inlines the private [support library](../pi-plugin-support/README.md) where used. Pi SDKs and TypeBox remain host peers, and each plugin owns its state and lifecycle.

The shared library owns configuration-file and TUI/discovery mechanisms; this plugin retains its own schema, failure policy, actions, instances and resource cleanup.

Package-local configuration metadata supplies both command completions and panel presets; the TypeBox schema remains the validation authority, including valid non-preset values. Lifecycle regression tests verify factory inactivity, repeated-start cleanup, independent instances, and cancellation of only the stopped instance's pending recovery.

The optional [collection isolation matrix](../../README.md#cross-plugin-isolation-verification) additionally exercises all seven plugin combinations in real Pi; it is development-only, not an installation or runtime dependency.

From the package directory after the root frozen install and build:

```sh
cd packages/pi-auto-resume
bun run typecheck
bun run check
bun run test
bun run smoke
```

TypeScript no-emit, Biome and Bun tests are separate from the Rolldown build and Pi smoke.

The smoke test requires an installed Pi binary. If `pi` is not directly executable (for example a Windows command shim), set `PI_BINARY` to the actual executable path. PowerShell example:

```powershell
$env:PI_BINARY = 'C:\path\to\pi.exe'
bun run smoke
```

The smoke test copies only this package into a temporary directory without siblings or inherited development `node_modules`, installs its declared production dependencies from the shipped archive/lockfile, uses an isolated Pi agent directory and a synthetic provider, and launches real Pi RPC. It verifies network recovery, transient server recovery with dynamic `resumePromptFile` placeholder substitution, `stopFile` sentinel cancellation, no continuation after success, cancellation of an idle wait, bounded retries, dynamic configuration persistence, and clean shutdown. It does not use your credentials or send a live model request. Expected final output ends in `PASS`.

Physical sleep/wake and every provider-specific failure wording have not been live-tested. Deterministic timing/error tests cover the supported decision rules; the real Pi smoke covers the host loading and continuation boundary.
