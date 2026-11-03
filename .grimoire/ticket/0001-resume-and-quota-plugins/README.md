# Pi Auto Resume and Pi Quota Keeper

**Sources:** [Pi Auto Resume](../../spec/0002-pi-auto-resume.md), [Pi Quota Keeper](../../spec/0003-pi-quota-keeper.md), [ADR 0003](../../adr/0003-pi-hosted-single-owner-subscription-maintenance.md).
**Ticket folder:** `.grimoire/ticket/0001-resume-and-quota-plugins/`
**Status:** Implemented with passing controlled local gates; live/physical/platform evidence pending. Tickets remain In Progress, not globally accepted.

## Overview

Deliver two independently installable plugins:

- `pi-auto-resume`: configured recovery of interrupted work, excluding normal completion, explicit user stop, context-full, and output-length ceilings.
- `pi-quota-keeper`: Pi-logged-in account/subscription quota visibility, service-reset-based isolated activation with configurable default 30-second delay, optional fixed 5-hour mode, and one maintenance owner across same-computer/shared-account-directory Pi processes.

Quota maintenance runs only while Pi is running, supports automatic owner takeover, and reevaluates current need after wake without replaying missed cycles. Resume remains per session and does not depend on the quota plugin. [Specifications; ADR 0003]

This set does not select a package manager, publication scope, IPC/locking design, exact commands/settings syntax, or a universal provider quota API.

## Delivery Surfaces

| Surface | Ownership |
| --- | --- |
| `packages/pi-auto-resume/` manifest, config, extension, tests, README | T0001 then T0002 |
| `packages/pi-quota-keeper/` provider capability evidence | T0003, consumed by T0004/T0005 |
| Quota package manifest, config, account discovery, quota presentation, ownership/failover, tests, README | T0004 |
| Quota package activation scheduling/isolation and corresponding tests/docs | T0005 |
| Root package catalog and package-reference empty-state statements | Update in the ticket adding each real package, only to match verified resources |
| Existing Context/ADRs/specs | Read as constraints; do not silently revise requirements to make an integration pass |

Each code-producing ticket includes the owning package's TypeScript, Biome, Vitest, and Pi loading/usage evidence. Documentation inspection alone is not runtime verification.

## Dependencies

| Producer | Consumer | Why consumer cannot complete first |
| --- | --- | --- |
| T0001 | T0002 | Quota/wake recovery extends the owning session's verified interruption/cancellation integration |
| T0003 | T0004 | Live quota support and account attribution cannot be accepted without credential/quota/reset capability evidence for the named services |
| T0003 | T0005 | Activation must use demonstrated service window/message semantics, not infer them from model availability |
| T0004 | T0005 | Scheduled activation must use the shared scope, single owner, account attribution, and handover behavior established for quota maintenance |

These edges gate accepted integration outcomes. Fixture-based work may proceed before service evidence is complete, but cannot be represented as verified provider support.

There is no blocking dependency between the resume and quota package branches.

## Coordination

| Tickets | Risk | Strategy |
| --- | --- | --- |
| T0001, T0002 | Same resume lifecycle/config/tests | Sequence their accepted slices; preserve explicit-stop and original-session boundaries |
| T0003, T0004, T0005 | Provider semantics may invalidate assumed quota/activation behavior | Use the evidence matrix as input; return material gaps for refinement before choosing different behavior |
| T0004, T0005 | Same maintenance ownership and per-cycle state | Activation consumes the established owner/handover contract rather than starting a second scheduler in every process |
| T0001, T0004 | Root README/catalog/package-reference edits | Parallel package work is safe; coordinate only the collection-level documentation edits |
| Both packages installed | Confusing task continuation with account maintenance | Independently test standalone installation; do not introduce undeclared sibling imports or make task recovery single-owner |

## Recommended Order

1. Start T0001 and T0003 independently.
2. After T0001, deliver T0002. After T0003's relevant evidence is available, deliver T0004; these branches may proceed in parallel.
3. Deliver T0005 after T0004 and the activation evidence from T0003.
4. Evaluate completion against both full specs, not just passing fixtures or a provider list.

## Requirement Coverage

| Requirement | Ticket(s) |
| --- | --- |
| A1 independent package/stack | T0001, preserved and reverified in T0002 |
| A2 configurable interruption classes | T0001 network/throttling; T0002 subscription/wake |
| A3 completion/stop/context/output/session boundaries | T0001, T0002 |
| A4 timing and no duplicate host recovery | T0001, T0002 |
| A5 session-local ownership | T0001, T0002 |
| A6 configuration/docs/runtime evidence | T0001, T0002 |
| Q1 independent package/stack | T0004, preserved and reverified in T0005 |
| Q2 account/subscription quota and named service targets | T0003, T0004 |
| Q3 reset+delay and optional fixed mode | T0003, T0005 |
| Q4 isolated per-account/subscription activation | T0003, T0005 |
| Q5 singleton polling/activation and takeover | T0004 polling/ownership; T0005 activation handover |
| Q6 Pi-running lifecycle, wake, no missed-cycle replay | T0004 polling/lifecycle; T0005 activation |
| Q7 truthful configuration/presentation/evidence | T0003, T0004, T0005 |

## Ticket Index

| Ticket | File | Outcome |
| --- | --- | --- |
| T0001 | [T0001-transient-task-recovery.md](./T0001-transient-task-recovery.md) | Installable resume package for configured network/timeout/throttling interruptions |
| T0002 | [T0002-quota-and-wake-recovery.md](./T0002-quota-and-wake-recovery.md) | Subscription-reset waiting and wake-aware session recovery |
| T0003 | [T0003-provider-capability-evidence.md](./T0003-provider-capability-evidence.md) | Evidence for Pi account discovery and quota/reset/activation capabilities of all five named service targets |
| T0004 | [T0004-single-owner-quota-visibility.md](./T0004-single-owner-quota-visibility.md) | Installable quota package with attributed quota presentation and one failover-capable poller |
| T0005 | [T0005-isolated-scheduled-activation.md](./T0005-isolated-scheduled-activation.md) | Per-account/subscription isolated activation with reset/interval/wake/transfer correctness |

## Handoff and Gates

The user selected Spec -> tickets; no implementation, dependencies, external activation requests, QA run, Git commit, or push was performed by this refinement.

Live provider integration remains unverified. The released checkpoint (Spec 0003 U8) approves real quota when queryable and explicit unavailable reasons otherwise, with activation only for verified supporting accounts. Gemini means Google Antigravity. Do not fabricate values, import other tools' credentials, or label API balances as subscription quotas.

No new durable recording batch remains pending. ADR 0003 already contains the confirmed Pi-only, single-owner, shared-directory, and takeover constraints.

For implementation, the user may invoke `grimoire-loop` on this set. Do not start that workflow from refinement.

## Loop execution handoff (2026-11-03)

The user invoked `grimoire-loop` and released the provider capability checkpoint. Planning, implementation/tests, review/check, assessed fixes, final verification, and formatting remain enabled. Live activation requests are not part of verification.

- [Provider capability evidence](./provider-capabilities.md): version-matched Pi 1.5.0 mappings for all five named targets, official service window/policy evidence, and explicit remaining verification gaps.
- Local plan: `.grimoire/plans/0001-resume-and-quota-plugins.md` (saved, but ignored by the existing repository Grimoire policy; no policy change or force-staging).
- Released decision: Gemini means the installed Pi Antigravity provider; real quota where queryable, unavailable reasons otherwise, and activation only for verified supporting accounts.
- Production packages and controlled tests now exist; see package READMEs and verification evidence. No real subscription activation, credential disclosure, Git commit, or push is claimed.
- Continue against the released U8 contract; do not reinstate the superseded all-provider capability blocker.

## Verification handoff

See [verification.md](./verification.md) for commands, evidence, source coverage, assessed fixes, and remaining live/physical/platform limitations. Both packages are independently loadable and no commit/push was performed. Ticket and spec statuses are In Progress because controlled success does not establish all requested live-service behavior; ADR 0003 is Testing pending physical/platform verification.
