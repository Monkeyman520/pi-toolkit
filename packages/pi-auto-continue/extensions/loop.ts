export type OnErrorPolicy = "defer" | "wait-quota" | "stop";
export type QueueEmptyPolicy = "stop" | "continue";
export type PromptMode = "queue" | "pipe" | "file" | "direct";

export const DEFAULT_CONTINUE_PROMPT = "Continue to the next step.";

export interface QueueItem {
	id: number;
	text: string;
	createdAt: number;
}

export interface Settings {
	delayMs: number;
	maxRounds: number;
	onError: OnErrorPolicy;
	queueEmptyPolicy: QueueEmptyPolicy;
	expandPromptTemplates: boolean;
	quotaWait: boolean;
	quotaDelayMs: number;
	prompt: string;
	promptFile: string;
	promptPipe: string;
	pipeFormatPrefix: string;
	pipeFormatSuffix: string;
	pipeRequireFormat: boolean;
	pipeTimeoutMs: number;
	stopFile: string;
	stopCommand: string;
	stopCommandTimeoutMs: number;
	notifyOnContinue: boolean;
}

export interface SessionOverrides extends Partial<Settings> {
	deadlineMs?: number;
}

export interface PendingRound {
	at: number;
	scheduledAt: number;
	nextRound: number;
	source: "queue" | "loop";
	waitingForQuota: boolean;
}

export interface RoundTrigger {
	round: number;
	maxRounds: number;
	at: number;
	source: "queue" | "loop";
	queueItem?: QueueItem;
}

export interface LoopDiagnostics {
	armed: boolean;
	status: string;
	phase?: string;
	rounds: number;
	maxRounds: number;
	queueLength: number;
	queueHeadPreview?: string;
	queueDrainMode: boolean;
	promptMode: PromptMode;
	pendingAt?: number;
	pendingSource?: "queue" | "loop";
	waitingForQuota: boolean;
	quotaResetAt?: number;
	quotaUnavailable: boolean;
	deadlineMs?: number;
	onError: OnErrorPolicy;
	queueEmptyPolicy: QueueEmptyPolicy;
	stopFile?: string;
	stopCommand?: string;
	lastStopReason?: string;
}

export const defaults: Settings = {
	delayMs: 15000,
	maxRounds: 10,
	onError: "defer",
	queueEmptyPolicy: "stop",
	expandPromptTemplates: true,
	quotaWait: true,
	quotaDelayMs: 30000,
	prompt: DEFAULT_CONTINUE_PROMPT,
	promptFile: "",
	promptPipe: "",
	pipeFormatPrefix: "",
	pipeFormatSuffix: "",
	pipeRequireFormat: false,
	pipeTimeoutMs: 30000,
	stopFile: "",
	stopCommand: "",
	stopCommandTimeoutMs: 15000,
	notifyOnContinue: true,
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

export function previewPromptText(text: string, maxLen = 60): string {
	const compact = text.replace(/\s+/g, " ").trim();
	if (compact.length <= maxLen) return compact;
	return `${compact.slice(0, Math.max(1, maxLen - 3))}...`;
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

export function parsePositiveDurationMs(raw: string): number | undefined {
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

export function parseDelayInputMs(raw: string): number | undefined {
	const trimmed = raw.trim();
	if (!trimmed) return undefined;
	if (/^\d+$/.test(trimmed)) {
		const ms = Number.parseInt(trimmed, 10);
		return Number.isFinite(ms) ? ms : undefined;
	}
	return parseDurationMs(trimmed);
}

export function parseUntilMs(raw: string): number | undefined {
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
			: Number.NaN
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

export function isQuotaOrRateLimitError(
	error: string,
	status?: number,
): boolean {
	if (
		status === 401 ||
		status === 403 ||
		/context.{0,30}(full|exceed|length|limit)|maximum.{0,20}(output|tokens)|max_tokens|output.{0,20}(length|limit|tokens)|invalid.{0,10}(key|token)|unauthori[sz]ed|permission|forbidden/i.test(
			error,
		)
	) {
		return false;
	}
	if (
		status === 429 ||
		/subscription.{0,30}(limit|quota)|quota.{0,20}(exhaust|exceed)|usage.{0,15}limit|insufficient_quota|rate.?limit|too many requests|throttl/i.test(
			error,
		)
	) {
		return true;
	}
	return false;
}

export function parseQuotaResetTimeMs(
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
		if (Number.isFinite(time) && time >= 0 && time <= 8.64e15) {
			times.push(time);
		}
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
	return times.length > 0 ? Math.max(now, ...times) : undefined;
}

function normalizeSettings(input: Partial<Settings>): Settings {
	return {
		...defaults,
		...input,
		prompt: input.prompt?.trim() ? input.prompt : DEFAULT_CONTINUE_PROMPT,
		promptFile: (input.promptFile ?? "").trim(),
		promptPipe: (input.promptPipe ?? "").trim(),
		pipeFormatPrefix: (input.pipeFormatPrefix ?? "").trim(),
		pipeFormatSuffix: (input.pipeFormatSuffix ?? "").trim(),
		stopFile: (input.stopFile ?? "").trim(),
		stopCommand: (input.stopCommand ?? "").trim(),
	};
}

interface StagedTurnOutcome {
	stopReason?: string;
	errorMessage: string;
	headers: Record<string, string>;
	status?: number;
}

export class ContinueController {
	private baseSettings: Settings;
	private sessionOverrides: Partial<Settings> = {};
	private armed = false;
	private rounds = 0;
	private queue: QueueItem[] = [];
	private nextQueueId = 1;
	private queueDrainMode = false;
	private deadlineMs: number | undefined;
	private pending: PendingRound | undefined;
	private activePhase: string | undefined;
	private lastStopReason: string | undefined;
	private status = "disarmed";
	private lastHeaders: Record<string, string> = {};
	private lastStatus: number | undefined;
	private stagedOutcome: StagedTurnOutcome | undefined;
	private quotaResetAt: number | undefined;
	private quotaUnavailable = false;

	constructor(initialSettings: Partial<Settings> = {}) {
		this.baseSettings = normalizeSettings(initialSettings);
	}

	get settings(): Settings {
		return normalizeSettings({
			...this.baseSettings,
			...this.sessionOverrides,
		});
	}

	get defaultSettings(): Settings {
		return { ...this.baseSettings };
	}

	isArmed(): boolean {
		return this.armed;
	}

	hasPending(): boolean {
		return this.pending !== undefined;
	}

	getRounds(): number {
		return this.rounds;
	}

	getDeadlineMs(): number | undefined {
		return this.deadlineMs;
	}

	queueLength(): number {
		return this.queue.length;
	}

	listQueue(): readonly QueueItem[] {
		return this.queue.map((item) => ({ ...item }));
	}

	peekQueueHead(): QueueItem | undefined {
		const head = this.queue[0];
		return head ? { ...head } : undefined;
	}

	enqueue(text: string, now = Date.now()): QueueItem | undefined {
		const trimmed = text.trim();
		if (!trimmed) return undefined;
		const item: QueueItem = {
			id: this.nextQueueId++,
			text: trimmed,
			createdAt: now,
		};
		this.queue.push(item);
		return { ...item };
	}

	prepend(text: string, now = Date.now()): QueueItem | undefined {
		const trimmed = text.trim();
		if (!trimmed) return undefined;
		const item: QueueItem = {
			id: this.nextQueueId++,
			text: trimmed,
			createdAt: now,
		};
		this.queue.unshift(item);
		return { ...item };
	}

	removeAt(oneBasedIndex: number): QueueItem | undefined {
		if (
			!Number.isInteger(oneBasedIndex) ||
			oneBasedIndex < 1 ||
			oneBasedIndex > this.queue.length
		) {
			return undefined;
		}
		const [removed] = this.queue.splice(oneBasedIndex - 1, 1);
		this.reconcilePendingAfterQueueMutation();
		return removed ? { ...removed } : undefined;
	}

	move(fromOneBased: number, toOneBased: number): QueueItem | undefined {
		if (
			!Number.isInteger(fromOneBased) ||
			!Number.isInteger(toOneBased) ||
			fromOneBased < 1 ||
			fromOneBased > this.queue.length ||
			toOneBased < 1 ||
			toOneBased > this.queue.length
		) {
			return undefined;
		}
		const [item] = this.queue.splice(fromOneBased - 1, 1);
		if (!item) return undefined;
		this.queue.splice(toOneBased - 1, 0, item);
		return { ...item };
	}

	takeAt(oneBasedIndex: number): QueueItem | undefined {
		if (
			!Number.isInteger(oneBasedIndex) ||
			oneBasedIndex < 1 ||
			oneBasedIndex > this.queue.length
		) {
			return undefined;
		}
		const [item] = this.queue.splice(oneBasedIndex - 1, 1);
		this.reconcilePendingAfterQueueMutation();
		return item ? { ...item } : undefined;
	}

	restoreAt(zeroBasedIndex: number, item: QueueItem): void {
		const clamped = Math.max(0, Math.min(this.queue.length, zeroBasedIndex));
		this.queue.splice(clamped, 0, { ...item });
	}

	clearQueue(): number {
		const count = this.queue.length;
		this.queue = [];
		this.reconcilePendingAfterQueueMutation();
		return count;
	}

	private reconcilePendingAfterQueueMutation(): void {
		if (this.pending?.source !== "queue") return;
		if (this.queue.length > 0) return;
		if (this.queueDrainMode && this.settings.queueEmptyPolicy === "stop") {
			this.disarm("queue completed");
			return;
		}
		this.pending = undefined;
		if (this.armed) {
			this.status = "armed";
		}
	}

	setPhase(phase: string | undefined): void {
		this.activePhase = phase;
	}

	updateBaseSettings(nextSettings: Partial<Settings>): void {
		this.baseSettings = normalizeSettings(nextSettings);
		if (!this.armed) return;
		const effective = this.settings;
		if (effective.maxRounds > 0 && this.rounds >= effective.maxRounds) {
			this.disarm("round limit reached");
		}
	}

	arm(
		overrides: SessionOverrides = {},
		now = Date.now(),
		idle = false,
	): { ok: true } | { ok: false; error: string } {
		const { deadlineMs, ...settingsOverrides } = overrides;
		if (deadlineMs !== undefined && deadlineMs <= now) {
			return { ok: false, error: "Deadline must be in the future." };
		}
		this.armed = true;
		this.rounds = 0;
		this.sessionOverrides = { ...settingsOverrides };
		this.deadlineMs = deadlineMs;
		this.pending = undefined;
		this.activePhase = undefined;
		this.lastStopReason = undefined;
		this.queueDrainMode = this.queue.length > 0;
		this.status = "armed";

		if (idle && this.queue.length > 0) {
			const effective = this.settings;
			if (effective.quotaWait && this.quotaUnavailable) {
				this.status = "quota: reset time unavailable";
				return { ok: true };
			}
			const quotaFloor = this.getQuotaFloorMs(effective, now);
			const normalAt = now + effective.delayMs;
			const at =
				quotaFloor !== undefined ? Math.max(normalAt, quotaFloor) : normalAt;
			if (this.deadlineMs !== undefined && at > this.deadlineMs) {
				this.disarm("wait exceeds deadline");
				return { ok: true };
			}
			this.pending = {
				at,
				scheduledAt: now,
				nextRound: this.rounds + 1,
				source: "queue",
				waitingForQuota: quotaFloor !== undefined && quotaFloor > normalAt,
			};
			this.status = this.formatStatus(now);
		}

		return { ok: true };
	}

	disarm(reason = "disarmed"): void {
		this.armed = false;
		this.pending = undefined;
		this.activePhase = undefined;
		this.sessionOverrides = {};
		this.deadlineMs = undefined;
		this.queueDrainMode = false;
		this.lastStopReason = reason;
		this.status = reason;
	}

	cancelPendingWait(): void {
		this.pending = undefined;
		this.activePhase = undefined;
		if (this.armed) {
			this.status = "armed";
		}
	}

	userInput(): void {
		this.pending = undefined;
		this.activePhase = undefined;
		if (this.armed) {
			this.status = "armed";
		}
	}

	running(): void {
		this.pending = undefined;
		this.activePhase = undefined;
		this.stagedOutcome = undefined;
		if (this.armed) {
			this.status = "armed (running)";
		}
	}

	recordRequestStart(): void {
		this.lastHeaders = {};
		this.lastStatus = undefined;
	}

	recordProviderResponse(
		headers: Record<string, string>,
		status?: number,
	): void {
		this.lastHeaders = { ...headers };
		this.lastStatus = status;
	}

	recordAssistantMessage(stopReason?: string, errorMessage?: string): void {
		this.stagedOutcome = {
			stopReason,
			errorMessage: errorMessage ?? "",
			headers: { ...this.lastHeaders },
			status: this.lastStatus,
		};
	}

	private getQuotaFloorMs(
		effective: Settings,
		now: number,
	): number | undefined {
		if (!effective.quotaWait || this.quotaResetAt === undefined) {
			return undefined;
		}
		const target = this.quotaResetAt + effective.quotaDelayMs;
		return target > now ? target : undefined;
	}

	settleTurn(aborted: boolean, now: number): void {
		const outcome = this.stagedOutcome;
		this.stagedOutcome = undefined;
		this.lastHeaders = {};
		this.lastStatus = undefined;
		this.pending = undefined;
		this.activePhase = undefined;

		if (!aborted && outcome) {
			if (outcome.stopReason === "error") {
				const reset = parseQuotaResetTimeMs(
					outcome.headers,
					outcome.errorMessage,
					now,
				);
				const isQuota = isQuotaOrRateLimitError(
					outcome.errorMessage,
					outcome.status,
				);
				if (reset !== undefined) {
					this.quotaResetAt = reset;
					this.quotaUnavailable = false;
				} else if (isQuota) {
					this.quotaResetAt = undefined;
					this.quotaUnavailable = true;
				}
			} else if (outcome.stopReason && outcome.stopReason !== "aborted") {
				this.quotaResetAt = undefined;
				this.quotaUnavailable = false;
			}
		}

		if (!this.armed) return;

		if (aborted || outcome?.stopReason === "aborted") {
			this.disarm("disarmed (aborted)");
			return;
		}

		const effective = this.settings;

		if (outcome?.stopReason === "error") {
			if (effective.onError === "stop") {
				this.disarm("stopped on error");
				return;
			}
			if (effective.onError === "wait-quota") {
				const isQuota = isQuotaOrRateLimitError(
					outcome.errorMessage,
					outcome.status,
				);
				if (isQuota && effective.quotaWait) {
					if (this.quotaResetAt === undefined) {
						this.status = "quota: reset time unavailable";
						return;
					}
					if (this.queue.length > 0) {
						if (this.deadlineMs !== undefined && now >= this.deadlineMs) {
							this.disarm("duration/deadline reached");
							return;
						}
						if (effective.maxRounds > 0 && this.rounds >= effective.maxRounds) {
							this.disarm("round limit reached");
							return;
						}
						const at = Math.max(
							now,
							this.quotaResetAt + effective.quotaDelayMs,
						);
						if (this.deadlineMs !== undefined && at > this.deadlineMs) {
							this.disarm("wait exceeds deadline");
							return;
						}
						this.queueDrainMode = true;
						this.pending = {
							at,
							scheduledAt: now,
							nextRound: this.rounds + 1,
							source: "queue",
							waitingForQuota: true,
						};
						this.status = this.formatStatus(now);
						return;
					}
				}
				this.status = "armed (deferred error)";
				return;
			}
			this.status = "armed (deferred error)";
			return;
		}

		if (this.deadlineMs !== undefined && now >= this.deadlineMs) {
			this.disarm("duration/deadline reached");
			return;
		}

		if (
			this.queue.length === 0 &&
			this.queueDrainMode &&
			effective.queueEmptyPolicy === "stop"
		) {
			this.disarm("queue completed");
			return;
		}

		if (effective.maxRounds > 0 && this.rounds >= effective.maxRounds) {
			this.disarm("round limit reached");
			return;
		}

		const quotaFloor = this.getQuotaFloorMs(effective, now);
		const normalAt = now + effective.delayMs;
		const at =
			quotaFloor !== undefined ? Math.max(normalAt, quotaFloor) : normalAt;

		if (this.deadlineMs !== undefined && at > this.deadlineMs) {
			this.disarm("wait exceeds deadline");
			return;
		}

		const source: "queue" | "loop" = this.queue.length > 0 ? "queue" : "loop";
		if (source === "queue") {
			this.queueDrainMode = true;
		}

		this.pending = {
			at,
			scheduledAt: now,
			nextRound: this.rounds + 1,
			source,
			waitingForQuota: quotaFloor !== undefined && quotaFloor > normalAt,
		};
		this.status = this.formatStatus(now);
	}

	expireDeadline(now: number): boolean {
		if (this.armed && this.deadlineMs !== undefined && now >= this.deadlineMs) {
			this.disarm("duration/deadline reached");
			return true;
		}
		return false;
	}

	peekDue(now: number, idle: boolean): PendingRound | undefined {
		if (this.expireDeadline(now)) return undefined;
		if (!this.armed || !this.pending || !idle || now < this.pending.at) {
			return undefined;
		}
		const effective = this.settings;
		if (effective.maxRounds > 0 && this.rounds >= effective.maxRounds) {
			this.disarm("round limit reached");
			return undefined;
		}
		if (this.pending.source === "queue" && this.queue.length === 0) {
			if (this.queueDrainMode && effective.queueEmptyPolicy === "stop") {
				this.disarm("queue completed");
				return undefined;
			}
			this.pending = { ...this.pending, source: "loop" };
		}
		return { ...this.pending };
	}

	takeRound(
		now: number,
		idle: boolean,
		expectedAt?: number,
	): RoundTrigger | undefined {
		if (this.expireDeadline(now)) return undefined;
		if (!this.armed || !this.pending || !idle || now < this.pending.at) {
			return undefined;
		}
		if (expectedAt !== undefined && this.pending.at !== expectedAt) {
			return undefined;
		}
		const effective = this.settings;
		if (effective.maxRounds > 0 && this.rounds >= effective.maxRounds) {
			this.disarm("round limit reached");
			return undefined;
		}
		let source: "queue" | "loop";
		let queueItem: QueueItem | undefined;
		if (this.queue.length > 0) {
			queueItem = this.queue.shift();
			source = "queue";
			this.queueDrainMode = true;
		} else if (
			this.pending.source === "queue" &&
			this.queueDrainMode &&
			effective.queueEmptyPolicy === "stop"
		) {
			this.disarm("queue completed");
			return undefined;
		} else {
			source = "loop";
		}

		const current = this.pending;
		this.pending = undefined;
		this.activePhase = undefined;
		this.rounds++;
		this.status =
			source === "queue"
				? `dispatching queue item (round ${this.rounds})`
				: `continuing (round ${this.rounds})`;
		return {
			round: this.rounds,
			maxRounds: effective.maxRounds,
			at: current.at,
			source,
			queueItem,
		};
	}

	rollbackFailedDispatch(
		item?: QueueItem,
		reason = "continuation was not accepted",
	): void {
		if (item) {
			this.restoreAt(0, item);
		}
		if (this.rounds > 0) {
			this.rounds--;
		}
		this.disarm(reason);
	}

	resetSession(): void {
		this.armed = false;
		this.rounds = 0;
		this.queue = [];
		this.nextQueueId = 1;
		this.queueDrainMode = false;
		this.deadlineMs = undefined;
		this.pending = undefined;
		this.activePhase = undefined;
		this.lastStopReason = undefined;
		this.status = "disarmed";
		this.lastHeaders = {};
		this.lastStatus = undefined;
		this.stagedOutcome = undefined;
		this.quotaResetAt = undefined;
		this.quotaUnavailable = false;
		this.sessionOverrides = {};
	}

	getPromptMode(): PromptMode {
		if (this.queue.length > 0) return "queue";
		const s = this.settings;
		if (s.promptPipe) return "pipe";
		if (s.promptFile) return "file";
		return "direct";
	}

	formatStatus(now = Date.now()): string {
		const qSuffix = this.queue.length > 0 ? ` (q:${this.queue.length})` : "";
		if (this.activePhase) {
			return `${this.activePhase}${qSuffix}`;
		}
		if (this.pending) {
			if (this.deadlineMs !== undefined && now >= this.deadlineMs) {
				return `duration/deadline reached${qSuffix}`;
			}
			const remaining = formatCountdown(this.pending.at - now);
			if (this.pending.waitingForQuota) {
				return `quota wait ${remaining}${qSuffix}`;
			}
			if (this.pending.source === "queue") {
				return `next queue item in ${remaining}${qSuffix}`;
			}
			const maxRounds = this.settings.maxRounds;
			const roundLabel =
				maxRounds > 0
					? ` (${this.rounds + 1}/${maxRounds})`
					: ` (#${this.rounds + 1})`;
			return `continuing in ${remaining}${roundLabel}${qSuffix}`;
		}
		return `${this.status}${qSuffix}`;
	}

	getDiagnostics(now = Date.now()): LoopDiagnostics {
		const effective = this.settings;
		const head = this.queue[0];
		return {
			armed: this.armed,
			status: this.formatStatus(now),
			phase: this.activePhase,
			rounds: this.rounds,
			maxRounds: effective.maxRounds,
			queueLength: this.queue.length,
			queueHeadPreview: head ? previewPromptText(head.text) : undefined,
			queueDrainMode: this.queueDrainMode,
			promptMode: this.getPromptMode(),
			pendingAt: this.pending?.at,
			pendingSource: this.pending?.source,
			waitingForQuota: this.pending?.waitingForQuota ?? false,
			quotaResetAt: this.quotaResetAt,
			quotaUnavailable: this.quotaUnavailable,
			deadlineMs: this.deadlineMs,
			onError: effective.onError,
			queueEmptyPolicy: effective.queueEmptyPolicy,
			stopFile: effective.stopFile || undefined,
			stopCommand: effective.stopCommand || undefined,
			lastStopReason: this.lastStopReason,
		};
	}
}
