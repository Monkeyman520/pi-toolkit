import {
	mkdir,
	mkdtemp,
	readFile,
	rm,
	utimes,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Type } from "typebox";
import { afterEach, expect, it } from "vitest";
import {
	JsonConfigStore,
	readJsonConfig,
	writeJsonConfig,
} from "../src/config.ts";

const dirs: string[] = [];
async function location() {
	const dir = await mkdtemp(join(tmpdir(), "support-config-"));
	dirs.push(dir);
	return join(dir, "config.json");
}
afterEach(async () => {
	await Promise.all(
		dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
	);
});
const schema = Type.Object(
	{
		enabled: Type.Optional(Type.Boolean()),
		count: Type.Optional(Type.Integer({ minimum: 1 })),
	},
	{ additionalProperties: false },
);
const defaults = () => ({ enabled: true, count: 3 });
it("distinguishes absence, invalid JSON/schema, oversized and unreadable input", async () => {
	const path = await location();
	expect((await readJsonConfig(path, schema, 100)).kind).toBe("missing");
	await writeFile(path, "{bad");
	expect((await readJsonConfig(path, schema, 100)).kind).toBe("invalid");
	await writeFile(path, '{"count":0}');
	expect((await readJsonConfig(path, schema, 100)).kind).toBe("invalid");
	await writeFile(path, '{"count":2}');
	expect((await readJsonConfig(path, schema, 4)).kind).toBe("invalid");
	await rm(path);
	await mkdir(path);
	expect((await readJsonConfig(path, schema, 100)).kind).toBe("unreadable");
});
it("keeps separate safe/fail-closed policy, error state and tracking in caller instances", async () => {
	const a = await location(),
		b = await location();
	const closed = new JsonConfigStore({
		path: a,
		schema,
		defaults,
		maxBytes: 100,
		errorMessage: "closed",
		onInvalid: () => ({ ...defaults(), enabled: false }),
	});
	const safe = new JsonConfigStore({
		path: b,
		schema,
		defaults,
		maxBytes: 100,
		errorMessage: "safe",
	});
	await closed.reload();
	await safe.replace({ count: 7 }, true);
	await writeFile(a, "{bad");
	await writeFile(b, "{bad");
	expect((await closed.reload()).config.enabled).toBe(false);
	expect((await safe.reload()).config.count).toBe(7);
	expect((await closed.reload()).isNewError).toBe(false);
	await rm(a);
	expect((await closed.reload()).config).toEqual(defaults());
	expect(safe.error).toBe("safe");
});
it("detects changed content at the same mtime, forces reload, and preserves partial files", async () => {
	const path = await location(),
		store = new JsonConfigStore({
			path,
			schema,
			defaults,
			maxBytes: 100,
			errorMessage: "bad",
		});
	await writeFile(path, '{"count":4}');
	const time = new Date(1700000000000);
	await utimes(path, time, time);
	expect((await store.reload()).config.count).toBe(4);
	expect((await store.reload()).changed).toBe(false);
	await writeFile(path, '{"count":5}');
	await utimes(path, time, time);
	expect((await store.reload()).config.count).toBe(5);
	expect((await store.reload(true)).changed).toBe(true);
	await store.replace({ enabled: false }, true);
	expect(JSON.parse(await readFile(path, "utf8"))).toEqual({ enabled: false });
});
it("validates before replacement and rejects failed persistence without false success", async () => {
	const path = await location();
	await expect(writeJsonConfig(path, { count: 0 }, schema)).rejects.toThrow();
	await writeJsonConfig(path, { count: 4 }, schema);
	expect(JSON.parse(await readFile(path, "utf8"))).toEqual({ count: 4 });
	await rm(path);
	await mkdir(path);
	const store = new JsonConfigStore({
		path,
		schema,
		defaults,
		maxBytes: 100,
		errorMessage: "bad",
	});
	await expect(store.replace({ count: 6 }, true)).rejects.toThrow();
});
