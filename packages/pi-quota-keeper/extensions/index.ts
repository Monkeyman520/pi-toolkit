import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
	type ExtensionAPI,
	type ExtensionContext,
	getAgentDir,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { Check } from "typebox/value";
import { collectAccounts } from "./accounts.ts";
import { formatQuotaCommand, parseQuotaArgs, quotaUsage } from "./commands.ts";
import { Owner, readState, type State, writeState } from "./coordination.ts";
import { queryQuota } from "./providers.ts";
import { dueActivation } from "./schedule.ts";
import { sendWakeup, withWakeup } from "./wakeups.ts";

const configSchema = Type.Object(
	{
		pollIntervalMs: Type.Optional(
			Type.Integer({ minimum: 10000, maximum: 86400000 }),
		),
		mode: Type.Optional(
			Type.Union([Type.Literal("reset"), Type.Literal("fixed")]),
		),
		delayMs: Type.Optional(Type.Integer({ minimum: 0, maximum: 86400000 })),
		enabledAccounts: Type.Optional(
			Type.Array(Type.String(), { maxItems: 100 }),
		),
		models: Type.Optional(Type.Record(Type.String(), Type.String())),
		resetWindows: Type.Optional(Type.Record(Type.String(), Type.String())),
	},
	{ additionalProperties: false },
);
const defaults = {
	pollIntervalMs: 60000,
	mode: "reset" as "reset" | "fixed",
	delayMs: 30000,
	enabledAccounts: [] as string[],
	models: {} as Record<string, string>,
	resetWindows: {} as Record<string, string>,
};

export default function (pi: ExtensionAPI) {
	let current: ExtensionContext | undefined, owner: Owner | undefined;
	let abort = new AbortController(),
		timer: ReturnType<typeof setInterval> | undefined;
	let refreshPending = false;
	let busy: Promise<void> | undefined,
		lastPoll = 0,
		lastTick = 0;
	let state: State = { version: 1, snapshots: [], ledger: {} };
	let config = { ...defaults },
		problem: string | undefined;
	const dir = getAgentDir();
	const show = () => {
		if (current?.hasUI)
			current.ui.setStatus(
				"quota-keeper",
				problem ??
					`quota: ${owner?.active ? "owner" : "follower"} · ${state.snapshots.length} accounts · ${state.schedule?.mode ?? config.mode}`,
			);
	};
	async function tick(forceRefresh = false) {
		if (!current || !owner || abort.signal.aborted) return;
		const now = Date.now(),
			woke = now - lastTick > 30000;
		lastTick = now;
		if (!(await owner.acquire())) {
			state = await readState(dir);
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
			try {
				const raw: unknown = JSON.parse(
					await readFile(join(dir, "pi-quota-keeper.json"), "utf8"),
				);
				if (!Check(configSchema, raw)) throw new Error("Invalid configuration");
				config = { ...defaults, ...raw };
			} catch (error) {
				if (
					!(
						error instanceof Error &&
						"code" in error &&
						error.code === "ENOENT"
					)
				)
					throw new Error(
						"Invalid/unreadable pi-quota-keeper.json; maintenance paused.",
					);
				config = { ...defaults };
			}
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
		await writeState(dir, state);
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
	async function stop() {
		if (timer) clearInterval(timer);
		timer = undefined;
		abort.abort();
		await busy;
		await owner?.close();
		owner = undefined;
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
		launch();
		timer = setInterval(launch, 1000);
	});
	pi.on("session_shutdown", stop);
	pi.registerCommand("quota", {
		description:
			"View quotas, list account IDs, select an account, or refresh through the owner",
		handler: async (args, ctx) => {
			const command = parseQuotaArgs(args);
			if (command.kind === "usage") {
				ctx.ui.notify(quotaUsage, "info");
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
