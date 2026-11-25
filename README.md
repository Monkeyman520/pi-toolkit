# pi-packages

A personally developed and maintained collection of independently installable plugins for **Pi coding agent**.

This repository organizes Pi plugin packages; it is not the Pi host's source tree or a standalone application. Documentation and written project guidance use **English**.

## Package catalog

| Package | Purpose |
| --- | --- |
| [pi-auto-continue](./packages/pi-auto-continue/README.md) | **Private (initial).** Explicitly armed multi-round continuation, FIFO continuation queue (`send`/`steer`, multiline editor, import, quota-reset waiting), prompt pipe with format extraction, and one-shot stop hooks |
| [pi-auto-resume](./packages/pi-auto-resume/README.md) | Configurable recovery of interrupted Pi tasks |
| [pi-pretty-session](./packages/pi-pretty-session/README.md) | Automatic session naming, title/description summarization, dynamic config, session metrics, and project info |
| [pi-quota-keeper](./packages/pi-quota-keeper/README.md) | Coordinated account quota visibility and capability-gated activation |
| [pi-context-aco](./packages/pi-context-aco/README.md) | **Experimental — pending optimization and broader testing.** Passive pressure/task monitoring, recommendations, scoped local evidence checkpoints, bounded historical recall and recovery-gated exact pruning; scoped extractive/native compaction with confirmation or explicit authorization; bounded authorized V4 independent children with parent-verified staged deliverables |
| [pi-session-tree-explorer](./packages/pi-session-tree-explorer/README.md) | Interactive session tree navigation and inspection |
| [pi-prompt-pipeline](./packages/pi-prompt-pipeline/README.md) | Conditional system-prompt transformations and one-shot agent/request boundary exports |

Built plugins have controlled Pi 1.5.2 loading/usage smoke evidence on Windows. [Pi Plugin Support](./packages/pi-plugin-support/README.md) is private and inlined, not an activated plugin. ACO is experimental and provides V1 observation/recommendations, V2 verified recovery/exact pruning, V3 bounded extractive/native compaction and V4 authorized independent children/staged results. Its default observe mode never executes strategies; V3/V4 require separate scoped authority and safety checks. Live subscription quota access/activation and physical sleep/wake remain unverified; see each README. Completed ACO tickets and bounded tests are not a stable-release endorsement. Start with observation-only evaluation; do not adopt adaptive or context-changing automation by default, assume token/cost savings, or weaken safety checks to force an intervention.

## Installation model

Each plugin lives in `packages/<plugin-name>/` and owns its manifest, resources, and documentation. Select an individual package rather than installing the repository root as an all-plugins bundle.

Once available on npm, install the desired plugin without pinning a version. For example:

```sh
pi install npm:@monkeyman520/pi-auto-resume
pi update npm:@monkeyman520/pi-auto-resume
pi update --extensions
```

Pi can show **Extension Updates** from the bundled changelog on the next fresh launch. Pinned versions stay fixed. See the [release guide](docs/releasing.md) for the planned public catalog; experimental ACO stays private.

To use a local checkout, prepare it and build before installing:

```sh
bun install --frozen-lockfile
bun run --cwd packages/pi-auto-resume build
pi install ./packages/pi-auto-resume
```

Pi does not prepare dependencies for a local path.

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
    ├── pi-auto-continue/     # Explicitly armed continuation, queue, prompt pipe, and stop hooks (private)
    ├── pi-auto-resume/        # Interrupted-task recovery
    ├── pi-pretty-session/     # Session summarization, metrics, and project info
    ├── pi-quota-keeper/       # Quota visibility and coordinated activation
    ├── pi-context-aco/        # Passive context-pressure monitoring foundation
    ├── pi-session-tree-explorer/ # Interactive session tree
    ├── pi-prompt-pipeline/    # Conditional prompt transforms and boundary exports
    └── pi-plugin-support/    # Ordinary config/discovery/TUI support library
```

Existing development-tool configuration is omitted from this overview. Its presence does not change the repository's project category.

## Development baseline

Use Bun 1.4.4, Node.js >= 22.19.0 and Git. The private workspace shares one `bun.lock`, Biome and TypeScript configuration. Rolldown builds the individual Pi entry points, and the root test script runs Bun tests in each package directory.

```sh
bun install --frozen-lockfile
bun run check
bun run typecheck
bun run build
bun run test
```

Pi SDKs and TypeBox remain host peers. The private support library is inlined where used, not published as a dependency. See the [package development reference](packages/README.md) and [release guide](docs/releasing.md).

## Cross-plugin isolation verification

After the root frozen install and build, run from the repository root:

```sh
node tests/plugin-isolation.mjs
```

Set `PI_BINARY` to the actual Pi executable if needed (for example `$env:PI_BINARY = 'C:\path\to\pi.exe'` in PowerShell). The matrix requires Node.js >= 22.19.0, npm, installed Pi. npm may fetch the quota plugin's declared runtime dependency if it is not cached.

This development-only script covers the original three plugins (`pi-auto-resume`, `pi-pretty-session`, `pi-quota-keeper`), packing their tarballs into separate temporary consumers. It verifies all seven combinations and three session lifecycles per combination, with inlined support and a frozen baseline discovery reader. It uses isolated empty auth and no live provider/personal settings. Expected final output is `Pi plugin isolation matrix: all 7 combinations PASS`. ACO has its own outside-checkout control-provider smoke and actual ConPTY keyboard test; it is not silently included in this historical seven-combination claim.

The matrix has been verified on Windows with Pi 1.5.2. It complements, rather than replaces, each package's type checks, Biome checks, Bun tests, and provider-fixture smoke test. The matrix is not a real terminal test. Separate agent-driven Windows Terminal keyboard checks exercised the shared panels, config persistence/reload, actions, cancel/search/navigation, loaded-plugin switching, Tab completion and orderly exit. Physical sleep/wake remains unverified.

## Contributing

- Start with [AGENTS.md](AGENTS.md) and the [project context](.grimoire/CONTEXT.md).
- Read [ADR 0001: independent packages](.grimoire/adr/0001-independently-installable-pi-packages.md) and [ADR 0008: development stack](.grimoire/adr/0008-bun-workspace-rolldown-and-bun-test-stack.md) before changing package boundaries or stack constraints.
- Follow the [initialization specification](.grimoire/spec/0001-pi-plugin-collection-initialization.md) and the [package development reference](packages/README.md) when adding a package.
- Keep installation, usage, verification, and permission claims specific to the real package and its tested environment. Preserve the collection's identity instead of inferring an unrelated scaffold from generic directory names.

These explicit identity signals guide contributors and agents; they cannot guarantee the behavior of arbitrary external classifiers.

## Official references

Platform rules come from Pi documentation; independent package ownership and the development stack above are this repository's choices.

- [Pi packages: discovery, installation, and dependencies](https://pi.dev/docs/latest/packages)
- [Pi extensions: APIs and permissions](https://pi.dev/docs/latest/extensions)
