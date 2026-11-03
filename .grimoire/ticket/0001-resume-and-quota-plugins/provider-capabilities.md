# Provider Capability Qualification

**Related ticket:** [T0003](./T0003-provider-capability-evidence.md)
**Inspected:** 2026-11-03
**Host baseline:** Installed Pi package metadata and CLI: `@earendil-works/pi-coding-agent` 1.5.0.
**Result:** Capability-limited implementation and controlled verification exist; the user released the original scope checkpoint. Live provider quota/activation and physical sleep/wake remain unverified.

## Evidence boundary

The initial provider investigation used installed public Pi documentation, version-matched upstream Pi sources, official service documentation, and upstream service-client sources. It did not read the user's credential file, print credentials, import other tools' accounts, resolve configured secret commands, log into a service, or issue activation/model requests. The later U11 diagnosis examined sanitized local expiry/active-account metadata, without exposing tokens; renewal verification uses synthetic credentials only.

Code declares a capability; it does not prove a particular user's login, permission, entitlement, successful quota fetch, or a newly started usage window. A missing method in the inspected interface is not proof that no service-specific API or custom extension could provide it.

## Pi account and provider boundary

- Pi's installed provider documentation says login credentials are saved in `auth.json` in its agent directory. Environment/API-key configuration is also possible. [P1]
- Version-matched `AuthStorage.list()` returns `{ providerId, type }` metadata, without resolving configured key values. Its stored data is keyed by provider ID. The default store therefore must not be assumed to enumerate several distinct simultaneously stored identities for the same provider. [P2]
- Provider auth resolution and model availability are not a unified subscription-quota API. The inspected `Provider`/`Models` contracts describe auth, model catalogs, availability, and requests; service-specific quota/reset contracts still require qualification. [P3]
- Pi extension documentation provides provider-scoped auth resolution and isolated model calls, so minimal calls outside the work transcript are a plausible host integration. This is source evidence, not a tested extension implementation. [P4]
- Custom providers may change the available auth capabilities. No claim is made that the user's environment has none; no installed-account inventory was performed during the initial qualification.

## Named service matrix

| Service | Pi 1.5.0 built-in account mapping | Quota/reset evidence found | Minimal-message/window activation evidence | Current delivery gate |
| --- | --- | --- | --- | --- |
| Claude | `anthropic` declares subscription OAuth, labeled Claude Pro/Max, alongside API-key auth. [C1] | No authenticated quota endpoint or returned reset payload was verified in this investigation. | The service's published policy distinguishes native subscription usage, supported third-party access/usage credits, and prohibited identity misrepresentation. A message cannot be assumed to consume subscription allowance or activate that window rather than paid credits. [C2] | Verify permitted account-specific access and quota/reset semantics. Do not implement client impersonation or infer permission from Pi's OAuth declaration. |
| OpenAI Codex | `openai` declares current ChatGPT subscription OAuth ("Sign in with ChatGPT") alongside API-key auth; `openai-codex` separately declares legacy ChatGPT subscription OAuth. They must not be conflated with API-key quota. [O1] | Official Codex app-server docs expose `account/rateLimits/read`, per-limit windows, `usedPercent`, `windowDurationMins`, and Unix `resetsAt`. The help center also points to account usage/reset views. [O2, O3] | No live activation was performed and the inspected docs do not establish that any arbitrary minimal request always starts a new 5-hour window. | Qualify account/endpoint behavior for both actual Pi provider mappings. A Codex app-server method does not authorize reading another tool's saved account or require installing that CLI. |
| Gemini | The built-in `google` provider declares only `apiKey: envApiKeyAuth("Gemini API key", ["GEMINI_API_KEY"])`. No subscription OAuth is declared by this provider. The version-matched provider listing and OAuth loader were also inspected. [G1, G2] | Google's own Gemini CLI client implements `retrieveUserQuota`; its bucket schema includes `remainingAmount`, `remainingFraction`, `resetTime`, `tokenType`, and `modelId`. Official Code Assist docs describe request/day and request/minute quotas. [G3-G5] | No evidence that a Gemini request opens a universal 5-hour subscription window. | Built-in Pi API-key auth is not Gemini subscription login. Using Gemini CLI's stored login would violate the selected Pi-only source; a custom Pi subscription provider or changed scope must be identified, not invented. |
| GitHub Copilot | `github-copilot` declares subscription OAuth and token auth. [H1] | Official billing docs say the included monthly allowance resets on the first calendar day at 00:00 UTC, independent of billing renewal. This is reset-policy evidence, not a successful account-specific quota fetch. [H2] | Monthly allowance reset does not depend on sending a first message. No evidence was found here that activation messages start a 5-hour window. | Qualify the actual quota endpoint/permission and treat month-based quota as such, not as a fabricated 5-hour counter. |
| Grok / xAI | `xai` explicitly declares subscription OAuth: "xAI (Grok/X subscription)", login label "Sign in with SuperGrok or X Premium". API-key auth also exists. It would be incorrect to call this host API-key-only. [X1] | Official docs distinguish API billing from Grok billing and describe a weekly pool for the documented X Subscription, with next reset shown in the live usage view. They do not establish every SuperGrok/X plan's semantics or an authenticated quota API usable from Pi. [X2, X3] | No verified API response or official statement here establishes that a minimal Pi request opens a 5-hour window. | Preserve the OAuth/API distinction and qualify actual account tier, permitted quota route, and activation capability; do not substitute API credit balance. |

"Not verified" is not "impossible" or "unsupported forever". None of the above rows establishes completed live integration.

## Original prerequisite checkpoint (resolved by the later user clarification)

The current quota contract requires integration of all five named service targets and explicitly forbids silently counting unsupported rows as completed integration. Investigation exposed a concrete mismatch for default Pi Gemini subscription authentication and unverified activation semantics across the set.

Recommended clarification, not an approved change:

1. Keep all named accounts/providers visible, but distinguish actual quota support, missing permission/auth integration, and unknown data instead of inventing quota values.
2. Offer activation only for an account/window whose service semantics and allowed authentication establish that a minimal request can perform the intended activation. Do not send pointless default activation against calendar-reset allowances, and do not impersonate another client.
3. For Gemini subscriptions, either identify an already installed custom Pi subscription provider, or explicitly approve capability-limited initial coverage. Do not import another tool's credentials or introduce a new login flow without approval.

The user subsequently selected the capability-limited behavior and identified Google Antigravity. See the released-checkpoint section below; no further scope approval is pending.

## Source references

Versioned Pi links below target the same 1.5.0 version as the installed host; service documentation and upstream Gemini sources are living references as inspected on the date above.

- **P1:** Installed `C:/Users/Administrator/AppData/Local/mise/installs/pi/1.5.0/docs/providers.md`; [Pi providers](https://pi.dev/docs/latest/providers).
- **P2:** [Pi 1.5.0 AuthStorage](https://github.com/earendil-works/pi/blob/v1.5.0/packages/coding-agent/src/core/auth-storage.ts), `AuthStorage.list()`; [auth types](https://github.com/earendil-works/pi/blob/v1.5.0/packages/ai/src/auth/types.ts), `CredentialStore`.
- **P3:** [Pi 1.5.0 provider/model contracts](https://github.com/earendil-works/pi/blob/v1.5.0/packages/ai/src/models.ts).
- **P4:** Installed `docs/extensions.md` provider/model-registry and lifecycle sections; [Pi extensions](https://pi.dev/docs/latest/extensions).
- **C1:** [Pi 1.5.0 Anthropic provider](https://github.com/earendil-works/pi/blob/v1.5.0/packages/ai/src/providers/anthropic.ts).
- **C2:** [Claude account authentication and third-party subscription access policy](https://support.claude.com/en/articles/13189465-log-in-to-your-claude-account), sections "Authenticating to subscription plans" and "Developers".
- **O1:** [Pi 1.5.0 OpenAI provider](https://github.com/earendil-works/pi/blob/v1.5.0/packages/ai/src/providers/openai.ts), current ChatGPT subscription OAuth; [legacy Codex provider](https://github.com/earendil-works/pi/blob/v1.5.0/packages/ai/src/providers/openai-codex.ts).
- **O2:** [Official Codex app-server reference](https://developers.openai.com/codex/app-server), account/rate-limit methods and response examples.
- **O3:** [Using Codex with a ChatGPT plan](https://help.openai.com/en/articles/11369540-using-codex-with-your-chatgpt-plan), "Usage limits by plan".
- **G1:** [Pi 1.5.0 Google provider](https://github.com/earendil-works/pi/blob/v1.5.0/packages/ai/src/providers/google.ts).
- **G2:** [Pi 1.5.0 provider listing](https://api.github.com/repos/earendil-works/pi/contents/packages/ai/src/providers?ref=v1.5.0); [OAuth loaders](https://github.com/earendil-works/pi/blob/v1.5.0/packages/ai/src/auth/oauth/load.ts).
- **G3:** [Google Gemini CLI Code Assist server](https://github.com/google-gemini/gemini-cli/blob/main/packages/core/src/code_assist/server.ts), `retrieveUserQuota()`.
- **G4:** [Google Gemini CLI Code Assist types](https://github.com/google-gemini/gemini-cli/blob/main/packages/core/src/code_assist/types.ts), `RetrieveUserQuotaRequest`, `BucketInfo`, `RetrieveUserQuotaResponse`.
- **G5:** [Official Gemini Code Assist quota documentation](https://developers.google.com/gemini-code-assist/resources/quotas).
- **H1:** [Pi 1.5.0 GitHub Copilot provider](https://github.com/earendil-works/pi/blob/v1.5.0/packages/ai/src/providers/github-copilot.ts).
- **H2:** [Official Copilot license/billing reset documentation](https://docs.github.com/en/copilot/reference/copilot-billing/license-changes), "Included monthly allowance reset".
- **X1:** [Pi 1.5.0 xAI provider](https://github.com/earendil-works/pi/blob/v1.5.0/packages/ai/src/providers/xai.ts).
- **X2:** [xAI API account FAQ](https://docs.x.ai/developers/faq/accounts), separate Grok/API billing.
- **X3:** [Official X Subscription usage limits](https://docs.x.ai/x-subscription/usage-limits), weekly pool and live reset view.

## Stage evidence and pending work

- Plan persisted at `.grimoire/plans/0001-resume-and-quota-plugins.md`; existing Grimoire policy ignores that directory. No Git policy was modified or bypassed.
- Provider research is partial T0003 evidence; it is not a completed live-provider integration and the ticket is not marked Done.
- Production code, package tooling, Vitest, and controlled Pi smoke tests now exist; see [verification evidence](./verification.md). These do not establish live service or physical sleep/wake acceptance.
- The scope checkpoint is released. Remaining work is the explicit live/physical/platform evidence described in the verification report, not a renewed all-provider scope approval.

## Released checkpoint and Antigravity correction

The user approved capability-limited results: real quota when queryable, explicit unavailable reasons otherwise, and automatic activation only for accounts whose mechanism is verified. Gemini means Google Antigravity. The preceding prerequisite discussion is historical, not a remaining approval gate.

The installed `pi-antigravity` 0.11.0 manifest, README, `src/usage/usage.ts`, `src/client/client.ts`, and `src/auth/accounts.ts` were inspected (not the user's credential contents). They establish provider ID `antigravity`, JSON token/project auth, Pi-owned linked accounts in `antigravity-accounts.json`, per-model `quotaInfo.remainingFraction/resetTime` from `fetchAvailableModels`, and aggregate `retrieveUserQuotaSummary` diagnostics. The quota package implements that protocol without importing undeclared package source or selecting a different active account. Under Spec 0003 U11, expired/near-expiry inactive tokens are now renewed through the registered provider, which persists the target linked credential. Missing support or failed renewal remains explicitly unavailable. No new OAuth protocol or login/account manager is introduced.

[Claude's first-message five-hour window documentation](https://support.claude.com/en/articles/11647753-how-do-usage-and-length-limits-work) supports the activation mechanism only when real five-hour account quota/reset data is observed; plans with missing/null five-hour data are not inferred eligible. Account/model opt-in is required. This qualifies Claude's mechanism, not a universal first-request window. Under the later Spec 0003 U9 acceptance, other implemented subscription adapters may send explicitly opted-in best-effort wake-ups; replies remain unverified as window activation. See the package README and verification report for supported transports, reset selection, auth isolation, and limits.

Controlled Vitest and real Pi standalone smoke tests exercise implementation behavior using dummy credentials and synthetic responses. They are not authenticated live quota checks or live window-activation evidence. Non-Windows transport and physical sleep/wake remain unverified.

## Linked Antigravity renewal qualification — U11

Installed pi-antigravity 0.11.0's `src/index.ts` registers OAuth refresh through `refreshAndRemember()`. Its `src/auth/oauth.ts::refreshAntigravityToken()` retains account metadata and returns the refreshed credential; `src/auth/accounts.ts::updateRememberedAccount()` saves the existing linked identity without calling `writeActiveCredential()`, `activateAccount()`, or failover. That distinction permits target-only renewal through the provider, rather than replacing Pi's current account.

Pi 1.5.0's public `modelRegistry.getProvider("antigravity").auth.oauth.refresh(credential, signal)` wraps the extension's legacy `oauth.refreshToken`. The implementation uses this public surface and declared `proper-lockfile` dependency, not private SDK exports or imports from another plugin. It matches the host's async auth-lock stale threshold (30 seconds), and updates at five seconds to stay below the host sync-reader threshold (10 seconds). This credential lock is separate from OS-held maintenance ownership.

The installed refresher ignores abort signals. The owner retains its lock/lifetime until native refresh/persistence settles, even after cancellation; provider timing can delay shutdown/other credential resolution. Abrupt interruption of server-side rotation remains a reauthentication risk. Root auth and active selection are rechecked, deleted/changed identities fail closed, and failed attempts receive a one-minute per-credential cooldown.

Source qualification is not live-refresh success. See the appended verification record for controlled unit and real-Pi fixture evidence. No real account was renewed or selected during this development run.
