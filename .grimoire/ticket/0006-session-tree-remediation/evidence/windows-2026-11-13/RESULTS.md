# Essential results — 2026-11-13

These are scoped verification records, not whole-Spec acceptance.

## Native host assertions

Actual Pi 1.5.2 in Windows Terminal, disposable offline session, real SessionManager. Two historical native label events retain their original payloads; neither payload becomes a resolved bookmark on the event itself.

```json
{
  "time": "2026-11-13T03:28:26.025Z",
  "event": "check",
  "labels": [
    {
      "id": "850e4c3d",
      "raw": "LABEL_HISTORICAL",
      "owned": "LABEL_HISTORICAL",
      "annotation": null
    },
    {
      "id": "d8dd0e9d",
      "raw": "BOOKMARK_CURRENT",
      "owned": "BOOKMARK_CURRENT",
      "annotation": null
    }
  ],
  "rootBookmark": "BOOKMARK_CURRENT",
  "hidden": [
    "1e4cea00",
    "bb0273e6"
  ],
  "shown": [
    "1e4cea00",
    "850e4c3d",
    "d8dd0e9d",
    "bb0273e6",
    "23e96445"
  ],
  "rawUnchanged": true,
  "agentStarts": 0
}
```

The historical event `850e4c3d` was also inspected in the actual Explorer preview and displayed `LABEL_HISTORICAL`. Default metadata-hidden projection contained root and message descendant; enabling metadata showed the two native label events and the native thinking-level entry. The root displayed only the current resolved bookmark.

## Unprofiled timing comparisons

| Workload | Target ms | Isolated P95 | Full-suite P95 | Repeat P95 |
|---|---:|---:|---:|---:|
| index5k | 200 | 24.26 | 48.05 | 80.74 |
| movement5k | 16 | 2.37 | 8.70 | 6.30 |
| branch5k | 20 | 2.12 | 7.86 | 6.57 |
| search5kLinear | 100 | 45.22 | 85.00 | 66.00 |
| firstOpen10kHeadless | 500 | 91.24 | 157.98 | 173.89 |
| cacheHit | 5 | 0.02 | 0.04 | 0.03 |
| snapshotRender5k25MBHeadless | 500 | 272.09 | 447.28 | 390.59 |
| assembledCommandFirstOpen10kHeadless | 500 | 86.72 | 230.42 | 156.14 |
| queuedMovement5kWithPendingEstimates | 16 | 7.04 | 10.48 | 12.58 |

All nine scoped comparisons met their original targets in each of these runs. Full-suite runs used normal Vitest concurrency, with all 159 tests / 32 files; they were not serialized to remove contention. Windows x64, Intel i7-1165G7 @ 2.80 GHz, Node v26.13.1. Each JSON report records sample counts, workload dimensions and method. Search uses debounce=0 and Enter flush; queued movement starts from ready setImmediate, including pending estimator work. First-open and paint boundaries remain headless/injected, not physical input-to-pixel latency.

The old 2026-11-10 full-suite misses (search 144.05/155.53 ms, branch 39.49 ms, queued movement 19.12 ms) remain historical evidence, not discarded passes. These new runs demonstrate scoped improvement, not a guarantee under arbitrary external load or unmeasured platforms.

## CPU attribution

In-process Node inspector sampling, same current host/Node environment before and after the performance fixes. These diagnostic runs are separate from the unprofiled target comparisons.

| Phase / self samples | Before | After |
|---|---:|---:|
| Branch: buildDisplayProjection | 7 | 0 |
| Branch: extractSummary | 3 | 0 |
| Search: buildDisplayProjection | 197 | 96 |
| Search: extractSummary | 199 | 5 |
| Search: garbage collector | 45 | 14 |

Samples are statistical attribution, not milliseconds. Deterministic regressions also verify projection identity is reused for focus-irrelevant policies, focus-sensitive folds still update, summaries distinguish thinking visibility, and snapshot revisions invalidate cached text.

## Native viewport observations

- Help: first `1-22/82`, successive pages `23-44/82`, `45-66/82`, End `61-82/82`, Home `1-22/82`. Final body row includes `session.close`; header and close hints remain visible.
- The configured `view.pageDown=n` advances pages in help and preview; effective hints and the catalog show n. A separate PageDown attempt lacked a reliable Pi input receipt, so it is **not** claimed as native proof that the old binding was inactive; the unit regression checks that case.
- Long preview: first `1-22/162`, n `23-44/162`, End `141-162/162` with `TAIL_FIX_VERIFIED`.
- Resized window to 1000x335: End `158-162/162`, Home `1-5/162`; title/footer remained visible. Restored original 1235x688 frame before metadata checks.
- Metadata on/off and raw label preview were observed in screenshots. Browsing did not request Navigate/Fork or an automatic assistant turn.
- Native log: 33 received key events, 0 agent starts, 0 blocked plain prompts.

Native source fixture: session `01a1d2e5-44b4-7435-86e2-1d9d0b321045`, root `1e4cea00`, long message `bb0273e6`.

## Limits and delivery artifacts

Keyboard delivery was intermittent. Background attempts were observed before foreground escalation. An n background press had actually landed and an extra foreground n advanced one additional harmless inspection page; the recorded page ranges reflect the received inputs, not an idealized sequence. One foreground command entry stopped at `/qa`; that prefix was read back and completed using native Tab before Return. No partially delivered text was blindly replayed. These artifacts cannot establish physical latency.

Window `7274920`, PID `40932`, titled `stree-blocker-qa-zMJDsJ`, was closed through its own tab-close UIA control. A fresh window listing retained shared window `459386` / PID `19440`; a command-line ownership query found no task-owned Pi/cmd processes remaining.

Native GUI clearing of a bookmark was not repeated; real-SessionManager regression tests cover clearing and preserved historical payloads. Live busy/cancel/error/compaction, broad terminal/platform acceptance, and physical timing remain outside this focused pass. WSL/common Unix testing was explicitly excluded and was not performed.


## Post-review source fixes (177 tests / 33 files)

[Independent review and dispositions](./REVIEW.md) records the two Required findings and failing-first fixes. These fresh unprofiled measurements are after those fixes; all nine comparisons meet the same targets. The newer two native GUI cases remain unverified due to desktop-tool failure, not counted as passes.

| Workload | Target | Isolated P95 | Full-suite P95 |
|---|---:|---:|---:|
| index5k | 200 | 23.05 | 44.54 |
| movement5k | 16 | 3.38 | 7.42 |
| branch5k | 20 | 2.71 | 3.35 |
| search5kLinear | 100 | 44.61 | 68.18 |
| firstOpen10kHeadless | 500 | 107.52 | 149.38 |
| cacheHit | 5 | 0.04 | 0.04 |
| snapshotRender5k25MBHeadless | 500 | 334.99 | 444.01 |
| assembledCommandFirstOpen10kHeadless | 500 | 87.11 | 130.16 |
| queuedMovement5kWithPendingEstimates | 16 | 15.42 | 9.23 |

The 20-second large-paragraph regression allowance is a runner safeguard, not a changed interaction target or physical latency measurement.
