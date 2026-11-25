# Custom error match and exclusion patterns

**Ticket ID:** T0002
**Source:** [Spec 0011](../../spec/0011-pi-auto-resume-enhancements.md) (R5, R7)
**Status:** Done

## Goal

Allow users to extend and restrict failure classification in `pi-auto-resume.json` via `customExcludePatterns` and per-cause `customMatchPatterns`, while guaranteeing exclusion-first precedence and fail-closed validation on invalid regular expressions.

## Affected Surfaces

- `packages/pi-auto-resume/extensions/config.ts` — Add optional `customExcludePatterns` and `customMatchPatterns` fields to TypeBox schema, validate pattern count/length and case-insensitive `RegExp` compilation during config load (fail closed on invalid patterns).
- `packages/pi-auto-resume/extensions/recovery.ts` — Accept compiled custom rules in `classify()` / `Recovery` while enforcing precedence and quota reset-time invariants.
- `packages/pi-auto-resume/tests/recovery.test.ts` — Unit tests for custom exclusions, custom per-cause matches, precedence over/under built-ins, and fail-closed invalid regex handling.

## Approach

- Define schema fields:
  - `customExcludePatterns?: string[]` (bounded item count and string length).
  - `customMatchPatterns?: Array<{ pattern: string; cause: "network" | "server" | "throttle" | "quota" }>` (bounded item count and string length).
- Compile patterns eagerly with `new RegExp(pattern, "i")` during configuration load/validation rather than inside turn settlement. If any pattern fails to compile, treat the configuration file as invalid and fail closed (`enabled: false`, surfacing a clear config error through `JsonConfigStore`).
- Apply classification order strictly:
  1. Built-in exclusions.
  2. `customExcludePatterns`.
  3. Built-in classifiers (`quota`, `network`, `server`, `throttle`).
  4. `customMatchPatterns` (in declared order).
- Ensure custom matches still obey category enable flags (`settings[cause]`) and quota concrete-reset-time evidence (`cause === "quota"` without `resetTime` still yields `quota: reset time unavailable`).

## Dependencies and Coordination

- **Blocked by:** T0001 (requires `"server"` in the `Cause` union and finalized built-in classifier ordering).
- **Blocks:** T0006 (documentation and integrated verification).
- **Coordination risks:** Shared edits to `config.ts` and `recovery.ts` with T0003/T0004; keep structured array fields cleanly separated from scalar `setOption` CLI/TUI keys (and report a helpful message if someone tries to set an array field via scalar `/auto-resume config <key> <value>`).

## Acceptance

- [ ] A pattern in `customExcludePatterns` blocks recovery even when a built-in classifier or `customMatchPatterns` entry would otherwise match.
- [ ] A built-in exclusion (e.g., `context window exceeded`, `invalid api key`) still blocks recovery even if `customMatchPatterns` matches the same error text.
- [ ] A `customMatchPatterns` entry classifies non-standard provider errors into the declared `cause`, honors the corresponding category toggle, and enforces quota reset-time evidence when `cause === "quota"`.
- [ ] Invalid regex syntax in `pi-auto-resume.json` fails configuration loading closed (`enabled: false`) with a clear diagnostic error and does not throw during turn settlement.
- [ ] Hot-reloading valid changes to custom patterns updates active recovery behavior without restarting Pi.
- [ ] `bun run --cwd packages/pi-auto-resume typecheck`, `check`, and `test` pass.

## Out of Scope

- Interactive TUI array editor for regex lists (edited in `pi-auto-resume.json` with hot reload).
- Executing external scripts or plugins for error classification.
