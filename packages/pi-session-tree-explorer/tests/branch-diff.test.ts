import { afterEach, describe, expect, it } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	compareBranches,
	computeTopologyBranchDiff,
	findCommonAncestor,
	formatBranchDiffLines,
} from "../extensions/branch-diff.ts";
import { createInitialState } from "../extensions/state.ts";
import { buildTreeIndex } from "../extensions/tree-index.ts";
import { SessionTreeComponent } from "../extensions/tui.ts";
import type { SessionEntry } from "../extensions/types.ts";

function createCompareFixture(): SessionEntry[] {
	return [
		{
			type: "message",
			id: "root",
			parentId: null,
			timestamp: "T0",
			message: { role: "user", content: "Refactor storage layer" },
		},
		{
			type: "message",
			id: "ancestor",
			parentId: "root",
			timestamp: "T1",
			message: { role: "assistant", content: "Let us evaluate options." },
		},
		{
			type: "message",
			id: "a-u1",
			parentId: "ancestor",
			timestamp: "T2",
			message: { role: "user", content: "Try Prisma" },
		},
		{
			type: "message",
			id: "a-tc1",
			parentId: "a-u1",
			timestamp: "T3",
			message: {
				role: "assistant",
				content: [
					{
						id: "call_1",
						type: "toolCall",
						name: "read",
						arguments: { path: "prisma/schema.prisma" },
					},
					{
						id: "call_2",
						type: "toolCall",
						name: "bash",
						arguments: { command: "npx prisma validate" },
					},
				],
			},
		},
		{
			type: "message",
			id: "a-tr1",
			parentId: "a-tc1",
			timestamp: "T4",
			message: {
				role: "toolResult",
				toolCallId: "call_1",
				toolName: "read",
				content: "schema ok",
				isError: false,
			},
		},
		{
			type: "message",
			id: "a-tr2",
			parentId: "a-tr1",
			timestamp: "T5",
			message: {
				role: "toolResult",
				toolCallId: "call_2",
				toolName: "bash",
				content: "validation failed",
				isError: true,
			},
		},
		{
			type: "message",
			id: "b-u1",
			parentId: "ancestor",
			timestamp: "T6",
			message: { role: "user", content: "Try Drizzle ORM" },
		},
		{
			type: "message",
			id: "b-tc1",
			parentId: "b-u1",
			timestamp: "T7",
			message: {
				role: "assistant",
				content: [
					{
						id: "call_3",
						type: "toolCall",
						name: "edit",
						arguments: { path: "src/db/schema.ts" },
					},
				],
			},
		},
		{
			type: "message",
			id: "b-tr1",
			parentId: "b-tc1",
			timestamp: "T8",
			message: {
				role: "toolResult",
				toolCallId: "call_3",
				toolName: "edit",
				content: "updated schema",
				isError: false,
			},
		},
		{
			type: "message",
			id: "b-u2",
			parentId: "b-tr1",
			timestamp: "T9",
			message: { role: "user", content: "Run tests" },
		},
		{
			type: "message",
			id: "b-tip",
			parentId: "b-u2",
			timestamp: "T10",
			message: {
				role: "assistant",
				content: "Drizzle implementation and tests passed.",
			},
		},
	];
}

describe("T0006: Two-Tier Branch Comparison (Topology + Git Diff)", () => {
	const tempDirs: string[] = [];

	afterEach(async () => {
		for (const dir of tempDirs.splice(0)) {
			await rm(dir, {
				recursive: true,
				force: true,
				maxRetries: 5,
				retryDelay: 100,
			});
		}
	});

	it("computes common ancestor, turn/tool/token deltas, and outcome status accurately", () => {
		const index = buildTreeIndex(createCompareFixture());
		expect(findCommonAncestor(index, "a-tr2", "b-tip")).toBe("ancestor");

		const diff = computeTopologyBranchDiff(index, "a-tr2", "b-tip");
		expect(diff.commonAncestorId).toBe("ancestor");
		expect(diff.branchA.turnCount).toBe(1);
		expect(diff.branchA.toolCalls.total).toBe(2);
		expect(diff.branchA.toolCalls.errorCount).toBe(1);
		expect(diff.branchA.toolCalls.byTool).toEqual({ read: 1, bash: 1 });
		expect(diff.branchA.outcomeStatus).toBe("error");
		expect(diff.branchA.filesTouched).toEqual(["prisma/schema.prisma"]);

		expect(diff.branchB.turnCount).toBe(2);
		expect(diff.branchB.toolCalls.total).toBe(1);
		expect(diff.branchB.toolCalls.errorCount).toBe(0);
		expect(diff.branchB.toolCalls.byTool).toEqual({ edit: 1 });
		expect(diff.branchB.outcomeStatus).toBe("completed");
		expect(diff.branchB.filesTouched).toEqual(["src/db/schema.ts"]);

		expect(diff.turnDelta).toBe(1);
		expect(diff.toolCallDelta).toBe(-1);
		expect(diff.branchA.estimatedTokens).toBeGreaterThan(0);
		expect(diff.branchB.estimatedTokens).toBeGreaterThan(0);
	});

	it("degrades gracefully outside a git repository without errors", async () => {
		const nonGitDir = await mkdtemp(join(tmpdir(), "pi-stree-nongit-"));
		tempDirs.push(nonGitDir);
		const index = buildTreeIndex(createCompareFixture());

		const res = await compareBranches({
			index,
			branchAId: "a-tr2",
			branchBId: "b-tip",
			cwd: nonGitDir,
		});

		expect(res.topology.commonAncestorId).toBe("ancestor");
		expect(res.gitDiff.available).toBe(false);
		expect(res.gitDiff.reason).toContain("Workspace file diff unavailable");

		const formatted = formatBranchDiffLines(res, 100).join("\n");
		expect(formatted).toContain("Common Ancestor: ancestor");
		expect(formatted).toContain("Workspace file diff unavailable");
	});

	it("displays workspace git diff summary when inside a git repository", async () => {
		const gitDir = await mkdtemp(join(tmpdir(), "pi-stree-git-"));
		tempDirs.push(gitDir);
		execFileSync("git", ["init", "-b", "main"], {
			cwd: gitDir,
			windowsHide: true,
		});
		execFileSync("git", ["config", "user.email", "test@example.com"], {
			cwd: gitDir,
			windowsHide: true,
		});
		execFileSync("git", ["config", "user.name", "Test"], {
			cwd: gitDir,
			windowsHide: true,
		});
		await writeFile(join(gitDir, "db.ts"), "export const v = 1;\n", "utf8");
		execFileSync("git", ["add", "db.ts"], { cwd: gitDir, windowsHide: true });
		execFileSync("git", ["commit", "-m", "init"], {
			cwd: gitDir,
			windowsHide: true,
		});
		await writeFile(
			join(gitDir, "db.ts"),
			"export const v = 2;\nexport const pool = true;\n",
			"utf8",
		);

		const index = buildTreeIndex(createCompareFixture());
		const res = await compareBranches({
			index,
			branchAId: "a-tr2",
			branchBId: "b-tip",
			cwd: gitDir,
		});

		expect(res.gitDiff.available).toBe(true);
		expect(res.gitDiff.statLines.join("\n")).toContain("db.ts");
		expect(formatBranchDiffLines(res, 100).join("\n")).toContain("db.ts");
	}, 15000);

	it("drives interactive branch.diff selection and scrollable view in TUI", async () => {
		const nonGitDir = await mkdtemp(join(tmpdir(), "pi-stree-diff-tui-"));
		tempDirs.push(nonGitDir);
		const index = buildTreeIndex(createCompareFixture());
		const state = createInitialState("diff-tui", {
			selectedEntryId: "a-tr2",
			sessionLeafId: "a-tr2",
			displayOptions: {
				showAssistantNodes: true,
				showToolNodes: true,
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

		const comp = new SessionTreeComponent({
			tui: { requestRender() {}, terminal: { rows: 24, columns: 100 } },
			theme: {},
			done: () => {},
			index,
			state,
			cwd: nonGitDir,
		});

		comp.dispatch("branch.diff");
		const pickAView = comp.render(100).join("\n");
		expect(pickAView).toContain("SELECT BRANCH A");

		comp.handleInput("\r");
		const pickBView = comp.render(100).join("\n");
		expect(pickBView).toContain("SELECT BRANCH B vs a-tr2");

		comp.handleInput("\r");
		await comp.whenSettled();

		const diffView = comp.render(100).join("\n");
		expect(diffView).toContain("BRANCH DIFF [a-tr2 vs b-tip]");
		expect(diffView).toContain("Common Ancestor: ancestor");
		expect(diffView).toContain("1 read, 1 bash");
		expect(diffView).toContain("1 edit");

		comp.handleInput("j");
		comp.handleInput("q");
		expect(comp.render(100).join("\n")).not.toContain("BRANCH DIFF [");
		comp.dispose();
	});
});
