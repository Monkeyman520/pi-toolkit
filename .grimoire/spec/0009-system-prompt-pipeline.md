# Configurable System Prompt Pipeline

**Spec ID:** 0009
**Status:** Implemented — verified within the bounded scope; see [execution evidence](../ticket/0007-system-prompt-pipeline/verification.md).
**Sources:** Conversation contract below; local input prototypes `antigravity-prompt-compat.ts` and `dump-system-prompt.ts` (not distributed with this package); [package development reference](../../packages/README.md).

## Source and permission contract

The user requested a reusable extension derived from the two prototypes: conditional agent/request prompt transformations, multiple sections and actions, diagnostics, and prompt export. They accepted plugin-local before/after boundaries, Antigravity-only request support initially, global plus trusted-project configuration, an explicitly enabled compatibility preset, export disabled by default, command completion and a TUI configuration entry. They additionally requested command-triggered one-shot export and accepted reserving the next actual event, selecting agent or request, and exporting before only or before plus after without suppressing transformations. The selected endpoint is Spec followed by tickets, not implementation. In the final clarification, the user accepted global-then-project rule composition with project ID overrides, single-use capture attempts cleared on session change/reload, and the section-edge policy specified below.

Only this spec and its ticket set are authorized writes. CONTEXT/ADR recording is not authorized. New durable knowledge remains unpersisted outside these task artifacts. Existing working-tree modifications and prototypes must be preserved.

## Requirements

### R1 — Independent package and configuration

Deliver an independently installable Pi plugin under `packages/<plugin-name>/`, following [ADR 0001](../adr/0001-independently-installable-pi-packages.md), [ADR 0002](../adr/0002-typescript-esm-plugin-development-stack.md), [ADR 0004](../adr/0004-unified-command-grammar-and-dynamic-tui-configuration.md), and the boundary revision in [ADR 0005](../adr/0005-versioned-plugin-support-library.md). Use TypeScript ESM with erasable syntax, Node.js >= 22.19.0, Biome, Vitest, TypeBox, and `tsc --noEmit`; used host SDKs and TypeBox are host-provided wildcard peers. No bundler or emitted build is required.

Support global configuration and trusted-project configuration. Configuration includes ordered `rules`, `export`, and `logging`. File/script paths resolve relative to the configuration file declaring them, or may be absolute. Preserve that origin when configurations are combined. Do not automatically trust project files or execute untrusted scripts. Exact package name, command spelling, configuration filenames and reversible UI presentation are implementation details, not reserved public names here. Compose rules global first, then project: project rules with matching IDs replace their global counterparts; new project rules append in project order. The accepted global-then-project/ID-override contract takes precedence over an incompatible shared-library default.

### R2 — Rule selection

Each rule has an identifier, a `stage` (`agent` or `request`), `when`, ordered `targets`, and ordered `actions`.

| Condition | Required behavior |
| --- | --- |
| `when.providers` | Multiple provider identifiers; support `*` wildcard patterns, e.g. `["antigravity", "openai"]`. |
| `when.models` | Multiple model identifiers; support `*` wildcard patterns, e.g. `["gemini-*", "claude-*"]`. A bare prefix is not implicitly a wildcard. |
| `when.extensions` | `all`, `any`, and `none` pattern lists against observable extension provenance. |
| `when.customPrompt` | `true`/`false`; omission imposes no custom-prompt restriction. |

Observe extension commands using `pi.getCommands()`, filtering `source === "extension"`; use `sourceInfo.path`, `sourceInfo.baseDir` where present, and `sourceInfo.source`, not command names, as the matching evidence. Extensions without registered slash commands are not comprehensively detected. Explain this limitation, particularly that a negative observation is not proof of unloaded status. These conditions must not be represented as a security policy or exhaustive inventory.

### R3 — Agent and request boundaries

- `agent` operates at `before_agent_start` on the current chained system prompt, including previous handlers' changes.
- `request` operates at `before_provider_request` on the provider-built payload, initially only for Antigravity's supported payload format(s).
- `agent.before`, `agent.after`, `request.before`, and `request.after` denote this plugin's input and output at the respective hook, not global first/last states across extensions.
- Respect host handler load/registration ordering. Do not promise wrapping arbitrary plugins or enforce global ordering by private monkey-patching.
- Agent selection can match multiple providers/models; request modification initially requires an explicitly supported Antigravity payload shape. Unknown providers/shapes remain unchanged and diagnosable.
- Modify recognized system-instruction text only, preserving unrelated payload fields, non-text parts, user messages, and request metadata. Never recursively replace every string in a payload. Export must not falsely label an unsupported extraction as a successful prompt capture.
- The current host documentation, not an assumed legacy API, governs integration. `ctx.getSystemPrompt()` is not the final serialized provider prompt.

### R4 — Section selection

`targets` supports `intro`, `docs`/`doc`, `skills`/`skill`, `tools`, `rules`, `cwd`, `all`, and `tag:<custom-name>`.

`intro` is the prefix before the first top-level XML-style tag. Other sections match `<name>...</name>` and actions operate on inner text only. Retain the tags and unmatched content. `all` transforms the complete text. Targets execute in their array order, including when selections overlap. Do not treat arbitrary XML-like prompt text as permission to modify unrelated content. For a selected tag, process every matching top-level occurrence. Nested markup is part of the outer section's content and is not separately matched recursively. Missing targets are skipped. As confirmed during the follow-up bug repair, only outer section boundaries are structural: different-name tag examples inside them are opaque text, not recursively validated XML. Same-name nested tags are balanced to locate the outer closing boundary. Unmatched top-level closing tags or unclosed outer sections make that rule fail and roll back its prompt edits under R5. These are XML-style prompt sections, not a promise of full XML support.

### R5 — Ordered actions

| Action | Required contract |
| --- | --- |
| `literal` | Literal replacement of all occurrences; `firstOnly: true` replaces only the first. |
| `regex` | JavaScript regular expression and flags; standard replacement substitutions including `$1` and `$&`. |
| `removeLines` | Drop lines matched by the configured regular expression. |
| `prepend`, `append` | Insert text at the beginning/end of the selected section content. |
| `file` | Replace selected content with text read from a local UTF-8 file. |
| `script` | Dynamically import a local `.mjs` module; call its synchronous/asynchronous default export with `(text, context)` and require a string result. |

Script context exposes `{ provider, model, cwd, stage, ruleId, requestPath?, options }`. Request location is supplied when applicable. Scripts run through Node ESM `import()`, not a sandbox; they have the current user's permissions. Do not `eval` configuration or automatically download scripts. Never imply prompt rollback reverses script filesystem/network side effects.

Execute rules in `rules` array order, and targets/actions in their declared order. If a rule fails, discard that rule's prompt modifications, retain the prompt entering that rule, and continue without blocking the model request. Previously successful rules remain applied. Invalid regexes, missing files, import failures, script throws/rejections and non-string results require explicit failure coverage. This fail-open behavior is a compatibility/reliability policy, not a security gateway. Do not claim exception handling can preempt a script that never returns.

### R6 — Antigravity compatibility preset

Provide an explicitly enabled, not installation-default, preset with two `agent` rules scoped to provider `antigravity`, models `gemini-*`, and `customPrompt: false`:

1. In `intro`, replace `You are a coding assistant running inside pi, a coding agent harness.` with `You are a software engineering assistant.`
2. In `docs`, remove the `- When asked about: ...` documentation-index line, retaining other docs content.

Keep other Tools, Rules, Skills and CWD content unchanged. The prototypes inform the regression fixture, but the new independent rules need not reproduce the old script's combined format-guard transaction. The old prototype's comment about controlled tests is historical evidence only, not a new plugin runtime test or a guarantee that 429 responses are caused by prompt content. Verify the preset separately and do not promise universal Antigravity compatibility.

### R7 — Export and command-triggered one-shot capture

Configuration permits selecting `agent.before/after` and `request.before/after`. Export is disabled by default. When enabled, output goes to a user-directory location rather than the repository by default. Exported prompts can contain private context; explain file permissions and disclosure risks. Report actual output paths and distinguish stages and sides sufficiently to pair before/after from the same event.

Provide a command that arms one capture of the next actual event at a selected `agent` or `request` stage, with either:

- **before only:** export only the input system prompt; or
- **before + after:** export both sides of this plugin's processing for that event.

The command itself must not start a run or send an extra provider request. The reservation is single-use rather than a persistent export toggle. Subsequent events must not be exported by that reservation. A before-only capture does not disable transformations or change provider/model/rule matching. Exports describe this plugin's boundary only. Unsupported request extraction and file-write failures must be reported without claiming a successful capture or disrupting a model request. A new one-shot command replaces any pending reservation. The next actual event at the selected stage consumes the reservation even if extraction is unsupported or export fails; do not retry automatically. Clear a pending reservation on session change or reload. This one-shot state is not a persistent export setting.

Follow the repository's `/<extension> <action> [args]` command grammar, contextual multi-token completions, TUI configuration entry and installed-only panel discovery. Non-TUI behavior must remain usable through the command surface. Routine logs must not substitute for explicit prompt export.

### R8 — Diagnostics and evidence

Support `logging: silent | error | info`. Diagnostics distinguish invalid configuration/rule failure, unsupported payload shape, observable-extension limitations and export failure/success as applicable, without indiscriminately dumping prompts into logs. Preserve the model-request fail-open invariant.

Document actual installation/resources, configuration semantics, commands, trusted script privileges, export privacy, supported host APIs and payload shapes, and separately verified commands. Do not present fixture results as live-provider compatibility proof.

## Solution boundaries and integration seams

| Seam | Input | Required guarantee |
| --- | --- | --- |
| Configuration → pipeline | Rules, conditions, paths with origin, export/logging settings | Ordered transformations with local path provenance; project trust respected. |
| Host → agent processing | Chained prompt, structured prompt options, current model/cwd, command provenance | Plugin-local changes and before/after observations only. |
| Antigravity adapter → request processing | Recognized system-instruction text and its payload location | Targeted write-back; unrelated payload content preserved; unknown formats unchanged. |
| Pipeline → script | Selected text and context | String output or rule rollback; no sandbox claim. |
| Command → capture | Selected stage and before/both mode | Reserve next actual boundary exactly once, without starting a request. |
| Capture → filesystem | Prompt text and stage/side association | Explicit local output evidence, privacy guidance and non-blocking failure reporting. |

Host API evidence was read from the installed Pi 1.5.2 `docs/extensions.md`: `before_agent_start`, `before_provider_request`, handler composition, and `pi.getCommands()`. The official [extension reference](https://pi.dev/docs/latest/extensions) is a verification source; current online documentation may differ from the installed host. Request payload shape still needs inspection against the actual Antigravity provider during implementation; do not invent a payload path in this spec.

## Representative end-to-end acceptance

| ID | Given / When | Observable result |
| --- | --- | --- |
| E1 | Default Pi prompt, matching Antigravity Gemini, preset enabled | Intro sentence and docs index changed; all other section content preserved. |
| E2 | Same prompt with a nonmatching provider/model or explicit custom prompt | Preset does not change the prompt. |
| E3 | Multiple matching rules, aliases and ordered overlapping targets | Output follows declared order; tags/unselected text are preserved except when `all` selects them. |
| E4 | A rule changes one target then fails in another | Entire failing rule's text edits disappear; previous successful rules remain and later rules still execute. |
| E5 | Local script/file relative to a configuration outside cwd | Correct declaring-directory source is used; async scripts work; bad results follow E4. |
| E6 | Known Antigravity payload with system instructions and unrelated user/tool fields | Only the selected system text changes; unknown formats are unchanged with diagnostics. |
| E7 | A one-shot before-only agent capture is armed, then two runs occur | Arming sends no request; first run produces one before capture while rules execute; second run is not captured by that reservation. |
| E8 | A one-shot before+after request capture is armed, then actual supported requests occur | First event produces a correlated pair reflecting its rule changes; later requests are not captured by that reservation. |
| E9 | Another extension runs before/after this one | Captures reflect only this plugin's local input/output; later changes are not misrepresented as already captured. |
| E10 | No export enabled or reserved; logging modes varied | No prompt export occurs; logging respects its selected level. |
| E11 | Extension provenance matching and an extension with no slash command | Observable provenance matches work; documentation/UI do not claim a complete loaded-extension inventory. |
| E12 | Export destination cannot be written | Failure is reported without blocking the model request or reporting a successful file. |
| E13 | Independent installation outside checkout and TUI/non-TUI usage | Only this plugin activates; command completion/configuration and capture are usable with declared dependencies. |
| E14 | Global rules plus project rules with a matching ID and a new ID | The project counterpart overrides the global rule; new project rules append, and declaring-file path origins survive. |
| E15 | A pending capture is replaced, its event fails, or the session changes/reloads | Latest command replaces the pending reservation; the selected event consumes it even on failure, without automatic retry; session changes/reload clear it. |
| E16 | Repeated top-level sections, nested markup, missing target and malformed structure | All matching top-level sections are processed; nested tags are not recursively selected; missing targets skip; malformed structure rolls back that rule. |

## Verification and limitations

Run package-local typecheck, Biome and Vitest, then actual Pi loading/usage smoke evidence. Exercise both hooks with deterministic provider-shaped fixtures; include a real provider-path capture where credentials and permissions permit, separately labeling what was and was not verified. Do not require paid/live requests merely to test arming. Compatibility with all providers, arbitrary other-plugin ordering, exhaustive extension detection, sandboxed execution, external publication and security enforcement are excluded.

## Handoff and pending knowledge

Intent: generalize the two prototypes without changing the Pi host. Confirmed choices are recorded in the source contract and R1–R8. No new requirements may be invented by downstream decomposition. Implementation discoveries that materially change semantics must return to clarification, rather than silently overriding the confirmed composition, reservation or section-edge policies. No blocking requirements questions remain. Reversible package/command/file naming is intentionally unreserved. CONTEXT/ADR persistence remains Pending due to absent authorization; it does not block these selected artifacts. No implementation, test execution, commit or shipping is authorized by this handoff.
