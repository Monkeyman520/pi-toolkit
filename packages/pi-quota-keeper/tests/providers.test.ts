import { describe, expect, it } from "vitest";
import {
	type Account,
	parseQuota,
	queryQuota,
} from "../extensions/providers.ts";

const account: Account = {
	id: "test",
	provider: "antigravity",
	label: "Google Antigravity",
	credentialType: "oauth",
	token: "test-token",
	projectId: "project",
};
describe("truthful service quota", () => {
	it("parses Antigravity models with shared-pool attribution without inventing missing fractions", () => {
		const result = parseQuota("antigravity", {
			models: {
				gemini: {
					quotaInfo: {
						remainingFraction: 0.3,
						resetTime: "2030-01-01T00:00:00Z",
					},
				},
				unknown: { quotaInfo: {} },
			},
		});
		expect(result.windows).toEqual([
			{
				id: "gemini",
				remainingPercent: 30,
				resetAt: Date.parse("2030-01-01T00:00:00Z"),
				shared: true,
			},
		]);
		expect(result.activation.supported).toBe(false);
	});
	it("supports Antigravity aggregate groups", () => {
		const result = parseQuota("antigravity", {
			groups: [
				{
					displayName: "Shared",
					buckets: [
						{
							bucketId: "pool",
							remainingFraction: 0,
							resetTime: "2030-01-01T00:00:00Z",
						},
					],
				},
			],
		});
		expect(result.windows[0].remainingPercent).toBe(0);
	});

	const summary = {
		groups: [
			{
				displayName: "Gemini",
				buckets: [
					{
						bucketId: "gemini-5h",
						window: "5h",
						remainingFraction: 0.8,
						resetTime: "2030-01-01T05:00:00Z",
					},
					{
						bucketId: "gemini-weekly",
						window: "weekly",
						remainingFraction: 0.4,
						resetTime: "2030-01-07T00:00:00Z",
					},
				],
			},
		],
	};
	const legacy = {
		models: { gemini: { quotaInfo: { remainingFraction: 0.3 } } },
	};
	it.each([403, 429])(
		"does not hide queryable summary behind a failing model catalog (%s)",
		async (status) => {
			const urls: string[] = [];
			const r = await queryQuota(
				account,
				new AbortController().signal,
				async (input) => {
					urls.push(String(input));
					return String(input).endsWith(":retrieveUserQuotaSummary")
						? Response.json(summary)
						: new Response("", { status });
				},
			);
			expect(r.status).toBe("available");
			expect(r.windows.map((w) => w.remainingPercent)).toEqual([80, 40]);
			expect(urls).toEqual([
				"https://daily-cloudcode-pa.googleapis.com/v1internal:retrieveUserQuotaSummary",
			]);
			expect(r.activation.supported).toBe(false);
		},
	);
	it.each(["antigravity", "google-antigravity"])(
		"uses Antigravity-compatible, explicitly plugin-identified headers for %s",
		async (provider) => {
			let options: RequestInit | undefined;
			await queryQuota(
				{ ...account, provider },
				new AbortController().signal,
				async (_input, init) => {
					options = init;
					return Response.json(summary);
				},
			);
			const headers = new Headers(options?.headers);
			expect(headers.get("user-agent")).toMatch(/^antigravity\//);
			expect(headers.get("user-agent")).toContain("pi-quota-keeper/");
			expect(headers.get("accept-encoding")).toBe("gzip");
			expect(headers.get("authorization")).toBe("Bearer test-token");
			expect(options?.method).toBe("POST");
			expect(options?.redirect).toBe("error");
			expect(JSON.parse(String(options?.body))).toEqual({ project: "project" });
		},
	);
	it.each([403, 404, 429, 503])(
		"falls back to model quota when the aggregate endpoint returns %s",
		async (status) => {
			const urls: string[] = [];
			const r = await queryQuota(
				account,
				new AbortController().signal,
				async (input) => {
					urls.push(String(input));
					return String(input).endsWith(":retrieveUserQuotaSummary")
						? new Response("", { status })
						: Response.json(legacy);
				},
			);
			expect(r.status).toBe("available");
			expect(r.windows[0].remainingPercent).toBe(30);
			expect(urls[0]).toContain(":retrieveUserQuotaSummary");
			expect(urls.at(-1)).toContain(":fetchAvailableModels");
		},
	);
	it("tries an allowlisted alternate endpoint when the primary denies the summary", async () => {
		const urls: string[] = [];
		const r = await queryQuota(
			account,
			new AbortController().signal,
			async (input) => {
				urls.push(String(input));
				return String(input).startsWith(
					"https://daily-cloudcode-pa.sandbox.googleapis.com/",
				)
					? Response.json(summary)
					: new Response("", { status: 403 });
			},
		);
		expect(r.status).toBe("available");
		expect(urls).toEqual([
			"https://daily-cloudcode-pa.googleapis.com/v1internal:retrieveUserQuotaSummary",
			"https://daily-cloudcode-pa.sandbox.googleapis.com/v1internal:retrieveUserQuotaSummary",
		]);
	});
	it.each(["network", "invalid-json", "empty"])(
		"retains model fallback after a %s summary failure",
		async (failure) => {
			const r = await queryQuota(
				account,
				new AbortController().signal,
				async (input) => {
					if (String(input).endsWith(":fetchAvailableModels"))
						return Response.json(legacy);
					if (failure === "network") throw new Error("secret test-token");
					return failure === "invalid-json"
						? new Response("not json")
						: Response.json({});
				},
			);
			expect(r.status).toBe("available");
			expect(r.windows[0].remainingPercent).toBe(30);
		},
	);
	it("bounds failed probes to fixed HTTPS endpoints and shares one total deadline", async () => {
		const requests: { url: string; signal: AbortSignal | null | undefined }[] =
			[];
		const r = await queryQuota(
			account,
			new AbortController().signal,
			async (input, init) => {
				requests.push({ url: String(input), signal: init?.signal });
				expect(init?.redirect).toBe("error");
				return new Response("secret test-token", { status: 429 });
			},
		);
		expect(r.status).toBe("unavailable");
		expect(r.reason).toBe("HTTP 429");
		expect(requests.length).toBeGreaterThan(1);
		expect(requests.length).toBeLessThanOrEqual(6);
		expect(new Set(requests.map((r) => r.url)).size).toBe(requests.length);
		expect(new Set(requests.map((r) => r.signal)).size).toBe(1);
		expect(
			requests.every((r) =>
				[
					"daily-cloudcode-pa.googleapis.com",
					"daily-cloudcode-pa.sandbox.googleapis.com",
					"cloudcode-pa.googleapis.com",
				].includes(new URL(r.url).hostname),
			),
		).toBe(true);
		expect(JSON.stringify(r)).not.toMatch(/secret|test-token/);
	});
	it("does not cycle endpoints on authentication rejection", async () => {
		let calls = 0;
		const r = await queryQuota(
			account,
			new AbortController().signal,
			async () => {
				calls++;
				return new Response("", { status: 401 });
			},
		);
		expect(r.reason).toBe("HTTP 401");
		expect(calls).toBe(1);
	});
	it("does not issue quota requests after cancellation", async () => {
		const controller = new AbortController();
		controller.abort();
		let calls = 0;
		const r = await queryQuota(account, controller.signal, async () => {
			calls++;
			return Response.json(summary);
		});
		expect(r.reason).toBe("Maintenance stopped.");
		expect(calls).toBe(0);
	});
	it("stops fallback immediately when a request is cancelled", async () => {
		const controller = new AbortController();
		let calls = 0;
		const r = await queryQuota(account, controller.signal, async () => {
			calls++;
			controller.abort();
			throw new Error("cancelled");
		});
		expect(r.reason).toBe("Maintenance stopped.");
		expect(calls).toBe(1);
	});
	it("accepts top-level summary buckets and ignores disabled buckets", () => {
		const r = parseQuota("antigravity", {
			buckets: [
				...summary.groups[0].buckets,
				{ bucketId: "disabled", disabled: true, remainingFraction: 1 },
			],
		});
		expect(r.windows.map((w) => w.id)).toEqual(["gemini-5h", "gemini-weekly"]);
	});
	it("does not duplicate top-level buckets when grouped quotas are present", () => {
		const r = parseQuota("antigravity", {
			...summary,
			buckets: summary.groups[0].buckets,
		});
		expect(r.windows).toHaveLength(2);
	});
	it("distinguishes unnamed group buckets with different explicit windows", () => {
		const r = parseQuota("antigravity", {
			groups: [
				{
					displayName: "Gemini",
					buckets: [
						{ window: "daily", remainingFraction: 0.6 },
						{ window: "weekly", remainingFraction: 0.2 },
					],
				},
			],
		});
		expect(r.windows).toHaveLength(2);
		expect(new Set(r.windows.map((w) => w.id)).size).toBe(2);
	});
	it("keeps daily, weekly, tier, and multi-counter model quotas separate", () => {
		const r = parseQuota("antigravity", {
			models: {
				gemini: {
					quotaInfo: { remainingFraction: 0.9 },
					quotaInfos: [
						{ remainingFraction: 0.8, windowId: "5h" },
						{ remainingFraction: 0.7, windowId: "5h" },
					],
					dailyQuotaInfo: { remainingFraction: 0.6 },
					weeklyQuotaInfos: [{ remainingFraction: 0.5 }],
					quotaInfoByTier: { premium: { remainingFraction: 0.4 } },
					quotaInfoByWindow: { daily: { remainingFraction: 0.3 } },
					quotaInfosByWindow: { weekly: [{ remainingFraction: 0.2 }] },
				},
			},
		});
		expect(r.windows.map((w) => w.remainingPercent)).toEqual([
			90, 80, 70, 60, 50, 40, 30, 20,
		]);
		expect(new Set(r.windows.map((w) => w.id)).size).toBe(8);
		expect(r.windows.some((w) => w.id.includes("daily"))).toBe(true);
		expect(r.windows.some((w) => w.id.includes("weekly"))).toBe(true);
		expect(r.activation.supported).toBe(false);
	});
	it("retains reset-only windows as unknown instead of inventing zero percent", () => {
		const resetTime = "2030-01-07T00:00:00Z";
		const r = parseQuota("antigravity", {
			models: { gemini: { weeklyQuotaInfo: { resetTime } } },
		});
		expect(r.windows).toHaveLength(1);
		expect(r.windows[0].remainingPercent).toBeUndefined();
		expect(r.windows[0].resetAt).toBe(Date.parse(resetTime));
	});
	it("parses Claude subscription windows and recognizes actual five-hour eligibility", () => {
		const r = parseQuota("anthropic", {
			five_hour: { utilization: 40, resets_at: "2030-01-01T00:00:00Z" },
			seven_day: { utilization: 10, resets_at: "2030-01-02T00:00:00Z" },
		});
		expect(r.windows[0].remainingPercent).toBe(60);
		expect(r.activation.supported).toBe(true);
	});
	it("does not infer five-hour eligibility from a null quota (including plans without that limit)", () => {
		expect(
			parseQuota("anthropic", { five_hour: null }).activation.supported,
		).toBe(false);
	});
	it("does not enable Claude activation without a five-hour quota contract", () => {
		expect(
			parseQuota("anthropic", { seven_day: { utilization: 20 } }).activation
				.supported,
		).toBe(false);
	});
	it("parses Codex percent and epoch-second reset fields", () => {
		expect(
			parseQuota("openai-codex", {
				rate_limit: {
					primary_window: { used_percent: 25, reset_at: 2000000000 },
				},
			}).windows[0],
		).toMatchObject({ remainingPercent: 75, resetAt: 2000000000000 });
	});
	it("parses Copilot monthly allowances but never calls them five-hour activation", () => {
		const r = parseQuota("github-copilot", {
			quota_snapshots: { premium_interactions: { percent_remaining: 85 } },
			quota_reset_date: "2030-01-01T00:00:00Z",
		});
		expect(r.windows[0]).toMatchObject({ remainingPercent: 85 });
		expect(r.activation.supported).toBe(false);
	});
	it.each([
		null,
		{},
		{ models: { bad: { quotaInfo: { remainingFraction: "0.5" } } } },
		{ models: { bad: { quotaInfo: { remainingFraction: 2 } } } },
	])("does not fabricate quota from %j", (data) => {
		expect(parseQuota("antigravity", data).windows).toHaveLength(0);
	});
	it("reports an unsupported service explicitly without sending its token to an endpoint", async () => {
		const fetcher = async () => {
			throw new Error("must not fetch");
		};
		const r = await queryQuota(
			{ ...account, provider: "xai" },
			new AbortController().signal,
			fetcher,
		);
		expect(r.reason).toContain("not qualified");
	});
	it("uses allowlisted Antigravity URLs and refuses redirects", async () => {
		const requests: { url: string; redirect: RequestRedirect | undefined }[] =
			[];
		const r = await queryQuota(
			account,
			new AbortController().signal,
			async (input, init) => {
				requests.push({ url: String(input), redirect: init?.redirect });
				return new Response(
					JSON.stringify({
						models: { gemini: { quotaInfo: { remainingFraction: 1 } } },
					}),
				);
			},
		);
		expect(r.status).toBe("available");
		expect(
			requests.every(
				(x) =>
					x.url.startsWith("https://") &&
					x.url.includes(".googleapis.com/") &&
					x.redirect === "error",
			),
		).toBe(true);
	});
	it("does not expose server bodies or credentials on HTTP failures", async () => {
		const r = await queryQuota(
			account,
			new AbortController().signal,
			async () => new Response("secret test-token email", { status: 403 }),
		);
		expect(r.reason).toContain("403");
		expect(JSON.stringify(r)).not.toContain("test-token");
		expect(JSON.stringify(r)).not.toContain("secret");
	});
	it("labels non-subscription credentials rather than querying subscription quotas", async () => {
		const r = await queryQuota(
			{ ...account, credentialType: "api_key" },
			new AbortController().signal,
			async () => {
				throw new Error("must not fetch");
			},
		);
		expect(r.reason).toContain("subscription OAuth");
	});

	it.each(["openai", "openai-codex"])(
		"preserves %s quota-reset credits independently of percentage windows",
		(provider) => {
			const result = parseQuota(provider, {
				rate_limit: {
					primary_window: { used_percent: 25, reset_at: 2000000000 },
				},
				rate_limit_reset_credits: { available_count: 3 },
			});
			expect(result.resetCredits).toEqual({ availableCount: 3 });
			expect(result.windows[0].remainingPercent).toBe(75);
		},
	);
	it.each([0, "0", 2, "2"])(
		"preserves a valid reset count %j including explicit zero",
		(available_count) => {
			expect(
				parseQuota("openai-codex", {
					rate_limit_reset_credits: { available_count },
				}).resetCredits,
			).toEqual({ availableCount: Number(available_count) });
		},
	);
	it.each([
		undefined,
		null,
		"",
		-1,
		1.5,
		"invalid",
		"1.5",
		Number.POSITIVE_INFINITY,
		Number.MAX_SAFE_INTEGER + 1,
	])("does not invent reset credits from %j", (available_count) => {
		expect(
			parseQuota("openai-codex", {
				rate_limit_reset_credits: { available_count },
			}).resetCredits,
		).toBeUndefined();
	});
	it("does not parse another service's credits as Codex quota resets", () => {
		expect(
			parseQuota("antigravity", {
				rate_limit_reset_credits: { available_count: 2 },
			}).resetCredits,
		).toBeUndefined();
	});
	it("keeps a count-only Codex response usable without redeeming any reset", async () => {
		const urls: string[] = [];
		const result = await queryQuota(
			{ ...account, provider: "openai-codex" },
			new AbortController().signal,
			async (input) => {
				urls.push(String(input));
				return Response.json({
					rate_limit_reset_credits: { available_count: 0 },
				});
			},
		);
		expect(result.status).toBe("available");
		expect(result.resetCredits).toEqual({ availableCount: 0 });
		expect(result.windows).toEqual([]);
		expect(urls).toEqual(["https://chatgpt.com/backend-api/wham/usage"]);
	});

	it("reads Codex reset expiries with pinned read-only auth and never caches redemption IDs", async () => {
		const calls: { url: string; init?: RequestInit }[] = [];
		const result = await queryQuota(
			{ ...account, provider: "openai-codex", accountId: "acct-fixture" },
			new AbortController().signal,
			async (input, init) => {
				calls.push({ url: String(input), init });
				return String(input).endsWith("/usage")
					? Response.json({
							rate_limit: { primary_window: { used_percent: 25 } },
							rate_limit_reset_credits: { available_count: 2 },
						})
					: Response.json({
							available_count: 2,
							credits: [
								{
									id: "private-credit-one",
									status: "available",
									expires_at: "2031-01-01T00:00:00Z",
									title: "secret@example.test",
								},
								{
									id: "private-credit-two",
									expires_at: "2031-02-01T00:00:00Z",
								},
								{
									id: "private-credit-one",
									status: "available",
									expires_at: "2031-01-01T00:00:00Z",
								},
								{
									id: "spent-credit",
									status: "redeemed",
									expires_at: "2030-01-01T00:00:00Z",
								},
							],
						});
			},
		);
		expect(result.status).toBe("available");
		expect(result.resetCredits).toEqual({
			availableCount: 2,
			expirations: [
				{ expiresAt: Date.parse("2031-01-01T00:00:00Z") },
				{ expiresAt: Date.parse("2031-02-01T00:00:00Z") },
			],
		});
		expect(calls.map((c) => c.url)).toEqual([
			"https://chatgpt.com/backend-api/wham/usage",
			"https://chatgpt.com/backend-api/wham/rate-limit-reset-credits",
		]);
		for (const call of calls) {
			expect(call.init?.method).toBe("GET");
			expect(call.init?.redirect).toBe("error");
			expect(call.init?.body).toBeUndefined();
			expect(new Headers(call.init?.headers).get("authorization")).toBe(
				"Bearer test-token",
			);
			expect(new Headers(call.init?.headers).get("chatgpt-account-id")).toBe(
				"acct-fixture",
			);
		}
		expect(JSON.stringify(result)).not.toMatch(
			/private-credit|spent-credit|test-token|secret@/,
		);
	});
	it.each([403, 429])(
		"keeps quota/count available when reset expiry details return HTTP %s",
		async (status) => {
			const result = await queryQuota(
				{ ...account, provider: "openai-codex" },
				new AbortController().signal,
				async (input) =>
					String(input).endsWith("/usage")
						? Response.json({
								rate_limit_reset_credits: { available_count: 2 },
							})
						: new Response("secret test-token", { status }),
			);
			expect(result.status).toBe("available");
			expect(result.resetCredits?.availableCount).toBe(2);
			expect(result.resetCredits?.detailsUnavailable).toContain(String(status));
			expect(JSON.stringify(result)).not.toMatch(/secret|test-token/);
		},
	);
	it("uses the detail endpoint's explicit zero count instead of a stale usage count", async () => {
		const result = await queryQuota(
			{ ...account, provider: "openai-codex" },
			new AbortController().signal,
			async (input) =>
				Response.json(
					String(input).endsWith("/usage")
						? { rate_limit_reset_credits: { available_count: 3 } }
						: {
								available_count: 0,
								credits: [
									{
										id: "spent",
										status: "redeemed",
										expires_at: "2031-01-01T00:00:00Z",
									},
								],
							},
				),
		);
		expect(result.resetCredits).toEqual({ availableCount: 0, expirations: [] });
	});
	it("keeps unknown expirations distinct from expired credits and missing expiry details", async () => {
		const result = await queryQuota(
			{ ...account, provider: "openai-codex" },
			new AbortController().signal,
			async (input) =>
				Response.json(
					String(input).endsWith("/usage")
						? { rate_limit_reset_credits: { available_count: 3 } }
						: {
								credits: [
									{ id: "unknown", status: "available" },
									{
										id: "invalid",
										status: "available",
										expires_at: "not-a-time",
									},
									{
										id: "expired",
										status: "expired",
										expires_at: "2020-01-01T00:00:00Z",
									},
									{
										id: "past",
										status: "available",
										expires_at: "2020-01-01T00:00:00Z",
									},
								],
							},
				),
		);
		expect(result.resetCredits?.expirations).toEqual([
			{},
			{},
			{ expiresAt: Date.parse("2020-01-01T00:00:00Z") },
		]);
	});
	it("keeps usage quota on malformed expiry responses and stops maintenance on cancellation", async () => {
		const result = await queryQuota(
			{ ...account, provider: "openai-codex" },
			new AbortController().signal,
			async (input) =>
				Response.json(
					String(input).endsWith("/usage")
						? { rate_limit_reset_credits: { available_count: 1 } }
						: {},
				),
		);
		expect(result.status).toBe("available");
		expect(result.resetCredits?.detailsUnavailable).toBeDefined();
		const controller = new AbortController();
		const stopped = await queryQuota(
			{ ...account, provider: "openai-codex" },
			controller.signal,
			async (input) => {
				if (String(input).endsWith("/usage"))
					return Response.json({
						rate_limit_reset_credits: { available_count: 1 },
					});
				controller.abort();
				throw new Error("cancelled");
			},
		);
		expect(stopped.reason).toBe("Maintenance stopped.");
	});
});
