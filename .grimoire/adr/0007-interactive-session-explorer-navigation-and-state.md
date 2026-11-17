# Interactive session explorer navigation, state tiers, and inspection

**Status:** Proposed
**Date:** 2026-11-13

## Context

The initial `pi-session-tree-explorer` delivered an enhanced visual tree viewer with keyboard actions, search, and native session mutations (`navigateTree` and `fork`). However, practical usage in coding agent sessions revealed four critical UX and architectural gaps:
1. **Accidental context mutation vs. inspection:** Browsing and inspecting historical nodes was conflated with navigation, risking unintended `navigateTree` triggers and active context displacement.
2. **Configuration snapshot pollution:** Persisting full `displayOptions` snapshots into per-session view-state JSON files (`state/session-tree/<session-id>.json`) masked user global configuration changes and hindered schema migrations.
3. **Tool noise obscuring reasoning:** Coding agents generate dozens of consecutive tool calls per turn. Rendering every tool node without aggregation created excessive visual noise and made branch objectives difficult to discern.
4. **Unreachable branch tips and lack of restoration:** Navigating deep into subtrees offered no safe, discoverable mechanism to reach branch tips or restore the prior session leaf before navigation.

## Decision

Evolve `pi-session-tree-explorer` from a passive visual tree into an **Interactive Session Explorer for Coding Agents**:

1. **Three-Tier State Architecture:**
   - **Global Config:** Base defaults loaded from extension schemas and `session-tree.json`.
   - **Session View State:** Isolated per-session file storing *only* explicit user overrides (manual fold/expand overrides, user-toggled filter overrides, last cursor position). Never snapshot whole configuration objects. Versioned schema with automatic migration for legacy v1 state files.
   - **Runtime State:** In-memory state where `activeLeafId` is strictly owned by `SessionManager`, completely decoupled from `selectedNodeId` (tree cursor) and `previewNodeId` (preview focus).

2. **Decoupled Navigation Semantics & Restoration Stack:**
   - **Preview (`Tab` / `p`):** Read-only inspection of node content and metadata; never executes `navigateTree` or alters the session leaf.
   - **Go (`Enter`):** Executes native `navigateTree` for real entry nodes, preserving native editor-restoration semantics when landing on user messages. Expanding virtual summaries in-place never triggers session navigation.
   - **Branch Tip Navigation (`g`):** Computes reachable tips in the selected subtree. If multiple tips exist, displays an interactive tip picker. Explicitly warns of editor prompt restoration when a tip is a user message.
   - **Navigation History Stack (`r` / Restore Previous):** Tracks actual leaf transitions across navigation events, allowing deterministic restoration of prior working leaves and branch locations.

3. **Projection-Level Tool Aggregation & Smart Folding:**
   - Group consecutive tool calls and results into virtual summary nodes (`[Tools ×N] names...`) in the projection layer without altering raw session entry IDs or topology.
   - Introduce `fold.mode: smart` to keep user turns, key assistant milestones, and fork points visible while folding verbose tool chains and inactive branches.

4. **Responsive Outline + Preview Layout:**
   - Dual-pane layout on terminals with width >= 100 columns (60% Outline, 40% Node Preview).
   - Responsive graceful fallback on narrow terminals (< 100 columns) to single-column Outline with drawer/overlay preview modal.

5. **Two-Tier Branch Comparison (Progressive Enhancement):**
   - Core level: Zero-dependency session topology diff (turns, tool calls, tokens, outcome summaries).
   - Workspace level: Progressive enhancement using local git diff when executed inside a git repository with resolvable commits/snapshots.

## Consequences

- **Enables:** Safe, non-destructive exploration of massive coding agent sessions; immediate return to prior work; transparent branch outcomes; clean configuration inheritance.
- **Constrains:** State persistence must avoid full-object snapshots; virtual projection nodes must never be passed to host mutation APIs; git operations are optional and non-blocking.
