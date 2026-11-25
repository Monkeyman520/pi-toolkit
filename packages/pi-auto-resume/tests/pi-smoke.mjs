import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = await mkdtemp(join(tmpdir(), "pi-resume-smoke-"));
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
				"@monkeyman520/pi-auto-resume": `file:${join(root, info.filename).replaceAll("\\", "/")}`,
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
		`isolated production dependencies: ${installed.stderr}`,
	);
	const isolated = join(
		consumer,
		"node_modules",
		..."@monkeyman520/pi-auto-resume".split("/"),
	);
	await writeFile(
		join(root, "pi-auto-resume.json"),
		JSON.stringify({
			retryDelayMs: 400,
			retryBackoffFactor: 1,
			maxAttempts: 2,
		}),
	);
	await writeFile(
		join(root, "fixture.ts"),
		`
 import {createAssistantMessageEventStream} from "@earendil-works/pi-ai";
 import {appendFileSync} from "node:fs";
 let calls=0,always=false,serverOnce=false;
 export default function(pi){
  pi.registerCommand("fixture-error",{description:"fixture",handler:async()=>{always=true;serverOnce=false;}});
  pi.registerCommand("fixture-server-once",{description:"fixture",handler:async()=>{always=false;serverOnce=true;}});
  pi.registerProvider("resume-fixture",{baseUrl:"https://example.invalid",apiKey:"fixture",api:"resume-fixture-api",
   models:[{id:"test",name:"Fixture",reasoning:false,input:["text"],cost:{input:0,output:0,cacheRead:0,cacheWrite:0},contextWindow:100000,maxTokens:100}],
   streamSimple(model){
    const stream=createAssistantMessageEventStream();calls++;
    appendFileSync(process.env.SMOKE_METRICS,JSON.stringify({calls})+"\\n");
    const isServer=serverOnce;
    if(serverOnce) serverOnce=false;
    const fail=always||calls===1||isServer;
    const errMsg=isServer?"overloaded_error":"fetch failed";
    const message={role:"assistant",api:model.api,provider:model.provider,model:model.id,content:fail?[]:[{type:"text",text:"done"}],usage:{input:0,output:0,cacheRead:0,cacheWrite:0,totalTokens:0,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}},stopReason:fail?"error":"stop",errorMessage:fail?errMsg:undefined,timestamp:Date.now()};
    queueMicrotask(()=>{stream.push(fail?{type:"error",reason:"error",error:message}:{type:"done",reason:"stop",message});stream.end(message);});
    return stream;
   }
  });
 }
 `,
	);
	const events = [];
	let stdout = "",
		stderr = "";
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
	const until = async (test) => {
		const deadline = Date.now() + 20000;
		while (!test()) {
			if (Date.now() > deadline)
				throw Error(`Pi smoke timeout: ${stderr.slice(-2000)}`);
			await pause(25);
		}
	};
	let id = 0;
	const command = async (type, data = {}) => {
		const key = String(++id);
		child.stdin.write(`${JSON.stringify({ id: key, type, ...data })}\n`);
		await until(() =>
			events.some((e) => e.id === key && e.type === "response"),
		);
		const response = events.find((e) => e.id === key && e.type === "response");
		assert.equal(response.success, true, JSON.stringify(response));
		return response.data;
	};
	await command("get_commands");
	await command("set_model", { provider: "resume-fixture", modelId: "test" });
	await command("set_auto_retry", { enabled: false });
	await command("prompt", { message: "original task" });
	await until(
		() =>
			events.filter(
				(e) => e.type === "message_end" && e.message?.role === "assistant",
			).length >= 2,
	);
	await pause(800);
	let metrics = (await readFile(join(root, "metrics.jsonl"), "utf8"))
		.trim()
		.split("\n");
	assert.equal(
		metrics.length,
		2,
		"one network recovery; no continuation after success",
	);
	const messages = await command("get_messages");
	assert.ok(JSON.stringify(messages).includes("Continue the interrupted task"));
	await command("prompt", { message: "/fixture-error" });
	const start = events.length;
	await command("prompt", { message: "cancel this interrupted task" });
	await until(() =>
		events.slice(start).some((e) => e.type === "agent_settled"),
	);
	await command("prompt", { message: "/auto-resume stop" });
	await pause(1200);
	metrics = (await readFile(join(root, "metrics.jsonl"), "utf8"))
		.trim()
		.split("\n");
	assert.equal(
		metrics.length,
		3,
		"explicit stop cancels pending idle recovery",
	);
	await command("prompt", { message: "bounded failure" });
	await until(
		() =>
			events.filter(
				(e) => e.type === "message_end" && e.message?.role === "assistant",
			).length >= 6,
	);
	await pause(1000);
	metrics = (await readFile(join(root, "metrics.jsonl"), "utf8"))
		.trim()
		.split("\n");
	assert.equal(metrics.length, 6, "maxAttempts bounds repeated errors");
	const cfgStart = events.length;
	await command("prompt", { message: "/auto-resume config maxAttempts 4" });
	await until(() =>
		events
			.slice(cfgStart)
			.some(
				(e) =>
					e.type === "extension_ui_request" &&
					String(e.message).includes("Updated maxAttempts=4"),
			),
	);
	const persistedCfg = JSON.parse(
		await readFile(join(root, "pi-auto-resume.json"), "utf8"),
	);
	assert.equal(
		persistedCfg.maxAttempts,
		4,
		"/auto-resume config persists setting",
	);

	// Enhanced verification: server recovery + dynamic resumePromptFile + stopFile sentinel
	const promptFile = join(root, "resume-prompt.txt");
	const stopFile = join(root, "STOP_SENTINEL");
	await writeFile(
		promptFile,
		"Smoke dynamic resume ({cause} #{attempt}/{maxAttempts})",
		"utf8",
	);
	await writeFile(
		join(root, "pi-auto-resume.json"),
		JSON.stringify({
			retryDelayMs: 400,
			retryBackoffFactor: 1,
			maxAttempts: 4,
			resumePromptFile: promptFile,
			stopFile,
		}),
	);
	await command("prompt", { message: "/auto-resume config reload" });
	await command("prompt", { message: "/fixture-server-once" });
	await command("prompt", { message: "server overload task" });
	await until(
		() =>
			events.filter(
				(e) => e.type === "message_end" && e.message?.role === "assistant",
			).length >= 8,
	);
	await pause(600);
	metrics = (await readFile(join(root, "metrics.jsonl"), "utf8"))
		.trim()
		.split("\n");
	assert.equal(
		metrics.length,
		8,
		"transient server failure recovers once with dynamic prompt file",
	);
	const messagesAfterServer = await command("get_messages");
	assert.ok(
		JSON.stringify(messagesAfterServer).includes(
			"Smoke dynamic resume (server #1/4)",
		),
		"dynamic resumePromptFile placeholders substituted",
	);

	// Sentinel file cancels pending recovery
	await writeFile(stopFile, "halt", "utf8");
	await command("prompt", { message: "/fixture-server-once" });
	const sentinelStart = events.length;
	await command("prompt", { message: "blocked by stopFile" });
	await until(() =>
		events.slice(sentinelStart).some((e) => e.type === "agent_settled"),
	);
	await pause(1200);
	metrics = (await readFile(join(root, "metrics.jsonl"), "utf8"))
		.trim()
		.split("\n");
	assert.equal(
		metrics.length,
		9,
		"stopFile sentinel prevents automatic continuation",
	);

	assert.ok(!stderr.includes("Failed to load extension"), stderr);
	child.stdin.end();
	await Promise.race([
		new Promise((r) => child.once("exit", r)),
		pause(5000).then(() => {
			throw Error("Pi shutdown timeout");
		}),
	]);
	console.log(
		"Pi standalone smoke: network/server recovery, dynamic prompt file, stopFile sentinel, normal completion, stop, bounded retries, clean shutdown PASS",
	);
} finally {
	if (child?.exitCode === null) child.kill("SIGKILL");
	await pause(100);
	await rm(root, { recursive: true, force: true });
}
