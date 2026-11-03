import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
	type ExtensionAPI,
	type ExtensionContext,
	getAgentDir,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { Check } from "typebox/value";
import { defaults, Recovery, type Settings } from "./recovery.ts";

const schema = Type.Object(
	{
		enabled: Type.Optional(Type.Boolean()),
		network: Type.Optional(Type.Boolean()),
		throttle: Type.Optional(Type.Boolean()),
		quota: Type.Optional(Type.Boolean()),
		wake: Type.Optional(Type.Boolean()),
		retryDelayMs: Type.Optional(
			Type.Integer({ minimum: 1, maximum: 86400000 }),
		),
		quotaDelayMs: Type.Optional(
			Type.Integer({ minimum: 0, maximum: 86400000 }),
		),
		maxAttempts: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
	},
	{ additionalProperties: false },
);

export default function (pi: ExtensionAPI) {
	let recovery = new Recovery();
	let timer: ReturnType<typeof setInterval> | undefined;
	let unlisten: (() => void) | undefined;
	let ctx: ExtensionContext | undefined;
	let final:
		| { error: string; headers: Record<string, string>; status?: number }
		| undefined;
	let headers: Record<string, string> = {};
	let status: number | undefined;
	let lastTick = Date.now();
	const show = () => {
		if (ctx?.hasUI) ctx.ui.setStatus("auto-resume", recovery.status);
	};
	const tick = () => {
		if (!ctx) return;
		const now = Date.now();
		if (now - lastTick > 30000) recovery.woke();
		lastTick = now;
		if (recovery.take(now, ctx.isIdle() && !ctx.hasPendingMessages())) {
			try {
				pi.sendUserMessage(
					"Continue the interrupted task from where it stopped.",
				);
			} catch {
				recovery.cancel();
				if (ctx.hasUI)
					ctx.ui.notify(
						"Auto Resume: continuation was not accepted.",
						"warning",
					);
			}
		}
		show();
	};
	const stop = () => {
		if (timer) clearInterval(timer);
		timer = undefined;
		unlisten?.();
		unlisten = undefined;
		recovery.cancel();
		ctx = undefined;
	};
	pi.on("session_start", async (_event, current) => {
		stop();
		ctx = current;
		let settings: Partial<Settings> = {};
		try {
			const data: unknown = JSON.parse(
				await readFile(join(getAgentDir(), "pi-auto-resume.json"), "utf8"),
			);
			if (!Check(schema, data)) throw new Error("Invalid configuration");
			settings = data;
		} catch (error) {
			if (
				!(error instanceof Error && "code" in error && error.code === "ENOENT")
			) {
				settings = { enabled: false };
				if (current.hasUI)
					current.ui.notify(
						"Auto Resume disabled: invalid/unreadable pi-auto-resume.json.",
						"error",
					);
			}
		}
		recovery = new Recovery(settings);
		final = undefined;
		lastTick = Date.now();
		if (current.mode === "tui")
			unlisten = current.ui.onTerminalInput((data) => {
				if (data === "\u001b" || data === "\u0003") {
					recovery.cancel();
					final = undefined;
					show();
				}
				return undefined;
			});
		timer = setInterval(tick, 250);
	});
	pi.on("session_shutdown", stop);
	pi.on("session_tree", () => {
		recovery.cancel();
		final = undefined;
	});
	pi.on("model_select", () => {
		recovery.cancel();
		final = undefined;
	});
	pi.on("input", (event) => {
		if (event.source !== "extension") {
			recovery.userInput();
			final = undefined;
		}
	});
	pi.on("agent_start", () => {
		recovery.running();
		final = undefined;
	});
	pi.on("before_provider_request", () => {
		headers = {};
		status = undefined;
	});
	pi.on("after_provider_response", (event) => {
		headers = event.headers;
		status = event.status;
	});
	pi.on("message_end", (event) => {
		if (event.message.role !== "assistant") return;
		if (event.message.stopReason === "error")
			final = {
				error: event.message.errorMessage ?? "",
				headers: { ...headers },
				status,
			};
		else {
			final = undefined;
			if (event.message.stopReason === "aborted") recovery.cancel();
			else recovery.completed();
		}
	});
	pi.on("agent_settled", (event, current) => {
		ctx = current;
		if (event.aborted) {
			recovery.cancel();
			final = undefined;
		} else if (final) {
			recovery.failed(final.error, final.headers, Date.now(), final.status);
			final = undefined;
		}
		show();
	});
	pi.registerCommand("auto-resume", {
		description: "Show status; stop pending recovery; on/off for this session",
		handler: async (args, current) => {
			const action = args.trim();
			if (action === "stop" || action === "off") {
				recovery.cancel();
				final = undefined;
				if (action === "off") recovery.settings.enabled = false;
			} else if (action === "on") recovery.settings.enabled = true;
			current.ui.notify(
				`Auto Resume: ${recovery.status}; enabled=${recovery.settings.enabled}; maxAttempts=${recovery.settings.maxAttempts}; config=${join(getAgentDir(), "pi-auto-resume.json")}\nDefaults: ${JSON.stringify(defaults)}`,
				"info",
			);
		},
	});
}
