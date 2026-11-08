import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { startPi } from "./pi-client.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = await mkdtemp(join(tmpdir(), "aco-evaluation-profile-"));
let client;
try {
	const outcomes = [];
	for (const guarded of [false, true]) {
		const run = join(root, guarded ? "guarded" : "unguarded"),
			cwd = join(run, "task"),
			profile = join(run, "tool-verification-profile");
		await mkdir(join(cwd, "tests"), { recursive: true });
		await writeFile(
			join(cwd, "package.json"),
			JSON.stringify({
				private: true,
				type: "module",
				scripts: { test: "vitest run" },
			}),
		);
		await symlink(
			resolve(here, "../node_modules"),
			join(cwd, "node_modules"),
			process.platform === "win32" ? "junction" : "dir",
		);
		await writeFile(
			join(cwd, "tests/delegation.test.ts"),
			`import {expect,it} from "vitest";
import {getAgentDir,ModelRuntime,ModelRegistry} from "@earendil-works/pi-coding-agent";
it("nested verification identity excludes inference credentials",async()=>{
	expect(process.env.ANTHROPIC_API_KEY).toBeUndefined();
	expect(process.env.PI_CODING_AGENT_DIR).toBe(${JSON.stringify(join(profile, "agent"))});
	expect(getAgentDir()).toBe(${JSON.stringify(join(profile, "agent"))});
	const runtime = await ModelRuntime.create();
	expect(Boolean(await new ModelRegistry(runtime).getApiKeyForProvider("anthropic"))).toBe(false);
},30000);`,
		);
		const guard = join(run, "guard.js");
		await writeFile(
			guard,
			`import {installEvaluationGuard} from ${JSON.stringify(pathToFileURL(join(here, "representative-evaluation-support.ts")).href)};
export default function(pi){installEvaluationGuard(pi,${JSON.stringify(run)});}`,
		);
		client = startPi({
			cwd,
			env: {
				PI_CODING_AGENT_DIR: join(run, "inference-agent"),
				ANTHROPIC_API_KEY: "dummy-parent-sentinel",
			},
			extensions: [
				...(guarded ? [guard] : []),
				join(here, "representative-profile-fixture.js"),
			],
			args: ["--tools", "read,bash,edit,write"],
		});
		await client.command("get_commands");
		await client.command("set_model", {
			provider: "profile-fixture",
			modelId: "test",
		});
		await client.command("prompt", { message: "run profile probe" });
		await client.until(
			() => client.events.some((e) => e.type === "agent_settled"),
			"controlled profile probe",
			60000,
		);
		const result = client.events
			.filter(
				(e) => e.type === "message_end" && e.message?.role === "toolResult",
			)
			.at(-1)?.message;
		assert.ok(result, client.stderr);
		const text = JSON.stringify(result.content);
		if (guarded) {
			assert.match(text, /1 passed/);
			assert.doesNotMatch(text, /Command exited with code 1/);
		} else assert.match(text, /failed|Command exited with code 1/);
		outcomes.push({
			guarded,
			expectedOutcome: guarded
				? "passed"
				: "negative control refused inherited identity",
			toolResult: result,
		});
		await client.close();
		client = undefined;
	}
	console.log(
		JSON.stringify(
			{
				passed: true,
				evidenceClass:
					"actual isolated Pi, controlled tool-call provider, dummy parent key only; zero real-model calls",
				outcomes,
			},
			null,
			2,
		),
	);
} finally {
	await client?.dispose();
	await rm(root, { recursive: true, force: true });
}
