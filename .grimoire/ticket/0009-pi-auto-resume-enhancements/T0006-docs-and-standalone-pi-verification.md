# Documentation and standalone Pi verification

**Ticket ID:** T0006
**Source:** [Spec 0011](../../spec/0011-pi-auto-resume-enhancements.md) (R7)
**Status:** Done

## Goal

Align `packages/pi-auto-resume/README.md` with all implemented enhancements, expand the isolated real-Pi RPC smoke test (`tests/pi-smoke.mjs`) to verify the enhanced behaviors in a standalone packed installation, and confirm all workspace quality gates pass.

## Affected Surfaces

- `packages/pi-auto-resume/README.md` — Document `server` recovery, exponential backoff + jitter, extended reset-header duration parsing, `resumePrompt` / `resumePromptFile`, `maxWaitMs`, `maxTotalAttempts`, `/auto-resume guard`, `stopFile` sentinel, `customExcludePatterns` / `customMatchPatterns`, `notifyOnResume`, updated permissions/risks, and verified commands.
- `packages/pi-auto-resume/tests/pi-smoke.mjs` — Extend the isolated standalone Pi RPC test to exercise representative new capabilities (e.g., 5xx/`overloaded` server recovery, custom `resumePrompt` / `resumePromptFile` delivery, `stopFile` sentinel cancellation, and backward-compatible config persistence) alongside existing V1 assertions.
- Package and workspace verification commands (`check`, `typecheck`, `build`, `test`, `smoke`, and collection isolation check if applicable).

## Approach

- Update `README.md` strictly to match actual implemented config keys, defaults, commands, and safety boundaries (explicitly noting that `pi-auto-resume` reads local config/prompt/sentinel files and executes no external shell commands, and never continues normally completed tasks).
- Keep `tests/pi-smoke.mjs` offline and credential-free using the synthetic provider fixture and isolated `PI_CODING_AGENT_DIR`, testing the freshly packed tarball outside the workspace per [ADR 0008](../../adr/0008-bun-workspace-rolldown-and-bun-test-stack.md).
- Run root `bun run check`, `bun run typecheck`, `bun run build`, `bun run test`, and `bun run --cwd packages/pi-auto-resume smoke`, and confirm `PASS` with real Pi output.

## Dependencies and Coordination

- **Blocked by:** T0001, T0002, T0003, T0004, T0005 (all feature tickets must be complete before final documentation and integrated standalone verification).
- **Blocks:** none.
- **Coordination risks:** Ensure `tests/pi-smoke.mjs` preserves fast deterministic timing (e.g., `retryDelayMs: 400`, `retryBackoffFactor: 1` where needed for tight bounded-retry assertions) so CI/local runs remain reliable without flakiness.

## Acceptance

- [ ] `packages/pi-auto-resume/README.md` accurately documents all new settings, defaults, commands (`/auto-resume guard`), custom pattern precedence, sentinel behavior, and local-file-only permissions.
- [ ] `tests/pi-smoke.mjs` passes against a standalone packed `@monkeyman520/pi-auto-resume` tarball in real Pi RPC, covering V1 invariants plus transient server recovery, custom prompt/file resolution, and `stopFile` sentinel cancellation.
- [ ] Root `bun run check`, `bun run typecheck`, `bun run build`, and `bun run test` all pass cleanly.
- [ ] Tested host version, Node version, and verification limitations remain honestly stated in `README.md`.

## Out of Scope

- Publishing to npm, pushing git tags, or modifying CI release workflows.
- Implementing autonomous idle-loop continuation or sibling plugins.
