# Pi Quota Keeper

Show quota for Pi-logged-in accounts, track actual service reset times, and perform capability-gated minimal-message activation outside work conversations. Concurrent Pi processes sharing an agent directory elect **one maintenance owner**.

## Compatibility and resources

- Node.js >= 22.19.0; TypeScript ESM; no bundler/emitted build.
- Requires Pi's provider auth/model-registry, isolated `complete()`, session lifecycle, TUI `SettingsList` (`@earendil-works/pi-tui`), and command APIs. Tested with Pi **1.5.0**, Windows, Node **26.13.0**.
- One resource: `extensions/index.ts`; command `/quota`. No sibling package is required.
- Google/Gemini here means **Google Antigravity**, including Pi-owned linked accounts from `pi-antigravity` 0.11.0's documented credential format. This package does not install, import, or silently enable that optional provider.

## Install and use

From the collection checkout:

```sh
npm --prefix ./packages/pi-quota-keeper ci --omit=dev --ignore-scripts --legacy-peer-deps
pi -e ./packages/pi-quota-keeper
# Or persist the individual package:
pi install ./packages/pi-quota-keeper
```

Runtime imports use Node, host-provided peers, and the declared dependency `proper-lockfile`. Local packages require the dependency preparation above; managed npm/git installs prepare declared dependencies. No build is needed. `/quota` shows a compact health summary, available accounts first, percentage bars, relative reset countdowns, and concise failures without duplicated activation errors. `/quota details` includes configuration IDs, per-account check times, exact UTC resets, full reasons, and activation outcomes. The footer identifies owner/follower. Compact views show six limits per account; full output is capped at 200 lines.

## Commands

Commands follow the unified `/quota <action> [other-args]` format with interactive subcommand and argument auto-completion (`getArgumentCompletions` suggests actions, discovered account IDs, provider models, quota windows, and config keys/values):

| Command                               | Result                                                                                                                  |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `/quota`                              | Open interactive TUI quota & wake-up settings panel in TUI mode, or compact cached quota summary in non-TUI modes       |
| `/quota status [account-id]`          | Compact cached quota for all accounts or one exact `<account-id>` (`/quota <account-id>` is also accepted)              |
| `/quota details [account-id]`         | Detailed cached quota, including exact UTC reset-credit expiries (`/quota <account-id> details` is also accepted)       |
| `/quota list`                         | Copyable account IDs, masked account labels, and type (provider / OAuth, API key, or unknown)                           |
| `/quota refresh`                      | Force an owner-only fresh poll, bypassing the configured interval, then show its results                                |
| `/quota enable <id> <model> [window]` | Persist account wake-up opt-in and model (plus optional reset window) in `pi-quota-keeper.json` and refresh owner state |
| `/quota disable <id>`                 | Remove account from `enabledAccounts` in `pi-quota-keeper.json` and refresh owner state                                 |
| `/quota config [reload \| key [val]]` | Open TUI settings panel (in TUI mode with no key), reload config, or view/update `mode`, `delayMs`, or `pollIntervalMs` |
| `/quota help`                         | Display command usage                                                                                                   |

IDs come from `/quota list` and are matched exactly; unknown/partial IDs never fall back to other accounts. List/ID/details views do not trigger extra provider requests. Old caches with no credential-type metadata show unknown until refreshed. Lists are capped at 196 entries with an explicit truncation notice.

Refresh from a follower is forwarded to the elected owner; it never independently resolves provider credentials or queries quotas. Concurrent requests are coalesced. Refresh waits for an already-running maintenance job, then runs a quota-only poll; normal scheduled wake-up checks continue independently. Completion means the refresh was performed, not that every provider returned usable quota. Failure/timeout shows a warning and cached results, never a false success. Reload **all** plugin-loaded Pi instances after upgrading so the owner understands the refresh protocol.

The local refresh channel requires a random authorization token in `.pi-quota-keeper-refresh-token` inside the private Pi agent directory. It is separate from provider credentials and sanitized quota snapshots; never publish it. Mode 0600 is requested where supported; Windows inherits directory ACLs, so keep that directory private. The owner replaces the token after takeover and removes its own token on orderly shutdown. This file is **not an ownership lease**: only the exclusive OS listener grants ownership. No external-facing listener, login/logout action, or active-account switch is introduced; normal Pi-owned OAuth refresh may occur while resolving quota auth.

## Service capability boundaries

| Pi provider                         | Quota behavior                                                  | Automatic activation                                                                            |
| ----------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `anthropic`                         | OAuth usage endpoint; five-hour/weekly values when returned     | Opt-in isolated request; real five-hour timing when available, otherwise explicitly best-effort |
| `openai`, legacy `openai-codex`     | OAuth Codex usage windows when permitted                        | Opt-in best-effort wake-up; primary quota reset or explicit fixed mode                          |
| `antigravity`, `google-antigravity` | Summary first; per-model daily/weekly/tier/window fallback      | Opt-in best-effort, account-pinned Google RPC; no automatic account failover                    |
| `github-copilot`                    | Recognized account quota snapshots; monthly resets stay monthly | Opt-in best-effort ping using resolved model auth; does not start or renew a monthly allowance  |
| `xai` / Grok                        | Quota endpoint remains unqualified/unavailable                  | Explicit fixed-mode best-effort wake-up with usable Pi subscription OAuth                       |

These are implemented adapter/protocol boundaries, **not verified live-account support claims**. Quota failures remain unavailable; missing values stay unknown. An opted-in best-effort wake-up is a minimal request, not proof of a new window. When quota is unavailable or no applicable reset can be selected, only explicitly selected fixed mode can run it. API-key accounts and unknown-provider adapters are never activated. Only accounts saved by Pi are inventoried; other CLIs' credentials are not read.

Codex `/quota` and `/quota details` show `Rate-limit resets: N available` separately from percentage windows and reset countdowns. Counts come from `/wham/usage.rate_limit_reset_credits.available_count`, qualified against [OMP 18.16.0's parser](https://github.com/can1357/oh-my-pi/blob/v18.16.0/packages/ai/src/usage/openai-codex.ts#L346-L357). Explicit zero is preserved; missing/invalid values remain unknown, never zero. These are saved quota-reset credits, not billing credits or automatic reset events.

When the reported count is positive, the sole polling owner makes one extra read-only `GET /wham/rate-limit-reset-credits` with the same pinned OAuth/account headers. It has a five-second sub-deadline within the usage query's 15-second total budget and forbids redirects. A valid explicit detail count supersedes the usage count, including zero. No request is made for a zero/missing count. Lookup failure preserves the usable quota/count and marks expiry unavailable. Only anonymous parsed expiry timestamps are shared; credit IDs, raw titles, descriptions and redemption data are not cached or displayed.

**Only `/quota details` displays expiry information**: available entries sharing a date are grouped, with exact UTC expiry and a relative countdown. Different dates remain separate; past dates are marked expired. Missing/invalid dates or unlisted entries stay unknown. The compact view retains only the count. The listing protocol is qualified against [OMP's read-only reset-credit client](https://github.com/can1357/oh-my-pi/blob/v18.16.0/packages/ai/src/usage/openai-codex-reset.ts#L90-L147). No reset/redemption endpoint is called; scheduled wake-up does not request credit redemption.

### Linked Antigravity OAuth renewal

Antigravity's active account uses Pi's normal auth resolver. For inactive Pi-linked accounts, the maintenance owner automatically renews missing/expired access tokens and tokens within 60 seconds of expiry through the registered provider's `auth.oauth.refresh` interface. This requires the installed/enabled `pi-antigravity` provider, a saved refresh token, Pi 1.5.0's public provider API, and the version-1 linked store qualified against pi-antigravity 0.11.0.

The provider itself persists the refreshed credentials in its private linked-account store. This package neither implements Google's OAuth protocol nor selects another login, calls account rotation, or writes `auth.json`. It rereads persisted credentials and validates identity and active-account state before use. Deleted accounts are not revived; concurrent login changes are not rolled back. Missing support/credentials, refresh rejection, or unsafe changes leave only that account unavailable—not exhausted quota. Other accounts remain queryable. Failed renewals have a one-minute in-process cooldown per saved credential; manual `/quota refresh` does not bypass that OAuth safety cooldown.

Renewal uses Pi-compatible `auth.json.lock` locking to serialize with normal host OAuth refresh, with a 15-second acquisition limit. Direct account-management commands from other plugins may not honor that lock; identity/root/selection checks detect changes rather than overwriting them. The lock protects credential work, **not maintenance ownership**.

A 15-second abort signal is passed to the registered refresher. **pi-antigravity 0.11.0 ignores that signal**: after renewal starts, this package waits for the provider to finish/save rotated credentials before releasing its lock or maintenance ownership. This can delay orderly shutdown and other credential resolutions; it is not a hard 15-second network guarantee. Abrupt termination during server-side rotation can still require signing in again. Malformed linked metadata is reported explicitly. Token renewal is not subscription/quota renewal or window activation.

Antigravity quota queries prefer `retrieveUserQuotaSummary`, then fall back to `fetchAvailableModels`. Both send the account's project ID. Fixed daily, sandbox, and production Google endpoints are tried at most once per RPC, with one 15-second total budget, cancellation, and no redirects; authentication rejection (401) stops probing. Summary parsing accepts grouped/top-level buckets and ignores disabled buckets. Model fallback accepts quota arrays, daily/weekly fields, and tier/window maps without guessing missing percentages or inferring window lengths from reset times.

The compatibility request headers track [OMP 18.16.0's Antigravity protocol](https://github.com/can1357/oh-my-pi/blob/v18.16.0/packages/catalog/src/wire/gemini-headers.ts) (pinned compatibility version 2.26.0, gzip), with an explicit `pi-quota-keeper/0.1` product suffix and the actual host OS/architecture. This is a wire-compatibility setting, not an official-client identity, an entitlement grant, or evidence of live access. The summary-first/fallback sequence is qualified against [OMP's usage adapter](https://github.com/can1357/oh-my-pi/blob/v18.16.0/packages/ai/src/usage/google-antigravity.ts); endpoint fallback is also present in the installed `pi-antigravity` 0.11.0 source. No OMP dependency or credential access is introduced.

## Configuration

Create `pi-quota-keeper.json` in Pi's agent directory (normally `~/.pi/agent`, or `PI_CODING_AGENT_DIR`). The owner reloads it on polling cycles.

Defaults:

```json
{
	"pollIntervalMs": 60000,
	"mode": "reset",
	"delayMs": 30000,
	"enabledAccounts": [],
	"models": {},
	"resetWindows": {}
}
```

- `pollIntervalMs`: 10000–86400000ms.
- `mode`: `reset` uses actual reset + delay; `fixed` is an explicitly selected five-hour cadence, anchored when an opted-in eligible account is first observed.
- `delayMs`: 0–86400000ms after the real reset; default 30 seconds.
- `enabledAccounts`: exact IDs shown by `/quota details` (maximum 100).
- `models`: opted-in account ID -> exact registered chat model ID for that provider. No foreground-model fallback or cross-provider routing. Google needs a service-accepted runtime model ID, not an alias requiring provider-side remapping.

Wake-up/activation is **off by default**. Both `enabledAccounts` and a registered entry in `models` are required. Existing explicitly enabled accounts/models become eligible for the expanded best-effort adapters after upgrading; review those opt-ins first. Copy IDs from `/quota details`; this is a reference fragment, not literal runnable configuration:

```json
{
	"enabledAccounts": ["anthropic:ACCOUNT_ID_FROM_QUOTA"],
	"models": {
		"anthropic:ACCOUNT_ID_FROM_QUOTA": "YOUR_REGISTERED_CLAUDE_MODEL_ID"
	}
}
```

Both eligibility and opt-in are required; a model must also be configured. A null/missing five-hour quota is not proof that an account has that limit. Reset mode does not invent a timestamp for an unused/unknown window. Before a due request, quota is rechecked; if real work already started a newer window, no extra activation is needed.

An isolated `Reply OK.` request uses freshly resolved, account-pinned model auth, no work history, and no tools. It requests `maxTokens: 1`/`maxOutputTokens: 1`; providers may clamp or omit that parameter (notably OpenAI/Codex), so this is **not a guaranteed one-token or monetary cap**. SDK reasoning defaults to off, retries are disabled where the native adapter honors that option, and requests have a 30-second abort deadline. Native requests call the registered provider with explicit auth, preserving provider-specific headers/proxy URLs without reselecting the foreground login. Copilot's GitHub quota-query token is not its model token. A login identity change during auth resolution blocks that inventory result.

## Coordination, wake, and failure handling

Only this package's elected owner resolves/query-checks account quotas and sends activation. Followers read sanitized local snapshots, not service endpoints. Other installed providers may have their own independent catalog refreshes; this package does not control those.

Windows uses an exclusive OS named pipe; other platforms use an exclusive loopback listener. Scope is the canonical Pi agent directory on one computer. There is no expiring lease to create a second owner after sleep; the OS releases ownership on process death. Takeover is retried on one-second ticks. Non-Windows transport is implemented but not runtime-tested here. A non-Windows coordination address collision pauses maintenance rather than moving slots and risking duplicate owners.

Quota snapshots and a versioned activation ledger live in `pi-quota-keeper-state.json` in that directory. They contain no access/refresh tokens or full email addresses. The sole owner writes atomically; unreadable/corrupt state pauses maintenance rather than treating an existing activation ledger as empty.

Activation intent is persisted **before** the request. On owner crash, timeout, or an ambiguous remote result, the same cycle is not replayed; this favors avoiding duplicates over pretending exactly-once external delivery. Do not delete the ledger to retry an uncertain request without checking the service. Wake rechecks current state and never replays all missed cycles. Shutdown aborts work before releasing ownership. No daemon runs after all Pi processes exit, and the computer is not woken by this package.

Timing is best-effort while Pi is running: tick cadence, quota polling, request time, and sleep can delay execution beyond the configured due time.

## Permissions and external access

The extension has Pi's process privileges. It reads Pi auth and optional Pi Antigravity linked-account data in memory, uses host credential resolution and registered OAuth refresh, and writes private state and temporary credential-lock metadata. Its own quota/wake-up requests contact fixed HTTPS endpoints with bounded requests and redirects disabled; delegated OAuth follows the registered provider's network/timeout policy and may update its private linked credentials. Raw service error bodies and credentials are not displayed or cached. No external account stores, arbitrary package-configured URLs, or background system services are used.

## Development and verification

This plugin declares `pi-plugin-support@0.1.0` as an ordinary dependency. Its versioned archive is shipped in `vendor/` for package-local lockfile setup; npm distribution bundles only that ordinary library, never host SDKs or another plugin. Follow the [support-library reference](../pi-plugin-support/README.md) when updating shared sources. No registry publication or emitted build is required. Prepare dependencies before `pi -e` or local installation; Pi does not install local-package dependencies.

The shared library owns configuration-file and TUI/discovery mechanisms; this plugin retains its own schema, failure policy, actions, instances and resource cleanup.

Package-local configuration metadata supplies both command completions and scalar panel presets; account configuration and schema validation remain domain-owned. Lifecycle regression tests use empty account fixtures with real OS ownership to verify factory inactivity, repeated-start cleanup, and independent instances without accessing credentials.

The optional [collection isolation matrix](../../README.md#cross-plugin-isolation-verification) additionally exercises all seven plugin combinations in real Pi; it is development-only, not an installation or runtime dependency.

Use npm 11.20.0 and the package-local lockfile:

```sh
cd packages/pi-quota-keeper
npm ci --ignore-scripts --legacy-peer-deps
npm run typecheck
npm run check
npm test
npm run smoke
```

The separate checks are TypeScript no-emit, Biome, Vitest, and real Pi loading/usage smoke. `.npmrc` disables dependency lifecycle scripts. Set `PI_BINARY` to the installed executable when needed; Windows PowerShell:

```powershell
$env:PI_BINARY = 'C:\path\to\pi.exe'
npm run smoke
```

The smoke copies this package outside the checkout without sibling packages or inherited `node_modules`, installs production dependencies offline from the lockfile/cache prepared by `npm ci`, uses dummy credentials and synthetic responses in real Pi, and launches two RPC processes. It checks owner-only expired linked-token renewal/persistence, unchanged active selection and unrelated credentials, Google summary/model fallback, two Google wake-ups (including a non-retried 429), pinned Codex and Claude requests, reset+delay, untouched foreground messages/root auth, one owner, abrupt takeover without replay, credential-free cache, and shutdown. Expected output ends in `PASS`. Pure tests additionally cover renewal failures/cooldown, concurrent deduplication, removal/identity races, cancellation before and during provider refresh, current OpenAI, Copilot model-token/proxy separation, Grok, fixed mode without queryable quota, and missing/reset-window selection.

No live OAuth refresh, subscription activation, or authenticated service quota check was performed. Physical OS sleep/wake is not tested; deterministic schedule tests cover time jumps and current-window/no-replay rules. See the collection's [provider evidence](../../.grimoire/ticket/0001-resume-and-quota-plugins/provider-capabilities.md) for source qualification and remaining live-evidence gaps.
