# Versioned Support Library and Independent Plugin Migrations

**Spec ID:** 0006
**Status:** Implemented
**Date:** 2026-11-04
**Endpoint:** Requirements specification and linked ticket set only; no implementation plan or code execution.
**Baseline:** `main` at `a598454`.
**Ticket set:** [0003 — Support library and plugin migrations](../ticket/0003-support-library-and-plugin-migrations/README.md).

## Sources and authority

- **U1 — Original improvement outcomes, retained by the user:** F3 common configuration mechanisms; F1/F6 common UI discovery protocol; F5 schema-aligned configuration metadata and completions; F2 reusable settings-panel scaffolding; F4 explicit ownership of pretty-session state and summarization lifecycle.
- **U2 — Binding user constraint:** Plugins must remain independently installable and usable, with independent lifecycles. Reducing duplication must not introduce implicit sibling availability or shared mutable runtime ownership.
- **U3 — Confirmed refinement:** The user accepted option A, an ordinary versioned library dependency rather than synchronized plugin-local source copies, and selected Spec → tickets with explicit common contracts and per-plugin migration acceptance.
- **A1:** [ADR 0001 — Independent plugin installation](../adr/0001-independently-installable-pi-packages.md).
- **A2:** [ADR 0002 — Development stack and host peers](../adr/0002-typescript-esm-plugin-development-stack.md).
- **A3:** [ADR 0003 — Quota single ownership and takeover](../adr/0003-pi-hosted-single-owner-subscription-maintenance.md).
- **A4:** [ADR 0004 — Commands, TUI and dynamic discovery](../adr/0004-unified-command-grammar-and-dynamic-tui-configuration.md).
- **A5:** [ADR 0005 — Versioned support library](../adr/0005-versioned-plugin-support-library.md), the confirmed dependency-boundary revision.
- **S2/S3/S4:** Existing [auto-resume](./0002-pi-auto-resume.md), [quota-keeper](./0003-pi-quota-keeper.md), and [pretty-session](./0004-pi-pretty-session.md) behavior requirements.
- **S5:** [Unified commands and TUI settings](./0005-unified-commands-and-tui-settings.md), retained except for the blanket cross-package code restriction revised by A5.
- **P:** [Package development reference](../../packages/README.md) and installed Pi 1.5.0 [package documentation](https://pi.dev/docs/latest/packages): explicit runtime dependencies, separate module roots, host-provided peers, and local-package dependency preparation.
- **B:** Current configuration, command, UI and lifecycle sources under each package's `extensions/`, its tests/README, and [the real Pi isolation matrix](../../tests/plugin-isolation.mjs). These provide compatibility evidence, not authority to redefine user intent.

This document is a behavior-preserving structural contract. The initial audit's severity ranking and estimated LOC are not acceptance gates. The conservative pass already committed at the baseline does not satisfy the remaining extraction/migration outcomes.

## Requirements

### R1. Ordinary dependency delivery, not another Pi plugin

**Sources:** U2, U3, A1, A2, A5, P.

- The support library is an ordinary versioned package under `packages/` with its own manifest, exported API, README and development checks. It exposes no Pi commands, extension entry, skills, prompts, themes, or collection loader.
- Each migrated plugin declares its used library as a normal runtime dependency, with an explicit compatible version/source and corresponding package-local dependency metadata. It is not a host-provided `"*"` peer.
- A clean installation can obtain the declared dependency without the repository root, another plugin, undeclared sibling source, `workspace:`/repository-relative links, or incidental dependency hoisting.
- Installing the library does not install or activate the three plugins. Installing one plugin does not install or activate its siblings.
- Retain TypeScript ESM, erasable syntax, Node.js >= 22.19.0, TypeBox, Biome, Vitest and `tsc --noEmit`. Do not add a required bundler or emitted build. Used host SDK packages and `typebox` remain host-provided `"*"` peers in every package that uses them.
- Actual library exports, distributed sources and host-peer resolution must load through real Pi from outside the checkout. A source import that works only inside the repository is not evidence of distributability.
- Package identity, initial version, compatible ranges and registry/source are implementation choices, not reserved names or invented publication facts in this spec. The delivered manifests and documented preparation must make the selected source independently resolvable. Packaging/install/load proof may use locally prepared versioned distribution artifacts; it must not rely solely on linking a sibling checkout.
- External publication, registry ownership, credentials and changes to personal Pi settings are not authorized by this specification. If the chosen delivery requires them, report the concrete prerequisite before publication-dependent work. If no-build loading proves infeasible, report that conflict rather than silently changing A2.

### R2. Reuse implementation, preserve resource ownership

**Sources:** U2, A1, A3, A5, S2/S3/S4, B.

- Library imports do not register handlers, read plugin configuration, open sockets, start timers/watchers, access credentials, or perform provider requests. Explicit caller operations may perform the mechanism they request.
- Each plugin owns the instances, configuration paths, state transitions, controllers and cleanup associated with its work. The library does not select a plugin lifecycle or enforce a process-wide singleton.
- Register discovery only for a running session. Replacing a session does not accumulate registrations, terminal-input listeners, timers or pending work. Cleanup is idempotent and removes only the calling instance's resources.
- Stopping/removing one plugin does not stop another plugin, clear its state, or remove its discovery registration.
- Correctness does not depend on consumers resolving the same physical library instance. Library compatibility and event-protocol compatibility are explicit contracts, not module-identity assumptions.
- Quota polling, cross-process ownership, credential resolution and activation ledger semantics stay in quota-keeper. Unrelated task continuation remains session-local.

### R3. Common configuration mechanisms with distinct policies

**Sources:** U1/F3, U2, A3, A5, S2/S3/S4, B.

The shared implementation owns the common configuration-file mechanisms used by the consumers: bounded JSON input, validation integration, loading/change detection where used, and temporary-file/rename persistence. Thin plugin adapters are allowed for domain policy and existing command results. Copying the same mechanism behind three forwarding wrappers does not satisfy F3.

- Operations accept the caller's explicit target, schema/default inputs, size limit and necessary policy inputs. No universal context object may absorb plugin state, owner election or host command dispatch.
- Callers can distinguish absence, valid data, invalid data and I/O failure sufficiently to retain their existing policies. Parsing and schema validation remain authoritative; presentation candidates are not validation.
- Preserve persisted formats, configuration names/locations, existing merge semantics, command result/error behavior, permissions and atomic replacement. An unsuccessful write must not be reported as a successful durable save. Do not invent rollback, locking, cross-process merge or exactly-once guarantees.
- Preserve forced reload, same-mtime/content change detection and error-notification behavior where those are part of the current consumer. Do not add a quota config watcher or change polling cadence merely to make all consumers look alike.
- Shared persistence writes only the requested configuration file and its temporary files. It must not accidentally handle quota state/ledger or credential files as ordinary user settings.

| Consumer | Missing configuration | Invalid/unreadable configuration | Retained mechanism details |
| --- | --- | --- | --- |
| auto-resume | Defaults | Fail closed: recovery disabled and existing error feedback retained | 1 MiB limit; per-instance reload/error tracking; persisted partial settings; session-only on/off remains session-only |
| pretty-session | Defaults on file reload | Retain previous safe configuration and existing error feedback | 1 MiB limit; per-instance reload/error tracking; partial settings; model-default clearing and aliases retained |
| quota-keeper | Defaults with independent account arrays/maps | Config read/update rejects; maintenance pauses rather than accepting invalid settings | 2 MiB limit; existing owner-coordinated reload/polling; account/model/window mutations remain domain policy |

The quota panel's display of previously cached values after a read failure is not permission to resume maintenance or rewrite corrupt state. Preserve corruption refusal and activation no-replay outside the shared config layer.

### R4. One configuration-definition source per setting

**Sources:** U1/F5, A2, S5, B.

- Each plugin has a canonical definition of its settings sufficient for schema-aligned parsing, descriptions, defaults and suggestion/panel candidates. Library mechanisms may consume those definitions; the library must not hardcode the three plugins' setting catalogs.
- Derive type/constraint classification from TypeBox schema information rather than parallel manually maintained boolean/integer key lists.
- Human descriptions, useful numeric presets and dynamic model/account/window candidates remain explicit metadata or providers where they cannot be inferred. They need not be fabricated from numeric bounds.
- Completions and panels consume canonical metadata instead of maintaining competing copies. Presentation-specific labels, aliases and alternate forms such as auto-resume's on/off panel row remain allowed.
- Preserve configuration keys, defaults, aliases, candidate ordering, filtering, display behavior and full-argument completion replacement, including `/ps` parity and dynamic provider/model filtering.
- Accept valid non-preset values and reject schema-invalid values as before. No schema broadening or implicit new configuration field is part of this refactor.
- Account maps and wake-up eligibility are quota domain data, not generic scalar setting rows.

### R5. Shared discovery contract with event-based interoperability

**Sources:** U1/F1/F6, U2, A4, A5, S5, B.

The protocol definitions and common discovery mechanism have one implementation in the library. Plugins retain only their identifiers, descriptions and session-owned registration wiring.

- Retain the event `pi-packages:ui:discover` and callback payload `register(descriptor)`.
- Descriptors retain `id`, `title`, `command`, `getSummary(): string` and `open(ctx): Promise<void>`. Runtime guards and collection/deduplication behavior must remain compatible with valid baseline descriptors.
- Discovery uses the caller's Pi event bus and the currently running registrations, not a global registry, library singleton, fixed sibling catalog or filesystem scan.
- Discover only loaded plugins, omit the calling plugin from its switcher, and show no dead switcher when no other plugin is loaded.
- Retain interoperability between migrated plugins and valid baseline protocol implementations during incremental migration. Supported compatible library copies must also interoperate without shared module identity; arbitrary incompatible major versions are not promised.
- Register/unregister ownership and invocation context remain explicit. Switching opens the target panel through its descriptor; it does not activate an absent plugin or transfer ownership of the source plugin.

### R6. Shared panel shell, plugin-owned actions

**Sources:** U1/F2, U2, A4, A5, S5, B.

- Reuse the common settings theme, container/border composition, settings-list input/render plumbing, and installed-plugin switcher mechanism from the library.
- Each plugin supplies its own header/status content, settings items and domain callbacks. The library must not import plugin sources, know account credentials, execute quota enable/disable policy, rename sessions, or own Recovery.
- Preserve list navigation/search, close/cancel behavior, viewport input, status feedback, reload and action rows, settings persistence, dynamic model/account/window selection, panel switching and non-TUI fallbacks.
- Every panel invocation has its own rendering/feedback state. A callback updates its invoking plugin through that plugin's own configuration/domain path, never an implicitly selected global plugin.
- Remove migrated duplicate private shell/discovery implementations and obsolete imports/registrations. Retaining thin domain-specific item builders or headers is not duplication of the common shell.

### R7. Explicit pretty-session state/task ownership

**Sources:** U1/F4, U2, A5, S4, B.

- A cohesive package-local owner concentrates metadata reconstruction/persistence, summary-task cancellation/result acceptance and the session identity needed by those invariants. Related project state belongs with that owner when needed for correct summary/writeback decisions.
- The extension entry adapts host events and commands to this owner instead of independently maintaining parallel metadata/controller state or repeating summary writeback sequencing.
- The owner is per plugin instance and not placed in the generic library. Its concrete class/function/file names are implementation details, not completion evidence.
- Preserve summary triggers, timeout/fallback, manual title locks, explicit summarize override, native name feedback suppression, branch reconstruction and metadata entry format.
- A canceled/superseded task or a result belonging to an obsolete session must not append metadata, rename the active session or overwrite the active session's associated state. Tree navigation, replacement, shutdown and existing manual-action cancellation paths remain covered.
- A mechanical move of the existing closure variables without consolidating these transitions does not satisfy F4. This is a structural result, not an arbitrary entry-file LOC target.

### R8. Consumer migrations preserve their public behavior

**Sources:** U1, U2, S2/S3/S4/S5, B.

| Consumer | Required migration outcome | Behavior that remains local/preserved |
| --- | --- | --- |
| auto-resume | Uses shared configuration, discovery and panel mechanisms plus canonical settings definitions | Recovery eligibility/delays/attempt limits; pending cancellation; on/off session override versus persisted config; no activation of idle/completed work |
| pretty-session | Uses shared configuration, discovery and panel mechanisms and the package-local owner from R7 | Naming/summary/manual-lock semantics, metrics, project information, browser actions, metadata persistence; both command aliases |
| quota-keeper | Uses shared configuration mechanisms, discovery and panel shell without generalizing its coordination model | Config account/model/window policy; one OS owner, owner-forwarded refresh, takeover, intent-before-side-effect and no replay; credential pinning and sanitized state |

Each plugin is independently installable and testable after its migration. Migrating one must not require another plugin to migrate at the same time. Old private implementations are removed after their consumers move; unexplained retained duplicates or forwarding layers require a scoped disposition, not an extraction-complete claim.

### R9. Verification and evidence distinguish structure from behavior

**Sources:** U1, U2, A1/A2/A3/A5, P, S5, B.

- Run separate type, Biome and Vitest checks for the library and each migrated package. A no-emit type check is not runtime evidence.
- Establish clean distribution/install/Pi-load evidence for the library and each plugin outside the checkout, with no undeclared dependency on the root or sibling source. For local Pi packages, prepare dependencies explicitly as documented; Pi does not install local dependencies automatically.
- Retain and adapt each plugin's real Pi fixture smoke check and the seven-combination isolation matrix. Cover all seven nonempty loaded-plugin combinations and repeated session replacement/shutdown; include mixed baseline/migrated protocol interoperability.
- Exercise the common TUI shell through configuration edit/reload, cancel/navigation, immediate actions and switching between loaded panels. Identify whether evidence uses component tests, automated real TUI interaction, or manual interaction; mocked renders alone do not prove real terminal interaction.
- Cover separate instances and separate physical library roots; cleanup must not depend on a shared singleton or erase another instance's listeners/state.
- Retain the quota two-process owner/takeover/no-replay evidence and pretty-session late-task writeback checks. Use fixtures rather than live user credentials or provider side effects.
- Inspect the combined implementation to establish actual mechanism reuse and state ownership improvement. Green tests alone do not prove removal of duplicate mechanisms.
- Documentation must distinguish verified environments from unperformed physical sleep/wake, live-provider and other-platform checks. Do not invent speed, memory, LOC or universal host-compatibility claims.

## Solution and integration contracts

Use a normal versioned support dependency with plugin-owned instances/adapters. This states the selected architecture, not a mandated implementation plan or invented API signature.

| Seam | Connects | Inputs and ownership | Required output/guarantee |
| --- | --- | --- | --- |
| Dependency delivery | Installed plugin → library distribution | Declared compatible dependency; actual available source/artifact; host peers | Outside-checkout Pi loading without sibling activation or a required emitted build |
| Configuration mechanism | Plugin policy adapter → library | Explicit path, size bound, TypeBox validation/default inputs and caller-owned tracking | Load/change/error information and requested atomic write; consumer retains missing/invalid/I/O policy |
| Setting definitions | Plugin schema/metadata → shared completion/panel consumers | Canonical keys/constraints, explicit descriptions/presets, dynamic candidate providers | Preserved valid candidates and full-prefix replacements without changing validation |
| Panel discovery | Session-owned plugin registrations ↔ caller event bus | Baseline callback/descriptor protocol | Only currently loaded descriptors, independent of library module identity |
| Panel shell | Plugin header/items/actions → library TUI mechanism | Current invocation context and plugin-owned callbacks | Common navigation/rendering/switcher, isolated panel state, no hidden domain mutation |
| Session ownership | Pi events/commands → pretty-session local owner | Session identity, project/metadata inputs, cancellation and persistence capabilities | One authority accepts or rejects summary writeback while respecting manual locks |
| Quota configuration apply | Quota panel/commands → quota domain → existing Owner | Validated config mutation and explicit owner refresh request | Existing single-owner scheduling and durable no-replay behavior, not a library scheduler |

## Representative end-to-end acceptance

### E1. Install and use just one plugin

- **Given:** A directory outside the checkout, one plugin distribution and its explicitly declared dependencies, and no sibling plugins.
- **When:** Dependencies are prepared as documented and real Pi loads that plugin; a user invokes its primary and configuration commands.
- **Then:** Only that plugin's commands/resources appear, its dependency loads, and ordinary command/TUI or non-TUI behavior works without the repository root or a manager plugin. Repeat independently for all three plugins. [R1, R2, R8, R9]

### E2. Preserve distinct configuration failure policy

- **Given:** Each migrated plugin with valid configuration, plus fixtures for missing, malformed, schema-invalid, oversized and unreadable files.
- **When:** Its existing reload or configuration-update path is exercised and valid data is later restored.
- **Then:** Its R3 policy, validation limits, current values, feedback and recovery behavior match the baseline; one plugin's failure does not change another's configuration or runtime state. Suggested and non-preset valid values remain accepted. [R2–R4, R8]

### E3. Discover and switch with independent library copies

- **Given:** Multiple plugins with independently resolved library copies, including a migrated plugin and a valid baseline descriptor implementation.
- **When:** A panel queries discovery and the user selects another loaded panel.
- **Then:** Loaded descriptors interoperate and the target panel opens; no absent plugin is displayed or activated, and source-plugin cleanup does not remove the target's registration. [R2, R5, R6]

### E4. Preserve panel actions and argument completion

- **Given:** Each migrated plugin running with its usual domain fixture state.
- **When:** A user accepts a multi-token completion, changes a setting, reloads, invokes an immediate action, cancels and reopens the panel.
- **Then:** The completed command retains its full argument prefix; values/actions reach the correct plugin, persistence and feedback work, navigation remains usable, and `/ps` and `/pretty-session` agree. [R4, R6, R8, R9]

### E5. Replace sessions while work is pending

- **Given:** Pending auto-resume recovery, an in-flight pretty-session summary, and quota maintenance under their own instances.
- **When:** Sessions are replaced or shut down, and an obsolete summary completes late.
- **Then:** Old listeners/timers do not accumulate, obsolete results cannot write into the active session, stopped recovery does not continue, and other running instances retain their own resources. [R2, R7–R9]

### E6. Retain quota ownership through refresh and takeover

- **Given:** Two real Pi fixture processes sharing an isolated account directory.
- **When:** A follower requests refresh and the elected owner subsequently exits or crashes.
- **Then:** Refresh runs through one owner, another eligible process takes over, and an already attempted activation cycle is not replayed. Configuration reuse does not alter account pinning, foreground transcripts or credential-free snapshots. [R3, R8, R9]

## Decisions, discretion and exclusions

- **Confirmed:** Ordinary versioned library dependency, not source synchronization, a Pi manager plugin or shared runtime singleton. [U3, A5]
- **Confirmed:** Preserve independent installation/lifecycles and consumer-specific policies. Library factories/classes do not own global plugin lifecycles. [U2, A5]
- **Confirmed:** Deliver all original structural outcomes, not tests alone. F4 is explicit package-local ownership rather than a mandated class or size reduction. [U1, U3]
- **Not assumptions:** Package names, export signatures, precise internal file layout, initial version, compatible dependency ranges and distribution source are not fixed here. Implementers may select them only within R1's dependency/stack/authority constraints; a material departure returns to clarification.
- **Excluded:** Host changes, a mandatory root workspace installation, emitted runtime build/bundling, new settings or changed command grammar, generic quota schedulers/credential managers, live provider requests, unapproved publication and unrelated cleanup.
- **Evidence boundary:** This refinement creates contracts only. Baseline tests and previous smoke results are not evidence that the proposed library exists or loads. The enabling ticket must establish feasibility before consumer migration can be accepted.
