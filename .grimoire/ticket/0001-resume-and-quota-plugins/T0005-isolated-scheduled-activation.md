# Activate subscription windows without touching work conversations

**Ticket ID:** T0005
**Source:** [Pi Quota Keeper](../../spec/0003-pi-quota-keeper.md), Q3-Q7; [ADR 0003](../../adr/0003-pi-hosted-single-owner-subscription-maintenance.md).
**Status:** In Progress

## Goal

Add per-account/subscription scheduled minimal-message activation using the sole maintenance owner, service-specific timing, and isolated conversations.

## Affected Surfaces

`packages/pi-quota-keeper/` service-qualified activation calls, configuration/presentation, schedule/ownership-transfer behavior, tests, and README.

## Dependencies and Coordination

- **Blocked by:** T0003 must qualify auth, reset-data interpretation, and account-pinned transport; U9 releases the verified-window-mechanism-only gate for explicitly best-effort requests. T0004 supplies actual account attribution, one maintenance owner, and failover.
- **Blocks:** None.
- Reuse the established owner/handover behavior; do not introduce a scheduler that polls or sends independently in every Pi process.
- No dependency on `pi-auto-resume`.

## Acceptance

- [ ] Default activation is due at the service's actual reset time plus 30 seconds; the configurable delay changes that behavior and no request is sent before the configured due time.
- [ ] Optional fixed every-5-hours mode works only as an explicit selected mode; it is not a silent fallback for unknown reset data or proof of a service window.
- [ ] Each account/subscription uses its own applicable service information and receives its own correctly attributed minimal activation message.
- [ ] Activation prompts/responses do not enter the foreground work history, change its model/account, or interrupt its task. Verify with a work conversation active during activation.
- [ ] The sole maintenance owner handles activation; concurrent processes, startup races, graceful handover, abrupt owner death, and wake do not create multiple simultaneous senders or a new send merely because ownership changed.
- [ ] After sleeping through multiple resets/intervals, reevaluate current need and perform only currently needed activation rather than replaying missed cycles.
- [ ] No maintenance continues after all relevant Pi processes exit.
- [ ] Preserve qualified activation and add U9's explicitly opted-in best-effort wake-ups for usable, account-pinned subscription adapters. Quota query failure remains separately visible; only explicit fixed mode can run without an applicable real reset. Request completion never claims confirmed window activation.
- [ ] Cover reset+delay, configured delay, fixed interval, per-account attribution, conversation isolation, ownership transfer, wake catch-up, and failure outcomes with controlled tests; never claim exactly-once external delivery from fixtures when a live request outcome is ambiguous.
- [ ] README describes the implemented controls, service support/evidence/limitations, network and quota implications, lifecycle, and actual setup/verification commands without claiming subscription purchase/renewal.
- [ ] Run separate package no-emit type checking, Biome, and Vitest checks plus Pi isolated-activation and multi-process usage evidence with the package independently installed. Real account activation requires the applicable authorization.

## Escalation Boundary

Return any required new service/policy/scope decision, including ambiguous-delivery retry semantics that cannot preserve the confirmed constraints, for clarification. Do not silently introduce duplicate requests, fabricate activation success, import other credentials, or weaken no-replay behavior.

## Accepted scope extension

Spec 0003 U9 authorizes Google Antigravity, current/legacy Codex, Copilot, and Grok best-effort wake-up attempts with explicit per-account/model opt-in and possible quota/credit charges. Google transport must not invoke pi-antigravity's account-switching failover. Persist only non-secret capability/window metadata and cycle outcomes; keep resolved generation credentials in memory. Full live-provider/physical/platform acceptance remains outstanding.
