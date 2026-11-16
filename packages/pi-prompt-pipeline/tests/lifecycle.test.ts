import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
	ExtensionAPI,
	ExtensionCommandContext,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { afterEach, expect, it, vi } from "vitest";

const env = vi.hoisted(() => ({ agent: "" }));
vi.mock("@earendil-works/pi-coding-agent", () => ({
	getAgentDir: () => env.agent,
}));

import extension from "../extensions/index.ts";

const roots: string[] = [];
afterEach(async () => {
	await Promise.all(
		roots.splice(0).map((p) => rm(p, { recursive: true, force: true })),
	);
});
type Handler = (
	event: Record<string, unknown>,
	ctx: ExtensionContext,
) => unknown;
async function harness(config: object = {}) {
	env.agent = await mkdtemp(join(tmpdir(), "prompt-host-"));
	roots.push(env.agent);
	await writeFile(
		join(env.agent, "prompt-pipeline.json"),
		JSON.stringify(config),
	);
	const hooks = new Map<string, Handler>();
	let command: Parameters<ExtensionAPI["registerCommand"]>[1] | undefined;
	const listeners = new Set<(payload: unknown) => void>(),
		notices: string[] = [];
	const pi = {
		on: (name: string, handler: Handler) => hooks.set(name, handler),
		registerCommand: (_name: string, value: typeof command) => {
			command = value;
		},
		getCommands: () => [
			{
				source: "extension",
				sourceInfo: {
					path: "/plugin/other",
					source: "npm:other",
					baseDir: "/plugin",
				},
			},
		],
		events: {
			on: (_event: string, listener: (payload: unknown) => void) => {
				listeners.add(listener);
				return () => listeners.delete(listener);
			},
			emit: (_event: string, payload: unknown) => {
				for (const l of listeners) l(payload);
			},
		},
	} as unknown as ExtensionAPI;
	const ctx = {
		mode: "rpc",
		cwd: env.agent,
		model: { id: "gemini-test", provider: "antigravity" },
		isProjectTrusted: () => false,
		ui: { notify: (message: string) => notices.push(message) },
	} as unknown as ExtensionContext;
	extension(pi);
	await hooks.get("session_start")?.({}, ctx);
	return {
		hooks,
		ctx,
		pi,
		notices,
		dir: env.agent,
		run: async (args: string) =>
			command?.handler(args, ctx as ExtensionCommandContext),
	};
}
const event = { systemPrompt: "head<docs>x</docs>", systemPromptOptions: {} };
const rules = [
	{
		id: "r",
		stage: "agent",
		targets: ["intro"],
		actions: [{ type: "append", text: "-changed" }],
	},
];
it("one-shot before-only exports original while transformations still execute", async () => {
	const h = await harness({ rules });
	await h.run("export agent before");
	expect(h.notices.at(-1)).toContain("no request sent");
	expect(await h.hooks.get("before_agent_start")?.(event, h.ctx)).toEqual({
		systemPrompt: "head-changed<docs>x</docs>",
	});
	const files = await readdir(join(h.dir, "prompt-exports"));
	expect(files).toHaveLength(1);
	const snap = JSON.parse(
		await readFile(join(h.dir, "prompt-exports", files[0]), "utf8"),
	);
	expect(snap.side).toBe("before");
	expect(snap.parts[0].text).toBe(event.systemPrompt);
	await h.hooks.get("before_agent_start")?.(event, h.ctx);
	expect(await readdir(join(h.dir, "prompt-exports"))).toHaveLength(1);
});
it("consumes an unsupported event without retry; lifecycle clears reservations/discovery", async () => {
	const h = await harness();
	await h.run("export request both");
	await h.hooks.get("before_provider_request")?.({ payload: {} }, h.ctx);
	expect(h.notices.at(-1)).toContain("Unsupported");
	await h.run("status");
	expect(h.notices.at(-1)).toContain("pending=none");
	await h.run("export agent both");
	await h.hooks.get("session_shutdown")?.({}, h.ctx);
	await h.hooks.get("session_start")?.({}, h.ctx);
	await h.run("status");
	expect(h.notices.at(-1)).toContain("pending=none");
	const found: unknown[] = [];
	h.pi.events.emit("pi-packages:ui:discover", {
		register: (p: unknown) => found.push(p),
	});
	expect(found).toHaveLength(1);
	await h.hooks.get("session_shutdown")?.({}, h.ctx);
	h.pi.events.emit("pi-packages:ui:discover", {
		register: (p: unknown) => found.push(p),
	});
	expect(found).toHaveLength(1);
});
it("request rules retain custom-prompt selection and preserve user text", async () => {
	const h = await harness({
		rules: [
			{
				id: "r",
				stage: "request",
				when: { customPrompt: false },
				targets: ["all"],
				actions: [{ type: "append", text: "!" }],
			},
		],
	});
	await h.hooks.get("before_agent_start")?.(event, h.ctx);
	const payload = {
		request: {
			systemInstruction: { parts: [{ text: "head" }] },
			contents: [{ text: "head" }],
		},
	};
	expect(
		await h.hooks.get("before_provider_request")?.({ payload }, h.ctx),
	).toEqual({
		request: {
			...payload.request,
			systemInstruction: { parts: [{ text: "head!" }] },
		},
	});
	await h.hooks.get("before_agent_start")?.(
		{ ...event, systemPromptOptions: { customPrompt: "custom" } },
		h.ctx,
	);
	expect(
		await h.hooks.get("before_provider_request")?.({ payload }, h.ctx),
	).toBeUndefined();
});
it("logging silent does not leak script exceptions to routine notifications", async () => {
	const h = await harness({
		logging: "silent",
		rules: [
			{
				id: "bad",
				stage: "agent",
				targets: ["all"],
				actions: [{ type: "regex", pattern: "[", replace: "private" }],
			},
		],
	});
	expect(
		await h.hooks.get("before_agent_start")?.(event, h.ctx),
	).toBeUndefined();
	expect(h.notices).toEqual([]);
});
it("does not export or return stale async script output after shutdown", async () => {
	const globals = globalThis as unknown as {
		promptStarted?: () => void;
		promptGate?: Promise<void>;
	};
	let release: () => void = () => {};
	const started = new Promise<void>((resolve) => {
		globals.promptStarted = resolve;
	});
	globals.promptGate = new Promise<void>((resolve) => {
		release = resolve;
	});
	const h = await harness({
		rules: [
			{
				id: "slow",
				stage: "agent",
				targets: ["all"],
				actions: [{ type: "script", path: "slow.mjs" }],
			},
		],
	});
	await writeFile(
		join(h.dir, "slow.mjs"),
		'export default async text=>{globalThis.promptStarted();await globalThis.promptGate;return text+"late";};',
	);
	try {
		await h.run("export agent both");
		const pending = h.hooks.get("before_agent_start")?.(event, h.ctx);
		await started;
		await h.hooks.get("session_shutdown")?.({}, h.ctx);
		release();
		expect(await pending).toBeUndefined();
		await expect(readdir(join(h.dir, "prompt-exports"))).rejects.toMatchObject({
			code: "ENOENT",
		});
	} finally {
		release();
		delete globals.promptStarted;
		delete globals.promptGate;
	}
});
it("persistent selections export all four sides, including a rolled-back agent rule", async () => {
	const h = await harness({
		export: {
			points: [
				"agent.before",
				"agent.after",
				"request.before",
				"request.after",
			],
		},
		rules: [
			{
				id: "bad-agent",
				stage: "agent",
				targets: ["all"],
				actions: [
					{ type: "append", text: "lost" },
					{ type: "regex", pattern: "[", replace: "bad" },
				],
			},
			{
				id: "request",
				stage: "request",
				targets: ["all"],
				actions: [{ type: "append", text: "!" }],
			},
		],
	});
	expect(
		await h.hooks.get("before_agent_start")?.(event, h.ctx),
	).toBeUndefined();
	await h.hooks.get("before_provider_request")?.(
		{
			payload: {
				request: { systemInstruction: { parts: [{ text: "request" }] } },
			},
		},
		h.ctx,
	);
	const directory = join(h.dir, "prompt-exports");
	const snapshots = await Promise.all(
		(await readdir(directory)).map(async (name) =>
			JSON.parse(await readFile(join(directory, name), "utf8")),
		),
	);
	expect(snapshots).toHaveLength(4);
	expect(
		snapshots.filter((s) => s.stage === "agent").map((s) => s.parts[0].text),
	).toEqual([event.systemPrompt, event.systemPrompt]);
	expect(
		snapshots.find((s) => s.stage === "request" && s.side === "before").parts[0]
			.text,
	).toBe("request");
	expect(
		snapshots.find((s) => s.stage === "request" && s.side === "after").parts[0]
			.text,
	).toBe("request!");
});
