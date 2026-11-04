import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { OAuthCredential } from "@earendil-works/pi-ai";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import lockfile from "proper-lockfile";
import { afterEach, describe, expect, it, vi } from "vitest";
import { collectAccounts } from "../extensions/accounts.ts";
import { queryQuota } from "../extensions/providers.ts";

const dirs: string[] = [];
afterEach(async () => {
	await Promise.all(
		dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })),
	);
});
async function setup(auth: unknown) {
	const dir = await mkdtemp(join(tmpdir(), "pi-account-test-"));
	dirs.push(dir);
	await writeFile(join(dir, "auth.json"), JSON.stringify(auth));
	const getProviderAuth = vi.fn(async () => ({
		auth: {
			apiKey: JSON.stringify({ token: "active-token", projectId: "project" }),
		},
	}));
	const getProvider = vi.fn<ExtensionContext["modelRegistry"]["getProvider"]>(
		() => undefined,
	);
	const ctx = {
		modelRegistry: { getProviderAuth, getProvider },
	} as unknown as ExtensionContext;
	return { dir, ctx, getProviderAuth, getProvider };
}

async function linkedFixture() {
	const auth = {
		antigravity: {
			type: "oauth",
			email: "active@example.test",
			access: "active-token",
			refresh: "active-refresh",
			expires: Date.now() + 3600000,
			projectId: "active-project",
		},
	};
	const setupResult = await setup(auth);
	const store = {
		version: 1,
		activeAccountId: "active",
		accounts: {
			active: {
				accountId: "active",
				email: "active@example.test",
				access: "active-token",
				refresh: "active-refresh",
				expires: Date.now() + 3600000,
				projectId: "active-project",
			},
			expired: {
				accountId: "expired",
				email: "expired@example.test",
				access: "expired-token",
				refresh: "linked-refresh",
				expires: 0,
				projectId: "linked-project",
			},
			valid: {
				accountId: "valid",
				email: "valid@example.test",
				access: "valid-token",
				refresh: "valid-refresh",
				expires: Date.now() + 3600000,
				projectId: "valid-project",
			},
		},
	};
	const file = join(setupResult.dir, "antigravity-accounts.json");
	await writeFile(file, JSON.stringify(store));
	const readStore = async () =>
		JSON.parse(await readFile(file, "utf8")) as typeof store;
	const refresh = vi.fn(
		async (
			credential: OAuthCredential,
			_signal: AbortSignal,
		): Promise<OAuthCredential> => {
			const next = {
				...credential,
				access: "linked-new-token",
				refresh: "linked-rotated-refresh",
				expires: Date.now() + 3600000,
			};
			const latest = await readStore();
			latest.accounts.expired = { ...latest.accounts.expired, ...next };
			await writeFile(file, JSON.stringify(latest));
			return next;
		},
	);
	setupResult.getProvider.mockReturnValue({
		auth: { oauth: { refresh } },
	} as unknown as NonNullable<
		ReturnType<ExtensionContext["modelRegistry"]["getProvider"]>
	>);
	return { ...setupResult, file, store, readStore, refresh };
}
describe("Pi account inventory", () => {
	it("uses Pi-owned Antigravity linked accounts without importing the provider package", async () => {
		const { dir, ctx } = await setup({
			antigravity: {
				type: "oauth",
				email: "active@example.test",
				access: "active-token",
				refresh: "one",
				expires: Date.now() + 100000,
			},
		});
		await writeFile(
			join(dir, "antigravity-accounts.json"),
			JSON.stringify({
				version: 1,
				accounts: {
					one: {
						accountId: "active@example.test",
						email: "active@example.test",
						access: "old-token",
						expires: Date.now() + 100000,
					},
					two: {
						accountId: "other@example.test",
						email: "other@example.test",
						access: "other-token",
						projectId: "other-project",
						expires: Date.now() + 100000,
					},
					three: {
						accountId: "expired@example.test",
						email: "expired@example.test",
						access: "expired-token",
						projectId: "expired",
						expires: 0,
					},
				},
			}),
		);
		const a = await collectAccounts(ctx, dir, new AbortController().signal);
		expect(a).toHaveLength(3);
		expect(a.filter((x) => x.token === "active-token")).toHaveLength(1);
		expect(a.find((x) => x.token === "other-token")?.projectId).toBe(
			"other-project",
		);
		expect(a.find((x) => x.unavailable)?.unavailable).toContain("expired");
		expect(a.map((x) => x.label).join()).not.toContain("other@example.test");
		const s = await queryQuota(
			a[1],
			new AbortController().signal,
			async () =>
				new Response(
					JSON.stringify({
						models: { gemini: { quotaInfo: { remainingFraction: 0.5 } } },
					}),
				),
		);
		expect(JSON.stringify(s)).not.toContain("other-token");
	});
	it("does not resolve or execute stored API-key commands", async () => {
		const { dir, ctx, getProviderAuth } = await setup({
			google: { type: "api_key", key: "!never-run" },
		});
		const a = await collectAccounts(ctx, dir, new AbortController().signal);
		expect(getProviderAuth).not.toHaveBeenCalled();
		expect(a[0].credentialType).toBe("api_key");
	});
	it("reports a broken linked-account file explicitly", async () => {
		const { dir, ctx } = await setup({});
		await writeFile(join(dir, "antigravity-accounts.json"), "{broken");
		const a = await collectAccounts(ctx, dir, new AbortController().signal);
		expect(a[0].unavailable).toContain("unreadable");
	});
	it("keeps distinct identities separate and identifiers credential-free", async () => {
		const { dir, ctx } = await setup({
			anthropic: {
				type: "oauth",
				email: "a@example.test",
				refresh: "secret-a",
			},
			xai: { type: "oauth", email: "b@example.test", refresh: "secret-b" },
		});
		const a = await collectAccounts(ctx, dir, new AbortController().signal);
		expect(new Set(a.map((x) => x.id)).size).toBe(2);
		expect(a.map((x) => x.id).join()).not.toMatch(/secret|example/);
	});
	it("cancels a pending host credential resolution before shutdown releases ownership", async () => {
		const { dir, ctx, getProviderAuth } = await setup({
			anthropic: { type: "oauth", refresh: "fixture" },
		});
		getProviderAuth.mockImplementation(() => new Promise<never>(() => {}));
		const controller = new AbortController();
		const pending = collectAccounts(ctx, dir, controller.signal);
		setTimeout(() => controller.abort(), 10);
		await expect(pending).rejects.toThrow();
	});

	it("keeps Copilot's GitHub quota token separate from its resolved model token and proxy", async () => {
		const { dir, ctx, getProviderAuth } = await setup({
			"github-copilot": {
				type: "oauth",
				email: "copilot@example.test",
				refresh: "github-quota-token",
			},
		});
		getProviderAuth.mockImplementation(async () => ({
			auth: {
				apiKey: "copilot-model-token",
				baseUrl: "https://api.business.githubcopilot.com",
			},
		}));
		const [account] = await collectAccounts(
			ctx,
			dir,
			new AbortController().signal,
		);
		expect(account.token).toBe("github-quota-token");
		expect(account.requestAuth?.apiKey).toBe("copilot-model-token");
		expect(account.requestAuth?.baseUrl).toBe(
			"https://api.business.githubcopilot.com",
		);
	});
	it("resolves xAI subscription auth for fixed wake-ups even though quota queries remain unsupported", async () => {
		const { dir, ctx, getProviderAuth } = await setup({
			xai: { type: "oauth", email: "grok@example.test", refresh: "fixture" },
		});
		getProviderAuth.mockImplementation(async () => ({
			auth: { apiKey: "xai-model-token" },
		}));
		const [account] = await collectAccounts(
			ctx,
			dir,
			new AbortController().signal,
		);
		expect(account.unavailable).toBeUndefined();
		expect(account.requestAuth?.apiKey).toBe("xai-model-token");
	});

	it("blocks an account whose login identity changes while host auth is being resolved", async () => {
		const { dir, ctx, getProviderAuth } = await setup({
			openai: { type: "oauth", email: "first@example.test", refresh: "one" },
		});
		getProviderAuth.mockImplementation(async () => {
			await writeFile(
				join(dir, "auth.json"),
				JSON.stringify({
					openai: {
						type: "oauth",
						email: "second@example.test",
						refresh: "two",
					},
				}),
			);
			return { auth: { apiKey: "second-account-token" } };
		});
		const [account] = await collectAccounts(
			ctx,
			dir,
			new AbortController().signal,
		);
		expect(account.unavailable).toContain("credential resolution failed");
	});
});

describe("provider-owned linked Antigravity renewal", () => {
	it("refreshes an expired linked account without changing the active login or other accounts", async () => {
		const x = await linkedFixture(),
			beforeAuth = await readFile(join(x.dir, "auth.json"), "utf8");
		const accounts = await collectAccounts(
			x.ctx,
			x.dir,
			new AbortController().signal,
		);
		const b = accounts.find((a) => a.projectId === "linked-project");
		expect(x.refresh).toHaveBeenCalledTimes(1);
		expect(x.refresh.mock.calls[0][0].refresh).toBe("linked-refresh");
		expect(b?.token).toBe("linked-new-token");
		expect(b?.unavailable).toBeUndefined();
		const saved = await x.readStore();
		expect(saved.activeAccountId).toBe("active");
		expect(saved.accounts.active).toEqual(x.store.accounts.active);
		expect(saved.accounts.valid).toEqual(x.store.accounts.valid);
		expect(saved.accounts.expired.refresh).toBe("linked-rotated-refresh");
		expect(await readFile(join(x.dir, "auth.json"), "utf8")).toBe(beforeAuth);
		if (!b) throw new Error("Missing renewed account");
		const snapshot = await queryQuota(
			b,
			new AbortController().signal,
			async () =>
				Response.json({
					models: { gemini: { quotaInfo: { remainingFraction: 0.5 } } },
				}),
		);
		expect(snapshot.status).toBe("available");
		expect(JSON.stringify(snapshot)).not.toMatch(
			/linked-new-token|linked-refresh|linked-rotated-refresh|expired@example/,
		);
	});
	it("serializes simultaneous inventories and rechecks persisted freshness before refreshing again", async () => {
		const x = await linkedFixture();
		const results = await Promise.all([
			collectAccounts(x.ctx, x.dir, new AbortController().signal),
			collectAccounts(x.ctx, x.dir, new AbortController().signal),
		]);
		expect(x.refresh).toHaveBeenCalledTimes(1);
		expect(
			results.every((a) => a.some((v) => v.token === "linked-new-token")),
		).toBe(true);
	});
	it("isolates refresh failures and suppresses immediate repeated OAuth requests", async () => {
		const x = await linkedFixture();
		x.refresh.mockRejectedValue(new Error("secret-token full@example.test"));
		for (let i = 0; i < 2; i++) {
			const accounts = await collectAccounts(
				x.ctx,
				x.dir,
				new AbortController().signal,
			);
			expect(
				accounts.find((a) => a.projectId === "linked-project")?.unavailable,
			).toContain("refresh failed");
			expect(
				accounts.find((a) => a.token === "valid-token")?.unavailable,
			).toBeUndefined();
			expect(accounts.map((a) => a.unavailable).join()).not.toMatch(
				/secret-token|full@/,
			);
		}
		expect(x.refresh).toHaveBeenCalledTimes(1);
	});
	it("requires provider-controlled persistence before using a refreshed token", async () => {
		const x = await linkedFixture();
		x.refresh.mockImplementation(async (c) => ({
			...c,
			access: "not-persisted",
			expires: Date.now() + 3600000,
		}));
		const accounts = await collectAccounts(
			x.ctx,
			x.dir,
			new AbortController().signal,
		);
		expect(
			accounts.find((a) => a.projectId === "linked-project")?.unavailable,
		).toContain("refresh failed");
		expect(accounts.some((a) => a.token === "not-persisted")).toBe(false);
	});
	it("rejects returned credentials for a different identity", async () => {
		const x = await linkedFixture();
		const persist = x.refresh.getMockImplementation();
		if (!persist) throw new Error("Missing fixture");
		x.refresh.mockImplementation(async (c, s) => ({
			...(await persist(c, s)),
			email: "wrong@example.test",
			access: "wrong-account",
		}));
		const accounts = await collectAccounts(
			x.ctx,
			x.dir,
			new AbortController().signal,
		);
		expect(
			accounts.find((a) => a.projectId === "linked-project")?.unavailable,
		).toContain("refresh failed");
		expect(accounts.some((a) => a.token === "wrong-account")).toBe(false);
	});
	it("does not restore an old active login if it changes during provider renewal", async () => {
		const x = await linkedFixture(),
			persist = x.refresh.getMockImplementation();
		if (!persist) throw new Error("Missing fixture");
		const replacement = {
			antigravity: {
				type: "oauth",
				email: "new-active@example.test",
				access: "new-active",
				refresh: "new-active-refresh",
				expires: Date.now() + 3600000,
			},
		};
		x.refresh.mockImplementation(async (c, s) => {
			const next = await persist(c, s);
			await writeFile(join(x.dir, "auth.json"), JSON.stringify(replacement));
			return next;
		});
		const accounts = await collectAccounts(
			x.ctx,
			x.dir,
			new AbortController().signal,
		);
		expect(
			accounts.find((a) => a.projectId === "linked-project")?.unavailable,
		).toContain("refresh failed");
		expect(
			JSON.parse(await readFile(join(x.dir, "auth.json"), "utf8")),
		).toEqual(replacement);
	});
	it("cancels while waiting for Pi's compatible auth lock without calling the provider", async () => {
		const x = await linkedFixture(),
			release = await lockfile.lock(join(x.dir, "auth.json"), {
				realpath: false,
				stale: 30000,
			});
		const controller = new AbortController();
		try {
			const pending = collectAccounts(x.ctx, x.dir, controller.signal);
			setTimeout(() => controller.abort(), 20);
			await expect(pending).rejects.toThrow();
			expect(x.refresh).not.toHaveBeenCalled();
		} finally {
			await release();
		}
	});
	it("keeps the owner operation pending until an uncancellable provider refresh has saved rotation", async () => {
		const x = await linkedFixture(),
			persist = x.refresh.getMockImplementation();
		if (!persist) throw new Error("Missing fixture");
		let enter!: () => void, release!: () => void;
		const entered = new Promise<void>((r) => {
				enter = r;
			}),
			gate = new Promise<void>((r) => {
				release = r;
			});
		x.refresh.mockImplementation(async (c, s) => {
			enter();
			await gate;
			return persist(c, s);
		});
		const controller = new AbortController();
		let settled = false;
		const pending = collectAccounts(x.ctx, x.dir, controller.signal);
		void pending.then(
			() => {
				settled = true;
			},
			() => {
				settled = true;
			},
		);
		await entered;
		controller.abort();
		try {
			await new Promise((r) => setTimeout(r, 20));
			expect(settled).toBe(false);
			expect(
				await lockfile.check(join(x.dir, "auth.json"), {
					realpath: false,
					stale: 30000,
				}),
			).toBe(true);
		} finally {
			release();
			await pending.catch(() => {});
		}
		expect((await x.readStore()).accounts.expired.access).toBe(
			"linked-new-token",
		);
		expect(
			await lockfile.check(join(x.dir, "auth.json"), {
				realpath: false,
				stale: 30000,
			}),
		).toBe(false);
	});

	it("does not refresh an account that became active while waiting for the auth lock", async () => {
		const x = await linkedFixture(),
			release = await lockfile.lock(join(x.dir, "auth.json"), {
				realpath: false,
				stale: 30000,
			});
		const pending = collectAccounts(x.ctx, x.dir, new AbortController().signal);
		await new Promise((r) => setTimeout(r, 30));
		const active = {
			antigravity: { ...x.store.accounts.expired, type: "oauth" },
		};
		await writeFile(join(x.dir, "auth.json"), JSON.stringify(active));
		await release();
		const accounts = await pending;
		expect(x.refresh).not.toHaveBeenCalled();
		expect(
			accounts.find((a) => a.projectId === "linked-project")?.unavailable,
		).toContain("refresh failed");
		expect(
			JSON.parse(await readFile(join(x.dir, "auth.json"), "utf8")),
		).toEqual(active);
	});
	it("does not revive a linked account removed while waiting for the auth lock", async () => {
		const x = await linkedFixture(),
			release = await lockfile.lock(join(x.dir, "auth.json"), {
				realpath: false,
				stale: 30000,
			});
		const pending = collectAccounts(x.ctx, x.dir, new AbortController().signal);
		await new Promise((r) => setTimeout(r, 30));
		const current = await x.readStore();
		Reflect.deleteProperty(current.accounts, "expired");
		await writeFile(x.file, JSON.stringify(current));
		await release();
		await pending;
		expect(x.refresh).not.toHaveBeenCalled();
		expect((await x.readStore()).accounts).not.toHaveProperty("expired");
	});
	it("fails closed when the registered OAuth refresher is absent and keeps other accounts usable", async () => {
		const x = await linkedFixture();
		x.getProvider.mockReturnValue(undefined);
		const accounts = await collectAccounts(
			x.ctx,
			x.dir,
			new AbortController().signal,
		);
		expect(
			accounts.find((a) => a.projectId === "linked-project")?.unavailable,
		).toContain("registered OAuth refresh support");
		expect(accounts.some((a) => a.token === "valid-token")).toBe(true);
		expect(x.refresh).not.toHaveBeenCalled();
	});
	it("renews near-expiry linked tokens before long quota requests use them", async () => {
		const x = await linkedFixture();
		const current = await x.readStore();
		current.accounts.expired.expires = Date.now() + 10000;
		await writeFile(x.file, JSON.stringify(current));
		const accounts = await collectAccounts(
			x.ctx,
			x.dir,
			new AbortController().signal,
		);
		expect(x.refresh).toHaveBeenCalledTimes(1);
		expect(accounts.some((a) => a.token === "linked-new-token")).toBe(true);
	});
	it("acquires the auth lock across repeated linked renewals using a plain fs object", async () => {
		const spy = vi.spyOn(lockfile, "lock");
		try {
			const x = await linkedFixture();
			await collectAccounts(x.ctx, x.dir, new AbortController().signal);
			const rotated = await x.readStore();
			rotated.accounts.expired.expires = 0;
			await writeFile(x.file, JSON.stringify(rotated));
			x.refresh.mockImplementationOnce(async (c: OAuthCredential) => {
				const next = {
					...c,
					access: "linked-second-token",
					refresh: "linked-second-refresh",
					expires: Date.now() + 3600000,
				};
				const saved = await x.readStore();
				saved.accounts.expired = { ...saved.accounts.expired, ...next };
				await writeFile(x.file, JSON.stringify(saved));
				return next;
			});
			const accounts = await collectAccounts(
				x.ctx,
				x.dir,
				new AbortController().signal,
			);
			expect(x.refresh).toHaveBeenCalledTimes(2);
			expect(accounts.some((a) => a.token === "linked-second-token")).toBe(
				true,
			);
			expect(spy).toHaveBeenCalledTimes(2);
			const customFs = spy.mock.calls[0]?.[1]?.fs as object | undefined;
			expect(customFs).toBeDefined();
			const symbols = Object.getOwnPropertySymbols(customFs ?? {});
			expect(symbols).toHaveLength(1);
			expect(
				Object.getOwnPropertyDescriptor(customFs, symbols[0]),
			).toMatchObject({
				configurable: false,
				writable: false,
			});
		} finally {
			spy.mockRestore();
		}
	});
});
