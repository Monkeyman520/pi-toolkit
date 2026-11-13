# Windows Terminal QA and review evidence

**Evidence retention:** [RESULTS.md](./RESULTS.md) preserves essential native assertions and benchmark/reproduction data in Markdown. The existing `.grimoire/.gitignore` ignores PNG/JSON/JSONL support files; those files and screenshots are local-only and will not be included by an ordinary Git add. No ignore rule or staging state was changed.

## Scope and snapshot

User instruction: follow Steps 1, 2 and 4 in order; **do not perform Step 3**. No WSL/common Unix tests or host upgrades were performed.

- HEAD: `03f4468b8333c9b2ce298f2b2a91ce2ec6747fa4`.
- Package fingerprint: `f801a259d771994e0001400504f94af220ced077`, unchanged by this QA/review.
- Windows x64; Pi **1.5.0**, real Windows Terminal/ConPTY, Node **v26.13.0**.
- Only disposable seeded history/configuration under `C:/Users/ADMINI~1/AppData/Local/Temp/stree-win-qa-ewFPyj` was used. No working user history or global agent settings were used.
- Probe F12 snapshots read the real native session/file/leaf/editor. An input guard consumed any submitted ordinary prompt, and the isolated host had no models/authentication. Zero `before_agent_start` events were recorded.
- GUI input was intermittent: background key delivery failed/no-oped, some text was interleaved, and the task window was repeatedly minimized. Foreground retries followed observation, and each session-operation target/result was verified. The label round-trip assertion concerns the actually received string `fQA orenamed labelw`, not an assertion that injection reproduced the intended text exactly.
- Temporary probe parser/launcher quoting failures were corrected before these results. They were QA-fixture failures, not plugin defects.

## Step 1 — real interactive UI

Observed actual `/stree` open/close/reopen, typed j/k-containing search with a hidden assistant hit, cancellation restoration, acceptance without Navigate, preview, normal Escape clear, fold toggling, Enter expansion of a virtual branch without a session operation, and H projected-parent navigation.

The native label dialog updated the host's resolved root label and refreshed the rendered index. The real settings panel persisted Vim=false and the Explorer/help reflected non-Vim bindings. A temporary configuration rebound preview to x and reload to R. Exact uppercase NEEDLE found zero matches with caseSensitive=true; after editing the disposable file and pressing R, the same query found one match with caseSensitive=false. The remapped preview displayed x as its effective return hint. Manual fold preferences survived reopening.

Selected screenshots preserve these outcomes. This is controlled, seeded Windows evidence, not exhaustive keyboard/protocol/platform acceptance.

## Step 2 — native session/editor/file outcomes

See [verified-native-results.json](./verified-native-results.json), the read-only [probe log](./evidence.jsonl), screenshots and source-file copies.

- Navigate to user entry `8e9aa573`: retained original session/file identity, native leaf became its assistant parent `1e60596d`, and the editor contained exactly **QA BEFORE prompt restored**.
- Fork At: new session `01a1c478-3237-72ab-867a-6e1a7a748e0b` and a different file; selected user entry retained; editor empty; no automatic assistant turn.
- Fork Before: another new session `01a1c47a-d541-72ab-867a-6e1d3d912114`; selected user entry excluded; the editor contained exactly **QA BEFORE prompt restored**, verified after replacement initialization.
- Original source bytes remained unchanged (SHA-256 `fcda09fef5f336f21531ae628f45a3ec28f5a5f11a5594950e4dab59160acba5`). Fork At source bytes also remained unchanged after Fork Before; its digest is in the JSON result.
- Reopening Explorer after Fork At displayed the replacement session ID and its own five-entry snapshot, not the original ten-entry tree.

These outcomes supplement, rather than reinterpret, the earlier RPC smoke. Live provider-busy waiting/cancellation/compaction was not exercised.

## Step 3 — intentionally not run

WSL and common Unix terminal testing were explicitly excluded by the user. This is not a platform pass or an implicit amendment/waiver of Spec 0008.

## Step 4 — review outcome

An independent read-only reviewer was attempted after Steps 1/2. It failed before child startup: `Cannot locate the Pi CLI in the installed host package`. No child review ran and no host repair/upgrade was attempted.

A parent-scoped source/evidence review confirmed the following. It is **not an independent clean-review receipt**, and uninspected package paths are not declared clean.

### Code Risk — three confirmed blockers

1. **Help/long-preview viewport is unbounded** — high confidence. `extensions/tui.ts:252-315`, `733-750`. Help emits 79 lines regardless of terminal height; PageDown does not change output. Real Windows help clips the tail, including session Actions/return hints. The same rendering/input pattern leaves long previews without paging. Provide terminal-height-aware scrolling/paging while keeping controls catalog/mode-owned; verify small windows and long content, not only joined render output.

2. **Snapshot annotation overwrites native label-event payload** — high confidence. `extensions/session-snapshot.ts:37-39`. The unconditional `{ ...entry, label: reader.getLabel(entry.id) }` replaces a native label entry's actual label with undefined when that event itself has no bookmark. A frozen raw label event with `label="native-label-payload"` becomes an owned entry with label=null/undefined while the root's resolved bookmark remains correct. Preserve native entry data separately from resolved display annotations; verify label-event preview/search and bookmark updates/clears.

3. **Metadata toggle misses native label entries** — high confidence. `extensions/display.ts:162-170`. Native Pi emits type=label, but that type is absent from the metadata filter. The replacement-tree screenshot shows a Label row despite showMetadataNodes=false; a direct predicate reproduction returns labelVisible=true under the default false setting. Classify real host metadata types explicitly and test visibility through projection without losing their descendants or raw search/context availability.

These findings remain unfixed in this review-only follow-up. No producer or integrated ticket is accepted Done.

### Intent Check — incomplete

Windows session/editor gaps now have real evidence, but the confirmed display/ownership defects prevent whole-ticket acceptance. Step 3 is intentionally absent; provider-busy/error/compaction and exhaustive real-terminal latency remain unverified. Independent whole-diff review is blocked by its CLI prerequisite.

### Performance assessment

Same checked-in synthetic workload, unchanged targets and sampling method; CPU is 11th Gen Intel(R) Core(TM) i7-1165G7 @ 2.80GHz. These are **headless measurements**, not physical terminal latency. Search uses debounce=0 and Enter flush. Ready-event queueing uses setImmediate, not an artificial timer sleep.

| Workload | Isolated | During full-suite contention | Comparison |
| --- | --- | --- | --- |
| index5k | 29.58 ms | 91.50 ms | <200 ms |
| movement5k | 3.92 ms | 10.00 ms | <16 ms |
| branch5k | 6.18 ms | 39.49 ms | <20 ms |
| search5kLinear | 84.33 ms | 144.05 ms | <100 ms |
| firstOpen10kHeadless | 110.72 ms | 336.96 ms | <500 ms |
| cacheHit | 0.03 ms | 0.06 ms | <5 ms |
| snapshotRender5k25MBHeadless | 280.95 ms | 608.72 ms | <500 ms |
| assembledCommandFirstOpen10kHeadless | 98.34 ms | 203.03 ms | <500 ms |
| queuedMovement5kWithPendingEstimates | 8.81 ms | 19.12 ms | <16 ms |

The original search deviation reproduces: **144.05 ms >100 ms** during the full suite, versus **84.33 ms <100 ms** in isolation. Branch jumps and queued movement also miss under contention. The payload-heavy snapshot/render comparison is an additional diagnostic, not a new R14 target.

Interpretation: isolated algorithmic paths meet these scoped targets, but deadline compliance is not established under CPU contention. Do not treat Vitest success as timing acceptance, weaken targets, or discard the earlier 155.53 ms deviation. Broader performance acceptance needs explicit disposition of these documented deviations.

### Repeated checks

- `npm run check`: 57 files, no diagnostics.
- `npm run typecheck`: passed.
- `npm test`: **150 tests / 29 files passed**.
- `npm run smoke`: passed real isolated Pi RPC/native operations.
- `npm test -- tests/remediation-benchmark.test.ts`: passed structural/finite-measurement checks; timing outcomes are the table above.
- No production source, Spec, CONTEXT, ADR, original delivery ticket, Git history or host installation was changed in this follow-up.

## Cleanup limitation

The disposable terminal's close control and subsequent restore failed through the desktop tool. Read-only process inspection still found task-owned cmd PID 33896 and Pi PID 9220. No shared WindowsTerminal process was killed. The task window `stree-win-qa-ewFPyj` may remain minimized/running; close only that disposable window when desktop control is available. Evidence was copied here so cleanup cannot erase the recorded results.
