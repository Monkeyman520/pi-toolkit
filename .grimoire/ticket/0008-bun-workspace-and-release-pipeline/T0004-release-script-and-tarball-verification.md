# Release Automation Script (scripts/release.ts) and Offline Contract Tests

**Ticket ID:** T0004
**Source:** [Spec 0010](../../spec/0010-bun-workspace-packaging-and-npm-release-pipeline.md) (Req 5, Req 6), [ADR 0009](../../adr/0009-public-npm-trusted-publishing-and-stable-tag-releases.md)
**Status:** Done

## Goal

Implement the Node-executable TypeScript release helper `scripts/release.ts` (`validate`, `pack`, `verify`, and `publish` modes) for `Monkeyman520/pi-toolkit` with a configurable public package catalog, root `CHANGELOG.md` version-heading validation, strict tarball verification (`dist/index.js`, `dist/LICENSE`, `dist/CHANGELOG.md`), npm Trusted Publishing (OIDC) with exact-version + `dist-tags.latest === X.Y.Z` verification and retry skipping, and idempotent GitHub Release creation/recovery (`make_latest: "true"`), backed by thorough offline contract tests in `tests/release.test.ts`.

## Affected Surfaces

- `scripts/release.ts` (exported testable helpers + CLI entry for `validate`, `pack`, `verify`, `publish`).
- `tests/release.test.ts` (offline unit, failure-recovery, and real local `npm pack`/`tar` inspection tests).

## Approach

- Model `scripts/release.ts` on `wangjq4214/pi-delegate/scripts/release.ts`, tailored to `Monkeyman520/pi-toolkit`:
  - `repository = "Monkeyman520/pi-toolkit"`
  - Single explicit configurable export `packageDirectories` listing the five initially public packages (`pi-auto-resume`, `pi-pretty-session`, `pi-quota-keeper`, `pi-session-tree-explorer`, `pi-prompt-pipeline`), excluding `pi-context-aco` (opt-in configurable later) and permanently excluding `pi-plugin-support`.
  - Cross-platform command helper handling Windows `npm-cli.js` and native `tar.exe` alongside Linux runners.
  - `validate`: enforce stable `vX.Y.Z` tag (reject prerelease/malformed tags), private workspace root, root `CHANGELOG.md` containing a Pi-compatible heading matching `X.Y.Z` (e.g., `^##\s+(?:\[X\.Y\.Z\]|X\.Y\.Z)(?:\s|$|-)`), exact `@monkeyman520/<dir>` name, version `X.Y.Z`, `private !== true`, `publishConfig.access === "public"`, `keywords` containing `"pi-package"`, repository URL/directory, safe `files` allowlist including `dist`, `pi.extensions: ["./dist/index.js"]`, and `pi.changelogPath: "./dist/CHANGELOG.md"`.
  - `pack` / `verify`: run `npm pack --json --ignore-scripts --pack-destination dist/release` without rebuilding; verify exact expected tarball set (`monkeyman520-<dir>-<version>.tgz`), safe archive paths, no symlinks/duplicates/`node_modules`/`.env`, only allowed files, required `package.json`, non-empty `dist/index.js`, root-matching `dist/LICENSE`, root-matching `dist/CHANGELOG.md` (with the `X.Y.Z` heading), declared non-`dist` files, and exact manifest parity.
  - `publish`: re-verify tarballs, query npm registry for exact version `X.Y.Z` (`404` = absent; other errors or mismatched identity abort). For missing versions, run `npm publish <tarball> --access public --tag latest --ignore-scripts --registry https://registry.npmjs.org` (OIDC, no token env, never attempting invalid semver dist-tags such as `vX.Y.Z`). After upload—and also when skipping an already-published version on retry—confirm on npm that **both** exact version `X.Y.Z` is available **and** `dist-tags.latest === X.Y.Z` (polling until both hold or failing visibly on timeout/mismatch) so `pi update --extensions` detects the release. Then create/resume a draft GitHub Release with `generate_release_notes: true`, upload/reconcile `.tgz` assets by SHA-256 digest without duplicates, and finalize with `draft: false`, `prerelease: false`, and `make_latest: "true"` (without pushing a movable Git `latest` tag).
- Cover all behaviors and failure modes offline in `tests/release.test.ts` (invalid/prerelease tags, version mismatch, missing root `CHANGELOG.md` heading, `pi.changelogPath` / `keywords` mismatch, private/excluded packages, configurable inclusion of `pi-context-aco`, tarball defect detection via real local `npm pack`/`tar` including tampered `dist/LICENSE` or `dist/CHANGELOG.md`, registry lookup errors, `dist-tags.latest` polling/mismatch/timeout, partial npm retry skipping, GitHub Release draft/asset digest recovery and `make_latest: "true"`, and fully successful rerun).

## Dependencies and Coordination

- **Blocked by:** T0002 (requires built `dist/index.js`, `dist/LICENSE`, `dist/CHANGELOG.md`, and finalized public `@monkeyman520/*` manifests for real local `pack`/`verify`), T0003 (requires root `bun run test` harness).
- **Blocks:** T0005 (GitHub Actions `release.yml` invokes `scripts/release.ts` and `docs/releasing.md` documents its exact modes and recovery rules).
- **Coordination risks:** None beyond maintaining clean exported interfaces between `scripts/release.ts` and `tests/release.test.ts`.

## Acceptance

- [ ] `node scripts/release.ts validate "v<current>"`, `pack`, and `verify` succeed locally against the built workspace without publishing, producing exactly the 5 expected `.tgz` files in `dist/release/` (excluding `pi-context-aco` and `pi-plugin-support`) and confirming `dist/LICENSE` and `dist/CHANGELOG.md` parity.
- [ ] `tests/release.test.ts` verifies invalid/prerelease tag rejection, version mismatch blocking, missing `CHANGELOG.md` heading blocking, tarball tamper/missing-file rejection, configurable package list handling (including opt-in `pi-context-aco` behavior in test fixtures), npm 404 vs. error handling, exact-version + `dist-tags.latest === X.Y.Z` polling/mismatch/timeout, partial npm retry skipping, and GitHub Release draft/SHA-256 asset recovery with `make_latest: "true"` without duplicates.
- [ ] `bun run check`, `bun run typecheck`, `bun run build`, and `bun run test` all pass cleanly.
- [ ] No live npm publication, GitHub API mutation, changelog edit, or version/tag edit occurs during tests.

## Out of Scope

- GitHub Actions YAML files and workflow assertions (T0005).
- Maintainer documentation updates (T0005).
- Pushing movable Git `latest` tags or semver npm dist-tags.
- Configuring npm Trusted Publishing on npmjs.com or executing a real release.
