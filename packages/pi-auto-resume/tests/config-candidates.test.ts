import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getAutoResumeCompletions } from "../extensions/commands.ts";
import { AutoResumeConfigManager } from "../extensions/config.ts";

const expected = {
	enabled: ["true", "false", "on", "off"],
	network: ["true", "false", "on", "off"],
	throttle: ["true", "false", "on", "off"],
	quota: ["true", "false", "on", "off"],
	wake: ["true", "false", "on", "off"],
	retryDelayMs: ["1000", "5000", "10000", "30000", "60000"],
	quotaDelayMs: ["0", "5000", "15000", "30000", "60000", "120000"],
	maxAttempts: ["1", "2", "3", "5", "10", "20"],
};

describe("configuration suggestions contract", () => {
	it("preserves key order and the full argument replacement prefix", () => {
		expect(
			getAutoResumeCompletions("config ")?.map((item) => item.label),
		).toEqual(["reload", ...Object.keys(expected)]);
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
