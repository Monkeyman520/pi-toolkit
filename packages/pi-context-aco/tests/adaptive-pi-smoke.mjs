import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { startPi } from "./pi-client.mjs";

const here = dirname(fileURLToPath(import.meta.url)),
	pkg = resolve(here, ".."),
	root = await mkdtemp(join(tmpdir(), "aco-adaptive-"));
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
const reports = [];
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
		fixture = join(root, "adaptive-fixture.js");
	await cp(join(here, "adaptive-fixture.js"), fixture);
	for (const policy of ["no-ACO", "adaptive"]) {
		const agent = join(root, policy),
			requests = join(root, policy + "-requests.jsonl");
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
		client = startPi({
			cwd: root,
			env: { PI_CODING_AGENT_DIR: agent, ACO_REQUESTS: requests },
			extensions: policy === "adaptive" ? [installed, fixture] : [fixture],
			persist: true,
		});
		await client.command("get_commands");
		await client.command("set_model", {
			provider: "adaptive-fixture",
			modelId: "test",
		});
		await client.command("set_auto_compaction", { enabled: false });
		const command = (message) => client.command("prompt", { message });
		const query = async (message) => {
			const before = client.events.length;
			await command(message);
			const n = client.events
				.slice(before)
				.filter(
					(e) => e.type === "extension_ui_request" && e.method === "notify",
				)
				.at(-1);
			assert.ok(n, "No notice for " + message);
			const text = n.message;
			return JSON.parse(
				text.startsWith("{") || text === "null"
					? text
					: text.slice(text.indexOf("\n") + 1),
			);
		};
		const prompt = async (message) => {
			const n = client.events.filter((e) => e.type === "agent_settled").length;
			await command(message);
			await client.until(
				() =>
					client.events.filter((e) => e.type === "agent_settled").length > n,
			);
		};
		const started = performance.now();
		await prompt("RESEARCH:discard");
		await prompt("RESEARCH:retain");
		let probe = await query("/adaptive-probe");
		const results = probe.branch.filter(
			(e) => e.type === "message" && e.message.role === "toolResult",
		);
		assert.equal(results.length, 2);
		const [discard, retain] = results.map((e) => e.id);
		if (policy === "adaptive") {
			await query(
				"/aco declare " +
					JSON.stringify({
						taskId: "parent",
						active: true,
						phase: "implement",
						remainingSteps: 3,
						estimatedFutureTokens: 10000,
						references: [
							{
								id: "old",
								kind: "evidence",
								sourceEntryIds: [discard],
								completedResearch: true,
							},
							{
								id: "exact",
								kind: "evidence",
								sourceEntryIds: [retain],
								pinned: true,
								precisionSensitive: true,
							},
						],
						requiredContextIds: ["exact"],
					}),
			);
			// V1 passivity despite runnable proposals, and stable assessment reuse.
			const before = await query("/aco trace");
			assert.equal(
				(await query("/aco trace")).analysis.reassessments,
				before.analysis.reassessments,
			);
			await command(
				"/aco compose " +
					JSON.stringify({
						steps: [
							{ kind: "checkpoint", request: { sourceEntryIds: [discard] } },
						],
					}),
			);
			assert.match(
				client.events
					.filter(
						(e) => e.type === "extension_ui_request" && e.method === "notify",
					)
					.at(-1).message,
				/Adaptive mode must be explicitly enabled/,
			);
			assert.equal(
				(await query("/adaptive-probe")).branch.filter(
					(e) => e.type === "context_edit",
				).length,
				0,
			);
			await command("/aco config mode adaptive");
			const decision = (await query("/aco trace")).adaptiveDecision;
			assert.equal(decision.selected, "exact");
			assert.equal(decision.modelDecisionCalls, 0);
			// Exact automatic permission never authorizes the following semantic step.
			const steps = [
				{ kind: "checkpoint", request: { sourceEntryIds: [discard, retain] } },
				{ kind: "prune", request: { sourceEntryIds: [discard] } },
				{ kind: "semantic", request: { sourceEntryIds: [retain] } },
			];
			const composed = await query("/aco compose " + JSON.stringify({ steps }));
			assert.equal(composed.status, "pending", JSON.stringify(composed));
			assert.equal((await query("/aco advance")).status, "pending");
			await prompt("Commit selected exact removal");
			const blocked = await query("/aco advance");
			assert.equal(blocked.status, "blocked", JSON.stringify(blocked));
			assert.equal(blocked.results.at(-1).evidence.status, "recommendation");
			assert.equal((await query("/aco compaction")).localPending.length, 0);
			assert.ok(
				!client.events.some(
					(e) => e.type === "extension_ui_request" && e.method === "confirm",
				),
			);
			await query(
				"/aco authorize " +
					JSON.stringify({
						operation: "semantic",
						taskId: "parent",
						sourceEntryIds: [retain],
						maxInputTokens: 64000,
						maxSummaryTokens: 8000,
					}),
			);
			assert.equal(
				(
					await query(
						"/aco compose " +
							JSON.stringify({
								steps: [
									{ kind: "semantic", request: { sourceEntryIds: [retain] } },
									{ kind: "offload", request: { sourceEntryIds: [retain] } },
								],
							}),
					)
				).status,
				"pending",
			);
			await prompt("Commit independently authorized summary");
			assert.equal((await query("/aco advance")).status, "complete");
			probe = await query("/adaptive-probe");
			assert.ok(
				!JSON.stringify(probe.projection).includes("discard: compatibility"),
			);
			assert.ok(JSON.stringify(probe.projection).includes("aco-extractive-v1"));
			assert.deepEqual(
				probe.branch.find((e) => e.id === retain),
				results[1],
				"raw history preserved",
			);
			// Restoration uses the real evidence store at the next completed boundary.
			await query("/aco restore " + discard);
			await prompt("Recover discarded historical evidence");
			probe = await query("/adaptive-probe");
			assert.ok(
				JSON.stringify(probe.projection).includes("discard: compatibility"),
			);
			const evidence = await query("/aco evidence");
			assert.ok(evidence.checkpoints.every((c) => c.status === "verified"));
			// Restored-but-edited sources remain ineligible; default selection must not blindly replay.
			const selectedRun = await query("/aco compose");
			assert.equal(
				selectedRun.status,
				"recommendation",
				JSON.stringify(selectedRun),
			);
			assert.equal(selectedRun.decision.selected, "no-op");
			await query("/aco revoke");
			assert.equal((await query("/aco composition")).status, "complete");
		} else {
			// Same number of parent task turns; control does not unload/compact.
			await prompt("Commit selected exact removal");
			await prompt("Commit independently authorized summary");
			await prompt("Recover discarded historical evidence");
		}
		await prompt("Verify final compatibility constraint");
		probe = await query("/adaptive-probe");
		const last = probe.branch
			.filter((e) => e.type === "message" && e.message.role === "assistant")
			.at(-1);
		assert.match(JSON.stringify(last), /CONTINUITY_OK/);
		const samples = (await readFile(requests, "utf8"))
			.trim()
			.split("\n")
			.map(JSON.parse);
		reports.push({
			policy,
			evidenceClass:
				"controlled deterministic provider, NOT a representative-model benchmark",
			task: "two independent historical research segments; retain exact compatibility; continue and restore",
			taskSuccess: true,
			continuity: true,
			recoveryAttempts: policy === "adaptive" ? 1 : 0,
			recoveryFailures: 0,
			mistakenDecisions: 0,
			totalParentTokens: samples
				.filter((s) => !s.child)
				.reduce((n, s) => n + s.usage.totalTokens, 0),
			totalChildTokens: 0,
			managementModelTokens: 0,
			cost: 0,
			cacheRead: 0,
			cacheWrite: 0,
			newInputTokens: samples.reduce((n, s) => n + s.usage.input, 0),
			accountingSource:
				"Fixture-generated length/4 usage and zero tariff, not live provider measurements",
			latencyMs: performance.now() - started,
			humanInterventions: 0,
			scriptedControlActions:
				policy === "adaptive"
					? "explicit composition, grant, advancement, restore and revoke"
					: "none",
			parentProjectionBytes: Buffer.byteLength(
				JSON.stringify(probe.projection),
			),
		});
		if (policy === "adaptive") {
			// Additional mechanism checks, deliberately outside the paired comparison window.
			await command("/aco config maxDelegationTokens 1000000");
			await query(
				"/aco declare " +
					JSON.stringify({
						taskId: "independent",
						active: false,
						delegatable: true,
						writeConflictRisk: 0,
						writeResources: [],
					}),
			);
			const checkpoint = await query(
				"/aco checkpoint " + JSON.stringify({ sourceEntryIds: [retain] }),
			);
			await query(
				"/aco authorize " +
					JSON.stringify({
						operation: "delegate",
						taskIds: ["independent"],
						maxTokens: 1000000,
					}),
			);
			const childStep = {
				kind: "delegate",
				request: {
					tasks: [
						{
							taskId: "independent",
							goal: "Inspect compatibility evidence",
							constraints: ["Read-only"],
							acceptance: ["Report evidence"],
							resources: [],
							evidence: [
								{ checkpointId: checkpoint.checkpointId, segmentId: retain },
							],
						},
					],
				},
			};
			const childRun = await query(
				"/aco compose " +
					JSON.stringify({
						steps: [
							childStep,
							{ kind: "checkpoint", request: { sourceEntryIds: [retain] } },
						],
					}),
			);
			assert.equal(childRun.status, "pending", JSON.stringify(childRun));
			assert.equal(
				(await query("/aco advance")).status,
				"pending",
				"child return alone never permits dependent work",
			);
			const childId = childRun.results[0].evidence.ids[0];
			await query(
				"/aco reconcile " +
					JSON.stringify({
						id: childId,
						accepted: true,
						verification: [
							"Parent checked explicit compatibility evidence and no-shell disclosure",
						],
					}),
			);
			assert.equal((await query("/aco advance")).status, "complete");
			const accounting = (await query("/aco trace")).aggregateUsage;
			assert.ok(accounting.byOwner.child.totalTokens > 0);
			probe = await query("/adaptive-probe");
			await query(
				"/aco checkpoint " +
					JSON.stringify({ sourceEntryIds: probe.sourceIds }),
			);
			await query(
				"/aco authorize " +
					JSON.stringify({
						operation: "native",
						taskId: "parent",
						sourceEntryIds: probe.sourceIds,
						maxInputTokens: 64000,
						maxSummaryTokens: 8000,
					}),
			);
			const nativeRun = await query(
				"/aco compose " +
					JSON.stringify({
						steps: [
							{ kind: "native" },
							{ kind: "checkpoint", request: { sourceEntryIds: [retain] } },
						],
					}),
			);
			assert.equal(nativeRun.status, "pending", JSON.stringify(nativeRun));
			const deadline = Date.now() + 20000;
			let terminal;
			do {
				terminal = await query("/aco compaction");
				if (
					["committed", "failed", "cancelled"].includes(terminal.last?.status)
				)
					break;
				await new Promise((resolve) => setTimeout(resolve, 25));
			} while (Date.now() < deadline);
			assert.equal(
				terminal.last?.status,
				"committed",
				JSON.stringify(terminal),
			);
			const nativeCompleted = await query("/aco advance");
			assert.equal(
				nativeCompleted.status,
				"complete",
				JSON.stringify(nativeCompleted),
			);
			probe = await query("/adaptive-probe");
			const session = probe.sessionFile;
			assert.ok((await readFile(session, "utf8")).includes("aco-composition"));
			await client.close();
			client = startPi({
				cwd: root,
				env: { PI_CODING_AGENT_DIR: agent, ACO_REQUESTS: requests },
				extensions: [installed, fixture],
				persist: true,
				args: ["--session", session],
			});
			await client.command("get_commands");
			assert.equal(
				await query("/aco composition"),
				null,
				"restart never replays scheduling",
			);
		}
		await client.close();
		client = undefined;
	}
	const report = {
		runs: reports,
		superiority: "not established",
		representativeTasks: "not run; controlled mechanism evidence only",
	};
	if (process.env.ACO_EVALUATION_OUTPUT)
		await writeFile(
			process.env.ACO_EVALUATION_OUTPUT,
			JSON.stringify(report, null, 2) + "\n",
		);
	console.log(JSON.stringify(report, null, 2));
} finally {
	await client?.dispose();
	await rm(root, { recursive: true, force: true });
}
