import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
	needsLinkedRefresh,
	refreshLinkedAccount,
} from "./antigravity-auth.ts";
import { type Account, record } from "./providers.ts";

function text(v: unknown): string | undefined {
	return typeof v === "string" && v.length > 0 ? v : undefined;
}
function claim(access: unknown): string | undefined {
	try {
		const d = record(
			JSON.parse(
				Buffer.from(String(access).split(".")[1], "base64url").toString("utf8"),
			),
		);
		return text(d.sub);
	} catch {
		return undefined;
	}
}

function identityOf(credential: Record<string, unknown>): string {
	return (
		text(credential.email) ??
		text(credential.accountId) ??
		claim(credential.access) ??
		text(credential.refresh) ??
		"default"
	);
}
function id(provider: string, identity: string) {
	return `${provider}:${createHash("sha256").update(identity).digest("hex").slice(0, 16)}`;
}
function label(provider: string, email?: string) {
	if (!email) return provider;
	const [user, domain] = email.split("@");
	return `${provider} (${(user ?? "").slice(0, 1)}***@${(domain ?? "").slice(0, 1)}***)`
		.replace(/\p{Cc}/gu, "")
		.slice(0, 100);
}
async function resolveAuth(
	ctx: ExtensionContext,
	provider: string,
	signal: AbortSignal,
) {
	const deadline = AbortSignal.any([signal, AbortSignal.timeout(15000)]);
	return new Promise<
		Awaited<ReturnType<typeof ctx.modelRegistry.getProviderAuth>>
	>((resolve, reject) => {
		const aborted = () =>
			reject(new Error("Credential resolution cancelled or timed out."));
		if (deadline.aborted) {
			aborted();
			return;
		}
		deadline.addEventListener("abort", aborted, { once: true });
		Promise.resolve()
			.then(() => ctx.modelRegistry.getProviderAuth(provider))
			.then(
				(value) => {
					deadline.removeEventListener("abort", aborted);
					resolve(value);
				},
				(error) => {
					deadline.removeEventListener("abort", aborted);
					reject(error);
				},
			);
	});
}

export async function collectAccounts(
	ctx: ExtensionContext,
	dir: string,
	signal: AbortSignal,
): Promise<Account[]> {
	const accounts = new Map<string, Account>();
	signal.throwIfAborted();
	let auth: Record<string, unknown> = {};
	try {
		const raw = await readFile(join(dir, "auth.json"), "utf8");
		if (Buffer.byteLength(raw) > 2 * 1024 * 1024)
			throw new Error("Auth file too large");
		auth = record(JSON.parse(raw));
	} catch (error) {
		if (!(error instanceof Error && "code" in error && error.code === "ENOENT"))
			throw new Error("Pi account metadata unreadable.");
	}
	for (const [providerId, value] of Object.entries(auth)) {
		const credential = record(value);
		const info = {
			providerId,
			type: typeof credential.type === "string" ? credential.type : "unknown",
		};
		const identity = identityOf(credential);
		const account: Account = {
			id: id(info.providerId, identity),
			provider: info.providerId,
			label: label(info.providerId, text(credential.email)),
			credentialType: info.type,
		};
		if (
			info.type === "oauth" &&
			![
				"anthropic",
				"openai",
				"openai-codex",
				"github-copilot",
				"xai",
				"antigravity",
				"google-antigravity",
			].includes(info.providerId)
		)
			account.unavailable =
				"Subscription quota endpoint not qualified for this Pi provider.";
		else if (info.type === "oauth") {
			try {
				const resolved = await resolveAuth(ctx, info.providerId, signal);

				// Host resolution can refresh credentials. A concurrent account switch must
				// not attribute the newly resolved token to the previously inventoried ID.
				const latestRaw = await readFile(join(dir, "auth.json"), "utf8");
				if (Buffer.byteLength(latestRaw) > 2 * 1024 * 1024)
					throw new Error("Auth file too large");
				const latest = record(record(JSON.parse(latestRaw))[info.providerId]);
				if (latest.type !== "oauth" || identityOf(latest) !== identity)
					throw new Error("Pi account changed during credential resolution.");
				account.requestAuth = resolved?.auth;
				account.requestEnv = resolved?.env;
				account.token =
					info.providerId === "github-copilot"
						? text(credential.refresh)
						: resolved?.auth.apiKey;
				if (!account.token) {
					const authorization =
						resolved?.auth.headers?.Authorization ??
						resolved?.auth.headers?.authorization;
					if (
						typeof authorization === "string" &&
						authorization.startsWith("Bearer ")
					)
						account.token = authorization.slice(7);
				}
				account.accountId = text(credential.accountId);
				if (
					info.providerId === "antigravity" ||
					info.providerId === "google-antigravity"
				) {
					const parsed = record(JSON.parse(account.token ?? "{}"));
					account.token = text(parsed.token);
					account.projectId = text(parsed.projectId);
				}
			} catch {
				account.unavailable =
					"Pi credential resolution failed; reauthenticate this provider.";
			}
		}
		signal.throwIfAborted();
		accounts.set(account.id, account);
	}
	// pi-antigravity's linked-account file belongs to Pi, not another CLI.
	// Linked token renewal is delegated to the registered provider, never account switching.
	try {
		const raw = await readFile(join(dir, "antigravity-accounts.json"), "utf8");
		if (Buffer.byteLength(raw) > 2 * 1024 * 1024)
			throw new Error("Account metadata too large");
		const parsed = record(JSON.parse(raw));
		if (
			parsed.version !== 1 ||
			!parsed.accounts ||
			typeof parsed.accounts !== "object" ||
			Array.isArray(parsed.accounts)
		)
			throw new Error("Unrecognized linked account format");
		if (parsed.version === 1)
			for (const [key, v] of Object.entries(record(parsed.accounts))) {
				const a = record(v),
					identity = text(a.email) ?? text(a.accountId) ?? key;
				const accountId = id("antigravity", identity);
				if (accounts.has(accountId)) continue;
				signal.throwIfAborted();
				let current = a;
				let unavailable: string | undefined;
				if (needsLinkedRefresh(a)) {
					const result = await refreshLinkedAccount(ctx, dir, key, a, signal);
					if ("account" in result) current = result.account;
					else unavailable = result.reason;
				}
				signal.throwIfAborted();
				accounts.set(accountId, {
					id: accountId,
					provider: "antigravity",
					label: label("antigravity", text(a.email)),
					credentialType: "oauth",
					token: unavailable ? undefined : text(current.access),
					projectId: text(current.projectId),
					unavailable,
				});
			}
	} catch (error) {
		if (signal.aborted) throw error;
		if (
			!(error instanceof Error && "code" in error && error.code === "ENOENT")
		) {
			accounts.set("antigravity:store", {
				id: "antigravity:store",
				provider: "antigravity",
				label: "Antigravity linked accounts",
				credentialType: "oauth",
				unavailable:
					"Linked Pi Antigravity account file is unreadable or unrecognized.",
			});
		}
	}
	signal.throwIfAborted();
	return [...accounts.values()];
}
