import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

interface Manifest {
	name: string;
	private?: boolean;
	packageManager?: string;
	workspaces?: string[];
	scripts: Record<string, string>;
}

const root = fileURLToPath(new URL("../", import.meta.url));
const read = (...parts: string[]) => readFileSync(join(root, ...parts), "utf8");
const manifests = readdirSync(join(root, "packages"), { withFileTypes: true })
	.filter((entry) => entry.isDirectory())
	.map(({ name: directory }) => ({
		directory,
		manifest: JSON.parse(
			read("packages", directory, "package.json"),
		) as Manifest,
	}));
const workspace = JSON.parse(read("package.json")) as Manifest;

describe("Bun workspace", () => {
	test("keeps the root private and runs root tests then package tests sequentially", () => {
		expect(workspace.private).toBe(true);
		expect(workspace.workspaces).toEqual(["packages/*"]);
		expect(workspace.packageManager).toMatch(/^bun@\d+\.\d+\.\d+$/);
		expect(workspace.scripts.test).toBe(
			"bun test ./tests && bun run --workspaces --sequential test",
		);
	});

	test("contains the eight independent packages and keeps private packages private", () => {
		expect(manifests.map(({ directory }) => directory).sort()).toEqual([
			"pi-auto-continue",
			"pi-auto-resume",
			"pi-context-aco",
			"pi-plugin-support",
			"pi-pretty-session",
			"pi-prompt-pipeline",
			"pi-quota-keeper",
			"pi-session-tree-explorer",
		]);
		expect(new Set(manifests.map(({ manifest }) => manifest.name)).size).toBe(
			manifests.length,
		);
		for (const directory of [
			"pi-auto-continue",
			"pi-context-aco",
			"pi-plugin-support",
		]) {
			expect(
				manifests.find((entry) => entry.directory === directory)?.manifest
					.private,
			).toBe(true);
		}
	});

	test.each(manifests)(
		"$directory runs native Bun tests in isolation and has no vendored archive",
		({ directory, manifest }) => {
			expect(manifest.scripts.test).toBe("bun test --isolate");
			expect(manifest.scripts.typecheck).toBe("tsc --noEmit");
			expect(
				existsSync(join(root, "packages", directory, "package-lock.json")),
			).toBe(false);
			expect(existsSync(join(root, "packages", directory, "vendor"))).toBe(
				false,
			);
		},
	);

	test("has a single Bun lockfile and no dependency on the retired runner", () => {
		const retiredRunner = /\bvite[s]t\b/i;
		expect(read("bun.lock")).not.toMatch(retiredRunner);
		expect(read("package.json")).not.toMatch(retiredRunner);
		for (const { directory } of manifests) {
			expect(read("packages", directory, "package.json")).not.toMatch(
				retiredRunner,
			);
		}
	});
});
