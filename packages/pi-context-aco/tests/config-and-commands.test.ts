import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { complete, parse } from "../extensions/commands.ts";
import { Config, defaults } from "../extensions/config.ts";

const dirs: string[] = [];
async function scope() {
	const dir = await mkdtemp(join(tmpdir(), "aco-config-"));
	dirs.push(dir);
	return dir;
}
afterEach(async () => {
	await Promise.all(
		dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })),
	);
});
describe("validated passive configuration", () => {
	it("uses bounded transparent defaults without strategy permission keys", async () => {
		const c = new Config(join(await scope(), "aco.json"));
		await c.reload();
		expect(c.settings).toEqual(defaults);
		await expect(c.set("autoCompact", "true")).rejects.toThrow("Unknown");
		await expect(c.set("horizonTurns", "NaN")).rejects.toThrow();
		await expect(c.set("historySize", "1")).rejects.toThrow();
	});
	it("serializes parallel updates and commits live settings only after durable success", async () => {
		const path = join(await scope(), "aco.json"),
			c = new Config(path);
		await c.reload();
		await Promise.all([
			c.set("horizonTurns", "4"),
			c.set("reserveTokens", "5000"),
		]);
		expect(c.settings).toMatchObject({ horizonTurns: 4, reserveTokens: 5000 });
		expect(JSON.parse(await readFile(path, "utf8"))).toMatchObject({
			horizonTurns: 4,
			reserveTokens: 5000,
		});
		const bad = new Config(`${path}/child.json`);
		await expect(bad.set("enabled", "off")).rejects.toThrow();
		expect(bad.settings.enabled).toBe(true);
	});
	it("disables observation on invalid JSON/schema, repairs explicitly, and does not silently overwrite it", async () => {
		const path = join(await scope(), "aco.json");
		await writeFile(path, '{"secret":"wrong"}');
		const c = new Config(path);
		await c.reload();
		expect(c.settings.enabled).toBe(false);
		expect(c.error).toContain("invalid");
		expect(await readFile(path, "utf8")).toBe('{"secret":"wrong"}');
		await c.set("enabled", "on");
		expect(c.error).toBeUndefined();
		expect(c.settings.enabled).toBe(true);
	});
	it("reloads external settings and validates aliases/ranges", async () => {
		const path = join(await scope(), "aco.json"),
			c = new Config(path);
		await writeFile(path, '{"reserveTokens":0,"persistTraces":true}');
		await c.reload();
		expect(c.settings.reserveTokens).toBe(0);
		expect(c.settings.persistTraces).toBe(true);
		await c.set("ENABLED", "off");
		expect(c.settings.enabled).toBe(false);
		await expect(c.set("reserveTokens", "-1")).rejects.toThrow();
	});
});
describe("strict command and full-prefix completion", () => {
	it.each([
		["", { kind: "panel" }],
		["status", { kind: "status" }],
		["trace", { kind: "trace" }],
		["config", { kind: "panel" }],
		["config reload", { kind: "reload" }],
		["config horizonTurns", { kind: "get", key: "horizonTurns" }],
		[
			"config reserveTokens 1234",
			{ kind: "set", key: "reserveTokens", value: "1234" },
		],
		["off", { kind: "set", key: "enabled", value: "false" }],
		["status extra", { kind: "help" }],
		["config a b c", { kind: "help" }],
	])("parses %s", (input, expected) => {
		expect(parse(input)).toEqual(expected);
	});
	it("completes whole argument strings for config keys and values, not only the final token", () => {
		expect(complete("config hor", defaults)?.map((x) => x.value)).toEqual([
			"config horizonTurns",
		]);
		expect(complete("config enabled o", defaults)?.map((x) => x.value)).toEqual(
			["config enabled on", "config enabled off"],
		);
		expect(
			complete("config reserveTokens ", defaults)?.some(
				(x) => x.value === "config reserveTokens 4096",
			),
		).toBe(true);
		expect(complete("on extra", defaults)).toBeNull();
		expect(complete("config strategy ", defaults)).toBeNull();
	});
});

it("parses and completes recovery actions without interpreting JSON as config", () => {
	for (const action of ["checkpoint", "recall"] as const) {
		expect(parse(action + ' {"sourceEntryIds":["a"]}')).toEqual({
			kind: action,
			json: '{"sourceEntryIds":["a"]}',
		});
		expect(
			complete(action.slice(0, 3), defaults)?.some((c) => c.value === action),
		).toBe(true);
	}
	expect(parse("evidence")).toEqual({ kind: "evidence" });
	expect(parse("evidence extra")).toEqual({ kind: "help" });
	expect(parse("recall " + "x".repeat(65537))).toEqual({ kind: "help" });
});
