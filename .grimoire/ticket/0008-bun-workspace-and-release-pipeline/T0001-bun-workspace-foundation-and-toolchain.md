# Bun Workspace Foundation, Root Toolchain, MIT License, and Changelog

**Ticket ID:** T0001
**Source:** [Spec 0010](../../spec/0010-bun-workspace-packaging-and-npm-release-pipeline.md) (Req 1, Req 3), [ADR 0008](../../adr/0008-bun-workspace-rolldown-and-bun-test-stack.md)
**Status:** Done

## Goal

Establish a private repository-root Bun workspace with a single `bun.lock`, repository MIT `LICENSE`, repository root `CHANGELOG.md` (Pi-compatible semver headings), shared Biome and TypeScript base configurations, root orchestration scripts, and workspace-based resolution for private `packages/pi-plugin-support`, removing superseded per-package npm lockfiles, duplicate Biome configs, and `vendor/*.tgz` support-archive plumbing.

## Affected Surfaces

- Repository root: `package.json`, `bun.lock`, `LICENSE`, `CHANGELOG.md`, `biome.json`, `tsconfig.base.json`, `tsconfig.json`, `.gitignore`.
- Removed legacy archive plumbing: `scripts/package-support.mjs`, `packages/*/vendor/pi-plugin-support-*.tgz`, per-package `package-lock.json`, duplicate per-package `biome.json` and `.npmrc`.
- Package configs: `packages/*/tsconfig.json` extending `../../tsconfig.base.json`, and `packages/*/package.json` workspace dependency links to `pi-plugin-support` (removing `bundledDependencies` / `bundleDependencies`).

## Approach

- Mirror `wangjq4214/pi-delegate`'s root workspace layout: `"private": true`, `"license": "MIT"`, `"type": "module"`, pinned `packageManager` (`bun@...`), `"workspaces": ["packages/*"]`, root devDependencies (`@biomejs/biome`, `@types/bun`, `rolldown`, `typescript`), and root scripts (`build`, `check`, `check:fix`, `format`, `typecheck`, `test`) using `bun run --workspaces --sequential ...` so package scripts run in their own working directories.
- Create repository root `LICENSE` (MIT) and initial `CHANGELOG.md` with a Pi-compatible heading for the current workspace version (e.g., `## [0.1.0]`) so Rolldown bundling and release validation have an authoritative single changelog source.
- Ensure `packages/pi-plugin-support` remains `"private": true` and resolves cleanly via `workspace:*` for its five consumer packages (`pi-auto-resume`, `pi-pretty-session`, `pi-quota-keeper`, `pi-session-tree-explorer`, `pi-context-aco`) without duplicating host peers.
- Preserve `packages/<plugin-name>/` independent package boundaries ([ADR 0001](../../adr/0001-independently-installable-pi-packages.md)) and Node.js >= 22.19.0 runtime compatibility.
- Ensure `.gitignore` ignores build outputs (`dist/`) and `node_modules/` cleanly across root and packages.

## Dependencies and Coordination

- **Blocked by:** None (note: requires Bun installed in the local execution environment).
- **Blocks:** T0002 (Rolldown builds, root `LICENSE`, root `CHANGELOG.md`), T0003 (`bun test` migration).
- **Coordination risks:** Generates the initial root `bun.lock`; T0002 and T0003 will update `bun.lock` when finalizing package metadata and removing `vitest`.

## Acceptance

- [ ] Root `package.json` (`"private": true`, `"workspaces": ["packages/*"]`), `LICENSE` (MIT), `CHANGELOG.md` (with Pi-compatible semver heading matching current package version), `biome.json`, `tsconfig.base.json`, `tsconfig.json`, and single root `bun.lock` exist and pass `bun install --frozen-lockfile`.
- [ ] All per-package `package-lock.json`, duplicate per-package `biome.json`, `packages/*/vendor/pi-plugin-support-*.tgz`, `bundledDependencies`/`bundleDependencies`, and `scripts/package-support.mjs` are removed.
- [ ] All seven packages extend `../../tsconfig.base.json` and resolve `pi-plugin-support` subpath imports through the workspace.
- [ ] `bun run check` and `bun run typecheck` pass cleanly across the root and all seven packages.

## Out of Scope

- Rolldown bundle configs and `dist/index.js` / `dist/CHANGELOG.md` manifest switch (T0002).
- Replacing `vitest` imports with `bun:test` (T0003).
- Release script, GitHub Actions workflows, or publishing metadata changes beyond workspace wiring (T0002, T0004, T0005).
