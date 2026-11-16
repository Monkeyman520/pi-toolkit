import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { loadConfig, saveConfig } from "../extensions/config.ts";

const dirs: string[] = [];
async function setup() {
	const root = await mkdtemp(join(tmpdir(), "prompt-config-"));
	dirs.push(root);
	const agent = join(root, "agent"),
		cwd = join(root, "project");
	await mkdir(agent);
	await mkdir(join(cwd, ".pi"), { recursive: true });
	return { agent, cwd };
}
afterEach(async () => {
	await Promise.all(
		dirs.splice(0).map((p) => rm(p, { recursive: true, force: true })),
	);
});
const rule = (id: string, text: string) => ({
	id,
	stage: "agent",
	targets: ["all"],
	actions: [{ type: "append", text }],
});
it("composes ID overrides/new rules and preserves declaring-file paths", async () => {
	const { agent, cwd } = await setup();
	await writeFile(
		join(agent, "prompt-pipeline.json"),
		JSON.stringify({
			rules: [rule("one", "global"), rule("two", "two")],
			logging: "info",
			export: { points: ["agent.before"], directory: "exports" },
		}),
	);
	await writeFile(
		join(cwd, ".pi", "prompt-pipeline.json"),
		JSON.stringify({
			rules: [rule("one", "project"), rule("three", "three")],
			export: { points: [] },
		}),
	);
	const cfg = await loadConfig(agent, cwd, true);
	expect(cfg.rules.map((r) => r.id)).toEqual(["one", "two", "three"]);
	expect(cfg.rules[0].baseDir).toBe(join(cwd, ".pi"));
	expect(cfg.rules[1].baseDir).toBe(agent);
	expect(cfg.export.directory).toBe(join(agent, "exports"));
	expect(cfg.export.points).toEqual([]);
	const untrusted = await loadConfig(agent, cwd, false);
	expect(untrusted.rules.map((r) => r.id)).toEqual(["one", "two"]);
	expect(untrusted.rules[0].baseDir).toBe(agent);
});
it("skips invalid layers, reports diagnostics, and never loads untrusted project config", async () => {
	const { agent, cwd } = await setup();
	await writeFile(join(cwd, ".pi", "prompt-pipeline.json"), "not json");
	expect((await loadConfig(agent, cwd, false)).diagnostics).toEqual([]);
	expect((await loadConfig(agent, cwd, true)).diagnostics).toHaveLength(1);
	await writeFile(
		join(agent, "prompt-pipeline.json"),
		JSON.stringify({ rules: [rule("same", "a"), rule("same", "b")] }),
	);
	expect((await loadConfig(agent, cwd, false)).rules).toEqual([]);
});
it("writes only validated configuration", async () => {
	const { agent } = await setup();
	await expect(
		saveConfig(join(agent, "a.json"), { logging: "invalid" }),
	).rejects.toThrow();
	await saveConfig(join(agent, "a.json"), { logging: "silent" });
});
it("rejects oversized persisted text instead of saving an unreadable configuration", async () => {
	const { agent } = await setup();
	await expect(
		saveConfig(join(agent, "large.json"), {
			rules: [rule("big", "x".repeat(1024 * 1024))],
		}),
	).rejects.toThrow("too large");
});
