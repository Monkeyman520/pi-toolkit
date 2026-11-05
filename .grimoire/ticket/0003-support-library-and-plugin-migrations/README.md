# Support Library and Independent Plugin Migrations

**Source:** [Spec 0006](../../spec/0006-versioned-support-library-and-plugin-migrations.md); [ADR 0005](../../adr/0005-versioned-plugin-support-library.md).
**Ticket folder:** `.grimoire/ticket/0003-support-library-and-plugin-migrations/`
**Baseline:** `main` at `a598454`.
**Status:** Done — implemented and verified after explicit grimoire-loop invocation (2026-11-04).

## Overview

Deliver the original F3, F1/F6, F5, F2 and F4 structural outcomes using an ordinary versioned support library. Preserve independently installable plugins, instance-owned lifecycles, existing behavior, and quota's cross-process maintenance boundary.

The library is not a fourth activated Pi plugin or collection manager. Consumer adapters retain domain policy; common mechanisms are actually shared rather than copied into three library subfolders. Tests support, but do not substitute for, the structural outcomes.

## Confirmed Scope and Authority

- The user selected ordinary library dependencies and Spec → tickets. All contracts derive from Spec 0006 and its U1–U3/source links.
- This refinement may write context, ADRs, specs and tickets only. It does not implement, install dependencies, run QA, publish, commit, push or modify personal Pi settings.
- Exact package names, initial version, compatible ranges, export signatures and distribution source remain bounded implementation choices under R1, not presumed registry/publication facts.
- The dependency must be available independently of the checkout. A registry choice requiring credentials/publication is a concrete execution prerequisite, not implicit authorization. Locally prepared versioned distribution artifacts may establish packaging/loadability without external publication.
- No unresolved product-behavior assumption is introduced. If execution finds a new semantic choice or a conflict with no-build/host-peer loading, return to clarification rather than weakening the independent-installation contract.

## Delivery Surfaces

| Surface | Ownership across this set |
| --- | --- |
| Ordinary support package and actual distribution exports | T0001 establishes package/loadability; T0002/T0003 supply reusable contracts |
| Common config I/O/change/persist and setting-definition support | T0002; each migration applies its own size/default/error/domain policy |
| Discovery event protocol and TUI shell | T0003; migrations keep session registration and business callbacks local |
| Auto-resume | T0004: manifest/dependency, config/metadata/completions, panel/discovery and recovery/lifecycle consumers |
| Pretty-session | T0005: the same shared mechanisms plus a cohesive local session/summary owner and its actual callers |
| Quota-keeper | T0006: shared config/panel/discovery while retaining Owner, account policy, state/ledger and wake-up behavior |
| Combined distribution, interaction and isolation evidence | T0007; package-level checks remain required in their migration tickets |

## Blocking Dependencies

| Producer | Consumer | Why consumer cannot be accepted first |
| --- | --- | --- |
| T0001 | T0002, T0003 | Mechanisms need the established ordinary package/export/host-peer and clean Pi load boundary |
| T0002 | T0004, T0005, T0006 | Consumer config/metadata migrations require the common mechanism's failure/validation/ownership contracts |
| T0003 | T0004, T0005, T0006 | Complete consumer migrations require the shared discovery/shell contract |
| T0004, T0005, T0006 | T0007 | Full combined-distribution acceptance needs all three migrated consumers |

There is no dependency between T0002 and T0003, or among T0004/T0005/T0006. Isolated test preparation may precede producer completion; acceptance cannot claim an unverified prerequisite passed. The graph is acyclic.

## Coordination

| Tickets | Risk | Strategy |
| --- | --- | --- |
| T0002 / T0003 | Library exports, manifest, README and shared tests | Agree distinct configuration versus discovery/UI responsibilities; serialize common file edits or integrate isolated diffs before checking |
| T0004 / T0005 / T0006 | Shared API changes discovered by a consumer | Route a semantic/API change to the owning producer; do not fork the common behavior or copy sibling source |
| Consumer tickets / T0007 | Root isolation fixture and collection/package references | Migrations own their package tests/docs; serialize integration-matrix and collection-wide writes |
| All | Tests passing in checkout while packaged source/peer resolution fails | Keep outside-checkout real Pi evidence at the package and combined gates |
| All | Invalid-config policy or task/owner state accidentally generalized | Compare each consumer against the R3/R7/R8 contracts and actual baseline callers |

Parallel execution is an option only when separately authorized with explicit write isolation and integration ownership; this ticket set does not launch parallel writers.

## Recommended Order

1. T0001: prove ordinary-library distribution and real Pi source/peer loading.
2. T0002 and T0003: supply shared configuration/metadata and discovery/UI contracts; these may proceed independently with coordinated shared writes.
3. T0004, T0005 and T0006: migrate and verify consumers. Their default readable order is auto-resume → pretty-session → quota-keeper, but there is no artificial blocking edge between them.
4. T0007: inspect and verify the combined artifact/source result.

The original audit's F3-first rank is not a hard execution gate. Package feasibility precedes migrations because it is a real dependency, not because an audit severity estimate proves priority.

## Requirement Coverage

| Spec requirement | Producer / migration ownership | Combined evidence |
| --- | --- | --- |
| R1 ordinary dependency delivery | T0001; T0004–T0006 declare and resolve their actual dependency | T0007 / E1 |
| R2 instance-owned lifecycle | T0001–T0003 enforce library boundaries; T0004–T0006 own consumer resources | T0007 / E3, E5 |
| R3 shared config / distinct policy | T0002; T0004–T0006 policy adapters | T0007 / E2, E6 |
| R4 canonical definitions / completions | T0002; T0004–T0006 actual consumers | T0007 / E2, E4 |
| R5 discovery interoperability | T0003; T0004–T0006 session registrations | T0007 / E3 |
| R6 reusable panel shell | T0003; T0004–T0006 domain panels/actions | T0007 / E4 |
| R7 pretty-session state/task owner | T0005, including entry/summarizer/project/browser/display callers as needed | T0007 / E5 |
| R8 per-plugin behavior-preserving migration | T0004 auto-resume; T0005 pretty-session; T0006 quota-keeper | T0007 / E1–E6 |
| R9 structure/distribution/runtime evidence | Package checks in T0001–T0006; combined inspection/checks in T0007 | T0007 / E1–E6 |

## Original Finding Dispositions

| Finding | Required outcome and completion owner |
| --- | --- |
| F3 | One common configuration-mechanism implementation, distinct policies retained: T0002 + T0004–T0006 |
| F1/F6 | One shared event-protocol implementation; no global registry: T0003 + T0004–T0006 |
| F5 | Schema-based classification and canonical explicit metadata consumed by completions/panels: T0002 + T0004–T0006 |
| F2 | One common shell/theme/input/switcher implementation with plugin-owned actions: T0003 + T0004–T0006 |
| F4 | Cohesive package-local metadata/summary owner used by real callers, not a mechanical class move: T0005 |
| Integration | Structural inspection and isolated real Pi behavior evidence: T0007; existing passing baseline tests alone do not close any new ticket |

## Ticket Index

| Ticket | File | Outcome |
| --- | --- | --- |
| T0001 | [Establish the ordinary library package and distribution loadability](./T0001-support-library-package-and-loadability.md) | A versioned ordinary support package can be installed and loaded from a distribution artifact by real Pi outside the checkout, with the required host peers and without plugin activation or an emitted build. |
| T0002 | [Provide shared configuration mechanisms and canonical-setting support](./T0002-shared-configuration-and-setting-contracts.md) | Configuration I/O/change tracking and schema-aligned setting support have one reusable implementation with testable consumer-policy boundaries, not a universal plugin manager. |
| T0003 | [Provide the common discovery protocol and settings-panel shell](./T0003-shared-discovery-and-panel-shell.md) | Consumers can reuse one event-discovery implementation and one common panel shell while supplying domain-specific settings and actions. |
| T0004 | [Migrate auto-resume without changing recovery or session ownership](./T0004-auto-resume-library-migration.md) | An independently installed auto-resume uses the common configuration/discovery/panel mechanisms without changing recovery decisions or session-local controls. |
| T0005 | [Migrate pretty-session and concentrate session/summary ownership](./T0005-pretty-session-library-and-state-ownership.md) | An independently installed pretty-session uses shared mechanisms and a cohesive package-local owner for metadata and summary-task lifecycle/writeback. |
| T0006 | [Migrate quota-keeper while preserving single-owner maintenance](./T0006-quota-keeper-library-migration.md) | An independently installed quota-keeper reuses common config/discovery/panel mechanics without weakening ownership, credential or activation-ledger boundaries. |
| T0007 | [Verify combined distributions, compatibility and structural outcomes](./T0007-integrated-distribution-and-isolation-acceptance.md) | The combined result demonstrates actual reuse and independent installation/lifecycle behavior, rather than isolated unit-test success or claims based on checkout imports. |

## Completion Evidence

The tickets' acceptance checklists above remain the original contract; their Done statuses are supported by the integrated evidence below. The original refinement-only authority paragraph records the earlier stage; the subsequent explicit grimoire-loop invocation authorized this implementation and local verification, not publication or commits. Component renders, real Pi RPC, real terminal interaction, physical sleep/wake and live-provider checks are distinct evidence classes; unavailable evidence is not success. No automatic external publication is part of this set.

When implementation is authorized, invoke `grimoire-loop` with this README or a dependency-ready ticket. Keep the source spec, confirmed ownership boundaries and producer evidence in the handoff.


## Integrated Execution Evidence — 2026-11-04

Source: `main@a598454` plus this implementation's combined working tree. No commit, push, registry publication, personal Pi settings change or live provider request was performed. Verification environment: Windows x64, Node v26.13.0, npm 11.20.0, Pi 1.5.0.

| Contract / ticket | Implementation and final evidence |
| --- | --- |
| R1 / T0001 / E1 | Ordinary `packages/pi-plugin-support` source exports; exact consumer dependency `0.1.0`; only support included in npm `bundledDependencies`. Library archive smoke and complete plugin tarball installs outside the checkout passed real Pi loading with host peers and no emitted build. |
| R2 / T0001–T0006 / E3,E5 | No import-time resources/global registry/controller; explicit per-instance stores, caller-owned registrations and local SessionState. Lifecycle tests, seven combination matrix, separate physical library roots and three sessions per combination passed. |
| R3,R4 / T0002,T0004–T0006 / E2,E4 | One bounded JSON reader, atomic writer/reload store and schema-based candidate/boolean helpers; plugin schemas/defaults/error policy remain local. Config/candidate tests preserve presets, non-presets, bounds, fail-closed/keep-safe/reject behavior and persistence failures. |
| R5,R6 / T0003–T0006 / E3,E4 | One library discovery implementation and panel shell/theme/switcher; domain headers/items/actions remain local. Component tests, real terminal interaction and frozen baseline-reader interoperability passed. Thin `ui.ts` protocol re-exports retain current callers without duplicate implementation. |
| R7 / T0005 / E5 | `extensions/session-state.ts` owns session identity, metadata/native-name transitions, project cache acceptance, summary controllers and writeback; entry delegates actual callers. Deferred project/summary, reused context, manual-name and late rename-dialog tests passed. |
| R8 / T0004–T0006 / E1–E6 | All three standalone real Pi fixture smokes passed, including recovery bounds/stop, native session naming/manual locks, quota one-owner refresh, abrupt takeover, account pinning and no activation replay. Quota Owner/state/ledger remain local. |
| R9 / T0007 | Combined final type/Biome/Vitest checks passed in all four packages: support 8, auto-resume 37, pretty-session 40, quota-keeper 182 tests (267 total). Root scripts/fixture Biome checks, archive/source/installed-copy/lock-integrity parity, library smoke and all seven packaged-plugin combinations passed. |

Final commands: in each package, `npm run typecheck && npm run check && npm test`; additionally the three plugins' `npm run smoke`. From the repository root, `node scripts/package-support.mjs --check`, `node tests/support-library-smoke.mjs` and `node tests/plugin-isolation.mjs`, with `PI_BINARY` set to the installed executable. A fresh auto-resume `npm ci --ignore-scripts --legacy-peer-deps --offline --no-audit` followed by Biome also passed after repairing incomplete platform-optional dependency lock metadata.

### Distribution correction

A complete-plugin tarball install exposed npm ENOENT for nested `file:vendor/*.tgz` dependencies even though local extracted-directory setup worked. The delivered manifest uses an exact ordinary version plus npm `bundledDependencies` for only support; local lockfiles retain the shipped versioned archive. This is ordinary dependency packaging, not JavaScript bundling or bundled host SDKs. The actual plugin tarball installation matrix passed after this correction. No npm registry identity is claimed.

### Real terminal evidence (not mocked rendering)

Agent-driven Windows Terminal keyboard interaction against an isolated Pi process with empty auth verified:

- auto-resume settings persisted `enabled=false`; stop and reload displayed their real feedback;
- its loaded-only switcher opened pretty-session; pretty-session persisted `showWidget=false`, search selected Reload Config and reload completed;
- quota settings persisted `mode=fixed`; owner refresh displayed `Quota state refreshed.` and config reload completed with no accounts or live service requests;
- Escape returned to the editor; Tab completed `/auto-resume config maxA` to the full-prefix `maxAttempts`, and executing value 4 persisted it;
- Ctrl+D exited orderly and the fixture recorded clean shutdown.

Temporary screenshots and config readbacks were inspected during the session; images are not committed. This is agent-driven real terminal interaction, not a human approval or unattended provider exercise. The terminal target used the same shared shell/config code; subsequent adjacent stale-callback fixes were covered by final lifecycle and standalone smoke checks.

### Review, fixes and retained boundaries

Actual shared sources, consumer adapters/callers, new tests, manifests, distribution archives and the combined diff were inspected. Two concrete lifecycle defects were reproduced before fixes: late auto-resume startup created duplicate timers/registrations, and an old pretty-session rename dialog could modify a replacement session. Generation guards now prevent both; regression tests and final checks pass. No confirmed blocking finding remains in the scoped result.

Retained private code is domain-owned: setting schemas/descriptions/presets, command grammar/error text, per-account submenu items, plugin-specific headers/actions, Recovery, pretty-session summary semantics and quota ownership/ledger/credential handling. These are not copies of the extracted file/discovery/panel mechanisms. There is no LOC or performance acceptance claim.

Other operating systems, minimum-Node runtime execution, physical sleep/wake, live OAuth and authenticated provider acceptance remain unverified and are not represented as passed. Those are outside this migration's selected runtime evidence, not waived checks for its library/consumer contracts.
