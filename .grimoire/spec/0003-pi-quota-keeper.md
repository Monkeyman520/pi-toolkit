# Pi Quota Keeper

**Spec ID:** 0003
**Status:** In Progress
**Date:** 2026-11-03
**Endpoint:** Requirements and ticket decomposition only.

## Sources

- **U1:** Request for a separate plugin showing all accounts/subscriptions and their quotas, with automatic activation of 5-hour subscription windows, configurable timing, and a fixed 5-hour option.
- **U2:** Account source narrowed to accounts already logged into Pi, primarily subscriptions; not credentials harvested from other tools.
- **U3:** User confirmed service-reported reset times as the primary schedule, with optional fixed 5-hour operation. Activation is per account/subscription, separate from current work conversations, by a minimal message; default delay is 30 seconds after the real reset, configurable.
- **U4:** User confirmed Pi-running-only operation, wake checks, and no replay of all missed activation cycles.
- **U5:** User confirmed one maintenance owner on the same computer for processes sharing the same Pi account directory, no independent polling by every Pi, and automatic takeover after owner exit or crash.
- **U6:** Initial named service targets: Claude, OpenAI Codex, Gemini, GitHub Copilot, and Grok; further mainstream services were requested generically, not individually enumerated.
- **U7:** User selected Spec -> tickets and authorized functional renaming. `pi-quota-keeper` is the descriptive package name selected for quota visibility, reset tracking, and activation; not subscription renewal or a verified npm publication identity.
- **U8 — Released loop checkpoint:** The user approved showing real quota when queryable and explicit unavailable reasons otherwise, activation only for verified supporting accounts, and clarified Gemini means Google Antigravity. This supersedes earlier all-provider capability completion gates, not the Pi-only account source or independent package constraints.
- **U9 — Explicit best-effort expansion:** The user requested Google, Codex and other subscription wake-ups and accepted isolated scheduled minimal requests without a guarantee that success starts a new five-hour window, including possible quota/credit/fee consumption. Keep per-account explicit opt-in, reset+delay or explicitly fixed five-hour timing, no foreground mutation, one owner, no missed-cycle replay, and truthful request-versus-window outcomes. This releases U8's verified-activation-mechanism-only gate for best-effort wake-ups, not its authentication or quota-truthfulness boundaries.
- **U10 — Account lookup and manual refresh:** The user requested exact account-ID quota selection, a `list` action returning IDs/masked accounts/type, and a `refresh` action that queries immediately. The command interface is `/quota <account-id> [details]`, `/quota list`, and `/quota refresh`; manual refresh retains the sole-owner and isolated maintenance constraints.
- **U11 — Authorized linked-token renewal:** After an expired inactive Pi Antigravity credential was identified, the user explicitly permitted automatic renewal through pi-antigravity's registered OAuth interface. Keep the current account/foreground work unchanged; renew only the intended Pi-linked identity and let its provider persist credentials. Implementation verification must use simulated credentials: no real account-refresh requests or personal account/registration changes are authorized for this development run.
- **Project:** [Context](../CONTEXT.md), [ADR 0001](../adr/0001-independently-installable-pi-packages.md), [ADR 0002](../adr/0002-typescript-esm-plugin-development-stack.md), [ADR 0003](../adr/0003-pi-hosted-single-owner-subscription-maintenance.md), [package development reference](../../packages/README.md).
- **P1:** [Pi providers](https://pi.dev/docs/latest/providers): login stores provider credentials in the Pi agent directory; API credentials and OAuth are distinct possibilities.
- **P2:** [Pi extensions](https://pi.dev/docs/latest/extensions): host lifecycle, provider/auth resolution, and model calls. Installed Pi 1.5.0 `docs/providers.md` and relevant `docs/extensions.md` sections were inspected, not runtime-tested.

## Requirements

### Q1. Independent package

Implement under `packages/pi-quota-keeper/` with its own manifest, TypeScript configuration, README, and `extensions/index.ts`. It must install and run without `pi-auto-resume` or undeclared sibling source. Follow the established stack, dependency ownership, and separate quality/runtime checks. [U1, U7; Project]

### Q2. Logged-in account and subscription quota visibility

Show the accounts already logged into Pi and the quota information associated with their subscriptions as exposed by the service. Visibility is not restricted to the model selected in the foreground work session. Keep account/subscription attribution and service-provided quota windows, values, and reset times identifiable rather than treating unrelated limits as one universal 5-hour counter. [U1, U2, U6]

The initial named targets are Claude, OpenAI Codex, Google Antigravity (Gemini), GitHub Copilot, and Grok. Under U8, quota results remain truthful: real values where accessible, otherwise explicit unavailability. U9 additionally permits explicitly opted-in best-effort scheduled minimal requests when account-pinned subscription auth is usable, without claiming verified window activation. An inaccessible quota endpoint alone does not rule out fixed-mode wake-up; reset mode still requires an identifiable actual reset.

Neither Pi login nor the availability of a model proves that subscription quota/reset information is accessible. In particular, Grok subscription access must not be equated with an xAI API key, and an API-key balance must not be labeled as a subscription quota without evidence. Missing or unverified information must not be fabricated or represented as a known quota/reset. This truthfulness boundary is not permission to silently drop a named service from the requested coverage. [U2, U6; P1]

Under U11, the sole owner also renews expired/near-expiry inactive Pi Antigravity tokens through the registered provider, without a new login manager, switching accounts, or importing credentials. Validate identity and provider-owned persistence before using the result; unavailable refresh support or failed renewal remains distinct from quota exhaustion. Serialize credential work with normal Pi OAuth resolution, avoid reviving removed accounts or overwriting newer login state, and preserve any in-flight token rotation through orderly cancellation before releasing the lock/ownership. A provider that ignores cancellation must be documented rather than falsely claimed time-bounded. [U11]
### Q3. Service-aware activation timing

- Default scheduling uses the actual reset time returned by the service and sends after that time plus 30 seconds. The post-reset delay is configurable. [U3]
- Fixed every-5-hours scheduling is an explicit optional mode, not a universal assumption about all services or a silent substitute for an unknown real reset. [U1, U3]
- Each relevant account/subscription is scheduled using its own service data; reaching a local timer does not itself prove that a provider started or reset a window. [U1-U3]
- Sending a message and successfully activating a subscription window are different facts. Under U9, best-effort wake-ups may be implemented without a verified first-request window mechanism, but successful replies must remain explicitly unverified as window activation. Never promise a universal five-hour window, an allowance renewal, or a strict request-price/output-token cap. [U3, U6, U9]

### Q4. Isolated activation messages

Activation uses a minimal message for the intended account/subscription outside the user's current work conversation. It must not append activation prompts or responses to that conversation, switch its model/account, or interrupt its work. Accounts/subscriptions must not receive each other's activation messages. Exact message wording and the host API used for isolation are implementation details subject to this boundary. [U3]

Best-effort adapters must pin the request to the selected account, not permit a provider's automatic account rotation to mutate foreground credentials or charge a different account. Resolve quota-query and generation credentials separately where the provider requires it. Unknown delivery outcomes stay recorded and are not retried as though nothing happened. [U9]

### Q5. One maintenance owner per shared account scope

On one computer, all Pi processes sharing the same Pi account directory coordinate so that only one process performs quota polling and scheduled activation. Other processes must not independently poll service quotas or send scheduled activation messages. They may present information from the coordinated maintenance work without defeating this rule. [U5; ADR 0003]

When that owner exits or crashes, another eligible running Pi process automatically takes over. Graceful shutdown, abrupt termination, startup races, and wake must not turn every process into a service poller or create multiple simultaneous activation owners. The ownership mechanism and exact detection timing are not fixed by this specification. [U5; ADR 0003]

This ownership scope does not span multiple computers or separate Pi account directories, and it does not centralize the other plugin's session-local continuation. [U5; ADR 0003]

### Q6. Pi lifecycle and wake behavior

Maintenance operates only while an eligible Pi process is running; no standalone always-on daemon or wake-the-computer guarantee is required. On wake, check current quota/schedule state and perform only the activation currently needed. Do not replay every missed 5-hour cycle or every missed reset while asleep. Ownership transfer must preserve this behavior rather than treating transfer as a new reason to activate the same current cycle again. [U4, U5; ADR 0003]

### Q7. Configuration, presentation, and evidence

Users can view the logged-in account/subscription quotas and configure the reset delay and optional fixed-interval mode. Exact command names, UI placement, settings schema, account identity serialization, persistence format, and lock/IPC strategy are not selected here. The implemented interface must make the selected mode and actual quota/reset information verifiable. [U1-U3]

Under U10, list output includes copyable IDs, masked labels, and provider/authentication type. ID lookup matches exactly and never silently returns other accounts on a miss. Refresh bypasses the automatic poll interval, serializes with existing maintenance and coalesces concurrent requests through the sole owner; a follower cannot independently query service quotas. Failure must not be reported as a successful refresh. Normal periodic/wake-up behavior remains otherwise unchanged.

Each package README must document installation, setup, actual supported providers/credentials and limitations, configuration, active-message network/usage implications, Pi lifecycle constraints, and tested compatibility. Do not expose secrets in quota presentation or verification artifacts. Follow the existing host-privilege disclosure requirement. [U2-U6, U9; Project; P1]

## Solution and Integration Seams

Within running Pi processes, coordinate one maintenance owner for the shared Pi account directory. That owner obtains quota/reset data for Pi-logged-in accounts and handles isolated per-account/subscription activation; the other processes must not duplicate that external maintenance work. Use real provider semantics rather than imposing one billing/window model across services. [Q2-Q6]

| Seam | Connects | Expects | Provides |
| --- | --- | --- | --- |
| Account discovery/auth | Pi credential/provider facilities -> quota maintenance | Logged-in account identity and supported credential resolution in the shared account-directory scope | Correct account attribution without importing other tools' accounts |
| Quota/reset service | Authenticated service -> maintenance owner | Actual quota windows, units, reset times, and request failures where available | Attributable service facts for presentation and scheduling |
| Cross-process coordination | Pi processes sharing a scope -> maintenance owner | Scope identity, ownership/liveness, and current maintenance state needed for handover | One service-polling/activation owner and automatic takeover |
| Configuration/time | User settings and service reset evidence -> schedule | Reset-driven mode with configurable post-reset delay, or explicit fixed 5-hour mode | Per-account/subscription due work and wake catch-up without backlog replay |
| Activation | Due account/subscription -> authenticated model/service | Minimal isolated message and evidence of request/activation result | No work-conversation mutation; no invented window activation success |
| Quota presentation | Coordinated quota information -> running Pi UI | Account/subscription attribution and real quota/reset information | User-visible quota information without independent service polling from every process |

These are required behavioral exchanges, not a mandated implementation architecture or an undeclared shared dependency with the resume plugin.

## End-to-End Verification

| Scenario | Given / When | Then | Requirements |
| --- | --- | --- | --- |
| View all logged-in accounts | Several Pi accounts/subscriptions exist; user opens the quota interface | Attribution and available service quota/reset data are visible beyond the current model | Q2, Q7 |
| Linked token renewal | An inactive Pi-linked Antigravity token expires and its registered refresher is available | One owner renews/persists only that identity; quota becomes queryable with the new token; active login, unrelated credentials and foreground history are unchanged; failures/removal/races/cancellation fail safely without exposing credentials | Q2, Q4-Q6, U11 |
| Each named service | Claude, Codex, Gemini, Copilot, and Grok are evaluated with applicable credentials | A per-service evidence matrix distinguishes quota access, real reset semantics, and activation; unsupported/unverified claims are not presented as working support | Q2, Q3, Q7 |
| Reset-based activation | Service reports reset time R and default delay is active | No activation before R + 30 seconds; due activation is performed while Pi is running | Q3 |
| Configured delay | User changes the post-reset delay | Activation follows the configured post-reset delay, not a hard-coded 30 seconds | Q3, Q7 |
| Fixed interval selected | User explicitly chooses fixed 5-hour mode | Scheduling uses that mode without asserting the service has a matching quota window | Q3 |
| Two target accounts | Different accounts/subscriptions have different reset times | Each activation targets the appropriate account/subscription and its schedule | Q2-Q4 |
| Conversation isolation | User is working while activation becomes due | Activation request/response stays outside work history; model/account and task remain unchanged | Q4 |
| Concurrent processes | Several Pi processes share one account directory | Service traffic shows a single poller/activation owner; other views do not generate their own quota polls | Q5 |
| Owner exit/crash | The owner terminates normally or abruptly while another Pi remains | Another eligible process takes over automatically without concurrent owners or a transfer-triggered duplicate activation | Q5, Q6 |
| Sleep through multiple cycles | Pi remains running across sleep and several nominal intervals pass | After wake, one owner reevaluates current need; historical cycles are not replayed | Q5, Q6 |
| No Pi running | All relevant Pi processes exit | No plugin maintenance continues as an independent service | Q6 |
| Standalone install | Only this package is present outside the checkout | Pi loads it and exposes the quota/activation resources without installing the resume plugin | Q1 |

Controlled fixtures verify timing, account attribution, concurrency, and failure paths without spending real service quota. A real Pi smoke check and appropriately authorized provider evidence are still required before claiming live integration support. [Project]

## Decisions, Limitations, and Completion Gates

- Rename `renew-session` to `pi-quota-keeper` under U7; the name does not imply billing or quota renewal. U11 separately authorizes provider-owned OAuth token renewal.
- Same-computer/shared-directory ownership, failover, and Pi-hosted lifecycle are durable constraints recorded in ADR 0003. Delay/mode choices and activation isolation are task requirements retained here, not new ADRs.
- No provider quota endpoint, permission, reset semantics, or active-window behavior is verified by this refinement. The implementation ticket set must qualify all five named targets using primary sources and authorized evidence. It must return a required new scope/policy/behavior decision for clarification rather than silently inventing a fallback, importing external credentials, or declaring full support.
- U8 approves truthful capability-limited quota coverage. U9 expands scheduled requests to explicitly opted-in, account-pinned best-effort wake-ups even where no activation-window guarantee is established. Google Antigravity is the selected Gemini integration; unusable auth, API-key credentials, and unimplemented provider adapters remain blocked.
- Exact lock/IPC design, quota display controls, fixed-mode phase anchoring, and incidental configuration defaults are implementation details, not decisions made by this requirements contract.
- No guarantee of exactly-once external delivery under an ambiguous network outcome is established. Implementation must surface any inability to satisfy the confirmed no-duplicate/transfer behavior rather than invent an unsafe retry policy.
- Further unnamed services require identification and capability evidence before coverage can be accepted. This does not block starting the five explicitly named targets. [U6]

## Out of Scope

Importing other tools' accounts; adding a new login/account manager (U11 delegates renewal to the existing provider); subscription purchase/renewal; operation after all Pi processes exit; cross-computer coordination; waking the computer; replay of all missed cycles; implementation or QA execution during refinement. [U1-U5; selected endpoint]

## Delivery

See the [ticket set](../ticket/0001-resume-and-quota-plugins/README.md). This is a requirements contract, not evidence of working providers or permission to issue real activation requests during refinement.
