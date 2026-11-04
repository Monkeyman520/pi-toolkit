import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AssistantMessage } from "@earendil-works/pi-ai";
import type {
	ExtensionAPI,
	ExtensionCommandContext,
	ExtensionContext,
	SessionEntry,
	SessionHeader,
	SessionInfo,
} from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	enrichSessionInfo,
	filterEnrichedSessions,
} from "../extensions/browser.ts";
import { parsePrettySessionArgs } from "../extensions/commands.ts";
import { CONFIG_FILE_NAME, defaultConfig } from "../extensions/config.ts";
import {
	formatContextLength,
	formatRelativeAge,
	formatSessionDashboard,
	formatStatusLine,
	formatTokens,
	formatWidgetLines,
} from "../extensions/display.ts";
import registerPrettySession from "../extensions/index.ts";
import { CUSTOM_ENTRY_TYPE } from "../extensions/summarizer.ts";

describe("commands, display formatting, and extension lifecycle", () => {
	let tempAgentDir = "";
	const originalAgentDir = process.env.PI_CODING_AGENT_DIR;

	beforeEach(async () => {
		tempAgentDir = await mkdtemp(join(tmpdir(), "pi-pretty-session-ext-"));
		process.env.PI_CODING_AGENT_DIR = tempAgentDir;
	});

	afterEach(async () => {
		if (originalAgentDir === undefined) {
			delete process.env.PI_CODING_AGENT_DIR;
		} else {
			process.env.PI_CODING_AGENT_DIR = originalAgentDir;
		}
		if (tempAgentDir) {
			await rm(tempAgentDir, { recursive: true, force: true });
		}
	});

	it("parses /pretty-session and /ps subcommands accurately", () => {
		expect(parsePrettySessionArgs("")).toEqual({
			kind: "browse",
			scope: "current",
		});
		expect(parsePrettySessionArgs("browse all")).toEqual({
			kind: "browse",
			scope: "all",
		});
		expect(parsePrettySessionArgs("info")).toEqual({ kind: "info" });
		expect(parsePrettySessionArgs("project")).toEqual({ kind: "project" });
		expect(parsePrettySessionArgs("summarize")).toEqual({ kind: "summarize" });
		expect(parsePrettySessionArgs("refresh")).toEqual({ kind: "summarize" });
		expect(
			parsePrettySessionArgs("rename Custom Title | Detailed summary"),
		).toEqual({
			kind: "rename",
			title: "Custom Title",
			description: "Detailed summary",
		});
		expect(parsePrettySessionArgs("unlock")).toEqual({ kind: "unlock" });
		expect(parsePrettySessionArgs("list all")).toEqual({
			kind: "list",
			scope: "all",
		});
		expect(parsePrettySessionArgs("config reload")).toEqual({
			kind: "config",
			reload: true,
		});
		expect(parsePrettySessionArgs("config updateEveryTurns 5")).toEqual({
			kind: "config",
			key: "updateEveryTurns",
			value: "5",
		});
		expect(parsePrettySessionArgs("toggle widget")).toEqual({
			kind: "toggle",
			target: "widget",
		});
	});

	it("formats tokens, timestamps, widget lines, status line, and dashboard", () => {
		expect(formatTokens(850)).toBe("850");
		expect(formatTokens(14500)).toBe("14.5k");
		expect(formatTokens(1500000)).toBe("1.50M");

		const now = Date.parse("2026-04-20T10:00:00.000Z");
		expect(formatRelativeAge("2026-04-20T09:45:00.000Z", now)).toBe("15m ago");
		expect(
			formatContextLength({
				contextTokens: 12400,
				contextWindow: 200000,
				contextPercent: 6.2,
			}),
		).toBe("12.4k / 200.0k (6.2%)");

		const metrics = {
			sessionId: "s1",
			createdAt: "2026-04-20T09:00:00.000Z",
			updatedAt: "2026-04-20T09:45:00.000Z",
			turnCount: 3,
			messageCount: 6,
			userMessageCount: 3,
			assistantMessageCount: 3,
			compactionCount: 0,
			contextTokens: 12400,
			contextWindow: 200000,
			contextPercent: 6.2,
		};
		const meta = {
			version: 1 as const,
			title: "Build Pretty Session",
			description: "Added session naming, description, and project dashboard.",
			source: "llm" as const,
			manualLocked: false,
			createdAt: metrics.createdAt,
			updatedAt: metrics.updatedAt,
			turnCount: 3,
			messageCount: 6,
			contextTokens: 12400,
			contextWindow: 200000,
			contextPercent: 6.2,
			summarizedAtTurn: 3,
			summarizedAtTokens: 12400,
			projectName: "pi-packages",
			gitBranch: "main",
		};
		const project = {
			name: "pi-packages",
			cwd: "/work/pi-packages",
			shortCwd: "~/pi-packages",
			git: {
				isRepo: true,
				branch: "main",
				dirtyCount: 1,
				lastCommit: "1234abc initial commit",
			},
			manifest: {
				kind: "node" as const,
				file: "package.json",
				name: "pi-packages",
				version: "0.1.0",
				scripts: ["test", "check"],
				workspaces: true,
			},
			sessionCount: 4,
			inspectedAt: now,
		};

		const status = formatStatusLine({
			meta,
			metrics,
			project,
			config: defaultConfig,
			now,
		});
		expect(status).toContain("Build Pretty Session");
		expect(status).toContain("12.4k / 200.0k (6.2%)");
		expect(status).toContain("15m ago");
		expect(status).toContain("pi-packages (main)");

		const widget = formatWidgetLines({
			meta,
			metrics,
			project,
			config: defaultConfig,
			now,
		});
		expect(widget).toHaveLength(3);
		expect(widget[0]).toContain("Build Pretty Session [llm]");
		expect(widget[0]).toContain("Start: 1h ago");
		expect(widget[0]).toContain("Updated: 15m ago");
		expect(widget[1]).toContain(
			"Summary: Added session naming, description, and project dashboard.",
		);
		expect(widget[2]).toContain("4 sessions");

		const dashboard = formatSessionDashboard({
			meta,
			metrics,
			project,
			config: defaultConfig,
			configPath: "/tmp/pi-pretty-session.json",
			now,
		}).join("\n");
		expect(dashboard).toContain("Start time: 2026-04-20 09:00:00 UTC (1h ago)");
		expect(dashboard).toContain(
			"Last updated: 2026-04-20 09:45:00 UTC (15m ago)",
		);
		expect(dashboard).toContain("Key scripts: test, check");
	});

	it("enriches and filters saved JSONL session files", async () => {
		const sessionFile = join(tempAgentDir, "test-session.jsonl");
		const header: SessionHeader = {
			type: "session",
			version: 3,
			id: "sess-abc",
			timestamp: "2026-04-20T07:00:00.000Z",
			cwd: tempAgentDir,
		};
		const customEntry = {
			type: "custom",
			id: "c1",
			parentId: null,
			timestamp: "2026-04-20T07:05:00.000Z",
			customType: CUSTOM_ENTRY_TYPE,
			data: {
				version: 1,
				title: "Auth Refactor Session",
				description: "Refactored token refresh and added unit tests.",
				source: "llm",
				manualLocked: false,
				createdAt: "2026-04-20T07:00:00.000Z",
				updatedAt: "2026-04-20T07:05:00.000Z",
				turnCount: 2,
				messageCount: 4,
				contextTokens: 6400,
				contextWindow: 128000,
				contextPercent: 5.0,
				summarizedAtTurn: 2,
				summarizedAtTokens: 6400,
				projectName: "auth-service",
				gitBranch: "feat/oauth",
			},
		};
		await writeFile(
			sessionFile,
			`${JSON.stringify(header)}\n${JSON.stringify(customEntry)}\n`,
			"utf8",
		);

		const info: SessionInfo = {
			path: sessionFile,
			id: "sess-abc",
			cwd: tempAgentDir,
			name: "Auth Refactor Session",
			created: new Date("2026-04-20T07:00:00.000Z"),
			modified: new Date("2026-04-20T07:05:00.000Z"),
			messageCount: 4,
			firstMessage: "Refactor token refresh",
			allMessagesText: "Refactor token refresh",
		};

		const enriched = enrichSessionInfo(info, {
			currentSessionFile: sessionFile,
		});
		expect(enriched.isCurrent).toBe(true);
		expect(enriched.title).toBe("Auth Refactor Session");
		expect(enriched.description).toBe(
			"Refactored token refresh and added unit tests.",
		);
		expect(enriched.contextTokens).toBe(6400);
		expect(enriched.gitBranch).toBe("feat/oauth");

		expect(filterEnrichedSessions([enriched], "oauth token")).toHaveLength(1);
		expect(filterEnrichedSessions([enriched], "nonexistent")).toHaveLength(0);
	});

	it("handles full extension lifecycle: auto-rename, manual lock, and dynamic config hot-reload", async () => {
		type EventFn = (
			event: Record<string, unknown>,
			ctx: ExtensionContext,
		) => Promise<void> | void;
		const handlers = new Map<string, EventFn[]>();
		const commands = new Map<
			string,
			(args: string, ctx: ExtensionCommandContext) => Promise<void>
		>();
		const entries: SessionEntry[] = [];
		let sessionName: string | undefined;
		let statusValue: string | undefined;
		let widgetValue: { lines?: string[]; placement?: string } | undefined;
		const notifications: Array<{ msg: string; type?: string }> = [];

		const header: SessionHeader = {
			type: "session",
			version: 3,
			id: "sess-live",
			timestamp: "2026-04-20T10:00:00.000Z",
			cwd: tempAgentDir,
		};

		await writeFile(
			join(tempAgentDir, "package.json"),
			JSON.stringify({
				name: "demo-project",
				version: "1.0.0",
				scripts: { test: "vitest" },
			}),
			"utf8",
		);

		let ctx: ExtensionCommandContext;

		const pi = {
			on(event: string, handler: EventFn) {
				const list = handlers.get(event) ?? [];
				list.push(handler);
				handlers.set(event, list);
				return () => {};
			},
			registerCommand(
				name: string,
				options: {
					handler: (
						args: string,
						ctx: ExtensionCommandContext,
					) => Promise<void>;
				},
			) {
				commands.set(name, options.handler);
			},
			setSessionName(name: string) {
				sessionName = name;
				for (const h of handlers.get("session_info_changed") ?? []) {
					h({ type: "session_info_changed", name: sessionName }, ctx);
				}
			},
			getSessionName() {
				return sessionName;
			},
			appendEntry(customType: string, data: unknown) {
				entries.push({
					type: "custom",
					id: `custom_${entries.length + 1}`,
					parentId: entries.at(-1)?.id ?? null,
					timestamp: new Date().toISOString(),
					customType,
					data,
				});
			},
			exec: async (_cmd: string, args: string[]) => {
				if (args[0] === "rev-parse")
					return { code: 0, stdout: "true\n", stderr: "" };
				if (args[0] === "symbolic-ref")
					return { code: 0, stdout: "main\n", stderr: "" };
				if (args[0] === "status") return { code: 0, stdout: "", stderr: "" };
				if (args[0] === "log")
					return { code: 0, stdout: "9999abc init repo\n", stderr: "" };
				return { code: 1, stdout: "", stderr: "" };
			},
		} as unknown as ExtensionAPI;

		const fakeModel = {
			id: "mock-model",
			provider: "mock",
			api: "openai-completions",
			contextWindow: 100000,
		};

		let llmTitle = "Auto Summarized Title";
		let llmDesc = "Summarized the initial conversation and project setup.";

		ctx = {
			hasUI: true,
			mode: "rpc",
			cwd: tempAgentDir,
			model: fakeModel,
			modelRegistry: {
				find: () => fakeModel,
				getAvailable: () => [fakeModel],
				complete: async () =>
					({
						role: "assistant",
						content: [
							{
								type: "text",
								text: JSON.stringify({
									title: llmTitle,
									description: llmDesc,
								}),
							},
						],
						stopReason: "stop",
					}) as unknown as AssistantMessage,
			},
			getContextUsage: () => ({
				tokens: 2500,
				contextWindow: 100000,
				percent: 2.5,
			}),
			sessionManager: {
				getCwd: () => tempAgentDir,
				getSessionDir: () => tempAgentDir,
				getSessionId: () => "sess-live",
				getSessionFile: () => undefined,
				getSessionName: () => sessionName,
				getHeader: () => header,
				getEntries: () => [...entries],
				getBranch: () => [...entries],
			},
			ui: {
				notify: (msg: string, type?: string) => {
					notifications.push({ msg, type });
				},
				setStatus: (_key: string, text: string | undefined) => {
					statusValue = text;
				},
				setWidget: (
					_key: string,
					lines: string[] | undefined,
					opts?: { placement?: string },
				) => {
					widgetValue = lines
						? { lines, placement: opts?.placement }
						: undefined;
				},
			},
		} as unknown as ExtensionCommandContext;

		registerPrettySession(pi);

		for (const h of handlers.get("session_start") ?? []) {
			await h(
				{ type: "session_start", reason: "startup" },
				ctx as ExtensionContext,
			);
		}
		expect(statusValue).toContain("(unnamed session)");
		expect(widgetValue?.lines?.[2]).toContain("demo-project (main)");

		// Complete first turn -> auto-summarize
		entries.push({
			type: "message",
			id: "m1",
			parentId: null,
			timestamp: "2026-04-20T10:01:00.000Z",
			message: {
				role: "user",
				content: "Set up project metrics display",
				timestamp: Date.parse("2026-04-20T10:01:00.000Z"),
			},
		});
		entries.push({
			type: "message",
			id: "m2",
			parentId: "m1",
			timestamp: "2026-04-20T10:02:00.000Z",
			message: {
				role: "assistant",
				content: [{ type: "text", text: "Done setting up metrics." }],
				api: "openai-completions",
				provider: "mock",
				model: "mock-model",
				usage: {
					input: 2000,
					output: 500,
					cacheRead: 0,
					cacheWrite: 0,
					totalTokens: 2500,
					cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
				},
				stopReason: "stop",
				timestamp: Date.parse("2026-04-20T10:02:00.000Z"),
			} as AssistantMessage,
		});

		for (const h of handlers.get("agent_settled") ?? []) {
			await h(
				{ type: "agent_settled", aborted: false },
				ctx as ExtensionContext,
			);
		}

		expect(sessionName).toBe("Auto Summarized Title");
		expect(statusValue).toContain("Auto Summarized Title");
		expect(widgetValue?.lines?.[1]).toContain(
			"Summarized the initial conversation and project setup.",
		);

		// Simulate external user /name command -> locks manual title
		sessionName = "User Pinned Name";
		for (const h of handlers.get("session_info_changed") ?? []) {
			h(
				{ type: "session_info_changed", name: sessionName },
				ctx as ExtensionContext,
			);
		}
		expect(statusValue).toContain("User Pinned Name");

		// Hot-reload config from disk changing updateEveryTurns to 1 and placement to belowEditor
		await writeFile(
			join(tempAgentDir, CONFIG_FILE_NAME),
			JSON.stringify({
				updateEveryTurns: 1,
				widgetPlacement: "belowEditor",
			}),
			"utf8",
		);

		// Add second turn -> triggers re-summarize because updateEveryTurns=1, but preserves locked manual title!
		llmTitle = "Should Not Overwrite Locked Title";
		llmDesc = "Updated description on turn 2 while keeping manual title.";
		entries.push({
			type: "message",
			id: "m3",
			parentId: "m2",
			timestamp: "2026-04-20T10:03:00.000Z",
			message: {
				role: "user",
				content: "Add more tests",
				timestamp: Date.parse("2026-04-20T10:03:00.000Z"),
			},
		});
		entries.push({
			type: "message",
			id: "m4",
			parentId: "m3",
			timestamp: "2026-04-20T10:04:00.000Z",
			message: {
				role: "assistant",
				content: [{ type: "text", text: "Added tests." }],
				api: "openai-completions",
				provider: "mock",
				model: "mock-model",
				usage: {
					input: 2500,
					output: 500,
					cacheRead: 0,
					cacheWrite: 0,
					totalTokens: 3000,
					cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
				},
				stopReason: "stop",
				timestamp: Date.parse("2026-04-20T10:04:00.000Z"),
			} as AssistantMessage,
		});

		for (const h of handlers.get("agent_settled") ?? []) {
			await h(
				{ type: "agent_settled", aborted: false },
				ctx as ExtensionContext,
			);
		}

		expect(sessionName).toBe("User Pinned Name");
		expect(widgetValue?.placement).toBe("belowEditor");
		expect(widgetValue?.lines?.[1]).toContain(
			"Updated description on turn 2 while keeping manual title.",
		);

		// Explicit /ps summarize overrides lock and updates title
		const psHandler = commands.get("ps");
		expect(psHandler).toBeDefined();
		llmTitle = "Explicitly Refreshed Title";
		await psHandler?.("summarize", ctx);
		expect(sessionName).toBe("Explicitly Refreshed Title");

		for (const h of handlers.get("session_shutdown") ?? []) {
			await h(
				{ type: "session_shutdown", reason: "quit" },
				ctx as ExtensionContext,
			);
		}
	});
});
