import { mkdtemp, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	CONFIG_FILE_NAME,
	ConfigManager,
	defaultConfig,
} from "../extensions/config.ts";

describe("ConfigManager", () => {
	let dir = "";
	let configPath = "";

	beforeEach(async () => {
		dir = await mkdtemp(join(tmpdir(), "pi-pretty-session-cfg-"));
		configPath = join(dir, CONFIG_FILE_NAME);
	});

	afterEach(async () => {
		if (dir) {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it("uses defaultConfig when configuration file is absent", async () => {
		const mgr = new ConfigManager(configPath);
		const res = await mgr.reloadIfChanged();
		expect(res.error).toBeUndefined();
		expect(res.config).toEqual(defaultConfig);
	});

	it("hot-reloads configuration changes from disk and reverts on deletion", async () => {
		const mgr = new ConfigManager(configPath);
		await mgr.reloadIfChanged();

		await writeFile(
			configPath,
			JSON.stringify({
				updateEveryTurns: 5,
				widgetPlacement: "belowEditor",
				showStatus: false,
			}),
			"utf8",
		);

		const updated = await mgr.reloadIfChanged();
		expect(updated.changed).toBe(true);
		expect(updated.error).toBeUndefined();
		expect(updated.config.updateEveryTurns).toBe(5);
		expect(updated.config.widgetPlacement).toBe("belowEditor");
		expect(updated.config.showStatus).toBe(false);

		const unchanged = await mgr.reloadIfChanged();
		expect(unchanged.changed).toBe(false);

		await unlink(configPath);
		const reverted = await mgr.reloadIfChanged();
		expect(reverted.changed).toBe(true);
		expect(reverted.config).toEqual(defaultConfig);
	});

	it("rejects malformed or schema-invalid JSON while keeping previous valid config", async () => {
		const mgr = new ConfigManager(configPath);
		await writeFile(
			configPath,
			JSON.stringify({ updateEveryTurns: 4 }),
			"utf8",
		);
		await mgr.reloadIfChanged();
		expect(mgr.config.updateEveryTurns).toBe(4);

		await writeFile(configPath, JSON.stringify({ unknownField: true }), "utf8");
		const bad1 = await mgr.reloadIfChanged();
		expect(bad1.changed).toBe(false);
		expect(bad1.error).toContain("Invalid or unreadable");
		expect(bad1.isNewError).toBe(true);
		expect(mgr.config.updateEveryTurns).toBe(4);

		const badRepeat = await mgr.reloadIfChanged();
		expect(badRepeat.isNewError).toBe(false);
	});

	it("dynamically updates and persists options via setOption and toggleOption", async () => {
		const mgr = new ConfigManager(configPath);
		const r1 = await mgr.setOption("updateEveryTurns", "6", true);
		expect(r1.ok).toBe(true);
		expect(mgr.config.updateEveryTurns).toBe(6);

		const r2 = await mgr.toggleOption("widget", true);
		expect(r2.ok).toBe(true);
		expect(mgr.config.showWidget).toBe(false);

		const r3 = await mgr.setOption("model", "openai/gpt-4o-mini", true);
		expect(r3.ok).toBe(true);
		expect(mgr.config.model).toBe("openai/gpt-4o-mini");

		const r4 = await mgr.setOption("model", "default", true);
		expect(r4.ok).toBe(true);
		expect(mgr.config.model).toBeUndefined();

		const mgr2 = new ConfigManager(configPath);
		await mgr2.reloadIfChanged();
		expect(mgr2.config.updateEveryTurns).toBe(6);
		expect(mgr2.config.showWidget).toBe(false);
		expect(mgr2.config.model).toBeUndefined();

		const invalidKey = await mgr.setOption("notAKey", "true", false);
		expect(invalidKey.ok).toBe(false);

		const outOfRange = await mgr.setOption("updateEveryTurns", "0", false);
		expect(outOfRange.ok).toBe(false);
	});
});
