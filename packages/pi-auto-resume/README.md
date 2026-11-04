# Pi Auto Resume

An independently installable Pi extension that resumes **interrupted** tasks after configured network failures, timeouts, temporary throttling, or subscription quota resets. It does not keep a completed agent running.

## Compatibility and resources

- Node.js >= 22.19.0; TypeScript ESM, no bundler or emitted build.
- Requires Pi's `agent_settled`, response metadata, session lifecycle, TUI `SettingsList` (`@earendil-works/pi-tui`), and user-message APIs. Tested with Pi **1.5.0**, Windows, Node **26.13.0**.
- Exposed extension entry: `extensions/index.ts`. The `*` host peers are a loader contract, not a claim of compatibility with every Pi version.
- No dependency on Pi Quota Keeper or other sibling plugins. When other collection plugins are installed in the same session, their TUI settings panels discover each other dynamically over `pi.events` without displaying uninstalled plugins. No npm publication is claimed.

## Install and use

From this collection checkout:

```sh
pi -e ./packages/pi-auto-resume
# Or register the individual package:
pi install ./packages/pi-auto-resume
```

Runtime imports are Node built-ins and Pi-provided host modules; no local build is required. Local development dependencies are prepared separately below.

Commands follow the unified `/auto-resume <action> [other-args]` format with interactive subcommand and argument auto-completion (`getArgumentCompletions`):

- `/auto-resume` (no arguments): opens the interactive TUI status and settings panel in TUI mode, or prints the status summary in non-TUI modes.
- `/auto-resume status`: show current session recovery status and configuration path.
- `/auto-resume on` / `/auto-resume off`: enable or disable automatic recovery for the current session.
- `/auto-resume stop`: cancel any pending recovery wait immediately.
- `/auto-resume config [reload | <key> [<value>]]`: open the interactive TUI settings panel (when invoked with no `<key>` in TUI mode), force reload from disk (`reload`), or view/update and persist a setting to `pi-auto-resume.json`.
- `/auto-resume help`: show command usage.

In TUI mode, Escape or Ctrl+C also cancels pending recovery. RPC clients should use `/auto-resume stop` to cancel a pending idle wait; aborting an active run is also respected.

## Configuration

Configure settings interactively via `/auto-resume` or `/auto-resume config` in TUI mode, or create/edit `pi-auto-resume.json` in Pi's agent directory (normally `~/.pi/agent`; `PI_CODING_AGENT_DIR` is respected). Changes to `pi-auto-resume.json` are hot-reloaded automatically without restarting Pi or running `/reload`.

All fields are optional. Defaults:

```json
{
	"enabled": true,
	"network": true,
	"throttle": true,
	"quota": true,
	"wake": true,
	"retryDelayMs": 10000,
	"quotaDelayMs": 30000,
	"maxAttempts": 5
}
```

Unknown fields, invalid types, and unreadable/malformed configuration disable recovery rather than silently enabling it. Retry delay is 1–86400000ms, quota safety delay is 0–86400000ms, and attempts are 1–100.

Recovery waits for Pi's own retries and queued work to settle first. A new human prompt resets the consecutive recovery-attempt budget. A successful response also clears it. Excluded errors are never reclassified merely because an HTTP 429 occurred.

Subscription exhaustion requires concrete reset evidence: Retry-After, supported Anthropic/unified reset headers, an epoch reset header, or structured `resets_at`/`resetTime`/`resetsAt` error data. Without that evidence, status says reset time unavailable and no subscription retry is scheduled. No quota is invented and this package does not poll account quotas.

Wake is detected by a timer gap; one eligible pending recovery is reevaluated. Sleep alone does not start work. Normal completion, explicit abort/stop, context-full/output-length errors, model changes, session replacement, and tree navigation never reactivate old work. Recovery waits are session-local and do not survive process exit. Long waits are intended for TUI/RPC sessions, not a short-lived print invocation.

## Permissions and risks

This extension runs with Pi's full process privileges. Automatic continuation can resume tool-using work with the same permissions as the original task and can consume provider usage. Review unattended-work safety before enabling it. Configuration is read locally; this package does not copy credential files, switch accounts, install a service, or send separate subscription-activation messages.

## Development and verification

Package-local configuration metadata supplies both command completions and panel presets; the TypeBox schema remains the validation authority, including valid non-preset values. Lifecycle regression tests verify factory inactivity, repeated-start cleanup, independent instances, and cancellation of only the stopped instance's pending recovery.

The optional [collection isolation matrix](../../README.md#cross-plugin-isolation-verification) additionally exercises all seven plugin combinations in real Pi; it is development-only, not an installation or runtime dependency.

Use the package-local npm lockfile and npm 11.20.0:

```sh
cd packages/pi-auto-resume
npm ci --ignore-scripts --legacy-peer-deps
npm run typecheck
npm run check
npm test
npm run smoke
```

`typecheck`, Biome, and Vitest are separate checks. `.npmrc` disables dependency lifecycle scripts. No JavaScript is emitted.

The smoke test requires an installed Pi binary. If `pi` is not directly executable (for example a Windows command shim), set `PI_BINARY` to the actual executable path. PowerShell example:

```powershell
$env:PI_BINARY = 'C:\path\to\pi.exe'
npm run smoke
```

The smoke test copies only this package into a temporary directory without siblings or `node_modules`, uses an isolated Pi agent directory and a synthetic provider, and launches real Pi RPC. It verifies one network recovery, no continuation after success, cancellation of an idle wait, bounded retries, dynamic configuration persistence, and clean shutdown. It does not use your credentials or send a live model request. Expected final output ends in `PASS`.

Physical sleep/wake and every provider-specific failure wording have not been live-tested. Deterministic timing/error tests cover the supported decision rules; the real Pi smoke covers the host loading and continuation boundary.
