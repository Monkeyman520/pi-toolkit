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
const root = await mkdtemp(join(tmpdir(), "aco-lifecycle-"));
const npm =
	process.env.npm_execpath ??
	join(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
let client;
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
		.map((line) => JSON.parse(line));

// Independent transcript assertion, not the production legalMessages implementation.
function legal(messages) {
	assert.equal(messages[0].role, "system");
	assert.ok(
		messages
			.filter((m) => m.role === "system")
			.flatMap((m) => m.toolsAdded ?? [])
			.some((t) => t.name === "read"),
	);
	const pending = new Map();
	for (const message of messages) {
		if (message.role === "toolResult") {
			assert.equal(pending.get(message.toolCallId), message.toolName);
			pending.delete(message.toolCallId);
		} else {
			assert.equal(pending.size, 0, "unanswered tool call");
			for (const block of Array.isArray(message.content)
				? message.content
				: []) {
				if (block.type === "toolCall") {
					assert.ok(!pending.has(block.id));
					pending.set(block.id, block.name);
				}
			}
		}
	}
	assert.equal(pending.size, 0);
	for (const name of ["peer-a", "peer-b"])
		assert.equal(
			messages.filter((m) => m.content === "CONTEXT:" + name).length,
			1,
		);
}
try {
	const info = JSON.parse(
		run(
			["pack", "--ignore-scripts", "--json", "--pack-destination", root],
			pkg,
		),
	)[0];
	assert.deepEqual(info.bundled, ["pi-plugin-support"]);
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
	await cp(join(here, "evidence-fixture.js"), fixture);
	const peers = ["peer-a", "peer-b"].map((name) => join(root, name + ".js"));
	await Promise.all(
		peers.map((path) => cp(join(here, "lifecycle-peer.js"), path)),
	);

	for (const reverse of [false, true]) {
		const agent = join(root, reverse ? "reverse" : "forward");
		await mkdir(agent);
		await writeFile(
			join(agent, "settings.json"),
			JSON.stringify({
				retry: {
					enabled: false,
					maxRetries: 1,
					baseDelayMs: 1000,
					maxAgentDelayMs: 1000,
				},
			}),
		);
		const requests = join(agent, "requests.jsonl");
		const peerLog = join(agent, "peers.jsonl");
		const ordered = reverse ? [...peers].reverse() : peers;
		client = startPi({
			cwd: root,
			env: {
				PI_CODING_AGENT_DIR: agent,
				ACO_REQUESTS: requests,
				ACO_PEER_LOG: peerLog,
			},
			extensions: [ordered[0], installed, ordered[1], fixture],
			persist: true,
		});
		const commands = (await client.command("get_commands")).commands;
		for (const name of ["auto-resume", "quota", "pretty-session", "ps"])
			assert.ok(!commands.some((c) => c.name === name));
		await client.command("set_model", {
			provider: "evidence-fixture",
			modelId: "test",
		});
		await client.command("set_auto_compaction", { enabled: false });
		await client.command("set_auto_retry", { enabled: false });
		const command = (message) => client.command("prompt", { message });
		const query = async (message) => {
			const before = client.events.length;
			await command(message);
			const notice = client.events
				.slice(before)
				.filter(
					(e) => e.type === "extension_ui_request" && e.method === "notify",
				)
				.at(-1);
			assert.ok(notice, message);
			const raw = notice.message;
			return JSON.parse(
				raw.startsWith("{") ? raw : raw.slice(raw.indexOf("\n") + 1),
			);
		};
		const prompt = async (message) => {
			const before = client.events.filter(
				(e) => e.type === "agent_settled",
			).length;
			await command(message);
			await client.until(
				() =>
					client.events.filter((e) => e.type === "agent_settled").length >
					before,
			);
			assert.equal((await client.command("get_state")).isStreaming, false);
		};
		const original = "T0008_ORIGINAL_RESEARCH_BYTES_0x42";
		const source = join(agent, "research.txt");
		await writeFile(source, original);
		await prompt("READ_SOURCE:" + source);
		let probe = await query("/evidence-probe");
		const rawSource = probe.branch.find(
			(e) => e.type === "message" && e.message.role === "toolResult",
		);
		assert.ok(rawSource);
		await query(
			"/aco declare " +
				JSON.stringify({
					taskId: "research",
					active: true,
					status: "completed",
					references: [
						{
							id: "research",
							kind: "evidence",
							sourceEntryIds: [rawSource.id],
							completedResearch: true,
						},
					],
				}),
		);
		assert.equal(
			(
				await query(
					"/aco checkpoint " +
						JSON.stringify({ sourceEntryIds: [rawSource.id] }),
				)
			).recoverable,
			true,
		);
		await prompt("V1 keeps archived evidence");
		assert.ok(
			JSON.stringify((await lines(requests)).at(-1)).includes(original),
		);
		await command("/aco config mode exact-prune");
		await prompt("Prune with two co-loaded peers");
		probe = await query("/evidence-probe");
		assert.ok(
			probe.branch.some(
				(e) =>
					e.type === "context_edit" &&
					e.targetId === rawSource.id &&
					e.replacement === null,
			),
		);
		assert.ok(!JSON.stringify(probe.projection).includes(original));
		assert.ok(
			!JSON.stringify((await lines(requests)).at(-1)).includes(original),
		);
		assert.deepEqual(
			probe.branch.find((e) => e.id === rawSource.id),
			rawSource,
		);
		// Earlier proposals survive ACO; later proposals see ACO's draft edits.
		const markers = probe.branch
			.filter((e) => e.type === "custom" && e.customType === "t0008-peer")
			.map((e) => e.data);
		assert.equal(
			markers.filter((e) => e.name === "peer-a").length,
			markers.filter((e) => e.name === "peer-b").length,
		);
		const laterPeer = reverse ? "peer-a" : "peer-b";
		assert.ok(markers.some((e) => e.name === laterPeer && e.sawEdit));
		assert.ok(markers.length >= 8);
		const restore = await query("/aco restore " + rawSource.id);
		assert.equal(restore.scheduled, true);
		assert.equal(restore.restored, false);
		await prompt("Commit restoration");
		await prompt("Provider observes restored evidence");
		assert.ok(
			JSON.stringify((await lines(requests)).at(-1)).includes(original),
		);
		const beforeReload = await query("/evidence-probe");
		await command("/peer-a reload");
		const afterReload = await query("/evidence-probe");
		assert.equal(afterReload.sessionId, beforeReload.sessionId);
		assert.deepEqual(
			afterReload.branch.filter((e) => e.type === "context_edit"),
			beforeReload.branch.filter((e) => e.type === "context_edit"),
		);
		for (const name of ["peer-a", "peer-b"]) {
			const peer = await query("/" + name);
			assert.equal(
				peer.hits,
				1,
				"fresh peer owns exactly one listener after reload",
			);
			assert.deepEqual(peer.panels.sort(), [
				"peer-a",
				"peer-b",
				"pi-context-aco",
			]);
		}
		await prompt("Peers and ACO function after reload");
		assert.equal((await query("/aco status")).running, false);
		await client.command("set_auto_retry", { enabled: false });
		await command("/evidence-partial");
		await prompt("Controlled positive partial response");
		assert.equal(
			(await query("/aco status")).providerUsage.totalTokens.value,
			96853,
		);
		await command("/aco config mode delegate");
		await query(
			'/aco declare {"taskId":"partial-usage-child","delegatable":true,"writeConflictRisk":0,"dependencies":[],"writeResources":[]}',
		);
		await query(
			'/aco authorize {"operation":"delegate","taskIds":["partial-usage-child"],"maxTokens":100000}',
		);
		const partialRequests = (await lines(requests)).length;
		await command(
			'/aco delegate {"tasks":[{"taskId":"partial-usage-child","goal":"inspect","constraints":[],"acceptance":["report"],"resources":[],"evidence":[]}]}',
		);
		assert.match(
			client.events
				.filter(
					(e) => e.type === "extension_ui_request" && e.method === "notify",
				)
				.at(-1).message,
			/Parent token usage unknown/,
		);
		assert.equal((await lines(requests)).length, partialRequests);
		assert.equal((await query("/aco delegation")).reservedTokens, 0);
		await client.command("set_auto_retry", { enabled: true });
		for (const failures of [1, 2]) {
			await command("/evidence-failures " + failures);
			const start = client.events.length;
			await command("Host retry scenario " + failures);
			await client.until(() =>
				client.events.slice(start).some((e) => e.type === "auto_retry_start"),
			);
			assert.ok(
				!client.events.slice(start).some((e) => e.type === "agent_settled"),
				"first agent_end is not final idle during retry",
			);
			assert.equal((await query("/aco status")).running, true);
			await client.until(() =>
				client.events.slice(start).some((e) => e.type === "agent_settled"),
			);
			const events = client.events.slice(start);
			assert.equal(events.filter((e) => e.type === "agent_end").length, 2);
			assert.equal(events.filter((e) => e.type === "agent_settled").length, 1);
			assert.equal(
				events.find((e) => e.type === "auto_retry_end").success,
				failures === 1,
			);
			assert.equal(
				events.at(-1).type === "agent_settled" ||
					events.findLastIndex((e) => e.type === "agent_settled") >
						events.findLastIndex((e) => e.type === "agent_end"),
				true,
			);
			assert.equal((await client.command("get_state")).isStreaming, false);
			const accounting = await query("/aco status");
			assert.equal(accounting.running, false);
			assert.equal(accounting.aggregateUsage.total.totalTokens, null);
			if (failures === 2) {
				assert.equal(accounting.providerUsage.totalTokens.value, null);
				assert.equal(accounting.providerUsage.costTotal.value, null);
			}
		}
		await client.command("set_auto_retry", { enabled: false });
		await command("/aco config mode delegate");
		await query(
			'/aco declare {"taskId":"usage-child","delegatable":true,"writeConflictRisk":0,"dependencies":[],"writeResources":[]}',
		);
		await query(
			'/aco authorize {"operation":"delegate","taskIds":["usage-child"],"maxTokens":100000}',
		);
		const beforeBudgetRefusal = (await lines(requests)).length;
		await command(
			'/aco delegate {"tasks":[{"taskId":"usage-child","goal":"inspect","constraints":[],"acceptance":["report"],"resources":[],"evidence":[]}]}',
		);
		assert.match(
			client.events
				.filter(
					(e) => e.type === "extension_ui_request" && e.method === "notify",
				)
				.at(-1).message,
			/Parent token usage unknown/,
		);
		assert.equal((await lines(requests)).length, beforeBudgetRefusal);
		const denied = await query("/aco delegation");
		assert.equal(denied.reservedTokens, 0);
		assert.equal(denied.active, 0);
		assert.deepEqual(denied.outcomes, []);
		assert.ok(
			!(await client.command("get_entries")).entries.some(
				(e) => e.type === "custom" && e.customType === "aco-delegation-intent",
			),
		);
		for (const transcript of await lines(requests)) legal(transcript);
		const persisted = await lines(afterReload.sessionFile);
		assert.deepEqual(
			persisted.find((e) => e.id === rawSource.id),
			rawSource,
		);
		const runtimeEvents = [...client.events];
		await client.close();
		client = undefined;
		const lifecycle = await lines(peerLog);
		for (const name of ["peer-a", "peer-b"]) {
			assert.deepEqual(
				lifecycle
					.filter((e) => e.name === name && e.event === "start")
					.map((e) => e.reason),
				["startup", "reload"],
			);
			const stops = lifecycle.filter(
				(e) => e.name === name && e.event === "shutdown",
			);
			assert.deepEqual(
				stops.map((e) => e.reason),
				["reload", "quit"],
			);
			assert.ok(stops.every((e) => e.ownListenerAlive));
		}
		await saveEvidence(reverse ? "lifecycle-reverse" : "lifecycle-forward", {
			passed: true,
			events: runtimeEvents,
			lifecycle,
			persisted,
			providerRequests: await lines(requests),
		});
		console.log(
			"PASS installed Pi lifecycle/composition: " +
				(reverse ? "peer-b → ACO → peer-a" : "peer-a → ACO → peer-b"),
		);
	}
} finally {
	await client?.dispose();
	await rm(root, { recursive: true, force: true });
}
