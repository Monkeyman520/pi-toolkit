# GitHub Actions Workflows (CI & Release), Release Guide, and Documentation Alignment

**Ticket ID:** T0005
**Source:** [Spec 0010](../../spec/0010-bun-workspace-packaging-and-npm-release-pipeline.md) (Req 7, Req 8), [ADR 0008](../../adr/0008-bun-workspace-rolldown-and-bun-test-stack.md), [ADR 0009](../../adr/0009-public-npm-trusted-publishing-and-stable-tag-releases.md)
**Status:** Done

## Goal

Add the PR/`main` CI workflow (`.github/workflows/ci.yml`) and stable-tag release workflow (`.github/workflows/release.yml`) with offline static workflow tests, author the English maintainer release guide (`docs/releasing.md`), and align repository and package documentation (`AGENTS.md`, `README.md`, `packages/README.md`, and package READMEs) with the verified Bun + TypeScript + Biome + Rolldown + `bun test` stack, `@monkeyman520/*` publication model, and native Pi update commands (`pi install npm:@monkeyman520/<pkg>` + `pi update --extensions`).

## Affected Surfaces

- Workflows: `.github/workflows/ci.yml`, `.github/workflows/release.yml`.
- Tests: workflow contract assertions in `tests/release.test.ts` (or dedicated `tests/workflows.test.ts`).
- Documentation (English): `docs/releasing.md`, `AGENTS.md`, `README.md`, `packages/README.md`, and `packages/*/README.md`.

## Approach

- Author `.github/workflows/ci.yml`:
  - Triggers: `pull_request` and `push` to `main`.
  - Minimal `permissions: contents: read`, concurrency cancelling superseded PR runs.
  - Ubuntu runner with Node.js 24 (>= 22.19.0) and pinned Bun matching root `packageManager`: `bun install --frozen-lockfile`, `bun run check`, `bun run typecheck`, `bun run build`, `bun run test`.
- Author `.github/workflows/release.yml` modeled on `wangjq4214/pi-delegate/.github/workflows/release.yml`:
  - Trigger: `push.tags: ['v[0-9]*']`; repo guard `github.repository == 'Monkeyman520/pi-toolkit'`; per-ref concurrency with `cancel-in-progress: false`.
  - Read-only `validate` job (`contents: read`, `persist-credentials: false`): Node 24 + pinned Bun, `node scripts/release.ts validate "$RELEASE_TAG"`, `bun install --frozen-lockfile`, `bun run check`, `bun run typecheck`, `bun run build`, `bun run test`, `node scripts/release.ts pack "$RELEASE_TAG"`, upload `release-tarballs` (`dist/release/*.tgz`, 7-day retention, `if-no-files-found: error`, `overwrite: true`).
  - Dependent `publish` job (`needs: validate`, `contents: write`, `id-token: write`, `persist-credentials: false`): Node 24, `npm install --global npm@11`, download `release-tarballs`, run `node scripts/release.ts publish "$RELEASE_TAG"` with `GITHUB_TOKEN: ${{ github.token }}`; zero references to `NPM_TOKEN` or `NODE_AUTH_TOKEN`.
- Add offline workflow contract tests asserting exact triggers, repo guard, minimal job permissions, job dependency order, OIDC `npm@11` setup, artifact upload/download wiring, and absence of `NPM_TOKEN` / `NODE_AUTH_TOKEN`.
- Author `docs/releasing.md` covering: contract (including npm `latest` verification, bundled `dist/CHANGELOG.md` for Pi's "Extension Updates" notice, and GitHub Release `make_latest: "true"`), one-time npm initial-package bootstrap (staged publishing) & per-package Trusted Publishing (OIDC) configuration for all 5 packages (linking `Monkeyman520/pi-toolkit` and `release.yml`), how to opt in `pi-context-aco` later, local release preparation commands (including updating root `CHANGELOG.md` with `## [X.Y.Z]`), failure recovery / rerun semantics, and the offline evidence boundary.
- Update `AGENTS.md`, root `README.md`, `packages/README.md`, and affected `packages/*/README.md` to remove outdated npm-only / Vitest / no-bundler / `vendor/*.tgz` claims and document the actual verified commands, stack, unpinned npm install (`pi install npm:@monkeyman520/<pkg>`), and Pi update commands (`pi update --extensions`, `pi update npm:@monkeyman520/<pkg>`) accurately without claiming live npm publication has already occurred.

## Dependencies and Coordination

- **Blocked by:** T0004 (workflows and docs depend on the exact `scripts/release.ts` interface, changelog validation, artifact directory, and validated package catalog).
- **Blocks:** None (completes Spec 0010 delivery).
- **Coordination risks:** Ensure documentation only claims commands and checks that actually ran and passed; do not claim npm OIDC trust or live publication is already verified.

## Acceptance

- [ ] `.github/workflows/ci.yml` and `.github/workflows/release.yml` exist and pass all static workflow contract tests (triggers, repo guard, permissions, job order, artifact handling, OIDC `npm@11`, no `NPM_TOKEN`/`NODE_AUTH_TOKEN`).
- [ ] `docs/releasing.md` documents the release contract, root `CHANGELOG.md` preparation, one-time npm staged bootstrap and OIDC Trusted Publishing setup for all 5 public packages, future `pi-context-aco` opt-in steps, release prep commands, failure recovery, and explicit offline evidence boundary.
- [ ] `AGENTS.md`, `README.md`, `packages/README.md`, and `packages/*/README.md` accurately reflect the Bun + TypeScript + Biome + Rolldown + `bun test` stack, `@monkeyman520/*` package metadata, and unpinned `pi install` / `pi update --extensions` usage in English without contradicting ADR 0008 / ADR 0009.
- [ ] Full root verification (`bun install --frozen-lockfile`, `bun run check`, `bun run typecheck`, `bun run build`, `bun run test`, and local `node scripts/release.ts validate/pack/verify`) passes cleanly.

## Out of Scope

- Configuring npmjs.com Trusted Publishing settings, bootstrapping npm packages, pushing a `vX.Y.Z` tag, or performing a real npm/GitHub release.
- Implementing optional `lefthook.yml` git hooks (deferred under Spec 0010 Future Evolution).
