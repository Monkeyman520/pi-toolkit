export type Cause = "network" | "throttle" | "quota";

export interface Settings {
	enabled: boolean;
	network: boolean;
	throttle: boolean;
	quota: boolean;
	wake: boolean;
	retryDelayMs: number;
	quotaDelayMs: number;
	maxAttempts: number;
}

export const defaults: Settings = {
	enabled: true,
	network: true,
	throttle: true,
	quota: true,
	wake: true,
	retryDelayMs: 10000,
	quotaDelayMs: 30000,
	maxAttempts: 5,
};

export function classify(error: string, status?: number): Cause | undefined {
	if (
		/context.{0,30}(full|exceed|length|limit)|maximum.{0,20}(output|tokens)|max_tokens|output.{0,20}(length|limit|tokens)|invalid.{0,10}(key|token)|unauthori[sz]ed|permission|forbidden/i.test(
			error,
		)
	)
		return;
	if (
		/subscription.{0,30}(limit|quota)|quota.{0,20}(exhaust|exceed)|usage.{0,15}limit|insufficient_quota/i.test(
			error,
		)
	)
		return "quota";
	if (
		/fetch failed|network|ECONNRESET|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|timed? ?out|timeout|socket hang up/i.test(
			error,
		)
	)
		return "network";
	if (status === 429 || /rate.?limit|too many requests|throttl/i.test(error))
		return "throttle";
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
			if (time !== undefined) times.push(time);
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
	private pending?: { at: number; cause: Cause };
	private stagedFailure?: {
		error: string;
		headers: Record<string, string>;
		status?: number;
	};
	private lastHeaders: Record<string, string> = {};
	private lastStatus: number | undefined;
	private attempts = 0;
	status = "idle";

	constructor(settings: Partial<Settings> = {}) {
		this.settings = { ...defaults, ...settings };
		if (!this.settings.enabled) {
			this.status = "disabled";
		}
	}

	private clearStagedFailure() {
		this.stagedFailure = undefined;
		this.lastHeaders = {};
		this.lastStatus = undefined;
	}

	updateSettings(nextSettings: Partial<Settings>) {
		Object.assign(this.settings, { ...defaults, ...nextSettings });
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
			} else if (this.attempts >= this.settings.maxAttempts) {
				this.pending = undefined;
				this.status = "attempt limit reached";
			}
		} else if (this.status === "disabled") {
			this.status = "idle";
		}
	}

	cancel() {
		this.pending = undefined;
		this.clearStagedFailure();
		this.status = "cancelled";
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
		const cause = classify(error, status);
		if (!this.settings.enabled || !cause || !this.settings[cause]) {
			this.status = "not eligible";
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
				: Math.max(now + this.settings.retryDelayMs, reset ?? now);
		this.pending = { at, cause };
		this.status = `${cause}: waiting until ${new Date(at).toISOString()}`;
	}

	take(now: number, idle: boolean) {
		if (!this.pending || !idle || now < this.pending.at) return false;
		this.pending = undefined;
		this.attempts++;
		this.status = `resuming (attempt ${this.attempts})`;
		return true;
	}
}
