# Resume after quota reset and computer wake

**Ticket ID:** T0002
**Source:** [Pi Auto Resume](../../spec/0002-pi-auto-resume.md), A2-A6; full recovery acceptance.
**Status:** In Progress

## Goal

Complete subscription-exhaustion and wake-aware recovery while preserving all transient recovery, explicit-stop, and owning-session guarantees.

## Affected Surfaces

`packages/pi-auto-resume/` error classification, waiting/timing, lifecycle integration, configuration, tests, and README.

## Dependencies and Coordination

- **Blocked by:** T0001 provides the owning-session recovery/cancellation integration being extended.
- **Blocks:** None.
- **Independent of:** All quota-keeper tickets; use host/provider evidence, not an undeclared sibling dependency.

## Acceptance

- [ ] A configured subscription-exhausted task with service reset evidence waits until reset eligibility rather than repeatedly requesting against an exhausted quota, then resumes the same work.
- [ ] Validate the source and meaning of quota/reset signals for claimed provider behavior. Do not fabricate a missing timestamp or silently reclassify context/output limits as subscription exhaustion.
- [ ] A disabled subscription-exhaustion category does not resume automatically.
- [ ] After wake, eligible interrupted work is reevaluated and recovered; a completed, deliberately stopped, or unrelated session is not activated.
- [ ] Sleep by itself is not treated as proof of a failed task; host recovery already in progress is not duplicated.
- [ ] Explicit stop and session replacement still cancel pending recovery even when waiting through reset or sleep.
- [ ] Deterministic tests cover reset timing, disabled categories, wake before/after eligibility, completion/stop before wake, session replacement, and host retry overlap.
- [ ] The README reflects actual quota/reset/wake support and limitations, documents configuration, and retains independent installation and privilege disclosures.
- [ ] Run the package's separate no-emit type check, Biome, and Vitest checks; verify full recovery behavior through Pi with no quota package installed and report actual compatibility/evidence.

## Escalation Boundary

If required service timing or host lifecycle evidence cannot support the requested outcome, report the precise missing capability and return any needed behavior/scope decision for clarification. Do not invent reset times, account switching, compaction, or a dependency on the other plugin.
