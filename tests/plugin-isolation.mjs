import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { setTimeout as pause } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packages = [
	{ id: "pi-auto-resume", commands: ["auto-resume"] },
	{ id: "pi-pretty-session", commands: ["pretty-session", "ps"] },
	{ id: "pi-quota-keeper", commands: ["quota"] },
];
const npmCli =
	process.env.npm_execpath ??
	join(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");

async function checkCombination(selected) {
	const root = await mkdtemp(join(tmpdir(), "pi-plugin-isolation-"));
	let child;
	let exited;
	try {
		const paths = [];
		for (const plugin of selected) {
			const target = join(root, plugin.id);
			await cp(join(repository, "packages", plugin.id), target, {
				recursive: true,
				filter: (path) =>
					!["node_modules", "tests"].includes(path.split(/[\\/]/).at(-1)),
			});
			paths.push(target);
			if (plugin.id === "pi-quota-keeper") {
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
					{
						cwd: target,
						encoding: "utf8",
						windowsHide: true,
						timeout: 30000,
					},
				);
				assert.equal(
					installed.status,
					0,
					`isolated runtime dependency install: ${installed.stderr}`,
				);
			}
		}
		await writeFile(join(root, "auth.json"), "{}");
		if (selected.some((plugin) => plugin.id === "pi-pretty-session")) {
			await writeFile(
				join(root, "pi-pretty-session.json"),
				JSON.stringify({ useLlm: false }),
			);
		}
		const imports = paths
			.map(
				(path, index) =>
					`import {discoverLoadedPanels as discover${index}} from ${JSON.stringify(join(path, "extensions", "ui.ts"))};`,
			)
			.join("\n");
		await writeFile(
			join(root, "probe.ts"),
			`
import {appendFileSync} from "node:fs";
${imports}
export default function(pi) {
 const collect=()=> {
  const descriptors=[];
  pi.events.emit("pi-packages:ui:discover",{register:descriptor=>descriptors.push(descriptor)});
  return descriptors;
 };
 pi.registerCommand("isolation-probe",{description:"Test-only discovery probe",handler:async(_args,ctx)=>{
  const raw=collect().map(panel=>({id:panel.id,command:panel.command,summary:panel.getSummary(),canOpen:typeof panel.open==="function"}));
  const readers=[${paths.map((_, index) => `discover${index}`).join(",")}].map(discover=>discover(pi.events).map(panel=>panel.id).sort());
  ctx.ui.notify("ISOLATION:"+JSON.stringify({raw,readers}),"info");
 }});
 pi.on("session_shutdown",()=>appendFileSync(process.env.ISOLATION_SHUTDOWN_LOG,JSON.stringify(collect().map(panel=>panel.id))+"\\n"));
}
`,
		);
		const events = [];
		let output = "",
			errors = "";
		let spawnError;
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
				...paths.flatMap((path) => ["-e", path]),
				"-e",
				join(root, "probe.ts"),
			],
			{
				cwd: root,
				env: {
					...process.env,
					PI_CODING_AGENT_DIR: root,
					PI_OFFLINE: "1",
					ISOLATION_SHUTDOWN_LOG: join(root, "shutdown.jsonl"),
				},
				stdio: ["pipe", "pipe", "pipe"],
			},
		);
		exited = new Promise((resolve) =>
			child.once("close", (code, signal) => resolve({ code, signal })),
		);
		child.on("error", (error) => {
			spawnError = error;
		});
		child.stderr.on("data", (chunk) => {
			errors += chunk;
		});
		child.stdout.on("data", (chunk) => {
			output += chunk;
			for (;;) {
				const end = output.indexOf("\n");
				if (end < 0) break;
				const line = output.slice(0, end);
				output = output.slice(end + 1);
				try {
					events.push(JSON.parse(line));
				} catch {}
			}
		});
		async function until(predicate, label) {
			const deadline = Date.now() + 20000;
			while (!predicate()) {
				if (spawnError) throw spawnError;
				if (child.exitCode !== null)
					throw Error(`Pi exited waiting for ${label}: ${errors}`);
				if (Date.now() > deadline)
					throw Error(`Timed out waiting for ${label}: ${errors.slice(-3000)}`);
				await pause(25);
			}
		}
		let id = 0;
		async function command(type, data = {}) {
			const key = String(++id);
			child.stdin.write(`${JSON.stringify({ id: key, type, ...data })}\n`);
			await until(
				() =>
					events.some((event) => event.type === "response" && event.id === key),
				type,
			);
			const response = events.find(
				(event) => event.type === "response" && event.id === key,
			);
			assert.equal(response.success, true, JSON.stringify(response));
			return response.data;
		}
		const expectedIds = selected.map((plugin) => plugin.id).sort();
		const allCommands = packages.flatMap((plugin) => plugin.commands);
		for (let session = 0; session < 3; session++) {
			if (session > 0)
				assert.equal((await command("new_session")).cancelled, false);
			const commands = await command("get_commands");
			assert.deepEqual(
				commands.commands
					.map((item) => item.name)
					.filter((name) => allCommands.includes(name))
					.sort(),
				selected.flatMap((plugin) => plugin.commands).sort(),
			);
			const from = events.length;
			await command("prompt", { message: "/isolation-probe" });
			await until(
				() =>
					events
						.slice(from)
						.some((event) => String(event.message).startsWith("ISOLATION:")),
				"discovery probe",
			);
			const probe = events
				.slice(from)
				.find((event) => String(event.message).startsWith("ISOLATION:"));
			const result = JSON.parse(probe.message.slice("ISOLATION:".length));
			assert.deepEqual(
				result.raw.map((panel) => panel.id).sort(),
				expectedIds,
				"no missing, duplicate or uninstalled registrations",
			);
			for (const panel of result.raw) {
				assert.equal(panel.canOpen, true);
				assert.equal(typeof panel.summary, "string");
				const plugin = selected.find((plugin) => plugin.id === panel.id);
				assert.ok(
					panel.command.includes(`/${plugin.commands[0]}`),
					"descriptor command matches its plugin",
				);
			}
			for (const ids of result.readers)
				assert.deepEqual(
					ids,
					expectedIds,
					"every plugin's local discovery implementation interoperates",
				);
		}
		child.stdin.end();
		let timeout;
		const outcome = await Promise.race([
			exited,
			new Promise((_, reject) => {
				timeout = setTimeout(
					() => reject(Error("Pi shutdown timed out")),
					5000,
				);
			}),
		]).finally(() => clearTimeout(timeout));
		assert.equal(outcome.code, 0, errors);
		assert.ok(!errors.includes("Failed to load extension"), errors);
		const shutdowns = (await readFile(join(root, "shutdown.jsonl"), "utf8"))
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line));
		assert.deepEqual(
			shutdowns,
			[[], [], []],
			"each replaced/exited session removes all plugin-owned discovery listeners",
		);
		console.log(
			`PASS ${expectedIds.join(" + ")}: isolated dependencies, exact commands, interoperable discovery, 3 session lifecycles`,
		);
	} finally {
		if (child?.pid && child.exitCode === null && child.signalCode === null) {
			child.kill("SIGKILL");
			await exited;
		}
		await rm(root, { recursive: true, force: true });
	}
}

for (let mask = 1; mask < 1 << packages.length; mask++) {
	await checkCombination(packages.filter((_, index) => mask & (1 << index)));
}
console.log("Pi plugin isolation matrix: all 7 combinations PASS");
