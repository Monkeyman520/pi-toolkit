# Per-Package Rolldown Bundling, Public @monkeyman520/* Metadata, and Pi Verification

**Ticket ID:** T0002
**Source:** [Spec 0010](../../spec/0010-bun-workspace-packaging-and-npm-release-pipeline.md) (Req 2, Req 3, Req 4 smoke, Req 5), [ADR 0001](../../adr/0001-independently-installable-pi-packages.md), [ADR 0005](../../adr/0005-versioned-plugin-support-library.md), [ADR 0008](../../adr/0008-bun-workspace-rolldown-and-bun-test-stack.md), [ADR 0009](../../adr/0009-public-npm-trusted-publishing-and-stable-tag-releases.md)
**Status:** Done

## Goal

Configure Rolldown ESM bundling for all six plugin packages (inlining private `pi-plugin-support` and emitting `dist/index.js`, `dist/LICENSE`, and `dist/CHANGELOG.md`), configure public `@monkeyman520/*` npm metadata with Pi's native update/changelog contract for the five initially published plugins (keeping `pi-context-aco` and `pi-plugin-support` private), and verify built bundles and packed tarballs load cleanly in Pi outside the checkout with preserved `pi.events` interoperability and isolated lifecycles.

## Affected Surfaces

- `packages/pi-auto-resume/`, `packages/pi-pretty-session/`, `packages/pi-quota-keeper/`, `packages/pi-session-tree-explorer/`, `packages/pi-prompt-pipeline/`, `packages/pi-context-aco/`: `rolldown.config.mjs` and `package.json`.
- `packages/pi-plugin-support/package.json`: remains `"private": true` with no build/publish exposure as a Pi plugin.
- Runtime verification scripts: `tests/plugin-isolation.mjs`, `tests/support-library-smoke.mjs` (updated or replaced to validate inlined support behavior), and `packages/*/tests/*smoke*`.

## Approach

- Add `rolldown.config.mjs` to each of the six plugin packages modeled on `wangjq4214/pi-delegate`: ESM output into `dist/` (`cleanDir: true`, `sourcemap: true`), `platform: "node"`, plugin emitting `dist/LICENSE` from `../../LICENSE` and `dist/CHANGELOG.md` from `../../CHANGELOG.md`, externalizing `/^node:/`, `/^@earendil-works\//`, `"typebox"`, and (for `pi-quota-keeper`) `"proper-lockfile"` so `pi-plugin-support` is inlined into `dist/index.js`.
- Update the five public plugin manifests (`pi-auto-resume`, `pi-pretty-session`, `pi-quota-keeper`, `pi-session-tree-explorer`, `pi-prompt-pipeline`) to omit `"private": true` and set:
  - `name`: `@monkeyman520/<pkg-name>`
  - `license`: `"MIT"`
  - `publishConfig`: `{ "access": "public" }`
  - `keywords`: `["pi-package"]`
  - `repository`: `{ "type": "git", "url": "git+https://github.com/Monkeyman520/pi-toolkit.git", "directory": "packages/<pkg-name>" }`
  - `files`: explicit allowlist including `"dist"`, `"README.md"`, and package-specific shipped assets (e.g., `"examples"` for `pi-prompt-pipeline`; `"session-tree.schema.json"` if shipped for `pi-session-tree-explorer`), without `"vendor"` or `"extensions"`
  - `pi`: `{ "extensions": ["./dist/index.js"], "changelogPath": "./dist/CHANGELOG.md" }`
  - `scripts`: `build`, `prepack` (`"bun run build"`), `dev` (`"pi -e ./extensions/index.ts"`), `start` (`"pi -e ./dist/index.js"`), `typecheck`, `test`, `smoke`
  - Move `pi-plugin-support` out of published runtime `dependencies` (to `devDependencies` as `workspace:*`) so external consumers never try to install a private package from npm; keep `proper-lockfile` in `pi-quota-keeper`'s runtime `dependencies`.
- Keep `packages/pi-context-aco` `"private": true` (with Rolldown build, `dist/index.js`, `dist/LICENSE`, `dist/CHANGELOG.md`, and `pi.changelogPath` parity so opting it in later only requires manifest/release-list updates) and keep `packages/pi-plugin-support` permanently `"private": true`.
- Update `tests/plugin-isolation.mjs` and per-package Pi smoke tests to pack and install built tarballs outside the checkout, asserting `dist/CHANGELOG.md` presence, no `vendor/*.tgz` or bundled host SDKs, verifying `pi-quota-keeper` resolves `proper-lockfile`, and confirming multi-plugin `pi.events` panel discovery and independent lifecycles across built bundles.

## Dependencies and Coordination

- **Blocked by:** T0001 (requires root Bun workspace, Rolldown dependency, root `LICENSE`, root `CHANGELOG.md`, and workspace `pi-plugin-support`).
- **Blocks:** T0004 (release script validates and packs the finalized public manifests and `dist/` outputs).
- **Coordination risks:** Shares `packages/*/package.json` and `bun.lock` with T0003; sequence T0002 before T0003 or coordinate manifest edits.

## Acceptance

- [ ] `bun run build` succeeds across all six plugin packages and produces non-empty `dist/index.js` (+ sourcemap), `dist/LICENSE` matching root `LICENSE`, and `dist/CHANGELOG.md` matching root `CHANGELOG.md`.
- [ ] Inspecting built `dist/index.js` and packed tarballs confirms `pi-plugin-support` is inlined, while `node:*`, `@earendil-works/*`, `typebox`, and `proper-lockfile` (in `pi-quota-keeper`) remain external; no published package declares `pi-plugin-support` in runtime `dependencies` or ships `vendor/`.
- [ ] All five public plugins declare valid `@monkeyman520/*` public MIT metadata, `keywords: ["pi-package"]`, `pi.extensions: ["./dist/index.js"]`, `pi.changelogPath: "./dist/CHANGELOG.md"`, and repository fields; `pi-context-aco` and `pi-plugin-support` remain `"private": true`.
- [ ] Updated per-package Pi smoke tests and `tests/plugin-isolation.mjs` pass against built `dist/index.js` tarballs outside the checkout, confirming independent lifecycles and `pi.events` interoperability.

## Out of Scope

- Adding custom runtime npm-update polling code inside extensions (updates rely on Pi native `pi update` + `dist/CHANGELOG.md`).
- Migrating Vitest unit tests to `bun:test` (T0003).
- Writing `scripts/release.ts` or GitHub Actions workflows (T0004, T0005).
- Updating repository-wide documentation and `docs/releasing.md` (T0005).
