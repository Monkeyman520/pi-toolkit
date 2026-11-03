# Pi-hosted single-owner subscription maintenance

**Status:** Testing
**Date:** 2026-11-03

## Context

The requested `renew-session` plugin will check subscription quotas and send scheduled activation messages for accounts already logged into Pi. The user explicitly limited operation to periods when Pi is running, with checks after waking from sleep. They also rejected having every concurrent Pi process independently poll quotas and perform activation.

This adds an operational boundary to the independently installable plugin model in [ADR 0001](./0001-independently-installable-pi-packages.md).

## Decision

- Subscription maintenance runs within running Pi processes. It does not require an always-on service operating after all Pi processes exit.
- After the computer wakes, running Pi processes must support resuming the required maintenance checks; execution during sleep is not required.
- Concurrent Pi processes must coordinate quota polling and scheduled activation so that only one Pi process performs this maintenance, rather than each process polling and activating independently.
- The coordination scope is one computer and one shared Pi account directory. Separate account directories are outside this shared ownership scope.
- When the owner exits or crashes, another eligible running Pi process must take over the maintenance work.

The ownership mechanism remains an implementation choice. Unrelated session-local task continuation remains per session, not single-owner.

## Consequences

- Quota polling and activation need cross-process coordination; independent per-process schedulers are insufficient.
- Scheduling cannot promise execution while the computer sleeps or no Pi process is running.
- Ownership transfer must retain the single-owner behavior for polling and activation; it must not leave maintenance permanently tied to the first process.

The status remains Proposed because the operating constraints are confirmed but no implementation has started.

**Clarification (2026-11-03):** The user confirmed the same-computer/shared-account-directory scope and automatic takeover after owner exit or crash. This clarifies the original single-owner decision without changing it. The plugin is now named `pi-quota-keeper` (previously `renew-session`); the name describes quota visibility and activation, not subscription renewal.

**Implementation evidence (2026-11-03):** `pi-quota-keeper` now implements OS-held single ownership, Pi-only lifecycle, and automatic takeover. Controlled tests and two real Pi RPC processes verified one quota poller, abrupt owner death/takeover, isolated activation, and no replay. Status is Testing because physical sleep/wake and non-Windows transport evidence remain pending; this does not claim live provider acceptance. The earlier Proposed-status sentence describes the recording-time state.
