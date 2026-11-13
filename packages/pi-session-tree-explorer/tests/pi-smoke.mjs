import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { SessionManager } from "@earendil-works/pi-coding-agent";

const root = await mkdtemp(join(tmpdir(), "pi-session-tree-smoke-"));
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
			version: "1.0.0",
		}),
		"utf8",
	);

	const seed = SessionManager.create(projectDir, join(root, "fixtures"));
	const first = seed.appendMessage({
		role: "user",
		content: "first prompt",
		timestamp: Date.now(),
	});
	const assistant = () => ({
		role: "assistant",
		content: [{ type: "text", text: "offline answer" }],
		api: "anthropic-messages",
		provider: "anthropic",
		model: "claude-sonnet-4-5",
		usage: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 0,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
		stopReason: "stop",
		timestamp: Date.now(),
	});
	const a1 = seed.appendMessage(assistant());
	const second = seed.appendMessage({
		role: "user",
		content: "second prompt",
		timestamp: Date.now(),
	});
	const a2 = seed.appendMessage(assistant());
	const originalFile = seed.getSessionFile();
	const probe = join(root, "host-probe.ts");
	await writeFile(
		probe,
		`
import assert from "node:assert/strict";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { executeSessionIntent } from ${JSON.stringify(pathToFileURL(join(isolated, "extensions", "session-effects.ts")).href)};
import { getDefaultConfig } from ${JSON.stringify(pathToFileURL(join(isolated, "extensions", "config-schema.ts")).href)};
export default function(pi:ExtensionAPI){
 pi.registerCommand("stree-host-probe",{description:"offline test fixture",handler:async(args,ctx)=>{
  const config=getDefaultConfig();
  if(args==="navigate"){
   const result=await executeSessionIntent({ctx,config,intent:{type:"navigate",entryId:${JSON.stringify(second)}},expectedSessionId:ctx.sessionManager.getSessionId()});
   assert.equal(result.success,true);assert.equal(ctx.sessionManager.getLeafId(),${JSON.stringify(a1)});
   ctx.ui.notify("HOSTPASS navigate","info");return;
  }
  const beforeId=ctx.sessionManager.getSessionId(),beforeFile=ctx.sessionManager.getSessionFile();
  let cleaned=false,observed=false;
  const position=args==="at"?"at":"before";
  const observedCtx={...ctx,fork:(id,opts)=>ctx.fork(id,{...opts,withSession:async fresh=>{
   observed=true;
   assert.notEqual(fresh.sessionManager.getSessionId(),beforeId);
   assert.notEqual(fresh.sessionManager.getSessionFile(),beforeFile);
   assert.ok(fresh.sessionManager.getEntry(${JSON.stringify(first)}));
   assert.equal(!!fresh.sessionManager.getEntry(${JSON.stringify(a2)}),position==="at");
   assert.equal(!!fresh.sessionManager.getEntry(${JSON.stringify(second)}),position==="at");
   await opts?.withSession?.(fresh);
  }})};
  const result=await executeSessionIntent({ctx:observedCtx,config,intent:{type:"fork",entryId:position==="at"?${JSON.stringify(a2)}:${JSON.stringify(second)},position},expectedSessionId:beforeId,onReplacementCleanup:()=>{cleaned=true;}});
  assert.equal(result.success,true);assert.equal(observed,true);assert.equal(cleaned,true);
  // No old context is used after replacement; the outer RPC client observes completion.
 }});
}`,
		"utf8",
	);

	const events = [];
	let stdout = "";
	let stderr = "";
	const piBinary = process.env.PI_BINARY ?? "pi";

	child = spawn(
		piBinary,
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
			probe,
			"--session",
			originalFile,
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
	assert.ok(cmdNames.includes("stree"), "registers /stree command");

	const promptStart = events.length;
	await command("prompt", { message: "/stree" });
	await until(
		() =>
			events
				.slice(promptStart)
				.some(
					(e) =>
						e.type === "extension_ui_request" &&
						e.method === "notify" &&
						String(e.message).includes(
							"Session Tree Explorer requires an interactive TUI session.",
						),
				),
		"/stree notification in non-TUI mode",
	);

	// Test /stree config in non-TUI mode
	const configStart = events.length;
	await command("prompt", { message: "/stree config" });
	await until(
		() =>
			events
				.slice(configStart)
				.some(
					(e) =>
						e.type === "extension_ui_request" &&
						e.method === "notify" &&
						String(e.message).includes("Session Tree Configuration:"),
				),
		"/stree config notification in non-TUI mode",
	);

	// Test /stree config reload
	const reloadStart = events.length;
	await command("prompt", { message: "/stree config reload" });
	await until(
		() =>
			events
				.slice(reloadStart)
				.some(
					(e) =>
						e.type === "extension_ui_request" &&
						e.method === "notify" &&
						String(e.message).includes("reloaded successfully"),
				),
		"/stree config reload notification",
	);

	const baselineSession = await readFile(originalFile, "utf8");
	const navStart = events.length;
	await command("prompt", { message: "/stree-host-probe navigate" });
	await until(
		() =>
			events
				.slice(navStart)
				.some(
					(e) => e.method === "notify" && e.message === "HOSTPASS navigate",
				),
		"native Navigate",
	);
	// Pi 1.5.0 RPC command actions omit TUI editor restoration; physical TUI evidence is separate.
	for (const position of ["at", "before"]) {
		const start = events.length;
		await command("prompt", { message: `/stree-host-probe ${position}` });
		await until(
			() =>
				events
					.slice(start)
					.some(
						(e) =>
							e.method === "notify" &&
							String(e.message).includes("Created and switched to independent"),
					),
			`native Fork ${position}`,
		);
		// Pi 1.5.0 RPC command actions omit TUI editor restoration; physical TUI evidence is separate.
	}
	assert.equal(
		await readFile(originalFile, "utf8"),
		baselineSession,
		"native operations preserve original history bytes",
	);
	assert.ok(
		!events.some(
			(e) => e.type === "message_start" && e.message?.role === "assistant",
		),
		"no model turn is auto-sent",
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
		"PASS: isolated Pi RPC, commands, native Navigate/Fork At/Before, replacement identity and original file preservation (not TUI editor evidence)",
	);
} finally {
	if (child?.exitCode === null) child.kill("SIGKILL");
	await pause(100);
	await rm(root, { recursive: true, force: true });
}
