# Windows blocker-fix follow-up — 2026-11-13

**Status:** the three confirmed blockers are addressed with failing-first regressions and focused Windows evidence. Whole-ticket/Spec 0008 acceptance remains incomplete.

- HEAD: `03f4468b8333c9b2ce298f2b2a91ce2ec6747fa4`.
- Pre-review/native checkpoint fingerprint: `c7fa6768f925bf55c34fa107ddae24abc5dfcdce` (the earlier Windows screenshots, not the subsequent review fixes).
- Source: `packages/pi-session-tree-explorer/`; all work remains uncommitted.
- Runtime: already-installed Pi 1.5.2, Windows Terminal, Node v26.13.1. The old hard-coded Pi 1.5.0 executable was no longer present; no host repair or upgrade was attempted.
- [Essential results](./RESULTS.md) preserve native assertions, timings, attribution, keyboard-delivery limitations and cleanup.

## Changes and regressions

1. **Raw label ownership:** `captureSessionSnapshot` preserves raw entry fields and supplies separately resolved `TreeIndex.displayLabelsById`. Display, labeled filtering, search, previews and label editing consume the appropriate owner. Historical native label payloads remain inspectable/searchable/copyable after relabeling or clearing.
2. **Metadata visibility:** native `type=label` entries obey the metadata toggle; hidden metadata does not drop descendants. A label event's raw payload does not make that event a bookmark.
3. **Bounded inspection:** a component-owned line viewport bounds help/preview height within the existing inline renderer; it needs no newer layout-node SDK API. Six catalog-owned, mode-qualified and remappable Actions provide line/page/first/last movement, making 80 catalog Actions while retaining the original 73 IDs and existing view.settings. Preview wrapping is cached; resize clamps offsets; mode reentry resets position; tiny heights prioritize body access.
4. **Measured interaction work:** focus-independent fold policies no longer rebuild for branch focus changes; immutable summaries are cached per content revision and thinking visibility; search clear reuses its requested projection instead of building it twice. Caches are component-owned and cleared on disposal.

New regressions: `label-ownership.test.ts` (3 initially failing cases), `inspection-paging.test.ts` (3 initially failing cases), `projection-work.test.ts` (two initially failing cost regressions plus focus/thinking correctness coverage). Previous Action inventory and label tests were updated to assert the new separation and additional inspection Actions, not to remove original contracts.

## Verification

- Biome: 61 files, no diagnostics.
- `npm run typecheck`: passed.
- `npm test`: 159 tests / 32 files, repeatedly passed.
- `npm run smoke`: independently installed offline fixture and actual Pi RPC/native Navigate/Fork file outcomes passed on Pi 1.5.2. The smoke now uses pi from PATH, with PI_BINARY override; an initial missing old executable failure is not hidden.
- `git diff --check`: passed.
- Actual Windows /stree: help paging and Home/End, remapped n, long preview and small-window resize, metadata show/hide, historical native label preview, close behavior and native raw-data assertions passed.
- All recorded unprofiled scoped comparisons met unchanged targets in an isolated run and two normally concurrent full-suite runs. Profiled timings are diagnostic only.
- Independent review: S1001 requested changes for two Required findings; both were reproduced and fixed. Continued review S1003 **approved the focused scope**, resolving both with no new/directly related defects. Current checks: 177 tests / 33 files, Biome 62 files, type check and smoke pass. See [receipt and dispositions](./REVIEW.md). The two newer physical GUI cases remain unverified after desktop-tool failure.

## Acceptance boundaries

No WSL/Unix tests, global agent settings changes, host upgrades, sibling-plugin changes, commits or pushes. Tests and GUI used disposable offline history/configuration. This pass does not accept all producer tickets or the whole Spec, does not waive excluded-platform requirements, and does not establish exhaustive live busy/cancel/error/compaction or physical input-to-pixel performance.

PNG, JSON and JSONL copies are local supporting artifacts ignored by existing .grimoire rules. The essential assertions and outcomes are preserved in Markdown; ignore rules/staging were not changed. Raw CPU profiles remain in the disposable local directory `C:/Users/ADMINI~1/AppData/Local/Temp/stree-blocker-fixes-zMJDsJ`.
