import { afterEach, describe, expect, it, jest, mock } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
	type ExtensionAPI,
	type ExtensionCommandContext,
	SessionManager,
} from "@earendil-works/pi-coding-agent";
import { createActionRegistry } from "../extensions/actions.ts";
import {
	compareBranches,
	formatBranchDiffLines,
} from "../extensions/branch-diff.ts";
import plugin from "../extensions/index.ts";
import {
	executeSessionIntent,
	NavigationHistory,
} from "../extensions/session-effects.ts";
import { createInitialState } from "../extensions/state.ts";
import { buildTreeIndex } from "../extensions/tree-index.ts";
import { SessionTreeComponent } from "../extensions/tui.ts";
import type { ExplorerResult, SessionEntry } from "../extensions/types.ts";
import { getViewStateFilePath } from "../extensions/view-state.ts";
import { restoreAgentDir, setAgentDir } from "./agent-dir-fixture.ts";

describe("Spec 0008 v2.0 E01-E07 Integrated Acceptance", () => {
	const tempDirs: string[] = [];

	afterEach(async () => {
		jest.useRealTimers();
		restoreAgentDir();
		for (const dir of tempDirs.splice(0)) {
			await rm(dir, {
				recursive: true,
				force: true,
				maxRetries: 5,
				retryDelay: 100,
			});
		}
	});

	it("E01: Tab/p preview never mutates active session leaf", () => {
		const entries: SessionEntry[] = [
			{
				type: "message",
				id: "root",
				parentId: null,
				timestamp: "T0",
				message: { role: "user", content: "Initial task" },
			},
			{
				type: "message",
				id: "leaf-a",
				parentId: "root",
				timestamp: "T1",
				message: { role: "user", content: "Active branch leaf" },
			},
		];
		const index = buildTreeIndex(entries);
		const state = createInitialState("e01-v2", {
			selectedEntryId: "root",
			sessionLeafId: "leaf-a",
		});
		const done = mock();
		const comp = new SessionTreeComponent({
			tui: { requestRender() {}, terminal: { rows: 24, columns: 120 } },
			theme: {},
			done,
			index,
			state,
		});

		comp.handleInput("\t");
		expect(state.mode).toBe("preview");
		expect(state.previewNodeId).toBe("root");
		expect(state.sessionLeafId).toBe("leaf-a");
		expect(done).not.toHaveBeenCalled();

		comp.handleInput("p");
		expect(state.mode).toBe("normal");
		expect(state.sessionLeafId).toBe("leaf-a");
		expect(done).not.toHaveBeenCalled();
		comp.dispose();
	});

	it("E02 & E03: Branch tip single jump, multi-tip picker, user notice, and navigation restore stack", async () => {
		jest.useFakeTimers();
		const entries: SessionEntry[] = [
			{
				type: "message",
				id: "root",
				parentId: null,
				timestamp: "T0",
				message: { role: "user", content: "Root" },
			},
			{
				type: "message",
				id: "fork",
				parentId: "root",
				timestamp: "T1",
				message: { role: "assistant", content: "Fork" },
			},
			{
				type: "message",
				id: "tip-1",
				parentId: "fork",
				timestamp: "T2",
				message: { role: "assistant", content: "Branch 1 result" },
			},
			{
				type: "message",
				id: "tip-2",
				parentId: "fork",
				timestamp: "T3",
				message: { role: "assistant", content: "Branch 2 result" },
			},
			{
				type: "message",
				id: "tip-3",
				parentId: "fork",
				timestamp: "T4",
				message: { role: "user", content: "Branch 3 user prompt" },
			},
		];
		const index = buildTreeIndex(entries);
		const history = new NavigationHistory();
		let activeLeaf = "tip-1";
		const byId = new Map(entries.map((e) => [e.id, e]));
		const ctx = {
			sessionManager: {
				getSessionId: () => "e02-e03",
				getLeafId: () => activeLeaf,
				getEntry: (id: string) => byId.get(id),
			},
			isIdle: () => true,
			navigateTree: mock(async (targetId: string) => {
				activeLeaf = targetId;
				return { cancelled: false };
			}),
		} as unknown as ExtensionCommandContext;

		const state = createInitialState("e02-e03", {
			selectedEntryId: "fork",
			sessionLeafId: activeLeaf,
			displayOptions: {
				showAssistantNodes: true,
				showToolNodes: false,
				showThinkingNodes: false,
				showMetadataNodes: false,
				showCompactionNodes: true,
				userOnly: false,
				branchOnly: false,
				labeledOnly: false,
				depthMode: "turn",
				showDepth: true,
				maxMessageLength: 80,
				showNodeId: false,
				showTimestamps: false,
				layout: "normal",
			},
			foldOptions: {
				mode: "all",
				collapseInactiveBranches: false,
				collapseLinearPaths: false,
				rememberManualOverrides: false,
				maxExpandDepth: 0,
			},
		});

		let emitted: ExplorerResult | undefined;
		const comp = new SessionTreeComponent({
			tui: { requestRender() {} },
			theme: {},
			done: (r) => {
				emitted = r;
			},
			index,
			state,
			navigationHistory: history,
		});

		// E03: Press g on fork -> 3-tip picker opens -> pick tip-2
		comp.handleInput("g");
		jest.advanceTimersByTime(900);
		expect(comp.render(100).join("\n")).toContain(
			"SELECT BRANCH TIP (3 reachable)",
		);
		comp.handleInput("j");
		comp.handleInput("\r");
		expect(emitted).toEqual({ type: "navigate", entryId: "tip-2" });

		// E02: Execute navigate -> pushes tip-1 onto stack, then 'r' restores tip-1
		const { getDefaultConfig } = await import("../extensions/config-schema.ts");
		const cfg = getDefaultConfig();
		await executeSessionIntent({
			intent: emitted as ExplorerResult,
			expectedSessionId: "e02-e03",
			ctx,
			config: cfg,
			navigationHistory: history,
		});
		expect(activeLeaf).toBe("tip-2");
		expect(history.toArray()).toEqual(["tip-1"]);

		emitted = undefined;
		state.sessionLeafId = activeLeaf;
		state.selectedEntryId = activeLeaf;
		const comp2 = new SessionTreeComponent({
			tui: { requestRender() {} },
			theme: {},
			done: (r) => {
				emitted = r;
			},
			index,
			state,
			navigationHistory: history,
		});
		comp2.handleInput("r");
		expect<unknown>(emitted).toEqual({
			type: "navigate",
			entryId: "tip-1",
			restore: true,
		});
		await executeSessionIntent({
			intent: emitted as unknown as ExplorerResult,
			expectedSessionId: "e02-e03",
			ctx,
			config: cfg,
			navigationHistory: history,
		});
		expect(activeLeaf).toBe("tip-1");
		expect(history.isEmpty()).toBe(true);
	});

	it("E04 & E06: Tool aggregation, dual-pane live preview, and narrow fallback resize", () => {
		const entries: SessionEntry[] = [
			{
				type: "message",
				id: "u1",
				parentId: null,
				timestamp: "T0",
				message: { role: "user", content: "Inspect repository" },
			},
		];
		let prev = "u1";
		for (let i = 0; i < 6; i++) {
			const id = `tr${i}`;
			entries.push({
				type: "message",
				id,
				parentId: prev,
				timestamp: `T${i + 1}`,
				message: {
					role: "toolResult",
					toolName: i % 2 === 0 ? "read" : "grep",
					content: `tool output ${i}`,
				},
			});
			prev = id;
		}
		entries.push({
			type: "message",
			id: "a-final",
			parentId: prev,
			timestamp: "T7",
			message: { role: "assistant", content: "Inspection complete" },
		});
		const index = buildTreeIndex(entries);
		const state = createInitialState("e04-e06", {
			selectedEntryId: "u1",
			sessionLeafId: "a-final",
			foldOptions: {
				mode: "smart",
				collapseInactiveBranches: false,
				collapseLinearPaths: false,
				rememberManualOverrides: true,
				maxExpandDepth: 0,
			},
		});
		const comp = new SessionTreeComponent({
			tui: { requestRender() {}, terminal: { rows: 24, columns: 120 } },
			theme: {},
			done: () => {},
			index,
			state,
		});

		comp.handleInput("j");
		const dualView = comp.render(120).join("\n");
		expect(dualView).toContain("▸ [Tools ×6] read, grep");
		expect(dualView).toContain("│NODE PREVIEW");
		expect(dualView).toContain("[TOOL GROUP] 6 calls");

		// Enter expands tool group in-place
		comp.handleInput("\r");
		expect(comp.getVisibleNodes().some((n) => n.realId === "tr3")).toBe(true);

		// E06: Resize to 80 columns -> single-column fallback + Tab opens modal preview
		const narrowView = comp.render(80).join("\n");
		expect(narrowView).not.toContain("│NODE PREVIEW");
		comp.handleInput("\t");
		expect(state.mode).toBe("preview");
		comp.handleInput("\u001b");
		expect(state.mode).toBe("normal");
		comp.dispose();
	});

	it("E05: Migrates legacy v1 view state without overriding global config", async () => {
		const dir = await mkdtemp(join(tmpdir(), "pi-stree-e05-"));
		tempDirs.push(dir);
		setAgentDir(dir);

		const session = SessionManager.inMemory(dir);
		const u1 = session.appendMessage({
			role: "user",
			content: "Start",
			timestamp: Date.now(),
		});
		const a1 = session.appendMessage({
			role: "assistant",
			content: [{ type: "text", text: "Visible from global config" }],
			api: "anthropic-messages",
			provider: "anthropic",
			model: "claude-sonnet-4-5",
			usage: {
				input: 1,
				output: 1,
				cacheRead: 0,
				cacheWrite: 0,
				totalTokens: 2,
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
			},
			stopReason: "stop",
			timestamp: Date.now(),
		});
		const sid = session.getSessionId();
		const statePath = getViewStateFilePath(dir, sid);
		await mkdir(dirname(statePath), { recursive: true });
		await writeFile(
			statePath,
			JSON.stringify({
				version: 1,
				sessionId: sid,
				manualExpandedIds: [u1],
				displayOptions: { showAssistantNodes: false },
			}),
		);
		await writeFile(
			join(dir, "session-tree.json"),
			JSON.stringify({ display: { showAssistantNodes: true } }),
		);

		let handler:
			| ((args: string, ctx: ExtensionCommandContext) => Promise<void>)
			| undefined;
		plugin({
			on() {},
			events: { on() {}, emit() {} },
			registerCommand(_n: string, def: { handler: typeof handler }) {
				handler = def.handler;
			},
			setLabel() {},
		} as unknown as ExtensionAPI);

		let rendered = "";
		await handler?.("", {
			cwd: dir,
			mode: "tui",
			sessionManager: session,
			isProjectTrusted: () => false,
			isIdle: () => true,
			getContextUsage: () => null,
			ui: {
				notify: () => {},
				custom: async (
					factory: (
						t: unknown,
						th: unknown,
						k: unknown,
						d: (r: ExplorerResult) => void,
					) => SessionTreeComponent,
				) => {
					let res: ExplorerResult | undefined;
					const comp = factory({ requestRender() {} }, {}, {}, (r) => {
						res = r;
					});
					rendered = comp.render(120).join("\n");
					expect(comp.getVisibleNodes().some((n) => n.realId === a1)).toBe(
						true,
					);
					comp.handleInput("q");
					return res;
				},
			},
		} as unknown as ExtensionCommandContext);

		expect(rendered).toContain("Visible from global config");
		const migrated = JSON.parse(await readFile(statePath, "utf8"));
		expect(migrated.version).toBe(2);
		expect(migrated.displayOptions).toBeUndefined();
		expect(migrated.manualExpandedIds).toEqual([u1]);
	});

	it("E07: Two-tier branch diff works inside and outside git repositories and preserves 87 actions", async () => {
		expect(createActionRegistry().size).toBe(87);
		const gitDir = await mkdtemp(join(tmpdir(), "pi-stree-e07-git-"));
		tempDirs.push(gitDir);
		execFileSync("git", ["init", "-b", "main"], {
			cwd: gitDir,
			windowsHide: true,
		});
		execFileSync("git", ["config", "user.email", "t@example.com"], {
			cwd: gitDir,
			windowsHide: true,
		});
		execFileSync("git", ["config", "user.name", "Test"], {
			cwd: gitDir,
			windowsHide: true,
		});
		await writeFile(join(gitDir, "app.ts"), "export const x = 1;\n", "utf8");
		execFileSync("git", ["add", "app.ts"], { cwd: gitDir, windowsHide: true });
		execFileSync("git", ["commit", "-m", "init"], {
			cwd: gitDir,
			windowsHide: true,
		});
		await writeFile(join(gitDir, "app.ts"), "export const x = 2;\n", "utf8");

		const index = buildTreeIndex([
			{
				type: "message",
				id: "r",
				parentId: null,
				timestamp: "T0",
				message: { role: "user", content: "start" },
			},
			{
				type: "message",
				id: "a",
				parentId: "r",
				timestamp: "T1",
				message: { role: "assistant", content: "branch A" },
			},
			{
				type: "message",
				id: "b",
				parentId: "r",
				timestamp: "T2",
				message: { role: "assistant", content: "branch B" },
			},
		]);
		const diff = await compareBranches({
			index,
			branchAId: "a",
			branchBId: "b",
			cwd: gitDir,
		});
		expect(diff.topology.commonAncestorId).toBe("r");
		expect(diff.gitDiff.available).toBe(true);
		expect(formatBranchDiffLines(diff, 100).join("\n")).toContain("app.ts");
	}, 15000);
});
