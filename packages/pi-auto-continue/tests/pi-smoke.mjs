import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = await mkdtemp(join(tmpdir(), "pi-auto-continue-smoke-"));
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
let child;

try {
	const npmCli =
		(process.env.npm_execpath?.endsWith(".js")
			? process.env.npm_execpath
			: undefined) ??
		join(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");

	const packed = spawnSync(
		process.execPath,
		[npmCli, "pack", "--ignore-scripts", "--json", "--pack-destination", root],
		{ cwd: packageRoot, encoding: "utf8", windowsHide: true, timeout: 30000 },
	);
	assert.equal(packed.status, 0, `npm pack failed: ${packed.stderr}`);
	const info = JSON.parse(packed.stdout)[0];
	assert.equal(
		info.bundled?.length ?? 0,
		0,
		"no bundledDependencies; support library is inlined",
	);
	assert.ok(
		info.files.some((f) => f.path === "dist/index.js"),
		"built dist/index.js must be packed",
	);
	assert.ok(
		info.files.some((f) => f.path === "dist/LICENSE"),
		"dist/LICENSE must be packed",
	);
	assert.ok(
		info.files.some((f) => f.path === "dist/CHANGELOG.md"),
		"dist/CHANGELOG.md must be packed",
	);
	assert.ok(
		!info.files.some(
			(f) => f.path.startsWith("vendor/") || f.path.startsWith("node_modules/"),
		),
		"no vendor/ or node_modules/ in tarball",
	);

	const consumer = join(root, "consumer");
	await mkdir(consumer, { recursive: true });
	await writeFile(
		join(consumer, "package.json"),
		JSON.stringify({
			private: true,
			dependencies: {
				"pi-auto-continue": `file:${join(root, info.filename).replaceAll("\\", "/")}`,
			},
		}),
	);
	const installed = spawnSync(
		process.execPath,
		[
			npmCli,
			"install",
			"--omit=dev",
			"--ignore-scripts",
			"--legacy-peer-deps",
			"--offline",
			"--no-audit",
		],
		{ cwd: consumer, encoding: "utf8", windowsHide: true, timeout: 60000 },
	);
	assert.equal(
		installed.status,
		0,
		`isolated production dependencies install failed: ${installed.stderr}`,
	);
	const isolated = join(consumer, "node_modules", "pi-auto-continue");

	// Global defaults: fast quotaDelayMs for deterministic smoke testing
	await writeFile(
		join(root, "pi-auto-continue.json"),
		JSON.stringify({
			delayMs: 300,
			quotaDelayMs: 200,
		}),
	);

	// Helper scripts for promptPipe and stopCommand
	const pipeScript = join(root, "pipe.mjs");
	await writeFile(
		pipeScript,
		`console.log("analysis\\n<continue>ignored draft</continue>\\nmore notes\\n<continue>Extracted final round " + process.env.PI_AUTO_CONTINUE_ROUND + "</continue>");\n`,
		"utf8",
	);
	const stopZeroScript = join(root, "stop-zero.mjs");
	await writeFile(
		stopZeroScript,
		`console.log("checking stop hook");\nconsole.log("0");\n`,
		"utf8",
	);

	// Offline synthetic provider fixture
	await writeFile(
		join(root, "fixture.ts"),
		`
import { createAssistantMessageEventStream } from "@earendil-works/pi-ai";
import { appendFileSync } from "node:fs";
let calls = 0;
let mode = "ok";
export default function (pi) {
	pi.registerCommand("fixture-error-once", {
		description: "fail next turn with generic error",
		handler: async () => { mode = "error-once"; },
	});
	pi.registerCommand("fixture-quota-once", {
		description: "fail next turn with quota exhaustion and resets_at",
		handler: async () => { mode = "quota-once"; },
	});
	pi.registerProvider("continue-fixture", {
		baseUrl: "https://example.invalid",
		apiKey: "fixture",
		api: "continue-fixture-api",
		models: [{
			id: "test",
			name: "Fixture",
			reasoning: false,
			input: ["text"],
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
			contextWindow: 100000,
			maxTokens: 100,
		}],
		streamSimple(model) {
			const stream = createAssistantMessageEventStream();
			calls++;
			const currentMode = mode;
			if (mode !== "ok") mode = "ok";
			const fail = currentMode === "error-once" || currentMode === "quota-once";
			const errMsg =
				currentMode === "quota-once"
					? 'subscription quota exhausted {"resets_at": ' + (Date.now() + 500) + "}"
					: "fetch failed";
			appendFileSync(
				process.env.SMOKE_METRICS,
				JSON.stringify({ calls, currentMode }) + "\\n",
			);
			const message = {
				role: "assistant",
				api: model.api,
				provider: model.provider,
				model: model.id,
				content: fail ? [] : [{ type: "text", text: "ok #" + calls }],
				usage: {
					input: 0,
					output: 0,
					cacheRead: 0,
					cacheWrite: 0,
					totalTokens: 0,
					cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
				},
				stopReason: fail ? "error" : "stop",
				errorMessage: fail ? errMsg : undefined,
				timestamp: Date.now(),
			};
			queueMicrotask(() => {
				stream.push(
					fail
						? { type: "error", reason: "error", error: message }
						: { type: "done", reason: "stop", message },
				);
				stream.end(message);
			});
			return stream;
		},
	});
}
`,
	);

	const events = [];
	let stdout = "";
	let stderr = "";
	child = spawn(
		process.env.PI_BINARY ?? "pi",
		[
			"--mode",
			"rpc",
			"--no-session",
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
			cwd: root,
			env: {
				...process.env,
				PI_CODING_AGENT_DIR: root,
				PI_OFFLINE: "1",
				SMOKE_METRICS: join(root, "metrics.jsonl"),
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
		const deadline = Date.now() + 25000;
		while (!test()) {
			if (Date.now() > deadline) {
				throw new Error(
					`Pi smoke timeout waiting for ${label}: ${stderr.slice(-2000)}`,
				);
			}
			await pause(25);
		}
	};

	const readCallCount = async () => {
		try {
			const text = (await readFile(join(root, "metrics.jsonl"), "utf8")).trim();
			return text ? text.split("\n").length : 0;
		} catch {
			return 0;
		}
	};

	const assistantCount = () =>
		events.filter(
			(e) => e.type === "message_end" && e.message?.role === "assistant",
		).length;

	let id = 0;
	const command = async (type, data = {}) => {
		const key = String(++id);
		child.stdin.write(`${JSON.stringify({ id: key, type, ...data })}\n`);
		await until(
			() => events.some((e) => e.id === key && e.type === "response"),
			`rpc response ${type}`,
		);
		const response = events.find((e) => e.id === key && e.type === "response");
		assert.equal(response.success, true, JSON.stringify(response));
		return response.data;
	};

	await command("get_commands");
	await command("set_model", { provider: "continue-fixture", modelId: "test" });
	await command("set_auto_retry", { enabled: false });

	// 1. Fresh session starts disarmed: normal completion triggers 0 extra calls
	await command("prompt", { message: "initial disarmed turn" });
	await until(() => assistantCount() >= 1, "turn 1");
	await pause(800);
	assert.equal(
		await readCallCount(),
		1,
		"disarmed default must not auto-continue after normal completion",
	);

	// 2. Continuation queue FIFO + immediate queue send + queueEmptyPolicy="stop"
	await command("prompt", {
		message: "/auto-continue queue add Queued Step 1",
	});
	await command("prompt", {
		message: "/auto-continue queue add Queued Step 2",
	});
	await command("prompt", { message: "/auto-continue queue send" });
	await until(() => assistantCount() >= 2, "immediate queue send step 1");
	await command("prompt", { message: "/auto-continue start --delay 300" });
	await until(() => assistantCount() >= 3, "queued step 2 auto-dispatch");
	await pause(800);
	assert.equal(
		await readCallCount(),
		3,
		"queueEmptyPolicy=stop must disarm cleanly after draining queue",
	);
	const msgsAfterQueue = JSON.stringify(await command("get_messages"));
	assert.ok(msgsAfterQueue.includes("Queued Step 1"));
	assert.ok(msgsAfterQueue.includes("Queued Step 2"));

	// 3. Explicit start with Prompt Pipe + last-match format extraction + maxRounds=2
	const pipeCmd = `"${process.execPath}" "${pipeScript}"`.replaceAll(
		'"',
		'\\"',
	);
	await command("prompt", {
		message: `/auto-continue start --rounds 2 --delay 300 --prompt-pipe "${pipeCmd}" --format "<continue>" "</continue>"`,
	});
	await command("prompt", { message: "seed turn for prompt pipe" });
	// seed turn (#4) + round 1 (#5) + round 2 (#6) -> stops at round limit
	await until(() => assistantCount() >= 6, "prompt pipe 2 rounds");
	await pause(800);
	assert.equal(
		await readCallCount(),
		6,
		"promptPipe + maxRounds=2 must stop after exactly 2 continuation rounds",
	);
	const msgsAfterPipe = JSON.stringify(await command("get_messages"));
	assert.ok(msgsAfterPipe.includes("Extracted final round 1"));
	assert.ok(msgsAfterPipe.includes("Extracted final round 2"));
	assert.ok(!msgsAfterPipe.includes("ignored draft"));

	// 4. One-shot stopCommand returning "0" halts continuation cleanly
	const stopCmd = `"${process.execPath}" "${stopZeroScript}"`.replaceAll(
		'"',
		'\\"',
	);
	await command("prompt", {
		message: `/auto-continue start --rounds 5 --delay 300 --stop-cmd "${stopCmd}"`,
	});
	await command("prompt", { message: "turn blocked by stopCommand" });
	await until(() => assistantCount() >= 7, "seed turn for stopCommand");
	await pause(1200);
	assert.equal(
		await readCallCount(),
		7,
		"stopCommand returning '0' must halt before sending any continuation",
	);

	// 5a. Orthogonal onError="defer": error turn does not trigger continuation,
	// subsequent normal completion resumes continuation, and /auto-continue stop preserves queue.
	await command("prompt", {
		message:
			'/auto-continue start --rounds 2 --delay 300 --on-error defer --prompt "Deferred follow-up"',
	});
	await command("prompt", { message: "/fixture-error-once" });
	await command("prompt", { message: "turn that fails once" });
	await until(() => assistantCount() >= 8, "deferred error turn");
	await pause(800);
	assert.equal(
		await readCallCount(),
		8,
		"onError=defer must not emit duplicate retry on error turn",
	);
	await command("prompt", { message: "recovered normal turn" });
	// recovered turn (#9) -> auto-continues once (#10) -> then /auto-continue stop
	await until(() => assistantCount() >= 10, "resumed normal continuation");
	await command("prompt", {
		message: "/auto-continue queue add Keep After Stop",
	});
	await command("prompt", { message: "/auto-continue stop" });
	await pause(700);
	assert.equal(await readCallCount(), 10, "/auto-continue stop disarms loop");

	// Verify queue preserved across /auto-continue stop, then clear for quota-wait check
	const listStart = events.length;
	await command("prompt", { message: "/auto-continue queue list" });
	await until(
		() =>
			events
				.slice(listStart)
				.some(
					(e) =>
						e.type === "extension_ui_request" &&
						String(e.message).includes("Keep After Stop"),
				),
		"queue preserved after stop",
	);
	await command("prompt", { message: "/auto-continue queue clear" });

	// 5b. Standalone onError="wait-quota": queued item dispatches after resets_at + quotaDelayMs
	await command("prompt", {
		message:
			"/auto-continue start --rounds 2 --delay 300 --on-error wait-quota",
	});
	await command("prompt", {
		message: "/auto-continue queue add After Quota Reset",
	});
	await command("prompt", { message: "/fixture-quota-once" });
	await command("prompt", { message: "hits quota wall" });
	// Turn #11 fails with quota resets_at (+500ms) -> waits ~700ms -> dispatches queued item (#12)
	await until(() => assistantCount() >= 12, "quota-wait queued dispatch");
	await pause(700);
	assert.equal(
		await readCallCount(),
		12,
		"wait-quota dispatches queued item after reset and stops when queue completes",
	);
	const finalMessages = JSON.stringify(await command("get_messages"));
	assert.ok(finalMessages.includes("After Quota Reset"));

	assert.ok(!stderr.includes("Failed to load extension"), stderr);
	child.stdin.end();
	await Promise.race([
		new Promise((r) => child.once("exit", r)),
		pause(5000).then(() => {
			throw new Error("Pi shutdown timeout");
		}),
	]);
	console.log(
		"Pi auto-continue standalone smoke: disarmed default, queue FIFO + immediate send, promptPipe format extraction + maxRounds, stopCommand halt, onError defer + wait-quota, clean shutdown PASS",
	);
} finally {
	if (child?.exitCode === null) child.kill("SIGKILL");
	await pause(100);
	await rm(root, { recursive: true, force: true });
}
