# Display account quotas with a single failover-capable poller

**Ticket ID:** T0004
**Source:** [Pi Quota Keeper](../../spec/0003-pi-quota-keeper.md), Q1, Q2, Q5-Q7; [ADR 0003](../../adr/0003-pi-hosted-single-owner-subscription-maintenance.md).
**Status:** In Progress

## Goal

Deliver an independently installable `pi-quota-keeper` quota view backed by one service-polling owner across Pi processes sharing an account directory, with automatic takeover.

## Affected Surfaces

- `packages/pi-quota-keeper/`: metadata, TypeScript configuration, extension, account/service integrations, quota presentation, cross-process maintenance ownership, tests, README.
- Collection catalog and package-reference wording when a real package exists.

## Dependencies and Coordination

- **Blocked by:** T0003 evidence for accepting the named services' actual account/quota integrations; fixtures alone do not remove this gate.
- **Blocks:** T0005 consumes this single-owner/shared-account/handover foundation for activation.
- **Independent of:** Resume package tickets.
- Coordinate provider evidence/docs with T0003, activation state contracts with T0005, and collection-level docs with T0001.

## Acceptance

- [ ] Present Pi-logged-in accounts/subscriptions and real attributed quota windows/values/reset information, not just the current foreground model's quota.
- [ ] For every logged-in named target, display real quota when queryable or an explicit unavailable reason; Gemini means Google Antigravity. Verify protocol parsing separately from live account access. [Spec 0003 U8]
- [ ] Under Spec 0003 U11, renew expired/near-expiry inactive Pi Antigravity tokens through the registered provider only; validate target identity and provider-owned persistence, preserve active selection/foreground work, serialize with host OAuth work, and handle missing support, failure/cooldown, removal/races and cancellation without exposing tokens. Verification uses simulated credentials, not real account refreshes.
- [ ] Do not fabricate missing quota/reset information, conflate subscription and API balances, import other tools' accounts, or reveal secrets.
- [ ] In concurrent processes on one computer sharing one Pi account directory, instrumented service traffic demonstrates only one quota poller; opening views in other processes does not create independent service polling.
- [ ] Verify simultaneous startup, graceful owner exit, abrupt owner termination, and wake: another eligible Pi automatically takes over without simultaneous maintenance owners.
- [ ] Processes with separate account directories are not accidentally forced into the same ownership scope.
- [ ] Session replacement/reload/shutdown and resource cleanup preserve the Pi-running-only lifecycle. After all eligible Pi processes exit there is no standalone maintenance service.
- [ ] Metadata/resources/dependencies honor ADRs 0001/0002; no undeclared sibling import or required bundler/emitted build.
- [ ] README documents actual quota/provider coverage and evidence, user access to the view, ownership/lifecycle behavior, setup, permissions, compatibility, and verification commands; scheduled activation is not yet claimed complete.
- [ ] Run the package's separate no-emit type check, Biome, and meaningful Vitest checks. Include real multi-process integration tests and a Pi standalone loading/usage check without the resume package; update the catalog truthfully.

## Out of Scope

Activation scheduling/messages (T0005); cross-computer coordination; billing renewal; an always-on daemon; centralizing session-local task recovery.
