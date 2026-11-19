# Full Test Suite Migration from Vitest to bun test

**Ticket ID:** T0003
**Source:** [Spec 0010](../../spec/0010-bun-workspace-packaging-and-npm-release-pipeline.md) (Req 1, Req 4), [ADR 0008](../../adr/0008-bun-workspace-rolldown-and-bun-test-stack.md)
**Status:** Done

## Goal

Migrate all unit and integration test suites across all seven packages from Vitest to `bun:test`, remove `vitest` from every manifest and `bun.lock`, add root workspace contract tests (`tests/workspace.test.ts`), and verify `bun run test` passes reliably when executed sequentially in each package's working directory.

## Affected Surfaces

- `packages/*/tests/**/*.test.ts` across all seven packages (`pi-plugin-support`, `pi-auto-resume`, `pi-pretty-session`, `pi-quota-keeper`, `pi-session-tree-explorer`, `pi-prompt-pipeline`, `pi-context-aco`).
- `packages/*/package.json` (`"test": "bun test"`, removing `vitest` from `devDependencies`) and root `bun.lock`.
- Root `tests/workspace.test.ts` verifying workspace structure, private root, private `pi-plugin-support` / `pi-context-aco`, and package script contracts.

## Approach

- Replace `from "vitest"` imports with `from "bun:test"` across all test files.
- Systematically port Vitest-specific APIs found in the repository without reducing assertions or skipping tests:
  - `vi.fn` → `mock`
  - `vi.spyOn` → `spyOn` (including getter spies in `pi-session-tree-explorer`)
  - `vi.useFakeTimers` / `vi.advanceTimersByTime` / `vi.runAllTimers` / `vi.useRealTimers` → `bun:test` fake timers or explicit deterministic clock injection where needed
  - `vi.stubEnv` / `vi.unstubAllEnvs` → save/restore `process.env` helper in `beforeEach`/`afterEach`
  - `vi.hoisted` + `vi.mock` (e.g., `packages/pi-prompt-pipeline/tests/lifecycle.test.ts`) → `mock.module` with proper cleanup/isolation
- Add `tests/workspace.test.ts` (modeled on `wangjq4214/pi-delegate`) checking root `package.json`, workspace package boundaries, absence of `vitest` / `vendor/*.tgz`, and script contracts.
- Verify `bun run test` executes root tests and every package's `bun test` sequentially in its own working directory, plus `bun run check` and `bun run typecheck`.

## Dependencies and Coordination

- **Blocked by:** T0001 (requires root Bun workspace, `@types/bun`, and root script orchestration).
- **Blocks:** T0004 (root `bun run test` executes `tests/release.test.ts`).
- **Coordination risks:** Shares `packages/*/package.json` and `bun.lock` with T0002; prefer running after T0002 or coordinate manifest updates cleanly.

## Acceptance

- [ ] Zero references to `vitest` remain in any `package.json`, `bun.lock`, or test source file.
- [ ] All migrated test suites across all seven packages preserve their behavioral assertions (no weakened or disabled tests to work around runner differences).
- [ ] `tests/workspace.test.ts` exists and passes under `bun test ./tests`.
- [ ] `bun run check`, `bun run typecheck`, and `bun run test` all pass cleanly from the repository root.

## Out of Scope

- Modifying production plugin behavior beyond testability seams strictly needed to preserve equivalent test coverage.
- Implementing `scripts/release.ts` or GitHub Actions workflows (T0004, T0005).
