import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { startPi } from "./pi-client.mjs";

const here = dirname(fileURLToPath(import.meta.url)),
	pkg = resolve(here, "..");
const root = await mkdtemp(join(tmpdir(), "pi-aco-compaction-"));
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
	const faultFixture = join(root, "compaction-fixture.js");
	await cp(join(here, "compaction-fixture.js"), faultFixture);
	const fault = join(root, "fault.txt");
	const agent = join(root, "agent");
	const requests = join(root, "requests.jsonl");
	await mkdir(agent);
	await writeFile(
		join(agent, "settings.json"),
		JSON.stringify({
			compaction: {
				enabled: false,
				keepRecentTokens: 100,
				reserveTokens: 4096,
			},
		}),
	);

	const start = async (session, cwd = root) => {
		client = startPi({
			cwd,
			env: {
				PI_CODING_AGENT_DIR: agent,
				ACO_REQUESTS: requests,
				ACO_FAULT: fault,
				ACO_FAULT_ROOT: root,
			},
			extensions: [installed, fixture, faultFixture],
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

	await start();
	const researchFile = join(root, "research.txt");
	const original =
		"Decision: use API v2; rationale: compatibility; constraint: preserve exact 0xDEADBEEF\n".repeat(
			1000,
		);
	await writeFile(researchFile, original);
	await prompt("V3_RESEARCH");
	let probe = await query("/evidence-probe");
	const result = probe.branch.find(
		(e) => e.type === "message" && e.message.role === "toolResult",
	);
	const resultId = result.id;
	await command(
		`/aco declare ${JSON.stringify({
			taskId: "v3-task",
			active: true,
			status: "running",
			requiredContextIds: ["exact"],
			references: [
				{
					id: "exact",
					kind: "evidence",
					sourceEntryIds: [resultId],
					pinned: true,
					precisionSensitive: true,
				},
			],
		})}`,
	);
	const checkpoint = await query(
		`/aco checkpoint ${JSON.stringify({ sourceEntryIds: [resultId] })}`,
	);
	assert.equal(checkpoint.recoverable, true);
	await command("/aco config mode compact");
	const localRequest = `/aco summarize ${JSON.stringify({ sourceEntryIds: [resultId] })}`;
	assert.equal((await query(localRequest)).status, "recommendation");
	assert.equal((await query("/aco compact")).status, "recommendation");
	assert.ok(
		!client.events.some(
			(e) => e.type === "extension_ui_request" && e.method === "confirm",
		),
		"RPC must never wait for confirmation",
	);
	const grant = async (operation, ids) =>
		query(
			`/aco authorize ${JSON.stringify({
				operation,
				taskId: "v3-task",
				sourceEntryIds: ids,
				maxInputTokens: 64000,
				maxSummaryTokens: 8000,
			})}`,
		);
	await grant("semantic", [resultId]);
	await command("/aco config maxCompactInputTokens 1");
	await command(localRequest);
	assert.match(notice().message, /budget/);
	assert.ok(
		!(await query("/evidence-probe")).branch.some(
			(e) => e.type === "context_edit",
		),
	);
	await command("/aco config maxCompactInputTokens 64000");
	await grant("semantic", [resultId]);
	await command(
		`/aco summarize ${JSON.stringify({ sourceEntryIds: [resultId], summary: "Plausible but unsupported paraphrase" })}`,
	);
	assert.match(notice().message, /equivalence verification failed/);
	assert.ok(
		!(await query("/evidence-probe")).branch.some(
			(e) => e.type === "context_edit",
		),
	);
	assert.equal((await query(localRequest)).status, "scheduled");
	await prompt("Apply local summary at a completed turn boundary");
	probe = await query("/evidence-probe");
	const replacement = probe.branch.find(
		(e) => e.type === "context_edit" && e.targetId === resultId,
	);
	assert.ok(
		replacement?.replacement,
		JSON.stringify(await query("/aco compaction")),
	);
	assert.ok(JSON.stringify(replacement).includes("0xDEADBEEF"));
	assert.deepEqual(
		probe.branch.find((e) => e.id === resultId),
		result,
		"raw source unchanged",
	);
	assert.equal(
		(await query("/aco compaction")).actions.at(-1).status,
		"committed",
	);
	await prompt("Continue using the exact historical decision");
	const afterLocal = (await jsonLines(requests)).at(-1);
	assert.ok(JSON.stringify(afterLocal).includes("aco-extractive-v1"));
	assert.ok(JSON.stringify(afterLocal).includes("compatibility"));
	assert.ok(
		!JSON.stringify(afterLocal).includes(original.slice(0, 20000)),
		"provider receives summary rather than repeated raw body",
	);

	assert.equal((await query(`/aco restore ${resultId}`)).scheduled, true);
	await prompt("Commit verified local restoration");
	probe = await query("/evidence-probe");
	assert.deepEqual(
		probe.projection.find((m) => m.role === "toolResult").content,
		result.message.content,
	);
	const allIds = probe.projectionSourceIds;
	await query(`/aco checkpoint ${JSON.stringify({ sourceEntryIds: allIds })}`);
	await grant("native", allIds);
	const preNative = (await query("/evidence-probe")).leaf;
	await command("/aco config maxCompactInputTokens 1");
	await command("/aco compact");
	assert.match(notice().message, /budget/);
	assert.ok(
		!(await query("/evidence-probe")).branch.some(
			(e) => e.type === "compaction",
		),
	);
	await command("/aco config maxCompactInputTokens 64000");
	await grant("native", (await query("/evidence-probe")).projectionSourceIds);
	const providerRequestsBeforeNative = (await jsonLines(requests)).length;
	const requested = await query("/aco compact");
	assert.ok(
		["requested", "prepared", "committed"].includes(requested.status),
		JSON.stringify(requested),
	);
	const terminal = async () => {
		const deadline = Date.now() + 20000;
		while (Date.now() < deadline) {
			const status = await query("/aco compaction");
			if (["committed", "failed", "cancelled"].includes(status.last?.status))
				return status;
			await new Promise((resolve) => setTimeout(resolve, 25));
		}
		throw Error("Native completion not observed");
	};
	let status = await terminal();
	assert.equal(status.last.status, "committed", JSON.stringify(status.last));
	assert.equal(
		(await jsonLines(requests)).length,
		providerRequestsBeforeNative,
		"ACO extractive native summary makes no provider calls",
	);
	assert.equal(status.last.modelCalls, 0);
	probe = await query("/evidence-probe");
	const compactEntry = probe.branch
		.filter((e) => e.type === "compaction")
		.at(-1);
	assert.ok(compactEntry?.fromHook);
	assert.equal(
		compactEntry.firstKeptEntryId,
		probe.branch.find((e) => e.id === compactEntry.firstKeptEntryId).id,
	);
	assert.ok(compactEntry.summary.includes("0xDEADBEEF"));
	assert.deepEqual(
		probe.branch.find((e) => e.id === resultId),
		result,
	);
	await prompt(
		"Continue after native prefix compaction with the preserved decision",
	);
	assert.ok(
		JSON.stringify((await jsonLines(requests)).at(-1)).includes(
			"compatibility",
		),
	);
	const recall = await query(
		`/aco recall ${JSON.stringify({ checkpointId: checkpoint.checkpointId, segmentId: resultId, budgetBytes: 4096 })}`,
	);
	assert.equal(recall.historical, true);
	assert.ok(recall.text.includes("0xDEADBEEF"));
	const sessionFile = probe.sessionFile;
	await client.close();
	client = undefined;
	await start(sessionFile);
	assert.deepEqual(
		(await query("/aco compaction")).permissions,
		[],
		"automation grants do not survive restart",
	);
	await prompt("Resume native-compacted task continuity");
	assert.ok(
		JSON.stringify((await jsonLines(requests)).at(-1)).includes("0xDEADBEEF"),
	);

	// Recover the exact prefix through Pi's supported tree API, then exercise cancellation/failure accounting.
	await command(`/evidence-tree ${preNative}`);
	probe = await query("/evidence-probe");
	assert.ok(
		probe.projection.some(
			(m) =>
				m.role === "toolResult" &&
				JSON.stringify(m.content) === JSON.stringify(result.message.content),
		),
	);
	await grant("native", probe.projectionSourceIds);
	await writeFile(fault, "cancel");
	await query("/aco compact");
	status = await terminal();
	assert.equal(status.last.status, "cancelled", JSON.stringify(status.last));
	assert.ok(
		!(await query("/evidence-probe")).branch.some(
			(e) => e.type === "compaction",
		),
	);
	await writeFile(fault, "write-fail");
	await query("/aco compact");
	status = await terminal();
	assert.equal(status.last.status, "failed");
	assert.equal(status.last.executed, false);
	assert.ok(
		!(await jsonLines(sessionFile)).some(
			(e) =>
				e.type === "compaction" && e.details?.acoActionId === status.last.id,
		),
		"Failed native session append must not be reported as durable success",
	);
	await command(`/evidence-tree ${preNative}`);
	probe = await query("/evidence-probe");
	await grant("native", probe.projectionSourceIds);
	await writeFile(fault, "interfere");
	await query("/aco compact");
	status = await terminal();
	assert.equal(status.last.status, "failed");
	assert.match(status.last.error, /differs from verified ACO proposal/);
	await command(`/evidence-tree ${preNative}`);
	probe = await query("/evidence-probe");
	assert.ok(
		probe.projection.some(
			(m) =>
				m.role === "toolResult" &&
				JSON.stringify(m.content) === JSON.stringify(result.message.content),
		),
	);
	await client.close();
	client = undefined;
	console.log(
		"PASS installed Pi V3: unauthorized RPC no-op, scoped automation, failed-summary rejection, verified local replacement/restoration, native prefix completion, cancellation/interference, resume, raw history and tree recovery; deterministic summary model overhead 0, aggregate provider/cache costs not inferred",
	);
} finally {
	await client?.close();
	await rm(root, { recursive: true, force: true });
}
