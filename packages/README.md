# Package Development Reference

This directory holds independently installable plugins for the [pi-packages collection](../README.md). Current packages are [pi-auto-resume](./pi-auto-resume/README.md), [pi-pretty-session](./pi-pretty-session/README.md), [pi-quota-keeper](./pi-quota-keeper/README.md), and [pi-context-aco](./pi-context-aco/README.md) (passive monitoring, explicit local evidence recovery and recovery-gated exact pruning; confirmed/scoped-authorized extractive/native compaction; no delegation). The ordinary [pi-plugin-support](./pi-plugin-support/README.md) library supplies shared configuration/discovery/TUI mechanisms; it is not an activated Pi plugin. The reference fragments below describe the plugin baseline; each package README documents its actual setup and verified commands.

Follow [AGENTS.md](../AGENTS.md), [ADR 0001](../.grimoire/adr/0001-independently-installable-pi-packages.md), and [ADR 0002](../.grimoire/adr/0002-typescript-esm-plugin-development-stack.md) when adding or changing packages. Use English for package documentation and written project guidance.

## Package ownership and layout

```text
packages/<plugin-name>/
├── package.json
├── tsconfig.json
├── README.md
├── extensions/
│   └── index.ts       # Main TypeScript extension entry
├── skills/            # Optional skill documentation and scripts
└── prompts/           # Optional /name Markdown prompt templates
```

Each plugin owns its manifest, TypeScript configuration, extension resources, runtime requirements, README and lifecycle. The ordinary support library has source exports under `src/` and no Pi resource directories. [ADR 0005](../.grimoire/adr/0005-versioned-plugin-support-library.md) permits explicit shared-library dependencies without direct sibling-plugin source imports or shared runtime ownership. Keep optional resource directories absent until used. Pi also supports themes, but theme resources are not required by this package baseline.

A package must work without undeclared sibling source code or an incidental shared dependency instance from the development checkout. Declare and distribute any actual runtime dependencies rather than assuming that repository membership makes them available.

## Manifest and checks

These JSON examples are **reference fragments**, not complete installable packages. Supply real metadata, select compatible development dependency versions, and include only resources and host peers that the package actually uses. No package or publication identity is reserved by these examples.

A package's ESM metadata, Node.js baseline, and separate development checks:

```json
{
  "type": "module",
  "engines": {
    "node": ">=22.19.0"
  },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "check": "biome check .",
    "test": "vitest run"
  }
}
```

TypeScript (at least 5.8 for `erasableSyntaxOnly`), Biome (`@biomejs/biome`), and Vitest are development tooling. Make them available through the package's documented development setup; they are not extension runtime dependencies. Use the selected package manager's script runner to invoke these scripts. Current real packages use package-local npm lockfiles and development tooling; there is no root workspace runner.

### Host-provided dependencies

The following is a reference peer set; remove unused entries:

```json
{
  "peerDependencies": {
    "@earendil-works/pi-coding-agent": "*",
    "@earendil-works/pi-agent-core": "*",
    "@earendil-works/pi-tui": "*",
    "typebox": "*"
  }
}
```

Pi supplies these modules to extensions. Keep used host modules in `peerDependencies` with `"*"` ranges, not runtime `dependencies`, and do not bundle duplicate host implementations. Use TypeBox through `typebox`, not a replacement schema library inferred from another project.

Put other packages imported at runtime in `dependencies`. Managed npm/git installations prepare declared runtime dependencies; local packages are not installed or modified by Pi. Required types and test imports must be resolvable through the documented development setup. Development copies needed for checks do not change the host-owned runtime boundary.

A wildcard peer range follows Pi's loading contract; it is not evidence that every host version has been tested. State actual compatibility and any required host APIs in the package README.

## Resource discovery

Pi supports **either** conventional resource discovery **or** explicit package-relative entries in `package.json`'s `pi` field. The repository does not require both.

- Without a `pi` manifest, conventional directories expose extensions, skills, Markdown prompts, and JSON themes.
- For an explicit extension entry, merge the following fragment into the real package manifest:

```json
{
  "pi": {
    "extensions": ["./extensions/index.ts"]
  }
}
```

When using an explicit manifest, list each additional resource type that the package actually provides, using documented paths/globs. Do not advertise nonexistent optional directories or rely on an undocumented partial-manifest fallback. Skills live under `skills/`; prompt templates under `prompts/` are Markdown expanded through `/name`.

The collection root is not a recursive package loader. Document how Pi discovers the selected package's actual resources, and verify that unrelated sibling plugins do not load as a side effect.

## TypeScript configuration

This is a reference `tsconfig.json` for the extension entry and other TypeScript files under `extensions/`. Add test or helper paths if they live elsewhere. A package may extend shared settings later while retaining the effective ESM, no-emit, and erasable-syntax requirements.

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noEmit": true,
    "erasableSyntaxOnly": true,
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true
  },
  "include": ["extensions/**/*.ts"]
}
```

Use `import type` for type-only imports. With this configuration, relative TypeScript imports can use explicit `.ts` extensions. `allowImportingTsExtensions` is compatible with the no-emit workflow; no output rewriting or bundler is needed.

Erasable syntax excludes constructs requiring TypeScript runtime code generation, such as enums and constructor parameter properties. The compiler must reject them during type checking. A successful `tsc --noEmit` run neither executes tests nor proves that Pi can load the package.

## Package README contract

Each real package's README must provide:

- Purpose, user-facing behavior, and exposed resources/entry points.
- Supported Node.js baseline, applicable Pi host version/API requirements, and honestly stated tested compatibility.
- Package-specific dependency setup, installation, usage, and any configuration.
- Separate type-check, Biome, and Vitest instructions using the package's actual setup.
- A Pi loading/usage smoke check and its expected observable result.
- Permissions, external access, and other relevant risks. Extensions run with the Pi process's privileges, not in a sandbox.

Use the [collection installation examples](../README.md#installation-model) only after a real package exists, and substitute its real path. If publication is added later, document only verified publication names and sources.

## Verification when a real package exists

1. Prepare the package's documented development setup on Node.js >= 22.19.0.
2. Run its type-check script: `tsc --noEmit` must cover relevant sources, reject non-erasable syntax, and emit no JavaScript.
3. Run its Biome check and Vitest tests separately. Document expected coverage; an empty test suite is not a passing plugin test.
4. From an environment without sibling packages, load the selected package through Pi using its documented local setup. Confirm the expected entry/resources and behavior without a bundling/build prerequisite or unintended sibling activation.
5. Confirm that required dependencies resolve as documented and that optional resources, compatibility claims, and permission disclosures match the package.

Use Pi for runtime verification. Direct `node extensions/index.ts` execution does not establish Pi's resource discovery or host module mapping.

Real plugin sources and package-specific checks now exist in `pi-auto-resume/`, `pi-pretty-session/`, `pi-quota-keeper/`, and `pi-context-aco/`. Their READMEs distinguish controlled Pi runtime smoke evidence from unperformed live-service, physical sleep/wake, forecast-quality and later-stage checks.

## Official references

These are platform/tool contracts, distinct from this repository's chosen layout and stack:

- [Pi package discovery, installation, and dependency ownership](https://pi.dev/docs/latest/packages)
- [Pi extensions and permissions](https://pi.dev/docs/latest/extensions)
- [TypeScript erasable syntax](https://www.typescriptlang.org/tsconfig/erasableSyntaxOnly.html)
- [TypeScript NodeNext modules](https://www.typescriptlang.org/tsconfig/module.html#nodenext)
- [TypeScript imports with TypeScript extensions](https://www.typescriptlang.org/tsconfig/allowImportingTsExtensions.html)
- [TypeScript verbatim module syntax](https://www.typescriptlang.org/tsconfig/verbatimModuleSyntax.html)
- [Biome check](https://biomejs.dev/reference/cli/#biome-check)
- [Vitest CLI and single runs](https://vitest.dev/guide/cli.html)