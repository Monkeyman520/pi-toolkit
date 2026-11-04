import { readFileSync, statSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { basename, resolve } from "node:path";
import {
	type ExtensionCommandContext,
	parseSessionEntries,
	type SessionEntry,
	type SessionHeader,
	type SessionInfo,
	SessionManager,
} from "@earendil-works/pi-coding-agent";
import {
	Key,
	matchesKey,
	truncateToWidth,
	visibleWidth,
} from "@earendil-works/pi-tui";
import type { PrettySessionConfig } from "./config.ts";
import {
	type EnrichedSessionItem,
	formatContextLength,
	formatProjectCompact,
	formatRelativeAge,
	formatTimestamp,
} from "./display.ts";
import { type ProjectInfo, shortenHomePath } from "./project.ts";
import {
	buildHeuristicSummary,
	computeSessionMetrics,
	type PrettySessionEntryData,
	reconstructMetadata,
	type SessionMetrics,
} from "./summarizer.ts";

const MAX_SESSION_FILE_BYTES = 8 * 1024 * 1024;
const ENRICH_CONCURRENCY = 16;

function extractPrintableInput(data: string): string {
	if (!data || data.includes("\u001b")) return "";
	return data.replace(/\p{Cc}/gu, "");
}

export type BrowserResult =
	| { type: "switch"; sessionPath: string; title: string }
	| { type: "summarize" }
	| { type: "rename"; title: string }
	| { type: "toggle_widget" }
	| { type: "open_settings" }
	| null;

function normalizePathKey(p: string | undefined): string | undefined {
	if (!p) return undefined;
	try {
		const resolved = resolve(p);
		return process.platform === "win32" ? resolved.toLowerCase() : resolved;
	} catch {
		return p;
	}
}

export function enrichSessionInfo(
	info: SessionInfo,
	options?: {
		currentSessionFile?: string;
		homeDir?: string;
		rawContent?: string;
	},
): EnrichedSessionItem {
	const currentKey = normalizePathKey(options?.currentSessionFile);
	const infoKey = normalizePathKey(info.path);
	const isCurrent = Boolean(currentKey && infoKey && currentKey === infoKey);

	let header: SessionHeader | null = null;
	let entries: SessionEntry[] = [];
	try {
		const rawContent =
			options?.rawContent ??
			(statSync(info.path).size <= MAX_SESSION_FILE_BYTES
				? readFileSync(info.path, "utf8")
				: "");
		const fileEntries = rawContent ? parseSessionEntries(rawContent) : [];
		for (const entry of fileEntries) {
			if (entry.type === "session") {
				header = entry;
			} else {
				entries.push(entry);
			}
		}
	} catch {
		entries = [];
	}

	const metrics = computeSessionMetrics({
		entries,
		header,
		sessionId: info.id,
		sessionFile: info.path,
	});

	const meta = reconstructMetadata(entries, info.name, metrics);
	const heuristic = meta ? undefined : buildHeuristicSummary(entries);

	const fallbackTitle =
		info.name?.trim() ||
		info.firstMessage
			.replace(/\p{Cc}/gu, " ")
			.replace(/\s+/g, " ")
			.trim()
			.slice(0, 60) ||
		"(untitled session)";

	const title = meta?.title ?? heuristic?.title ?? fallbackTitle;
	const description =
		meta?.description ??
		heuristic?.description ??
		(info.firstMessage || "No messages recorded.");

	const cwd = info.cwd || header?.cwd || "";
	const shortCwd = cwd
		? shortenHomePath(cwd, options?.homeDir)
		: "(unknown cwd)";
	const projectName =
		meta?.projectName || (cwd ? basename(cwd) || cwd : "unknown");

	return {
		id: info.id,
		path: info.path,
		cwd,
		shortCwd,
		isCurrent,
		title,
		description,
		source: meta?.source ?? (info.name ? "manual" : "heuristic"),
		manualLocked: meta?.manualLocked ?? Boolean(info.name),
		createdAt: meta?.createdAt ?? info.created.toISOString(),
		updatedAt: meta?.updatedAt ?? info.modified.toISOString(),
		contextTokens: meta?.contextTokens ?? metrics.contextTokens,
		contextWindow: meta?.contextWindow ?? metrics.contextWindow,
		contextPercent: meta?.contextPercent ?? metrics.contextPercent,
		messageCount: Math.max(info.messageCount, metrics.messageCount),
		turnCount: meta?.turnCount ?? metrics.turnCount,
		projectName,
		gitBranch: meta?.gitBranch,
	};
}

export async function loadEnrichedSessions(options: {
	cwd: string;
	sessionDir?: string;
	currentSessionFile?: string;
	scope: "current" | "all";
	homeDir?: string;
}): Promise<EnrichedSessionItem[]> {
	let rawList: SessionInfo[] = [];
	try {
		rawList =
			options.scope === "all"
				? await SessionManager.listAll()
				: await SessionManager.list(options.cwd, options.sessionDir);
	} catch {
		rawList = [];
	}

	const enriched: EnrichedSessionItem[] = [];
	for (let i = 0; i < rawList.length; i += ENRICH_CONCURRENCY) {
		const batch = rawList.slice(i, i + ENRICH_CONCURRENCY);
		const batchItems = await Promise.all(
			batch.map(async (info) => {
				let rawContent = "";
				try {
					const fileStat = await stat(info.path);
					if (fileStat.size <= MAX_SESSION_FILE_BYTES) {
						rawContent = await readFile(info.path, "utf8");
					}
				} catch {
					rawContent = "";
				}
				return enrichSessionInfo(info, {
					currentSessionFile: options.currentSessionFile,
					homeDir: options.homeDir,
					rawContent,
				});
			}),
		);
		enriched.push(...batchItems);
	}

	return enriched.sort(
		(a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt),
	);
}

export function filterEnrichedSessions(
	sessions: readonly EnrichedSessionItem[],
	query: string,
): EnrichedSessionItem[] {
	const tokens = query
		.trim()
		.toLowerCase()
		.split(/\s+/)
		.filter((t) => t.length > 0);
	if (tokens.length === 0) return [...sessions];

	return sessions.filter((s) => {
		const haystack = [
			s.title,
			s.description,
			s.projectName,
			s.shortCwd,
			s.cwd,
			s.gitBranch ?? "",
			s.id,
		]
			.join(" ")
			.toLowerCase();
		return tokens.every((tok) => haystack.includes(tok));
	});
}

export async function openPrettySessionBrowser(params: {
	ctx: ExtensionCommandContext;
	initialScope: "current" | "all";
	currentMeta?: PrettySessionEntryData;
	currentMetrics: SessionMetrics;
	project: ProjectInfo;
	config: PrettySessionConfig;
}): Promise<BrowserResult> {
	const { ctx, currentMeta, currentMetrics, project, config } = params;
	const currentSessionFile = ctx.sessionManager.getSessionFile();
	let scope: "current" | "all" = params.initialScope;

	let sessions = await loadEnrichedSessions({
		cwd: ctx.cwd,
		sessionDir: ctx.sessionManager.getSessionDir(),
		currentSessionFile,
		scope,
	});

	return ctx.ui.custom<BrowserResult>((tui, theme, _kb, done) => {
		let query = "";
		let selectedIndex = 0;
		let renameMode = false;
		let renameDraft = "";
		let loading = false;
		let filtered = filterEnrichedSessions(sessions, query);
		const maxVisible = 5;

		const refreshFilter = () => {
			filtered = filterEnrichedSessions(sessions, query);
			selectedIndex = Math.min(selectedIndex, Math.max(0, filtered.length - 1));
			tui.requestRender();
		};

		const reloadScope = async (nextScope: "current" | "all") => {
			scope = nextScope;
			loading = true;
			tui.requestRender();
			sessions = await loadEnrichedSessions({
				cwd: ctx.cwd,
				sessionDir: ctx.sessionManager.getSessionDir(),
				currentSessionFile,
				scope,
			});
			loading = false;
			selectedIndex = 0;
			refreshFilter();
		};

		const handleInput = (data: string) => {
			if (renameMode) {
				if (matchesKey(data, Key.escape)) {
					renameMode = false;
					renameDraft = "";
					tui.requestRender();
					return;
				}
				if (matchesKey(data, Key.enter)) {
					const nextTitle = renameDraft.trim();
					renameMode = false;
					if (nextTitle) {
						done({ type: "rename", title: nextTitle });
						return;
					}
					tui.requestRender();
					return;
				}
				if (matchesKey(data, Key.backspace)) {
					renameDraft = renameDraft.slice(0, -1);
					tui.requestRender();
					return;
				}
				const printable = extractPrintableInput(data);
				if (printable) {
					renameDraft += printable;
					tui.requestRender();
				}
				return;
			}

			if (matchesKey(data, Key.escape)) {
				done(null);
				return;
			}
			if (matchesKey(data, Key.up)) {
				selectedIndex = Math.max(0, selectedIndex - 1);
				tui.requestRender();
				return;
			}
			if (matchesKey(data, Key.down)) {
				selectedIndex = Math.min(
					Math.max(0, filtered.length - 1),
					selectedIndex + 1,
				);
				tui.requestRender();
				return;
			}
			if (matchesKey(data, Key.pageUp)) {
				selectedIndex = Math.max(0, selectedIndex - maxVisible);
				tui.requestRender();
				return;
			}
			if (matchesKey(data, Key.pageDown)) {
				selectedIndex = Math.min(
					Math.max(0, filtered.length - 1),
					selectedIndex + maxVisible,
				);
				tui.requestRender();
				return;
			}
			if (matchesKey(data, Key.tab)) {
				void reloadScope(scope === "current" ? "all" : "current");
				return;
			}
			if (matchesKey(data, "ctrl+g")) {
				done({ type: "summarize" });
				return;
			}
			if (matchesKey(data, "ctrl+w")) {
				done({ type: "toggle_widget" });
				return;
			}
			if (matchesKey(data, "ctrl+s")) {
				done({ type: "open_settings" });
				return;
			}
			if (matchesKey(data, "ctrl+r")) {
				renameMode = true;
				renameDraft = currentMeta?.title ?? "";
				tui.requestRender();
				return;
			}
			if (matchesKey(data, Key.enter)) {
				const selected = filtered[selectedIndex];
				if (selected && !selected.isCurrent) {
					done({
						type: "switch",
						sessionPath: selected.path,
						title: selected.title,
					});
					return;
				}
				done(null);
				return;
			}
			if (matchesKey(data, Key.backspace)) {
				if (query.length > 0) {
					query = query.slice(0, -1);
					refreshFilter();
				}
				return;
			}
			const printable = extractPrintableInput(data);
			if (printable) {
				query += printable;
				refreshFilter();
			}
		};

		const render = (width: number): string[] => {
			const w = Math.max(20, width);
			const now = Date.now();
			const lines: string[] = [];
			const border = theme.fg("accent", "─".repeat(w));
			lines.push(border);

			const scopeLabel =
				scope === "current" ? "Current Project" : "All Projects";
			const headerLine = `${theme.bold(theme.fg("accent", "Pretty Session"))} · ${theme.fg("text", formatProjectCompact(project))} · ${theme.fg("muted", `Scope: ${scopeLabel}`)}`;
			lines.push(truncateToWidth(headerLine, w));

			const curTitle = currentMeta?.title ?? "(unnamed current session)";
			const curCtx = formatContextLength(currentMetrics);
			const curLine = `${theme.fg("dim", "Active:")} ${theme.fg("warning", curTitle)} · ${theme.fg("dim", `ctx ${curCtx} · start ${formatRelativeAge(currentMetrics.createdAt, now)} · upd ${formatRelativeAge(currentMetrics.updatedAt, now)}`)}`;
			lines.push(truncateToWidth(curLine, w));

			if (project.git.lastCommit || project.manifest?.scripts.length) {
				const extras: string[] = [];
				if (project.git.lastCommit) {
					extras.push(`commit: ${project.git.lastCommit}`);
				}
				if (project.manifest?.scripts.length) {
					extras.push(`scripts: ${project.manifest.scripts.join(", ")}`);
				}
				lines.push(
					truncateToWidth(theme.fg("dim", `  ${extras.join(" · ")}`), w),
				);
			}

			lines.push("");

			if (renameMode) {
				lines.push(
					truncateToWidth(
						`${theme.bold(theme.fg("accent", "Rename current session:"))} ${renameDraft}█`,
						w,
					),
				);
				lines.push(
					truncateToWidth(
						theme.fg("dim", "Enter to save manual title · Esc to cancel"),
						w,
					),
				);
				lines.push(border);
				return lines;
			}

			const searchPrompt = query
				? `Search: ${query}█`
				: "Search (title, description, project, branch): █";
			lines.push(truncateToWidth(theme.fg("muted", searchPrompt), w));
			lines.push("");

			if (loading) {
				lines.push(theme.fg("muted", "  Loading sessions…"));
			} else if (filtered.length === 0) {
				lines.push(
					theme.fg(
						"muted",
						"  No matching sessions found. Press Tab to switch scope.",
					),
				);
			} else {
				const startIdx = Math.max(
					0,
					Math.min(
						selectedIndex - Math.floor(maxVisible / 2),
						filtered.length - maxVisible,
					),
				);
				const endIdx = Math.min(startIdx + maxVisible, filtered.length);

				for (let i = startIdx; i < endIdx; i++) {
					const item = filtered[i];
					const isSel = i === selectedIndex;
					const cursor = isSel ? theme.fg("accent", "› ") : "  ";
					const badge = item.manualLocked ? "[locked]" : `[${item.source}]`;
					const curBadge = item.isCurrent ? " (active)" : "";
					const leftText = `${cursor}${isSel ? theme.bold(theme.fg("accent", item.title)) : theme.fg("text", item.title)} ${theme.fg("dim", `${badge}${curBadge}`)}`;
					const ctxText = formatContextLength({
						contextTokens: item.contextTokens,
						contextWindow: item.contextWindow,
						contextPercent: item.contextPercent,
					});
					const rightText = `${ctxText} · ${item.turnCount}t/${item.messageCount}m · ${formatRelativeAge(item.updatedAt, now)}`;
					const pad = " ".repeat(
						Math.max(1, w - visibleWidth(leftText) - visibleWidth(rightText)),
					);
					lines.push(
						truncateToWidth(leftText + pad + theme.fg("dim", rightText), w),
					);

					const descLine = `    ${item.description}`;
					lines.push(truncateToWidth(theme.fg("muted", descLine), w));

					const timeMeta = `    Start: ${formatTimestamp(item.createdAt, now)} · Updated: ${formatTimestamp(item.updatedAt, now)} · ${item.projectName}${item.gitBranch ? ` (${item.gitBranch})` : ""}`;
					lines.push(truncateToWidth(theme.fg("dim", timeMeta), w));
				}

				if (filtered.length > maxVisible) {
					lines.push(
						truncateToWidth(
							theme.fg(
								"dim",
								`  Showing ${startIdx + 1}-${endIdx} of ${filtered.length} sessions`,
							),
							w,
						),
					);
				}
			}

			lines.push("");
			const footerHints = `↑↓ select · Enter switch · Tab scope · Ctrl+G summarize · Ctrl+R rename · Ctrl+W widget (${config.showWidget ? "on" : "off"}) · Ctrl+S settings · Esc close`;
			lines.push(truncateToWidth(theme.fg("dim", footerHints), w));
			lines.push(border);
			return lines;
		};

		return {
			render,
			invalidate() {},
			handleInput,
		};
	});
}
