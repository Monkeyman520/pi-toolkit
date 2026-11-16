# Pi Prompt Pipeline

An independently installable Pi extension for conditional system-prompt transforms and local boundary exports. Entry: `extensions/index.ts`. It does not modify the Pi host or register model-callable tools.

## Compatibility and installation

Requires Node.js >= 22.19.0 and Pi APIs `before_agent_start`, `before_provider_request`, `getCommands()`, project trust and custom TUI. Tested with Pi 1.5.2 on Windows and Node.js 26.13.1. SDK/TUI/TypeBox are host-provided peers; no sibling plugin, runtime dependency, bundler or emitted build is required. Wildcard peers do not imply every host version was tested.

From the collection checkout, load only this package:

```sh
pi -e ./packages/pi-prompt-pipeline
```

For persistent use, add this package's absolute directory to Pi's `settings.json` `packages` array, using Pi's ordinary trusted-resource setup. This package is private/unpublished; no npm installation identity is claimed. Do not keep the old `antigravity-prompt-compat.ts` / `dump-system-prompt.ts` loaded unintentionally alongside it.

## Commands

```text
/prompt-pipeline
/prompt-pipeline status
/prompt-pipeline config
/prompt-pipeline config reload
/prompt-pipeline config edit
/prompt-pipeline config logging silent
/prompt-pipeline config antigravityCompat true
/prompt-pipeline export agent before
/prompt-pipeline export agent both
/prompt-pipeline export request before
/prompt-pipeline export request both
/prompt-pipeline export cancel
/prompt-pipeline help
```

No arguments or `config` opens SettingsList in interactive TUI mode; other modes provide status/config output. Config edit uses Pi's editor for the global JSON. Completions include complete multi-token arguments. Settings persist to the global file; the panel warns that trusted-project values can override them. The panel exposes logging, preset and persistent export points, and switches only to currently loaded collection panels via `pi-packages:ui:discover`. Edit rules/paths in JSON, not by searching for another plugin's settings.

### One-shot export

`export <stage> before|both` reserves the **next actual event at that stage**. Arming does not run the agent or send a provider request. Then send your normal prompt.

- `before`: capture input only; all matching modification rules still run.
- `both`: capture input and output from the same event.
- A new export command replaces the pending reservation.
- The next selected-stage event consumes it, even if extraction/write fails. No automatic retry.
- Session replacement or reload clears pending reservations. `export cancel` also clears them.
- Persistent configuration exports, if enabled, remain independent: their selected sides are unioned with the one-shot selection.

All four names (`agent.before`, `agent.after`, `request.before`, `request.after`) refer to **this plugin's** handler input/output. Earlier handlers may already have changed the prompt; later handlers may change it again. These are not global-first/global-last hooks or interception around arbitrary plugins.

Snapshots default to `<Pi agent directory>/prompt-exports/`. Each exclusive JSON file contains a capture ID, stage/side, provider/model and `parts: [{ text, requestPath? }]`. Before/after share a capture ID. Request snapshots include only recognized system text, not the whole request or its headers. Successful paths are reported; partial-pair write failures are explicitly reported, not claimed as complete.

## Configuration

Global: `<Pi agent directory>/prompt-pipeline.json` (normally `~/.pi/agent/prompt-pipeline.json`).
Project: `<cwd>/.pi/prompt-pipeline.json`, read **only when Pi reports the project trusted**. Missing trust APIs are not supported host compatibility.

Defaults: no rules, preset off, no export points, `logging: "error"`. Files are re-read on commands and each agent/request hook. Invalid layers are skipped with diagnostics; they do not execute scripts or block model requests. Fix invalid JSON manually if `config edit` cannot read it. Each configuration is limited to 1 MiB.

Global rules run first. Same-ID project rules replace global counterparts in their existing positions; new project IDs append in project order. IDs must be unique within a file. `enabled: false` can disable an overridden rule. Other specified scalar values override global values; `export.points` replaces the array, while `export.directory` is independently inherited. Preset rules precede configured rules; matching configured IDs override them. Relative action paths retain the directory of the file declaring the rule, including after an override; relative export directories retain their declaring layer's directory.

Minimal opt-in compatibility configuration:

```json
{
	"antigravityCompat": true,
	"logging": "error",
	"export": { "points": [] }
}
```

The preset scopes two agent rules to `providers: ["antigravity"]`, `models: ["gemini-*"]`, `customPrompt: false`:
1. Replace the intro sentence `You are a coding assistant running inside pi, a coding agent harness.` with `You are a software engineering assistant.`.
2. Remove the `- When asked about: ...` index line in `<docs>`.

Other section content is preserved. The preset is based on the earlier prototypes; it is **not proof of the cause of 429 errors or a guarantee of eliminating them**.

### General rule example

```json
{
	"logging": "info",
	"export": { "points": ["agent.before", "agent.after"] },
	"rules": [
		{
			"id": "normalize",
			"stage": "agent",
			"when": {
				"providers": ["antigravity", "openai"],
				"models": ["gemini-*", "claude-*"],
				"extensions": {
					"all": ["*pi-antigravity*"],
					"none": ["*experimental-plugin*"]
				},
				"customPrompt": false
			},
			"targets": ["docs", "skills"],
			"actions": [
				{
					"type": "regex",
					"pattern": "[ \\t]+$",
					"flags": "gm",
					"replace": ""
				},
				{
					"type": "script",
					"path": "scripts/normalize.mjs",
					"options": { "suffix": "" }
				}
			]
		}
	]
}
```

Conditions are combined with AND. Each provider/model list is an OR of case-sensitive exact-or-`*` patterns. `gemini-` alone is exact, not a prefix pattern. Extension `all` requires every pattern, `any` at least one, and `none` excludes any match. Omit a condition to impose no restriction; empty provider/model/any arrays match nothing, while empty all/none impose no restriction.

Extension evidence comes only from `getCommands()` entries whose `source === "extension"`, using `sourceInfo.path`, `baseDir` and `source`. Paths normalize backslashes to forward slashes. Extensions without registered slash commands may be invisible; `none` is not proof of absence. Do not use this observation as an exhaustive inventory or security policy.

`customPrompt` tests whether the agent event has an explicit `customPrompt` option (including an empty explicit string). Its agent-observed state carries into request processing; before an agent observation it is unknown, so a true/false-specific rule does not match. Full forced overrides from other extensions are not a reliable way to identify user-authored custom prompts.

### Targets and actions

Targets: `intro`, `docs`/`doc`, `skills`/`skill`, `tools`, `rules`, `cwd`, `all`, `tag:<name>`.

Intro is the prefix before the first top-level XML-style tag. Named targets select the inner text of **all matching top-level paired tags**, preserving tags and unselected content. Nested markup is part of the outer text, not recursively targeted or validated as a separate XML tree: placeholders such as `<scope>`, `<subject>` and `<path>` inside project/docs/skills sections are opaque prose and need no closing tags. Repeated same-name nested tags are balanced to locate the outer closing boundary. Missing targets skip; self-closing tags have no selectable inner text. Unmatched top-level closing tags or unclosed outer sections make the rule roll back. This is a limited prompt-section scanner, not a full XML/HTML parser. `all` selects complete text; outer boundaries are still checked on entry to each target.

| Type             | Fields                    | Behavior                                                                                                                |
| ---------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| literal          | find, replace, firstOnly? | All literal occurrences; optional first only. Replacement text is literal, not dollar-expanded. Empty find is rejected. |
| regex            | pattern, flags?, replace  | JavaScript regex/replacement syntax, including $1 and $&; g controls repeated replacement.                              |
| removeLines      | pattern, flags?           | Regex-test each line, discard matched lines; retain unmatched line endings.                                             |
| prepend / append | text                      | Insert at selected content start/end.                                                                                   |
| file             | path                      | Replace selected content from a local UTF-8 file.                                                                       |
| script           | path, options?            | Load local .mjs and await default(text, context); require string output.                                                |

Rules, targets and actions run in declared array order. Overlapping targets can transform text repeatedly. Request text parts are processed in payload order, with rule rollback spanning all parts: if any selected action fails, discard all text edits from that rule, keep previous successful rules and continue. Failures include missing files, bad regexes/imports and script throws/rejections/non-string output. Diagnostics identify failed rule IDs without printing exception contents or the prompt.

Scripts are native Node ESM imports, not `eval`:

```js
export default async function transform(text, context) {
	// { provider, model, cwd, stage, ruleId, requestPath?, options }
	return text.replace(/[ \\t]+$/gm, "");
}
```

Paths may be absolute or relative to the declaring config file. Only local `.mjs` paths are accepted. Ordinary ESM caching applies; use a new script path or restart when changing a cached script. See `examples/normalize.mjs`.

### Request payload support

Initially only provider `antigravity`:
- consumer: `request.systemInstruction.parts[i].text`;
- enterprise: `systemInstruction.parts[i].text` with a top-level `contents` array.

These paths and `onPayload` forwarding were inspected in installed pi-antigravity 0.14.0 (`src/stream/stream.ts`, `src/client/enterprise.ts`). Non-text parts and unrelated fields survive unchanged. Unknown providers/shapes remain unchanged; an attempted unsupported capture reports failure, consumes the reservation and writes no misleading snapshot. Agent rules can still target other providers. The final payload may differ from `ctx.getSystemPrompt()`; request rules apply after provider serialization/sanitization and can run for provider retries if it re-emits the hook.

## Permissions and limitations

Scripts run with the Pi process's full user permissions: **not sandboxed**, can read/write/network/hang. No script is downloaded automatically. Only load trusted files; project trust authorizes executable configuration. Text rollback cannot undo a script's side effects and cannot interrupt a nonreturning script or catastrophic regex.

Fail-open means a failing rule leaves its entering text unchanged and lets the model request continue. It is **not a safety gateway**. The extension makes no content-safety guarantee.

Exported prompts may contain private instructions, code, paths and project context. Export is opt-in and logs never routinely dump the prompt. New directories request mode 0700 and exclusive files mode 0600; Windows ACLs and existing directories still require your review. Files are retained until you remove them; no automatic upload, retention cleanup or encryption is provided. A configured output path may be outside the default directory. Keep exports out of source control.

## Development and verification

From this package directory, with Node/npm and Pi on PATH:

```sh
npm ci --ignore-scripts
npm run typecheck
npm run check
npm test
npm run smoke
```

No install scripts are needed by this package. Development dependencies supply checker/test tooling, not runtime copies bundled into the plugin. `PI_BINARY` may select an alternate Pi executable for smoke testing.

The smoke test copies only distributable extension resources/manifest into a temporary directory outside the checkout, without node_modules or siblings, and loads them through actual Pi. A synthetic Antigravity-shaped provider exercises real Pi hook dispatch, command arming without model calls, native script loading, before-only/paired captures, ordering, unrelated payload preservation and session reset. It uses **no real credentials, network provider or billable calls**; this is not a live pi-antigravity service test.

Unit/integration tests cover rule selection/actions, trusted layers/path origins, per-rule rollback, both payload shapes, exports/failures, lifecycle, completion and actual SettingsList render/keyboard behavior. An additional actual Windows ConPTY test exercises SettingsList persistence, Tab completion, one-shot request pairs, panel switching and reload with keyboard input. Live Antigravity service requests and human physical-terminal interaction remain unverified. See the repository's [verification record](../../.grimoire/ticket/0007-system-prompt-pipeline/verification.md) for executed results rather than treating this README as runtime evidence.

Optional Windows-only terminal regression: with Python 3.12 and test-only `pywinpty==2.0.15` available, run `python tests/tui-smoke.py`. Pywinpty is not an extension dependency; this task installed its binary wheel into temporary test storage rather than modifying the global Python environment.
