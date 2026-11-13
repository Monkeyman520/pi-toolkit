# Transactional configuration with layer provenance

**Ticket ID:** T0005
**Source:** [Approved F5](./README.md#finding-evidence); [Spec 0008](../../spec/0008-enhanced-session-tree-explorer.md) R01/R13 and E06.
**Status:** In Progress

## Goal

Only valid intended user settings become effective and durable. A project/runtime/view value is not promoted into global defaults when editing an unrelated global setting; failed updates/reloads preserve the last safe configuration.

## Affected surfaces

- config.ts, config-schema.ts, commands.ts, ui.ts and configuration command branches in index.ts.
- Existing pi-plugin-support/config mechanism as a declared dependency; package-local config, command and panel tests. No support-library redesign is required.

## Approach

Keep raw layer provenance separate from the merged effective configuration. Construct and validate an intended-layer candidate, persist that layer, then publish the safe effective result. Preserve defaults -> global -> trusted project -> runtime precedence, fieldwise object merge and whole-array replacement. Configuration callers receive explicit success/failure rather than optimistic success after rejection.

## Dependencies and coordination

- **Blocked by:** None; existing TypeBox schema and config I/O are sufficient test boundaries.
- **Blocks:** T0006/T0008; runtime application and combined configuration evidence require valid published settings.
- **Coordination:** T0001 owns keymap semantic diagnostics, this ticket owns layer/schema/persistence validity, and T0006 owns applying the result to feature owners. Shared config.ts integration is a merge risk, not a semantic cycle.

## Acceptance

- [ ] A trusted project's assistant-visibility override does not appear in global session-tree.json when editing vimMode globally. The same holds for runtime/view overrides; unrelated existing global fields remain intact.
- [ ] Layer precedence and array replacement remain correct after editing and reopening in another project. Untrusted project configuration is not loaded; trust cannot be bypassed by the runtime adapter.
- [ ] A schema-rejected maxMessageLength=1 update leaves current and last-valid configuration unchanged and does not persist invalid data. Invalid keys/types/values produce actionable diagnostics.
- [ ] Persistence failure rejects the update without publishing it as a successful effective/durable edit. Command and settings-panel paths handle failure without false success or an unhandled promise.
- [ ] Startup ignores an invalid layer wholly while retaining other valid layers and reporting field diagnostics. Failed explicit reload preserves the previous safe effective configuration; the command's preliminary loading does not partially replace it before the reload decision.
- [ ] Settings reads cannot bypass validation by mutating a shared returned configuration object. Effective publication and serialized updates preserve owned-layer intent under overlapping edits.
- [ ] Defaults and the published JSON schema remain aligned with TypeBox and effective settings; no arbitrary unknown field or invalid keymap silently enables an Action. Use T0001's agreed diagnostics boundary rather than duplicating Action policy.
- [ ] Tests cover cross-project leakage, invalid update followed by failed reload, write failure, trusted/untrusted startup, command/panel error reporting and overlapping updates through the public manager boundary.

## Out of scope

Credential/secret storage, new configuration layers, changing the user-visible configuration grammar, blanket writes of runtime/session preferences to global config, or redesigning shared support-library behavior for other plugins. Follow the README's permissions and knowledge boundary.

## Execution evidence (provisional)

Layer provenance, serialized validation/persistence/publication, failure-safe reload and defensive snapshots; remediation-config tests. Real settings-panel confirmation now waits for pending writes before reapplication (remediation-settings-transaction).

Whole-ticket acceptance is not granted here. See [current combined checkpoint](./README.md#current-checkpoint-u4-implemented-integrated-acceptance-incomplete) for revision, commands, separate Code Risk / Intent Check outcomes, performance scope and remaining runtime gates.

Windows-only follow-up: Steps 1/2 verified real TUI/editor/file outcomes; Step 3 was excluded. Step 4 recorded three confirmed blockers, independent-review startup failure and contention-specific timing misses. See [current evidence](./evidence/windows-2026-11-10/README.md); this ticket remains unaccepted pending its complete criteria.


### Follow-up — 2026-11-13

Combined configuration/transaction checks still pass; no additional configuration requirement or producer acceptance is inferred. See [latest evidence](./evidence/windows-2026-11-13/README.md) and [results](./evidence/windows-2026-11-13/RESULTS.md). Fresh independent review is pending. This update supersedes the older provisional check counts/blocker state, not the ticket's acceptance criteria; status remains In Progress.


**Independent review receipt:** S1003 approved the two S1001 fixes and directly related behavior, with no new defects in that focused static scope. [Receipt and remaining runtime boundaries](./evidence/windows-2026-11-13/REVIEW.md). This supersedes prior pending-review notes; it does not accept this ticket's whole criteria. Status remains In Progress.
