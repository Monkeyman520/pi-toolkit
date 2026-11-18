import { resolve } from "node:path";
import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { loadProjectSessionTitles } from "./browser.ts";
import type { ConfigManager } from "./config.ts";
import { inspectProject, type ProjectInfo } from "./project.ts";
import {
	applyDuplicateTitleSuffix,
	buildHeuristicSummary,
	CUSTOM_ENTRY_TYPE,
	computeSessionMetrics,
	evaluateSummaryTrigger,
	generateSessionSummary,
	type PrettySessionEntryData,
	reconstructMetadata,
	type SessionMetrics,
	type SummarySource,
	sanitizeSingleLine,
} from "./summarizer.ts";

type Computed = {
	metrics: SessionMetrics;
	metadata: PrettySessionEntryData | undefined;
};
const PROJECT_CACHE_TTL_MS = 10_000;

/** Per-instance authority for session identity, metadata/name changes and asynchronous summary acceptance. */
export class SessionState {
	private readonly pi: Pick<
		ExtensionAPI,
		"exec" | "appendEntry" | "setSessionName"
	>;
	private readonly configManager: ConfigManager;
	private readonly onChanged: (ctx: ExtensionContext, state?: Computed) => void;
	private currentCtx: ExtensionContext | undefined;
	private currentSessionId: string | undefined;
	private currentProject: ProjectInfo | undefined;
	private currentMetadata: PrettySessionEntryData | undefined;
	private isApplyingPluginName = false;
	private lastPluginSetTitle: string | undefined;
	private summaryAbort: AbortController | undefined;
	private epoch = 0;
	constructor(
		pi: Pick<ExtensionAPI, "exec" | "appendEntry" | "setSessionName">,
		configManager: ConfigManager,
		onChanged: (ctx: ExtensionContext, state?: Computed) => void,
	) {
		this.pi = pi;
		this.configManager = configManager;
		this.onChanged = onChanged;
	}
	get context() {
		return this.currentCtx;
	}
	get project() {
		return this.currentProject;
	}
	get metadata() {
		return this.currentMetadata;
	}
	get revision() {
		return this.epoch;
	}
	isCurrent(ctx: ExtensionContext, revision = this.epoch) {
		return (
			!!this.currentCtx &&
			revision === this.epoch &&
			this.currentSessionId === ctx.sessionManager.getSessionId()
		);
	}
	attach(ctx: ExtensionContext) {
		const id = ctx.sessionManager.getSessionId();
		if (this.currentSessionId !== id) {
			this.invalidate();
			this.currentMetadata = undefined;
			this.currentProject = undefined;
			this.lastPluginSetTitle = undefined;
		}
		this.currentCtx = ctx;
		this.currentSessionId = id;
	}
	private invalidate() {
		this.epoch++;
		this.cancelSummary();
	}
	private cancelSummary() {
		this.summaryAbort?.abort();
		this.summaryAbort = undefined;
	}
	navigate(ctx: ExtensionContext) {
		this.invalidate();
		this.attach(ctx);
	}
	stop() {
		this.invalidate();
		this.currentCtx = undefined;
		this.currentSessionId = undefined;
		this.currentProject = undefined;
		this.currentMetadata = undefined;
		this.lastPluginSetTitle = undefined;
	}
	async rename(
		ctx: ExtensionContext,
		title: string,
		description?: string,
		revision = this.revision,
	) {
		if (!this.isCurrent(ctx, revision)) return undefined;
		this.cancelSummary();
		const cfg = this.configManager.config;
		const { metrics } = this.recompute(ctx);
		const existingTitles = await this.collectOtherTitles(ctx);
		if (!this.isCurrent(ctx, revision)) return undefined;
		const deduplicatedTitle = applyDuplicateTitleSuffix({
			candidateTitle: title,
			existingTitles,
			createdAt: metrics.createdAt,
			maxTitleLength: cfg.maxTitleLength,
		});
		const desc =
			description ??
			this.metadata?.description ??
			buildHeuristicSummary(
				this.entries(ctx),
				this.project,
				cfg.maxTitleLength,
				cfg.maxDescriptionLength,
				cfg.language,
			).description;
		return this.persist(ctx, {
			title: deduplicatedTitle || title,
			description: desc,
			source: "manual",
			manualLocked: true,
			updateNativeName: true,
		});
	}
	unlock(ctx: ExtensionContext) {
		const metadata = this.metadata;
		if (!metadata) return undefined;
		return this.persist(ctx, {
			title: metadata.title,
			description: metadata.description,
			source: metadata.source === "manual" ? "heuristic" : metadata.source,
			manualLocked: false,
			updateNativeName: false,
		});
	}
	nameChanged(name: string | undefined, ctx: ExtensionContext) {
		this.attach(ctx);
		if (this.isApplyingPluginName) return;
		const nextName = name?.trim();
		if (nextName && nextName === this.lastPluginSetTitle) return;
		this.lastPluginSetTitle = undefined;

		const { metadata } = this.recompute(ctx);
		if (!nextName) {
			if (metadata) {
				this.currentMetadata = {
					...metadata,
					manualLocked: false,
				};
				this.pi.appendEntry(CUSTOM_ENTRY_TYPE, this.currentMetadata);
			}
			this.onChanged(ctx);
			return;
		}

		this.summaryAbort?.abort();
		this.summaryAbort = undefined;
		const fallbackDesc =
			metadata?.description ??
			buildHeuristicSummary(
				this.entries(ctx),
				this.currentProject,
				this.configManager.config.maxTitleLength,
				this.configManager.config.maxDescriptionLength,
				this.configManager.config.language,
			).description;

		this.persist(ctx, {
			title: nextName,
			description: fallbackDesc,
			source: "manual",
			manualLocked: true,
			updateNativeName: false,
		});
	}
	private setNativeName(title: string) {
		const sanitized = title
			.replace(/\p{Cc}/gu, " ")
			.replace(/\s+/g, " ")
			.trim();
		if (!sanitized) return;
		this.isApplyingPluginName = true;
		this.lastPluginSetTitle = sanitized;
		try {
			this.pi.setSessionName(sanitized);
		} finally {
			this.isApplyingPluginName = false;
		}
	}

	private entries(ctx: ExtensionContext) {
		const branch = ctx.sessionManager.getBranch();
		return branch.length > 0 ? branch : ctx.sessionManager.getEntries();
	}

	recompute(ctx: ExtensionContext): {
		metrics: SessionMetrics;
		metadata: PrettySessionEntryData | undefined;
	} {
		const entries = this.entries(ctx);
		const allEntries = ctx.sessionManager.getEntries();
		const header = ctx.sessionManager.getHeader();
		const metrics = computeSessionMetrics({
			entries,
			header,
			contextUsage: ctx.getContextUsage(),
			modelContextWindow: ctx.model?.contextWindow,
			sessionId: ctx.sessionManager.getSessionId(),
			sessionFile: ctx.sessionManager.getSessionFile(),
		});

		const metadataSourceEntries = entries.some(
			(e) => e.type === "custom" && e.customType === CUSTOM_ENTRY_TYPE,
		)
			? entries
			: allEntries;

		const cfg = this.configManager.config;
		const metadata = reconstructMetadata(
			metadataSourceEntries,
			ctx.sessionManager.getSessionName(),
			metrics,
			this.currentProject,
			{
				maxTitleLength: cfg.maxTitleLength,
				maxDescriptionLength: cfg.maxDescriptionLength,
				language: cfg.language,
			},
		);

		if (this.isCurrent(ctx)) this.currentMetadata = metadata;
		return { metrics, metadata };
	}

	async inspect(ctx: ExtensionContext, force = false): Promise<ProjectInfo> {
		const revision = this.revision;
		const resolvedCwd = resolve(ctx.cwd);
		if (
			!force &&
			this.currentProject &&
			this.currentProject.cwd === resolvedCwd &&
			Date.now() - this.currentProject.inspectedAt < PROJECT_CACHE_TTL_MS
		) {
			return this.currentProject;
		}
		const info = await inspectProject(ctx.cwd, {
			exec: (cmd, args, opts) => this.pi.exec(cmd, args, opts),
			sessionDir: ctx.sessionManager.getSessionDir(),
		});
		if (this.isCurrent(ctx, revision)) this.currentProject = info;
		return info;
	}

	private async collectOtherTitles(ctx: ExtensionContext): Promise<string[]> {
		return loadProjectSessionTitles({
			cwd: ctx.cwd,
			sessionDir: ctx.sessionManager.getSessionDir(),
			excludeSessionId: ctx.sessionManager.getSessionId(),
			excludeSessionFile: ctx.sessionManager.getSessionFile(),
		});
	}

	private persist(
		ctx: ExtensionContext,
		params: {
			title: string;
			description: string;
			source: SummarySource;
			manualLocked: boolean;
			updateNativeName: boolean;
			preserveTitleExact?: boolean;
		},
	): PrettySessionEntryData | undefined {
		if (!this.isCurrent(ctx)) return undefined;
		const { metrics } = this.recompute(ctx);
		const cfg = this.configManager.config;
		const finalTitle = params.preserveTitleExact
			? sanitizeSingleLine(params.title, 120)
			: sanitizeSingleLine(params.title, cfg.maxTitleLength);
		const finalDesc = sanitizeSingleLine(
			params.description,
			cfg.maxDescriptionLength,
		);

		if (
			params.updateNativeName &&
			finalTitle &&
			ctx.sessionManager.getSessionName() !== finalTitle
		) {
			this.setNativeName(finalTitle);
		}

		const data: PrettySessionEntryData = {
			version: 1,
			title: finalTitle,
			description: finalDesc,
			source: params.source,
			manualLocked: params.manualLocked,
			createdAt: metrics.createdAt,
			updatedAt: metrics.updatedAt,
			turnCount: metrics.turnCount,
			messageCount: metrics.messageCount,
			contextTokens: metrics.contextTokens,
			contextWindow: metrics.contextWindow,
			contextPercent: metrics.contextPercent,
			summarizedAtTurn: metrics.turnCount,
			summarizedAtTokens: metrics.contextTokens ?? 0,
			projectName: this.currentProject?.name,
			gitBranch: this.currentProject?.git.branch,
		};

		this.pi.appendEntry(CUSTOM_ENTRY_TYPE, data);
		this.currentMetadata = data;
		this.onChanged(ctx, { metrics, metadata: data });
		return data;
	}

	async summarize(
		ctx: ExtensionContext,
		options: {
			updateTitle: boolean;
			manualOverride?: boolean;
		},
	): Promise<PrettySessionEntryData | undefined> {
		this.summaryAbort?.abort();
		const revision = this.revision;
		const controller = new AbortController();
		this.summaryAbort = controller;

		try {
			const project = await this.inspect(ctx);
			if (controller.signal.aborted || !this.isCurrent(ctx, revision))
				return undefined;
			const entries = this.entries(ctx);
			const cfg = this.configManager.config;
			const summary = await generateSessionSummary({
				entries,
				project,
				config: cfg,
				model: ctx.model,
				modelRegistry: ctx.modelRegistry,
				signal: controller.signal,
			});

			if (controller.signal.aborted || !this.isCurrent(ctx, revision)) {
				return undefined;
			}

			const preserveManualLock =
				!options.manualOverride &&
				Boolean(this.currentMetadata?.manualLocked && cfg.protectManualName);

			const existingTitle =
				this.currentMetadata?.title ?? ctx.sessionManager.getSessionName();

			const preservePolicyTitle =
				!options.manualOverride &&
				!preserveManualLock &&
				!options.updateTitle &&
				Boolean(existingTitle);

			if (preserveManualLock) {
				return this.persist(ctx, {
					title: existingTitle ?? summary.title,
					description: summary.description,
					source: "manual",
					manualLocked: true,
					updateNativeName: false,
					preserveTitleExact: true,
				});
			}

			if (preservePolicyTitle) {
				const preservedSource: SummarySource =
					this.currentMetadata?.source &&
					this.currentMetadata.source !== "manual"
						? this.currentMetadata.source
						: (this.currentMetadata?.source ?? summary.source);
				return this.persist(ctx, {
					title: existingTitle ?? summary.title,
					description: summary.description,
					source: preservedSource,
					manualLocked: false,
					updateNativeName: false,
					preserveTitleExact: true,
				});
			}

			const { metrics } = this.recompute(ctx);
			const existingTitles = await this.collectOtherTitles(ctx);
			if (controller.signal.aborted || !this.isCurrent(ctx, revision)) {
				return undefined;
			}

			const deduplicatedTitle =
				applyDuplicateTitleSuffix({
					candidateTitle: summary.title,
					existingTitles,
					createdAt: metrics.createdAt,
					maxTitleLength: cfg.maxTitleLength,
				}) || summary.title;

			return this.persist(ctx, {
				title: deduplicatedTitle,
				description: summary.description,
				source: summary.source,
				manualLocked: false,
				updateNativeName:
					options.updateTitle || Boolean(options.manualOverride),
			});
		} finally {
			if (this.summaryAbort === controller) {
				this.summaryAbort = undefined;
			}
		}
	}

	async autoSummarize(ctx: ExtensionContext, reason: "turn" | "compact") {
		const revision = this.revision;
		await this.inspect(ctx);
		if (!this.isCurrent(ctx, revision)) return;
		const { metrics, metadata } = this.recompute(ctx);
		const decision = evaluateSummaryTrigger({
			config: this.configManager.config,
			metrics,
			current: metadata,
			reason,
		});

		if (decision.shouldSummarize) {
			await this.summarize(ctx, {
				updateTitle: decision.updateTitle,
			});
		} else {
			this.onChanged(ctx, { metrics, metadata });
		}
	}
}
