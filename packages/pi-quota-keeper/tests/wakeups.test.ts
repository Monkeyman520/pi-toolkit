import {
	type Api,
	createAssistantMessageEventStream,
	type Model,
} from "@earendil-works/pi-ai";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import type { Account, Snapshot } from "../extensions/providers.ts";
import { dueActivation, type Ledger } from "../extensions/schedule.ts";
import { sendWakeup, withWakeup } from "../extensions/wakeups.ts";

const account: Account = {
	id: "ag",
	provider: "antigravity",
	label: "Google",
	credentialType: "oauth",
	token: "google-access",
	projectId: "project-a",
};
const snapshot: Snapshot = {
	id: "ag",
	provider: "antigravity",
	label: "Google",
	fetchedAt: 0,
	status: "available",
	windows: [
		{ id: "gemini-5h", remainingPercent: 50, resetAt: 1000 },
		{ id: "gemini-weekly", remainingPercent: 50, resetAt: 9000 },
		{ id: "3p-5h", remainingPercent: 50, resetAt: 2000 },
	],
	activation: { supported: false, reason: "unknown mechanism" },
};
const config = { mode: "reset" as const, delayMs: 30, enabledAccounts: ["ag"] };
function model(provider = "antigravity"): Model<Api> {
	return {
		id: "gemini-fixture",
		provider,
		api: "openai-responses",
		name: "Fixture",
		baseUrl: "https://example.invalid",
		reasoning: false,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 1000,
		maxTokens: 100,
	};
}
function registry() {
	const streamSimple = vi.fn((_model, _context, _options) => {
		const s = createAssistantMessageEventStream();
		const message = {
			role: "assistant",
			api: "openai-responses",
			provider: "openai",
			model: "fixture",
			content: [{ type: "text", text: "OK" }],
			usage: {
				input: 0,
				output: 0,
				cacheRead: 0,
				cacheWrite: 0,
				totalTokens: 0,
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
			},
			stopReason: "stop",
			timestamp: 0,
		} as const;
		queueMicrotask(() =>
			s.end({ ...message, content: [{ type: "text", text: "OK" }] }),
		);
		return s;
	});
	const getProvider = vi.fn(() => ({ streamSimple }));
	return {
		registry: { getProvider } as unknown as Pick<
			ExtensionContext["modelRegistry"],
			"getProvider"
		>,
		streamSimple,
		getProvider,
	};
}
describe("explicit best-effort wake-ups", () => {
	it("selects the configured Google model family without claiming a verified activation mechanism", () => {
		const gemini = withWakeup(account, snapshot, "gemini-fixture");
		const claude = withWakeup(account, snapshot, "claude-fixture");
		expect(gemini.activation).toMatchObject({
			supported: true,
			bestEffort: true,
			windowId: "gemini-5h",
		});
		expect(claude.activation.windowId).toBe("3p-5h");
		expect(gemini.activation.reason).toContain("not guaranteed");
		expect(snapshot.activation.supported).toBe(false);
	});
	it("can override a reset window but never silently chooses another when that ID disappears", () => {
		expect(
			withWakeup(account, snapshot, "gemini-fixture", "gemini-weekly")
				.activation.windowId,
		).toBe("gemini-weekly");
		expect(
			withWakeup(account, snapshot, "gemini-fixture", "missing").activation
				.windowId,
		).toBeUndefined();
	});
	it("uses Codex's primary quota reset and never treats a weekly limit as its primary window", () => {
		const a = {
			...account,
			provider: "openai-codex",
			requestAuth: { apiKey: "model-token" },
		};
		const s = {
			...snapshot,
			provider: a.provider,
			windows: [
				{ id: "secondary_window", resetAt: 9000 },
				{ id: "primary_window", resetAt: 1000 },
			],
		};
		expect(withWakeup(a, s, "fixture").activation.windowId).toBe(
			"primary_window",
		);
	});
	it.each(["openai", "openai-codex", "github-copilot", "xai"])(
		"supports resolved subscription request auth for %s",
		(provider) => {
			const a = {
				...account,
				provider,
				requestAuth: { apiKey: "model-token" },
			};
			expect(
				withWakeup(a, { ...snapshot, provider }, "fixture").activation,
			).toMatchObject({ supported: true, bestEffort: true });
		},
	);
	it("does not enable API keys, unresolved auth, expired tokens or unknown adapters", () => {
		for (const a of [
			{ ...account, credentialType: "api_key" },
			{ ...account, provider: "xai" },
			{
				...account,
				provider: "xai",
				requestAuth: { headers: { Authorization: "Bearer header-only" } },
			},
			{
				...account,
				provider: "xai",
				requestAuth: { headers: { "X-Account": "not-auth" } },
			},
			{ ...account, unavailable: "Expired" },
			{
				...account,
				provider: "unqualified",
				requestAuth: { apiKey: "secret" },
			},
			{ ...account, projectId: undefined },
		])
			expect(
				withWakeup(a, { ...snapshot, provider: a.provider }, "fixture")
					.activation.supported,
			).toBe(false);
	});
	it("allows explicitly fixed wake-ups without accessible quota, but never guesses reset timing", () => {
		const s = withWakeup(
			account,
			{ ...snapshot, status: "unavailable", windows: [], reason: "HTTP 403" },
			"gemini-fixture",
		);
		const ledger: Ledger = {};
		const fixed = { ...config, mode: "fixed" as const };
		expect(dueActivation(s, config, {}, 5 * 3600000)).toBeUndefined();
		expect(dueActivation(s, fixed, ledger, 0)).toBeUndefined();
		const due = dueActivation(s, fixed, ledger, 5 * 3600000);
		expect(due).toBeDefined();
		if (due) ledger.ag.attempted = due.cycle;
		expect(dueActivation(s, fixed, ledger, 10 * 3600000 - 1)).toBeUndefined();
		expect(
			dueActivation(s, { ...fixed, enabledAccounts: [] }, {}, 5 * 3600000),
		).toBeUndefined();
	});
	it("waits for the actual selected reset plus delay and never replays on takeover", () => {
		const s = withWakeup(account, snapshot, "gemini-fixture");
		const ledger: Ledger = {};
		expect(dueActivation(s, config, ledger, 1029)).toBeUndefined();
		const due = dueActivation(s, config, ledger, 1030);
		expect(due).toBeDefined();
		if (due) ledger.ag.attempted = due.cycle;
		expect(dueActivation(s, config, ledger, 8000)).toBeUndefined();
		expect(
			dueActivation({ ...s, windows: [] }, config, ledger, 99999),
		).toBeUndefined();
	});
	it("does not reuse a remembered reset when switching to a different selected window", () => {
		const ledger: Ledger = {};
		const primary = withWakeup(account, snapshot, "gemini-fixture");
		dueActivation(primary, config, ledger, 100);
		const thirdParty = withWakeup(
			account,
			{ ...snapshot, windows: [{ id: "3p-5h", resetAt: 9000 }] },
			"claude-fixture",
		);
		expect(dueActivation(thirdParty, config, ledger, 2000)).toBeUndefined();
		expect(ledger.ag.resetAt).toBe(9000);
	});
	it("separates Argon from the shared Gemini pool and preserves explicitly named model windows", () => {
		const s = {
			...snapshot,
			windows: [
				{ id: "gemini-argon-weekly", resetAt: 8000 },
				{ id: "gemini-5h", resetAt: 1000 },
				{ id: "gemini-fixture:weekly:1", resetAt: 7000 },
			],
		};
		expect(withWakeup(account, s, "gemini-fixture").activation.windowId).toBe(
			"gemini-5h",
		);
		expect(
			withWakeup(account, s, "gemini-argon-fixture").activation.windowId,
		).toBe("gemini-argon-weekly");
	});
});

it("does not fall back to Claude five_hour when an explicit reset-window override is missing", () => {
	const a = {
		...account,
		provider: "anthropic",
		requestAuth: { apiKey: "claude-model-token" },
	};
	const s: Snapshot = {
		...snapshot,
		provider: "anthropic",
		windows: [{ id: "five_hour", resetAt: 1000 }],
		activation: { supported: true, reason: "qualified" },
	};
	const selected = withWakeup(a, s, "claude-fixture", "removed-window");
	expect(dueActivation(selected, config, {}, 2000)).toBeUndefined();
});
describe("account-pinned minimal requests", () => {
	it("sends exactly one Google request with the linked account's project/token and no provider account switching", async () => {
		const { registry: r, getProvider } = registry();
		const calls: { url: string; init?: RequestInit }[] = [];
		const result = await sendWakeup(
			r,
			account,
			model(),
			new AbortController().signal,
			async (input, init) => {
				calls.push({ url: String(input), init });
				return Response.json({
					response: {
						candidates: [
							{
								finishReason: "MAX_TOKENS",
								content: { parts: [{ text: "O" }] },
							},
						],
					},
				});
			},
		);
		expect(calls).toHaveLength(1);
		expect(calls[0].url).toBe(
			"https://daily-cloudcode-pa.googleapis.com/v1internal:generateContent",
		);
		expect(new Headers(calls[0].init?.headers).get("authorization")).toBe(
			"Bearer google-access",
		);
		const body = JSON.parse(String(calls[0].init?.body));
		expect(body.project).toBe("project-a");
		expect(body.model).toBe("gemini-fixture");
		expect(body.request.contents).toEqual([
			{ role: "user", parts: [{ text: "Reply OK." }] },
		]);
		expect(body.request.generationConfig.maxOutputTokens).toBe(1);
		expect(body.request.tools).toBeUndefined();
		expect(calls[0].init?.redirect).toBe("error");
		expect(result).toContain("completed");
		expect(result).toContain("unverified");
		expect(getProvider).not.toHaveBeenCalled();
	});
	it("does not retry or switch Google accounts on quota rejection and never exposes its body", async () => {
		const { registry: r } = registry();
		const fetcher = vi.fn(
			async () =>
				new Response("google-access private@example.test", { status: 429 }),
		);
		const result = await sendWakeup(
			r,
			account,
			model(),
			new AbortController().signal,
			fetcher,
		);
		expect(fetcher).toHaveBeenCalledTimes(1);
		expect(result).toContain("429");
		expect(result).not.toMatch(/google-access|private@/);
	});
	it("does not report a 200 error envelope or empty response as a completed Google request", async () => {
		for (const body of [{ error: { message: "secret" } }, {}]) {
			const { registry: r } = registry();
			const result = await sendWakeup(
				r,
				account,
				model(),
				new AbortController().signal,
				async () => Response.json(body),
			);
			expect(result).not.toContain("request completed");
			expect(result).not.toContain("secret");
		}
	});
	it.each(["openai", "openai-codex", "github-copilot", "xai", "anthropic"])(
		"uses %s resolved model credentials, not the quota-query token or foreground account",
		async (provider) => {
			const { registry: r, streamSimple } = registry();
			const a = {
				...account,
				provider,
				token: "quota-token",
				requestAuth: {
					apiKey: "pinned-model-token",
					baseUrl: "https://pinned.invalid",
					headers: { "X-Account": "pinned" },
				},
			};
			const result = await sendWakeup(
				r,
				a,
				model(provider),
				new AbortController().signal,
			);
			expect(streamSimple).toHaveBeenCalledTimes(1);
			const [m, context, opts] = streamSimple.mock.calls[0];
			expect(m.baseUrl).toBe("https://pinned.invalid");
			expect(opts.apiKey).toBe("pinned-model-token");
			expect(opts.headers["X-Account"]).toBe("pinned");
			expect(opts.maxRetries).toBe(0);
			expect(opts.reasoning).toBeUndefined();
			expect(opts.transport).toBe("sse");
			expect(opts.maxTokens).toBe(1);
			expect(context.messages).toHaveLength(1);
			expect(context.messages[0].content).toEqual([
				{ type: "text", text: "Reply OK." },
			]);
			expect(result).toContain("unverified");
		},
	);
	it("refuses provider mismatch, missing pinned credentials and cancellation before side effects", async () => {
		const { registry: r, streamSimple } = registry();
		const fetcher = vi.fn(async () => Response.json({}));
		const controller = new AbortController();
		controller.abort();
		for (const [a, m, signal] of [
			[account, model("openai"), new AbortController().signal],
			[
				{ ...account, provider: "openai" },
				model("openai"),
				new AbortController().signal,
			],
			[account, model(), controller.signal],
		] as const)
			await sendWakeup(r, a, m, signal, fetcher);
		expect(fetcher).not.toHaveBeenCalled();
		expect(streamSimple).not.toHaveBeenCalled();
	});
});
