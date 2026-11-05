# pi-packages

A personally developed and maintained collection of independently installable plugins for **Pi coding agent**.

This repository organizes Pi plugin packages; it is not the Pi host's source tree or a standalone application. Documentation and written project guidance use **English**.

## Package catalog

| Package | Purpose |
| --- | --- |
| [pi-auto-resume](./packages/pi-auto-resume/README.md) | Configurable recovery of interrupted Pi tasks |
| [pi-pretty-session](./packages/pi-pretty-session/README.md) | Automatic session naming, title/description summarization, dynamic config, session metrics, and project info |
| [pi-quota-keeper](./packages/pi-quota-keeper/README.md) | Coordinated account quota visibility and capability-gated activation |
| [pi-context-aco](./packages/pi-context-aco/README.md) | V1 passive pressure/task monitoring, protected references and explainable conditional recommendations |

The four plugins have controlled Pi 1.5.0 loading/usage smoke evidence. [Pi Plugin Support](./packages/pi-plugin-support/README.md) is their ordinary versioned dependency, not an activated plugin. ACO delivers controlled V1 observation/recommendations only; no strategy executes. Live subscription quota access/activation and physical sleep/wake remain unverified; see each README.

## Installation model

Each plugin lives in `packages/<plugin-name>/` and owns its manifest, resources, and documentation. Select an individual package rather than installing the repository root as an all-plugins bundle.

From this checkout, select one real package and follow its README. For example:

```sh
# Register only Pi Auto Resume in personal Pi settings.
pi install ./packages/pi-auto-resume

# Or try Pi Quota Keeper temporarily without changing settings.
pi -e ./packages/pi-quota-keeper
```

Pi does not install or modify a local package's dependency tree. Prepare any dependencies required by its README before loading it. Do not infer npm publication or host compatibility from a directory name.

Extensions run with the Pi process's operating-system permissions and can access files, credentials, prompts, and session data. Review a package and its permission disclosures before loading it. Project-local resources also follow Pi's project-trust rules.

## Repository layout

```text
pi-packages/
├── README.md                 # Collection identity and package navigation
├── AGENTS.md                 # Canonical contributor/agent guidance
├── GEMINI.md                 # Existing Gemini guidance, linked to AGENTS.md
├── .claude/CLAUDE.md          # Existing Claude guidance, linked to AGENTS.md
├── .grimoire/
│   ├── CONTEXT.md            # Project concepts and terminology
│   ├── adr/                  # Durable architectural decisions
│   ├── spec/                 # Requirements contracts
│   └── ticket/               # Reserved for separately requested tickets
└── packages/
    ├── README.md             # Package layout and development reference
    ├── pi-auto-resume/        # Interrupted-task recovery
    ├── pi-pretty-session/     # Session summarization, metrics, and project info
    ├── pi-quota-keeper/       # Quota visibility and coordinated activation
    ├── pi-context-aco/        # Passive context-pressure monitoring foundation
    └── pi-plugin-support/    # Ordinary config/discovery/TUI support library
```

Existing development-tool configuration is omitted from this overview. Its presence does not change the repository's project category.

## Development baseline

| Area | Project convention |
| --- | --- |
| Language | TypeScript, ESM, erasable syntax |
| Runtime | Node.js >= 22.19.0 |
| Code checks | Biome |
| Tests | Vitest |
| Schemas | TypeBox (`typebox`) |
| Type checking | `tsc --noEmit`, with `erasableSyntaxOnly: true` |
| Build | Pi loads extension sources; no bundler or emitted build required |
| Host SDK | `@earendil-works/pi-coding-agent`, `@earendil-works/pi-agent-core`, `@earendil-works/pi-tui` |

Host-provided SDK packages and `typebox`, when used, are peers rather than bundled runtime dependencies. See the [package development reference](packages/README.md) for manifests, TypeScript configuration, resource discovery, and verification guidance.

There is no root package manifest or workspace test/build runner. Each real package owns its npm lockfile, pinned development tooling, checks, and Pi smoke test; see its README. This does not establish a collection-wide workspace tool or publication scope.

## Shared support dependency

Each plugin declares `pi-plugin-support@0.1.0` and carries that ordinary package via npm `bundledDependencies`, without bundling host SDKs or activating any other plugin. Its local lockfile also resolves a shipped versioned archive for independent `npm ci` setup. No registry publication or required emitted build is assumed. See the [support-library development reference](./packages/pi-plugin-support/README.md) for APIs, ownership and archive refresh/check commands.

## Cross-plugin isolation verification

After preparing each package's documented development dependencies, run from the repository root:

```sh
node tests/plugin-isolation.mjs
```

Set `PI_BINARY` to the actual Pi executable if needed (for example `$env:PI_BINARY = 'C:\path\to\pi.exe'` in PowerShell). The matrix requires Node.js >= 22.19.0, npm, installed Pi, and the npm cache populated by package setup for the quota plugin's offline production-dependency installation.

This development-only script covers the original three plugins (`pi-auto-resume`, `pi-pretty-session`, `pi-quota-keeper`), packing their tarballs into separate temporary consumers. It verifies only the ordinary support library is bundled, all seven combinations and three session lifecycles per combination, separate library roots and a frozen baseline discovery reader. It uses isolated empty auth and no live provider/personal settings. Expected final output is `Pi plugin isolation matrix: all 7 combinations PASS`. ACO has its own outside-checkout control-provider smoke and actual ConPTY keyboard test; it is not silently included in this historical seven-combination claim.

The matrix has been verified on Windows with Pi 1.5.0. It complements, rather than replaces, each package's type checks, Biome checks, Vitest tests, and provider-fixture smoke test. The matrix is not a real terminal test. Separate agent-driven Windows Terminal keyboard checks exercised the shared panels, config persistence/reload, actions, cancel/search/navigation, loaded-plugin switching, Tab completion and orderly exit. Physical sleep/wake remains unverified.

## Contributing

- Start with [AGENTS.md](AGENTS.md) and the [project context](.grimoire/CONTEXT.md).
- Read [ADR 0001: independent packages](.grimoire/adr/0001-independently-installable-pi-packages.md) and [ADR 0002: development stack](.grimoire/adr/0002-typescript-esm-plugin-development-stack.md) before changing package boundaries or stack constraints.
- Follow the [initialization specification](.grimoire/spec/0001-pi-plugin-collection-initialization.md) and the [package development reference](packages/README.md) when adding a package.
- Keep installation, usage, verification, and permission claims specific to the real package and its tested environment. Preserve the collection's identity instead of inferring an unrelated scaffold from generic directory names.

These explicit identity signals guide contributors and agents; they cannot guarantee the behavior of arbitrary external classifiers.

## Official references

Platform rules come from Pi documentation; independent package ownership and the development stack above are this repository's choices.

- [Pi packages: discovery, installation, and dependencies](https://pi.dev/docs/latest/packages)
- [Pi extensions: APIs and permissions](https://pi.dev/docs/latest/extensions)
