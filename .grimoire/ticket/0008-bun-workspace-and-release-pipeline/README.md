# Bun Workspace, Rolldown Packaging, and Automated npm/GitHub Release Pipeline

**Source:** [Spec 0010](../../spec/0010-bun-workspace-packaging-and-npm-release-pipeline.md), [ADR 0008](../../adr/0008-bun-workspace-rolldown-and-bun-test-stack.md), [ADR 0009](../../adr/0009-public-npm-trusted-publishing-and-stable-tag-releases.md)
**Ticket folder:** .grimoire/ticket/0008-bun-workspace-and-release-pipeline/

## Overview

Migrate `pi-packages` (`Monkeyman520/pi-toolkit`) from package-local npm/Vitest/no-bundler setups to a unified private Bun + TypeScript + Biome workspace with per-package Rolldown ESM bundling (inlining private `pi-plugin-support` and shipping `dist/LICENSE` + `dist/CHANGELOG.md`), full `bun test` coverage, public `@monkeyman520/*` MIT package metadata (5 initial public plugins; `pi-context-aco` temporarily excluded and opt-in configurable; `pi-plugin-support` permanently private), native Pi update & "Extension Updates" changelog support, an idempotent npm Trusted Publishing (OIDC) + `latest` verification + GitHub Release (`make_latest: "true"`) automation script and workflow, a PR/`main` CI workflow, and updated English maintainer documentation.

## Delivery Surfaces

- **Workspace & root tooling:** `package.json`, `bun.lock`, `LICENSE`, `CHANGELOG.md`, `biome.json`, `tsconfig.base.json`, `tsconfig.json`, `.gitignore`, removal of `scripts/package-support.mjs` and per-package `package-lock.json` / duplicate `biome.json` / `vendor/*.tgz`.
- **Packages (`packages/*`):** All 6 plugins (`pi-auto-resume`, `pi-pretty-session`, `pi-quota-keeper`, `pi-session-tree-explorer`, `pi-prompt-pipeline`, `pi-context-aco`) plus private internal `pi-plugin-support` — manifests (`pi.extensions`, `pi.changelogPath`, `keywords`), `rolldown.config.mjs`, `tsconfig.json`, `dist/index.js` + `dist/LICENSE` + `dist/CHANGELOG.md`, migrated `bun:test` suites, Pi smoke tests, and READMEs.
- **Release & CI automation:** `scripts/release.ts`, `.github/workflows/ci.yml`, `.github/workflows/release.yml`, `tests/release.test.ts`, `tests/workspace.test.ts`, updated `tests/plugin-isolation.mjs`.
- **Documentation:** `docs/releasing.md`, `AGENTS.md`, `README.md`, `packages/README.md`, and package READMEs.

## Dependencies

| Producer | Consumer | Why consumer cannot proceed first |
| --- | --- | --- |
| T0001 | T0002 | Per-package Rolldown bundling needs root Bun workspace, Rolldown dependency, root `LICENSE`, root `CHANGELOG.md`, and workspace resolution of `pi-plugin-support`. |
| T0001 | T0003 | `bun test` migration needs root Bun workspace, lockfile, `@types/bun`, and workspace script orchestration. |
| T0002 | T0004 | `scripts/release.ts` validation and real local tarball packing/verification require built `dist/index.js`, `dist/LICENSE`, `dist/CHANGELOG.md`, and finalized public `@monkeyman520/*` manifests. |
| T0003 | T0004 | Offline release contract tests (`tests/release.test.ts`) run under the root `bun run test` harness established by T0003. |
| T0004 | T0005 | `.github/workflows/release.yml`, workflow assertions, and `docs/releasing.md` directly reference `scripts/release.ts` CLI modes, changelog checks, artifact paths, and verified workspace commands. |

## Coordination

| Tickets | Risk | Strategy |
| --- | --- | --- |
| T0002, T0003 | Both edit `packages/*/package.json` and `bun.lock` (T0002 sets build/publish/Pi entry metadata; T0003 removes `vitest` and sets `bun test` scripts) | Sequence T0002 before T0003 by default; if run in parallel, keep manifest diffs disjoint and regenerate `bun.lock` on integration. |
| T0002, T0005 | Package READMEs and root `README.md` describe verified commands, public names, and `pi update` usage | Keep T0002 focused on code/manifests/smoke tests; consolidate repository and package documentation updates in T0005 after full pipeline verification. |

## Recommended Order

1. **T0001** — Establish root Bun workspace, shared Biome/TypeScript config, MIT `LICENSE`, root `CHANGELOG.md`, and workspace `pi-plugin-support` resolution.
2. **T0002** — Add per-package Rolldown bundling (`dist/index.js`, `dist/LICENSE`, `dist/CHANGELOG.md`), inlined `pi-plugin-support`, public `@monkeyman520/*` metadata, and verify Pi loading/isolation on built bundles.
3. **T0003** — Migrate all package and root tests from Vitest to `bun test` and remove Vitest (can run in parallel with T0002 with manifest coordination).
4. **T0004** — Implement `scripts/release.ts` (including `CHANGELOG.md` check, `dist-tags.latest` verification, and GitHub Release `make_latest: "true"`) and offline contract tests (`tests/release.test.ts`).
5. **T0005** — Add `.github/workflows/ci.yml` and `.github/workflows/release.yml`, workflow tests, `docs/releasing.md`, and align `AGENTS.md` / READMEs (including unpinned `pi install` & `pi update --extensions`).

## Ticket Index

| Ticket | File | Outcome |
| --- | --- | --- |
| T0001 | [T0001-bun-workspace-foundation-and-toolchain.md](./T0001-bun-workspace-foundation-and-toolchain.md) | Private root Bun workspace, single `bun.lock`, MIT `LICENSE`, root `CHANGELOG.md`, shared Biome/TS configs, and workspace `pi-plugin-support` resolution |
| T0002 | [T0002-rolldown-bundling-and-public-package-metadata.md](./T0002-rolldown-bundling-and-public-package-metadata.md) | Per-package Rolldown ESM bundles (`dist/index.js` + `dist/LICENSE` + `dist/CHANGELOG.md`), inlined `pi-plugin-support`, `@monkeyman520/*` public metadata, and built-entry Pi smoke/isolation verification |
| T0003 | [T0003-migrate-tests-from-vitest-to-bun-test.md](./T0003-migrate-tests-from-vitest-to-bun-test.md) | All seven packages and root workspace tests migrated from Vitest to `bun:test`, passing via sequential `bun run test` |
| T0004 | [T0004-release-script-and-tarball-verification.md](./T0004-release-script-and-tarball-verification.md) | Node-executable `scripts/release.ts` (`validate`, `pack`, `verify`, `publish`) with configurable public catalog, changelog check, OIDC npm publish + `latest` verification, GitHub Release `make_latest: "true"` recovery, and offline tests |
| T0005 | [T0005-github-workflows-and-documentation-alignment.md](./T0005-github-workflows-and-documentation-alignment.md) | PR/`main` CI workflow (`ci.yml`), stable-tag release workflow (`release.yml`), workflow contract tests, `docs/releasing.md`, and updated `AGENTS.md` / READMEs |
