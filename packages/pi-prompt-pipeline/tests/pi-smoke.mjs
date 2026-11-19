import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import {
	cp,
	mkdir,
	mkdtemp,
	readdir,
	readFile,
	rm,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { setTimeout as pause } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const root = await mkdtemp(join(tmpdir(), "pi-prompt-pipeline-smoke-"));
const cwd = join(root, "project"),
	agent = join(root, "agent"),
	output = join(root, "output");
let child;
try {
	await Promise.all([mkdir(cwd), mkdir(agent)]);
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
	assert.ok(
		info.files.some((f) => f.path.startsWith("examples/")),
		"examples/ must be packed",
	);
	const consumer = join(root, "consumer");
	await mkdir(consumer, { recursive: true });
	await writeFile(
		join(consumer, "package.json"),
		JSON.stringify({
			private: true,
			dependencies: {
				"@monkeyman520/pi-prompt-pipeline": `file:${join(root, info.filename).replaceAll("\\", "/")}`,
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
		..."@monkeyman520/pi-prompt-pipeline".split("/"),
	);
	const plugin = isolated;
	const provider = join(root, "provider.ts"),
		peer = join(root, "peer.ts");
	await cp(join(packageRoot, "tests/provider-fixture.ts"), provider);
	await cp(join(packageRoot, "tests/peer-after.ts"), peer);
	await writeFile(
		join(agent, "settings.json"),
		JSON.stringify({
			defaultProvider: "antigravity",
			defaultModel: "gemini-fixture",
			enableSkillCommands: false,
		}),
	);
	await writeFile(
		join(root, "smoke.mjs"),
		'export default (text)=>text+"\\nscript-native";',
	);
	await writeFile(
		join(agent, "prompt-pipeline.json"),
		JSON.stringify({
			logging: "info",
			export: { directory: output },
			rules: [
				{
					id: "agent",
					stage: "agent",
					targets: ["intro"],
					actions: [
						{ type: "append", text: "\nagent-transformed" },
						{ type: "script", path: join(root, "smoke.mjs") },
					],
				},
				{
					id: "request",
					stage: "request",
					when: { providers: ["antigravity"], models: ["gemini-*"] },
					targets: ["all"],
					actions: [{ type: "append", text: "\nrequest-transformed" }],
				},
			],
		}),
	);
	const wire = join(root, "wire.jsonl");
	const events = [];
	let stdout = "",
		stderr = "",
		id = 0;
	const binary = process.env.PI_BINARY ?? "pi";
	child = spawn(
		binary,
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
			provider,
			"-e",
			plugin,
			"-e",
			peer,
			"--provider",
			"antigravity",
			"--model",
			"gemini-fixture",
		],
		{
			cwd,
			env: {
				...process.env,
				PI_CODING_AGENT_DIR: agent,
				PI_OFFLINE: "1",
				PROMPT_PIPELINE_FIXTURE_LOG: wire,
			},
			stdio: ["pipe", "pipe", "pipe"],
		},
	);
	let failure;
	child.on("error", (e) => {
		failure = e;
	});
	child.stdin.on("error", (e) => {
		failure = e;
	});
	child.stdout.on("data", (chunk) => {
		stdout += chunk;
		for (;;) {
			const end = stdout.indexOf("\n");
			if (end < 0) break;
			const line = stdout.slice(0, end);
			stdout = stdout.slice(end + 1);
			try {
				events.push(JSON.parse(line));
			} catch {}
		}
	});
	child.stderr.on("data", (chunk) => {
		stderr += chunk;
	});
	async function until(predicate, label) {
		const end = Date.now() + 45000;
		while (!predicate()) {
			if (failure) throw failure;
			if (child.exitCode !== null) throw Error(`Pi exited: ${stderr}`);
			if (Date.now() > end)
				throw Error(
					"Timeout " +
						label +
						" " +
						stderr +
						" " +
						JSON.stringify(events.slice(-6)),
				);
			await pause(30);
		}
	}
	async function command(type, data = {}) {
		const key = String(++id);
		child.stdin.write(`${JSON.stringify({ id: key, type, ...data })}\n`);
		await until(
			() => events.some((e) => e.type === "response" && e.id === key),
			type,
		);
		const response = events.find((e) => e.type === "response" && e.id === key);
		assert.equal(response.success, true, JSON.stringify(response));
		return response.data;
	}
	async function captures() {
		try {
			return await Promise.all(
				(await readdir(output)).map(async (name) =>
					JSON.parse(await readFile(join(output, name), "utf8")),
				),
			);
		} catch (e) {
			if (e.code === "ENOENT") return [];
			throw e;
		}
	}
	async function run() {
		const previous = events.filter((e) => e.type === "agent_end").length;
		await command("prompt", { message: "fixture user" });
		await until(
			() => events.filter((e) => e.type === "agent_end").length > previous,
			"agent end",
		);
		await until(
			() =>
				!events
					.slice()
					.reverse()
					.find((e) => e.type === "agent_start" || e.type === "agent_end") ||
				events
					.slice()
					.reverse()
					.find((e) => e.type === "agent_start" || e.type === "agent_end")
					?.type === "agent_end",
			"settled",
		);
	}
	const commands = await command("get_commands");
	const names = commands.commands.map((c) => c.name);
	assert.deepEqual(
		names.filter((n) => n === "prompt-pipeline"),
		["prompt-pipeline"],
	);
	assert.ok(
		!names.some((n) => ["auto-resume", "quota-keeper", "stree"].includes(n)),
	);
	await command("prompt", { message: "/prompt-pipeline export agent before" });
	assert.equal((await captures()).length, 0);
	await assert.rejects(readFile(wire, "utf8"), { code: "ENOENT" });
	await run();
	let snapshots = await captures();
	assert.equal(snapshots.length, 1);
	assert.equal(snapshots[0].stage, "agent");
	assert.equal(snapshots[0].side, "before");
	assert.ok(snapshots[0].parts[0].text.startsWith("peer-before"));
	assert.ok(!snapshots[0].parts[0].text.includes("agent-transformed"));
	const lines = (await readFile(wire, "utf8"))
		.trim()
		.split("\n")
		.map(JSON.parse);
	assert.ok(
		lines[0].payload.request.systemInstruction.parts[0].text.includes(
			"agent-transformed",
		),
	);
	assert.ok(
		lines[0].payload.request.systemInstruction.parts[0].text.includes(
			"script-native",
		),
	);
	assert.ok(
		lines[0].payload.request.systemInstruction.parts[0].text.includes(
			"request-transformed",
		),
	);
	assert.ok(
		lines[0].payload.request.systemInstruction.parts[0].text.includes(
			"peer-after",
		),
	);
	assert.deepEqual(lines[0].payload.request.contents, [
		{ role: "user", parts: [{ text: "user-untouched" }] },
	]);
	await command("prompt", { message: "/prompt-pipeline export request both" });
	assert.equal((await readFile(wire, "utf8")).trim().split("\n").length, 1);
	await run();
	snapshots = await captures();
	assert.equal(snapshots.length, 3);
	const pair = snapshots.filter((s) => s.stage === "request");
	assert.equal(pair.length, 2);
	assert.equal(pair[0].captureId, pair[1].captureId);
	const before = pair.find((s) => s.side === "before").parts[0].text,
		after = pair.find((s) => s.side === "after").parts[0].text;
	assert.ok(!before.includes("request-transformed"));
	assert.ok(after.endsWith("request-transformed"));
	assert.ok(!after.includes("request-peer-after"));
	await run();
	assert.equal((await captures()).length, 3);
	await command("prompt", { message: "/prompt-pipeline export agent both" });
	await command("new_session");
	await run();
	assert.equal((await captures()).length, 3);
	assert.ok(!stderr.includes("Failed to load extension"), stderr);
	assert.ok(
		!events.some((e) => e.type === "extension_error"),
		JSON.stringify(events.filter((e) => e.type === "extension_error")),
	);
	child.stdin.end();
	await new Promise((resolve, reject) => {
		const timer = setTimeout(() => reject(Error("shutdown timeout")), 10000);
		child.once("exit", (code) => {
			clearTimeout(timer);
			code === 0 ? resolve() : reject(Error(`exit ${code} ${stderr}`));
		});
	});
	console.log(
		JSON.stringify(
			{
				result: "passed",
				host: binary,
				isolatedPackage: true,
				requests: 4,
				snapshots: 3,
				checks: [
					"load",
					"one-shot agent before",
					"native ESM script",
					"request pair",
					"no extra requests",
					"one-shot consumption",
					"plugin-local ordering",
					"new-session clear",
					"payload preservation",
					"no sibling activation",
				],
			},
			null,
			2,
		),
	);
} finally {
	if (child && child.exitCode === null) child.kill();
	await rm(root, {
		recursive: true,
		force: true,
		maxRetries: 5,
		retryDelay: 100,
	});
}
