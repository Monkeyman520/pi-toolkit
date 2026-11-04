import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getQuotaCompletions } from "../extensions/commands.ts";
import { executeQuotaConfigCommand } from "../extensions/coordination.ts";

const expected = {
	mode: ["reset", "fixed"],
	delayMs: ["0", "15000", "30000", "60000", "120000"],
	pollIntervalMs: ["10000", "30000", "60000", "120000", "300000"],
};

describe("configuration suggestions contract", () => {
	it("preserves key order and the full argument replacement prefix", () => {
		expect(getQuotaCompletions("config ")?.map((item) => item.label)).toEqual([
			"reload",
			...Object.keys(expected),
		]);
	});
	for (const [key, values] of Object.entries(expected)) {
		it(`preserves suggestions and accepts every suggested value for ${key}`, async () => {
			const dir = await mkdtemp(join(tmpdir(), "config-candidates-"));
			try {
				expect(
					getQuotaCompletions(`config ${key} `)?.map((item) => item.value),
				).toEqual(values.map((value) => `config ${key} ${value}`));
				for (const value of values) {
					const result = await executeQuotaConfigCommand(dir, {
						kind: "config",
						key: key as "mode" | "delayMs" | "pollIntervalMs",
						value,
					});
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
			expect(
				(
					await executeQuotaConfigCommand(dir, {
						kind: "config",
						key: "pollIntervalMs",
						value: "10001",
					})
				).ok,
			).toBe(true);
			expect(
				(
					await executeQuotaConfigCommand(dir, {
						kind: "config",
						key: "pollIntervalMs",
						value: "9999",
					})
				).ok,
			).toBe(false);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});
});
