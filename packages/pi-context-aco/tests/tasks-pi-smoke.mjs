import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { startPi } from "./pi-client.mjs";

const here = dirname(fileURLToPath(import.meta.url)),
	pkg = resolve(here, "..");
const root = await mkdtemp(join(tmpdir(), "pi-aco-tasks-"));
const npm =
	process.env.npm_execpath ??
	join(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
let client;
const run = (args, cwd) => {
	const r = spawnSync(process.execPath, [npm, ...args], {
		cwd,
		encoding: "utf8",
		timeout: 60000,
	});
	assert.equal(r.status, 0, r.stderr);
	return r.stdout;
};
try {
	const info = JSON.parse(
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
					"file:" + join(root, info.filename).replaceAll("\\", "/"),
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
	const installed = join(consumer, "node_modules", "pi-context-aco"),
		fixture = join(root, "fixture.js");
	await cp(join(here, "fixture.js"), fixture);
	const agent = join(root, "agent");
	await mkdir(agent);
	const requests = join(root, "requests.jsonl");
	const start = async (session) => {
		client = startPi({
			cwd: root,
			env: { PI_CODING_AGENT_DIR: agent, ACO_REQUESTS: requests },
			extensions: [installed, fixture],
			persist: true,
			args: session ? ["--session", session] : [],
		});
		await client.command("get_commands");
		await client.command("set_model", {
			provider: "aco-fixture",
			modelId: "test0",
		});
		await client.command("set_auto_retry", { enabled: false });
		await client.command("set_auto_compaction", { enabled: false });
	};
	const command = async (message) => {
		await client.command("prompt", { message });
	};
	const query = async (action) => {
		await command("/aco " + action);
		const e = client.events
			.filter((e) => e.type === "extension_ui_request" && e.method === "notify")
			.at(-1);
		return JSON.parse(e.message);
	};
	const probe = async () => {
		await command("/fixture-probe");
		return JSON.parse(
			client.events
				.filter(
					(e) => e.type === "extension_ui_request" && e.method === "notify",
				)
				.at(-1).message,
		);
	};
	const declare = async (update) =>
		command("/aco declare " + JSON.stringify(update));
	const prompt = async (message) => {
		const n = client.events.filter((e) => e.type === "agent_settled").length;
		await command(message);
		await client.until(
			() => client.events.filter((e) => e.type === "agent_settled").length > n,
			"task settled",
		);
	};
	await start();
	await prompt("Inspect sources for the migration");
	const original = await probe(),
		session = original.sessionFile;
	assert.ok(session);
	assert.equal(original.edits, 0);
	await declare({
		taskId: "explore",
		active: true,
		phase: "explore",
		status: "running",
		estimatedFutureTokens: 200000,
		delegatable: true,
	});
	let report = await query("trace");
	assert.ok(report.pressure.usedTokens.value < 35000);
	assert.equal(report.recommendation.kind, "proposal");
	assert.ok(report.recommendation.actions.some((a) => a.kind === "delegate"));
	assert.equal(report.analysis.modelCalls, 0);
	assert.equal(report.recommendation.executed, false);
	await command("/fixture-pressure 85000");
	await prompt("Review final delivery");
	await declare({
		taskId: "finish",
		active: true,
		phase: "review",
		remainingSteps: 1,
		estimatedFutureTokens: 1000,
	});
	report = await query("trace");
	assert.ok(report.pressure.usedTokens.value > 80000);
	assert.equal(report.recommendation.kind, "no-op");
	const userId = original.sources.find((e) => e.role === "user").id;
	const evidenceId = original.sources.find((e) => e.role === "toolResult").id;
	await declare({
		taskId: "impl",
		active: true,
		phase: "implement",
		planStatus: "completed",
		requiredContextIds: ["design"],
		references: [
			{
				id: "raw-protocol",
				kind: "evidence",
				sourceEntryIds: [evidenceId],
				precisionSensitive: true,
				completedResearch: true,
			},
			{
				id: "design",
				kind: "decision",
				sourceEntryIds: [userId],
				dependencies: ["raw-protocol"],
			},
		],
	});
	report = await query("trace");
	assert.ok(
		report.tasks.references.find((r) => r.id === "raw-protocol")
			.protectedReasons.length,
	);
	assert.ok(
		!report.recommendation.actions
			.flatMap((a) => a.referenceIds)
			.includes("raw-protocol"),
	);
	assert.ok(report.tasks.triggers.includes("plan-completed"));
	const count = (await probe()).taskMetadata.length;
	await declare({
		taskId: "bad",
		references: [
			{ id: "bad", kind: "evidence", sourceEntryIds: ["another-branch"] },
		],
	});
	assert.equal((await probe()).taskMetadata.length, count);
	await command("/fixture-declare");
	await prompt("Declare the next task");
	report = await query("trace");
	assert.equal(report.tasks.activeTaskId, "agent-task");
	assert.equal(
		report.tasks.tasks.find((t) => t.taskId === "agent-task").provenance.phase
			.origin,
		"tool",
	);
	assert.equal(report.analysis.declarationCalls, 1);
	assert.equal((await probe()).edits, 0);
	await command("/fixture-branch " + original.leaf);
	report = await query("trace");
	assert.ok(!report.tasks.tasks.some((t) => t.taskId === "agent-task"));
	await declare({ taskId: "branch-task", active: true, phase: "test" });
	await client.close();
	client = undefined;
	await start(session);
	report = await query("trace");
	assert.equal(report.tasks.activeTaskId, "branch-task");
	assert.ok(
		!report.tasks.tasks.some(
			(t) => t.taskId === "agent-task" || t.taskId === "impl",
		),
	);
	assert.deepEqual(report.authorizedStrategies, []);
	assert.equal(report.analysis.modelCalls, 0);
	assert.equal(
		client.events.filter((e) => e.type === "extension_error").length,
		0,
	);
	await client.close();
	client = undefined;
	const lines = (await readFile(requests, "utf8")).trim().split("\n");
	assert.equal(
		lines.length,
		6,
		"only requested work/ordinary declaration turns; no extra classifier/decision requests",
	);
	console.log(
		"PASS: real Pi T0002 E02/E03; low/high-pressure task-aware proposal/no-op; protected exact evidence; command/tool declaration provenance; malformed update atomicity; tree isolation and persisted resume; no strategy or extra model calls",
	);
} finally {
	await client?.dispose();
	await rm(root, { recursive: true, force: true });
}
