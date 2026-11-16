import {
	type ExtensionAPI,
	type ExtensionContext,
	getAgentDir,
} from "@earendil-works/pi-coding-agent";
import { Capture, type Side } from "./capture.ts";
import { completions, parseCommand, usage } from "./commands.ts";
import {
	type LoadedConfig,
	loadConfig,
	readConfig,
	saveConfig,
} from "./config.ts";
import {
	type PipelineContext,
	type PromptPart,
	runPipeline,
} from "./pipeline.ts";
import { extractAntigravity } from "./request.ts";
import type { Config, Point } from "./schema.ts";
import { DISCOVER_EVENT, registerDiscovery, settingsPanel } from "./ui.ts";

export default function promptPipeline(pi: ExtensionAPI) {
	const capture = new Capture();
	let config: LoadedConfig | undefined,
		customPrompt: boolean | undefined,
		generation = 0;
	let unsubscribe: (() => void) | undefined;
	const output = (
		ctx: ExtensionContext,
		text: string,
		type: "info" | "error" = "info",
	) => {
		if (ctx.mode === "print" || ctx.mode === "json")
			console.error(`[prompt-pipeline] ${text}`);
		else ctx.ui.notify(`[prompt-pipeline] ${text}`, type);
	};
	const log = (
		ctx: ExtensionContext,
		text: string,
		level: "info" | "error",
	) => {
		if (
			config?.logging === "silent" ||
			(level === "info" && config?.logging !== "info")
		)
			return;
		output(ctx, text, level);
	};
	const reload = async (ctx: ExtensionContext) => {
		const revision = generation;
		const next = await loadConfig(
			getAgentDir(),
			ctx.cwd,
			ctx.isProjectTrusted(),
		);
		if (revision !== generation) return next;
		config = next;
		for (const diagnostic of next.diagnostics) log(ctx, diagnostic, "error");
		return next;
	};
	const context = (
		ctx: ExtensionContext,
		stage: "agent" | "request",
		options: unknown,
	): PipelineContext => ({
		provider: ctx.model?.provider ?? "",
		model: ctx.model?.id ?? "",
		cwd: ctx.cwd,
		stage,
		customPrompt,
		options,
		extensions: pi
			.getCommands()
			.filter((c) => c.source === "extension")
			.flatMap((c) => [
				c.sourceInfo.path,
				c.sourceInfo.source,
				...(c.sourceInfo.baseDir ? [c.sourceInfo.baseDir] : []),
			]),
	});
	const exportParts = async (
		ctx: ExtensionContext,
		cfg: LoadedConfig,
		stage: "agent" | "request",
		sides: Side[],
		before: PromptPart[],
		after: PromptPart[],
	) => {
		if (!sides.length) return;
		const result = await capture.write(
			cfg.export.directory,
			stage,
			sides,
			before,
			after,
			{ provider: ctx.model?.provider ?? "", model: ctx.model?.id ?? "" },
		);
		for (const path of result.paths) output(ctx, `Saved ${path}`);
		if (result.failed)
			output(
				ctx,
				"Export failed; any listed successful files may be a partial pair. Reservation consumed.",
				"error",
			);
	};
	const update = async (ctx: ExtensionContext, key: string, value: unknown) => {
		const cfg = config ?? (await reload(ctx));
		const raw = await readConfig(cfg.globalPath);
		let next: Config;
		if (key === "logging")
			next = { ...raw, logging: value as Config["logging"] };
		else if (key === "antigravityCompat")
			next = { ...raw, antigravityCompat: value === true || value === "true" };
		else {
			const points = new Set<Point>(raw.export?.points ?? cfg.export.points);
			if (value === "true") points.add(key as Point);
			else points.delete(key as Point);
			next = { ...raw, export: { ...raw.export, points: [...points] } };
		}
		await saveConfig(cfg.globalPath, next);
		await reload(ctx);
	};
	const open = async (ctx: ExtensionContext) => {
		if (ctx.mode !== "tui") {
			output(ctx, JSON.stringify(config ?? (await reload(ctx)), null, 2));
			return;
		}
		for (;;) {
			const cfg = await reload(ctx);
			const choice = await settingsPanel(ctx, pi.events, cfg, capture.status);
			if (!choice) return;
			try {
				await update(ctx, choice.id, choice.value);
			} catch {
				output(
					ctx,
					"Could not save settings; inspect configuration permissions/schema.",
					"error",
				);
				return;
			}
		}
	};
	const stop = () => {
		generation++;
		capture.clear();
		customPrompt = undefined;
		config = undefined;
		unsubscribe?.();
		unsubscribe = undefined;
	};
	pi.on("session_shutdown", stop);
	pi.on("session_start", async (_event, ctx) => {
		stop();
		const revision = generation;
		await reload(ctx);
		if (revision !== generation) return;
		unsubscribe = pi.events.on(DISCOVER_EVENT, (payload) =>
			registerDiscovery(payload, {
				id: "pi-prompt-pipeline",
				title: "Prompt Pipeline",
				command: "/prompt-pipeline config",
				getSummary: () =>
					`rules=${config?.rules.length ?? 0}; pending=${capture.status}`,
				open,
			}),
		);
	});
	pi.on("before_agent_start", async (event, ctx) => {
		const revision = generation;
		// Consume before any asynchronous I/O; a later command can arm a distinct next event.
		const reserved = capture.take("agent", []);
		const cfg = await reload(ctx);
		if (revision !== generation) return;
		const sides = [...new Set([...reserved, ...capturePoints(cfg, "agent")])];
		customPrompt = event.systemPromptOptions.customPrompt !== undefined;
		const before = [{ text: event.systemPrompt }];
		const result = await runPipeline(
			before,
			cfg.rules,
			context(ctx, "agent", event.systemPromptOptions),
		);
		if (revision !== generation) return;
		if (result.failures.length)
			log(
				ctx,
				`Rules failed and were rolled back: ${result.failures.join(", ")}`,
				"error",
			);
		await exportParts(ctx, cfg, "agent", sides, before, result.parts);
		if (revision !== generation) return;
		if (result.parts[0].text !== event.systemPrompt)
			return { systemPrompt: result.parts[0].text };
	});
	pi.on("before_provider_request", async (event, ctx) => {
		const revision = generation;
		const reserved = capture.take("request", []);
		const cfg = await reload(ctx);
		if (revision !== generation) return;
		const sides = [...new Set([...reserved, ...capturePoints(cfg, "request")])];
		const view = extractAntigravity(event.payload, ctx.model?.provider ?? "");
		if (!view) {
			if (sides.length)
				output(
					ctx,
					"Unsupported request prompt format/provider; no capture saved. Reservation consumed.",
					"error",
				);
			else if (cfg.rules.some((r) => r.stage === "request"))
				log(
					ctx,
					"Unsupported request prompt format/provider; unchanged.",
					"info",
				);
			return;
		}
		const result = await runPipeline(
			view.parts,
			cfg.rules,
			context(ctx, "request", {}),
		);
		if (revision !== generation) return;
		if (result.failures.length)
			log(
				ctx,
				`Rules failed and were rolled back: ${result.failures.join(", ")}`,
				"error",
			);
		await exportParts(ctx, cfg, "request", sides, view.parts, result.parts);
		if (revision !== generation) return;
		if (result.parts.some((p, i) => p.text !== view.parts[i].text))
			return view.replace(result.parts);
	});
	pi.registerCommand("prompt-pipeline", {
		description:
			"Configure prompt rules or reserve a one-shot system prompt export",
		getArgumentCompletions: completions,
		handler: async (args, ctx) => {
			try {
				const revision = generation;
				await reload(ctx);
				if (revision !== generation) return;
				const cmd = parseCommand(args);
				if (cmd.kind === "export") {
					capture.arm(cmd.stage, cmd.mode);
					output(
						ctx,
						"Armed next " +
							cmd.stage +
							" " +
							cmd.mode +
							" capture (no request sent).",
					);
				} else if (cmd.kind === "cancel") {
					capture.clear();
					output(ctx, "Pending capture cleared.");
				} else if (
					cmd.kind === "config" ||
					(!args.trim() && ctx.mode === "tui")
				)
					await open(ctx);
				else if (cmd.kind === "status")
					output(
						ctx,
						`rules=${config?.rules.length ?? 0}; pending=${capture.status}; observable extension commands only (not a complete loaded-extension inventory).`,
					);
				else if (cmd.kind === "reload") output(ctx, "Configuration reloaded.");
				else if (cmd.kind === "set") {
					await update(ctx, cmd.key, cmd.value);
					output(
						ctx,
						"Global setting saved; project settings may override it.",
					);
				} else if (cmd.kind === "edit") {
					const cfg = config ?? (await reload(ctx));
					const raw = await readConfig(cfg.globalPath);
					const value = await ctx.ui.editor(
						"Prompt Pipeline — global JSON (scripts run with your permissions)",
						JSON.stringify(raw, null, 2),
					);
					if (value !== undefined) {
						await saveConfig(cfg.globalPath, JSON.parse(value));
						await reload(ctx);
						output(ctx, "Global configuration saved.");
					}
				} else output(ctx, usage);
			} catch {
				output(
					ctx,
					"Command failed; check configuration syntax, permissions and arguments.",
					"error",
				);
			}
		},
	});
}
function capturePoints(
	config: LoadedConfig,
	stage: "agent" | "request",
): Side[] {
	return (["before", "after"] as const).filter((side) =>
		config.export.points.includes(`${stage}.${side}`),
	);
}
