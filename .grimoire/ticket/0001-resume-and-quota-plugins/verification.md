# Implementation and Verification Evidence

**Date:** 2026-11-03
**Sources:** [Resume spec](../../spec/0002-pi-auto-resume.md), [quota spec](../../spec/0003-pi-quota-keeper.md), quota spec U8 (released user checkpoint), [ticket relationships](./README.md).
**Result:** Local implementation and controlled gates pass. Overall live/physical/platform acceptance remains unverified; no ticket is marked Done.

## Execution contract and route

Plan -> implement/test in thin slices -> inline review + acceptance check -> in-scope fixes -> combined verification -> formatting and affected checks -> report. Planning was useful for independent package branches, provider capability qualification, and cross-process ownership. The saved local plan is `.grimoire/plans/0001-resume-and-quota-plugins.md`, ignored by the existing Grimoire policy; that policy was not changed or bypassed.

No stage was disabled. Live subscription requests, physical sleep/wake, and a non-Windows execution environment were not available evidence, not passed checks. No external delegate, Git commit/push, publication, modification of personal Pi registration, or real activation request was performed.

## Implemented surfaces

- `packages/pi-auto-resume/`: manifest, explicit extension entry, configuration schema, session-owned recovery, documentation, tests and package lockfile.
- `packages/pi-quota-keeper/`: manifest, explicit entry, Pi/Antigravity account inventory, sanitized quota adapters, capability-gated scheduler, persisted activation intent, OS ownership, documentation, tests and package lockfile.
- Root/package catalog documentation now links real resources and distinguishes controlled runtime evidence from live-service claims.
- Only actual host imports are peers with `*` ranges; development copies are pinned. No extra runtime dependency or undeclared sibling import is required.

## Final executed gates

Environment: Windows, Node 26.13.0, npm 11.20.0, installed Pi 1.5.0 binary.

For each package directory:

| Command | Pi Auto Resume | Pi Quota Keeper |
| --- | --- | --- |
| `npm run typecheck` | Pass, no JavaScript emitted | Pass, no JavaScript emitted |
| `npm run check` | Pass, 8 files, no fixes | Pass, 13 files, no fixes |
| `npm test` | Pass, 18 tests | Pass, 30 tests |
| `npm run smoke` with `PI_BINARY` set to installed executable | Pass | Pass |
| `npm audit --json --registry=https://registry.npmjs.org` | Zero reported advisories | Zero reported advisories |

Initial dependency installation succeeded with scripts disabled. A final combined `npm ci && checks` command reached the 200-second command timeout after npm reported adding 170 packages per package, so that whole command is not counted as a successful gate. TypeScript, Biome, Vitest, and smoke were then rerun separately against the resulting installed dependency tree and all returned exit 0. The configured mirror's audit API returned HTTP 405; the non-writing audit was rerun against the official registry with an explicit command flag, without changing registry configuration.

The smoke tests copy the selected package outside the repository with no sibling packages or node_modules, isolate the Pi agent directory, and use real Pi RPC plus synthetic provider/quota fixtures. No live credentials are printed or used.

## Criterion-to-evidence assessment

| Criteria | Code and evidence | Assessment / limit |
| --- | --- | --- |
| A1 independent packaging/stack | Per-package manifests/configs; standalone Pi smoke; separate checks | Match for tested environment |
| A2 configured network/throttle/quota/wake recovery | Recovery classifier/controller tests; real Pi network recovery | Match for supported evidence forms; live wording coverage unverified |
| A3 completion/stop/context/output/session boundaries | Negative classifier and cancellation tests; real Pi completion/idle-stop smoke; lifecycle guards | Controlled match; physical TUI abort interactions not separately exercised |
| A4 retry/reset timing and host cooperation | Timer/reset tests; final settled hook; busy/queue guards; bounded real Pi recovery | Controlled match; provider response availability varies |
| A5 per-session ownership | Controller per extension/session, session shutdown/tree/model invalidation | Source/test match; no singleton task-continuation dependency |
| A6 controls/docs/evidence | README, `/auto-resume`, separate quality checks and Pi smoke | Match with disclosed limits |
| Q1 independent packaging/stack | Per-package metadata/config; copied standalone Pi smoke | Match for tested environment |
| Q2 actual account/quota attribution and unavailable reasons | Pi auth/linked-account tests; Antigravity/Claude/Codex/Copilot parsing; unsupported Grok reason | Controlled match to U8; authenticated service fetches not verified |
| Q3 real reset + configurable delay / optional 5h mode | Schedule tests; real Pi delayed activation; follower schedule projection | Controlled match; actual service activation confirmation unverified |
| Q4 isolation and account pinning | Isolated context without tools; explicit intended token; real Pi work transcript unchanged | Controlled match; no live request issued |
| Q5 one poller and takeover | OS ownership; simultaneous processes; actual owner SIGKILL; surviving Pi polls without replay | Match on tested Windows; non-Windows transport unverified |
| Q6 Pi lifecycle / current need after wake | Abort-before-release; OS-held non-expiring ownership; time-gap reevaluation; missed-cycle scheduler cases | Controlled match; physical suspension/resume unverified |
| Q7 truthful config/UI/security/docs | Schema validation; fixed HTTPS endpoints; redirects disabled; bounded requests; scrubbed cached state; real Pi UI | Controlled match; no blanket live-provider claim |

U8 explicitly permits unavailable provider capabilities with reasons and disables unqualified activation. The selected Gemini source is the installed Pi Antigravity integration, not the built-in Google API-key provider or another CLI's account store.

## Inline review and assessed fixes

Reviewed all production entries/helpers, owning tests and smoke scripts, package configuration/lockfile roots, relevant unchanged SDK contracts, complete tracked documentation changes and new files. Correctness, security, lifecycle, account attribution, concurrency, and acceptance alignment were the material lenses.

Confirmed findings were fixed and affected checks refreshed:

- A null five-hour Claude quota is not eligibility evidence (some plans lack that window): added a failing regression and tightened capability qualification.
- Windows TCP reserved port 56852 caused EACCES: confirmed its excluded range and verified exclusive named-pipe semantics, then used a named pipe on Windows.
- Non-Windows multi-slot collision fallback could split ownership after the colliding scope exited: replaced it with a deterministic fail-closed slot; non-Windows runtime evidence remains pending.
- Followers must display owner mode/delay/opt-in, not local defaults: persisted sanitized schedule projection and checked both real Pi views.
- Recheck fresh quota before a due activation, so a window already opened by normal work is not needlessly activated.
- Pin activation to the intended account token and record intent before side effects; unknown outcomes are not automatically replayed.
- Bound/cancel host credential resolution before releasing ownership; corrupt state fails closed rather than discarding the activation ledger.
- Corrected erasable TypeScript syntax, normalized formatter/configuration issues, and retained meaningful separate quality gates.

There are no remaining confirmed code blockers in the inspected local result. This is not a clean verdict for unread or unexecuted live integrations. Physical sleep/wake, non-Windows operation, real provider permissions/schema changes, and policy/credit behavior remain needs-verification.

## User-facing handoff

- Use each package README for independent installation and verified commands.
- Activation is off by default. `/quota` supplies account IDs; opt in only an eligible account and exact registered model in `pi-quota-keeper.json`.
- No user credential file or personal Pi registration was modified by this run. Temporary smoke credentials/fixtures were isolated and cleaned up.
- Specs/tickets remain In Progress and ADR 0003 is Testing because the remaining evidence is not silently treated as passing.

## Antigravity compatibility repair — 2026-11-03

A user reported Antigravity HTTP 403/429 while OMP displayed quotas. Source comparison used OMP 18.16.0's [usage adapter](https://github.com/can1357/oh-my-pi/blob/v18.16.0/packages/ai/src/usage/google-antigravity.ts) and [wire headers](https://github.com/can1357/oh-my-pi/blob/v18.16.0/packages/catalog/src/wire/gemini-headers.ts), plus installed pi-antigravity 0.11.0. The local adapter previously stopped on model-catalog failure before trying a potentially successful quota summary; it also omitted several returned quota shapes. A controlled reproduction confirmed this failure for both 403 and 429. This identifies local compatibility defects, not the remote rejection cause for each real account.

The repair prefers the project-scoped summary, bounds fallback across fixed Google endpoints and model quota, uses explicitly plugin-identified compatibility headers, and parses grouped/top-level buckets and daily/weekly/tier/window model quota. Authentication rejection and cancellation stop probing. Missing percentages stay unknown; activation eligibility, account discovery, ownership, and scheduling contracts are unchanged.

Verification after the repair:
- Provider regressions: 15 failed / 21 passed before implementation, then all 36 passed.
- Complete package suite: **61 tests passed**; TypeScript no-emit and Biome passed.
- Real Pi 1.5.0 standalone RPC smoke: two dummy linked Antigravity accounts exercised primary-summary 429 -> alternate-summary success and all-summary 403 -> daily/weekly model success. Both accounts rendered available quota; only the elected owner queried them. Existing reset-delay, isolated activation, owner-crash takeover, no-replay, and credential-free cache checks passed.
- No personal credential contents were inspected, no authenticated Google quota requests were sent, and no real activation occurred. Those accounts' live access remains unverified; this evidence does not complete the outstanding live/physical/platform acceptance gates.

## Explicit best-effort subscription wake-ups — 2026-11-03

Spec 0003 U9 records the user's acceptance of possible quota/credit charges and no guaranteed five-hour-window activation. Default opt-in remains empty. Current/legacy Codex, Google Antigravity, Copilot and Grok now have account-pinned best-effort request adapters; Claude's qualified five-hour behavior remains available. Fixed mode can run with usable generation auth even when quota is unavailable; reset mode requires an identifiable actual reset. API-key credentials, unknown adapters, unusable auth, and native header-only auth are blocked rather than falling back to ambient credentials.

Implementation separates quota and generation auth (notably Copilot), checks login-identity changes during host auth resolution, preserves native proxy/auth fields, and keeps credentials in memory only. Google sends one fixed-account generateContent RPC rather than invoking pi-antigravity 0.11.0's account-rotating stream. No Google account/model/endpoint retry occurs. Intent precedes the side effect; failed/uncertain delivery is not replayed. Successful replies explicitly leave window opening unverified. Token limits are requested, not guaranteed by every adapter.

Evidence:
- Test-first failures covered scheduling/transport gaps, Copilot/Grok auth separation, UI state, login identity races, unsafe auth fallback, and a missing explicit Claude reset selection.
- **87 Vitest tests passed** serially; TypeScript no-emit and Biome passed.
- Real Pi 1.5.0 two-process smoke passed: Google and legacy Codex wake-ups plus Claude activation, token/project/header pinning, non-retried Google 429, reset delay, unchanged foreground messages and account/credential files, sole owner, abrupt takeover without replay, sanitized cache, and shutdown.
- Temporarily inverting the preflight credential guard caused 7 wake-up tests to fail. The original guard was restored.
- Delegate review could not spawn because the extension could not locate Pi CLI; targeted manual review was used. No independent-review receipt is claimed.
- Parallel checks hit Windows committed-memory exhaustion and Pi startup timeout. Serial TypeScript with a 512 MB heap, one-worker Vitest with a 256 MB heap, and the smoke parent with a 128 MB heap completed. No unrelated applications were terminated or system settings changed.
- The added host peer `@earendil-works/pi-ai: "*"` provides normalized isolated contexts. No new external runtime package was introduced.

No personal configuration was enabled and no real account activation or authenticated quota request was sent. Fixtures use dummy credentials and synthetic responses. Live-provider/window behavior, physical sleep/wake, and non-Windows acceptance remain unverified; spec/ticket/ADR completion gates stay open.

## Codex reported reset-credit counts — 2026-11-03

The user requested displaying Codex's available quota-reset count. OMP 18.16.0's `packages/ai/src/usage/openai-codex.ts:346-357` qualifies `rate_limit_reset_credits.available_count` from the existing usage response. The adapter now preserves a validated nonnegative safe integer separately from quota/reset windows, including zero. Missing/invalid counts stay unknown. A count-only response is useful quota information but supplies no reset time or activation eligibility by itself.

Both quota views display the reported count. Sanitized shared snapshots carry only the count, not individual redemption IDs or other account secrets. No reset-credit detail/redemption endpoint was added; automatic wake-up does not request redemption.

Test-first: 10 failing cases demonstrated missing parsing/display/count-only handling. Final package verification passed TypeScript no-emit, Biome, **107 Vitest tests**, and the real Pi two-process fixture smoke. The smoke checks count rendering in compact/details views and its persistence for followers after wake-up. No authenticated Codex request or real redemption was performed. Previously documented live/physical/platform acceptance gaps remain open.

## Codex reset-credit expiry in details — 2026-11-03

This extends the preceding count-only stage. The user requested expiry dates in the detailed quota view. Source qualification used OMP 18.16.0's read-only reset-credit listing client: `GET /wham/rate-limit-reset-credits`, response `credits[].expires_at/status` and `available_count`. The sole owner now queries this fixed HTTPS route when usage reports a positive count, reusing pinned account auth. The read has a five-second sub-deadline within a 15-second query budget; redirects are forbidden. No consume/redemption route is implemented or invoked.

Only anonymous parsed expiry timestamps are shared. Redeemed/expired-status entries and duplicate IDs are excluded; raw IDs/titles/descriptions never enter state or UI. A valid explicit detail count supersedes usage, including zero. Detail failure is nonfatal for quota/count; missing/invalid dates and unlisted entries stay unknown. Detailed output groups identical expiry dates with UTC and relative times, keeps distinct dates separate, and marks past dates expired. Compact output remains count-only.

Test-first verification: 8 failing cases became green. Final TypeScript no-emit, Biome and **115 Vitest tests** passed with the documented low-memory serial execution. The real Pi two-process smoke additionally verified owner-only authenticated detail reads using dummy credentials, compact/detail separation, grouped distinct dates, sanitized expiry persistence, and unchanged wake-up/ownership/no-replay checks. No authenticated live quota/detail query or real reset-credit redemption was performed; live/physical/platform gates remain open.

## Account ID/list commands and owner-forwarded refresh — 2026-11-03

Spec 0003 U10 records exact-ID selection, masked account listing, and immediate manual refresh. Implemented commands are `/quota list`, `/quota <id> [details]` (also `details <id>`), and `/quota refresh`. List output includes provider/authentication type; legacy caches leave unknown types explicit. Unknown/partial IDs do not fall back to another account. View commands read sanitized cached snapshots without extra service queries.

Manual refresh bypasses the poll interval but serializes with current maintenance, coalesces concurrent requests, and performs quota-only polling. Followers forward requests to the exclusive owner over the existing local listener; they never independently resolve provider auth or poll services. A per-owner random token in the private agent directory authorizes the control request, not ownership. Stale tokens cannot block takeover; they are replaced by the new owner and removed by their owner on orderly shutdown. No token is exposed in shared quota state. Requests and responses are bounded, close/abort is handled, and failure is not acknowledged as successful refresh.

Evidence:
- Test-first command cases: 14 failed before implementation; five initial owner-refresh cases also failed before the API existed.
- Final TypeScript no-emit, Biome, and **140 Vitest tests** passed serially. Coverage includes exact matching, list privacy/type/size, owner forwarding, coalescing, isolation, wrong-token rejection, stale-token replacement, failure recovery, and pending-client shutdown.
- Real Pi 1.5.0 two-process smoke passed: follower refresh bypassed the interval, only the owner polled, concurrent owner/follower commands coalesced into one poll, list/ID/details returned the intended data without extra queries, no wake-up was replayed, the local token stayed out of snapshots, and orderly shutdown removed it. Existing quota/expiry, account pinning, abrupt takeover and transcript-isolation checks also passed.
- One smoke attempt hit the host's Windows trust-store lock initialization `EPERM`. The fixture now initializes Pi instances serially, then exercises them concurrently; ownership acquisition races remain separately covered by parallel Owner unit checks. Notification assertions select `notify` events rather than racing with `setStatus` events.
- Review was scoped manual inspection; no independent-review receipt is claimed.

No personal Pi settings, live accounts, or real subscription requests were changed or exercised. Previously documented live-provider, physical sleep/wake and non-Windows acceptance gaps remain open.

## Provider-owned linked Antigravity OAuth renewal — U11

The user reported a saved-token-expired message and explicitly approved automatic renewal through the installed provider. Sanitized local metadata distinguished an expired inactive linked account from quota exhaustion. Previously, inventory deliberately suppressed expired linked access tokens and never invoked an inactive-account refresher; `/quota refresh` alone could not repair that state.

Implementation adds `extensions/antigravity-auth.ts` and integrates it into owner-side inventory. Missing/expired/near-expiry (60 seconds) inactive access tokens use the public registered OAuth refresher; pi-antigravity itself persists the renewed credential. The package never calls its activation/failover/login helpers or writes root auth. A compatible auth-file lock serializes normal Pi credential refresh, with persisted-freshness rechecking/deduplication, identity/root/selection guards, deleted-account protection and sanitized one-minute failure cooldowns. Active credentials remain on the existing host resolver path.

The host uses a 30-second stale threshold for async auth refresh but 10 seconds for sync readers. This lock keeps the async threshold and updates every five seconds. It is not the maintenance-ownership mechanism. Direct account-management commands need not honor the lock; guards reject changed state without restoring old login data.

pi-antigravity 0.11.0 ignores the refresh abort signal. Cancellation before acquisition/call stops renewal, but an already-started callback is awaited through provider persistence before releasing the lock or maintenance ownership. This preserves rotating credentials on orderly cancellation; it can delay shutdown/other credential resolutions and is not a hard network deadline. Abrupt termination during issuance/persistence is still a reauthentication risk.

Verification:
- Test-first reproduction failed because the inactive-account refresh callback was never invoked.
- **152 Vitest tests** pass, including 20 account tests: target-only renewal and saved rotated credentials, unchanged root/selection/other accounts, simultaneous inventory deduplication, failure isolation/cooldown/secret suppression, missing provider, near expiry, absent persistence, wrong identity, changed active login, deletion/becoming-active during lock wait, waiting cancellation and uncancellable in-flight persistence.
- TypeScript no-emit and Biome checks pass serially. Declared runtime dependency `proper-lockfile@4.1.2` and development types were installed without lifecycle scripts; npm reported zero advisories.
- The real Pi standalone dual-process smoke installs production dependencies offline from the lockfile into an isolated copy, with no sibling packages or inherited dependencies. A dummy expired linked Google account renews exactly once through the registered fixture provider, persists a new access/refresh token, retains active selection/unrelated credentials/root auth, and successfully serves pinned quota/wake-up calls with the new token. Existing fallback, manual refresh, owner takeover/no replay, foreground isolation, reset-credit expiry and secret-free cache checks pass.
- A final smoke rerun exposed a pre-existing assertion race: dispatch metrics can precede the durable Codex completion outcome. The fixture now waits boundedly for persisted terminal outcomes; two subsequent consecutive dual-Pi runs passed. No production behavior was relaxed to satisfy the assertion.
- Temporarily disabling the returned-identity guard caused the focused wrong-identity regression to fail as expected, even with a valid persisted token. The guard was restored, then all 152 tests, TypeScript and Biome passed again. Production-dependency npm audit reported zero advisories.
- Review is scoped manual source/diff inspection; no independent-review receipt is claimed.

No live OAuth refresh, authenticated subscription quota/model request, personal configuration/registration change, or active-account switch was performed. Reload all plugin-loaded Pi instances before using the updated owner behavior, then request `/quota refresh`. Invalid/revoked refresh tokens still require user reauthentication; expiry repair is not a guarantee of remote quota access. Existing live-provider, physical sleep/wake and non-Windows gates remain open, so ticket/spec/ADR completion states are unchanged.
