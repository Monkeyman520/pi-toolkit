import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import {
	type Access,
	EvidenceStore,
	fileIO,
	projectKey,
} from "../extensions/evidence.ts";

const roots: string[] = [];
afterEach(async () => {
	await Promise.all(
		roots.splice(0).map((p) => rm(p, { recursive: true, force: true })),
	);
});
async function fixture() {
	const root = await mkdtemp(join(tmpdir(), "aco-evidence-"));
	roots.push(root);
	const project = await projectKey(root);
	const scope = { project, taskId: "task-a", sessionId: "session-a" };
	const store = new EvidenceStore(join(root, "store"));
	const input = {
		scope,
		anchorId: "source-a",
		continuity: JSON.stringify({
			decision: "keep exact",
			unresolved: ["test"],
			plan: "running",
		}),
		sources: [
			{
				id: "source-a",
				original: JSON.stringify({
					id: "source-a",
					content: "original\n精密 error 0xAF",
				}),
			},
			{ id: "source-b", original: "other".repeat(1000) },
		],
	};
	const receipt = await store.persist(input);
	const access: Access = { ...scope, receipts: [receipt] };
	return { root, store, input, receipt, access };
}
test("readback preserves originals and selectively recalls within the whole response budget", async () => {
	const { store, input, receipt, access, root } = await fixture();
	const reads: string[] = [];
	const selective = new EvidenceStore(join(root, "store"), {
		...fileIO,
		read: async (p, max) => {
			reads.push(p);
			return fileIO.read(p, max);
		},
	});
	const page = await selective.recall(receipt.id, "source-a", access, 2048, 0);
	expect(JSON.parse(page).text).toBe(input.sources[0].original);
	expect(JSON.parse(page).historical).toBe(true);
	expect(JSON.parse(page).scope).toEqual(input.scope);
	expect(Buffer.byteLength(page)).toBeLessThanOrEqual(2048);
	expect(reads.some((p) => p.endsWith("s1.json"))).toBe(false);
	const small = await store.recall(receipt.id, "source-b", access, 1024, 0);
	expect(Buffer.byteLength(small)).toBeLessThanOrEqual(1024);
	const body = JSON.parse(small);
	expect(body.nextOffset).toBeGreaterThan(0);
	const next = JSON.parse(
		await store.recall(receipt.id, "source-b", access, 1024, body.nextOffset),
	);
	expect(next.offset).toBe(body.nextOffset);
	expect(
		JSON.parse(await store.recall(receipt.id, "continuity", access, 2048, 0))
			.text,
	).toBe(input.continuity);
});
test("denies guessed IDs, unrelated projects/tasks/branches, traversal and ungranted children", async () => {
	const { store, receipt, access } = await fixture();
	for (const changed of [
		{ project: "another" },
		{ taskId: "unrelated" },
		{ receipts: [] },
	]) {
		await expect(
			store.recall(receipt.id, "source-a", { ...access, ...changed }, 2048, 0),
		).rejects.toThrow();
	}
	await expect(
		store.recall("../escape", "source-a", access, 2048, 0),
	).rejects.toThrow();
	const child = { ...access, sessionId: "child", receipts: [] };
	await expect(
		store.recall(receipt.id, "source-a", child, 2048, 0),
	).rejects.toThrow();
	const grant = await store.grant(receipt.id, access, child, ["source-a"]);
	expect(
		JSON.parse(
			await store.recall(receipt.id, "source-a", child, 2048, 0, grant),
		).text,
	).toContain("original");
	await expect(
		store.recall(receipt.id, "source-b", child, 2048, 0, grant),
	).rejects.toThrow();
	await expect(
		store.recall(
			receipt.id,
			"source-a",
			{ ...child, sessionId: "other-child" },
			2048,
			0,
			grant,
		),
	).rejects.toThrow();
	await expect(
		store.recall(receipt.id, "source-a", child, 2048, 0, {}),
	).rejects.toThrow();
});
test("inherited active-path receipts allow fork recall but not another task", async () => {
	const { store, receipt, access } = await fixture();
	expect(
		JSON.parse(
			await store.recall(
				receipt.id,
				"source-a",
				{ ...access, sessionId: "fork" },
				2048,
				0,
			),
		).historical,
	).toBe(true);
	await expect(
		store.recall(
			receipt.id,
			"source-a",
			{ ...access, sessionId: "fork", taskId: "other" },
			2048,
			0,
		),
	).rejects.toThrow();
});
test("write, readback and interrupted rename failures never produce a receipt", async () => {
	const { root, input, store, receipt, access } = await fixture();
	for (const point of ["write", "read", "rename"] as const) {
		const broken = new EvidenceStore(join(root, "store"), {
			...fileIO,
			[point]: async () => {
				throw Error("injected " + point);
			},
		});
		await expect(broken.persist(input)).rejects.toThrow("injected");
	}
	expect(await store.verify(receipt, access)).toBeTruthy();
	const restarted = new EvidenceStore(join(root, "store"));
	expect(await restarted.verify(receipt, access)).toBeTruthy();
	expect(
		(await readdir(join(root, "store", input.scope.project))).length,
	).toBeGreaterThan(1);
});
test("corruption or missing content invalidates verification without deleting prior usable evidence", async () => {
	const { store, receipt, access, root, input } = await fixture();
	const newer = await store.persist(input);
	const access2 = { ...access, receipts: [receipt, newer] };
	const path = join(root, "store", input.scope.project, newer.id, "s0.json");
	await writeFile(path, "tampered");
	await expect(store.verify(newer, access2)).rejects.toThrow();
	await expect(
		store.recall(newer.id, "source-a", access2, 2048, 0),
	).rejects.toThrow();
	expect(await store.verify(receipt, access2)).toBeTruthy();
	await rm(path);
	await expect(store.verify(newer, access2)).rejects.toThrow();
	expect(
		await readFile(
			join(root, "store", input.scope.project, receipt.id, "s0.json"),
			"utf8",
		),
	).toBe(input.sources[0].original);
});
test("rejects invalid bounds, duplicate IDs, oversize content and altered receipt digests", async () => {
	const { store, input, receipt, access } = await fixture();
	await expect(
		store.persist({ ...input, sources: [input.sources[0], input.sources[0]] }),
	).rejects.toThrow();
	await expect(
		store.persist({
			...input,
			sources: [{ id: "x", original: "x".repeat(4 * 1024 * 1024 + 1) }],
		}),
	).rejects.toThrow();
	for (const budget of [-1, 511, 32769, NaN])
		await expect(
			store.recall(receipt.id, "source-a", access, budget, 0),
		).rejects.toThrow();
	await expect(
		store.recall(receipt.id, "source-a", access, 1024, -1),
	).rejects.toThrow();
	await expect(
		store.verify(
			{ ...receipt, digest: "0".repeat(64) },
			{ ...access, receipts: [{ ...receipt, digest: "0".repeat(64) }] },
		),
	).rejects.toThrow();
});

test("verification compares actual readback rather than write acknowledgement", async () => {
	const { root, input } = await fixture();
	const faulty = new EvidenceStore(join(root, "store"), {
		...fileIO,
		read: async (p, max) =>
			p.endsWith("s0.json") ? "incorrect original" : fileIO.read(p, max),
	});
	await expect(faulty.persist(input)).rejects.toThrow("readback mismatch");
});
test("UTF-8 response budgeting paginates escaped and astral text without losing original characters", async () => {
	const { store, input, access } = await fixture();
	const original = '😀"\\n精密'.repeat(300);
	const receipt = await store.persist({
		...input,
		sources: [{ id: "unicode", original }],
	});
	const authorized = { ...access, receipts: [receipt] };
	let offset = 0,
		combined = "";
	do {
		const raw = await store.recall(
			receipt.id,
			"unicode",
			authorized,
			600,
			offset,
		);
		expect(Buffer.byteLength(raw)).toBeLessThanOrEqual(600);
		const page = JSON.parse(raw);
		combined += page.text;
		if (page.nextOffset === null) break;
		expect(page.nextOffset).toBeGreaterThan(offset);
		offset = page.nextOffset;
	} while (offset < original.length);
	expect(combined).toBe(original);
	await expect(
		store.recall(receipt.id, "unicode", authorized, 600, 1),
	).rejects.toThrow("offset");
});
