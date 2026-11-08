// Opt-in live-provider evaluation, not part of npm test or any smoke script.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, writeFileSync } from "node:fs";
import {
	cp,
	mkdir,
	readdir,
	readFile,
	symlink,
	writeFile,
} from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { startPi } from "./pi-client.mjs";
import {
	prepareVerificationProfile,
	testProxyEnvironment,
	verificationEnvironment,
} from "./representative-environment.ts";
import {
	accountWholeRun,
	verificationCommands,
} from "./representative-evaluation-support.ts";
import {
	researchDeclaration,
	seedWorkload,
	workloads,
} from "./representative-workloads.ts";

const here = dirname(fileURLToPath(import.meta.url)),
	pkg = resolve(here, ".."),
	repo = resolve(pkg, "../..");
const baseline = "e4d51a805ba3aea1fce62bf4b632c2c3c29161c9";
const [operation, location, requestedTask = "P1"] = process.argv.slice(2);
assert.ok(Object.hasOwn(workloads, requestedTask), "Unknown workload");
const workload = workloads[requestedTask];
assert.ok(
	["--prepare", "--run"].includes(operation) && location,
	"Use --prepare/--run <new local artifact directory>",
);
const root = resolve(location),
	manifestPath = join(root, "manifest.json");
const npm =
	process.env.npm_execpath ??
	join(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
const providerPath =
	"C:/Users/Administrator/.pi/agent/npm/node_modules/pi-antigravity/src/index.ts";
const hash = (v) => createHash("sha256").update(v).digest("hex");
const json = (path, v) => writeFile(path, JSON.stringify(v, null, 2) + "\n");
const processRun = (args, cwd, env = process.env) => {
	const started = Date.now();
	const r = spawnSync(process.execPath, args, {
		cwd,
		env,
		encoding: "utf8",
		maxBuffer: 32 * 1024 * 1024,
	});
	return {
		args,
		status: r.status,
		signal: r.signal,
		stdout: r.stdout,
		stderr: r.stderr,
		error: r.error ? String(r.error) : null,
		elapsedMs: Date.now() - started,
	};
};
const npmRun = (args, cwd, env) => processRun([npm, ...args], cwd, env);
function git(args, encoding = "utf8") {
	const r = spawnSync("git", args, {
		cwd: repo,
		encoding,
		maxBuffer: 32 * 1024 * 1024,
	});
	assert.equal(r.status, 0, String(r.stderr));
	return r.stdout;
}
async function fileHashes(dir) {
	const rows = [];
	async function visit(p) {
		for (const e of (await readdir(p, { withFileTypes: true })).sort((a, b) =>
			a.name.localeCompare(b.name),
		)) {
			if (e.name === "node_modules" || e.name === ".pi" || e.isSymbolicLink())
				continue;
			const f = join(p, e.name);
			if (e.isDirectory()) await visit(f);
			else if (e.isFile())
				rows.push([
					relative(dir, f).replaceAll("\\", "/"),
					hash(await readFile(f)),
				]);
		}
	}
	await visit(dir);
	return rows.sort(([a], [b]) => a.localeCompare(b));
}
async function installCandidate() {
	const dir = join(root, "candidate");
	await mkdir(dir);
	const r = npmRun(
		["pack", "--ignore-scripts", "--json", "--pack-destination", dir],
		pkg,
	);
	await json(join(root, "candidate-pack.json"), r);
	assert.equal(r.status, 0, r.stderr);
	const info = JSON.parse(r.stdout)[0],
		tar = join(dir, info.filename),
		consumer = join(dir, "consumer");
	await mkdir(consumer);
	await json(join(consumer, "package.json"), {
		private: true,
		dependencies: { "pi-context-aco": "file:" + tar.replaceAll("\\", "/") },
	});
	const install = npmRun(
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
	await json(join(root, "candidate-install.json"), install);
	assert.equal(install.status, 0, install.stderr);
	return {
		installed: join(consumer, "node_modules", "pi-context-aco"),
		tarHash: hash(await readFile(tar)),
	};
}
const taskPrompt = `${workload.goal}

You are working in a disposable package copy. Do not read or modify anything outside this working directory, credentials, environment secrets or user sessions. No installs, network tools or additional agents. Available file tools are read/edit/write. Only extensions/*.ts and tests/*.test.ts may be edited. Bash accepts exactly these frozen commands:
${verificationCommands.join("\n")}

Public host SDK declarations are provided as reference/pi-model-registry.d.ts.txt and reference/pi-model-runtime.d.ts.txt. Read these task-local API references rather than probing default runtimes or reading user/profile/credential files. Shell verification uses an empty offline test profile, distinct from the inference login.

Dependencies are pre-provisioned, so do not install them. A successful agent claim is not acceptance; an independent verifier will check the delivered files after you finish. Report changed files, checks actually run, and any remaining gap. Existing incomplete test doubles may need updating to match the actual Pi API. Do not weaken assertions or remove existing tests.`;

const explorationPrompt =
	requestedTask === "B1"
		? `${taskPrompt}\n\nFirst inspect ONLY extensions/ui.ts using read to identify CLI/TUI boundaries that must remain unchanged by the admission fix. Do not inspect other files, edit, or run tests yet. Return a concise boundary note and retained constraints; implementation follows separately.`
		: requestedTask === "P2"
			? `${taskPrompt}\n\nFirst inspect relevant flow and public APIs, including existing UI/settings boundaries in extensions/ui.ts so the guard preserves interactive behavior. Do not edit yet. Return a concise working plan and exact constraints to retain; implementation follows separately.`
			: null;
const implementationPrompt = ["P2", "B1"].includes(requestedTask)
	? `Proceed with implementation and tests for the same goal: ${workload.goal} Preserve the exact constraints and plan; do not change UI source or weaken tests. The same task-local scope still applies.`
	: taskPrompt;
if (operation === "--prepare") {
	await mkdir(root); // Never overwrite another pilot.
	const input = join(root, "input");
	await mkdir(input);
	for (const f of git([
		"ls-tree",
		"-r",
		"--name-only",
		baseline,
		"packages/pi-context-aco",
	])
		.trim()
		.split("\n")) {
		const rel = f.slice("packages/pi-context-aco/".length),
			dest = join(input, rel);
		await mkdir(dirname(dest), { recursive: true });
		await writeFile(dest, git(["show", baseline + ":" + f], null));
	}
	// Freeze the package-local distribution archive too.
	await cp(join(pkg, "vendor"), join(input, "vendor"), { recursive: true });
	await seedWorkload(requestedTask, pkg, input);
	await mkdir(join(input, "reference"));
	for (const f of ["model-registry.d.ts", "model-runtime.d.ts"])
		await cp(
			join(pkg, "node_modules/@earendil-works/pi-coding-agent/dist/core", f),
			join(input, "reference", "pi-" + f + ".txt"),
		);
	if (requestedTask !== "P1")
		for (const f of ["extensions/types.d.ts", "session-manager.d.ts"])
			await cp(
				join(pkg, "node_modules/@earendil-works/pi-coding-agent/dist/core", f),
				join(input, "reference", "pi-" + f.replaceAll("/", "-") + ".txt"),
			);
	const acceptance = join(root, "acceptance");
	await mkdir(acceptance);
	const acceptanceNames = [
		...new Set([
			"pi-client.mjs",
			...workload.hiddenUnits,
			workload.hostVerifier,
			...(workload.hostVerifier === "representative-verifier.mjs"
				? []
				: [
						"recovery-fault-fixture.js",
						"evidence-fixture.js",
						"pi-test-artifacts.mjs",
					]),
		]),
	];
	for (const f of acceptanceNames) await cp(join(here, f), join(acceptance, f));
	const candidate = await installCandidate();
	const manifest = {
		version: 2,
		proxy: process.env.ACO_TEST_PROXY ?? null,
		projectionHash: hash(
			await readFile(join(here, "representative-projection.ts")),
		),
		createdAt: new Date().toISOString(),
		baseline,
		task: requestedTask,
		workload,
		explorationPrompt,
		implementationPrompt,
		observerHash: hash(
			await readFile(join(here, "representative-observer.js")),
		),
		workloadHash: hash(
			await readFile(join(here, "representative-workloads.ts")),
		),
		model: {
			provider: "antigravity",
			id: "gemini-3.8-flash",
			thinking: "high",
			remote: true,
		},
		authority: {
			source:
				"User continuation: current logged-in Antigravity gemini-3.8-flash, high; source transmission permitted; no budget or time cap requested; record usage/time.",
			allowedData:
				"isolated pi-context-aco package sources and local verification output only; no credentials or unrelated repository/session data",
			parentTokenCap: null,
			aggregateTokenCap: null,
			feeCap: null,
			runTimeCapMs: null,
			childSafetyBudgets:
				"unchanged finite package defaults; no child grant in these workloads",
			concurrency: 1,
			runOrder: ["no-ACO", "adaptive"],
			pilotRuns: 2,
		},
		taskPrompt,
		inputFiles: await fileHashes(input),
		acceptanceFiles: await fileHashes(acceptance),
		candidate,
		runnerHash: hash(await readFile(fileURLToPath(import.meta.url))),
		environmentHash: hash(
			await readFile(join(here, "representative-environment.ts")),
		),
		supportHash: hash(
			await readFile(join(here, "representative-evaluation-support.ts")),
		),
		providerEntryHash: hash(await readFile(providerPath)),
		providerPackageVersion: "0.11.0",
		providerPath,
		measurement:
			"all completed-message events plus full append-only session tree; cacheWrite and actual subscription fees unavailable, catalog estimates retained only in local raw evidence",
		isolationLimit:
			"Tool path/command guards are defense in depth, not an OS sandbox; local TypeScript tests execute with host permissions. Credentials are never copied into task input.",
	};
	manifest.inputHash = hash(JSON.stringify(manifest.inputFiles));
	manifest.acceptanceHash = hash(JSON.stringify(manifest.acceptanceFiles));
	manifest.taskHash = hash(
		JSON.stringify([explorationPrompt, implementationPrompt]),
	);
	await json(manifestPath, manifest);
	console.log(
		JSON.stringify(
			{
				prepared: true,
				manifestPath,
				inputHash: manifest.inputHash,
				acceptanceHash: manifest.acceptanceHash,
				taskHash: manifest.taskHash,
				liveRequests: 0,
			},
			null,
			2,
		),
	);
} else {
	const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
	assert.equal(manifest.task, requestedTask);
	assert.equal(
		manifest.workloadHash,
		hash(await readFile(join(here, "representative-workloads.ts"))),
	);
	assert.equal(
		manifest.observerHash,
		hash(await readFile(join(here, "representative-observer.js"))),
	);
	assert.deepEqual(manifest.model, {
		provider: "antigravity",
		id: "gemini-3.8-flash",
		thinking: "high",
		remote: true,
	});
	assert.equal(
		manifest.runnerHash,
		hash(await readFile(fileURLToPath(import.meta.url))),
	);
	assert.equal(
		manifest.environmentHash,
		hash(await readFile(join(here, "representative-environment.ts"))),
	);
	assert.equal(
		manifest.supportHash,
		hash(await readFile(join(here, "representative-evaluation-support.ts"))),
	);
	assert.equal(
		manifest.providerEntryHash,
		hash(await readFile(manifest.providerPath)),
	);
	assert.deepEqual(manifest.inputFiles, await fileHashes(join(root, "input")));
	assert.deepEqual(
		manifest.acceptanceFiles,
		await fileHashes(join(root, "acceptance")),
	);
	assert.equal(
		manifest.taskHash,
		hash(
			JSON.stringify([
				manifest.explorationPrompt,
				manifest.implementationPrompt,
			]),
		),
	);
	assert.equal(
		manifest.projectionHash,
		hash(await readFile(join(here, "representative-projection.ts"))),
	);
	assert.equal(manifest.proxy, process.env.ACO_TEST_PROXY ?? null);
	const candidateFiles = await fileHashes(manifest.candidate.installed);
	const runs = [];
	for (const policy of manifest.authority.runOrder) {
		const runRoot = join(root, policy);
		await mkdir(runRoot); // A failed run is retained; --run never overwrites/retries it.
		const cwd = join(runRoot, "task"),
			management = [];
		await cp(join(root, "input"), cwd, { recursive: true });
		await symlink(
			join(pkg, "node_modules"),
			join(cwd, "node_modules"),
			process.platform === "win32" ? "junction" : "dir",
		);
		assert.deepEqual(await fileHashes(cwd), manifest.inputFiles);
		await mkdir(join(runRoot, "sessions"));
		const guardPath = join(runRoot, "guard.js");
		await writeFile(
			guardPath,
			`import {installEvaluationGuard} from ${JSON.stringify(pathToFileURL(join(here, "representative-evaluation-support.ts")).href)};
export default function(pi) {installEvaluationGuard(pi, ${JSON.stringify(runRoot)});}`,
		);
		assert.equal(
			processRun(["--check", guardPath], cwd).status,
			0,
			"Invalid generated guard",
		);
		const probe = async (stage) => {
			const path = join(runRoot, "projection-" + stage + ".js");
			await writeFile(
				path,
				`import {installProjectionProbe} from ${JSON.stringify(pathToFileURL(join(here, "representative-projection.ts")).href)};export default function(pi){installProjectionProbe(pi,${JSON.stringify(runRoot)},${JSON.stringify(stage)});}`,
			);
			return path;
		};
		const extensions = [
			guardPath,
			manifest.providerPath,
			await probe("before"),
			join(here, "representative-observer.js"),
		];
		if (policy === "adaptive") {
			assert.deepEqual(
				await fileHashes(manifest.candidate.installed),
				candidateFiles,
			);
			const wrapper = join(runRoot, "aco.js");
			await writeFile(
				wrapper,
				`import aco from ${JSON.stringify(pathToFileURL(join(manifest.candidate.installed, "extensions/index.ts")).href)};
export default function(pi) { aco(pi, ${JSON.stringify(join(runRoot, "pi-context-aco.json"))}); }`,
			);
			extensions.push(wrapper);
		}
		extensions.push(await probe("after"));
		const started = Date.now();
		const client = startPi({
			cwd,
			env: {
				...testProxyEnvironment(process.env.ACO_TEST_PROXY),
				ANTIGRAVITY_NO_EXTRA_TOOLS: "1",
				ANTIGRAVITY_RUNTIME_MODEL: "gemini-3.8-flash-high",
			},
			extensions,
			persist: true,
			commandTimeoutMs: null,
			args: [
				"--session-dir",
				join(runRoot, "sessions"),
				"--provider",
				manifest.model.provider,
				"--model",
				manifest.model.id,
				"--thinking",
				manifest.model.thinking,
				"--tools",
				"read,bash,edit,write",
			],
			onEvent: (event) => {
				appendFileSync(
					join(runRoot, "events.jsonl"),
					JSON.stringify({ observedAt: Date.now(), event }) + "\n",
				);
				if (
					["message_end", "tool_execution_end", "agent_settled"].includes(
						event.type,
					)
				)
					writeFileSync(
						join(runRoot, "progress.json"),
						JSON.stringify({
							at: new Date().toISOString(),
							event: event.type,
							role: event.message?.role,
							stopReason: event.message?.stopReason,
							tool: event.toolName,
						}),
					);
			},
		});
		let outcome;
		try {
			await client.command("get_commands");
			const state = await client.command("get_state");
			assert.equal(state.model?.provider, manifest.model.provider);
			assert.equal(state.model?.id, manifest.model.id);
			assert.equal(state.thinkingLevel, manifest.model.thinking);
			// Do not persist RPC settings changes in the credential-owning user agent directory.
			const command = async (message) => {
				const at = Date.now();
				const response = await client.command("prompt", { message });
				management.push({
					message,
					startedAt: at,
					elapsedMs: Date.now() - at,
					response,
				});
			};
			if (policy === "adaptive") {
				await command("/aco config mode adaptive");
				await command(
					"/aco declare " +
						JSON.stringify({
							taskId: manifest.task,
							active: true,
							phase: manifest.workload.phase,
							remainingSteps: manifest.workload.remainingSteps,
							estimatedFutureTokens: manifest.workload.futureTokens,
							writeConflictRisk: 1,
						}),
				);
				await command("/aco trace");
			}
			const query = async (message) => {
				const n = client.events.length;
				await command(message);
				const notice = client.events
					.slice(n)
					.filter(
						(e) => e.type === "extension_ui_request" && e.method === "notify",
					)
					.at(-1);
				if (!notice) return null;
				try {
					return JSON.parse(notice.message);
				} catch {
					return { status: "unavailable", notice: notice.message };
				}
			};
			const latestAssistant = () =>
				client.events
					.filter(
						(e) => e.type === "message_end" && e.message?.role === "assistant",
					)
					.at(-1)?.message;
			const stages = [];
			const prompt = async (message) => {
				const at = Date.now(),
					n = client.events.filter((e) => e.type === "agent_settled").length;
				await client.command("prompt", { message });
				await client.until(
					() =>
						client.events.filter((e) => e.type === "agent_settled").length > n,
					"live task settled",
					Infinity,
				);
				stages.push({
					promptHash: hash(message),
					startedAt: at,
					elapsedMs: Date.now() - at,
					stopReason: latestAssistant()?.stopReason,
				});
			};
			const promptStarted = Date.now();
			let phaseEvidence = null;
			if (manifest.explorationPrompt) {
				await prompt(manifest.explorationPrompt);
				const snapshot = await query("/evaluation-snapshot");
				await json(join(runRoot, "exploration-snapshot.json"), snapshot);
				if (latestAssistant()?.stopReason === "stop") {
					phaseEvidence = researchDeclaration(snapshot.branch, manifest.task);
					const sourceUnchanged =
						JSON.stringify(await fileHashes(cwd)) ===
						JSON.stringify(manifest.inputFiles);
					if (phaseEvidence) phaseEvidence.sourceUnchanged = sourceUnchanged;
					if (policy === "adaptive" && phaseEvidence && sourceUnchanged) {
						await command(
							"/aco declare " + JSON.stringify(phaseEvidence.declaration),
						);
						const decision = (await query("/aco trace"))?.adaptiveDecision;
						phaseEvidence.decision = decision;
						const exact = decision?.candidates?.find((c) => c.id === "exact");
						if (decision?.selected === "exact" && exact?.steps?.length)
							phaseEvidence.composition = await query(
								"/aco compose " + JSON.stringify({ steps: exact.steps }),
							);
					}
					await prompt(manifest.implementationPrompt);
					if (policy === "adaptive" && phaseEvidence?.composition)
						phaseEvidence.advance = await query("/aco advance");
				}
			} else await prompt(manifest.implementationPrompt);
			await json(join(runRoot, "phase-evidence.json"), {
				phaseEvidence,
				stages,
			});
			await json(
				join(runRoot, "final-snapshot.json"),
				await query("/evaluation-snapshot"),
			);
			const settledAt = Date.now();
			if (policy === "adaptive") await command("/aco trace");
			await command("/antigravity.doctor");
			const { entries } = await client.command("get_entries");
			await json(join(runRoot, "entries.json"), entries);
			await json(join(runRoot, "management.json"), management);
			await json(
				join(runRoot, "state.json"),
				await client.command("get_state"),
			);
			const finalMessages = client.events.filter(
				(e) => e.type === "message_end" && e.message?.role === "assistant",
			);
			const last = finalMessages.at(-1)?.message;
			outcome = {
				policy,
				task: manifest.task,
				inputHash: manifest.inputHash,
				acceptanceHash: manifest.acceptanceHash,
				taskHash: manifest.taskHash,
				model: manifest.model,
				startedAt: new Date(started).toISOString(),
				startupAndManagementMs: promptStarted - started,
				inferenceAndToolsMs: settledAt - promptStarted,
				elapsedBeforeVerificationMs: Date.now() - started,
				humanInterventions: 0,
				scriptedManagement: management.length,
				budgets: manifest.authority,
				evidenceClass: "representative real-model defect replay",
				usage: accountWholeRun(entries, client.events),
				hostRetryEvents: client.events
					.filter((e) => e.type.startsWith("auto_retry"))
					.map((e) => e.type),
				terminalStopReason: last?.stopReason ?? null,
				finalText:
					last?.content
						?.filter((b) => b.type === "text")
						.map((b) => b.text)
						.join("\n") ?? "",
				agentClaimIsNotAcceptance: true,
				recoveryAttempts: 0,
				recoveryFailures: 0,
				mistakenDecisions: null,
				continuity: null,
			};
			await client.close();
		} catch (error) {
			outcome = {
				policy,
				task: manifest.task,
				error: String(error),
				elapsedMs: Date.now() - started,
				evidenceClass: "failed representative evaluation attempt",
				usage: accountWholeRun([], client.events),
			};
			await json(join(runRoot, "management.json"), management);
		} finally {
			await client.dispose();
			await writeFile(join(runRoot, "stderr.log"), client.stderr);
		}
		// Freeze the actual delivered work BEFORE adding hidden acceptance tests.
		const delivered = await fileHashes(cwd);
		outcome.deliveredFiles = delivered;
		outcome.changedFiles = delivered
			.filter(
				([f, h]) => !manifest.inputFiles.some(([p, s]) => p === f && s === h),
			)
			.map(([f]) => f);
		for (const [f] of delivered) {
			if (outcome.changedFiles.includes(f)) {
				await mkdir(dirname(join(runRoot, "delivered", f)), {
					recursive: true,
				});
				await cp(join(cwd, f), join(runRoot, "delivered", f));
			}
		}
		outcome.deletedFiles = manifest.inputFiles
			.filter(([f]) => !delivered.some(([p]) => p === f))
			.map(([f]) => f);
		if (
			!outcome.error &&
			!["error", "aborted"].includes(outcome.terminalStopReason) &&
			outcome.terminalStopReason !== null
		) {
			const verificationStarted = Date.now(),
				checks = [];
			const profile = join(runRoot, "independent-verification-profile");
			prepareVerificationProfile(profile);
			const verifyEnv = verificationEnvironment(process.env, profile);
			// These checks and the hidden verifier were frozen before inference; no solution is supplied to the model.
			for (const args of [
				["run", "typecheck"],
				["run", "check", "--", "--diagnostic-level=error"],
				["test"],
			])
				checks.push(npmRun(args, cwd, verifyEnv));
			const hiddenNames = [];
			for (const name of manifest.workload.hiddenUnits) {
				const target = "evaluator-hidden-" + name;
				await cp(join(root, "acceptance", name), join(cwd, "tests", target));
				hiddenNames.push("tests/" + target);
			}
			checks.push(npmRun(["test", "--", ...hiddenNames], cwd, verifyEnv));
			if (manifest.workload.hostVerifier === "representative-verifier.mjs")
				checks.push(
					processRun(
						[join(root, "acceptance", "representative-verifier.mjs"), cwd],
						cwd,
						verifyEnv,
					),
				);
			else {
				for (const name of [
					"pi-client.mjs",
					"recovery-fault-fixture.js",
					"evidence-fixture.js",
					"pi-test-artifacts.mjs",
				])
					await cp(join(root, "acceptance", name), join(cwd, "tests", name));
				const verifier = join(cwd, "tests", "evaluator-recovery-pi-smoke.mjs");
				await cp(join(root, "acceptance", "recovery-pi-smoke.mjs"), verifier);
				checks.push(processRun([verifier], cwd, verifyEnv));
			}
			// Existing registered controlled provider path still must work.
			checks.push(npmRun(["run", "smoke:delegate"], cwd, verifyEnv));
			outcome.verificationMs = Date.now() - verificationStarted;
			await json(join(runRoot, "verification.json"), checks);
			outcome.taskSuccess = checks.every((r) => r.status === 0);
		} else outcome.taskSuccess = false;
		outcome.totalElapsedMs = Date.now() - started;
		await json(join(runRoot, "result.json"), outcome);
		runs.push(outcome);
		await json(join(root, "results.json"), runs);
		console.log(
			JSON.stringify({
				policy,
				taskSuccess: outcome.taskSuccess,
				changedFiles: outcome.changedFiles,
				totalElapsedMs: outcome.totalElapsedMs,
				accounting: outcome.usage.accounting.total,
				error: outcome.error ?? null,
			}),
		);
		// An unavailable/failed provider is a boundary, not permission to switch models or burn more attempts.
		if (
			outcome.error ||
			["error", "aborted"].includes(outcome.terminalStopReason) ||
			outcome.terminalStopReason === null
		)
			break;
	}
}
