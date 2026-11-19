import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
	cpSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import {
	assertPublishContext,
	loadRelease,
	packArtifacts,
	packageDirectories,
	publishArtifacts,
	repository,
	runCommand,
	verifyArtifacts,
	versionFromTag,
} from "../scripts/release.ts";

const tag = "v2.3.4";
const version = "2.3.4";
const aco = "pi-context-aco";
const support = "pi-plugin-support";
const catalog = packageDirectories.slice(0, 2);
const root = mkdtempSync(join(tmpdir(), "pi-toolkit-release-"));
const changelog = "## [2.3.4] - 2026-11-19\n\n- Fixture change.\n";
type Release = ReturnType<typeof loadRelease>;
type Options = NonNullable<Parameters<typeof publishArtifacts>[2]>;
let release: Release;
const put = (file: string, content: object | string) =>
	writeFileSync(
		file,
		typeof content === "string" ? content : JSON.stringify(content),
	);

function fixture(directory: string) {
	mkdirSync(directory, { recursive: true });
	put(join(directory, "package.json"), { private: true });
	put(join(directory, "LICENSE"), "Fixture license\n");
	put(join(directory, "CHANGELOG.md"), changelog);
	for (const id of [...packageDirectories, aco, support]) {
		const pkg = join(directory, "packages", id);
		mkdirSync(join(pkg, "dist"), { recursive: true });
		put(join(pkg, "package.json"), {
			name: `@monkeyman520/${id}`,
			version,
			license: "MIT",
			private: [aco, support].includes(id),
			keywords: ["pi-package"],
			files: ["dist", "README.md", "examples"],
			repository: {
				type: "git",
				url: `git+https://github.com/${repository}.git`,
				directory: `packages/${id}`,
			},
			publishConfig: { access: "public" },
			pi: {
				extensions: ["./dist/index.js"],
				changelogPath: "./dist/CHANGELOG.md",
			},
			scripts: { prepack: 'node -e "process.exit(99)"' },
		});
		put(join(pkg, "README.md"), "# Fixture\n");
		mkdirSync(join(pkg, "examples"));
		put(join(pkg, "examples/sample.json"), {});
		put(join(pkg, "dist/index.js"), "export default function () {}\n");
		put(join(pkg, "dist/LICENSE"), "Fixture license\n");
		put(join(pkg, "dist/CHANGELOG.md"), changelog);
	}
}

beforeAll(() => {
	fixture(root);
	release = loadRelease(root, tag, catalog);
	packArtifacts(release);
}, 30_000);
afterAll(() => rmSync(root, { recursive: true, force: true }));

describe("release input", () => {
	test("accepts a stable tag but not prereleases, leading zeroes, overflow or malformed input", () => {
		expect(versionFromTag(tag)).toBe(version);
		for (const invalid of [
			"2.3.4",
			"v2.3",
			"v2.3.4-rc.1",
			"v2.3.4+1",
			"v02.3.4",
			"v9007199254740992.0.0",
			"v2.3.4\n",
		])
			expect(() => versionFromTag(invalid)).toThrow(/stable vX.Y.Z/);
	});

	test("defaults to exactly five public packages, with explicit ACO opt-in only", () => {
		expect(
			loadRelease(root, tag)
				.packages.map(({ directory }) => basename(directory))
				.sort(),
		).toEqual([
			"pi-auto-resume",
			"pi-pretty-session",
			"pi-prompt-pipeline",
			"pi-quota-keeper",
			"pi-session-tree-explorer",
		]);
		const dir = join(root, "opt-in");
		fixture(dir);
		const file = join(dir, "packages", aco, "package.json");
		expect(() => loadRelease(dir, tag, [aco])).toThrow(
			/invalid public manifest/,
		);
		put(file, { ...JSON.parse(readFileSync(file, "utf8")), private: false });
		expect(
			loadRelease(dir, tag, [...catalog, aco]).packages.at(-1)?.manifest.name,
		).toBe("@monkeyman520/pi-context-aco");
		expect(() => loadRelease(dir, tag, [support])).toThrow(/ineligible/i);
	});

	test("rejects missing headings, near matches, and headings only inside fenced code", () => {
		const dir = join(root, "docs");
		fixture(dir);
		for (const input of [
			"## [2.3.40]\n",
			"## 2.3.4-rc\n",
			`~~~md\n${changelog}~~~\n`,
		]) {
			put(join(dir, "CHANGELOG.md"), input);
			expect(() => loadRelease(dir, tag)).toThrow(/missing a heading/);
		}
		put(join(dir, "CHANGELOG.md"), "## 2.3.4 - 2026-11-19\n");
		expect(loadRelease(dir, tag).version).toBe(version);
	});

	test.each([
		{ version: "2.3.5" },
		{ name: "@other/pi-auto-resume" },
		{ private: true },
		{
			pi: { extensions: ["./dist/index.js"], changelogPath: "./CHANGELOG.md" },
		},
		{ keywords: [] },
		{ files: ["dist", "README.md", ".."] },
		{ dependencies: { "pi-plugin-support": "workspace:*" } },
	])("rejects an invalid manifest: %j", (override) => {
		const dir = mkdtempSync(join(root, "invalid-"));
		fixture(dir);
		const file = join(dir, "packages", "pi-auto-resume", "package.json");
		put(file, { ...JSON.parse(readFileSync(file, "utf8")), ...override });
		expect(() => loadRelease(dir, tag)).toThrow(
			/manifest|files|runtime dependency/,
		);
	});

	test("limits CLI publication to the OIDC context and rejects a token fallback", () => {
		const env = {
			GITHUB_ACTIONS: "true",
			GITHUB_REPOSITORY: repository,
			GITHUB_EVENT_NAME: "push",
			GITHUB_REF: `refs/tags/${tag}`,
			ACTIONS_ID_TOKEN_REQUEST_URL: "https://example.invalid/token",
			ACTIONS_ID_TOKEN_REQUEST_TOKEN: "fixture",
		};
		expect(() => assertPublishContext(tag, env)).not.toThrow();
		for (const overrides of [
			{ GITHUB_REF: "refs/heads/main" },
			{ GITHUB_REPOSITORY: "other/fork" },
			{ ACTIONS_ID_TOKEN_REQUEST_TOKEN: "" },
			{ NPM_TOKEN: "unexpected" },
		])
			expect(() => assertPublishContext(tag, { ...env, ...overrides })).toThrow(
				/OIDC/,
			);
	});
});

describe("real local tarballs", () => {
	test("packs without running prepack and verifies without the built directory", () => {
		const dir = join(root, "without-build");
		fixture(dir);
		const metadata = loadRelease(dir, tag, [catalog[0]]);
		mkdirSync(metadata.output, { recursive: true });
		cpSync(
			join(release.output, release.packages[0].filename),
			join(metadata.output, metadata.packages[0].filename),
			{ force: false, errorOnExist: true },
		);
		rmSync(join(metadata.packages[0].directory, "dist"), { recursive: true });
		expect(() => verifyArtifacts(metadata)).not.toThrow();
		expect(() => packArtifacts(metadata)).toThrow(/empty/);
	});

	test.each([
		["dist/LICENSE", "Different license\n", /LICENSE differs/],
		[
			"dist/CHANGELOG.md",
			"## [2.3.4]\n- Not the original\n",
			/CHANGELOG.md differs/,
		],
		["dist/index.js", "", /missing dist\/index.js/],
		["dist/CHANGELOG.md", "", /missing dist\/CHANGELOG.md/],
	] as const)(
		"rejects a changed or deleted %s",
		(path, replacement, failure) => {
			const dir = mkdtempSync(join(root, "archive-"));
			fixture(dir);
			const fresh = loadRelease(dir, tag, [catalog[0]]);
			const pkg = fresh.packages[0];
			if (replacement) put(join(pkg.directory, path), replacement);
			else rmSync(join(pkg.directory, path));
			expect(() => packArtifacts(fresh)).toThrow(failure);
		},
		15_000,
	);

	test("rejects a missing declared document even when all built files are present", () => {
		const dir = join(root, "missing-doc");
		fixture(dir);
		const fresh = loadRelease(dir, tag, catalog);
		cpSync(release.output, fresh.output, { recursive: true });
		put(join(fresh.packages[0].directory, "examples/required.json"), {});
		expect(() => verifyArtifacts(fresh)).toThrow(
			/missing examples\/required.json/,
		);
	});

	test.each([
		["package/dist/index.js", "-", /Duplicate tar member/],
		["package/dist/unexpected", "l", /Unsafe tar member/],
		["package/dist/node_modules/unexpected", "-", /Unsafe tar member/],
		["package/dist/.env.local", "-", /Unsafe tar member/],
		["package/dist/../unexpected", "-", /Unsafe tar member/],
	])(
		"rejects unsafe or duplicate listings: %s (%s)",
		(name, kind, expected) => {
			expect(() =>
				verifyArtifacts(release, (tool, args, cwd) => {
					const result = runCommand(tool, args, cwd);
					const prefix =
						args[0] === "-tvzf" ? `${kind}rw-r--r-- 0 0 0 Jan 01 00:00 ` : "";
					return Buffer.concat([result, Buffer.from(`${prefix + name}\n`)]);
				}),
			).toThrow(expected);
		},
	);

	test("rejects an unexpected archive in the output directory", () => {
		const dir = join(root, "extra");
		fixture(dir);
		const fresh = loadRelease(dir, tag, catalog);
		cpSync(release.output, fresh.output, { recursive: true });
		put(join(fresh.output, "other.tgz"), "not expected");
		expect(() => verifyArtifacts(fresh)).toThrow(
			/exactly the expected tarballs/,
		);
	});
});

type Asset = { id: number; name: string; state: string; digest: string | null };

function services() {
	const versions = new Map<string, { reads: number; tag: string }>();
	const posted: string[] = [];
	const mutating: string[] = [];
	const assets: Asset[] = [];
	const actions = {
		failNpm: "",
		failUpload: "",
		failLookup: 0,
		wrongIdentity: false,
		visibilityDelay: 0,
		distTagDelay: 0,
	};
	let current:
		| { id: number; tag_name: string; draft: boolean; prerelease: boolean }
		| undefined;
	let newest = false;
	let nextId = 100;
	let ticks = 0;
	const options: Options = {
		waitMs: 45_000,
		clock: {
			now: () => ticks,
			sleep: async (ms) => {
				ticks += ms;
			},
		},
		run: (tool, args, cwd) => {
			if (tool !== "npm") return runCommand(tool, args, cwd);
			const pkg = release.packages.find(
				({ filename }) => filename === basename(args[1]),
			);
			if (!pkg) throw new Error("Unexpected publish artifact");
			expect(args).toEqual([
				"publish",
				join(release.output, pkg.filename),
				"--ignore-scripts",
				"--access",
				"public",
				"--tag",
				"latest",
				"--registry",
				"https://registry.npmjs.org",
			]);
			posted.push(pkg.manifest.name);
			if (pkg.manifest.name === actions.failNpm)
				throw new Error("npm OIDC exchange refused");
			if (versions.has(pkg.manifest.name))
				throw new Error("Attempt to overwrite npm version");
			versions.set(pkg.manifest.name, { reads: 0, tag: version });
			return Buffer.alloc(0);
		},
		http: async (address, init) => {
			const url = new URL(address);
			const method = init?.method ?? "GET";
			if (url.hostname === "registry.npmjs.org") {
				expect(new Headers(init?.headers).has("Authorization")).toBe(false);
				const [, encoded, requested] = url.pathname.split("/");
				const name = decodeURIComponent(encoded);
				const present = versions.get(name);
				if (actions.failLookup)
					return new Response(null, { status: actions.failLookup });
				if (!present) return new Response(null, { status: 404 });
				if (requested) {
					expect(requested).toBe(version);
					if (++present.reads <= actions.visibilityDelay)
						return new Response(null, { status: 404 });
					return Response.json({
						name: actions.wrongIdentity ? "other" : name,
						version,
					});
				}
				return Response.json({
					name,
					"dist-tags": {
						latest:
							present.reads <= actions.visibilityDelay + actions.distTagDelay
								? "2.3.3"
								: present.tag,
					},
				});
			}

			expect(["api.github.com", "uploads.github.com"]).toContain(url.hostname);
			expect(new Headers(init?.headers).get("Authorization")).toBe(
				"Bearer fixture",
			);
			expect(
				release.packages.every(
					({ manifest }) => versions.get(manifest.name)?.tag === version,
				),
			).toBe(true);
			const base = `/repos/${repository}/releases`;
			if (method === "GET") {
				if (url.pathname === `${base}/tags/${tag}`)
					return current && !current.draft
						? Response.json(current)
						: new Response(null, { status: 404 });
				if (url.pathname === base)
					return Response.json(current ? [current] : []);
				if (url.pathname === `${base}/1/assets`) return Response.json(assets);
				if (url.pathname === `${base}/latest`)
					return newest
						? Response.json(current)
						: new Response(null, { status: 404 });
			}
			mutating.push(`${method} ${url.pathname}`);
			if (method === "POST" && url.pathname === base) {
				expect(current).toBeUndefined();
				expect(JSON.parse(String(init?.body))).toEqual({
					tag_name: tag,
					name: tag,
					draft: true,
					prerelease: false,
					generate_release_notes: true,
				});
				current = { id: 1, tag_name: tag, draft: true, prerelease: false };
				return Response.json(current, { status: 201 });
			}
			if (method === "POST" && url.pathname === `${base}/1/assets`) {
				const name = url.searchParams.get("name");
				if (!name) throw new Error("Missing asset name");
				if (name === actions.failUpload)
					return new Response(null, { status: 502 });
				expect(assets.some((asset) => asset.name === name)).toBe(false);
				const digest = `sha256:${createHash("sha256")
					.update(init?.body as Uint8Array)
					.digest("hex")}`;
				const asset = { id: ++nextId, name, digest, state: "uploaded" };
				assets.push(asset);
				return Response.json(asset, { status: 201 });
			}
			if (method === "DELETE" && url.pathname.startsWith(`${base}/assets/`)) {
				const index = assets.findIndex(
					({ id }) => String(id) === url.pathname.split("/").at(-1),
				);
				if (index < 0) return new Response(null, { status: 404 });
				assets.splice(index, 1);
				return new Response(null, { status: 204 });
			}
			if (method === "PATCH" && url.pathname === `${base}/1` && current) {
				expect(assets.map(({ name }) => name).sort()).toEqual(
					release.packages.map(({ filename }) => filename).sort(),
				);
				expect(JSON.parse(String(init?.body))).toEqual({
					draft: false,
					prerelease: false,
					make_latest: "true",
				});
				current.draft = false;
				newest = true;
				return Response.json(current);
			}
			throw new Error(`Unexpected fixture request: ${method} ${address}`);
		},
	};
	return {
		actions,
		assets,
		posted,
		mutating,
		versions,
		publish: () => publishArtifacts(release, "fixture", options),
		elapsed: () => ticks,
		draft: () => current?.draft,
	};
}

describe("offline release delivery", () => {
	test("waits for exact version and then for latest before making a stable GitHub release", async () => {
		const s = services();
		s.actions.visibilityDelay = 1;
		s.actions.distTagDelay = 1;
		await s.publish();
		expect(s.elapsed()).toBe(60_000);
		expect(s.draft()).toBe(false);
		expect(s.posted).toEqual(
			release.packages.map(({ manifest }) => manifest.name),
		);
	}, 20_000);

	test("retries partial npm and GitHub failures without republishing or duplicating", async () => {
		const s = services();
		const [first, second] = release.packages;
		s.actions.failNpm = second.manifest.name;
		await expect(s.publish()).rejects.toThrow(/OIDC exchange/);
		expect(s.mutating).toEqual([]);
		s.actions.failNpm = "";
		s.actions.failUpload = second.filename;
		await expect(s.publish()).rejects.toThrow(/502/);
		expect(s.draft()).toBe(true);
		const [original] = s.assets;
		expect(original.name).toBe(first.filename);
		s.assets.push({
			id: 50,
			name: second.filename,
			state: "starter",
			digest: null,
		});
		s.actions.failUpload = "";
		await s.publish();
		expect(s.posted).toEqual([
			first.manifest.name,
			second.manifest.name,
			second.manifest.name,
		]);
		expect(s.assets[0]).toBe(original);
		expect(s.mutating.filter((row) => row.startsWith("DELETE"))).toHaveLength(
			1,
		);
		expect(s.draft()).toBe(false);
		const writes = s.mutating.length;
		await s.publish();
		expect(s.mutating.length).toBe(writes);
		expect(s.posted).toHaveLength(3);
	}, 30_000);

	test("refuses to complete a release when the exact version exists but latest differs", async () => {
		const s = services();
		s.versions.set(release.packages[0].manifest.name, {
			reads: 0,
			tag: "2.4.0",
		});
		await expect(s.publish()).rejects.toThrow(/timed out.*latest.*2.4.0/);
		expect(s.posted).toEqual([]);
		expect(s.mutating).toEqual([]);
	}, 15_000);

	test.each([403, 503])(
		"treats npm %i as an error, not a missing version",
		async (status) => {
			const s = services();
			s.actions.failLookup = status;
			await expect(s.publish()).rejects.toThrow(`HTTP ${status}`);
			expect(s.posted).toEqual([]);
			expect(s.mutating).toEqual([]);
		},
		15_000,
	);

	test("rejects a successful npm response for a different package", async () => {
		const s = services();
		s.versions.set(release.packages[0].manifest.name, {
			reads: 0,
			tag: version,
		});
		s.actions.wrongIdentity = true;
		await expect(s.publish()).rejects.toThrow(/different package/);
		expect(s.posted).toEqual([]);
		expect(s.mutating).toEqual([]);
	}, 15_000);
});
