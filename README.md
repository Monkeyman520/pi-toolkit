# pi-packages

A personally developed and maintained collection of independently installable plugins for **Pi coding agent**.

This repository organizes Pi plugin packages; it is not the Pi host's source tree or a standalone application. Documentation and written project guidance use **English**.

## Package catalog

| Package | Purpose |
| --- | --- |
| [pi-auto-resume](./packages/pi-auto-resume/README.md) | Configurable recovery of interrupted Pi tasks |
| [pi-pretty-session](./packages/pi-pretty-session/README.md) | Automatic session naming, title/description summarization, dynamic config, session metrics, and project info |
| [pi-quota-keeper](./packages/pi-quota-keeper/README.md) | Coordinated account quota visibility and capability-gated activation |

All packages have controlled Pi 1.5.0 loading/usage smoke evidence. Live subscription quota access/activation and physical sleep/wake remain unverified; see each README.

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
    └── pi-quota-keeper/       # Quota visibility and coordinated activation
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

There is no root package manifest or root test/build script. Each real package owns its npm lockfile, pinned development tooling, checks, and Pi smoke test; see its README. This does not establish a collection-wide workspace tool or publication scope.

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
