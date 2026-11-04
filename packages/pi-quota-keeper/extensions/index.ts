import { mkdir, stat } from "node:fs/promises";
import { join } from "node:path";
import {
	type ExtensionAPI,
	type ExtensionContext,
	getAgentDir,
} from "@earendil-works/pi-coding-agent";
import { collectAccounts } from "./accounts.ts";
import {
	formatQuotaCommand,
	getQuotaCompletions,
	parseQuotaArgs,
	quotaUsage,
} from "./commands.ts";
import {
	defaultQuotaConfig,
	executeQuotaConfigCommand,
	Owner,
	type QuotaKeeperConfig,
	readQuotaConfig,
	readState,
	type State,
	writeState,
} from "./coordination.ts";
import { queryQuota } from "./providers.ts";
import { dueActivation } from "./schedule.ts";
import {
	DISCOVER_EVENT,
	isDiscoverPayload,
	openQuotaSettingsPanel,
	SELF_PLUGIN_ID,
} from "./ui.ts";
import { sendWakeup, withWakeup } from "./wakeups.ts";

export default function (pi: ExtensionAPI) {
	let current: ExtensionContext | undefined, owner: Owner | undefined;
	let abort = new AbortController(),
		timer: ReturnType<typeof setInterval> | undefined;
	let unlistenDiscover: (() => void) | undefined;
	let refreshPending = false;
	let busy: Promise<void> | undefined,
		lastPoll = 0,
		lastTick = 0;
	let state: State = { version: 1, snapshots: [], ledger: {} };
	let config: QuotaKeeperConfig = {
		...defaultQuotaConfig,
		enabledAccounts: [],
		models: {},
		resetWindows: {},
	};
	let problem: string | undefined;
	let lastStatusText: string | undefined;
	let lastFollowerMtimeMs: number | undefined;
	const dir = getAgentDir();
	const show = () => {
		if (!current?.hasUI) return;
		const nextStatus =
			problem ??
			`quota: ${owner?.active ? "owner" : "follower"} · ${state.snapshots.length} accounts · ${state.schedule?.mode ?? config.mode}`;
		if (nextStatus === lastStatusText) return;
		lastStatusText = nextStatus;
		current.ui.setStatus("quota-keeper", nextStatus);
	};
	async function tick(forceRefresh = false) {
		if (!current || !owner || abort.signal.aborted) return;
		const now = Date.now(),
			woke = now - lastTick > 30000;
		lastTick = now;
		if (!(await owner.acquire())) {
			const stateFile = join(dir, "pi-quota-keeper-state.json");
			const mtimeMs = await stat(stateFile)
				.then((s) => s.mtimeMs)
				.catch(() => -1);
			if (
				lastFollowerMtimeMs === undefined ||
				lastFollowerMtimeMs !== mtimeMs
			) {
				state = await readState(dir);
				lastFollowerMtimeMs = mtimeMs;
			}
			show();
			return;
		}
		const ctx = current;
		if (
			forceRefresh ||
			woke ||
			now - lastPoll >= config.pollIntervalMs ||
			!lastPoll
		) {
			config = await readQuotaConfig(dir);
			// A takeover must load the previous owner's intent ledger before any request.
			state = await readState(dir);
			state.schedule = {
				mode: config.mode,
				delayMs: config.delayMs,
				enabledAccounts: config.enabledAccounts,
			};
			const accounts = await collectAccounts(ctx, dir, abort.signal);
			state.snapshots = [];
			for (const account of accounts) {
				if (abort.signal.aborted) return;
				state.snapshots.push(
					withWakeup(
						account,
						await queryQuota(account, abort.signal),
						config.models[account.id],
						config.resetWindows[account.id],
					),
				);
			}
			lastPoll = Date.now();
			await writeState(dir, state);
		}
		if (forceRefresh) {
			problem = undefined;
			show();
			return;
		}
		const ledgerBefore = JSON.stringify(state.ledger);
		for (const snapshot of state.snapshots) {
			if (abort.signal.aborted || !owner.active) return;
			if (Date.now() - snapshot.fetchedAt > config.pollIntervalMs * 2) continue;
			let due = dueActivation(snapshot, config, state.ledger, Date.now());
			if (!due) continue;
			const modelId = config.models[snapshot.id];
			const model = modelId
				? ctx.modelRegistry.find(snapshot.provider, modelId)
				: undefined;
			if (!model) {
				state.ledger[snapshot.id].outcome =
					"Wake-up needs an explicit registered model in configuration.";
				continue;
			}
			const accounts = await collectAccounts(ctx, dir, abort.signal);
			const target = accounts.find(
				(a) => a.id === snapshot.id && !a.unavailable,
			);
			if (!target) continue;
			const fresh = withWakeup(
				target,
				await queryQuota(target, abort.signal),
				modelId,
				config.resetWindows[target.id],
			);
			state.snapshots = state.snapshots.map((s) =>
				s.id === fresh.id ? fresh : s,
			);
			due = dueActivation(fresh, config, state.ledger, Date.now());
			if (!due || abort.signal.aborted) continue;
			// Persist intent before the side effect. Crash/unknown outcomes are not replayed.
			state.ledger[snapshot.id].attempted = due.cycle;
			state.ledger[snapshot.id].outcome =
				"Wake-up attempted; delivery and window opening are unverified.";
			await writeState(dir, state);
			try {
				state.ledger[snapshot.id].outcome = await sendWakeup(
					ctx.modelRegistry,
					target,
					model,
					abort.signal,
				);
			} catch {
				state.ledger[snapshot.id].outcome =
					"Wake-up outcome uncertain; cycle will not be replayed.";
			}
			await writeState(dir, state);
			lastPoll = 0;
		}
		if (JSON.stringify(state.ledger) !== ledgerBefore) {
			await writeState(dir, state);
		}
		problem = undefined;
		show();
	}
	function run(forceRefresh = false): Promise<void> {
		if (busy) return busy;
		busy = tick(forceRefresh)
			.catch((error: unknown) => {
				problem =
					error instanceof Error &&
					/^(Quota state unreadable|Invalid\/unreadable pi-quota-keeper|Quota coordination address collision|Pi account metadata unreadable)/.test(
						error.message,
					)
						? error.message
						: "Quota maintenance paused: credential or coordination failure.";
				show();
			})
			.finally(() => {
				busy = undefined;
			});
		return busy;
	}

	function launch() {
		if (!refreshPending) void run();
	}
	async function refreshNow(signal: AbortSignal): Promise<void> {
		signal.throwIfAborted();
		refreshPending = true;
		try {
			while (busy) {
				await busy;
				signal.throwIfAborted();
			}
			signal.throwIfAborted();
			if (signal !== abort.signal) throw new Error("Quota session changed");
			if (!owner?.active) throw new Error("Not the maintenance owner");
			await run(true);
			if (problem || !owner.active || abort.signal.aborted)
				throw new Error("Quota refresh did not complete");
		} finally {
			if (signal === abort.signal) refreshPending = false;
		}
	}

	async function syncOwnerAndState(
		nextConfig: QuotaKeeperConfig,
	): Promise<boolean> {
		config = nextConfig;
		let synced = false;
		try {
			await owner?.acquire();
			synced = (await owner?.requestRefresh(abort.signal)) ?? false;
			if (synced) {
				state = await readState(dir);
				lastFollowerMtimeMs = undefined;
			}
		} catch {
			synced = false;
		}
		show();
		return synced;
	}

	async function openSettingsPanel(targetCtx: ExtensionContext): Promise<void> {
		try {
			config = await readQuotaConfig(dir);
		} catch {
			// Keep current config in memory if unreadable
		}
		try {
			state = await readState(dir);
		} catch {
			// Keep current state in memory if unreadable
		}
		await openQuotaSettingsPanel({
			ctx: targetCtx,
			events: pi.events,
			dir,
			getState: () => state,
			getConfig: () => config,
			getOwnerActive: () => owner?.active ?? false,
			getProblem: () => problem,
			onApplyConfig: syncOwnerAndState,
			onRefreshNow: async () => {
				try {
					await owner?.acquire();
					const refreshed =
						(await owner?.requestRefresh(abort.signal)) ?? false;
					if (refreshed) {
						state = await readState(dir);
						problem = undefined;
					}
					show();
					return refreshed;
				} catch {
					return false;
				}
			},
			onReloadConfig: async () => {
				config = await readQuotaConfig(dir);
				show();
				return config;
			},
		});
	}

	async function stop() {
		if (timer) clearInterval(timer);
		timer = undefined;
		unlistenDiscover?.();
		unlistenDiscover = undefined;
		abort.abort();
		await busy;
		await owner?.close();
		owner = undefined;
		lastStatusText = undefined;
		lastFollowerMtimeMs = undefined;
		current = undefined;
	}
	pi.on("session_start", async (_event, ctx) => {
		await stop();
		current = ctx;
		abort = new AbortController();
		lastPoll = 0;
		lastTick = Date.now();
		await mkdir(dir, { recursive: true, mode: 0o700 });
		refreshPending = false;
		const signal = abort.signal;
		owner = new Owner(dir, () => refreshNow(signal));
		unlistenDiscover = pi.events.on(DISCOVER_EVENT, (payload: unknown) => {
			if (!isDiscoverPayload(payload)) return;
			payload.register({
				id: SELF_PLUGIN_ID,
				title: "Pi Quota Keeper",
				command: "/quota",
				getSummary: () =>
					`${owner?.active ? "owner" : "follower"} · ${state.snapshots.length} accounts · ${state.schedule?.mode ?? config.mode}`,
				open: openSettingsPanel,
			});
		});
		launch();
		timer = setInterval(launch, 1000);
		timer.unref?.();
	});
	pi.on("session_shutdown", stop);
	pi.registerCommand("quota", {
		description:
			"Open interactive TUI quota & settings panel, view quotas, list account IDs, enable/disable wake-ups, update config, or refresh through the owner",
		getArgumentCompletions: (prefix) => {
			const models = (() => {
				try {
					const reg = current?.modelRegistry as unknown as {
						getAvailable?: () => ReadonlyArray<{
							id: string;
							provider: string;
							name?: string;
						}>;
					};
					return reg?.getAvailable?.() ?? [];
				} catch {
					return [];
				}
			})();
			return getQuotaCompletions(prefix, {
				snapshots: state.snapshots,
				config,
				models,
			});
		},
		handler: async (args, ctx) => {
			current = ctx;
			const trimmedArgs = args.trim();
			if (!trimmedArgs && ctx.mode === "tui") {
				await openSettingsPanel(ctx);
				return;
			}

			const command = parseQuotaArgs(args);
			if (command.kind === "usage") {
				ctx.ui.notify(quotaUsage, "info");
				return;
			}
			if (
				command.kind === "config" &&
				!command.key &&
				!command.reload &&
				ctx.mode === "tui"
			) {
				await openSettingsPanel(ctx);
				return;
			}
			if (
				command.kind === "enable" ||
				command.kind === "disable" ||
				command.kind === "config"
			) {
				const res = await executeQuotaConfigCommand(dir, command);
				if (!res.ok) {
					ctx.ui.notify(res.error, "error");
					return;
				}
				config = res.config;
				if (!res.mutated) {
					show();
					ctx.ui.notify(res.message, "info");
					return;
				}
				const synced = await syncOwnerAndState(res.config);
				ctx.ui.notify(
					`${res.message}${synced ? " Owner state refreshed." : " Saved; owner will apply on next poll."}`,
					"info",
				);
				return;
			}

			let refreshed = false;
			if (command.kind === "refresh") {
				try {
					await owner?.acquire();
					refreshed = (await owner?.requestRefresh(abort.signal)) ?? false;
				} catch {
					refreshed = false;
				}
			} else if (busy) await busy;
			let view: State;
			try {
				view = await readState(dir);
			} catch {
				ctx.ui.notify(
					"Cached quota state is unreadable; refresh cannot be confirmed. Do not delete the activation ledger to retry.",
					"warning",
				);
				return;
			}
			state = view;
			if (refreshed) problem = undefined;
			const lines = formatQuotaCommand(
				{
					snapshots: view.snapshots,
					ledger: view.ledger,
					schedule: view.schedule ?? config,
					owner: owner?.active ?? false,
					problem,
				},
				command,
			);
			if (command.kind === "refresh")
				lines.unshift(
					refreshed
						? "Quota refreshed."
						: "Refresh not completed: owner unavailable, busy, or reload required. Showing cached results.",
				);
			const missing =
				command.kind === "view" &&
				command.id !== undefined &&
				!view.snapshots.some((s) => s.id === command.id);
			ctx.ui.notify(
				lines.join("\n"),
				missing || (command.kind === "refresh" && !refreshed)
					? "warning"
					: "info",
			);
		},
	});
}
