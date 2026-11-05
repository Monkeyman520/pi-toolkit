import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { startPi } from "./pi-client.mjs";

const here = dirname(fileURLToPath(import.meta.url)),
	pkg = resolve(here, "..");
const root = await mkdtemp(join(tmpdir(), "pi-aco-prune-"));
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

const jsonLines = async (path) => {
	try {
		return (await readFile(path, "utf8"))
			.trim()
			.split("\n")
			.filter(Boolean)
			.map((line) => JSON.parse(line));
	} catch {
		return [];
	}
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
				"pi-context-aco": `file:${join(root, info.filename).replaceAll("\\", "/")}`,
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
	const installed = join(consumer, "node_modules", "pi-context-aco");
	const fixture = join(root, "evidence-fixture.js");
	await cp(join(here, "evidence-fixture.js"), fixture);
	const agent = join(root, "agent");
	const requests = join(root, "requests.jsonl");
	await mkdir(agent);

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
		const raw = notice().message;
		return JSON.parse(
			raw.includes("\n") ? raw.slice(raw.indexOf("\n") + 1) : raw,
		);
	};
	const prompt = async (message) => {
		const count = client.events.filter(
			(e) => e.type === "agent_settled",
		).length;
		await command(message);
		await client.until(
			() =>
				client.events.filter((e) => e.type === "agent_settled").length > count,
			"prune settled",
		);
	};

	// 1. Start Pi and perform research
	await start();
	const researchFile = join(root, "research.txt");
	await writeFile(researchFile, "PRECISE_RESEARCH_DATA_0xDEADBEEF");
	await prompt(`READ_SOURCE:${researchFile}`);

	let probe = await query("/evidence-probe");
	const toolResultEntry = probe.branch.find(
		(e) =>
			e.type === "message" &&
			e.message.role === "toolResult" &&
			JSON.stringify(e.message.content).includes("PRECISE_RESEARCH_DATA"),
	);
	assert.ok(toolResultEntry, "Research tool result not found in branch");
	const toolResultId = toolResultEntry.id;
	const prePruneLeaf = probe.leaf;

	// 2. Declare task and completed research
	await command(
		`/aco declare ${JSON.stringify({
			taskId: "research-task",
			active: true,
			status: "completed",
			references: [
				{
					id: "ref:research",
					kind: "evidence",
					sourceEntryIds: [toolResultId],
					completedResearch: true,
				},
			],
		})}`,
	);

	// 3. Create verified checkpoint
	const checkpointResult = await query(
		`/aco checkpoint ${JSON.stringify({
			sourceEntryIds: [toolResultId],
		})}`,
	);
	assert.equal(checkpointResult.recoverable, true);
	const verifiedLeaf = (await query("/evidence-probe")).leaf;

	// 4. In default observe mode: exact pruning does not execute (C1)
	let status = await query("/aco status");
	assert.equal(status.mode, "observe-only");
	assert.deepEqual(status.authorizedStrategies, []);
	await prompt("Ask question in observe mode");

	let reqs = await jsonLines(requests);
	let lastReq = reqs.at(-1);
	assert.ok(
		JSON.stringify(lastReq).includes("PRECISE_RESEARCH_DATA_0xDEADBEEF"),
		"Research data should NOT be pruned in observe mode",
	);

	// 5. Switch to exact-prune mode (C1, C4, C7)
	await command("/aco config mode exact-prune");
	status = await query("/aco status");
	assert.equal(status.mode, "exact-prune");
	assert.deepEqual(status.authorizedStrategies, ["exact-prune"]);

	// 6. Make prompt: exact pruning request-local projection & durable context_edit take effect
	await prompt("Next turn with exact pruning active");

	// Inspect provider requests: the permitted content is excluded from model-visible context! (C7)
	reqs = await jsonLines(requests);
	lastReq = reqs.at(-1);
	assert.ok(
		!JSON.stringify(lastReq).includes("PRECISE_RESEARCH_DATA_0xDEADBEEF"),
		"Research data should be excluded from provider request when exact pruning is active",
	);

	// Inspect canonical projection and branch: context_edit was committed and projection excludes it! (C4, C5)
	probe = await query("/evidence-probe");
	const hasEditOnBranch = probe.branch.some(
		(e) =>
			e.type === "context_edit" &&
			e.targetId === toolResultId &&
			e.replacement === null,
	);
	assert.ok(hasEditOnBranch, "context_edit entry should be present on branch");
	const projectionHasResearch = probe.projection.some(
		(m) =>
			m.role === "toolResult" &&
			JSON.stringify(m.content).includes("PRECISE_RESEARCH_DATA"),
	);
	assert.equal(
		projectionHasResearch,
		false,
		"Canonical projection should exclude pruned research result",
	);

	const prunedLeaf = probe.leaf;

	// 7. Restoration makes original contribution available again (C7)
	const restoreResult = await query(`/aco restore ${toolResultId}`);
	assert.equal(restoreResult.scheduled, true);
	assert.equal(restoreResult.restored, false);
	assert.ok(restoreResult.targetIds.includes(toolResultId));

	// Trigger boundary commit for restore draft
	await prompt("Turn after restore requested");
	probe = await query("/evidence-probe");
	const projectionRestored = probe.projection.some(
		(m) =>
			m.role === "toolResult" &&
			JSON.stringify(m.content).includes("PRECISE_RESEARCH_DATA"),
	);
	assert.equal(
		projectionRestored,
		true,
		"Restored research result should be model-visible again in projection",
	);

	// 8. Branch navigation demonstrates branch-relative effects (C7, E06)
	// Navigate back to pre-prune leaf
	await command(`/evidence-tree ${prePruneLeaf}`);
	probe = await query("/evidence-probe");
	const onOldBranchHasEdit = probe.branch.some(
		(e) =>
			e.type === "context_edit" &&
			e.targetId === toolResultId &&
			e.replacement === null,
	);
	assert.equal(
		onOldBranchHasEdit,
		false,
		"Pre-prune branch should not contain context_edits from the other branch",
	);

	// Return to pruned leaf: branch-relative effects preserved
	await command(`/evidence-tree ${prunedLeaf}`);
	probe = await query("/evidence-probe");
	assert.ok(
		probe.branch.some(
			(e) => e.type === "context_edit" && e.targetId === toolResultId,
		),
		"Pruned branch should preserve its context_edits",
	);

	// Corruption after successful checkpoint/readback must invalidate execution authority.
	await command(`/evidence-tree ${verifiedLeaf}`);
	probe = await query("/evidence-probe");
	const receipt = probe.branch.find(
		(e) => e.type === "custom" && e.customType === "aco-evidence-commit",
	).data;
	const directory = join(
		agent,
		"pi-context-aco",
		"evidence",
		receipt.scope.project,
		receipt.id,
	);
	const manifest = JSON.parse(
		await readFile(join(directory, "manifest.json"), "utf8"),
	);
	const archived = manifest.segments.find((s) => s.id === toolResultId);
	await rm(join(directory, archived.file));
	const invalid = await query("/aco evidence");
	assert.equal(invalid.checkpoints[0].status, "invalid");
	await prompt("Continue safely after archived original becomes inaccessible");
	assert.ok(
		JSON.stringify((await jsonLines(requests)).at(-1)).includes(
			"PRECISE_RESEARCH_DATA_0xDEADBEEF",
		),
	);
	probe = await query("/evidence-probe");
	assert.ok(
		!probe.branch.some(
			(e) => e.type === "context_edit" && e.targetId === toolResultId,
		),
		"Corrupt checkpoint must not authorize request-local or durable pruning",
	);

	await client.close();
	client = undefined;
	console.log(
		"PASS installed Pi exact pruning: V1 observe passivity, request-local projection, durable context_edit omission, verified restoration, and branch isolation",
	);
} finally {
	await client?.close();
	await rm(root, { recursive: true, force: true });
}
