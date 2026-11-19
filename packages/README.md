# Package Development Reference

This Bun workspace contains the independently installable Pi extensions listed in the [package catalog](../README.md#package-catalog). The root is not a Pi package. Each extension owns its own manifest, resources, configuration and runtime lifecycle.

## Workspace and build

Use Bun 1.4.4, Node.js >= 22.19.0 and Git. From the root:

```sh
bun install --frozen-lockfile
bun run check
bun run typecheck
bun run build
bun run test
```

Biome and TypeScript settings are shared at the root. Packages extend `tsconfig.base.json`; `tsc --noEmit` checks strict, erasable TypeScript ESM without producing JavaScript. Rolldown separately bundles each plugin's `extensions/index.ts` to `dist/index.js`. The root test script runs its own tests and then runs Bun tests sequentially in the individual package directories.

## Package contract

- Each plugin has its own `package.json`, README, and explicit Pi resources. Ship `dist/`, the README and applicable assets. The manifest declares `pi.extensions: ["./dist/index.js"]` and `pi.changelogPath: "./dist/CHANGELOG.md"`. The build copies the root MIT license and changelog into `dist/`.
- Keep used Pi SDKs and `typebox` in `peerDependencies` with `"*"` ranges and outside the bundle. A wildcard is the host's resolution convention, not a compatibility guarantee. Declare any other external runtime modules in `dependencies`.
- Where used, resolve private `pi-plugin-support` during development and inline it at build time. Do not add it as a runtime dependency or use undeclared sibling imports. Plugins communicate through the shared event protocol without depending on shared runtime state.
- A built standalone package must load in Pi outside the workspace. Verify the actual package with its documented smoke test and record the tested host/platform. Never infer runtime behavior from a typecheck alone.

## Install and update

The [release guide](../docs/releasing.md) lists the five public release identities under `@monkeyman520/*`. After a package is available on npm, install it unpinned (for example, `pi install npm:@monkeyman520/pi-auto-resume`). Use `pi update --extensions` or `pi update npm:@monkeyman520/pi-auto-resume`; pinned versions stay fixed. The workspace root, support library and experimental ACO package are not part of the initial public release.

For a local checkout, build first and then point Pi at the individual package directory. Pi does not prepare dependencies for a local path. npm consumers install the built artifact and do not need Bun or Rolldown. See each package's README for commands, host requirements and permissions.

## References

- [ADR 0001: independent installation](../.grimoire/adr/0001-independently-installable-pi-packages.md)
- [ADR 0008: Bun workspace and build stack](../.grimoire/adr/0008-bun-workspace-rolldown-and-bun-test-stack.md)
- [Pi package discovery, updates and dependencies](https://pi.dev/docs/latest/packages)
- [Pi extensions and permissions](https://pi.dev/docs/latest/extensions)
