# Pi Auto Resume

**Spec ID:** 0002
**Status:** In Progress
**Date:** 2026-11-03
**Endpoint:** Requirements and ticket decomposition only.

## Sources

- **U1:** Request for an independently installable auto-continue plugin, automatically continuing after configurable limited classes of interruption such as quota exhaustion, network problems, or computer sleep.
- **U2:** User accepted recovery only for interrupted work: network/timeout recovery, subscription quota reset, and wake checks; no continuation after normal completion or a deliberate user stop.
- **U3:** User explicitly limited quota-related recovery to subscription exhaustion and temporary request throttling, excluding context-full and output-length ceilings.
- **U4:** User selected Spec -> tickets and authorized more functional plugin names. `pi-auto-resume` is the descriptive package name selected for this contract; it is not a verified publication identity.
- **Project:** [Context](../CONTEXT.md), [ADR 0001](../adr/0001-independently-installable-pi-packages.md), [ADR 0002](../adr/0002-typescript-esm-plugin-development-stack.md), [package development reference](../../packages/README.md).
- **P1:** [Pi extensions](https://pi.dev/docs/latest/extensions), including lifecycle boundaries, host retries, model response metadata, and message delivery. Installed Pi 1.5.0 `docs/extensions.md` was inspected during refinement; this does not establish tested host compatibility.

## Requirements

### A1. Independent installation and development

The implementation belongs to `packages/pi-auto-resume/` with its own manifest, TypeScript configuration, README, and `extensions/index.ts`. It must work without `pi-quota-keeper` or any undeclared sibling import. Follow the selected stack, host-peer dependency rules, and separate TypeScript/Biome/Vitest/Pi verification in the project reference. [U1, U4, Project]

### A2. Configurable, restricted recovery

Users can configure which of the following interruption classes allow automatic continuation: [U1-U3]

- Network loss or a request timeout.
- Temporary request throttling.
- Subscription quota exhaustion.
- Interruption spanning computer sleep, checked after wake.

A trigger must be tied to interrupted work in the owning Pi session, not merely an idle session or the passage of time. Only configured classes qualify; this is not a general instruction to keep the model running. Recovery continues the interrupted conversation rather than starting unrelated work. [U1, U2]

### A3. Negative boundaries and user control

Normal task completion, an explicit user stop, context-full errors, and output-length ceilings must not trigger automatic continuation. Waking the computer must not reactivate a completed or deliberately stopped task. An earlier pending recovery must not override a later explicit user stop or send into a replacement/unrelated session. [U2, U3; session ownership consequence of A2]

### A4. Recovery timing and host cooperation

Network/timeout recovery waits until another attempt can be made; temporary throttling respects service retry timing when supplied, and subscription exhaustion waits for the service quota reset rather than immediately repeating a known exhausted request. Sleep alone is not evidence of a failed task; wake causes reevaluation of interrupted work and its eligibility. [U1-U3]

Pi already has internal retry and continuation activity. The plugin must not create a second recovery request for work Pi is already retrying or has continued. Low-level run completion is not sufficient evidence that the task has settled. Evidence must identify the actual supported lifecycle hooks for the tested host version. [A2; P1]

This contract does not invent a reset timestamp when the service supplies none. Provider-specific availability of retry/reset signals is an implementation qualification item, not an assumption that every provider reports them. A missing signal must not be reported as a known recovery time. [U1-U3; P1]

### A5. Session-local ownership

Each running Pi session recovers only its own interrupted work. The single-owner rule for subscription maintenance in [ADR 0003](../adr/0003-pi-hosted-single-owner-subscription-maintenance.md) does not centralize task continuation or make this package depend on the quota plugin. [U2; ADR 0003]

### A6. Observable configuration and verified usage

The package README must explain the supported interruption classes, how to configure them, what recovery does and does not do, tested host compatibility, credential/network permissions, and actual verification commands. Users must be able to observe the interruption, pending recovery, and actual continuation or cancellation sufficiently to verify A2-A4; exact commands, UI placement, and configuration file syntax are not selected here. [U1-U3; Project]

## Solution and Integration Seams

Use the owning Pi session's interruption/lifecycle evidence, configuration, and provider retry/reset information to decide whether and when to continue that interrupted conversation. Preserve Pi's built-in recovery and explicit user cancellation. No shared daemon or dependency on the other requested package is established. [A1-A5]

| Seam | Connects | Expects | Provides |
| --- | --- | --- | --- |
| Session lifecycle | Pi host -> recovery decision | Session identity, error/stop/completion evidence, busy/retry state, replacement/shutdown events | Recovery only for eligible interrupted work in the original session |
| Retry/reset evidence | Provider/host response -> recovery timing | Actual network failure, throttling/retry hints, quota exhaustion/reset evidence where available | An evidence-based next attempt, not a fabricated reset time |
| User configuration | Package settings -> recovery decision | Configured allowed interruption classes | Disabled or excluded classes do not resume |
| Continuation | Eligible pending recovery -> Pi conversation | Correct owning session and no conflicting host recovery/user cancellation | One recovery action for that pending interruption, without duplicating host work |

The seams specify ownership and exchanges, not a required module layout, lock implementation, or exact SDK method.

## End-to-End Verification

| Scenario | Given / When | Then | Requirements |
| --- | --- | --- | --- |
| Recover network interruption | An active task fails due to a configured network/timeout interruption; connectivity returns | The interrupted conversation resumes without manual continue | A2, A4 |
| Respect disabled category | The same failure occurs with that category disabled | No plugin-originated continuation | A2 |
| Wait for throttling/reset | Service evidence gives temporary throttling or subscription reset timing | No premature retry against the reported wait; eligible work can continue afterward | A2, A4 |
| Wake after interruption | An eligible interrupted task spans sleep; the computer wakes | Eligibility and timing are checked and the task resumes only if appropriate | A2-A4 |
| Wake after completion or stop | The task completed or the user stopped it before sleep | No continuation after wake | A3 |
| Cancel pending recovery | A recovery is waiting and the user stops or replaces the session | No delayed continuation into stopped or replacement work | A3 |
| Excluded limits | Context-full or output-length ceiling occurs | No automatic continuation by this plugin | A3 |
| Host retry already active | Pi is retrying or has already continued the same failed work | No additional plugin-generated recovery request | A4 |
| Multiple work sessions | Two Pi sessions have distinct interrupted tasks | Each handles its own work; neither sends into the other | A5 |
| Standalone install | Only this package is available outside the sibling checkout | Pi loads it and the recovery behavior works without the quota package | A1, A6 |

Use controlled error/timing fixtures for deterministic tests and Pi loading/usage evidence for the host integration. Direct Node execution or static documentation review is not a runtime smoke test. [Project]

## Decisions and Boundaries

- Descriptive rename from auto-continue to `pi-auto-resume`: emphasizes interrupted-work recovery, not unbounded continuation. [U2, U4]
- Supported recovery causes and exclusions are confirmed; exact configuration syntax, presentation, numeric retry policy defaults, and SDK hook selection remain implementation details, not settled architecture. They must preserve A2-A4.
- No account switching, session migration, context compaction, or subscription activation is required to satisfy this package's confirmed recovery outcomes. The independently requested activation behavior belongs to [Pi Quota Keeper](./0003-pi-quota-keeper.md). [U1-U3; A1]
- No runtime tests, service credentials, provider reset APIs, or exact host compatibility have been verified during this refinement. Provider evidence must be checked before claiming the corresponding behavior works. [P1; Project]

## Delivery

The [ticket set](../ticket/0001-resume-and-quota-plugins/README.md) maps this contract to executable work. No production source, package scaffold, dependency installation, implementation plan, or implementation/QA execution is authorized by this refinement artifact.
