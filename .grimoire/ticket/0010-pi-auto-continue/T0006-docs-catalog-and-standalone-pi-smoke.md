# Documentation, catalog entry, and standalone real-Pi smoke verification

**Ticket ID:** T0006
**Source:** [Spec 0012](../../spec/0012-pi-auto-continue.md) (C1, C6, C8)
**Status:** Todo

## Goal

Write accurate package documentation (`packages/pi-auto-continue/README.md`) including explicit shell-execution permission disclosures and continuation-queue usage, add `pi-auto-continue` to the root `README.md` catalog, implement an isolated real-Pi RPC smoke test (`tests/pi-smoke.mjs`), and confirm all workspace checks, builds, tests, and standalone Pi smoke pass.

## Affected Surfaces

- `packages/pi-auto-continue/README.md` — Installation/local build instructions, explicit arming contract, commands (`/auto-continue start` flags, `stop`, `queue` subcommands + immediate `send`/`steer` + TUI editor + `import`, `status`, `config`), prompt modes (Queue > Prompt Pipe + format tags > Prompt File > Direct), StopHooks (`maxRounds`, `onError`, `duration`, `until`, `stopFile`, one-shot `stopCommand`), quota-reset waiting and orthogonal usage with `pi-auto-resume`, unsandboxed shell-execution permissions/risks, and verification commands.
- `README.md` — Add `pi-auto-continue` row to the repository package catalog and layout (clearly marked private/initial status).
- `packages/pi-auto-continue/tests/pi-smoke.mjs` — Isolated outside-workspace tarball install + real `pi --mode rpc` verification with an offline synthetic provider fixture.

## Approach

- Model `tests/pi-smoke.mjs` on `packages/pi-auto-resume/tests/pi-smoke.mjs` (pack built tarball with `npm pack`, install offline into a clean temp consumer without siblings, load `dist/index.js` + synthetic provider fixture into real `pi --mode rpc`).
- Exercise in `tests/pi-smoke.mjs`:
  1. Fresh session starts disarmed: normal completion triggers 0 extra calls.
  2. Continuation queue FIFO + `queueEmptyPolicy: "stop"` + immediate `queue send`: queue 2 items, send item 1 immediately via `/auto-continue queue send`, arm `/auto-continue start --delay 300`, verify item 2 dispatches automatically on normal completion and session disarms with `"queue completed"` (0 extra calls after queue drains).
  3. `/auto-continue start --rounds 2 --delay 300 --prompt-pipe "<node script printing prose + two <continue> blocks>" --format "<continue>" "</continue>"`: advances 2 rounds sending the extracted last block, then stops at round limit.
  4. `/auto-continue start --rounds 5 --delay 300 --stop-cmd "<node script printing 0>"`: halts before dispatching any continuation round.
  5. `/auto-continue start --rounds 2 --delay 300 --on-error defer`: synthetic error turn triggers 0 continuation from `pi-auto-continue`, and a subsequent successful turn triggers the next normal continuation round; `/auto-continue stop` disarms cleanly without clearing queued items.
  6. Clean Pi process shutdown with zero load errors.
- Run root `bun run check`, `bun run typecheck`, `bun run build`, `bun run test`, and `bun run --cwd packages/pi-auto-continue smoke`.

## Dependencies and Coordination

- **Blocked by:** T0005 (all features and unit/lifecycle tests must be complete).
- **Blocks:** none.
- **Coordination risks:** Do not modify `scripts/release.ts` or any public release workflow (`pi-auto-continue` remains `"private": true` per Spec 0012 / ADR 0009).

## Acceptance

- [ ] `packages/pi-auto-continue/README.md` documents all actual commands, flags, queue operations, defaults, prompt modes, stop hooks, quota-reset waiting, orthogonal usage with `pi-auto-resume`, unsandboxed shell-execution permissions/risks, and tested host/Node versions honestly.
- [ ] Root `README.md` lists `pi-auto-continue` accurately as a private/initial package in the catalog and repository layout.
- [ ] `bun run --cwd packages/pi-auto-continue smoke` packs the built tarball outside the workspace and passes all assertions against real Pi RPC, ending in `PASS`.
- [ ] Root `bun run check`, `bun run typecheck`, `bun run build`, and `bun run test` all pass cleanly.

## Out of Scope

- Publishing to npm, pushing git tags, or modifying `scripts/release.ts` / GitHub Actions release workflows.
