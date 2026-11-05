import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { startPi } from "./pi-client.mjs";

const here = dirname(fileURLToPath(import.meta.url)),
	pkg = resolve(here, ".."),
	root = await mkdtemp(join(tmpdir(), "aco-delegation-smoke-"));
const npm =
	process.env.npm_execpath ??
	join(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
const run = (args, cwd) => {
	const r = spawnSync(process.execPath, [npm, ...args], {
		cwd,
		encoding: "utf8",
		timeout: 60000,
	});
	assert.equal(r.status, 0, r.stderr);
	return r.stdout;
};
let client;
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
		fixture = join(root, "delegation-fixture.js"),
		agent = join(root, "agent"),
		requests = join(root, "requests.jsonl");
	await cp(join(here, "delegation-fixture.js"), fixture);
	await mkdir(agent);
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
			provider: "delegation-fixture",
			modelId: "test",
		});
	};
	const command = async (message) => client.command("prompt", { message });
	const query = async (message) => {
		await command(message);
		const n = client.events
			.filter((e) => e.type === "extension_ui_request" && e.method === "notify")
			.at(-1);
		return JSON.parse(n.message);
	};
	const prompt = async (message) => {
		const n = client.events.filter((e) => e.type === "agent_settled").length;
		await command(message);
		await client.until(
			() => client.events.filter((e) => e.type === "agent_settled").length > n,
		);
	};
	const declare = async (taskId, extra = {}) =>
		query(
			"/aco declare " +
				JSON.stringify({
					taskId,
					active: taskId === "parent",
					status: "pending",
					delegatable: true,
					writeConflictRisk: 0,
					writeResources: [],
					...extra,
				}),
		);
	await start();
	await prompt("PARENT_SECRET_DO_NOT_COPY");
	await prompt("ALLOWED_EVIDENCE");
	let probe = await query("/delegation-probe");
	const source = probe.branch.find(
		(e) =>
			e.type === "message" &&
			e.message.role === "user" &&
			JSON.stringify(e.message).includes("ALLOWED_EVIDENCE"),
	);
	await declare("parent");
	await declare("child-a");
	await declare("child-b", { writeResources: ["out.txt"] });
	await declare("child-c");
	await writeFile(join(root, "out.txt"), "original\n");
	const checkpoint = await query(
		"/aco checkpoint " + JSON.stringify({ sourceEntryIds: [source.id] }),
	);
	assert.equal(checkpoint.recoverable, true);
	await command("/aco config mode delegate");
	const contract = (taskId) => ({
		taskId,
		goal: "inspect independent source",
		constraints: ["use explicit evidence only"],
		acceptance: ["return analysis"],
		resources: [],
		evidence: [
			{
				checkpointId: checkpoint.checkpointId,
				segmentId: source.id,
			},
		],
	});
	const first = contract("child-a");
	assert.ok(first.evidence[0].checkpointId, JSON.stringify(checkpoint));
	assert.equal(
		(await query("/aco delegate " + JSON.stringify({ tasks: [first] }))).status,
		"recommendation",
	);
	assert.ok(
		!client.events.some(
			(e) => e.type === "extension_ui_request" && e.method === "confirm",
		),
	);
	await query(
		"/aco authorize " +
			JSON.stringify({
				operation: "delegate",
				taskIds: ["child-a", "child-b"],
				maxTokens: 200000,
			}),
	);
	const second = {
		...contract("child-b"),
		resources: [{ path: "out.txt", write: true }],
	};
	const parentProjectionBefore = JSON.stringify(
		(await query("/delegation-probe")).projection,
	);
	const startAt = performance.now();
	const result = await query(
		"/aco delegate " + JSON.stringify({ tasks: [first, second] }),
	);
	assert.equal(result.status, "returned", JSON.stringify(result));
	assert.equal(result.outcomes.length, 2);
	assert.ok(
		result.outcomes.every((o) => o.status === "needs-verification"),
		JSON.stringify(result),
	);
	assert.equal(
		await readFile(join(root, "out.txt"), "utf8"),
		"original\n",
		"children never write the parent workspace",
	);
	await writeFile(join(root, "out.txt"), "verified child proposal\n");
	for (const id of result.ids) {
		const verified = await query(
			"/aco reconcile " +
				JSON.stringify({
					id,
					accepted: true,
					verification: [
						"Parent smoke independently checked explicit evidence, deliverable text and no-shell test disclosure",
					],
				}),
		);
		assert.equal(verified.reconciled, true);
	}
	const report = await query("/aco delegation");
	assert.ok(report.outcomes.every((o) => o.status === "verified"));
	const requestsBefore = (await readFile(requests, "utf8"))
		.trim()
		.split("\n")
		.map(JSON.parse);
	const children = requestsBefore.filter((r) => r.child);
	assert.equal(children.length, 2);
	assert.ok(
		children.every(
			(r) => !JSON.stringify(r.context).includes("PARENT_SECRET_DO_NOT_COPY"),
		),
	);
	assert.ok(
		children.every((r) =>
			JSON.stringify(r.context).includes("ALLOWED_EVIDENCE"),
		),
	);
	assert.ok(
		children.every(
			(r) => !JSON.stringify(r.context).includes("Controlled parent response"),
		),
	);
	probe = await query("/delegation-probe");
	assert.ok(
		!JSON.stringify(probe.projection).includes("Controlled analysis"),
		"child exploration/results not automatically injected",
	);
	assert.equal(
		JSON.stringify(probe.projection),
		parentProjectionBefore,
		"parent working set unchanged by child work",
	);
	const session = probe.sessionFile;
	const parentUsage = probe.branch
		.filter((e) => e.type === "message" && e.message.role === "assistant")
		.map((e) => e.message.usage);
	const parentReportedTokens = parentUsage.reduce(
		(n, u) => n + u.totalTokens,
		0,
	);
	const metrics = {
		parentWorkingSetMessages: probe.projection.length,
		parentWorkingSetBytes: Buffer.byteLength(JSON.stringify(probe.projection)),
		childContextBytes: children.map((r) =>
			Buffer.byteLength(JSON.stringify(r.context)),
		),
		parentReportedTokens,
		childReportedTokens: report.outcomes.reduce((n, o) => n + o.tokens, 0),
		aggregateReportedTokens:
			parentReportedTokens + report.outcomes.reduce((n, o) => n + o.tokens, 0),
		reservedChildAndCoordinationTokens: report.reservedTokens,
		childCost: report.outcomes.reduce((n, o) => n + o.cost, 0),
		parentCost: parentUsage.reduce((n, u) => n + u.cost.total, 0),
		aggregateCost:
			parentUsage.reduce((n, u) => n + u.cost.total, 0) +
			report.outcomes.reduce((n, o) => n + o.cost, 0),
		mainAgentWorkingSetUnchanged: true,
		cacheRead: 0,
		cacheWrite: 0,
		latencyMs: performance.now() - startAt,
		childLatencyMs: report.outcomes.map((o) => o.latencyMs),
		provider: "controlled Pi fixture, no remote service or superiority claim",
	};
	await client.close();
	client = undefined;
	await start(session);
	const resumed = await query("/aco delegation");
	assert.equal(resumed.reservedTokens, report.reservedTokens);
	assert.ok(resumed.outcomes.every((o) => o.status === "verified"));
	assert.equal(
		resumed.authority.length,
		0,
		"no authorization survives runtime reload",
	);
	await command("/aco config maxDelegationTokens 1");
	await command(
		"/aco delegate " + JSON.stringify({ tasks: [contract("child-c")] }),
	);
	assert.match(
		client.events
			.filter((e) => e.type === "extension_ui_request" && e.method === "notify")
			.at(-1).message,
		/budget/,
	);
	assert.equal(
		(await readFile(requests, "utf8"))
			.trim()
			.split("\n")
			.map(JSON.parse)
			.filter((r) => r.child).length,
		2,
	);
	await client.close();
	client = undefined;
	console.log(
		JSON.stringify(
			{
				passed: true,
				node: process.version,
				host: "Pi 1.5.0",
				isolatedInstalledPackage: true,
				metrics,
			},
			null,
			2,
		),
	);
} finally {
	await client?.dispose();
	await rm(root, { recursive: true, force: true });
}
