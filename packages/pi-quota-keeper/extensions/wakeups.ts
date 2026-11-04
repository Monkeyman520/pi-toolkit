import { randomUUID } from "node:crypto";
import { type Api, type Model, normalizeContext } from "@earendil-works/pi-ai";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
	type Account,
	antigravityHeaders,
	isCodexProvider,
	isAntigravityProvider as isGoogle,
	readJson,
	record,
	type Snapshot,
	type WindowQuota,
} from "./providers.ts";

const nativeProviders = new Set([
	"anthropic",
	"openai",
	"openai-codex",
	"github-copilot",
	"xai",
]);
function canWake(account: Account): boolean {
	if (account.credentialType !== "oauth" || account.unavailable) return false;
	if (isGoogle(account.provider))
		return Boolean(account.token && account.projectId);
	// Named native OAuth providers return a model token. Header-only metadata
	// must not fall through to an ambient/default account in a native API.
	return (
		nativeProviders.has(account.provider) &&
		Boolean(account.requestAuth?.apiKey)
	);
}
function resetWindow(
	snapshot: Snapshot,
	modelId?: string,
	explicit?: string,
): WindowQuota | undefined {
	if (explicit !== undefined)
		return snapshot.windows.find((w) => w.id === explicit);
	const defaults: Record<string, string> = {
		anthropic: "five_hour",
		openai: "primary_window",
		"openai-codex": "primary_window",
		"github-copilot": "premium_interactions",
	};
	if (!isGoogle(snapshot.provider))
		return snapshot.windows.find((w) => w.id === defaults[snapshot.provider]);
	if (!modelId) return undefined;
	const thirdParty = /^(claude|gpt-)/i.test(modelId);
	const gemini = /^gemini/i.test(modelId);
	const argon = /argon/i.test(modelId);
	const candidates = snapshot.windows.filter(
		(w) =>
			w.id === modelId ||
			w.id.startsWith(`${modelId}:`) ||
			(thirdParty && /^3p[-:]/i.test(w.id)) ||
			(gemini && /^gemini[-:]/i.test(w.id) && /argon/i.test(w.id) === argon),
	);
	// Prefer explicit short-window labels; never infer a duration from a timestamp.
	return (
		candidates.find((w) => /(?:5h|five.hour)/i.test(w.id)) ??
		candidates.find((w) => /daily/i.test(w.id)) ??
		(candidates.length === 1 ? candidates[0] : undefined)
	);
}
export function withWakeup(
	account: Account,
	snapshot: Snapshot,
	modelId?: string,
	resetWindowId?: string,
): Snapshot {
	if (!canWake(account))
		return {
			...snapshot,
			activation: {
				supported: false,
				reason:
					"Scheduled wake-up needs usable Pi subscription OAuth and a supported account-pinned adapter.",
			},
		};
	const window = resetWindow(snapshot, modelId, resetWindowId);
	const qualifiedClaude =
		snapshot.provider === "anthropic" &&
		snapshot.activation.supported &&
		!snapshot.activation.bestEffort &&
		window?.id === "five_hour";
	return {
		...snapshot,
		activation: {
			supported: true,
			...(!qualifiedClaude ? { bestEffort: true } : {}),
			...(window ? { windowId: window.id } : {}),
			reason: qualifiedClaude
				? snapshot.activation.reason
				: "Best-effort minimal request; consumes quota or credits. Opening a new window is not guaranteed.",
		},
	};
}
const completed =
	"Wake-up request completed; window opening remains unverified.";
const uncertain = "Wake-up outcome uncertain; cycle will not be replayed.";
const failed =
	"Wake-up request failed or was cancelled; cycle will not be replayed.";

export async function sendWakeup(
	registry: Pick<ExtensionContext["modelRegistry"], "getProvider">,
	account: Account,
	model: Model<Api>,
	signal: AbortSignal,
	fetcher: typeof fetch = fetch,
): Promise<string> {
	if (
		!canWake(account) ||
		model.provider !== account.provider ||
		signal.aborted
	)
		return "Wake-up blocked: account, provider, credentials, or cancellation check failed.";
	const deadline = AbortSignal.any([signal, AbortSignal.timeout(30000)]);
	try {
		if (isGoogle(account.provider)) {
			// pi-antigravity 0.11.0 rotates accounts on quota walls and mutates auth.json.
			// A single pinned RPC avoids that provider-specific failover entirely.
			const data = record(
				await readJson(
					await fetcher(
						"https://daily-cloudcode-pa.googleapis.com/v1internal:generateContent",
						{
							method: "POST",
							headers: antigravityHeaders(account.token ?? ""),
							redirect: "error",
							signal: deadline,
							body: JSON.stringify({
								project: account.projectId,
								model: model.id,
								requestType: "agent",
								userAgent: "antigravity",
								requestId: `quota-${randomUUID()}`,
								request: {
									contents: [{ role: "user", parts: [{ text: "Reply OK." }] }],
									generationConfig: { maxOutputTokens: 1 },
								},
							}),
						},
					),
				),
			);
			deadline.throwIfAborted();
			const response = record(data.response ?? data);
			if (data.error || response.error) return failed;
			const candidates = Array.isArray(response.candidates)
				? response.candidates
				: [];
			return candidates.some((c) =>
				["STOP", "MAX_TOKENS"].includes(String(record(c).finishReason)),
			)
				? completed
				: uncertain;
		}
		const provider = registry.getProvider(account.provider);
		const auth = account.requestAuth;
		if (!provider || !auth)
			return "Wake-up blocked: registered provider or pinned model auth unavailable.";
		const headers = { ...auth.headers };
		if (isCodexProvider(account.provider) && account.accountId)
			headers["ChatGPT-Account-Id"] = account.accountId;
		// Discard static credential headers; the account's resolved auth must win.
		const modelHeaders = Object.fromEntries(
			Object.entries(model.headers ?? {}).filter(
				([key]) =>
					!/^(authorization|x-api-key|api-key|chatgpt-account-id)$/i.test(key),
			),
		);
		const reply = await provider
			.streamSimple(
				{
					...model,
					headers: modelHeaders,
					baseUrl: auth.baseUrl ?? model.baseUrl,
				},
				normalizeContext({
					messages: [
						{
							role: "user",
							content: [{ type: "text", text: "Reply OK." }],
							timestamp: Date.now(),
						},
					],
				}),
				{
					apiKey: auth.apiKey,
					headers,
					env: account.requestEnv,
					maxTokens: 1,
					reasoning: undefined,
					transport: "sse",
					maxRetries: 0,
					timeoutMs: 30000,
					signal: deadline,
				},
			)
			.result();
		deadline.throwIfAborted();
		return ["error", "aborted", "pending"].includes(reply.stopReason)
			? failed
			: completed;
	} catch (error) {
		return error instanceof Error && /^HTTP \d{3}$/.test(error.message)
			? `Wake-up request rejected (${error.message}); cycle will not be replayed.`
			: uncertain;
	}
}
