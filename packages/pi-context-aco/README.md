# Pi Context ACO

**V1 observation and recommendations** for the Adaptive Context Orchestrator: T0001 pressure monitoring plus T0002 task state, protected references and explainable conditional proposals. No context strategy executes.

## Compatibility and resources

- Node.js >= 22.19.0, TypeScript ESM/erasable syntax, no bundler/emitted build.
- Verified with Pi **1.5.0**, Windows, Node **26.13.0**, npm **11.20.0**.
- One extension: `extensions/index.ts`; command `/aco`; one metadata-only declaration tool, `aco_task`. No provider, skill or prompt registration.
- Uses usage/model/session read APIs, finalized-tool/turn/session/model/compaction/settled events, custom metadata, commands/completion and standard TUI components. Missing information remains unknown; no raw-history fallback edits.
- Used host SDKs and TypeBox are host-provided `"*"` peers, not bundled implementations or claims about every host version.
- Ordinary `pi-plugin-support@0.1.0` provides config I/O, loaded-panel discovery and TUI composition. Its versioned archive is shipped in `vendor/`, resolved by the development lockfile and bundled as an ordinary source-only npm dependency. No undeclared sibling imports, shared mutable manager or registry publication is assumed.

## Setup

From this package directory:

```sh
npm ci --ignore-scripts --legacy-peer-deps
pi -e .
```

From the collection root after setup: `pi -e ./packages/pi-context-aco`. Persistent local registration: `pi install ./packages/pi-context-aco`. Pi does not install a local package's dependencies for you.

## Commands and declaration tool

| Command                                  | Result                                                                                                                       |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `/aco`, `/aco config`                    | Standard interactive status/settings panel in TUI; current JSON report in non-TUI modes.                                     |
| `/aco status`                            | Current pressure, task/reference state, provenance, recommendation, capability and management measurements.                  |
| `/aco trace`                             | Current report plus the latest 50 in-memory numeric/assessment snapshots.                                                    |
| `/aco tasks`                             | Active-branch tasks, protected source references, signal families, dependency conflicts and coverage limits.                 |
| `/aco recommend`                         | Conditional actions/no-op, reasons, risks, recovery/authority prerequisites, estimated/unknown gains and costs.              |
| `/aco declare <JSON>`                    | Validate and append an explicit partial task update as `aco-task` metadata. No strategy authorization.                       |
| `/aco on`, `/aco off`                    | Persistently enable/disable event sampling. Explicit status inspection still works; declarations are refused while disabled. |
| `/aco config reload`                     | Reload settings and reset the growth baseline.                                                                               |
| `/aco config <key> [value]`, `/aco help` | Read/validate/save a setting, or show usage.                                                                                 |

Tab suggestions preserve the entire argument prefix, including `config <key> <value>`; JSON is free-form schema-validated input. Numeric presets are suggestions, not the allowed-value boundary. The TUI switcher lists only loaded collection-protocol panels, never a static catalog or injected native `/settings` rows.

The model may call **`aco_task`** with exactly the same declaration object. It appends metadata and returns a normal tool acknowledgement/recommendation; it cannot execute tools, delegate, compact, prune, offload, request continuation or grant authority. Its definition and ordinary call/result consume parent-model context. There are **zero extra classifier/decision-model calls**, not zero overall tool overhead. Disabled monitoring does not remove this declared tool schema; execution refuses metadata updates until enabled.

### Declaration contract

Updates are partial: omitted fields keep their prior declared values. A new task is selected only with `active: true`, or when there is no active task. Fields are:

- Required `taskId`; optional `active`, `title`, `phase` (`explore|plan|implement|test|review|null`), `status` (`pending|running|completed|blocked`).
- `dependencies` (task IDs), `requiredContextIds` (reference IDs), `estimatedFutureTokens`, `delegatable`, `writeConflictRisk`, `writeResources` (paths), `remainingSteps`, `planStatus`.
- Nullable future-token/remaining-step/risk/delegatability values mean explicitly unknown. Numeric estimates/claims are never measurements.
- `references`: each has `id`, `kind` (`constraint|decision|evidence|artifact|checkpoint`), existing active-branch `sourceEntryIds`, optional `dependencies`, `pinned`, `precisionSensitive`, `completedResearch` and nullable `estimatedTokens`.

Example workload declaration:

```text
/aco declare {"taskId":"explore-api","active":true,"phase":"explore","status":"running","estimatedFutureTokens":200000,"delegatable":true}
```

Near-completion example, which can favor no-op even at high occupancy if the declared remainder fits:

```text
/aco declare {"taskId":"finish","active":true,"phase":"review","remainingSteps":1,"estimatedFutureTokens":1000}
```

Obtain real source IDs from the references shown by `/aco tasks`; do not copy placeholder IDs as facts. A decision can reference evidence through `dependencies`, while a task identifies its required decision/evidence references through `requiredContextIds`. Unknown task/reference dependencies are visible and inhibit unconditional independence/disposal claims. Foreign source IDs, cyclic task dependencies, invalid values and oversized updates are rejected before append. An append failure is not reported as successful persistence.

IDs are bounded nonempty identifier strings, titles at most 256 characters, each update at most 32 references/relationship items and 32768 serialized characters. State is bounded to 64 tasks and 256 references; merged source/dependency lists are bounded to 128 per reference. Invalid stored records or capacity loss produce explicit limited coverage, not silently disposable evidence. Pinning/precision/source relationships are conservative and additive; V1 offers no unpin/equivalence-verification API.

## Task understanding and protection

The active **raw branch**, not all session entries or cached global state, reconstructs declarations on resume/tree/fork/reload. An undeclared conversation starts with an observed task tied to the first user source; follow-ups remain evidence for it until an explicit task switch. Declaration provenance is `command` or `tool`, not a claim of authenticated human authorship or independently verified success.

The rules-first analyzer combines user-intent hints, available declared/observed plan state, finalized tool activity, successful tool-reported file touches and test outcomes. Inferred phases require corroborating independent signal families and remain **tentative**. Assistant prose alone cannot prove phase, plan completion, passing tests or task success. Numeric tool exit status may establish a reported test result; an absent exit status is unknown. A successful test does not complete the task. Resource touches are not a Git/workspace audit.

User-message requirement/acceptance sources, pinned constraints/critical decisions, precision-sensitive/error sources and unfinished task dependencies are protected. Protection follows declared reference dependencies, source aliases and task dependencies, including completed producer tasks still needed by unfinished consumers. Planning completion or `completedResearch: true` cannot override protection. Full semantic segmentation/equivalence validation remains T0004.

Write overlaps use normalized relative/absolute paths within the active session cwd, case-folded on Windows. Concrete overlap overrides a declared zero risk with an inferred overlap indicator (1, **not** a calibrated probability). Symlinks, shell-script modifications and true task independence still require verification.

Recommendations can combine checkpoint → offload → prune, delegation or compaction candidates, or no-op. Their order depends on task/pressure/content evidence, not fixed occupancy tiers. Every action is conditional on later implementations and the applicable recovery, dependency, message-structure, authority and budget checks. Savings are estimates/ceilings or unknown, never measured reclaimed context. Cache-prefix disruption, semantic loss, latency and coordination overhead remain visible uncertainties. There is no calibrated utility/accuracy/superiority claim.

Assessments are reused for unchanged active-branch/pressure inputs; substantive source/plan/task/test/subagent-return changes trigger reassessment. Model reasoning is not mandatory: this V1 uses **no additional model judgment calls** and leaves unsupported semantics uncertain.

## Pressure and settings

Configuration is `<getAgentDir()>/pi-context-aco.json` (normally `~/.pi/agent/pi-context-aco.json`). Read on startup/reload and explicit `config reload`; no polling timer/watcher. Panel/command saves apply immediately after successful serialized atomic replacement. Invalid/unreadable/oversized settings disable sampling without silent rewrite. Cross-process locking/merging/fsync durability is not promised.

| Setting         | Default | Allowed values / meaning                                                                  |
| --------------- | ------- | ----------------------------------------------------------------------------------------- |
| `enabled`       | true    | Boolean; sampling/declaration control, never authority.                                   |
| `historySize`   | 6       | Integer 2–50; recent comparable completed-turn deltas.                                    |
| `horizonTurns`  | 3       | Integer 1–20; prediction horizon.                                                         |
| `reserveTokens` | 4096    | Integer 0–1000000; forecast reserve, not an execution budget.                             |
| `persistTraces` | false   | Boolean; append numeric/assessment counters as `aco-monitor` metadata on completed turns. |

Defaults are **uncalibrated tunables**. Pi current context tokens are estimated (last usage plus trailing-message estimates), not exact post-filter/request counts. Capacity is observed model configuration. Growth uses recent comparable completed-turn means; model/window/projection/compaction/tree changes, unknown usage and shrinking readings invalidate baselines.

Tool size is explicitly `ceil(UTF-16 text length / 4)`, not a tokenizer; multimodal/unsupported bodies stay unknown. Recent per-tool/limit maxima estimate announced bursts, with unknown calls and nested overlap disclosed. Projected tokens = current + max(mean growth × horizon, known pending estimates) + reserve. Unknown components can add more. Declared future task work is considered separately. `burstRisk` is a capacity fraction, not a probability.

Provider input/output/cache tokens and costs are **last-response reported measurements**, not aggregate task costs. Missing metrics stay unavailable. Management sampling/analysis milliseconds measure only those local calculations; declaration overhead is not separately attributable from parent-model usage. Reclaimable/protected token sizes and recovery cost remain unknown without the later semantic/recovery capabilities.

The monitor retains at most 50 trace snapshots, 50 growth deltas, 64 tool-history signatures × 10 sizes and 256 pending calls. Overflow is explicitly uncertain until reset. Historical traces are not fresh growth baselines after restart.

## Permissions and boundaries

Extensions have Pi's OS privileges; this is not a sandbox. ACO reads host session/usage/tool metadata, writes its own settings and explicit task declarations, and optionally appends numeric traces. **Explicit declarations can contain titles, relationships and resource paths** and follow the session's storage/access lifecycle. Inferred source bodies, prompts and raw tool outputs are not copied into a separate archive. Automatic trace records contain counts/action names rather than the full task/reference state. Normal declaration tool arguments/results are part of the ordinary session. Ephemeral sessions are not durable archives.

No extra network/credential access, remote upload, workspace writes, context/result/argument rewriting, evidence deletion/offloading, native compaction initiation, continuation or subagent dispatch occurs. Native user/host/other-extension behavior is not governed by ACO. Only ACO-owned listeners/status/state are closed.

V2–V5 and the full semantic dependency/equivalence engine are not implemented.

## Verification

From this directory, run separately:

```sh
npm run typecheck
npm run check
npm test
npm run smoke
npm run smoke:tasks
```

Smoke tests require installed Pi/npm and the prepared npm cache. Both install actual plugin tarballs outside the checkout, use an isolated agent directory and deterministic in-process provider, and make no live provider requests.

- `smoke`: T0001 controls/passivity, model-bound conversation/tool-body equality against no ACO (normalizing only timestamps/durations and the intentionally added `aco_task` declaration schema), no extra model calls, parallel/blocked/unknown outcomes, metadata non-visibility and model/external-edit/native-compaction resets.
- `smoke:tasks`: actual E02/E03 workload/no-op decisions, protected exact evidence, command/tool declaration provenance, atomic invalid-update rejection, tree isolation, persisted resume and no strategy/extra model calls.
- Optional actual Windows ConPTY keyboard test: `python tests/tui-smoke.py`, using Python 3.12 with test-only `pywinpty==3.1.2` in an isolated Python environment. It covers settings/persistence, full-prefix Tab completion, task/recommendation inspection, loaded-only panel switching, real reload and orderly exit. Its `--approve` flag applies only to its disposable directory.

Evidence is recorded in [T0001](../../.grimoire/ticket/0004-adaptive-context-orchestrator/T0001-v1-context-monitor-and-plugin-control.md) and [T0002](../../.grimoire/ticket/0004-adaptive-context-orchestrator/T0002-v1-task-context-graph-and-recommendations.md). Controlled fixtures, unit assertions and actual host/terminal interaction are separate evidence classes. Manual visual GUI testing, other host/Node/platform versions, real-project inference accuracy and adaptive-policy superiority are not claimed.
