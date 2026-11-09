import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { cp, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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

	const events = [];
	let stdout = "";
	let stderr = "";
	const piBinary =
		process.env.PI_BINARY ??
		"C:/Users/Administrator/AppData/Local/mise/installs/pi/1.5.0/pi.exe";

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

	assert.ok(!stderr.includes("Failed to load extension"), stderr);
	child.stdin.end();
	await Promise.race([
		new Promise((r) => child.once("exit", r)),
		pause(5000).then(() => {
			throw new Error("Pi shutdown timeout");
		}),
	]);

	console.log(
		"PASS: Pi standalone smoke - isolated dependencies and /stree registration verified",
	);
} finally {
	if (child?.exitCode === null) child.kill("SIGKILL");
	await pause(100);
	await rm(root, { recursive: true, force: true });
}
