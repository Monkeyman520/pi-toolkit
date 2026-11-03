# Qualify Pi account, quota, reset, and activation capabilities

**Ticket ID:** T0003
**Source:** [Pi Quota Keeper](../../spec/0003-pi-quota-keeper.md), Q2-Q4 and Q7; P1/P2 and completion gates.
**Status:** In Progress

## Goal

Produce independently checkable evidence for account discovery and each named service's quota/reset/activation behavior before implementations claim live support.

This is an enabling evidence slice with two real consumers: quota presentation/polling (T0004) and isolated scheduled activation (T0005). It does not preselect an adapter architecture or create a shared framework.

## Affected Surfaces

- Applicable official Pi provider/auth/model-call/lifecycle documentation and supported host interfaces.
- Primary service documentation and authorized evidence for Claude, OpenAI Codex, Gemini, GitHub Copilot, and Grok.
- Capability/compatibility evidence in the eventual quota package documentation, coordinated with T0004/T0005.

## Dependencies and Coordination

- **Blocked by:** None for documentation investigation; record unavailable credentials/permissions rather than claiming a live check.
- **Blocks:** Acceptance of T0004 live quota/account integrations and T0005 live activation integrations.
- **Independent of:** T0001/T0002.
- Fixture-based downstream work can proceed in parallel, but fixtures do not qualify real provider support.

## Acceptance

- [ ] Identify the supported host mechanism for discovering Pi-logged-in accounts within the shared Pi account directory and resolving credentials for the intended account, including actual cardinality/identity limitations.
- [ ] Produce an evidence matrix with a separate row for each of the five named targets, dated primary-source references, credential type/Pi mapping, quota access, units/windows, real reset semantics, and isolated minimal-message/activation behavior.
- [ ] Distinguish subscription quota from API-key usage/balance and Grok subscription access from xAI API-key model access; do not infer one from the other.
- [ ] Separate documentation-backed facts, controlled fixture results, authorized live evidence, unverified items, and demonstrated lack of capability.
- [ ] Identify what evidence proves merely message submission versus a newly activated subscription window; do not assert every service has an activatable 5-hour window.
- [ ] Record any missing required permission, account source, quota endpoint, reset signal, or activation capability as an explicit gap for the affected outcome.
- [ ] No secrets appear in documentation, fixtures, logs, or shared artifacts; do not import credentials from other tools or make unapproved real activation requests.
- [ ] Required new scope/policy/behavior decisions return to refinement before downstream work substitutes a different outcome.
- [ ] Negative findings become explicit unavailable reasons under the user's U8 approval, not invented quota or activation success. Distinguish a controlled protocol test from live service qualification.

## Out of Scope

Implementing a new login/account manager; choosing unsupported fallback behavior; silently removing named providers; claiming unspecified "other mainstream services" have been integrated.
