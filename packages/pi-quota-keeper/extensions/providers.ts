import type { ModelAuth, ProviderEnv } from "@earendil-works/pi-ai";
export interface Account {
	id: string;
	provider: string;
	label: string;
	credentialType: string;
	token?: string;
	projectId?: string;
	accountId?: string;
	requestAuth?: ModelAuth;
	requestEnv?: ProviderEnv;
	unavailable?: string;
}
export interface WindowQuota {
	id: string;
	remainingPercent?: number;
	resetAt?: number;
	shared?: boolean;
}
export interface QuotaData {
	resetCredits?: {
		availableCount: number;
		expirations?: { expiresAt?: number }[];
		detailsUnavailable?: string;
	};
	windows: WindowQuota[];
	activation: {
		supported: boolean;
		reason: string;
		bestEffort?: boolean;
		windowId?: string;
	};
}
export interface Snapshot extends QuotaData {
	credentialType?: string;
	id: string;
	provider: string;
	label: string;
	status: "available" | "unavailable";
	reason?: string;
	fetchedAt: number;
}
export const MAX_JSON_BYTES = 2 * 1024 * 1024;
export function nonEmptyText(value: unknown): string | undefined {
	return typeof value === "string" && value.length > 0 ? value : undefined;
}
export function isAntigravityProvider(provider: string): boolean {
	return provider === "antigravity" || provider === "google-antigravity";
}
export function isCodexProvider(provider: string): boolean {
	return provider === "openai" || provider === "openai-codex";
}
export function record(value: unknown): Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

function resetCount(raw: unknown): number | undefined {
	const count =
		typeof raw === "number"
			? raw
			: typeof raw === "string" && /^\d+$/.test(raw.trim())
				? Number(raw)
				: undefined;
	return count !== undefined && Number.isSafeInteger(count) && count >= 0
		? count
		: undefined;
}
function resetExpirations(
	data: unknown,
	current: NonNullable<QuotaData["resetCredits"]>,
): NonNullable<QuotaData["resetCredits"]> {
	const d = record(data);
	if (!Array.isArray(d.credits))
		throw new Error("Unrecognized reset-credit details");
	const seen = new Set<string>();
	const expirations: { expiresAt?: number }[] = [];
	for (const raw of d.credits) {
		const c = record(raw);
		if (typeof c.id !== "string" || !c.id || seen.has(c.id)) continue;
		seen.add(c.id);
		if (c.status !== undefined && c.status !== "available") continue;
		const expiresAt = time(c.expires_at);
		expirations.push(expiresAt === undefined ? {} : { expiresAt });
	}
	return {
		availableCount: resetCount(d.available_count) ?? current.availableCount,
		expirations,
	};
}
function percent(v: unknown): number | undefined {
	return typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 100
		? v
		: undefined;
}
function time(v: unknown): number | undefined {
	const t =
		typeof v === "number"
			? v < 1e12
				? v * 1000
				: v
			: typeof v === "string"
				? Date.parse(v)
				: NaN;
	return Number.isFinite(t) && t >= 0 && t <= 8.64e15 ? t : undefined;
}
const noActivation = {
	supported: false,
	reason:
		"No qualified first-request activation mechanism for this service/window.",
};
export function parseQuota(provider: string, data: unknown): QuotaData {
	let resetCredits: QuotaData["resetCredits"];
	const d = record(data),
		windows: WindowQuota[] = [];
	const add = (id: string, rem: unknown, reset: unknown, shared?: boolean) => {
		if (!/^[a-z0-9_.: -]{1,128}$/i.test(id)) return;
		const remainingPercent = percent(rem),
			resetAt = time(reset);
		if (remainingPercent !== undefined || resetAt !== undefined)
			windows.push({
				id,
				remainingPercent,
				resetAt,
				...(shared ? { shared: true } : {}),
			});
	};
	if (isAntigravityProvider(provider)) {
		const fraction = (value: unknown) =>
			typeof value === "number" ? value * 100 : undefined;
		const buckets = (value: unknown, group = "shared pool") => {
			if (!Array.isArray(value)) return;
			for (const [index, raw] of value.entries()) {
				const b = record(raw);
				if (b.disabled === true) continue;
				add(
					String(b.bucketId ?? `${group}:${b.window ?? index + 1}`),
					fraction(b.remainingFraction),
					b.resetTime,
					true,
				);
			}
		};
		if (Array.isArray(d.groups))
			for (const raw of d.groups) {
				const g = record(raw);
				buckets(
					g.buckets,
					typeof g.displayName === "string" ? g.displayName : undefined,
				);
			}
		if (!windows.length) buckets(d.buckets);
		if (!windows.length)
			for (const [id, raw] of Object.entries(record(d.models))) {
				const model = record(raw);
				const quotas: { quota: Record<string, unknown>; source: string }[] = [];
				const collect = (value: unknown, source: string) => {
					for (const item of Array.isArray(value) ? value : [value])
						if (
							item !== null &&
							typeof item === "object" &&
							!Array.isArray(item)
						)
							quotas.push({ quota: record(item), source });
				};
				collect(model.quotaInfo, "quotaInfo");
				collect(model.quotaInfos, "quotaInfos");
				collect(model.dailyQuotaInfo, "daily");
				collect(model.dailyQuotaInfos, "daily");
				collect(model.weeklyQuotaInfo, "weekly");
				collect(model.weeklyQuotaInfos, "weekly");
				for (const [tier, value] of Object.entries(
					record(model.quotaInfoByTier),
				))
					collect(value, `tier.${tier}`);
				for (const field of ["quotaInfoByWindow", "quotaInfosByWindow"])
					for (const [window, value] of Object.entries(record(model[field])))
						collect(value, window);
				for (const [index, { quota: q, source }] of quotas.entries()) {
					const window =
						typeof q.windowId === "string"
							? q.windowId
							: typeof q.windowLabel === "string"
								? q.windowLabel
								: undefined;
					const key =
						quotas.length === 1 && source === "quotaInfo" && !window
							? id
							: `${id}:${window ?? source}:${index + 1}`;
					add(key, fraction(q.remainingFraction), q.resetTime, true);
				}
			}
	} else if (provider === "anthropic") {
		for (const [id, v] of Object.entries(d)) {
			if (!/^(five_hour|seven_day)/.test(id)) continue;
			const q = record(v),
				used = percent(q.utilization);
			add(id, used === undefined ? undefined : 100 - used, q.resets_at);
		}
		const five = record(d.five_hour);
		if (
			percent(five.utilization) !== undefined &&
			time(five.resets_at) !== undefined
		) {
			return {
				windows,
				activation: {
					supported: true,
					reason:
						"Claude five-hour window starts on first message; requires authorized subscription access and explicit account opt-in.",
				},
			};
		}
	} else if (isCodexProvider(provider)) {
		const count = resetCount(
			record(d.rate_limit_reset_credits).available_count,
		);
		if (count !== undefined) resetCredits = { availableCount: count };
		for (const [id, v] of Object.entries(record(d.rate_limit))) {
			const q = record(v),
				used = percent(q.used_percent);
			add(id, used === undefined ? undefined : 100 - used, q.reset_at);
		}
	} else if (provider === "github-copilot") {
		for (const [id, v] of Object.entries(record(d.quota_snapshots))) {
			const q = record(v);
			add(
				id,
				q.percent_remaining,
				d.quota_reset_date ?? d.quota_reset_date_utc,
			);
		}
	}
	return {
		windows,
		activation: { ...noActivation },
		...(resetCredits ? { resetCredits } : {}),
	};
}
type Fetcher = (
	input: string | URL | Request,
	init?: RequestInit,
) => Promise<Response>;
export async function readJson(response: Response): Promise<unknown> {
	if (!response.ok) {
		await response.body?.cancel();
		throw new Error(`HTTP ${response.status}`);
	}
	const reader = response.body?.getReader();
	if (!reader) throw new Error("Empty response");
	const chunks: Uint8Array[] = [];
	let size = 0;
	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			size += value.length;
			if (size > MAX_JSON_BYTES) throw new Error("Quota response too large");
			chunks.push(value);
		}
	} finally {
		await reader.cancel().catch(() => {});
	}
	return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

const antigravityEndpoints = [
	"https://daily-cloudcode-pa.googleapis.com",
	"https://daily-cloudcode-pa.sandbox.googleapis.com",
	"https://cloudcode-pa.googleapis.com",
];
export function antigravityHeaders(token: string): Record<string, string> {
	// Protocol compatibility from OMP v18.16.0. Keep this plugin identifiable.
	const os = process.platform === "win32" ? "windows" : process.platform;
	const arch = process.arch === "x64" ? "amd64" : process.arch;
	return {
		Authorization: `Bearer ${token}`,
		"Content-Type": "application/json",
		"User-Agent": `antigravity/hub/2.26.0 (aidev_client; os_type=${os}; arch=${arch}; cl=1005016104) pi-quota-keeper/0.1`,
		"Accept-Encoding": "gzip",
	};
}
async function queryAntigravity(
	account: Account,
	signal: AbortSignal,
	fetcher: Fetcher,
): Promise<QuotaData> {
	const headers = antigravityHeaders(account.token ?? "");
	// One total budget, not a fresh 15 seconds for each fallback.
	const deadline = AbortSignal.any([signal, AbortSignal.timeout(15000)]);
	let lastError: unknown = new Error("Unrecognized quota response");
	for (const path of ["retrieveUserQuotaSummary", "fetchAvailableModels"])
		for (const endpoint of antigravityEndpoints) {
			deadline.throwIfAborted();
			try {
				const data = await readJson(
					await fetcher(`${endpoint}/v1internal:${path}`, {
						method: "POST",
						headers,
						body: JSON.stringify({ project: account.projectId }),
						redirect: "error",
						signal: deadline,
					}),
				);
				deadline.throwIfAborted();
				const parsed = parseQuota(account.provider, data);
				if (parsed.windows.length) return parsed;
				lastError = new Error("Unrecognized quota response");
			} catch (error) {
				if (
					deadline.aborted ||
					(error instanceof Error && error.message === "HTTP 401")
				)
					throw error;
				lastError = error;
			}
		}
	throw lastError;
}
export async function queryQuota(
	account: Account,
	signal: AbortSignal,
	fetcher: Fetcher = fetch,
): Promise<Snapshot> {
	const base = {
		id: account.id,
		provider: account.provider,
		label: account.label,
		credentialType: account.credentialType,
		fetchedAt: Date.now(),
	};
	const unavailable = (reason: string): Snapshot => ({
		...base,
		status: "unavailable",
		reason,
		windows: [],
		activation: { supported: false, reason },
	});
	if (account.unavailable) return unavailable(account.unavailable);
	if (account.credentialType !== "oauth")
		return unavailable(
			"Subscription quota needs subscription OAuth, not API-key billing.",
		);
	if (!account.token)
		return unavailable(
			"No usable Pi OAuth token; reauthenticate the account in Pi.",
		);
	try {
		let parsed: QuotaData;
		if (isAntigravityProvider(account.provider)) {
			if (!account.projectId)
				return unavailable(
					"Antigravity project ID unavailable; reauthenticate via pi-antigravity.",
				);
			parsed = await queryAntigravity(account, signal, fetcher);
		} else {
			let url: string;
			const headers: Record<string, string> = {
				Authorization: `Bearer ${account.token}`,
				Accept: "application/json",
				"User-Agent": "pi-quota-keeper/0.1",
			};
			if (account.provider === "anthropic") {
				url = "https://api.anthropic.com/api/oauth/usage";
				headers["anthropic-beta"] = "oauth-2025-04-20";
			} else if (
				account.provider === "openai" ||
				account.provider === "openai-codex"
			) {
				url = "https://chatgpt.com/backend-api/wham/usage";
				if (account.accountId)
					headers["ChatGPT-Account-Id"] = account.accountId;
			} else if (account.provider === "github-copilot") {
				url = "https://api.github.com/copilot_internal/user";
				headers["X-GitHub-Api-Version"] = "2022-11-28";
			} else
				return unavailable(
					"Subscription quota endpoint not qualified for this Pi provider.",
				);
			const deadline = AbortSignal.any([signal, AbortSignal.timeout(15000)]);
			deadline.throwIfAborted();
			const data = await readJson(
				await fetcher(url, {
					method: "GET",
					headers,
					redirect: "error",
					signal: deadline,
				}),
			);
			parsed = parseQuota(account.provider, data);

			if (
				isCodexProvider(account.provider) &&
				parsed.resetCredits &&
				parsed.resetCredits.availableCount > 0
			) {
				try {
					const details = await readJson(
						await fetcher(
							"https://chatgpt.com/backend-api/wham/rate-limit-reset-credits",
							{
								method: "GET",
								headers,
								redirect: "error",
								signal: AbortSignal.any([deadline, AbortSignal.timeout(5000)]),
							},
						),
					);
					signal.throwIfAborted();
					parsed.resetCredits = resetExpirations(details, parsed.resetCredits);
				} catch (error) {
					if (signal.aborted) throw error;
					parsed.resetCredits.detailsUnavailable =
						error instanceof Error && /^HTTP \d{3}$/.test(error.message)
							? error.message
							: "request failed";
				}
			}
		}
		if (
			!parsed.windows.length &&
			!parsed.activation.supported &&
			!parsed.resetCredits
		)
			return unavailable(
				"Service returned no recognizable quota/reset data for this account.",
			);
		return { ...base, ...parsed, status: "available" };
	} catch (error) {
		const msg =
			error instanceof Error && /^HTTP \d{3}$/.test(error.message)
				? error.message
				: signal.aborted
					? "Maintenance stopped."
					: "Quota request failed (network, permission, timeout, or unrecognized response).";
		return unavailable(msg);
	}
}
