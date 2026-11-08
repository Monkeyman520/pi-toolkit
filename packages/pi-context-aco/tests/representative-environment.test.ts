import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	prepareVerificationProfile,
	verificationEnvironment,
} from "./representative-environment.ts";

const roots: string[] = [];
afterEach(async () => {
	await Promise.all(
		roots.splice(0).map((p) => rm(p, { recursive: true, force: true })),
	);
});
describe("verification and inference credential separation", () => {
	it("propagates only the explicitly selected local test proxy without credential inheritance", () => {
		const env = verificationEnvironment(
			{
				ACO_TEST_PROXY: "http://127.0.0.1:7890",
				HTTPS_PROXY: "http://private:secret@other:8080",
				ANTHROPIC_API_KEY: "must-not-leak",
			},
			"profile",
		);
		for (const key of [
			"HTTP_PROXY",
			"HTTPS_PROXY",
			"ALL_PROXY",
			"http_proxy",
			"https_proxy",
			"all_proxy",
		])
			expect(env[key]).toBe("http://127.0.0.1:7890");
		expect(env.NODE_USE_ENV_PROXY).toBe("1");
		expect(env.NO_PROXY).toBe("localhost,127.0.0.1,::1");
		expect(env.ANTHROPIC_API_KEY).toBeUndefined();
		expect(
			verificationEnvironment(
				{ HTTPS_PROXY: "http://private:secret@other:8080" },
				"profile",
			).HTTPS_PROXY,
		).toBeUndefined();
	});
	it("does not inherit provider credentials, session paths, loader hooks or the real profile", () => {
		const env = verificationEnvironment(
			{
				PATH: "tools",
				SystemRoot: "windows",
				HOME: "real-home",
				USERPROFILE: "real-profile",
				PI_CODING_AGENT_DIR: "real-agent",
				PI_SESSION_FILE: "real-session",
				ANTHROPIC_API_KEY: "must-not-leak",
				ANTIGRAVITY_CLIENT_SECRET: "must-not-leak",
				NODE_OPTIONS: "--require private-loader",
				NPM_TOKEN: "must-not-leak",
			},
			"test-profile",
		);
		expect(env.PATH).toBe("tools");
		expect(env.SYSTEMROOT).toBe("windows");
		expect(env.PI_CODING_AGENT_DIR).toBe(join("test-profile", "agent"));
		expect(env.HOME).toBe(join("test-profile", "home"));
		expect(env.USERPROFILE).toBe(env.HOME);
		for (const key of [
			"PI_SESSION_FILE",
			"ANTHROPIC_API_KEY",
			"ANTIGRAVITY_CLIENT_SECRET",
			"NODE_OPTIONS",
			"NPM_TOKEN",
		])
			expect(env[key]).toBeUndefined();
		expect(env.PI_OFFLINE).toBe("1");
	});
	it("a real nested ModelRuntime.create sees the empty test agent, not inherited authentication", async () => {
		const root = await mkdtemp(join(tmpdir(), "aco-eval-profile-"));
		roots.push(root);
		prepareVerificationProfile(root);
		const env = verificationEnvironment(
			{ ...process.env, ANTHROPIC_API_KEY: "must-not-leak" },
			root,
		);
		const r = spawnSync(
			process.execPath,
			[
				"--input-type=module",
				"-e",
				'import {getAgentDir,ModelRuntime,ModelRegistry} from "@earendil-works/pi-coding-agent"; const r=await ModelRuntime.create(); console.log(JSON.stringify({agent:getAgentDir(),hasKey:Boolean(await new ModelRegistry(r).getApiKeyForProvider("anthropic"))}));',
			],
			{ cwd: process.cwd(), env, encoding: "utf8" },
		);
		expect(r.status, r.stderr).toBe(0);
		expect(JSON.parse(r.stdout.trim())).toEqual({
			agent: join(root, "agent"),
			hasKey: false,
		});
	}, 30000);
});
