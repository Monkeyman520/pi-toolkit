import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = await mkdtemp(join(tmpdir(), "pi-resume-smoke-"));
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
let child;
try {
	const isolated = join(root, "plugin");
	await cp(packageRoot, isolated, {
		recursive: true,
		filter: (p) => !p.includes("node_modules") && !p.includes("tests"),
	});
	const npmCli =
		process.env.npm_execpath ??
		join(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
	const installed = spawnSync(
		process.execPath,
		[
			npmCli,
			"ci",
			"--omit=dev",
			"--ignore-scripts",
			"--legacy-peer-deps",
			"--offline",
			"--no-audit",
		],
		{ cwd: isolated, encoding: "utf8", windowsHide: true, timeout: 30000 },
	);
	assert.equal(
		installed.status,
		0,
		`isolated production dependencies: ${installed.stderr}`,
	);
	await writeFile(
		join(root, "pi-auto-resume.json"),
		JSON.stringify({ retryDelayMs: 400, maxAttempts: 2 }),
	);
	await writeFile(
		join(root, "fixture.ts"),
		`
 import {createAssistantMessageEventStream} from "@earendil-works/pi-ai";
 import {appendFileSync} from "node:fs";
 let calls=0,always=false;
 export default function(pi){
  pi.registerCommand("fixture-error",{description:"fixture",handler:async()=>{always=true;}});
  pi.registerProvider("resume-fixture",{baseUrl:"https://example.invalid",apiKey:"fixture",api:"resume-fixture-api",
   models:[{id:"test",name:"Fixture",reasoning:false,input:["text"],cost:{input:0,output:0,cacheRead:0,cacheWrite:0},contextWindow:100000,maxTokens:100}],
   streamSimple(model){
    const stream=createAssistantMessageEventStream();calls++;
    appendFileSync(process.env.SMOKE_METRICS,JSON.stringify({calls})+"\\n");
    const fail=always||calls===1;
    const message={role:"assistant",api:model.api,provider:model.provider,model:model.id,content:fail?[]:[{type:"text",text:"done"}],usage:{input:0,output:0,cacheRead:0,cacheWrite:0,totalTokens:0,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}},stopReason:fail?"error":"stop",errorMessage:fail?"fetch failed":undefined,timestamp:Date.now()};
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
	assert.ok(!stderr.includes("Failed to load extension"), stderr);
	child.stdin.end();
	await Promise.race([
		new Promise((r) => child.once("exit", r)),
		pause(5000).then(() => {
			throw Error("Pi shutdown timeout");
		}),
	]);
	console.log(
		"Pi standalone smoke: network recovery, normal completion, stop, bounded retries, clean shutdown PASS",
	);
} finally {
	if (child?.exitCode === null) child.kill("SIGKILL");
	await pause(100);
	await rm(root, { recursive: true, force: true });
}
