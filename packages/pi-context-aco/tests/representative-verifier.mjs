// Local independent P1 host verifier. Never loads the remote provider or user sessions.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { startPi } from "./pi-client.mjs";

const pkg = resolve(process.argv[2]);
const root = await mkdtemp(join(tmpdir(), "aco-p1-verifier-"));
const npm =
	process.env.npm_execpath ??
	join(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
function run(args, cwd) {
	const r = spawnSync(process.execPath, [npm, ...args], {
		cwd,
		encoding: "utf8",
	});
	assert.equal(r.status, 0, r.stdout + r.stderr);
	return r.stdout;
}
let client;
try {
	const pack = JSON.parse(
		run(
			["pack", "--ignore-scripts", "--json", "--pack-destination", root],
			pkg,
		),
	)[0];
	const consumer = join(root, "consumer");
	await mkdir(consumer);
	await writeFile(
		join(consumer, "package.json"),
		JSON.stringify({
			private: true,
			dependencies: {
				"pi-context-aco":
					"file:" + join(root, pack.filename).replaceAll("\\", "/"),
			},
		}),
	);
	run(
		[
			"install",
			"--omit=dev",
			"--legacy-peer-deps",
			"--ignore-scripts",
			"--offline",
			"--no-audit",
			"--no-fund",
		],
		consumer,
	);
	const agent = join(root, "agent");
	await mkdir(agent);
	await writeFile(
		join(agent, "settings.json"),
		JSON.stringify({
			defaultProvider: "aco-unregistered-provider",
			defaultModel: "missing",
		}),
	);
	client = startPi({
		cwd: consumer,
		persist: true,
		env: { PI_CODING_AGENT_DIR: agent },
		extensions: [join(consumer, "node_modules", "pi-context-aco")],
	});
	await client.command("get_commands");
	const query = async (message) => {
		const from = client.events.length;
		await client.command("prompt", { message });
		const n = client.events
			.slice(from)
			.filter((e) => e.type === "extension_ui_request" && e.method === "notify")
			.at(-1);
		assert.ok(n, "No result: " + message);
		return JSON.parse(n.message);
	};
	await query('/aco declare {"taskId":"parent","active":true}');
	await query(
		'/aco declare {"taskId":"child","delegatable":true,"writeConflictRisk":0}',
	);
	await client.command("prompt", { message: "/aco config mode delegate" });
	await query(
		'/aco authorize {"operation":"delegate","taskIds":["child"],"maxTokens":100000}',
	);
	const result = await query(
		"/aco delegate " +
			JSON.stringify({
				tasks: [
					{
						taskId: "child",
						goal: "inspect",
						constraints: [],
						acceptance: ["report"],
						resources: [],
						evidence: [],
					},
				],
			}),
	);
	assert.equal(result.status, "recommendation", JSON.stringify(result));
	assert.deepEqual(result.ids, []);
	const report = await query("/aco delegation");
	assert.equal(report.active, 0);
	assert.equal(report.reservedTokens, 0);
	assert.deepEqual(report.outcomes, []);
	const { entries } = await client.command("get_entries");
	assert.ok(!entries.some((e) => e.type === "context_edit"));
	assert.ok(
		!entries.some(
			(e) => e.type === "custom" && e.customType.startsWith("aco-delegation-"),
		),
	);
	const sessionFile = (await client.command("get_state")).sessionFile;
	const original = sessionFile
		? await readFile(sessionFile, "utf8").catch((error) => {
				if (error.code === "ENOENT") return null;
				throw error;
			})
		: null;
	await client.close();
	client = undefined;
	console.log(
		JSON.stringify({
			passed: true,
			result,
			report,
			entries,
			original,
			evidenceClass:
				"actual unmodified isolated Pi, missing configured provider, no remote model",
		}),
	);
} finally {
	await client?.dispose();
	await rm(root, { recursive: true, force: true });
}
