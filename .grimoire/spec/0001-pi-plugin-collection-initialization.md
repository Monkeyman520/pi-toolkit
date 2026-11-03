# Pi Plugin Collection Initialization

**Spec ID:** 0001
**Status:** Draft
**Date:** 2026-11-03
**Endpoint:** Requirements specification only; implementation is not part of this refinement.

## Sources

- **U1 — Initial user request:** Initialize this personally developed Pi Agent plugin collection, research Pi plugin best practices online, and define README content and directory structure so later development does not mistake it for another project category.
- **U2 — Confirmed selection:** Independently installable plugins under `packages/<plugin-name>/`, each with its own manifest and README; generate a specification; English is the project language.
- **U3 — Confirmed development stack and layout:** TypeScript (ESM, erasable syntax), Node.js >= 22.19, Biome, Vitest, TypeBox (`typebox`), `tsc --noEmit` without a bundler, and the host-provided `@earendil-works/pi-coding-agent`, `@earendil-works/pi-agent-core`, and `@earendil-works/pi-tui` SDKs. Each plugin has `package.json`, `tsconfig.json`, and `extensions/index.ts`, with optional `skills/` and `prompts/`. Either conventional Pi discovery or explicit `pi` manifest entries is supported.
- **Established project concepts:** [Context](../CONTEXT.md).
- **Organizational choice:** [ADR 0001 — Independently installable Pi plugin packages](../adr/0001-independently-installable-pi-packages.md).
- **Development stack and package layout:** [ADR 0002 — TypeScript ESM plugin development stack](../adr/0002-typescript-esm-plugin-development-stack.md).
- **Existing repository guidance:** [AGENTS.md](../../AGENTS.md).
- **P1 — Official Pi package contract:** [Pi Packages](https://pi.dev/docs/latest/packages).
- **P2 — Official Pi extension contract and permissions:** [Extensions](https://pi.dev/docs/latest/extensions).

P1 and P2 were researched during refinement. The installed Pi 1.5.0 package documentation was also checked. U3 selects the SDK names and Node.js baseline; these sources do not establish an additional exact Pi host version requirement. The [TypeScript `erasableSyntaxOnly` documentation](https://www.typescriptlang.org/tsconfig/erasableSyntaxOnly.html) supports the syntax constraint in R6.

## Requirements

### R1. Unambiguous repository identity

The root README, root agent guidance, and Grimoire must consistently identify `pi-packages` as a personally maintained collection of plugins for Pi coding agent. They must distinguish this repository from the Pi host's source tree and from an unrelated application inferred from generic directory names or development-tool configuration. [U1, Context]

Agent guidance must tell future contributors to preserve that identity and consult the project's context, relevant ADRs, specifications, and the applicable Pi documentation before changing package boundaries. Existing CodeGraph, Grimoire, and Git commit guidance remains intact. [U1, AGENTS.md]

This is an explicit documentation and contributor-guidance contract. It does not promise that an arbitrary external classifier or model will never misclassify the repository. [U1]

### R2. English project language

Repository-maintained README files, agent guidance, context, ADRs, and specifications must use English consistently. This requirement selects the human language of project artifacts, not a programming language, package manager, or build system. [U2, Context]

### R3. Independent package organization

Plugin packages belong under `packages/<plugin-name>/`. Each real plugin package has its own `package.json` and README and constitutes a separate installation unit. Installing one package must not implicitly install or activate every sibling package. The repository root organizes and documents the collection rather than acting as a mandatory all-plugins installation bundle. [U2, ADR 0001]

An installed package must resolve its declared runtime requirements without relying on undeclared sibling code or an incidental shared dependency instance in the development checkout. [ADR 0001, P1]

### R4. Useful and truthful README content

The root README must provide: [U1, U2]
- The repository identity and English-language convention.
- The independent-installation model and a directory overview that explains collection-level versus package-level ownership.
- A package catalog or an explicit statement that no plugin packages exist yet; links must point to actual package documentation.
- Instructions explaining how to select and install an individual available package.
- Contributor entry points to agent guidance, project knowledge, and the official Pi documentation.

Each real plugin package's README must describe its purpose, exposed resources or entry points, installation, usage, host compatibility, verification, and relevant permissions or risks. Installation and verification guidance must match the package's actual resources and supported environment. [U2, P1, P2]

Examples must distinguish placeholders from working commands. Do not claim that an npm name is published, a plugin exists, compatibility was tested, or an installation succeeded without evidence. [U1, P1]

### R5. Evidence-based Pi packaging guidance

Development guidance must distinguish official Pi behavior from this repository's organizational choices: [U1, P1, P2]
- Pi packages can contain extensions, skills, prompt templates, and themes; a package need not contain all four.
- Resources may use Pi's documented conventional discovery layout or explicit package-relative paths in the `pi` manifest. Package documentation must make its entry points clear.
- Extension runtime dependencies belong in `dependencies`; host-provided packages belong in `peerDependencies` and must not be bundled as duplicate host implementations. Use the applicable host documentation when choosing names and ranges.
- Pi does not install or modify a local package's dependency tree; local development instructions must account for any required dependency setup.
- Pi extensions execute with the host process's permissions. Documentation must not present them as sandboxed.
- Pi's documented `pi install` and temporary `pi -e` workflows must be described accurately; examples must target an individual package, not assume recursive installation of this repository.

No generic web/application scaffold is justified merely because a package manifest or agent-tool configuration exists. [U1, Context]

### R6. Selected development stack and package baseline

The root development guidance and per-package conventions must reflect the following confirmed choices. Configuration provided by initialization must honor them; the empty collection must not invent a working plugin merely to demonstrate the stack. [U3, ADR 0002]

| Area | Required contract |
| --- | --- |
| Language and modules | TypeScript, ECMAScript modules, and erasable syntax; package metadata uses `"type": "module"` |
| Runtime | Node.js >= 22.19.0, expressed consistently in package runtime metadata and documentation |
| Type checking | `tsc --noEmit`; each plugin owns a `tsconfig.json` with effective `erasableSyntaxOnly: true` and no-emit checking |
| Code checks | Biome |
| Tests | Vitest |
| Schema library | TypeBox via `typebox` |
| Host SDK | `@earendil-works/pi-coding-agent`, `@earendil-works/pi-agent-core`, and `@earendil-works/pi-tui`, as needed by the package |
| Dependency ownership | Used host SDK packages and host-provided `typebox` are `peerDependencies` with `"*"` ranges, not runtime `dependencies`; local development setup must make required types and test imports resolvable |
| Extension entry | `extensions/index.ts` in each plugin package |
| Optional resources | `skills/` for skill documentation and scripts; `prompts/` for Markdown templates expanded through `/name` |
| Resource exposure | Conventional Pi discovery or explicit package-relative entries in the `pi` manifest; absent optional resources must not be advertised as existing |
| Build contract | Pi loads extension sources without a required bundler or emitted JavaScript build |

The compiler must support `erasableSyntaxOnly` (introduced in TypeScript 5.8). Enums, parameter properties, and other syntax requiring TypeScript runtime code generation are not part of the selected syntax subset. [U3, TypeScript option documentation]

Document type checking, Biome checking, and Vitest execution as separate checks. Development tooling must not become an extension's runtime dependency merely to make local checks work. Loading through Pi is the runtime acceptance path; direct `node extensions/index.ts` execution is not an equivalent proof of Pi resource discovery or host module mapping. [U3, ADR 0002, P1]

## Solution

### Directory and ownership contract

The initialized repository must expose the following logical layout. Existing tool configuration remains in place and is omitted from this view for clarity. [U1, U2, U3, ADR 0001, ADR 0002]

```text
pi-packages/
├── README.md
├── AGENTS.md
├── .grimoire/
│   ├── CONTEXT.md
│   ├── adr/
│   ├── spec/
│   └── ticket/
└── packages/
    └── <plugin-name>/          # One independently installable plugin package
        ├── package.json       # ESM metadata and package resource/dependency contract
        ├── tsconfig.json      # No-emit checking and erasable syntax
        ├── README.md
        ├── extensions/
        │   └── index.ts       # Main extension entry
        ├── skills/            # Optional skill documentation and scripts
        └── prompts/           # Optional Markdown prompt templates
```

`<plugin-name>` is an illustrative future package, not a requested demo plugin. When there are no real plugins, the initialization must make `packages/` discoverable in the tracked repository and explain its purpose without advertising an installable package. The exact directory-retention mechanism is incidental, not a separate architectural commitment. [U1, U2]

Root documentation owns the collection overview, package navigation, selected stack, and contributor orientation. Each package owns its manifest, TypeScript configuration, extension entry, resource documentation, installation guidance, compatibility claims, and permission disclosures. Optional resource directories are needed only when used. [U2, U3, ADR 0001, ADR 0002]

### Integration seams

| Seam | Connects | Expects | Provides |
| --- | --- | --- | --- |
| Project identity | Root README and AGENTS.md → Grimoire | Consistent English definitions and valid relative links | Contributors and agents can identify the repository and its boundaries |
| Package selection | Root README → individual package README | A real package path, or an honest empty catalog | A path to the selected package's installation and usage instructions |
| Package loading | Individual package → Pi host | Documented resource discovery, available declared dependencies, and an applicable host version | Only the selected package's intended resources are exposed |
| Installation guidance | Package README → user environment | Accurate source/path examples and dependency/setup caveats | Independent installation without assuming sibling packages are installed |
| Development checks | Package source/configuration → TypeScript, Biome, and Vitest | Selected erasable ESM conventions and resolvable development imports | Separate no-emit type checking, code checks, and test results |
| Host module ownership | Package imports → Pi-provided SDK and TypeBox | Declared host peers rather than duplicate runtime host implementations | Imports resolve through the host contract during Pi extension loading |

## End-to-End Tests

### New contributor identifies the repository
- **Given:** The initialized repository with its root documentation.
- **When:** A contributor reads README.md, then follows the agent and Grimoire links.
- **Then:** All three identify a personal Pi plugin collection, use English, explain independent package ownership, and do not direct the contributor to an unrelated application scaffold. Existing repository guidance is preserved. [R1, R2, R4]

### A contributor browses an initially empty collection
- **Given:** No real plugin has been implemented.
- **When:** The contributor reads the root README and inspects the tracked directory layout.
- **Then:** The package location and future package shape are clear, the catalog explicitly reflects the empty state, and no placeholder is presented as a working plugin or published npm package. [R3, R4]

### A user selects one real package
- **Given:** A real plugin package has subsequently been added.
- **When:** A user follows its documented setup and installation instructions in an environment without the repository's sibling packages.
- **Then:** Pi exposes the selected package's intended resources, its declared dependencies are available as documented, and unrelated sibling plugins are not implicitly installed or activated. This scenario applies when a real package exists; it is not a requirement to implement one during initialization. [R3, R5]

### A developer follows the packaging guidance
- **Given:** A contributor is preparing a new Pi plugin package.
- **When:** They follow the root guidance and linked official sources.
- **Then:** They can identify package ownership, resource discovery options, host-versus-runtime dependency rules, local setup responsibilities, and extension permission risks without treating repository preferences as Pi platform mandates. [R4, R5]

### A developer checks an extension package without a bundler
- **Given:** A real plugin package using the selected stack and documented development setup on a supported Node.js version.
- **When:** The developer runs the documented TypeScript, Biome, and Vitest checks and loads the package through Pi.
- **Then:** The checks cover the intended package sources/tests, TypeScript checking emits no JavaScript, and Pi can load the extension entry without a bundling/build prerequisite. Effective metadata and configuration declare ESM, the Node.js baseline, and erasable syntax. [R3, R6]

### A non-erasable construct is rejected
- **Given:** The selected compiler and the package's effective TypeScript configuration.
- **When:** An extension source introduces an enum or a constructor parameter property and the documented type check is run.
- **Then:** TypeScript reports the erasable-syntax violation without emitting JavaScript. This is a future verification scenario, not a claim that a compiler has been installed or run during refinement. [R6]

## Decisions and Traceability

| Choice | Source |
| --- | --- |
| Personal Pi plugin collection, not a different inferred project category | U1; Context |
| Independent installation under `packages/<plugin-name>/`, per-package manifest and README | U2; ADR 0001 |
| English project artifacts | U2; Context |
| Align README, AGENTS.md, and Grimoire identity guidance | Recommendation accepted through U2; U1 |
| Use official resource, dependency, and trust contracts rather than generic plugin assumptions | U1; P1; P2 |
| Produce one specification without ticket decomposition | U2; bounded initialization outcome |
| TypeScript ESM/erasable syntax, Node.js baseline, Biome, Vitest, TypeBox, and no-bundler/no-emit workflow | U3; ADR 0002 |
| Host-provided SDK names and peer dependency ownership | U3; ADR 0002; P1 |
| Per-package tsconfig and extensions/index.ts; optional skills/prompts; either discovery method | U3; ADR 0002 |

## Verification Boundaries and Unselected Choices

Specification verification consists of reading the complete contract, checking source and relative links, and confirming coverage of U1, U2, and U3. Later initialization must verify the actual documentation, tracked directory structure, selected stack/configuration, preservation of existing guidance, and absence of unsupported installation claims.

No runtime installation result is claimed by this specification. The runtime acceptance scenario is conditional on a real plugin existing.

The programming language, runtime baseline, quality tools, schema library, SDK names, and no-bundler type-checking workflow are selected by U3. This contract still does not select concrete plugin features, a workspace orchestration tool, a package manager, an npm scope, a publication target, exact dependency versions, or release automation. These choices are not blockers for documenting and initializing the agreed collection structure; consequential additional commitments require their own supported requirements or decision.

## Out of Scope

- Creating the initialized README, agent-guidance changes, package scaffolding, or production code during this refinement.
- Generating implementation plans or tickets; the selected endpoint is one requirements specification.
- Implementing a demo plugin, publishing packages, installing dependencies, changing agent registration or Git policy, or committing/pushing changes.
- A guarantee about the behavior of external repository classifiers.

These exclusions preserve the agreed refinement endpoint; README and directory initialization remain the downstream work described by this contract.
