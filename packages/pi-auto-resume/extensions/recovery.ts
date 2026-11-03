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

function timestamp(raw: string): number | undefined {
	const num = Number(raw);
	const value = Number.isFinite(num)
		? num < 1e12
			? num * 1000
			: num
		: Date.parse(raw);
	return Number.isFinite(value) && value >= 0 && value <= 8.64e15
		? value
		: undefined;
}
export function resetTime(
	headers: Record<string, string>,
	error: string,
	now: number,
): number | undefined {
	const times: number[] = [];
	const retry = headers["retry-after"];
	if (retry !== undefined) {
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
		const raw = headers[key];
		if (raw) {
			const time = timestamp(raw);
			if (time !== undefined) times.push(time);
		}
	}
	for (const match of error.matchAll(
		/["']?(?:resets_at|resetTime|resetsAt)["']?\s*[:=]\s*["']?([\dTZ:.+-]+)/g,
	)) {
		const time = timestamp(match[1]);
		if (time !== undefined) times.push(time);
	}
	return times.length ? Math.max(now, ...times) : undefined;
}

export class Recovery {
	readonly settings: Settings;
	private pending?: { at: number; cause: Cause };
	private attempts = 0;
	status = "idle";
	constructor(settings: Partial<Settings> = {}) {
		this.settings = { ...defaults, ...settings };
	}
	cancel() {
		this.pending = undefined;
		this.status = "cancelled";
	}
	running() {
		this.pending = undefined;
		this.status = "host running";
	}
	userInput() {
		this.cancel();
		this.attempts = 0;
	}
	completed() {
		this.cancel();
		this.attempts = 0;
		this.status = "idle";
	}
	woke() {
		if (!this.settings.wake) this.cancel();
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
