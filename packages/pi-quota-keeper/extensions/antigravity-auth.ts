import { createHash } from "node:crypto";
import * as nodeFs from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import type { OAuthCredential } from "@earendil-works/pi-ai";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import lockfile from "proper-lockfile";
import { record } from "./providers.ts";

type Saved = Record<string, unknown>;
type Renewal = { account: Saved } | { reason: string };
// Plain object copy avoids jiti's interopDefault Proxy caching undefined before
// proper-lockfile defines its non-configurable mtime-precision symbol on fs.
const lockFs = { ...nodeFs };
const failures = new Map<string, number>();
const failed =
	"Linked Pi Antigravity token refresh failed; retry after one minute or reauthenticate this account in pi-antigravity.";
function text(v: unknown): string | undefined {
	return typeof v === "string" && v.length > 0 ? v : undefined;
}
export function needsLinkedRefresh(account: Saved): boolean {
	return (
		!text(account.access) ||
		typeof account.expires !== "number" ||
		!Number.isFinite(account.expires) ||
		account.expires <= Date.now() + 60000
	);
}
async function readPrivate(
	path: string,
	optional = false,
): Promise<string | undefined> {
	try {
		if ((await stat(path)).size > 2 * 1024 * 1024)
			throw new Error("Account file too large");
		const raw = await readFile(path, "utf8");
		if (Buffer.byteLength(raw) > 2 * 1024 * 1024)
			throw new Error("Account file too large");
		return raw;
	} catch (error) {
		if (
			optional &&
			error instanceof Error &&
			"code" in error &&
			error.code === "ENOENT"
		)
			return undefined;
		throw error;
	}
}
async function storeAt(dir: string): Promise<Saved> {
	const d = record(
		JSON.parse(
			(await readPrivate(join(dir, "antigravity-accounts.json"))) ?? "{}",
		),
	);
	if (
		d.version !== 1 ||
		!d.accounts ||
		typeof d.accounts !== "object" ||
		Array.isArray(d.accounts)
	)
		throw new Error("Unrecognized linked store");
	return d;
}
function identityMatches(
	previous: Saved,
	key: string,
	candidate: Saved,
	candidateKey: string,
): boolean {
	if (
		(text(previous.accountId) ?? key) !==
		(text(candidate.accountId) ?? candidateKey)
	)
		return false;
	const email = text(previous.email);
	return (
		!email ||
		email.trim().toLowerCase() === text(candidate.email)?.trim().toLowerCase()
	);
}
function targetIn(store: Saved, key: string, previous: Saved): Saved {
	for (const [candidateKey, value] of Object.entries(record(store.accounts))) {
		const candidate = record(value);
		if (identityMatches(previous, key, candidate, candidateKey))
			return candidate;
	}
	throw new Error("Linked account changed or was removed");
}
function rootMatches(root: Saved, target: Saved): boolean {
	if (root.type !== "oauth") return false;
	return Boolean(
		(text(root.refresh) && root.refresh === target.refresh) ||
			(text(root.email) &&
				text(target.email) &&
				String(root.email).trim().toLowerCase() ===
					String(target.email).trim().toLowerCase()),
	);
}
async function acquireAuthLock(
	path: string,
	signal: AbortSignal,
	compromised: () => void,
) {
	const wait = AbortSignal.any([signal, AbortSignal.timeout(15000)]);
	for (;;) {
		wait.throwIfAborted();
		try {
			return await lockfile.lock(path, {
				fs: lockFs,
				realpath: false,
				retries: 0,
				stale: 30000,
				// Pi async refresh locks use 30s stale; its sync readers use 10s.
				update: 5000,
				onCompromised: compromised,
			});
		} catch (error) {
			wait.throwIfAborted();
			const code =
				error instanceof Error && "code" in error ? error.code : undefined;
			if (code !== "ELOCKED" && code !== "EEXIST" && code !== "EPERM")
				throw error;
			await delay(25, undefined, { signal: wait });
		}
	}
}
/** Only the maintenance owner calls this; persistence remains provider-owned. */
export async function refreshLinkedAccount(
	ctx: ExtensionContext,
	dir: string,
	key: string,
	previous: Saved,
	signal: AbortSignal,
): Promise<Renewal> {
	signal.throwIfAborted();
	const refresh = text(previous.refresh);
	if (!refresh)
		return {
			reason:
				"Linked Pi Antigravity token expired or near expiry; no saved refresh token. Log in using pi-antigravity.",
		};
	const oauth = ctx.modelRegistry.getProvider?.("antigravity")?.auth.oauth;
	if (!oauth?.refresh)
		return {
			reason:
				"Linked Pi Antigravity token expired or near expiry; load pi-antigravity with registered OAuth refresh support.",
		};
	const now = Date.now();
	for (const [id, retryAt] of failures) if (retryAt <= now) failures.delete(id);
	const attempt = createHash("sha256")
		.update(dir)
		.update("\0")
		.update(key)
		.update("\0")
		.update(refresh)
		.digest("hex");
	if ((failures.get(attempt) ?? 0) > now) return { reason: failed };
	try {
		let compromised = false;
		const release = await acquireAuthLock(
			join(dir, "auth.json"),
			signal,
			() => {
				compromised = true;
			},
		);
		try {
			signal.throwIfAborted();
			const beforeAuth = await readPrivate(join(dir, "auth.json"), true);
			const beforeStore = await storeAt(dir);
			const target = targetIn(beforeStore, key, previous);
			if (!needsLinkedRefresh(target)) return { account: target };
			const rootAuth = record(JSON.parse(beforeAuth ?? "{}"));
			if (
				["antigravity", "google-antigravity"].some((provider) =>
					rootMatches(record(rootAuth[provider]), target),
				)
			)
				throw new Error("Account became active; use Pi's normal auth resolver");
			const savedRefresh = text(target.refresh);
			if (!savedRefresh) throw new Error("Refresh token missing");
			const credential: OAuthCredential = {
				...target,
				type: "oauth",
				refresh: savedRefresh,
				access: text(target.access) ?? "",
				expires: typeof target.expires === "number" ? target.expires : 0,
				accountId: text(target.accountId) ?? key,
				email: text(target.email),
				projectId: text(target.projectId),
			};
			// Do not race this promise against cancellation: pi-antigravity 0.11.0
			// ignores the signal, and may still rotate/persist a token after abort.
			// Keep both ownership and the compatible auth lock until it settles.
			signal.throwIfAborted();
			if (compromised)
				throw new Error("Auth lock was compromised before refresh");
			const renewed = await oauth.refresh(
				credential,
				AbortSignal.any([signal, AbortSignal.timeout(15000)]),
			);
			signal.throwIfAborted();
			if (
				compromised ||
				renewed.type !== "oauth" ||
				!identityMatches(previous, key, renewed, key)
			)
				throw new Error("Refreshed identity or lock changed");
			if ((await readPrivate(join(dir, "auth.json"), true)) !== beforeAuth)
				throw new Error("Active login changed during linked refresh");
			const afterStore = await storeAt(dir);
			if (afterStore.activeAccountId !== beforeStore.activeAccountId)
				throw new Error("Active linked-account selection changed");
			const persisted = targetIn(afterStore, key, previous);
			if (
				!text(persisted.access) ||
				!text(persisted.refresh) ||
				typeof persisted.expires !== "number" ||
				!Number.isFinite(persisted.expires) ||
				persisted.expires <= Date.now()
			)
				throw new Error("Provider did not persist a usable linked token");
			failures.delete(attempt);
			return { account: persisted };
		} finally {
			await release();
		}
	} catch {
		if (signal.aborted) signal.throwIfAborted();
		failures.set(attempt, Date.now() + 60000);
		return { reason: failed };
	}
}
