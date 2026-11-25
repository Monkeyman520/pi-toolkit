export type Cause = "network" | "server" | "throttle" | "quota";

export const DEFAULT_RESUME_PROMPT =
	"Continue the interrupted task from where it stopped.";

export interface CustomMatchRule {
	pattern: string;
	cause: Cause;
}

export interface CompiledCustomRules {
	exclude: readonly RegExp[];
	match: ReadonlyArray<{ regex: RegExp; cause: Cause }>;
}

export interface PendingRecovery {
	at: number;
	cause: Cause;
	nextAttempt: number;
	maxAttempts: number;
}

export interface RecoveryTrigger {
	cause: Cause;
	attempt: number;
	maxAttempts: number;
	totalAttempts: number;
	at: number;
}

export interface RecoveryDiagnostics {
	status: string;
	attempts: number;
	maxAttempts: number;
	totalAttempts: number;
	maxTotalAttempts: number;
	pendingAt?: number;
	pendingCause?: Cause;
	lastCause?: Cause;
	lastError?: string;
	guardUntilMs?: number;
	stopFile?: string;
}

export interface Settings {
	enabled: boolean;
	network: boolean;
	server: boolean;
	throttle: boolean;
	quota: boolean;
	wake: boolean;
	retryDelayMs: number;
	retryBackoffFactor: number;
	maxRetryDelayMs: number;
	quotaDelayMs: number;
	maxAttempts: number;
	maxWaitMs: number;
	maxTotalAttempts: number;
	notifyOnResume: boolean;
	resumePrompt: string;
	resumePromptFile: string;
	stopFile: string;
	customExcludePatterns: string[];
	customMatchPatterns: CustomMatchRule[];
}

export interface RecoveryOptions {
	random?: () => number;
}

export const defaults: Settings = {
	enabled: true,
	network: true,
	server: true,
	throttle: true,
	quota: true,
	wake: true,
	retryDelayMs: 10000,
	retryBackoffFactor: 2,
	maxRetryDelayMs: 300000,
	quotaDelayMs: 30000,
	maxAttempts: 5,
	maxWaitMs: 0,
	maxTotalAttempts: 0,
	notifyOnResume: true,
	resumePrompt: DEFAULT_RESUME_PROMPT,
	resumePromptFile: "",
	stopFile: "",
	customExcludePatterns: [],
	customMatchPatterns: [],
};

export function formatCountdown(remainingMs: number): string {
	const totalSec = Math.max(0, Math.ceil(remainingMs / 1000));
	if (totalSec < 60) return `${totalSec}s`;
	if (totalSec < 3600) {
		const minutes = Math.floor(totalSec / 60);
		const seconds = totalSec % 60;
		return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
	}
	const hours = Math.floor(totalSec / 3600);
	const minutes = Math.floor((totalSec % 3600) / 60);
	return `${hours}h ${String(minutes).padStart(2, "0")}m`;
}

export function formatResumePrompt(
	template: string,
	trigger: Pick<RecoveryTrigger, "cause" | "attempt" | "maxAttempts">,
): string {
	const base = template.trim() || DEFAULT_RESUME_PROMPT;
	return base.replace(
		/\{(cause|attempt|maxAttempts)\}/g,
		(_match, key: string) => {
			if (key === "cause") return trigger.cause;
			if (key === "attempt") return String(trigger.attempt);
			return String(trigger.maxAttempts);
		},
	);
}

export function compileCustomRules(
	excludePatterns: readonly string[] = [],
	matchPatterns: readonly CustomMatchRule[] = [],
): { ok: true; rules: CompiledCustomRules } | { ok: false; error: string } {
	const exclude: RegExp[] = [];
	for (const pattern of excludePatterns) {
		try {
			exclude.push(new RegExp(pattern, "i"));
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			return {
				ok: false,
				error: `Invalid customExcludePatterns regex "${pattern}": ${msg}`,
			};
		}
	}
	const match: Array<{ regex: RegExp; cause: Cause }> = [];
	for (const rule of matchPatterns) {
		try {
			match.push({ regex: new RegExp(rule.pattern, "i"), cause: rule.cause });
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			return {
				ok: false,
				error: `Invalid customMatchPatterns regex "${rule.pattern}": ${msg}`,
			};
		}
	}
	return { ok: true, rules: { exclude, match } };
}

export function classify(
	error: string,
	status?: number,
	customRules?: CompiledCustomRules,
): Cause | undefined {
	if (
		status === 401 ||
		status === 403 ||
		/context.{0,30}(full|exceed|length|limit)|maximum.{0,20}(output|tokens)|max_tokens|output.{0,20}(length|limit|tokens)|invalid.{0,10}(key|token)|unauthori[sz]ed|permission|forbidden/i.test(
			error,
		)
	)
		return;
	if (customRules?.exclude.some((regex) => regex.test(error))) return;
	if (
		/subscription.{0,30}(limit|quota)|quota.{0,20}(exhaust|exceed)|usage.{0,15}limit|insufficient_quota/i.test(
			error,
		)
	)
		return "quota";
	if (
		/fetch failed|network|ECONNRESET|ECONNREFUSED|ECONNABORTED|ENOTFOUND|ETIMEDOUT|EPIPE|EAI_AGAIN|UND_ERR_[A-Z_]+|timed? ?out|timeout|socket hang up|premature close|abrupt.{0,20}(?:close|terminat)|stream.{0,20}(?:closed|abort|reset|terminated)/i.test(
			error,
		)
	)
		return "network";
	if (
		status === 500 ||
		status === 502 ||
		status === 503 ||
		status === 504 ||
		status === 529 ||
		/overloaded_error|\boverloaded\b|service unavailable|bad gateway|gateway time-?out|internal server error|upstream.{0,20}(?:error|unavailable|timeout)/i.test(
			error,
		)
	)
		return "server";
	if (status === 429 || /rate.?limit|too many requests|throttl/i.test(error))
		return "throttle";
	for (const rule of customRules?.match ?? []) {
		if (rule.regex.test(error)) return rule.cause;
	}
}

export function parseDurationMs(raw: string): number | undefined {
	const trimmed = raw.trim();
	if (!trimmed) return undefined;
	const match =
		/^(?:(\d+(?:\.\d+)?)h)?(?:(\d+(?:\.\d+)?)m(?!s))?(?:(\d+(?:\.\d+)?)s)?(?:(\d+(?:\.\d+)?)ms)?$/i.exec(
			trimmed,
		);
	if (!match || (!match[1] && !match[2] && !match[3] && !match[4])) {
		return undefined;
	}
	const hours = match[1] ? Number(match[1]) : 0;
	const minutes = match[2] ? Number(match[2]) : 0;
	const seconds = match[3] ? Number(match[3]) : 0;
	const millis = match[4] ? Number(match[4]) : 0;
	const total = Math.round(
		hours * 3600000 + minutes * 60000 + seconds * 1000 + millis,
	);
	return Number.isFinite(total) && total >= 0 && total <= 8.64e15
		? total
		: undefined;
}

export function parseGuardDurationMs(raw: string): number | undefined {
	const trimmed = raw.trim();
	if (!trimmed) return undefined;
	const parsed = parseDurationMs(trimmed);
	if (parsed !== undefined) {
		return parsed > 0 ? parsed : undefined;
	}
	if (/^\d+$/.test(trimmed)) {
		const seconds = Number(trimmed);
		const ms = seconds * 1000;
		return Number.isFinite(ms) && ms > 0 && ms <= 8.64e15 ? ms : undefined;
	}
	return undefined;
}

export function parseGuardUntilMs(raw: string): number | undefined {
	const trimmed = raw.trim();
	if (!trimmed) return undefined;
	const localMatch =
		/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(trimmed);
	if (localMatch) {
		const year = Number(localMatch[1]);
		const month = Number(localMatch[2]);
		const day = Number(localMatch[3]);
		const hour = Number(localMatch[4]);
		const minute = Number(localMatch[5]);
		const second = localMatch[6] ? Number(localMatch[6]) : 0;
		const date = new Date(year, month - 1, day, hour, minute, second, 0);
		if (
			date.getFullYear() !== year ||
			date.getMonth() !== month - 1 ||
			date.getDate() !== day ||
			date.getHours() !== hour ||
			date.getMinutes() !== minute ||
			date.getSeconds() !== second
		) {
			return undefined;
		}
		return date.getTime();
	}
	if (!/[T ]/.test(trimmed) && !/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
		return undefined;
	}
	const parsed = Date.parse(trimmed);
	return Number.isFinite(parsed) && parsed > 0 && parsed <= 8.64e15
		? parsed
		: undefined;
}

function parseTimestampMs(raw: string): number | undefined {
	const trimmed = raw.trim();
	if (!trimmed) return undefined;
	const num = Number(trimmed);
	const value = Number.isFinite(num)
		? num > 0
			? num < 1e12
				? num * 1000
				: num
			: NaN
		: Date.parse(trimmed);
	return Number.isFinite(value) && value >= 0 && value <= 8.64e15
		? value
		: undefined;
}

function normalizeHeaders(
	headers: Record<string, string>,
): Record<string, string> {
	const normalized: Record<string, string> = {};
	for (const [key, value] of Object.entries(headers)) {
		if (typeof value === "string") {
			normalized[key.toLowerCase()] = value;
		}
	}
	return normalized;
}

export function resetTime(
	headers: Record<string, string>,
	error: string,
	now: number,
): number | undefined {
	const normalized = normalizeHeaders(headers);
	const times: number[] = [];
	const retry = normalized["retry-after"]?.trim();
	if (retry) {
		const seconds = Number(retry);
		const time =
			Number.isFinite(seconds) && seconds >= 0
				? now + seconds * 1000
				: Date.parse(retry);
		if (Number.isFinite(time) && time >= 0 && time <= 8.64e15) times.push(time);
	}
	for (const key of [
		"anthropic-ratelimit-unified-5h-reset",
		"anthropic-ratelimit-unified-7d-reset",
		"x-ratelimit-reset",
	]) {
		const raw = normalized[key];
		if (raw) {
			const time = parseTimestampMs(raw);
			if (time !== undefined) {
				times.push(time);
			} else if (key === "x-ratelimit-reset") {
				const duration = parseDurationMs(raw);
				if (duration !== undefined) times.push(now + duration);
			}
		}
	}
	for (const key of [
		"x-ratelimit-reset-requests",
		"x-ratelimit-reset-tokens",
	]) {
		const raw = normalized[key];
		if (raw) {
			const duration = parseDurationMs(raw);
			if (duration !== undefined) {
				times.push(now + duration);
			} else {
				const time = parseTimestampMs(raw);
				if (time !== undefined) times.push(time);
			}
		}
	}
	for (const match of error.matchAll(
		/["']?(?:resets_at|reset_at|resetTime|resetsAt)["']?\s*[:=]\s*["']?([\dTZ:.+-]+)/g,
	)) {
		const time = parseTimestampMs(match[1]);
		if (time !== undefined) times.push(time);
	}
	return times.length ? Math.max(now, ...times) : undefined;
}

export class Recovery {
	readonly settings: Settings;
	private readonly random: () => number;
	private customRules: CompiledCustomRules = { exclude: [], match: [] };
	private pending?: { at: number; scheduledAt: number; cause: Cause };
	private stagedFailure?: {
		error: string;
		headers: Record<string, string>;
		status?: number;
	};
	private lastHeaders: Record<string, string> = {};
	private lastStatus: number | undefined;
	private attempts = 0;
	private totalAttempts = 0;
	private guardUntilMs: number | undefined;
	private lastCause: Cause | undefined;
	private lastError: string | undefined;
	status = "idle";

	constructor(settings: Partial<Settings> = {}, options: RecoveryOptions = {}) {
		this.settings = {
			...defaults,
			...settings,
			resumePrompt: settings.resumePrompt?.trim()
				? settings.resumePrompt
				: DEFAULT_RESUME_PROMPT,
			resumePromptFile: (settings.resumePromptFile ?? "").trim(),
			stopFile: (settings.stopFile ?? "").trim(),
			customExcludePatterns: [
				...(settings.customExcludePatterns ?? defaults.customExcludePatterns),
			],
			customMatchPatterns: (
				settings.customMatchPatterns ?? defaults.customMatchPatterns
			).map((rule) => ({ ...rule })),
		};
		this.random = options.random ?? Math.random;
		this.refreshCustomRules();
		if (!this.settings.enabled) {
			this.status = "disabled";
		}
	}

	hasPending(): boolean {
		return this.pending !== undefined;
	}

	getTotalAttempts(): number {
		return this.totalAttempts;
	}

	getGuardUntil(): number | undefined {
		return this.guardUntilMs;
	}

	setGuardUntil(untilMs: number | undefined, now = Date.now()) {
		this.guardUntilMs = untilMs;
		if (this.pending && untilMs !== undefined) {
			if (now >= untilMs) {
				this.pending = undefined;
				this.status = "guardrail expired";
			} else if (this.pending.at > untilMs) {
				this.pending = undefined;
				this.status = "wait exceeds guardrail";
			}
		}
	}

	clearGuard() {
		this.guardUntilMs = undefined;
	}

	expireGuardrail(now: number): boolean {
		if (
			this.pending &&
			this.guardUntilMs !== undefined &&
			now >= this.guardUntilMs
		) {
			this.pending = undefined;
			this.status = "guardrail expired";
			return true;
		}
		return false;
	}

	formatStatus(now = Date.now()): string {
		if (this.pending) {
			if (this.guardUntilMs !== undefined && now >= this.guardUntilMs) {
				return "guardrail expired";
			}
			const remaining = formatCountdown(this.pending.at - now);
			return `${this.pending.cause}: retrying in ${remaining} (${this.attempts + 1}/${this.settings.maxAttempts})`;
		}
		return this.status;
	}

	getDiagnostics(now = Date.now()): RecoveryDiagnostics {
		return {
			status: this.formatStatus(now),
			attempts: this.attempts,
			maxAttempts: this.settings.maxAttempts,
			totalAttempts: this.totalAttempts,
			maxTotalAttempts: this.settings.maxTotalAttempts,
			pendingAt: this.pending?.at,
			pendingCause: this.pending?.cause,
			lastCause: this.lastCause,
			lastError: this.lastError,
			guardUntilMs: this.guardUntilMs,
			stopFile: this.settings.stopFile || undefined,
		};
	}

	private refreshCustomRules() {
		const compiled = compileCustomRules(
			this.settings.customExcludePatterns,
			this.settings.customMatchPatterns,
		);
		this.customRules = compiled.ok
			? compiled.rules
			: { exclude: [], match: [] };
	}

	private computeRetryDelayMs(): number {
		const minDelay = this.settings.retryDelayMs;
		const factor = this.settings.retryBackoffFactor;
		if (this.attempts === 0 || factor <= 1) return minDelay;
		const cap = Math.max(minDelay, this.settings.maxRetryDelayMs);
		const scaled = Math.min(
			cap,
			Math.round(minDelay * factor ** this.attempts),
		);
		const jitterRange = Math.round(scaled * 0.1);
		const rand = Math.min(1, Math.max(0, this.random()));
		const jitter = Math.round(rand * jitterRange);
		return Math.min(cap, scaled + jitter);
	}

	private clearStagedFailure() {
		this.stagedFailure = undefined;
		this.lastHeaders = {};
		this.lastStatus = undefined;
	}

	updateSettings(nextSettings: Partial<Settings>) {
		Object.assign(this.settings, {
			...defaults,
			...nextSettings,
			resumePrompt: nextSettings.resumePrompt?.trim()
				? nextSettings.resumePrompt
				: DEFAULT_RESUME_PROMPT,
			resumePromptFile: (nextSettings.resumePromptFile ?? "").trim(),
			stopFile: (nextSettings.stopFile ?? "").trim(),
			customExcludePatterns: [
				...(nextSettings.customExcludePatterns ??
					defaults.customExcludePatterns),
			],
			customMatchPatterns: (
				nextSettings.customMatchPatterns ?? defaults.customMatchPatterns
			).map((rule) => ({ ...rule })),
		});
		this.refreshCustomRules();
		if (!this.settings.enabled) {
			this.pending = undefined;
			this.clearStagedFailure();
			this.status = "disabled";
			return;
		}
		if (this.pending) {
			if (!this.settings[this.pending.cause]) {
				this.pending = undefined;
				this.status = "not eligible";
			} else if (
				this.settings.maxTotalAttempts > 0 &&
				this.totalAttempts >= this.settings.maxTotalAttempts
			) {
				this.pending = undefined;
				this.status = "session attempt limit reached";
			} else if (this.attempts >= this.settings.maxAttempts) {
				this.pending = undefined;
				this.status = "attempt limit reached";
			} else if (
				this.settings.maxWaitMs > 0 &&
				this.pending.at - this.pending.scheduledAt > this.settings.maxWaitMs
			) {
				this.pending = undefined;
				this.status = "wait exceeds maxWaitMs";
			}
		} else if (this.status === "disabled") {
			this.status = "idle";
		}
	}

	cancel() {
		this.cancelWithStatus("cancelled");
	}

	cancelWithStatus(reason: string) {
		this.pending = undefined;
		this.clearStagedFailure();
		this.status = reason;
	}

	setEnabled(enabled: boolean) {
		this.settings.enabled = enabled;
		if (!enabled) {
			this.pending = undefined;
			this.clearStagedFailure();
			this.status = "disabled";
		} else if (this.status === "disabled" || this.status === "cancelled") {
			this.status = "idle";
		}
	}

	running() {
		this.pending = undefined;
		this.clearStagedFailure();
		this.status = "host running";
	}

	userInput() {
		this.cancel();
		this.attempts = 0;
	}

	completed() {
		this.cancel();
		this.attempts = 0;
		this.status = this.settings.enabled ? "idle" : "disabled";
	}

	woke() {
		if (!this.settings.wake) this.cancel();
	}

	recordRequestStart() {
		this.lastHeaders = {};
		this.lastStatus = undefined;
	}

	recordProviderResponse(headers: Record<string, string>, status?: number) {
		this.lastHeaders = { ...headers };
		this.lastStatus = status;
	}

	recordAssistantMessage(stopReason?: string, errorMessage?: string) {
		if (stopReason === "error") {
			this.stagedFailure = {
				error: errorMessage ?? "",
				headers: { ...this.lastHeaders },
				status: this.lastStatus,
			};
		} else {
			this.clearStagedFailure();
			if (stopReason === "aborted") this.cancel();
			else this.completed();
		}
	}

	settleTurn(aborted: boolean, now: number) {
		if (aborted) {
			this.cancel();
			return;
		}
		const failure = this.stagedFailure;
		this.clearStagedFailure();
		if (failure) {
			this.failed(failure.error, failure.headers, now, failure.status);
		}
	}

	failed(
		error: string,
		headers: Record<string, string>,
		now: number,
		status?: number,
	) {
		this.pending = undefined;
		const cause = classify(error, status, this.customRules);
		const cleaned = error.replace(/\s+/g, " ").trim();
		this.lastCause = cause;
		this.lastError = cleaned
			? cleaned.length > 120
				? `${cleaned.slice(0, 117)}...`
				: cleaned
			: undefined;
		if (!this.settings.enabled || !cause || !this.settings[cause]) {
			this.status = "not eligible";
			return;
		}
		if (this.guardUntilMs !== undefined && now >= this.guardUntilMs) {
			this.status = "guardrail expired";
			return;
		}
		if (
			this.settings.maxTotalAttempts > 0 &&
			this.totalAttempts >= this.settings.maxTotalAttempts
		) {
			this.status = "session attempt limit reached";
			return;
		}
		if (this.attempts >= this.settings.maxAttempts) {
			this.status = "attempt limit reached";
			return;
		}
		const reset = resetTime(headers, error, now);
		if (cause === "quota" && reset === undefined) {
			this.status = "quota: reset time unavailable";
			return;
		}
		const at =
			cause === "quota"
				? (reset ?? now) + this.settings.quotaDelayMs
				: Math.max(now + this.computeRetryDelayMs(), reset ?? now);
		if (this.guardUntilMs !== undefined && at > this.guardUntilMs) {
			this.status = "wait exceeds guardrail";
			return;
		}
		if (this.settings.maxWaitMs > 0 && at - now > this.settings.maxWaitMs) {
			this.status = "wait exceeds maxWaitMs";
			return;
		}
		this.pending = { at, scheduledAt: now, cause };
		this.status = this.formatStatus(now);
	}

	peekDue(now: number, idle: boolean): PendingRecovery | undefined {
		if (this.expireGuardrail(now)) return undefined;
		if (!this.pending || !idle || now < this.pending.at) return undefined;
		if (
			this.settings.maxTotalAttempts > 0 &&
			this.totalAttempts >= this.settings.maxTotalAttempts
		) {
			this.pending = undefined;
			this.status = "session attempt limit reached";
			return undefined;
		}
		return {
			at: this.pending.at,
			cause: this.pending.cause,
			nextAttempt: this.attempts + 1,
			maxAttempts: this.settings.maxAttempts,
		};
	}

	takeTrigger(
		now: number,
		idle: boolean,
		expectedAt?: number,
	): RecoveryTrigger | undefined {
		if (this.expireGuardrail(now)) return undefined;
		if (!this.pending || !idle || now < this.pending.at) return undefined;
		if (expectedAt !== undefined && this.pending.at !== expectedAt) {
			return undefined;
		}
		if (
			this.settings.maxTotalAttempts > 0 &&
			this.totalAttempts >= this.settings.maxTotalAttempts
		) {
			this.pending = undefined;
			this.status = "session attempt limit reached";
			return undefined;
		}
		const current = this.pending;
		this.pending = undefined;
		this.attempts++;
		this.totalAttempts++;
		this.status = `resuming (attempt ${this.attempts})`;
		return {
			cause: current.cause,
			attempt: this.attempts,
			maxAttempts: this.settings.maxAttempts,
			totalAttempts: this.totalAttempts,
			at: current.at,
		};
	}

	take(now: number, idle: boolean) {
		return Boolean(this.takeTrigger(now, idle));
	}
}
