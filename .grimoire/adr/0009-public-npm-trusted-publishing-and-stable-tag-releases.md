# Public npm Trusted Publishing and stable tag-triggered releases

**Status:** Implementing
**Date:** 2026-11-19

## Context

All packages in `pi-packages` (GitHub repository `Monkeyman520/pi-toolkit`) were previously `"private": true` with unscoped names, no root `LICENSE`, and no GitHub Actions workflows. The user requested automated packaging, GitHub Release creation, and public npm publication modeled on `wangjq4214/pi-delegate`, plus a CI verification workflow for pull requests and `main`.

Alternatives considered and rejected during refinement were: (a) independent per-package release tags or Changesets, (b) authenticating npm via a stored `NPM_TOKEN` GitHub secret, (c) publishing `pi-plugin-support` publicly, (d) publishing experimental `pi-context-aco` immediately rather than gating it behind release configuration, (e) adding custom in-extension runtime network polling to `registry.npmjs.org` instead of relying on Pi's native update and changelog contract, (f) maintaining separate per-package `CHANGELOG.md` files under unified versioning, and (g) maintaining a movable `latest` Git tag on GitHub.

## Decision

- Adopt the `@monkeyman520/<pkg-name>` npm scope and `MIT` license (with a root `LICENSE` file bundled into each published package's `dist/LICENSE`) for the `Monkeyman520/pi-toolkit` repository. Keep the workspace root `"private": true`.
- Define a configurable public release catalog in the release tooling:
  - **Initially published public packages (5):** `@monkeyman520/pi-auto-resume`, `@monkeyman520/pi-pretty-session`, `@monkeyman520/pi-quota-keeper`, `@monkeyman520/pi-session-tree-explorer`, and `@monkeyman520/pi-prompt-pipeline`.
  - **Temporarily excluded (configurable opt-in later):** `pi-context-aco` remains `"private": true` and omitted from the initial public release list while experimental; adding it later requires updating its manifest metadata and release catalog configuration without redesigning the pipeline.
  - **Permanently excluded:** `pi-plugin-support` remains `"private": true` and is inlined into consumer bundles per [ADR 0008](./0008-bun-workspace-rolldown-and-bun-test-stack.md).
- Trigger automated releases on pushing a unified stable tag `vX.Y.Z` to `Monkeyman520/pi-toolkit`. Prerelease tags, unrelated tags, and branch pushes must not publish. All configured public package manifests must already match version `X.Y.Z`; mismatches block release, and the workflow never auto-bumps versions, commits changes, or edits tags.
- Run full validation (frozen-lockfile install, Biome check, TypeScript typecheck, build, test, and tarball packing/inspection) in a read-only validation job before any external publication.
- Authenticate npm publication exclusively via **npm Trusted Publishing (OIDC)** using an OIDC-capable npm CLI (npm 11+ on Node.js) with `id-token: write`, never a stored long-lived `NPM_TOKEN`. Publish immutable version `X.Y.Z` to `https://registry.npmjs.org` with `--access public --tag latest --ignore-scripts` (npm forbids creating semver-formatted dist-tags such as `v0.1.0`; a single `--tag latest` publish exposes both exact version `X.Y.Z` and the `latest` dist-tag). After upload (and when verifying retry skips), confirm both exact version `X.Y.Z` and `dist-tags.latest === X.Y.Z` on npm so `pi update --extensions` and `pi update npm:@monkeyman520/<pkg>` detect every release.
- Support Pi's native update discovery and startup "Extension Updates" changelog notice without adding outbound network checks inside extensions: maintain a single repository root `CHANGELOG.md` bundled into each plugin's `dist/CHANGELOG.md`, declare `"pi": { "extensions": ["./dist/index.js"], "changelogPath": "./dist/CHANGELOG.md" }` and `"keywords": ["pi-package"]`, and require `scripts/release.ts` to verify a matching Pi-compatible version heading (`## [X.Y.Z]` or `## X.Y.Z`) in `CHANGELOG.md` before publishing.
- After all configured public packages are published and confirmed as `latest` on npm, create or complete one stable (non-prerelease) GitHub Release for tag `vX.Y.Z` with `make_latest: "true"`, generated release notes, and the verified `.tgz` tarballs attached (without pushing a separate movable `latest` Git tag). Support idempotent reruns after partial npm or GitHub Release failures without attempting to overwrite immutable npm versions or duplicating releases/assets.
- Provide a separate GitHub Actions CI workflow triggered on pull requests and pushes to `main` that executes frozen-lockfile install, Biome check, typecheck, build, and tests.

## Consequences

- Each published package manifest must declare `"publishConfig": { "access": "public" }`, `"license": "MIT"`, matching `repository` metadata (`git+https://github.com/Monkeyman520/pi-toolkit.git` and `directory: "packages/<pkg-name>"`), explicit `files` allowlists, and built Pi entry points.
- npm Trusted Publishing requires external maintainer setup on npmjs.com for each public package (linking `Monkeyman520/pi-toolkit` and the exact release workflow filename) plus one-time initial-package bootstrap for packages not yet created on npm. Offline workflow/script tests cannot verify external npm account trust or trigger real publication.
- npm publication and GitHub Release creation are not a single atomic transaction; partial npm publication cannot be rolled back and relies on idempotent job reruns to finish remaining packages and Release assets.
- Releasing a new version requires maintainers to intentionally align all configured public package versions, add a matching `## [X.Y.Z]` (or `## X.Y.Z`) section to root `CHANGELOG.md`, update `bun.lock` if needed, commit, and push the matching `vX.Y.Z` tag.
- Because Pi only checks for npm updates on unpinned package specs (`pi install npm:@monkeyman520/<pkg>` or `pi -e npm:@monkeyman520/<pkg>`), installation documentation must recommend unpinned npm installs and `pi update --extensions` rather than pinned `@X.Y.Z` examples.
