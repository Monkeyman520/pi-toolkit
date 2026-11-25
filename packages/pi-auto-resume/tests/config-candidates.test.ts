import { describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getAutoResumeCompletions } from "../extensions/commands.ts";
import { AutoResumeConfigManager } from "../extensions/config.ts";

const expected = {
	enabled: ["true", "false", "on", "off"],
	network: ["true", "false", "on", "off"],
	server: ["true", "false", "on", "off"],
	throttle: ["true", "false", "on", "off"],
	quota: ["true", "false", "on", "off"],
	wake: ["true", "false", "on", "off"],
	retryDelayMs: ["1000", "5000", "10000", "30000", "60000"],
	retryBackoffFactor: ["1", "1.5", "2", "3"],
	maxRetryDelayMs: ["30000", "60000", "300000", "600000", "1800000"],
	quotaDelayMs: ["0", "5000", "15000", "30000", "60000", "120000"],
	maxAttempts: ["1", "2", "3", "5", "10", "20"],
	maxWaitMs: ["0", "60000", "300000", "1800000", "21600000"],
	maxTotalAttempts: ["0", "5", "10", "20", "50"],
	notifyOnResume: ["true", "false", "on", "off"],
};

const freeTextKeys = ["resumePrompt", "resumePromptFile", "stopFile"] as const;
const jsonOnlyKeys = ["customExcludePatterns", "customMatchPatterns"] as const;

describe("configuration suggestions contract", () => {
	it("preserves key order and the full argument replacement prefix", () => {
		expect(
			getAutoResumeCompletions("config ")?.map((item) => item.label),
		).toEqual([
			"reload",
			...Object.keys(expected),
			...freeTextKeys,
			...jsonOnlyKeys,
		]);
	});
	it("accepts and clears string config keys via setOption without value presets", async () => {
		const dir = await mkdtemp(join(tmpdir(), "config-string-keys-"));
		try {
			const manager = new AutoResumeConfigManager(join(dir, "config.json"));
			for (const key of freeTextKeys) {
				expect(getAutoResumeCompletions(`config ${key} `)).toBeNull();
				const setRes = await manager.setOption(key, "custom value", false);
				expect(setRes.ok).toBe(true);
				const clearRes = await manager.setOption(key, '""', false);
				expect(clearRes.ok).toBe(true);
			}
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});
	it("omits scalar value presets for JSON-only array keys and rejects scalar setOption", async () => {
		const dir = await mkdtemp(join(tmpdir(), "config-json-keys-"));
		try {
			const manager = new AutoResumeConfigManager(join(dir, "config.json"));
			for (const key of jsonOnlyKeys) {
				expect(getAutoResumeCompletions(`config ${key} `)).toBeNull();
				const result = await manager.setOption(key, "foo", false);
				expect(result.ok).toBe(false);
			}
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});
	for (const [key, values] of Object.entries(expected)) {
		it(`preserves suggestions and accepts every suggested value for ${key}`, async () => {
			const dir = await mkdtemp(join(tmpdir(), "config-candidates-"));
			try {
				const manager = new AutoResumeConfigManager(join(dir, "config.json"));
				expect(
					getAutoResumeCompletions(`config ${key} `)?.map((item) => item.value),
				).toEqual(values.map((value) => `config ${key} ${value}`));
				for (const value of values) {
					const result = await manager.setOption(key, value, false);
					expect(result.ok, `${key}=${value}`).toBe(true);
				}
			} finally {
				await rm(dir, { recursive: true, force: true });
			}
		});
	}
	it("accepts valid non-preset integers without weakening schema bounds", async () => {
		const dir = await mkdtemp(join(tmpdir(), "config-range-"));
		try {
			const manager = new AutoResumeConfigManager(join(dir, "config.json"));
			expect((await manager.setOption("retryDelayMs", "7", false)).ok).toBe(
				true,
			);
			expect((await manager.setOption("retryDelayMs", "0", false)).ok).toBe(
				false,
			);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});
});
