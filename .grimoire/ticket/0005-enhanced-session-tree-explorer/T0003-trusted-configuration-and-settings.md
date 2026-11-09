# Configure the Explorer through validated trusted layers and collection TUI

**Ticket ID:** T0003
**Source:** [Spec 0008](../../spec/0008-enhanced-session-tree-explorer.md) (R01, R13; configuration portion of R06/R11; R15; E06); sources U1/U2/U3 and repository/host contracts as cited there
**Status:** Done

## Goal

Users can discover, edit, reload and persist Explorer configuration safely through the collection's command/completion/settings conventions.

## Affected Surfaces

TypeBox defaults/schema, session-tree.schema.json, config loader/merger/reload, /stree subcommands/completions, SettingsList panel and pi.events discovery, README examples and tests.

## Approach

Implement the settled built-in/global/trusted-project/runtime precedence and whole-layer failure rules. Cover every configuration group in R13, not only currently rendered feature controls; later consumers use the same validated values. Preserve plugin-local ownership even if an explicitly declared support library supplies mechanisms. Coordinate keymap diagnostics with T0002 without making disk/schema work depend on the completed parser.

## Dependencies and Coordination

- **Blocked by:** T0001. See the relationship README for concrete producer reasons.
- **Blocks:** T0007, and integrated acceptance T0008.
- **Coordination risks:** T0002 owns runtime key sequence behavior; T0007 owns per-session view files. Share effective-config and diagnostic contracts, not a process-wide mutable manager. T0005/T0006 can use Spec defaults in fixtures while this ticket is developed.

## Acceptance

- [x] Extension-owned global session-tree.json and trusted-project .pi/session-tree.json are resolved through the host agent-directory/trust APIs, not treated as built-in Pi files.
- [x] All R13 configuration fields/defaults and Action binding arrays have TypeBox/schema coverage and exact field-path diagnostics; examples validate against the same contract.
- [x] Layers merge objects field by field and replace arrays, with runtime highest precedence. Tests distinguish whole-action-array replacement from appending default keys.
- [x] Malformed startup layers are wholly ignored with useful diagnostics while other valid layers survive; a failed reload retains the last valid effective configuration without partial changes.
- [x] Untrusted project configuration is not loaded. Config contains data only and cannot inject callbacks or code; reload cannot turn unsafe session actions into valid operations.
- [x] /stree follows /<extension> <action> [other-args]; each command/alias provides full-argument, multi-token completions for available subcommands and context-appropriate arguments.
- [x] /stree config opens an interactive settings panel in TUI mode, exposes live state and persists changes. Explorer provides a settings entry; non-TUI mode returns text rather than opening custom UI.
- [x] Installed-only panel discovery uses pi.events, does not hardcode siblings and keeps instances/lifecycle independent. A library dependency, if selected, is explicitly deliverable outside the checkout.
- [x] view.reloadConfig uses the same validated transaction and safety rules. Runtime overrides and temporary search data are not accidentally persisted as global defaults.
- [x] Pass typecheck/Biome/Vitest and actual Pi usage of command completions/settings/reload, documenting which host/UI observations were really performed.

## Out of Scope

Navigation algorithms, session mutations, search engine, historical estimates and per-session view-state persistence.

## Coordination contract

Consume settled requirements and established solution choices from the Spec. Organize and verify them; do not invent or revise domain facts, requirements, architecture, constraints or acceptance semantics. Return needed new material decisions to refinement/clarification. CONTEXT/ADR recording is separately unauthorized and Pending; it does not block this ticket set. This artifact is not permission to start implementation, QA, staging or committing. Specialists return at the selected Spec -> tickets endpoint.