# Independent review and dispositions

## Current receipt — S1003

**APPROVE (focused scope).** Independent code-reviewer completed the continued read-only review and verified package fingerprint `f69c547252a35379c57bd50a22c2594fbf538566` at HEAD `03f4468b8333c9b2ce298f2b2a91ce2ec6747fa4`.

Both S1001 Required findings are **RESOLVED**. No new/directly related defects were identified in this focused scope.

- **Preview overflow:** `extensions/tui.ts:321-324` appends wrapped lines iteratively; `inspection-view.ts:48-64` emits only bounded viewport rows. The 2 MiB single-paragraph regression reaches its tail at width 8.
- **Summary/raw navigation and focus:** `display.ts:486-497` resolves explicit raw anchors. Selected-entry branch traversals normalize before raw lookup; `branch.active` uses the actual validated Session Leaf. `actions.ts:88-102` keeps focused branch/path IDs real. All 13 branch Actions have component-input coverage.
- **Adjacent scope:** Root ownership in a multi-root forest, sibling-collapse raw IDs, disabled reveal/focus-follow, always-follow focus, and projection reconciliation were reviewed without additional findings.
- **Intent Check:** the two fixes and directly related anchor/focus/Root/sibling behavior align with the request. The catalog remains the original 73 IDs plus view.settings and six inspection Actions (80 total); native /tree and post-UI mutation boundaries remain intact.

This is independent **static** approval, not independent runtime verification. Parent results remain 177 tests / 33 files, Biome 62 files, type check, isolated RPC smoke and scoped timing reports. The two newer native GUI cases remain unverified after desktop-tool failure. WSL/Unix remains excluded, physical latency and exhaustive live busy/cancel/error/compaction remain incomplete, and no whole ticket or whole Spec is accepted.

The S1001 request-changes receipt, producer fixes, S1002 timeout and continuation records below are historical steps; their earlier pending wording is superseded by this current receipt.

## S1001 — independent Code Risk / Intent Check

Reviewer: code-reviewer, fresh background session, openai-codex/gpt-6.1-sol. Completed after read-only inspection of tracked/untracked code, requirements, consumers and tests. No files or tests were changed/run by the reviewer. Reviewed package fingerprint: `c7fa6768f925bf55c34fa107ddae24abc5dfcdce`.

**Verdict: REQUEST CHANGES. Two Required findings, no Critical findings.**

1. `extensions/tui.ts:321-322`: spreading every wrapped line into `body.push` can exceed the JavaScript argument limit for a multi-megabyte single paragraph at narrow width. Existing short-paragraph paging tests missed it.
2. `extensions/actions.ts:372-377,402`: branch traversal received virtual display IDs instead of explicit raw anchors; summary b in an r→a/b/c fixture could not move to c with ]b, and virtual IDs could enter focused branch/path state.

Intent Check aligned raw label separation, native metadata filtering, preserved original 73 Action IDs, native /tree and post-UI session operations with the request. Bounded inspection was not approved because of finding 1. Timing evidence was correctly scoped. Whole-Spec/platform/live-runtime gaps remained unverified rather than fabricated defects.

## Producer response

Both findings were reproduced before their fixes:

- A 2 MiB single-paragraph preview at width 8 threw `RangeError: Maximum call stack size exceeded`.
- Actual component input starting from a real generated summary failed branch traversal/focus regressions.
- A related Root-from-summary case also failed before normalization.

Fixes append wrapped lines iteratively; all raw branch traversals, Root navigation and sibling collapsing consume explicit projected anchors. Focus updates resolve a real target independently of display selection. Existing projection completion maps raw results back to a real or virtual display row according to reveal/focus policy.

`summary-branch-navigation.test.ts` covers all 13 branch Actions from actual summaries, disabled auto-reveal/focus-follow, always-follow focus, sibling collapse and a later Root group. The large-paragraph case reaches its tail without a session operation.

Current checks: **177 tests / 33 files**, Biome **62 files**, type check, offline independent-package Pi 1.5.2 RPC smoke, and whitespace checks pass. New isolated/full-suite reports meet unchanged scoped targets; detailed numbers follow in RESULTS.md.

A second physical Windows attempt did **not** produce verification: launch returned an unknown-outcome desktop-tool failure, and a subsequent read-only window listing also failed. No new probe readiness log exists and the task-owned Pi/cmd query returned an empty array. No blind relaunch, global settings edit, host repair/upgrade or shared Terminal kill was attempted. The earlier native evidence remains evidence for its earlier fingerprint, not a claimed re-run of these new cases. GUI-resource outcome is unverified because window enumeration is unavailable.

**Focused independent re-review: pending.** Neither this producer response nor the earlier 159-test/native checkpoint converts S1001 into an approval. Whole tickets remain In Progress.


Post-review package fingerprint: `f69c547252a35379c57bd50a22c2594fbf538566`. A synchronous delegate attempt failed before child startup with `Cannot locate the Pi CLI in the installed host package`; it produced no review. The known-working code-reviewer background route is being used instead. No host repair or repeated delegate attempt was made.


Focused independent re-review job **S1002** has started successfully via code-reviewer; its completed report has not yet been received. The synchronous engine's startup failure is not counted as a review. Package source remains frozen at the post-review fingerprint while S1002 runs.


S1002 timed out after 600000 ms without delivering a verdict. Its partial read-only review was preserved and continued once as **S1003**, with scope reiterated to finish the two-findings re-review rather than restart a broad audit. Source fingerprint remains unchanged. S1002's timeout is neither an approval nor an additional source defect; independent disposition is still pending.
