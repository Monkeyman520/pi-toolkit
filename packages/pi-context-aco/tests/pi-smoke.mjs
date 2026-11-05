import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { startPi } from "./pi-client.mjs";

const here = dirname(fileURLToPath(import.meta.url)),
	pkg = resolve(here, "..");
const root = await mkdtemp(join(tmpdir(), "pi-aco-smoke-"));
const npm =
	process.env.npm_execpath ??
	join(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
let client;
function run(args, cwd) {
	const result = spawnSync(process.execPath, [npm, ...args], {
		cwd,
		encoding: "utf8",
		windowsHide: true,
		timeout: 60000,
	});
	assert.equal(result.status, 0, result.stderr);
	return result.stdout;
}
const jsonLines = async (path) =>
	(await readFile(path, "utf8"))
		.trim()
		.split("\n")
		.filter(Boolean)
		.map((line) => JSON.parse(line));
try {
	const info = JSON.parse(
		run(
			["pack", "--ignore-scripts", "--json", "--pack-destination", root],
			pkg,
		),
	)[0];
	assert.deepEqual(info.bundled, ["pi-plugin-support"]);
	assert.ok(info.files.some((f) => f.path === "extensions/index.ts"));
	const consumer = join(root, "consumer");
	await mkdir(consumer);
	await writeFile(
		join(consumer, "package.json"),
		JSON.stringify({
			private: true,
			dependencies: {
				"pi-context-aco":
					"file:" + join(root, info.filename).replaceAll("\\", "/"),
			},
		}),
	);
	run(
		[
			"install",
			"--omit=dev",
			"--ignore-scripts",
			"--legacy-peer-deps",
			"--offline",
			"--no-audit",
			"--no-fund",
		],
		consumer,
	);
	const installed = join(consumer, "node_modules", "pi-context-aco");
	const support = JSON.parse(
		await readFile(
			join(installed, "node_modules", "pi-plugin-support", "package.json"),
			"utf8",
		),
	);
	assert.equal(support.version, "0.1.0");
	const fixture = join(root, "fixture.js");
	await cp(join(here, "fixture.js"), fixture);
	const agent = join(root, "agent");
	await mkdir(agent);
	await writeFile(
		join(agent, "pi-context-aco.json"),
		JSON.stringify({ persistTraces: true }),
	);
	const requests = join(root, "requests.jsonl");
	const start = async (enabled) => {
		await writeFile(requests, "");
		client = startPi({
			cwd: root,
			env: { PI_CODING_AGENT_DIR: agent, ACO_REQUESTS: requests },
			extensions: enabled ? [installed, fixture] : [fixture],
		});
		const commands = (await client.command("get_commands")).commands;
		for (const name of ["auto-resume", "quota", "pretty-session", "ps"])
			assert.ok(!commands.some((c) => c.name === name));
		assert.equal(
			commands.some((c) => c.name === "aco"),
			enabled,
		);
		await client.command("set_model", {
			provider: "aco-fixture",
			modelId: "test0",
		});
		await client.command("set_auto_retry", { enabled: false });
		await client.command("set_auto_compaction", { enabled: false });
	};
	const prompt = async (message) => {
		const count = client.events.filter(
			(e) => e.type === "agent_settled",
		).length;
		await client.command("prompt", { message });
		await client.until(
			() =>
				client.events.filter((e) => e.type === "agent_settled").length > count,
			"task settled",
		);
	};
	await start(false);
	for (let i = 0; i < 2; i++)
		await prompt("SENTINEL_USER_DONT_LOSE: controlled tools");
	const baseline = await jsonLines(requests);
	assert.equal(baseline.length, 4);
	await client.close();
	client = undefined;
	await start(true);
	for (let i = 0; i < 2; i++)
		await prompt("SENTINEL_USER_DONT_LOSE: controlled tools");
	const observed = await jsonLines(requests);
	assert.equal(observed.length, 4, "ACO adds no model calls/continuations");
	// Wall-clock fields differ between otherwise identical independent processes.
	const strip = (value) =>
		JSON.parse(
			JSON.stringify(value, (key, v) =>
				key === "timestamp" || key === "durationMs"
					? undefined
					: key === "toolsAdded"
						? v.filter(
								(tool) => !["aco_task", "aco_recall"].includes(tool.name),
							)
						: v,
			),
		);
	assert.ok(
		JSON.stringify(strip(observed)) === JSON.stringify(strip(baseline)),
		"provider-bound transcript/tool semantics unchanged (timestamps/durations normalized)",
	);
	await client.command("prompt", { message: "/aco trace" });
	let notice = client.events
		.filter((e) => e.type === "extension_ui_request" && e.method === "notify")
		.at(-1);
	let report = JSON.parse(notice.message);
	assert.equal(report.mode, "observe-only");
	assert.deepEqual(report.authorizedStrategies, []);
	assert.equal(report.pressure.finalizedCalls, 8);
	assert.equal(report.pressure.errorCalls, 4);
	assert.equal(report.providerUsage.cacheRead.value, 50);
	assert.equal(report.management.modelCalls, 0);
	assert.ok(
		report.traces.some((t) => t.pressure.pendingToolTokens.value > 0),
		"known upcoming tool burst captured",
	);
	assert.ok(
		!JSON.stringify(report).includes("EVIDENCE_SENTINEL") &&
			!JSON.stringify(report).includes("SENTINEL_USER"),
		"no raw evidence in metadata",
	);
	await client.command("prompt", { message: "/fixture-probe" });
	notice = client.events
		.filter((e) => e.type === "extension_ui_request" && e.method === "notify")
		.at(-1);
	const probe = JSON.parse(notice.message);
	assert.deepEqual(probe.panels.sort(), ["fixture-panel", "pi-context-aco"]);
	assert.ok(probe.metadata >= 4);
	assert.equal(probe.projectionHasMetadata, false);
	assert.equal(probe.edits, 0, "ACO never edits context");
	await client.command("prompt", { message: "/aco config horizonTurns 4" });
	assert.equal(
		JSON.parse(await readFile(join(agent, "pi-context-aco.json"), "utf8"))
			.horizonTurns,
		4,
	);
	await client.command("set_model", {
		provider: "aco-fixture",
		modelId: "test1",
	});
	await client.command("prompt", { message: "/aco trace" });
	report = JSON.parse(
		client.events
			.filter((e) => e.type === "extension_ui_request" && e.method === "notify")
			.at(-1).message,
	);
	assert.equal(report.pressure.capacity.value, 200000);
	assert.equal(report.pressure.growthRate.value, null);
	await client.command("prompt", { message: "/fixture-edit" });
	await prompt("controlled external edit");
	await client.command("prompt", { message: "/fixture-probe" });
	assert.equal(
		client.events.filter((e) => e.type === "extension_error").length,
		0,
		"fixture hooks must succeed",
	);
	await client.command("prompt", { message: "/aco trace" });
	report = JSON.parse(
		client.events
			.filter((e) => e.type === "extension_ui_request" && e.method === "notify")
			.at(-1).message,
	);
	assert.ok(
		report.traces.some(
			(t) =>
				t.event === "turn_start" &&
				t.pressure.resetReason === "model/window/projection changed" &&
				t.pressure.sampleCount === 0,
		),
		JSON.stringify(
			report.traces.map((t) => [
				t.event,
				t.pressure.resetReason,
				t.pressure.sampleCount,
			]),
		) +
			" stderr=" +
			client.stderr,
	);
	await client.command("compact");
	await client.command("prompt", { message: "/aco trace" });
	report = JSON.parse(
		client.events
			.filter((e) => e.type === "extension_ui_request" && e.method === "notify")
			.at(-1).message,
	);
	assert.equal(report.pressure.growthRate.value, null);
	await client.command("prompt", { message: "/aco" });
	assert.ok(
		client.events
			.filter((e) => e.type === "extension_ui_request" && e.method === "notify")
			.at(-1)
			.message.includes("observe-only"),
		"non-TUI fallback",
	);
	await client.close();
	client = undefined;
	console.log(
		"PASS: isolated npm tarball + bundled support; real Pi RPC; baseline transcript/tool equality; zero extra model calls; parallel/blocked/unknown outcomes; numeric metadata; burst forecast; model/edit/native-compaction resets; config and clean shutdown",
	);
} finally {
	await client?.dispose();
	await rm(root, { recursive: true, force: true });
}
