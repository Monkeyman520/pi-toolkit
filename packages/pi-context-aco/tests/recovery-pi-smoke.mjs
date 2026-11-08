import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { startPi } from "./pi-client.mjs";
import { saveEvidence } from "./pi-test-artifacts.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const pkg = resolve(here, "..");
const root = await mkdtemp(join(tmpdir(), "aco-recovery-host-"));
const npm =
	process.env.npm_execpath ??
	join(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
const run = (args, cwd) => {
	const result = spawnSync(process.execPath, [npm, ...args], {
		cwd,
		encoding: "utf8",
		timeout: 60000,
	});
	assert.equal(result.status, 0, result.stderr);
	return result.stdout;
};
const lines = async (path) =>
	(await readFile(path, "utf8"))
		.trim()
		.split("\n")
		.filter(Boolean)
		.map(JSON.parse);
let client;
const evidence = [];
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
	const installed = join(consumer, "node_modules", "pi-context-aco");
	const fixture = join(root, "evidence-fixture.js");
	const fault = join(root, "recovery-fault-fixture.js");
	await cp(join(here, "evidence-fixture.js"), fixture);
	await cp(join(here, "recovery-fault-fixture.js"), fault);
	const agent = join(root, "agent");
	await mkdir(agent);
	const requests = join(root, "requests.jsonl");
	const start = async (session) => {
		client = startPi({
			cwd: root,
			persist: true,
			env: {
				PI_CODING_AGENT_DIR: agent,
				ACO_REQUESTS: requests,
				ACO_FAULT_ROOT: root,
			},
			extensions: [fault, fixture],
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
	const command = (message) => client.command("prompt", { message });
	const query = async (message) => {
		const n = client.events.length;
		await command(message);
		const notice = client.events
			.slice(n)
			.filter((e) => e.type === "extension_ui_request" && e.method === "notify")
			.at(-1);
		assert.ok(notice, message);
		const raw = notice.message;
		return JSON.parse(
			raw.startsWith("{") ? raw : raw.slice(raw.indexOf("\n") + 1),
		);
	};
	const prompt = async (message) => {
		const n = client.events.filter((e) => e.type === "agent_settled").length;
		const accepted = await command(message);
		assert.notEqual(
			accepted.disposition,
			"handled",
			JSON.stringify(
				client.events
					.filter((e) => e.type === "extension_ui_request")
					.slice(-4),
			),
		);
		await client.until(
			() => client.events.filter((e) => e.type === "agent_settled").length > n,
		);
	};
	await start();
	const original = "T0008_RECOVERABLE_ORIGINAL";
	const sourcePath = join(root, "research.txt");
	await writeFile(sourcePath, original);
	await prompt("READ_SOURCE:" + sourcePath);
	let probe = await query("/evidence-probe");
	const source = probe.branch.find(
		(e) => e.type === "message" && e.message.role === "toolResult",
	);
	assert.ok(source);
	await query(
		"/aco declare " +
			JSON.stringify({
				taskId: "research",
				active: true,
				status: "completed",
				references: [
					{
						id: "old",
						kind: "evidence",
						sourceEntryIds: [source.id],
						completedResearch: true,
					},
				],
			}),
	);
	const checkpoint =
		"/aco checkpoint " + JSON.stringify({ sourceEntryIds: [source.id] });
	await query("/recovery-fault readback");
	const n = client.events.length;
	await command(checkpoint);
	assert.ok(
		client.events
			.slice(n)
			.some(
				(e) =>
					e.type === "extension_ui_request" &&
					e.method === "notify" &&
					/CONTROLLED_READBACK_FAILURE/.test(e.message),
			),
		JSON.stringify({ events: client.events.slice(n), stderr: client.stderr }),
	);
	const audit = await query("/recovery-fault status");
	assert.equal(
		audit.audit[0].event,
		"readback-fault",
		"fault must really have fired in host",
	);
	assert.ok(audit.audit[0].acknowledgedWrites > 0);
	assert.equal((await query("/aco evidence")).lastUsableId, null);
	await command("/aco config mode exact-prune");
	await prompt("Keep originals after failed readback");
	assert.ok(JSON.stringify((await lines(requests)).at(-1)).includes(original));
	assert.ok(
		!(await query("/evidence-probe")).branch.some(
			(e) => e.type === "context_edit",
		),
	);
	evidence.push({
		scenario: "readback failure",
		audit,
		events: client.events.slice(n),
	});

	assert.equal((await query(checkpoint)).recoverable, true);
	await query("/recovery-fault partial");
	await prompt("Partially persisted paired omission");
	probe = await query("/evidence-probe");
	const injected = await query("/recovery-fault status");
	assert.ok(
		injected.audit.some((e) => e.event === "partial-append-fault"),
		"host filesystem fault must actually fire",
	);
	const action = (await query("/aco status")).pruning.actions.at(-1);
	assert.equal(action.status, "partial");
	assert.equal(action.success, false);
	assert.equal(action.observedTargetIds.length, 1);
	const session = probe.sessionFile;
	assert.equal(
		(await lines(session)).filter((e) => e.type === "context_edit").length,
		1,
	);
	await client.close();
	client = undefined;
	await start(session);
	assert.equal(
		(await query("/aco status")).pruning.actions.at(-1).status,
		"partial",
	);
	const editCount = (await query("/evidence-probe")).branch.filter(
		(e) => e.type === "context_edit",
	).length;
	const requestsBeforeRefusal = (await lines(requests)).length;
	assert.equal(
		(await command("No blind partial action replay")).disposition,
		"handled",
	);
	assert.equal((await lines(requests)).length, requestsBeforeRefusal);
	assert.ok(
		client.events.some(
			(e) =>
				e.type === "extension_ui_request" &&
				e.method === "notify" &&
				/partial.*restore/i.test(e.message),
		),
	);
	assert.equal(
		(await query("/evidence-probe")).branch.filter(
			(e) => e.type === "context_edit",
		).length,
		editCount,
	);
	const settledBeforeCustom = client.events.filter(
		(e) => e.type === "agent_settled",
	).length;
	await command("/recovery-trigger");
	await client.until(
		() =>
			client.events.filter((e) => e.type === "agent_settled").length >
			settledBeforeCustom,
	);
	assert.equal(
		(await lines(requests)).length,
		requestsBeforeRefusal,
		"custom-triggered run must abort before an invalid provider request",
	);
	const restore = await query("/aco restore " + source.id);
	assert.equal(restore.scheduled, true);
	await prompt("Restore partial paired omission");
	const requestAfterPartial = (await lines(requests)).at(-1);
	const pendingCalls = new Set();
	for (const message of requestAfterPartial) {
		if (message.role === "toolResult")
			assert.ok(pendingCalls.delete(message.toolCallId));
		else {
			assert.equal(
				pendingCalls.size,
				0,
				"restoration request must have legal tool relationships",
			);
			for (const block of Array.isArray(message.content) ? message.content : [])
				if (block.type === "toolCall") pendingCalls.add(block.id);
		}
	}
	assert.equal(pendingCalls.size, 0);
	await prompt("Provider sees verified originals");
	assert.ok(JSON.stringify((await lines(requests)).at(-1)).includes(original));
	probe = await query("/evidence-probe");
	assert.deepEqual(
		probe.branch.find((e) => e.id === source.id),
		source,
	);
	evidence.push({
		scenario: "partial append/restart/restore",
		action,
		injected,
		branch: probe.branch,
	});

	// Hold a real checkpoint I/O operation, then replace/reload the actual host runtime.
	for (const operation of ["disable", "reload", "new"]) {
		await query("/recovery-fault hold");
		const old = await query("/evidence-probe");
		const pending = command(checkpoint);
		let held;
		for (let i = 0; i < 100; i++) {
			held = await query("/recovery-fault status");
			if (held.audit.some((e) => e.event === "held-read")) break;
			await new Promise((resolve) => setTimeout(resolve, 25));
		}
		assert.ok(held.audit.some((e) => e.event === "held-read"));
		if (operation === "disable") {
			await command("/aco off");
			await command("/recovery-release");
		} else if (operation === "reload") await command("/recovery-reload");
		else assert.equal((await client.command("new_session")).cancelled, false);
		await pending;
		const replacement = await query("/evidence-probe");
		const oldPersisted = await lines(old.sessionFile);
		const intents = oldPersisted.filter(
			(e) => e.type === "custom" && e.customType === "aco-evidence-intent",
		);
		const interrupted = intents.at(-1).data.id;
		assert.ok(
			!oldPersisted.some(
				(e) =>
					e.type === "custom" &&
					e.customType === "aco-evidence-commit" &&
					e.data.id === interrupted,
			),
		);
		assert.ok(
			!replacement.branch.some(
				(e) =>
					e.type === "custom" &&
					e.customType === "aco-evidence-commit" &&
					e.data.id === interrupted,
			),
		);
		if (operation === "new") {
			assert.notEqual(replacement.sessionId, old.sessionId);
			assert.equal(
				replacement.branch.filter((e) => e.type === "context_edit").length,
				0,
			);
		} else assert.equal(replacement.sessionId, old.sessionId);
		evidence.push({
			scenario: "held checkpoint/" + operation,
			held,
			interrupted,
			oldPersisted,
			replacement,
		});
		if (operation === "disable") await command("/aco on");
	}
	await client.close();
	client = undefined;
	// Unmodified Pi with a missing configured provider: no mock context/capability removal.
	const noProviderAgent = join(root, "no-provider");
	await mkdir(noProviderAgent);
	await writeFile(
		join(noProviderAgent, "settings.json"),
		JSON.stringify({
			defaultProvider: "aco-unregistered-provider",
			defaultModel: "missing",
		}),
	);
	client = startPi({
		cwd: root,
		persist: true,
		env: { PI_CODING_AGENT_DIR: noProviderAgent },
		extensions: [installed],
	});
	await client.command("get_commands");
	await query('/aco declare {"taskId":"parent","active":true}');
	await query(
		'/aco declare {"taskId":"child","delegatable":true,"writeConflictRisk":0}',
	);
	await command("/aco config mode delegate");
	await query(
		'/aco authorize {"operation":"delegate","taskIds":["child"],"maxTokens":100000}',
	);
	const unavailable = await query(
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
	assert.equal(
		unavailable.status,
		"recommendation",
		JSON.stringify(unavailable),
	);
	assert.deepEqual(unavailable.ids, []);
	assert.match(unavailable.reason, /provider unavailable/);
	const noProvider = await query("/aco delegation");
	assert.equal(noProvider.reservedTokens, 0);
	assert.deepEqual(noProvider.outcomes, []);
	const noProviderEntries = (await client.command("get_entries")).entries;
	assert.ok(!noProviderEntries.some((e) => e.type === "context_edit"));
	assert.ok(
		!noProviderEntries.some(
			(e) => e.type === "custom" && e.customType.startsWith("aco-delegation-"),
		),
	);
	evidence.push({
		scenario: "actual unregistered provider",
		unavailable,
		noProvider,
		entries: noProviderEntries,
	});
	await client.close();
	client = undefined;
	await saveEvidence("recovery-host", {
		passed: true,
		evidenceClass:
			"actual isolated Pi; controlled test-only I/O faults, not an OS outage",
		evidence,
	});
	console.log(
		"PASS installed Pi: acknowledged-write/readback failure, partial boundary append, restart/no replay, verified restoration, held checkpoint reload/new-session invalidation",
	);
} finally {
	await client?.dispose();
	await rm(root, { recursive: true, force: true });
}
