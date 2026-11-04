import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getPrettySessionCompletions } from "../extensions/commands.ts";
import { ConfigManager } from "../extensions/config.ts";

const expected = {
	enabled: ["true", "false", "on", "off"],
	useLlm: ["true", "false", "on", "off"],
	model: ["default"],
	updateEveryTurns: ["1", "2", "3", "5", "10"],
	contextDeltaTokens: ["2000", "4000", "8000", "16000", "32000"],
	summarizeOnCompact: ["true", "false", "on", "off"],
	protectManualName: ["true", "false", "on", "off"],
	showWidget: ["true", "false", "on", "off"],
	widgetPlacement: ["aboveEditor", "belowEditor"],
	showStatus: ["true", "false", "on", "off"],
	maxTitleLength: ["40", "60", "80", "100"],
	maxDescriptionLength: ["100", "160", "220", "280"],
	summaryTimeoutMs: ["5000", "10000", "15000", "30000"],
};

describe("configuration suggestions contract", () => {
	it("preserves key order and the full argument replacement prefix", () => {
		expect(
			getPrettySessionCompletions("config ")?.map((item) => item.label),
		).toEqual(["reload", ...Object.keys(expected)]);
	});
	for (const [key, values] of Object.entries(expected)) {
		it(`preserves suggestions and accepts every suggested value for ${key}`, async () => {
			const dir = await mkdtemp(join(tmpdir(), "config-candidates-"));
			try {
				const manager = new ConfigManager(join(dir, "config.json"));
				expect(
					getPrettySessionCompletions(`config ${key} `)?.map(
						(item) => item.value,
					),
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
			const manager = new ConfigManager(join(dir, "config.json"));
			expect((await manager.setOption("updateEveryTurns", "7", false)).ok).toBe(
				true,
			);
			expect((await manager.setOption("updateEveryTurns", "0", false)).ok).toBe(
				false,
			);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});
});
