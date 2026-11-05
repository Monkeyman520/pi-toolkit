import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { startPi } from "./pi-client.mjs";

const here = dirname(fileURLToPath(import.meta.url)),
	pkg = resolve(here, "..");
const root = await mkdtemp(join(tmpdir(), "pi-aco-evidence-"));
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
		fixture = join(root, "evidence-fixture.js");
	await cp(join(here, "evidence-fixture.js"), fixture);
	const agent = join(root, "agent"),
		requests = join(root, "requests.jsonl");
	await mkdir(agent);
	const storeRoot = join(agent, "pi-context-aco", "evidence");
	const start = async (session, cwd = root) => {
		client = startPi({
			cwd,
			env: { PI_CODING_AGENT_DIR: agent, ACO_REQUESTS: requests },
			extensions: [installed, fixture],
			persist: true,
			args: session ? ["--session", session] : [],
		});
		await client.command("get_commands");
		await client.command("set_model", {
			provider: "evidence-fixture",
			modelId: "test",
		});
		await client.command("set_auto_compaction", { enabled: false });
		await client.command("set_auto_retry", { enabled: false });
	};
	const command = async (message) => client.command("prompt", { message });
	const notice = () =>
		client.events
			.filter((e) => e.type === "extension_ui_request" && e.method === "notify")
			.at(-1);
	const query = async (message) => {
		await command(message);
		return JSON.parse(notice().message);
	};
	const prompt = async (message) => {
		const count = client.events.filter(
			(e) => e.type === "agent_settled",
		).length;
		await command(message);
		await client.until(
			() =>
				client.events.filter((e) => e.type === "agent_settled").length > count,
			"evidence settled",
		);
	};
	await start();
	const sourcePath = join(root, "protocol.txt");
	await writeFile(sourcePath, "old exact error 0xAF");
	await prompt("READ_SOURCE:" + sourcePath);
	let probe = await query("/evidence-probe");
	const goal = probe.branch.find(
			(e) => e.type === "message" && e.message.role === "user",
		).id,
		session = probe.sessionFile;
	const originalSource = probe.branch.find(
		(e) =>
			e.type === "message" &&
			e.message.role === "toolResult" &&
			e.message.toolName === "read",
	);
	assert.ok(JSON.stringify(originalSource).includes("0xAF"));
	const evidenceSource = originalSource.id;
	await command(
		'/aco declare {"taskId":"work","active":true,"phase":"implement","planStatus":"running"}',
	);
	const checkpoint = async () =>
		query(
			"/aco checkpoint " +
				JSON.stringify({
					sourceEntryIds: [goal, evidenceSource],
					unresolvedWork: ["CHECKPOINT_ONLY_PRIVATE_STATE"],
				}),
		);
	// Real host persistence failure: root occupied by a file, not a mock append hook.
	await mkdir(dirname(storeRoot), { recursive: true });
	await writeFile(storeRoot, "blocked storage");
	await command(
		"/aco checkpoint " + JSON.stringify({ sourceEntryIds: [goal] }),
	);
	assert.equal(notice().notifyType, "error");
	let recovery = await query("/aco evidence");
	assert.ok(recovery.checkpoints.some((c) => c.status === "incomplete"));
	assert.equal(recovery.lastUsableId, null);
	assert.ok(
		JSON.stringify((await query("/evidence-probe")).projection).includes(
			"0xAF",
		),
		"storage failure leaves original model-visible",
	);
	await rm(storeRoot);
	const good = await checkpoint();
	assert.equal(good.recoverable, true);
	assert.equal(good.unloaded, false);
	probe = await query("/evidence-probe");
	assert.ok(
		!JSON.stringify(probe.projection).includes("CHECKPOINT_ONLY_PRIVATE_STATE"),
	);
	assert.ok(!JSON.stringify(probe.projection).includes("aco-evidence-commit"));
	const committedLeaf = probe.leaf;
	await prompt("Continue without recalling checkpoint");
	assert.ok(
		!(await readFile(requests, "utf8")).includes(
			"CHECKPOINT_ONLY_PRIVATE_STATE",
		),
	);
	await writeFile(sourcePath, "new current error 0xBB");
	const request = {
		checkpointId: good.checkpointId,
		segmentId: evidenceSource,
		budgetBytes: 2048,
	};
	let recalled = await query("/aco recall " + JSON.stringify(request));
	assert.ok(recalled.text.includes("0xAF"));
	assert.equal(recalled.historical, true);
	assert.equal(recalled.currentSourceVerified, false);
	assert.ok(Buffer.byteLength(JSON.stringify(recalled)) <= 2048);
	// Actual model tool/result and subsequent provider-bound request.
	await prompt(
		"RECALL:" +
			JSON.stringify({
				...request,
				segmentId: "continuity",
				budgetBytes: 32768,
			}),
	);
	assert.ok(
		(await readFile(requests, "utf8")).includes(
			"CHECKPOINT_ONLY_PRIVATE_STATE",
		),
		JSON.stringify(client.events.slice(-12)),
	);
	probe = await query("/evidence-probe");
	assert.equal(
		probe.branch.filter(
			(e) => e.type === "context_edit" || e.type === "compaction",
		).length,
		0,
	);
	const toolResult = probe.branch
		.filter((e) => e.type === "message" && e.message.role === "toolResult")
		.at(-1).message;
	assert.equal(toolResult.toolName, "aco_recall");
	assert.equal(toolResult.isError, false);
	// Active task denial even while ID and active-branch receipt are known.
	await command('/aco declare {"taskId":"unrelated","active":true}');
	await command("/aco recall " + JSON.stringify(request));
	assert.equal(notice().notifyType, "error");
	await command('/aco declare {"taskId":"work","active":true}');
	const newer = await checkpoint();
	recovery = await query("/aco evidence");
	assert.equal(recovery.lastUsableId, newer.checkpointId);
	const directory = join(storeRoot, recovery.scope.project, newer.checkpointId);
	await writeFile(join(directory, "s0.json"), "corrupt original");
	await client.close();
	client = undefined;
	await start(session);
	recovery = await query("/aco evidence");
	assert.equal(recovery.lastUsableId, good.checkpointId);
	assert.ok(
		recovery.checkpoints.some(
			(c) => c.id === newer.checkpointId && c.status === "invalid",
		),
	);
	assert.ok(recovery.checkpoints.some((c) => c.status === "incomplete"));
	recalled = await query("/aco recall " + JSON.stringify(request));
	assert.ok(recalled.text.includes("0xAF"));
	// Tree navigation drops receipts from the abandoned path.
	await command("/evidence-tree " + goal);
	recovery = await query("/aco evidence");
	assert.equal(recovery.lastUsableId, null);
	await command("/aco recall " + JSON.stringify(request));
	assert.equal(notice().notifyType, "error");
	await command("/evidence-tree " + committedLeaf);
	recovery = await query("/aco evidence");
	assert.equal(recovery.lastUsableId, good.checkpointId);
	// Actual fork/clone preserves just inherited path authority and origin provenance.
	await command("/evidence-clone");
	probe = await query("/evidence-probe");
	assert.notEqual(probe.sessionFile, session);
	recalled = await query("/aco recall " + JSON.stringify(request));
	assert.ok(recalled.text.includes("0xAF"));
	assert.notEqual(recalled.scope.sessionId, probe.sessionId);
	assert.ok(
		!probe.branch.some(
			(e) =>
				e.type === "custom" &&
				e.customType === "aco-evidence-commit" &&
				e.data.id === newer.checkpointId,
		),
	);
	await command("/aco off");
	await command("/aco recall " + JSON.stringify(request));
	assert.equal(notice().notifyType, "error");
	await command("/aco on");
	const status = await query("/aco trace");
	assert.ok(status.stage.includes("T0003"));
	assert.equal(status.mode, "observe-only");
	assert.deepEqual(status.authorizedStrategies, []);
	assert.ok(status.strategyExecution.includes("observation-only"));
	assert.deepEqual(status.authorizedStrategies, []);
	assert.equal(
		client.events.filter((e) => e.type === "extension_error").length,
		0,
	);
	await client.close();
	client = undefined;
	// Another actual Pi project/session cannot use the ID.
	const other = join(root, "other");
	await mkdir(other);
	await start(undefined, other);
	await prompt("Unrelated project task");
	await command('/aco declare {"taskId":"work","active":true}');
	await command("/aco recall " + JSON.stringify(request));
	assert.equal(notice().notifyType, "error");
	await client.close();
	client = undefined;
	console.log(
		"PASS installed Pi evidence: metadata/model-visible recall, bounded historical originals, persistence faults, corrupted restart fallback, task/project/tree/fork isolation, disabled control; no pruning",
	);
} finally {
	if (client) await client.dispose();
	await rm(root, { recursive: true, force: true });
}
