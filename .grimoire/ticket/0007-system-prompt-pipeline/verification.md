# Prompt Pipeline Verification and Joint Assessment

**Scope:** [Spec 0009](../../spec/0009-system-prompt-pipeline.md), T0001–T0005 and the explicit `grimoire-loop` invocation.
**Result:** Clean within the selected, bounded acceptance scope. No confirmed Code Risk or Intent Check blockers remain.
**Snapshot:** New `packages/pi-prompt-pipeline/` working tree after final Biome formatting and scoped repairs; only evidence/status/catalog prose changed afterwards. No commit was created.

## Execution contract and environment

The user's explicit loop invocation authorized implementation, testing, joint review/check, scoped repairs and formatting after the earlier artifact-only refinement. A short persisted plan was used because configuration provenance, two host boundaries and capture lifecycle needed coordinated sequencing: `.grimoire/plans/0001-system-prompt-pipeline.md`. It is saved/read back locally but ignored by the repository's existing ignore policy; no ignore rules were changed or bypassed.

All stages ran inline. No implementation/review delegation, publication, commits, host/provider changes, real credentials, billable provider calls or CONTEXT/ADR recording. Pre-existing working-tree modifications and the two root prototype scripts were preserved. The only existing repository documents edited for this package were the two catalog/development READMEs and the selected task artifacts.

Environment: Windows, native Pi 1.5.2 (`pi.exe --version` returned `1.5.2`), Node.js 26.13.1, npm 11.20.0. WSL dispatched the native tools using Windows argument paths. Optional terminal test: Windows Python 3.12.16 and the binary wheel for pywinpty 2.0.15 installed into temporary test-only storage, not global Python or the extension runtime.

## Executed checks

Working directory unless noted: `packages/pi-prompt-pipeline/`.

| Command / check | Result |
| --- | --- |
| `npm ci --ignore-scripts --prefer-offline --fetch-retries=0 --fetch-timeout=15000` | Pass; frozen package-local lockfile, 170 packages installed. Install scripts remained disabled. |
| `npm run format` | Pass; final formatting completed after behavioral repairs. |
| `npm run typecheck` | Pass; `tsc --noEmit` over extension and TypeScript tests/fixtures. |
| `npm run check` | Pass; Biome checked 25 supported files, no errors/warnings or fixes. |
| `npm test` | Pass; 8 files, 27 tests, no skipped tests in the final full run. |
| `npm run smoke` | Pass; actual Pi outside checkout, 4 deliberate fixture requests and 3 snapshots, no request from arming commands. |
| `tests/tui-smoke.py` through native Python + temporary pywinpty module path | Pass; actual isolated Windows ConPTY keyboard interaction and clean exit. |
| Catalog diff inspection | Only package insertion, layout entry and accurate support-dependency wording were added/adjusted by this work. |

Actual WSL invocation for the package scripts used the native Node executable at `C:/Users/29185/AppData/Local/mise/installs/node/26.13.1/node.exe` with that installation's `node_modules/npm/bin/npm-cli.js`. Terminal invocation used native Python, inserted `C:/Users/29185/AppData/Local/Temp/pi-prompt-pipeline-pywinpty` into `sys.path`, then ran `G:/pi-toolkit/packages/pi-prompt-pipeline/tests/tui-smoke.py` via `runpy`.

Early npm installation attempts exceeded tool timeouts during registry metadata fetching; a bounded background install completed, followed by the successful frozen reinstall and final gates above. These were setup delays, not evidence of a product defect. WSL sometimes printed an unrelated systemd-user-session warning; native checks still completed.

The ordinary `git diff --check` reported existing CRLF-as-trailing-whitespace in the already modified catalog files. Their non-EOL diff was separately inspected; no repository-wide line-ending rewrite or Git configuration change was made. A command-local CR-at-EOL-aware whitespace check is used for these documents.

## Host/provider evidence boundary

Installed pi-antigravity 0.14.0 was inspected, not modified:
- `src/stream/stream.ts`: `buildRequest` produces the consumer `request.systemInstruction.parts` envelope; the request loop awaits `opts.onPayload(payload, model)` and accepts a replacement before serialization.
- `src/client/enterprise.ts`: `toEnterpriseGenerateBody` carries `systemInstruction` into a top-level body with `contents`.

The adapter handles only these supported paths for provider `antigravity`; unit fixtures cover consumer/enterprise extraction and preservation. Actual Pi smoke uses a synthetic provider with the same relevant payload shape, forwarding through real Pi hook dispatch. It does not contact the real Antigravity service or establish live 429 compatibility.

Both runtime scripts copy the manifest and extension resources into temporary storage without node_modules or repository siblings. The host resolves its own peers. RPC smoke checks no original sibling commands activate, and peer handlers prove snapshots are plugin-local. ConPTY opens the actual SettingsList, persists logging/preset changes, executes full-prefix Tab completion, arms capture without requests, verifies a before/after pair, switches to an observable loaded fixture panel, reloads and observes the reservation cleared.

## Intent Check — requirement coverage

| Group | Assessment | Implementation and evidence |
| --- | --- | --- |
| R1 | match | Manifest/tsconfig/Biome/lockfile; TypeBox validation; global/trusted-project layers and origin-aware ID composition in config tests; frozen setup and isolated Pi loading. |
| R2 | match | Pipeline matcher and entry provenance collection; pattern/extension/custom-prompt tests, lifecycle custom-prompt state, documented incomplete command inventory. |
| R3 | match | Public agent/provider hooks; source-backed Antigravity adapter; consumer/enterprise tests and actual Pi peer ordering. No host-private interception. |
| R4 | match | Top-level scanner, aliases/custom tags, inner-text-only edits, ordered ranges; repeated/nested/missing/malformed/self-closing regression tests. |
| R5 | match | Literal/regex/line removal/insertion/file/native ESM actions; script context/options, sync/async and failure tests; rule-wide transaction and targeted fault-detection check. |
| R6 | match | Explicitly enabled preset, provider/model/custom-prompt scoping, intro/docs-only CRLF regression, opt-in configuration and actual TUI preset toggle. |
| R7 | match | Default-off capture, all four persistent points, reservation replacement/consumption/cancel/reset, before-only semantics and correlated pairs; unit/lifecycle/RPC/ConPTY evidence. |
| R8 | match | Silent/error/info policy, generic failure IDs without exception/prompt dumps, explicit export paths/failures, package README and separate fixture/live evidence claims. |

No unauthorized production extras or material plan deviations were found. Reversible names were selected as `pi-prompt-pipeline`, `/prompt-pipeline` and `prompt-pipeline.json`. Exports are correlated JSON snapshots containing system-text parts only. Independent shared-library reuse was not required; the package has no ordinary runtime dependency and uses the existing panel-discovery protocol.

## Scenario-to-evidence map

Test paths below are relative to the package.

| Scenario | Evidence |
| --- | --- |
| E1 | `tests/pipeline.test.ts` compatibility preset regression preserves other sections and line endings. |
| E2 | Preset/matcher guards inspected; pattern and explicit-custom tests in pipeline/lifecycle suites. |
| E3 | Pipeline target/action order, repeated top-level/alias/custom-tag tests. |
| E4 | Pipeline rollback/continuation test; persistent snapshots show failed agent rule unchanged before/after; targeted rollback mutation fails for the intended assertion. |
| E5 | `tests/scripts.test.ts`: different cwd, declaring directory, local file, sync/async options/context, bad result/throw/import/file failures. Native ESM also observed through real Pi smoke. |
| E6 | `tests/request.test.ts` both shapes and unknown inputs; lifecycle/RPC tests retain user content/metadata/non-text parts. |
| E7 | Lifecycle before-only test and RPC first-run snapshot without another capture; rules still change outgoing text. |
| E8 | RPC request pair shares capture ID, records the change, and later requests add no reservation snapshots; ConPTY repeats the paired flow. |
| E9 | Actual Pi before/after peer fixtures: plugin after-snapshot excludes the later peer suffix while emitted payload includes it. |
| E10 | Config defaults, silent failure test, persistent four-side test and unarmed runtime state. |
| E11 | Matcher/entry provenance inspection and explicit README/status limitation; no exhaustive unloaded-extension claim. |
| E12 | Deterministic file-as-parent export failure test; write result reports failure/no successful path, reservation stays consumed; entry never blocks the request on that result. |
| E13 | Outside-checkout no-node_modules RPC smoke, actual ConPTY keyboard/settings/completion/discovery test, documented package-local commands. |
| E14 | Config ID-override/new-ID ordering plus origin inheritance and untrusted-project omission tests. |
| E15 | Capture replacement/clear tests, unsupported-event consumption, actual new-session/RPC and reload/ConPTY reset, stale async output suppression test. |
| E16 | Repeated/nested/custom/missing/malformed and self-closing/empty-paired section tests. |

## Code Risk — findings and repairs

- **Resolved, correctness (high confidence):** A self-closing tag initially accepted an insertion outside the tag when selected. A regression first failed with an extra `!` after `<docs/>`; selection now excludes self-closing inner ranges while retaining empty paired sections.
- **Resolved, lifecycle (high confidence from control-flow inspection + async regression):** Generation guards prevent stale reload/handler completion from publishing state or returning edits after session teardown. Pending reservations are synchronously consumed before async work and cleared on replacement.
- **Resolved, configuration reliability:** Persisted text is serialized once and checked against the same 1 MiB load limit before writing; oversize saves fail rather than claiming an unusable setting was saved.
- **Fault-detection evidence:** Temporarily resetting the pipeline to its original parts on a failed rule made the rollback regression produce `a2/b2` instead of `a12/b12`. The assertion failed as intended; the fault was restored before final passing checks. Initial missing-module test failures were setup-red evidence, not this behavioral detection proof.
- Final review: **0 confirmed blockers**, **0 unresolved required acceptance gaps**. No recommendation to infer global-first/last interception, exhaustive extension detection, a sandbox or a security gateway.

## Explicit limitations and unchanged authority

Live Antigravity service behavior, elimination of 429 errors, other provider payload adapters, all host/platform versions, human physical-terminal usage, external publication, and a release/supply-chain certification remain outside the verified claim. ConPTY is genuine automated terminal interaction, not a human manual session.

Privileged local scripts can hang or cause irreversible external side effects; catastrophic regexes can also stall. Fail-open handles ordinary caught failures only. Export files may contain private data; private file modes are requested, but Windows ACLs/existing directories and retention remain user responsibilities.

No CONTEXT/ADR update was authorized or performed. Existing modifications in those files predate this work. No Git ignore policy was changed; the saved plan remains locally ignored. The original prototype files remain untouched. Status transitions apply only to this spec/ticket set, based on the bounded evidence above, not to any ADR or unrelated ticket.

## Follow-up repair — opaque section body examples

A user-run preset reported both compatibility rule IDs rolled back. Reproduction using commit-format placeholders from the repository AGENTS.md produced the same two failed IDs with unchanged output. The original scanner recursively balanced every tag-like token; ordinary `<gitmoji>`, `<type>`, `<scope>` and `<subject>` examples inside project context therefore poisoned unrelated intro/docs edits. The earlier 27-test pass did not cover this realistic input; its broad XML-nesting interpretation is superseded by the user-approved clarification in Spec R4.

The user explicitly approved the repair: outer section boundaries are structural, other tag names inside the selected outer body are opaque prose. Same-name nesting remains balanced to find the correct outer closing boundary. Unmatched top-level closing tags and unclosed outer sections still cause whole-rule rollback. This intentionally stops recursively validating body examples; it does not introduce full XML parsing or silently repair missing outer boundaries.

Fix-owned changes: `extensions/pipeline.ts` scanner; `tests/pipeline.test.ts` regression/edge cases; the synthetic provider fixture and ConPTY assertions; package README and Spec R4 wording; this addendum. No host/provider installation code, user configuration, CONTEXT or ADR was changed.

Evidence after the repair:
- Before production edits, the new regression suite had **2 expected failures**: both preset rules rolled back for project placeholders, and opaque docs examples prevented selected-section edits.
- After the scanner repair, all **12 pipeline tests passed**, including same-name nested sections and malformed outer-boundary rollback.
- Full package checks: `npm run typecheck`, `npm run check`, `npm test` — all passed; **8 test files, 31 tests**.
- Original-shape runtime check with **actual repository AGENTS.md content** wrapped in project context: expected intro/docs edits matched exactly, project text preserved, `failures: []`.
- `npm run smoke` passed with tag examples added to its real Pi fixture input.
- Actual Windows ConPTY test passed with new assertions that the enabled compatibility preset changes the intro despite the project placeholders, and preserves those placeholders in the exported request prompt.
- Scoped manual code/intent review: only the approved scanner behavior and corresponding sources/tests changed; no confirmed blocker remains. Broad simplification was skipped because these files overlap the already uncommitted package, and unrelated branch work was not reviewed or rewritten.

Pre-fix HEAD was `b9adcb898c96023919373519fccb49ee0b9e818b`; the tree already contained the untracked implementation and unrelated modifications. Work is on local branch `fix/prompt-pipeline-opaque-sections`. No commit or push was made. Previous evidence above remains historical; these results describe the repaired snapshot. Live Antigravity service behavior remains unverified.
