# Bun workspace, Rolldown bundling, and bun test stack

**Status:** Implementing
**Date:** 2026-11-19
**Supersedes:** [ADR 0002](./0002-typescript-esm-plugin-development-stack.md); partially supersedes [ADR 0005](./0005-versioned-plugin-support-library.md) only for support-library archive/bundled-dependency distribution and its no-bundler constraint (ADR 0005's independent instance/lifecycle ownership and `pi.events` discovery boundaries remain in force).

## Context

The repository originally used package-local npm lockfiles, per-package Biome and TypeScript configs, Vitest, and a no-bundler source-loading workflow ([ADR 0002](./0002-typescript-esm-plugin-development-stack.md)), with five plugins shipping `pi-plugin-support` via local `vendor/*.tgz` archives and npm `bundledDependencies` ([ADR 0005](./0005-versioned-plugin-support-library.md)).

To support automated packaging and public npm publication modeled on `wangjq4214/pi-delegate`, the user selected a unified Bun + TypeScript + Biome workspace stack with Rolldown bundling and `bun test`. Alternatives considered and rejected during refinement were: (a) keeping a source-only no-bundler npm distribution, (b) retaining Vitest instead of migrating tests to `bun test`, and (c) publishing `pi-plugin-support` as a public npm package.

## Decision

- Introduce a private Bun workspace root (`package.json` with `"private": true` and `"workspaces": ["packages/*"]`) with a single root `bun.lock`, root `biome.json`, and shared `tsconfig.base.json` extended by packages and root scripts/tests. Retain independent per-package installation boundaries under `packages/<plugin-name>/` ([ADR 0001](./0001-independently-installable-pi-packages.md)).
- Retain TypeScript ESM (`"type": "module"`), Node.js >= 22.19.0 runtime compatibility, Biome code checking, TypeBox (`typebox`), and host-provided `peerDependencies` with `"*"` ranges (`@earendil-works/pi-coding-agent`, `@earendil-works/pi-agent-core`, `@earendil-works/pi-tui`, `@earendil-works/pi-ai`, and `typebox` as used).
- Bundle each plugin package independently with Rolldown (`rolldown.config.mjs`) into ESM output under `dist/` (`dist/index.js`, `dist/LICENSE` copied from the repository root `LICENSE`, and `dist/CHANGELOG.md` copied from the repository root `CHANGELOG.md`). Point published Pi manifests to the built entry and changelog (`"pi": { "extensions": ["./dist/index.js"], "changelogPath": "./dist/CHANGELOG.md" }`) while keeping host SDKs, `node:*` built-ins, `typebox`, and declared third-party runtime dependencies (such as `proper-lockfile` in `pi-quota-keeper`) external.
- Keep `pi-plugin-support` as a permanently private internal workspace package (`packages/pi-plugin-support`, never published to npm). Consuming plugins resolve it through the workspace during development and inline it into their own `dist/index.js` via Rolldown, removing `vendor/*.tgz` archives, npm `bundledDependencies`, and `scripts/package-support.mjs`. Independent instance ownership, zero shared mutable runtime managers, and `pi.events` cross-plugin discovery from ADR 0005 remain binding.
- Migrate all package and workspace tests from Vitest to `bun test`, running package suites in their respective package working directories via root workspace orchestration (e.g. `bun run test` rather than bare root `bun test`) so package-relative fixtures keep their expected working directory.

## Consequences

- Development tooling (Bun, TypeScript, Biome, Rolldown) and lockfile management are centralized at the private workspace root instead of duplicated across seven package-local npm lockfiles.
- Published plugin tarballs ship clean built ESM JavaScript (`dist/index.js`), `dist/LICENSE`, and `dist/CHANGELOG.md` without `vendor/*.tgz` archives or a separate public support-library package.
- Migrating existing Vitest suites requires replacing Vitest-specific helpers (`vi.fn`, `vi.spyOn`, `vi.useFakeTimers`, `vi.stubEnv`, `vi.hoisted`, `vi.mock`) with `bun:test` equivalents and verifying every package's behavior and Pi runtime loading against built `dist/index.js` entries.
- Building is now a prerequisite for packaged Pi loading and tarball verification; local development may still point Pi at TypeScript entries where supported, but published artifacts must be verified via built `dist/index.js`.
- Contributors and CI runners require Bun in addition to Node.js >= 22.19.0.
