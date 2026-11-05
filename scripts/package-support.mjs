import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const npm =
	process.env.npm_execpath ??
	join(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
const temp = await mkdtemp(join(tmpdir(), "pi-support-pack-"));
try {
	const result = spawnSync(
		process.execPath,
		[npm, "pack", "--ignore-scripts", "--json", "--pack-destination", temp],
		{
			cwd: join(root, "packages", "pi-plugin-support"),
			encoding: "utf8",
			timeout: 30000,
		},
	);
	assert.equal(result.status, 0, result.stderr);
	const info = JSON.parse(result.stdout)[0];
	const source = join(temp, info.filename);
	for (const plugin of [
		"pi-auto-resume",
		"pi-pretty-session",
		"pi-quota-keeper",
		"pi-context-aco",
	]) {
		const vendor = join(root, "packages", plugin, "vendor");
		const target = join(vendor, info.filename);
		if (process.argv.includes("--check")) {
			assert.ok(
				(await readFile(source)).equals(await readFile(target)),
				`Stale support artifact in ${plugin}; run node scripts/package-support.mjs`,
			);
			const lock = JSON.parse(
				await readFile(
					join(root, "packages", plugin, "package-lock.json"),
					"utf8",
				),
			);
			assert.equal(
				lock.packages["node_modules/pi-plugin-support"].integrity,
				info.integrity,
				`Stale npm integrity in ${plugin}`,
			);
			for (const file of info.files.filter((file) =>
				file.path.startsWith("src/"),
			)) {
				assert.ok(
					(
						await readFile(
							join(root, "packages", "pi-plugin-support", file.path),
						)
					).equals(
						await readFile(
							join(
								root,
								"packages",
								plugin,
								"node_modules",
								"pi-plugin-support",
								file.path,
							),
						),
					),
					`Stale installed library in ${plugin}: ${file.path}`,
				);
			}
		} else {
			await mkdir(vendor, { recursive: true });
			await cp(source, target);
			const cwd = join(root, "packages", plugin);
			const run = (args) => {
				const res = spawnSync(process.execPath, [npm, ...args], {
					cwd,
					encoding: "utf8",
					timeout: 60000,
				});
				assert.equal(res.status, 0, res.stderr);
			};
			// Explicit artifact installation refreshes npm integrity even while developing the same unpublished version.
			try {
				run([
					"install",
					"--ignore-scripts",
					"--legacy-peer-deps",
					"--offline",
					"--no-audit",
					`./vendor/${info.filename}`,
				]);
			} finally {
				run(["pkg", "set", `dependencies.${info.name}=${info.version}`]);
			}
			run([
				"install",
				"--package-lock-only",
				"--ignore-scripts",
				"--legacy-peer-deps",
				"--offline",
				"--no-audit",
			]);
		}
	}
	console.log(
		`${info.name}@${info.version}: ${process.argv.includes("--check") ? "archive parity verified" : "consumer archives prepared"}`,
	);
} finally {
	await rm(temp, { recursive: true, force: true });
}
