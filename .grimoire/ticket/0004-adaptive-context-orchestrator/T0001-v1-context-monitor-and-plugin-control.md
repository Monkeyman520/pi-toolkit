# V1 context monitor and independent plugin control

**Ticket ID:** T0001
**Source:** [Spec 0007](../../spec/0007-adaptive-context-orchestrator.md) — R01, R02, R14, R15, R16; scenarios E01, E02, E14. [ADR 0006](../../adr/0006-task-aware-context-working-set-and-isolation.md).
**Status:** Done

## Goal

Deliver an independently loadable observation-only ACO plugin that exposes actual/estimated context pressure, forecasts and baseline traces without altering the model's working set.

## Affected Surfaces

New package under `packages/<plugin-name>/`: manifest, local TypeScript/check/test setup, extension entry, usage/forecast state, lifecycle hooks, command/completion/TUI settings and README. Literal naming and internal file layout are implementation choices, not publication authorization. Existing sibling plugin behavior remains unchanged.

## Approach

Make package setup part of this first consumer rather than an independent scaffold ticket. Connect supported Pi usage/lifecycle/finalized-tool signals to measured/estimated/unavailable pressure fields and trace output. Expose the established command/config/status ergonomics and installed-only panel discovery. Persist metadata only; no filtering, result rewriting, offload, compaction or delegation.

## Dependencies and Coordination

- **Blocked by:** None.
- **Blocks:** T0002 and T0003 require its actual plugin/lifecycle/control boundary for their runtime integration.
- **Coordination risks:** Keep the pressure/task-evidence interface aligned with the spec so subsequent tickets can consume it without assuming precise post-filter token counts. Any shared support library remains an explicit ordinary dependency with plugin-owned resources.

## Acceptance

- [ ] Isolated Pi loading without sibling plugins/build output exposes only the intended resources, with truthful host compatibility/dependency/permission documentation (R01, E01).
- [ ] TUI configuration/status, non-TUI fallback, full-prefix multi-token completion and loaded-only panel discovery follow existing collection conventions.
- [ ] Usage/capacity, net growth, projected usage and burst estimates distinguish measured/estimated/unknown values and expose horizon/reserve/input assumptions (R02).
- [ ] Missing history/model metrics and model-window/intervention changes do not become fabricated zero values or false growth; controlled traces exercise low-current/high-projected pressure (E02).
- [ ] Provider-bound messages and tool-result bodies are unchanged by ACO in V1. No ACO strategy executes, even when a high-impact action is recommended elsewhere (R16).
- [ ] Finalized blocked/failed calls and interleaved tool completions are observed without serial-order assumptions; shutdown/reload closes only owned resources and reports missing capabilities (R14, E14).
- [ ] Baseline traces identify available usage/cache/cost metrics and management overhead without claiming unsupported savings or precision (R15).
- [ ] Tests and a controlled Pi smoke check demonstrate the observation-only boundary, not merely configuration inspection.

## Out of Scope

Semantic task/graph recommendations beyond the incoming evidence contract (T0002); evidence storage/recall and all context-changing strategy execution (T0003 onward); publication.

## Verification contract

Run the affected package's type check, Biome and Vitest separately and record the tested versions. Supply a controlled Pi loading/usage check for this ticket's delivered behavior; mock-only hooks and direct Node entry execution are insufficient. Keep the package README/configuration and permissions accurate as capabilities change. This ticket describes future verification, not checks already performed.

## T0001 execution receipt — 2026-11-05

**Result:** clean for T0001 only. The original acceptance checklist above is preserved; each criterion is established below. T0002 and the full V1 milestone are not complete.

**Implementation:** [pi-context-aco](../../../packages/pi-context-aco/README.md), with the supported entry at `extensions/index.ts`, pure pressure model, serialized validated settings, standard command/completion/TUI surfaces and ordinary bundled support dependency. [Plan](../../plans/0005-t0001-passive-context-monitor.md) was persisted before production edits; the existing Git policy ignores plans. No commits, publication, host changes or delegation occurred.

| Criterion, in original order | Classification | Evidence |
| --- | --- | --- |
| C1 — Independent install/resources/dependencies | match | `npm run smoke` packs and installs the actual plugin tarball in a temporary consumer outside the checkout, with only `pi-plugin-support` bundled; real Pi commands/resources load without sibling activation or emitted build. |
| C2 — TUI/text/completion/discovery | match | Config/command tests plus actual Windows ConPTY keyboard interaction: SettingsList toggles and numeric edits persist, whole-prefix Tab completion executes the intended config command, only loaded fixture panel is offered/switched, real reload is observed and settings survive. RPC exercises the non-TUI fallback. |
| C3 — Pressure evidence and inputs | match | Pure tests establish observed capacity versus estimated context/growth/tool/projected values and unavailable fields; traces expose horizon/reserve/method/unknown components. Real Pi tool-history traces show announced-burst estimates. |
| C4 — Unknowns and discontinuities | match | Tests cover null/nonfinite/missing history/window/capability values and intervening shrink readings. Real Pi runs verify model/window, supported external context-edit and native-compaction resets. No fabricated zero/precision/superiority claim. |
| C5 — Strict passivity | match | Frozen-event/proposal tests and actual provider-bound transcript/tool-body comparison against no-ACO control, normalizing only independent-process timestamps/durations. Same four provider calls for the two-task comparison; no extra ACO model requests, edits, continuations or strategy authorization. Numeric metadata is absent from model-visible projection. |
| C6 — Finalized outcomes and ownership | match | Actual parallel/reverse-order successful, blocked and unknown-tool completions; per-ID unit cases include nested/error/missing-duration results. Unit checks distinguish settled from agent_end, detect missing usage, cancel stale startup and preserve another discovery listener after shutdown. Actual terminal reload/exit succeeds. |
| C7 — Baseline measurements/overhead | match | Provider-reported last-response input/output/cache tokens and component costs remain separate from estimated context; missing provider values stay unavailable. Extra management model calls/tokens are zero; local sampling milliseconds explicitly exclude UI/config/persistence overhead. |
| C8 — Package/runtime evidence | match | Final-tree `npm run typecheck`, `npm run check -- --diagnostic-level=warn`, `npm test` (38 tests in 3 files), `npm run smoke`, actual ConPTY smoke and root support-archive parity check all exit 0. |

**Environment:** Windows, Pi 1.5.0, Node 26.13.0, npm 11.20.0; TypeScript 5.9.3, Biome 2.6.4, Vitest 4.1.12. Optional terminal test used Python 3.12.15 with pywinpty 3.1.2 installed into a temporary test-only directory, not the extension dependency tree.

**Commands:** From `packages/pi-context-aco/`: `npm run typecheck`, `npm run check -- --diagnostic-level=warn`, `npm test`, `npm run smoke`. From repository root: `node scripts/package-support.mjs --check`. ConPTY: `python packages/pi-context-aco/tests/tui-smoke.py` with the optional Python environment's import path configured as documented in the package README. Biome formatting was applied only to the new package; affected checks were refreshed afterwards.

**Review/check assessment:** Full production files, test/config/manifest changes, bundled-library delivery, catalog/script changes and preserved prior refinement artifacts were inspected inline. No confirmed blockers remain. Review identified stale growth surviving an inter-turn shrink; a failing regression test demonstrated it, the baseline reset was corrected and the final affected suite/host checks passed. Ordinary status output was also kept separate from explicit trace dumps. The full adaptive design is not inferred from the monitor's green tests.

**Limits and follow-up:** Forecast defaults/text-size estimates are transparent uncalibrated heuristics. Real-project accuracy, adaptive-policy benefit, manual visual GUI interaction and other platforms/host/Node versions remain unverified; none establishes a T0001 defect. No task inference, semantic graph, evidence store/recall or strategy executor was added. The original three-plugin seven-combination isolation matrix is not represented as a new four-plugin matrix. Continue with T0002 only on a new execution invocation.
