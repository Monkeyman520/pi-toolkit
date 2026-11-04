import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { cp, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = await mkdtemp(join(tmpdir(), "pi-pretty-session-smoke-"));
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
let child;

try {
	const isolated = join(root, "plugin");
	await cp(packageRoot, isolated, {
		recursive: true,
		filter: (p) => !p.includes("node_modules") && !p.includes("tests"),
	});

	const projectDir = join(root, "workspace");
	await cp(isolated, projectDir, {
		recursive: true,
		filter: () => false,
	}).catch(() => {});
	spawnSync("git", ["init", "-b", "main", projectDir], { windowsHide: true });
	await writeFile(
		join(projectDir, "package.json"),
		JSON.stringify({
			name: "smoke-project",
			version: "1.2.3",
			scripts: {
				dev: "node index.js",
				test: "vitest run",
				typecheck: "tsc --noEmit",
			},
		}),
		"utf8",
	);
	spawnSync(
		"git",
		["-C", projectDir, "config", "user.email", "smoke@example.test"],
		{
			windowsHide: true,
		},
	);
	spawnSync("git", ["-C", projectDir, "config", "user.name", "Smoke Runner"], {
		windowsHide: true,
	});
	spawnSync("git", ["-C", projectDir, "add", "package.json"], {
		windowsHide: true,
	});
	spawnSync(
		"git",
		["-C", projectDir, "commit", "-m", "feat: init smoke project"],
		{
			windowsHide: true,
		},
	);

	await writeFile(
		join(root, "pi-pretty-session.json"),
		JSON.stringify({ updateEveryTurns: 2 }),
		"utf8",
	);

	await writeFile(
		join(root, "fixture.ts"),
		`
import { createAssistantMessageEventStream } from "@earendil-works/pi-ai";
let summaryCounter = 0;
export default function (pi) {
	pi.registerProvider("pretty-fixture", {
		baseUrl: "https://example.invalid",
		apiKey: "fixture",
		api: "pretty-fixture-api",
		models: [
			{
				id: "test",
				name: "Fixture",
				reasoning: false,
				input: ["text"],
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
				contextWindow: 100000,
				maxTokens: 512,
			},
		],
		streamSimple(model, context) {
			const stream = createAssistantMessageEventStream();
			const rawText = JSON.stringify(context.messages ?? []);
			const isSummaryCall = rawText.includes("session title and description generator") || rawText.includes("Conversation:");
			let replyText = "Completed requested task.";
			if (isSummaryCall) {
				summaryCounter++;
				replyText = JSON.stringify({
					title: summaryCounter === 1 ? "Smoke Summarized Title" : "Updated Summary Title #" + summaryCounter,
					description: summaryCounter === 1
						? "Implemented pretty-session smoke test and verified project metadata."
						: "Refreshed description on summary cycle #" + summaryCounter + ".",
				});
			}
			const message = {
				role: "assistant",
				api: model.api,
				provider: model.provider,
				model: model.id,
				content: [{ type: "text", text: replyText }],
				usage: {
					input: 1200,
					output: 300,
					cacheRead: 0,
					cacheWrite: 0,
					totalTokens: 1500,
					cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
				},
				stopReason: "stop",
				timestamp: Date.now(),
			};
			queueMicrotask(() => {
				stream.push({ type: "done", reason: "stop", message });
				stream.end(message);
			});
			return stream;
		},
	});
}
`,
		"utf8",
	);

	const events = [];
	let stdout = "";
	let stderr = "";
	child = spawn(
		process.env.PI_BINARY ?? "pi",
		[
			"--mode",
			"rpc",
			"--no-extensions",
			"--no-mcp",
			"--no-skills",
			"--no-prompt-templates",
			"--no-themes",
			"--no-context-files",
			"--offline",
			"-e",
			isolated,
			"-e",
			join(root, "fixture.ts"),
		],
		{
			cwd: projectDir,
			env: {
				...process.env,
				PI_CODING_AGENT_DIR: root,
				PI_OFFLINE: "1",
			},
			stdio: ["pipe", "pipe", "pipe"],
		},
	);

	child.stdout.on("data", (chunk) => {
		stdout += chunk;
		for (;;) {
			const n = stdout.indexOf("\n");
			if (n < 0) break;
			const line = stdout.slice(0, n);
			stdout = stdout.slice(n + 1);
			try {
				events.push(JSON.parse(line));
			} catch {}
		}
	});
	child.stderr.on("data", (c) => {
		stderr += c;
	});
	child.on("error", (e) => {
		stderr += e.message;
	});

	const until = async (test, label = "condition") => {
		const deadline = Date.now() + 20000;
		while (!test()) {
			if (Date.now() > deadline) {
				throw new Error(
					`Pi smoke timeout waiting for ${label}: ${stderr.slice(-2000)}`,
				);
			}
			await pause(25);
		}
	};

	let id = 0;
	const command = async (type, data = {}) => {
		const key = String(++id);
		child.stdin.write(`${JSON.stringify({ id: key, type, ...data })}\n`);
		await until(
			() => events.some((e) => e.id === key && e.type === "response"),
			`response for ${type}`,
		);
		const response = events.find((e) => e.id === key && e.type === "response");
		assert.equal(response.success, true, JSON.stringify(response));
		return response.data;
	};

	const cmds = await command("get_commands");
	const cmdNames = (cmds.commands ?? []).map((c) => c.name);
	assert.ok(cmdNames.includes("pretty-session"), "registers /pretty-session");
	assert.ok(cmdNames.includes("ps"), "registers /ps alias");

	await command("set_model", { provider: "pretty-fixture", modelId: "test" });

	const turn1Start = events.length;
	await command("prompt", { message: "Set up the pretty-session smoke check" });
	await until(
		() => events.slice(turn1Start).some((e) => e.type === "agent_settled"),
		"turn 1 settled",
	);

	const state1 = await command("get_state");
	assert.equal(
		state1.sessionName,
		"Smoke Summarized Title",
		"automatically renames session with LLM summary title after turn 1",
	);

	const infoStart = events.length;
	await command("prompt", { message: "/ps info" });
	await until(
		() =>
			events
				.slice(infoStart)
				.some(
					(e) =>
						e.type === "extension_ui_request" &&
						e.method === "notify" &&
						String(e.message).includes("Smoke Summarized Title"),
				),
		"/ps info notification",
	);
	const infoNotify = events
		.slice(infoStart)
		.find(
			(e) =>
				e.type === "extension_ui_request" &&
				e.method === "notify" &&
				String(e.message).includes("Smoke Summarized Title"),
		);
	assert.ok(
		infoNotify.message.includes(
			"Implemented pretty-session smoke test and verified project metadata.",
		),
		"dashboard shows generated description",
	);
	assert.ok(infoNotify.message.includes("Start time:"), "shows start time");
	assert.ok(
		infoNotify.message.includes("Last updated:"),
		"shows last update time",
	);
	assert.ok(
		infoNotify.message.includes("Context length:"),
		"shows context length",
	);
	assert.ok(infoNotify.message.includes("smoke-project"), "shows project name");
	assert.ok(
		infoNotify.message.includes("Key scripts: dev, test, typecheck"),
		"shows manifest scripts",
	);

	// Test manual rename lock
	const renameStart = events.length;
	await command("prompt", {
		message: "/ps rename Locked Smoke Title | Custom locked description",
	});
	await until(
		() =>
			events
				.slice(renameStart)
				.some(
					(e) =>
						e.type === "extension_ui_request" &&
						e.method === "notify" &&
						String(e.message).includes("Locked Smoke Title"),
				),
		"/ps rename notification",
	);
	const stateRenamed = await command("get_state");
	assert.equal(stateRenamed.sessionName, "Locked Smoke Title");

	// Test dynamic config hot-reload from disk without restarting Pi
	await writeFile(
		join(root, "pi-pretty-session.json"),
		JSON.stringify({
			updateEveryTurns: 1,
			widgetPlacement: "belowEditor",
		}),
		"utf8",
	);

	const turn2Start = events.length;
	await command("prompt", { message: "Second turn after config hot-reload" });
	await until(
		() => events.slice(turn2Start).some((e) => e.type === "agent_settled"),
		"turn 2 settled",
	);

	const stateAfterTurn2 = await command("get_state");
	assert.equal(
		stateAfterTurn2.sessionName,
		"Locked Smoke Title",
		"manual rename lock protects custom title during dynamic re-summarization",
	);

	const belowWidgetEvent = events
		.slice(turn2Start)
		.find(
			(e) =>
				e.type === "extension_ui_request" &&
				e.method === "setWidget" &&
				e.widgetPlacement === "belowEditor",
		);
	assert.ok(
		belowWidgetEvent,
		"hot-reloaded widgetPlacement=belowEditor applied without restart",
	);

	// Explicit /ps summarize overrides manual lock
	const forceSumStart = events.length;
	await command("prompt", { message: "/ps summarize" });
	await until(
		() =>
			events
				.slice(forceSumStart)
				.some(
					(e) =>
						e.type === "extension_ui_request" &&
						e.method === "notify" &&
						String(e.message).includes("Session summarized"),
				),
		"/ps summarize notification",
	);
	const stateFinal = await command("get_state");
	assert.ok(
		stateFinal.sessionName.startsWith("Updated Summary Title #"),
		"explicit /ps summarize refreshes session title",
	);

	assert.ok(!stderr.includes("Failed to load extension"), stderr);
	child.stdin.end();
	await Promise.race([
		new Promise((r) => child.once("exit", r)),
		pause(5000).then(() => {
			throw new Error("Pi shutdown timeout");
		}),
	]);
	console.log(
		"Pi standalone smoke: auto-rename, title/description summary, dynamic config hot-reload, session metrics, project info PASS",
	);
} finally {
	if (child?.exitCode === null) child.kill("SIGKILL");
	await pause(100);
	await rm(root, { recursive: true, force: true });
}
