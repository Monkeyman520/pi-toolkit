import {
	createHash,
	randomBytes,
	randomUUID,
	timingSafeEqual,
} from "node:crypto";
import {
	mkdir,
	readFile,
	realpath,
	rename,
	unlink,
	writeFile,
} from "node:fs/promises";
import {
	createConnection,
	createServer,
	type ListenOptions,
	type Server,
	type Socket,
} from "node:net";
import { join } from "node:path";
import { readJsonConfig, writeJsonConfig } from "pi-plugin-support/config";
import { Type } from "typebox";
import { Check } from "typebox/value";
import { MAX_JSON_BYTES, type Snapshot } from "./providers.ts";
import type { Ledger } from "./schedule.ts";

const windowSchema = Type.Object(
	{
		id: Type.String(),
		remainingPercent: Type.Optional(Type.Number({ minimum: 0, maximum: 100 })),
		resetAt: Type.Optional(Type.Number({ minimum: 0 })),
		shared: Type.Optional(Type.Boolean()),
	},
	{ additionalProperties: false },
);
const snapshotSchema = Type.Object(
	{
		id: Type.String(),
		provider: Type.String(),
		label: Type.String(),
		credentialType: Type.Optional(Type.String()),
		status: Type.Union([
			Type.Literal("available"),
			Type.Literal("unavailable"),
		]),
		reason: Type.Optional(Type.String()),
		fetchedAt: Type.Number(),
		windows: Type.Array(windowSchema),

		resetCredits: Type.Optional(
			Type.Object(
				{
					availableCount: Type.Integer({
						minimum: 0,
						maximum: Number.MAX_SAFE_INTEGER,
					}),

					expirations: Type.Optional(
						Type.Array(
							Type.Object(
								{
									expiresAt: Type.Optional(
										Type.Number({ minimum: 0, maximum: 8.64e15 }),
									),
								},
								{ additionalProperties: false },
							),
						),
					),
					detailsUnavailable: Type.Optional(Type.String()),
				},
				{ additionalProperties: false },
			),
		),
		activation: Type.Object(
			{
				supported: Type.Boolean(),
				reason: Type.String(),
				bestEffort: Type.Optional(Type.Boolean()),
				windowId: Type.Optional(Type.String()),
			},
			{ additionalProperties: false },
		),
	},
	{ additionalProperties: false },
);
const entrySchema = Type.Object(
	{
		resetAt: Type.Optional(Type.Number()),
		windowId: Type.Optional(Type.String()),
		anchor: Type.Optional(Type.Number()),
		attempted: Type.Optional(Type.String()),
		outcome: Type.Optional(Type.String()),
	},
	{ additionalProperties: false },
);
const scheduleSchema = Type.Object(
	{
		mode: Type.Union([Type.Literal("reset"), Type.Literal("fixed")]),
		delayMs: Type.Number(),
		enabledAccounts: Type.Array(Type.String()),
	},
	{ additionalProperties: false },
);
const stateSchema = Type.Object(
	{
		version: Type.Literal(1),
		snapshots: Type.Array(snapshotSchema),
		ledger: Type.Record(Type.String(), entrySchema),
		schedule: Type.Optional(scheduleSchema),
	},
	{ additionalProperties: false },
);
export interface State {
	version: 1;
	snapshots: Snapshot[];
	ledger: Ledger;
	schedule?: {
		mode: "reset" | "fixed";
		delayMs: number;
		enabledAccounts: string[];
	};
}

export const configSchema = Type.Object(
	{
		pollIntervalMs: Type.Optional(
			Type.Integer({ minimum: 10000, maximum: 86400000 }),
		),
		mode: Type.Optional(
			Type.Union([Type.Literal("reset"), Type.Literal("fixed")]),
		),
		delayMs: Type.Optional(Type.Integer({ minimum: 0, maximum: 86400000 })),
		enabledAccounts: Type.Optional(
			Type.Array(Type.String({ minLength: 1 }), { maxItems: 100 }),
		),
		models: Type.Optional(Type.Record(Type.String(), Type.String())),
		resetWindows: Type.Optional(Type.Record(Type.String(), Type.String())),
	},
	{ additionalProperties: false },
);

export interface QuotaKeeperConfig {
	pollIntervalMs: number;
	mode: "reset" | "fixed";
	delayMs: number;
	enabledAccounts: string[];
	models: Record<string, string>;
	resetWindows: Record<string, string>;
}

export const defaultQuotaConfig: QuotaKeeperConfig = {
	pollIntervalMs: 60000,
	mode: "reset",
	delayMs: 30000,
	enabledAccounts: [],
	models: {},
	resetWindows: {},
};

export type QuotaConfigKey = "mode" | "delayMs" | "pollIntervalMs";

// Only scalar command-editable settings have presets; account maps stay domain-owned.
export const configOptions: Readonly<
	Record<QuotaConfigKey, { description: string; values: readonly string[] }>
> = {
	mode: {
		description: "Schedule mode: reset | fixed",
		values: ["reset", "fixed"],
	},
	delayMs: {
		description: "Post-reset delay in ms",
		values: ["0", "15000", "30000", "60000", "120000"],
	},
	pollIntervalMs: {
		description: "Quota polling interval in ms",
		values: ["10000", "30000", "60000", "120000", "300000"],
	},
};

export async function readQuotaConfig(dir: string): Promise<QuotaKeeperConfig> {
	const result = await readJsonConfig(
		join(dir, "pi-quota-keeper.json"),
		configSchema,
		MAX_JSON_BYTES,
	);
	if (result.kind === "missing")
		return {
			...defaultQuotaConfig,
			enabledAccounts: [],
			models: {},
			resetWindows: {},
		};
	if (result.kind !== "valid" || !Check(configSchema, result.data))
		throw new Error(
			"Invalid/unreadable pi-quota-keeper.json; maintenance paused.",
		);
	const raw = result.data;
	return {
		pollIntervalMs: raw.pollIntervalMs ?? defaultQuotaConfig.pollIntervalMs,
		mode: raw.mode ?? defaultQuotaConfig.mode,
		delayMs: raw.delayMs ?? defaultQuotaConfig.delayMs,
		enabledAccounts: [...(raw.enabledAccounts ?? [])],
		models: { ...(raw.models ?? {}) },
		resetWindows: { ...(raw.resetWindows ?? {}) },
	};
}

export async function writeQuotaConfig(
	dir: string,
	config: QuotaKeeperConfig,
): Promise<void> {
	await writeJsonConfig(
		join(dir, "pi-quota-keeper.json"),
		config,
		configSchema,
	);
}

export async function executeQuotaConfigCommand(
	dir: string,
	command:
		| { kind: "enable"; id: string; model: string; resetWindow?: string }
		| { kind: "disable"; id: string }
		| {
				kind: "config";
				key?: QuotaConfigKey;
				value?: string;
				reload?: boolean;
		  },
): Promise<
	| {
			ok: true;
			mutated: boolean;
			config: QuotaKeeperConfig;
			message: string;
	  }
	| { ok: false; error: string }
> {
	const configPath = join(dir, "pi-quota-keeper.json");
	let currentCfg: QuotaKeeperConfig;
	try {
		currentCfg = await readQuotaConfig(dir);
	} catch (error) {
		return {
			ok: false,
			error:
				error instanceof Error
					? error.message
					: "Invalid/unreadable pi-quota-keeper.json.",
		};
	}

	if (command.kind === "config") {
		if (command.reload) {
			return {
				ok: true,
				mutated: false,
				config: currentCfg,
				message: `Reloaded Quota Keeper Config (${configPath}): ${JSON.stringify(currentCfg)}`,
			};
		}
		if (!command.key) {
			return {
				ok: true,
				mutated: false,
				config: currentCfg,
				message: `Quota Keeper Config (${configPath})\nActive: ${JSON.stringify(currentCfg)}\nDefaults: ${JSON.stringify(defaultQuotaConfig)}`,
			};
		}
		if (command.value === undefined) {
			return {
				ok: true,
				mutated: false,
				config: currentCfg,
				message: `${command.key} = ${JSON.stringify(currentCfg[command.key])} (config: ${configPath})`,
			};
		}
		if (command.key === "mode") {
			if (command.value !== "reset" && command.value !== "fixed") {
				return {
					ok: false,
					error: 'Invalid mode. Expected "reset" or "fixed".',
				};
			}
			currentCfg.mode = command.value;
		} else {
			if (!/^\d+$/.test(command.value)) {
				return {
					ok: false,
					error: `Invalid integer value "${command.value}" for ${command.key}.`,
				};
			}
			currentCfg[command.key] = Number.parseInt(command.value, 10);
		}
	} else if (command.kind === "enable") {
		if (!currentCfg.enabledAccounts.includes(command.id)) {
			currentCfg.enabledAccounts.push(command.id);
		}
		currentCfg.models[command.id] = command.model;
		if (command.resetWindow) {
			currentCfg.resetWindows[command.id] = command.resetWindow;
		}
	} else if (command.kind === "disable") {
		currentCfg.enabledAccounts = currentCfg.enabledAccounts.filter(
			(id) => id !== command.id,
		);
	}

	try {
		await writeQuotaConfig(dir, currentCfg);
	} catch {
		return {
			ok: false,
			error:
				"Configuration update rejected: value out of allowed schema range.",
		};
	}

	const summary =
		command.kind === "enable"
			? `Enabled wake-up for ${command.id} (model=${command.model}${command.resetWindow ? `, resetWindow=${command.resetWindow}` : ""})`
			: command.kind === "disable"
				? `Disabled wake-up for ${command.id}`
				: command.key
					? `Updated ${command.key}=${JSON.stringify(currentCfg[command.key])}`
					: "Updated configuration";

	return {
		ok: true,
		mutated: true,
		config: currentCfg,
		message: `${summary} in ${configPath}.`,
	};
}

export async function readState(dir: string): Promise<State> {
	try {
		const raw = await readFile(join(dir, "pi-quota-keeper-state.json"), "utf8");
		if (Buffer.byteLength(raw) > MAX_JSON_BYTES)
			throw new Error("State too large");
		const data: unknown = JSON.parse(raw);
		if (!Check(stateSchema, data)) throw new Error("Invalid state");
		return data;
	} catch (error) {
		if (error instanceof Error && "code" in error && error.code === "ENOENT")
			return { version: 1, snapshots: [], ledger: {} };
		throw new Error(
			"Quota state unreadable; refusing activation to avoid replay.",
		);
	}
}
export async function writeState(dir: string, state: State) {
	if (!Check(stateSchema, state)) throw new Error("Invalid quota state");
	await mkdir(dir, { recursive: true, mode: 0o700 });
	const temp = join(dir, `.quota-${process.pid}-${randomUUID()}.tmp`);
	await writeFile(temp, JSON.stringify(state), { mode: 0o600, flag: "wx" });
	await rename(temp, join(dir, "pi-quota-keeper-state.json"));
}
async function identify(port: number): Promise<string | undefined> {
	return new Promise((resolve) => {
		const socket = createConnection({ host: "127.0.0.1", port });
		socket.on("connect", () => socket.write("identify\n"));
		let data = "";
		const finish = (v?: string) => {
			socket.destroy();
			resolve(v);
		};
		socket.setTimeout(1000, () => finish());
		socket.on("error", () => finish());
		socket.on("data", (chunk) => {
			data += chunk.toString();
			if (data.length > 64) finish();
		});
		socket.on("end", () =>
			finish(/^[a-f0-9]{64}$/.test(data) ? data : undefined),
		);
	});
}
export class Owner {
	active = false;
	private server?: Server;
	private refreshSecret?: string;
	private pending?: Promise<boolean>;
	private refreshing?: Promise<void>;
	private location?: Promise<{ scope: string; listen: ListenOptions }>;
	private clients = new Set<Socket>();
	private readonly refreshHandler?: () => Promise<void>;
	readonly directory: string;
	constructor(directory: string, refresh?: () => Promise<void>) {
		this.directory = directory;
		this.refreshHandler = refresh;
	}
	private endpoint(): Promise<{ scope: string; listen: ListenOptions }> {
		this.location ??= (async () => {
			const canonical = await realpath(this.directory);
			const scope = createHash("sha256")
				.update(
					process.platform === "win32" ? canonical.toLowerCase() : canonical,
				)
				.digest("hex");
			if (process.platform === "win32") {
				return {
					scope,
					listen: {
						path: `\\\\.\\pipe\\pi-quota-keeper-${scope}`,
						exclusive: true,
					},
				};
			}
			return {
				scope,
				listen: {
					host: "127.0.0.1",
					port: 20000 + (Number.parseInt(scope.slice(0, 8), 16) % 20000),
					exclusive: true,
				},
			};
		})();
		return this.location;
	}
	acquire(): Promise<boolean> {
		if (this.active) return Promise.resolve(true);
		this.pending ??= this.bind().finally(() => {
			this.pending = undefined;
		});
		return this.pending;
	}
	private refresh(): Promise<void> {
		if (!this.active || !this.refreshHandler)
			return Promise.reject(new Error("Owner refresh unavailable"));
		this.refreshing ??= Promise.resolve()
			.then(this.refreshHandler)
			.finally(() => {
				this.refreshing = undefined;
			});
		return this.refreshing;
	}
	private accept(socket: Socket, scope: string) {
		socket.on("error", () => {});
		if (this.clients.size >= 64) {
			socket.destroy();
			return;
		}
		this.clients.add(socket);
		socket.on("close", () => this.clients.delete(socket));
		socket.setTimeout(1000, () => socket.destroy());
		let request = "",
			handled = false;
		socket.on("data", (chunk) => {
			if (handled) return;
			request += chunk.toString("utf8");
			if (request.length > 256) {
				socket.destroy();
				return;
			}
			if (!request.includes("\n")) return;
			handled = true;
			if (request.trim() === "identify") {
				socket.end(scope);
				return;
			}
			const expected = this.refreshSecret
				? Buffer.from(`refresh ${scope} ${this.refreshSecret}`, "utf8")
				: undefined;
			const actual = Buffer.from(request.trim(), "utf8");
			if (
				!expected ||
				expected.byteLength !== actual.byteLength ||
				!timingSafeEqual(expected, actual)
			) {
				socket.end("rejected");
				return;
			}
			socket.setTimeout(65000);
			void this.refresh().then(
				() => socket.end(`${scope}:refreshed`),
				() => socket.end(`${scope}:failed`),
			);
		});
	}
	private async bind() {
		const { scope, listen } = await this.endpoint();
		const server = createServer((socket) => this.accept(socket, scope));
		const available = await new Promise<boolean>((resolve, reject) => {
			const onError = (error: NodeJS.ErrnoException) => {
				if (error.code === "EADDRINUSE") resolve(false);
				else reject(error);
			};
			server.once("error", onError);
			server.listen(listen, () => {
				server.removeListener("error", onError);
				server.on("error", () => {
					this.active = false;
				});
				resolve(true);
			});
		});
		if (available) {
			if (this.refreshHandler) {
				const secret = randomBytes(32).toString("hex");
				const temp = join(
					this.directory,
					`.quota-refresh-${process.pid}-${randomUUID()}.tmp`,
				);
				try {
					await writeFile(temp, secret, { mode: 0o600, flag: "wx" });
					await rename(
						temp,
						join(this.directory, ".pi-quota-keeper-refresh-token"),
					);
					this.refreshSecret = secret;
				} catch (error) {
					await unlink(temp).catch(() => {});
					for (const client of this.clients) client.destroy();
					await new Promise<void>((resolve) => server.close(() => resolve()));
					throw error;
				}
			}
			this.server = server;
			this.active = true;
			return true;
		}
		if (typeof listen.port === "number") {
			const found = await identify(listen.port);
			// A different scope must never make us scan another port and split ownership.
			if (found && found !== scope)
				throw new Error(
					"Quota coordination address collision; maintenance paused.",
				);
		}
		return false;
	}
	async requestRefresh(signal?: AbortSignal): Promise<boolean> {
		if (signal?.aborted) return false;
		try {
			if (this.active) {
				await this.refresh();
				return !signal?.aborted;
			}
			const { scope, listen } = await this.endpoint();
			const secret = await readFile(
				join(this.directory, ".pi-quota-keeper-refresh-token"),
				"utf8",
			);
			if (!/^[a-f0-9]{64}$/.test(secret)) return false;
			if (signal?.aborted) return false;
			const connect =
				typeof listen.path === "string"
					? { path: listen.path }
					: typeof listen.port === "number"
						? { host: "127.0.0.1", port: listen.port }
						: undefined;
			if (!connect) return false;
			return await new Promise<boolean>((resolve) => {
				const socket = createConnection(connect);
				let response = "",
					done = false;
				const finish = (success: boolean) => {
					if (done) return;
					done = true;
					signal?.removeEventListener("abort", cancel);
					socket.destroy();
					resolve(success);
				};
				const cancel = () => finish(false);
				signal?.addEventListener("abort", cancel, { once: true });
				if (signal?.aborted) {
					finish(false);
					return;
				}
				socket.setTimeout(60000, () => finish(false));
				socket.on("error", () => finish(false));
				socket.on("connect", () =>
					socket.write(`refresh ${scope} ${secret}\n`),
				);
				socket.on("data", (chunk) => {
					response += chunk.toString("utf8");
					if (response.length > 128) finish(false);
				});
				socket.on("end", () => finish(response === `${scope}:refreshed`));
				socket.on("close", () => finish(false));
			});
		} catch {
			return false;
		}
	}
	async close() {
		await this.pending;
		const server = this.server;

		if (server && this.refreshSecret) {
			// Remove only our private authorization token while ownership is still held.
			const file = join(this.directory, ".pi-quota-keeper-refresh-token");
			if ((await readFile(file, "utf8").catch(() => "")) === this.refreshSecret)
				await unlink(file).catch(() => {});
		}
		this.refreshSecret = undefined;
		this.server = undefined;
		this.active = false;
		for (const client of this.clients) client.destroy();
		this.clients.clear();
		if (server)
			await new Promise<void>((resolve, reject) =>
				server.close((error) => (error ? reject(error) : resolve())),
			);
	}
}
