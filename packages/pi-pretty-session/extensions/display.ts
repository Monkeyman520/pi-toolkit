import { defaultConfig, type PrettySessionConfig } from "./config.ts";
import type { ProjectInfo } from "./project.ts";
import type {
	PrettySessionEntryData,
	SessionMetrics,
	SummarySource,
} from "./summarizer.ts";

export interface EnrichedSessionItem {
	id: string;
	path: string;
	cwd: string;
	shortCwd: string;
	isCurrent: boolean;
	title: string;
	description: string;
	source: SummarySource;
	manualLocked: boolean;
	createdAt: string;
	updatedAt: string;
	contextTokens: number | null;
	contextWindow: number;
	contextPercent: number | null;
	messageCount: number;
	turnCount: number;
	projectName: string;
	gitBranch?: string;
}

export function formatTokens(tokens: number | null | undefined): string {
	if (tokens === null || tokens === undefined || !Number.isFinite(tokens)) {
		return "?";
	}
	if (tokens < 1000) return `${Math.round(tokens)}`;
	if (tokens < 1_000_000) return `${(tokens / 1000).toFixed(1)}k`;
	return `${(tokens / 1_000_000).toFixed(2)}M`;
}

export function formatRelativeAge(
	isoOrDate: string | Date | undefined,
	now = Date.now(),
): string {
	if (!isoOrDate) return "unknown";
	const timeMs =
		isoOrDate instanceof Date ? isoOrDate.getTime() : Date.parse(isoOrDate);
	if (Number.isNaN(timeMs)) return "unknown";
	const diffMs = Math.max(0, now - timeMs);
	const diffSecs = Math.floor(diffMs / 1000);
	if (diffSecs < 60) return "now";
	const diffMins = Math.floor(diffSecs / 60);
	if (diffMins < 60) return `${diffMins}m ago`;
	const diffHours = Math.floor(diffMins / 60);
	if (diffHours < 24) return `${diffHours}h ago`;
	const diffDays = Math.floor(diffHours / 24);
	if (diffDays < 30) return `${diffDays}d ago`;
	const diffMonths = Math.floor(diffDays / 30);
	if (diffMonths < 12) return `${diffMonths}mo ago`;
	return `${Math.floor(diffDays / 365)}y ago`;
}

export function formatTimestamp(
	isoOrDate: string | Date | undefined,
	now = Date.now(),
): string {
	if (!isoOrDate) return "unknown";
	const timeMs =
		isoOrDate instanceof Date ? isoOrDate.getTime() : Date.parse(isoOrDate);
	if (Number.isNaN(timeMs)) return "unknown";
	const iso = new Date(timeMs).toISOString().replace("T", " ").slice(0, 19);
	return `${iso} UTC (${formatRelativeAge(timeMs ? new Date(timeMs) : undefined, now)})`;
}

export function formatContextLength(
	metrics: Pick<
		SessionMetrics,
		"contextTokens" | "contextWindow" | "contextPercent"
	>,
): string {
	const tok = formatTokens(metrics.contextTokens);
	if (metrics.contextWindow > 0) {
		const win = formatTokens(metrics.contextWindow);
		const pct =
			metrics.contextPercent !== null &&
			metrics.contextPercent !== undefined &&
			Number.isFinite(metrics.contextPercent)
				? ` (${metrics.contextPercent.toFixed(1)}%)`
				: "";
		return `${tok} / ${win}${pct}`;
	}
	return metrics.contextTokens !== null ? `${tok} tokens` : "0 tokens";
}

function formatSourceBadge(
	meta: Pick<PrettySessionEntryData, "source" | "manualLocked"> | undefined,
): string {
	if (!meta) return "pending";
	if (meta.manualLocked) return "manual (locked)";
	return meta.source;
}

export function formatProjectCompact(project: ProjectInfo | undefined): string {
	if (!project) return "unknown project";
	const parts = [project.name];
	if (project.git.isRepo && project.git.branch) {
		const dirty =
			project.git.dirtyCount && project.git.dirtyCount > 0
				? ` *${project.git.dirtyCount}`
				: "";
		parts.push(`(${project.git.branch}${dirty})`);
	}
	if (project.manifest) {
		const ver = project.manifest.version ? `@${project.manifest.version}` : "";
		parts.push(`[${project.manifest.kind}${ver}]`);
	}
	return parts.join(" ");
}

export function formatStatusLine(params: {
	meta?: PrettySessionEntryData;
	metrics: SessionMetrics;
	project?: ProjectInfo;
	config: PrettySessionConfig;
	now?: number;
}): string {
	const { meta, metrics, project, now = Date.now() } = params;
	const title = meta?.title ?? "(unnamed session)";
	const ctxStr = formatContextLength(metrics);
	const updatedAge = formatRelativeAge(metrics.updatedAt, now);
	const projStr = project
		? ` · ${project.name}${project.git.branch ? ` (${project.git.branch})` : ""}`
		: "";
	return `pretty: ${title} · ctx ${ctxStr} · upd ${updatedAge}${projStr}`;
}

export function formatWidgetLines(params: {
	meta?: PrettySessionEntryData;
	metrics: SessionMetrics;
	project?: ProjectInfo;
	config: PrettySessionConfig;
	now?: number;
}): string[] {
	const { meta, metrics, project, now = Date.now() } = params;
	const title = meta?.title ?? "(awaiting first turn)";
	const desc =
		meta?.description ??
		"Session title and description will be generated automatically after the first completed turn.";
	const badge = formatSourceBadge(meta);
	const startedAge = formatRelativeAge(metrics.createdAt, now);
	const updatedAge = formatRelativeAge(metrics.updatedAt, now);
	const ctxStr = formatContextLength(metrics);
	const projSummary = formatProjectCompact(project);
	const sessionCount =
		project !== undefined ? ` · ${project.sessionCount} sessions` : "";

	return [
		`Session: ${title} [${badge}] · Start: ${startedAge} · Updated: ${updatedAge}`,
		`Summary: ${desc}`,
		`Context: ${ctxStr} · Turns: ${metrics.turnCount} (${metrics.messageCount} msgs) · Project: ${projSummary}${sessionCount}`,
	];
}

export function formatProjectReport(project: ProjectInfo): string[] {
	const lines = [
		`Project Info · ${project.name}`,
		`  Path: ${project.cwd} (${project.shortCwd})`,
		`  Saved sessions in project: ${project.sessionCount}`,
	];

	if (project.git.isRepo) {
		const dirtyStr =
			project.git.dirtyCount === undefined
				? "unknown"
				: project.git.dirtyCount === 0
					? "clean"
					: `${project.git.dirtyCount} modified/untracked`;
		lines.push(
			`  Git: branch ${project.git.branch ?? "unknown"} (${dirtyStr})`,
		);
		if (project.git.lastCommit) {
			lines.push(`  Latest commit: ${project.git.lastCommit}`);
		}
	} else {
		lines.push("  Git: not a Git repository");
	}

	if (project.manifest) {
		const m = project.manifest;
		const nameVer = [m.name, m.version ? `v${m.version}` : undefined]
			.filter(Boolean)
			.join(" ");
		const ws = m.workspaces ? " · workspace/monorepo" : "";
		lines.push(
			`  Manifest: ${m.file} (${m.kind})${nameVer ? ` · ${nameVer}` : ""}${ws}`,
		);
		if (m.scripts.length > 0) {
			lines.push(`  Key scripts: ${m.scripts.join(", ")}`);
		}
	} else {
		lines.push("  Manifest: no standard manifest detected");
	}

	return lines;
}

export function formatSessionDashboard(params: {
	meta?: PrettySessionEntryData;
	metrics: SessionMetrics;
	project: ProjectInfo;
	config: PrettySessionConfig;
	configPath: string;
	configError?: string;
	now?: number;
}): string[] {
	const {
		meta,
		metrics,
		project,
		config,
		configPath,
		configError,
		now = Date.now(),
	} = params;

	const title = meta?.title ?? "(unnamed session)";
	const desc =
		meta?.description ??
		"(no summary generated yet — run /ps summarize or complete a turn)";
	const lines = [
		`Pretty Session · ${title}`,
		`  Description: ${desc}`,
		`  Source: ${formatSourceBadge(meta)} · Auto-rename: ${config.enabled ? "on" : "off"} (every ${config.updateEveryTurns} turns or +${formatTokens(config.contextDeltaTokens)} tokens)`,
		`  Start time: ${formatTimestamp(metrics.createdAt, now)}`,
		`  Last updated: ${formatTimestamp(metrics.updatedAt, now)}`,
		`  Context length: ${formatContextLength(metrics)} · Turns: ${metrics.turnCount} · Messages: ${metrics.messageCount}`,
		"",
		...formatProjectReport(project),
		"",
		`Configuration: ${configPath}`,
		`  useLlm=${config.useLlm}${config.model ? ` (model=${config.model})` : ""} · protectManualName=${config.protectManualName} · showWidget=${config.showWidget} (${config.widgetPlacement}) · showStatus=${config.showStatus}`,
	];

	if (configError) {
		lines.push(`  Warning: ${configError}`);
	}

	return lines;
}

export function formatSessionListReport(
	sessions: readonly EnrichedSessionItem[],
	scope: "current" | "all",
	now = Date.now(),
): string[] {
	const header =
		scope === "current"
			? `Pretty Sessions (Current Project) · ${sessions.length}`
			: `Pretty Sessions (All Projects) · ${sessions.length}`;
	if (sessions.length === 0) {
		return [header, "  No saved sessions found."];
	}

	const lines = [header];
	for (const s of sessions.slice(0, 30)) {
		const currentTag = s.isCurrent ? " *current*" : "";
		const lockTag = s.manualLocked ? " [locked]" : ` [${s.source}]`;
		const ctx = formatContextLength({
			contextTokens: s.contextTokens,
			contextWindow: s.contextWindow,
			contextPercent: s.contextPercent,
		});
		const proj =
			scope === "all"
				? ` · ${s.projectName} (${s.shortCwd})`
				: s.gitBranch
					? ` · ${s.gitBranch}`
					: "";
		lines.push(
			"",
			`• ${s.title}${lockTag}${currentTag}`,
			`  ${s.description}`,
			`  Start: ${formatTimestamp(s.createdAt, now)} · Updated: ${formatTimestamp(s.updatedAt, now)}`,
			`  Context: ${ctx} · ${s.turnCount} turns (${s.messageCount} msgs)${proj}`,
		);
	}
	if (sessions.length > 30) {
		lines.push("", `  … ${sessions.length - 30} more sessions omitted.`);
	}
	return lines;
}

export function formatConfigReport(
	config: PrettySessionConfig,
	configPath: string,
	error?: string,
): string[] {
	const lines = [
		`Pretty Session Configuration (${configPath})`,
		`  Active: ${JSON.stringify(config)}`,
		`  Defaults: ${JSON.stringify(defaultConfig)}`,
		"  Update: /ps config <key> <value> | /ps config reload | /ps toggle <auto|llm|widget|status|lock|compact>",
	];
	if (error) {
		lines.push(`  Warning: ${error}`);
	}
	return lines;
}
