# Releasing pi-packages

## What a release does

The [stable release workflow](../.github/workflows/release.yml) runs on tag pushes to `Monkeyman520/pi-toolkit`. Only stable `vX.Y.Z` tags with matching public package versions and a matching [root changelog](../CHANGELOG.md) entry can publish. The validation job builds and checks the tagged revision, packs it once and uploads the verified tarballs. The publish job downloads and re-verifies those same archives without rebuilding. It uses npm Trusted Publishing (OIDC) to publish missing versions to `https://registry.npmjs.org`.

A release succeeds only after the exact version is visible on npm and `latest` points to it for every selected package. The workflow then completes one stable GitHub Release for `vX.Y.Z`, with generated notes, the checked `.tgz` files and GitHub's Latest Release designation. It does not push a moving Git tag named `latest` or create an npm dist-tag named `vX.Y.Z`. The workflow does not edit versions, the changelog, or Git tags.

The initial catalog is:

- `@monkeyman520/pi-auto-resume`
- `@monkeyman520/pi-pretty-session`
- `@monkeyman520/pi-quota-keeper`
- `@monkeyman520/pi-session-tree-explorer`
- `@monkeyman520/pi-prompt-pipeline`

The root and `pi-plugin-support` are never published. Experimental `pi-context-aco` is private and initially excluded; see [Opt in ACO](#opt-in-aco).

## One-time maintainer setup

These steps can change npm or repository state. Do them intentionally with maintainer authorization; they are not local validation steps.

1. Confirm npm ownership and public publication access for the `@monkeyman520` scope. Enable GitHub Actions and restrict who can create matching release tags in the repository. The workflow uses GitHub-hosted Ubuntu, Node 24 and npm 11 (Trusted Publishing requires npm >= 11.5.1 and Node >= 22.14).
2. A package must exist on npm before creating its trust relationship. For each missing package, use [staged publishing](https://docs.npmjs.com/staged-publishing/) with npm >= 11.15 and a maintainer's local npm login. Stage a tarball from a temporary copy with a **distinct prerelease version**, for example `0.1.0-bootstrap.0` for a planned stable `0.1.0`:
   ```sh
   npm stage publish /absolute/path/to/bootstrap.tgz --tag bootstrap --access public --ignore-scripts --registry=https://registry.npmjs.org
   ```
   Leave it unapproved if npm exposes package settings and permits trust setup with the staged package. If npm does not, stop and confirm the registry's current first-publication process before separately authorizing any public bootstrap. Do not stage the stable release tarball or put maintainer credentials in Actions. After the real stable release succeeds, reject any unused staged bootstrap.
3. In **each package's** npm Settings → Trusted publishing → GitHub Actions, set:
   - Owner: `Monkeyman520`
   - Repository: `pi-toolkit`
   - Workflow filename: `release.yml` (not a directory path)
   - Environment name: leave blank; the workflow has no GitHub Environment.
   - If shown, allow direct `npm publish`, not staged-only publication.

See [npm Trusted Publishing](https://docs.npmjs.com/trusted-publishers/) and [npm trust prerequisites](https://docs.npmjs.com/cli/v11/commands/npm-trust/). The repository manifest metadata and workflow filename must match the trust record. This workflow does not use a stored npm token.

## Prepare and publish a stable version

1. Choose a new version higher than the current stable release. Update each public package manifest to that version, refresh `bun.lock` with `bun install --lockfile-only`, and add a matching heading such as `## [0.1.0]` plus release notes to root `CHANGELOG.md`. Each bundle copies it to `dist/CHANGELOG.md` and declares it via `pi.changelogPath`. Pi can show **Extension Updates** on a fresh launch after an update. GitHub Release notes are generated separately.
2. From the repository root, use Node 24, npm 11 and the pinned Bun version. Move any prior `dist/release/` aside first; packing intentionally refuses a nonempty output directory. Replace the example tag with the intended version:
   ```sh
   node scripts/release.ts validate v0.1.0
   bun install --frozen-lockfile
   bun run check
   bun run typecheck
   bun run build
   bun run test
   node scripts/release.ts pack v0.1.0
   node scripts/release.ts verify v0.1.0
   ```
   These commands do not publish. Inspect the tarballs and complete npm trust setup before creating a tag.
3. Commit and review the prepared revision. Only when intentionally releasing, tag that revision and push the specific tag. For example:
   ```sh
   git tag -a v0.1.0 -m "Release v0.1.0"
   git push origin v0.1.0
   ```
   Watch **Actions → Stable release**. Finish or resolve this release before pushing another release tag; different tags are separate workflow runs.

## Recovery

- **Validation failed:** No publish job runs. Inspect the diagnostic and fix the release inputs. A rerun still uses the original tagged revision; do not force-move a release tag.
- **Missing trust or partial npm publication:** Check the failing package's trust and npm registry state. npm versions are immutable. Retry the failed job for the same tag after resolving the issue; it skips exact versions already published and rechecks that `latest` matches. Registry errors are not treated as absence. If npm is still processing an upload after the polling timeout, confirm its status before retrying. Do not rerun an older release after a newer release has moved npm `latest`.
- **GitHub upload or finalization failed:** Retry the publish job. It resumes the same release and keeps matching assets by SHA-256, replacing an incomplete or mismatched same-name asset without duplication. A new release remains a draft until its attachments are ready.
- **Artifacts expired:** Archives are retained for seven days. Prefer **Re-run failed jobs** while the original artifacts exist. If artifacts are gone, rerun all jobs to rebuild and revalidate the original tag. If some versions are already on npm, compare the rebuilt archives with the published registry integrity before resuming; mere version existence does not prove byte equality.

npm publication and GitHub Release completion are not an atomic operation. A failed run can leave some npm packages published or a GitHub draft. Offline tests and local packs verify the contracts, not GitHub-hosted execution, npm ownership, live OIDC, or Pi updates from the live registry.

## Opt in ACO

When approved for public release, give `packages/pi-context-aco/package.json` the public identity `@monkeyman520/pi-context-aco`, remove its private flag and add matching public metadata, then add its directory to `packageDirectories` in [scripts/release.ts](../scripts/release.ts). Apply the same version, changelog, package verification and individual npm setup to it. Do not add `pi-plugin-support` to that catalog.
