import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
	lstatSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

export const repository = "Monkeyman520/pi-toolkit";
export const packageDirectories = [
	"pi-auto-resume",
	"pi-pretty-session",
	"pi-quota-keeper",
	"pi-session-tree-explorer",
	"pi-prompt-pipeline",
] as const;

const registry = "https://registry.npmjs.org";
const releases = `https://api.github.com/repos/${repository}/releases`;
const stableVersion = "(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)";
const stableTag = new RegExp(`^v${stableVersion}$`);
const heading = new RegExp(
	"^##[ \\t]+(?:\\[(" +
		stableVersion +
		")\\]|(" +
		stableVersion +
		"))(?=$|[ \\t])",
);

type Json = Record<string, unknown>;
interface Manifest extends Json {
	name: string;
	version: string;
	files: string[];
}

interface ReleasePackage {
	directory: string;
	manifest: Manifest;
	filename: string;
}

interface Release {
	root: string;
	tag: string;
	version: string;
	packages: ReleasePackage[];
	changelog: Buffer;
	output: string;
}

type Command = (tool: "npm" | "tar", args: string[], cwd: string) => Buffer;
type Http = (url: string, options?: RequestInit) => Promise<Response>;

function object(value: unknown, label: string): Json {
	if (!value || typeof value !== "object" || Array.isArray(value))
		throw new Error(`Expected an object: ${label}`);
	return value as Json;
}

function readManifest(file: string): Json {
	return object(JSON.parse(readFileSync(file, "utf8")), file);
}

export function versionFromTag(tag: string): string {
	const parts = stableTag.exec(tag);
	if (
		!parts ||
		parts[0] !== tag ||
		parts.slice(1).some((part) => !Number.isSafeInteger(Number(part)))
	)
		throw new Error(
			`Expected a stable vX.Y.Z tag, received ${JSON.stringify(tag)}`,
		);
	return tag.slice(1);
}

function hasVersion(changelog: Buffer, version: string): boolean {
	let fence: string | undefined;
	for (const line of changelog.toString("utf8").split(/\r?\n/)) {
		const marker = /^ {0,3}([\x60]{3,}|~{3,})(.*)$/.exec(line);
		if (marker) {
			if (!fence) fence = marker[1];
			else if (marker[1].startsWith(fence) && !marker[2].trim())
				fence = undefined;
			continue;
		}
		const parsed = fence ? null : heading.exec(line);
		if (parsed && (parsed[1] ?? parsed[5]) === version) return true;
	}
	return false;
}

function safePart(part: string): boolean {
	return (
		/^[\w.-]+$/.test(part) &&
		![".", "..", "node_modules", "vendor"].includes(part.toLowerCase()) &&
		!part.toLowerCase().startsWith(".env") &&
		!part.endsWith(".")
	);
}

export function loadRelease(
	root: string,
	tag: string,
	catalog: readonly string[] = packageDirectories,
): Release {
	root = resolve(root);
	const version = versionFromTag(tag);
	if (readManifest(join(root, "package.json")).private !== true)
		throw new Error("Workspace root must remain private");
	if (
		readManifest(join(root, "packages/pi-plugin-support/package.json"))
			.private !== true
	)
		throw new Error("pi-plugin-support must remain private");
	if (!catalog.length || new Set(catalog).size !== catalog.length)
		throw new Error("Release catalog must be nonempty and unique");
	const changelog = readFileSync(join(root, "CHANGELOG.md"));
	if (!hasVersion(changelog, version))
		throw new Error(`CHANGELOG.md is missing a heading for ${version}`);

	const packages = catalog.map((id): ReleasePackage => {
		if (!/^pi-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) || id === "pi-plugin-support")
			throw new Error(`Ineligible release directory: ${id}`);
		const directory = join(root, "packages", id);
		if (!lstatSync(directory).isDirectory())
			throw new Error(`Expected a package directory: ${id}`);
		const manifest = readManifest(join(directory, "package.json"));
		const pi = object(manifest.pi, `${id} pi manifest`);
		const name = `@monkeyman520/${id}`;
		if (
			manifest.name !== name ||
			manifest.version !== version ||
			(manifest.private !== undefined && manifest.private !== false) ||
			manifest.license !== "MIT" ||
			!isDeepStrictEqual(manifest.publishConfig, { access: "public" }) ||
			!Array.isArray(manifest.keywords) ||
			!manifest.keywords.includes("pi-package") ||
			!isDeepStrictEqual(manifest.repository, {
				type: "git",
				url: `git+https://github.com/${repository}.git`,
				directory: `packages/${id}`,
			}) ||
			!isDeepStrictEqual(pi.extensions, ["./dist/index.js"]) ||
			pi.changelogPath !== "./dist/CHANGELOG.md"
		)
			throw new Error(`${id}: invalid public manifest for ${name}@${version}`);
		const files = manifest.files;
		if (
			!Array.isArray(files) ||
			!files.includes("dist") ||
			!files.includes("README.md") ||
			files.some((file) => typeof file !== "string" || !safePart(file)) ||
			new Set(files).size !== files.length
		)
			throw new Error(`${id}: invalid files allowlist`);
		for (const key of [
			"dependencies",
			"optionalDependencies",
			"peerDependencies",
		]) {
			const dependencies = manifest[key];
			if (
				dependencies &&
				Object.hasOwn(object(dependencies, key), "pi-plugin-support")
			)
				throw new Error(
					`${id}: pi-plugin-support cannot be a runtime dependency`,
				);
		}
		if (
			manifest.bundleDependencies !== undefined ||
			manifest.bundledDependencies !== undefined
		)
			throw new Error(
				`${id}: dependencies may not be shipped as separate bundles`,
			);
		return {
			directory,
			manifest: { ...manifest, name, version, files },
			filename: `monkeyman520-${id}-${version}.tgz`,
		};
	});
	return {
		root,
		tag,
		version,
		packages,
		changelog,
		output: join(root, "dist", "release"),
	};
}

export const runCommand: Command = (tool, args, cwd) => {
	const onWindows = process.platform === "win32";
	const node =
		onWindows && tool === "npm" && process.versions.bun
			? execFileSync("node", ["-p", "process.execPath"], {
					encoding: "utf8",
					timeout: 10_000,
				}).trim()
			: process.execPath;
	const command = !onWindows
		? tool
		: tool === "tar"
			? join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe")
			: node;
	const cli = join(dirname(node), "node_modules", "npm", "bin", "npm-cli.js");
	// npm needs the Actions OIDC environment, not the GitHub Release credential.
	const env = { ...process.env };
	delete env.GITHUB_TOKEN;
	const publishing = tool === "npm" && args[0] === "publish";
	// npm may fall back to configured credentials if the OIDC exchange fails.
	const isolated = publishing
		? mkdtempSync(join(tmpdir(), "pi-release-npm-"))
		: undefined;
	if (isolated) {
		for (const key of Object.keys(env))
			if (/^npm_config_/i.test(key)) delete env[key];
		args = [
			...args,
			"--userconfig",
			join(isolated, "user.npmrc"),
			"--globalconfig",
			join(isolated, "global.npmrc"),
		];
	}
	try {
		return execFileSync(
			command,
			onWindows && tool === "npm" ? [cli, ...args] : args,
			{
				cwd: isolated ?? cwd,
				env,
				stdio: ["ignore", "pipe", "pipe"],
				windowsHide: true,
				timeout: 120_000,
				maxBuffer: 16 * 1024 * 1024,
			},
		);
	} catch (error) {
		if (publishing)
			throw new Error(
				"npm publish failed; check OIDC trust and registry status before retrying",
			);
		throw error;
	} finally {
		if (isolated) rmSync(isolated, { recursive: true, force: true });
	}
};

function sourceFiles(root: string, path: string): string[] {
	const stat = lstatSync(join(root, path));
	if (stat.isFile()) return [path];
	if (!stat.isDirectory())
		throw new Error(`Unsupported shipped source: ${path}`);
	return readdirSync(join(root, path)).flatMap((child) =>
		sourceFiles(root, `${path}/${child}`),
	);
}

function archiveMembers(file: string, cwd: string, run: Command): Set<string> {
	const lines = (flags: string) =>
		run("tar", [flags, file], cwd).toString("utf8").trimEnd().split(/\r?\n/);
	const names = lines("-tzf");
	const details = lines("-tvzf");
	if (names.length !== details.length)
		throw new Error(`Unexpected tar listing: ${file}`);
	const seen = new Set<string>();
	const files = new Set<string>();
	for (const [index, name] of names.entries()) {
		if (!name.startsWith("package/") || !details[index].endsWith(` ${name}`))
			throw new Error(`Unsafe tar member: ${JSON.stringify(name)}`);
		const directory = name.endsWith("/");
		const path = name.slice("package/".length, directory ? -1 : undefined);
		if (
			details[index][0] !== (directory ? "d" : "-") ||
			(path ? !path.split("/").every(safePart) : name !== "package/")
		)
			throw new Error(`Unsafe tar member: ${JSON.stringify(name)}`);
		const key = path.toLowerCase();
		if (seen.has(key)) throw new Error(`Duplicate tar member: ${path}`);
		seen.add(key);
		if (path) files.add(directory ? `${path}/` : path);
	}
	return files;
}

const builtPaths = ["dist/index.js", "dist/LICENSE", "dist/CHANGELOG.md"];

function verifyTarball(
	release: Release,
	pkg: ReleasePackage,
	run: Command,
): void {
	const file = join(release.output, pkg.filename);
	const members = archiveMembers(file, pkg.directory, run);
	const allow = ["package.json", "LICENSE", ...pkg.manifest.files];
	for (const member of members) {
		if (!allow.some((path) => member === path || member.startsWith(`${path}/`)))
			throw new Error(`${pkg.filename}: unexpected member ${member}`);
	}
	const required = [
		"package.json",
		...builtPaths,
		...pkg.manifest.files
			.filter((path) => path !== "dist")
			.flatMap((path) => sourceFiles(pkg.directory, path)),
	];
	for (const path of required) {
		if (!members.has(path)) throw new Error(`${pkg.filename}: missing ${path}`);
	}
	const read = (path: string) =>
		run("tar", ["-xOzf", file, `package/${path}`], pkg.directory);
	const packed = JSON.parse(read("package.json").toString("utf8"));
	if (!isDeepStrictEqual(packed, pkg.manifest))
		throw new Error(`${pkg.filename}: packed manifest differs from source`);
	if (!read("dist/index.js").toString("utf8").trim())
		throw new Error(`${pkg.filename}: empty built Pi entry`);
	for (const [path, expected] of [
		["dist/LICENSE", readFileSync(join(release.root, "LICENSE"))],
		["dist/CHANGELOG.md", release.changelog],
	] as const) {
		if (!read(path).equals(expected))
			throw new Error(`${pkg.filename}: ${path} differs from repository`);
	}
}

export function verifyArtifacts(
	release: Release,
	run: Command = runCommand,
): void {
	if (!lstatSync(release.output).isDirectory())
		throw new Error("Release output must be a directory");
	const entries = readdirSync(release.output, { withFileTypes: true });
	if (
		entries.some((entry) => !entry.isFile()) ||
		!isDeepStrictEqual(
			entries.map(({ name }) => name).sort(),
			release.packages.map(({ filename }) => filename).sort(),
		)
	)
		throw new Error(
			"Release directory must contain exactly the expected tarballs",
		);
	for (const pkg of release.packages) verifyTarball(release, pkg, run);
}

export function packArtifacts(
	release: Release,
	run: Command = runCommand,
): void {
	mkdirSync(release.output, { recursive: true });
	if (
		!lstatSync(release.output).isDirectory() ||
		readdirSync(release.output).length
	)
		throw new Error(
			"Pack requires an empty dist/release directory; move stale artifacts first",
		);
	for (const pkg of release.packages) {
		run(
			"npm",
			[
				"pack",
				"--json",
				"--ignore-scripts",
				"--offline",
				"--pack-destination",
				release.output,
			],
			pkg.directory,
		);
	}
	verifyArtifacts(release, run);
}

const request: Http = (url, options) =>
	fetch(url, {
		...options,
		redirect: "error",
		signal: AbortSignal.timeout(45_000),
	});

const publicationClock = { now: () => performance.now(), sleep };
interface PublishOptions {
	run?: Command;
	http?: Http;
	clock?: { now(): number; sleep(ms: number): Promise<void> };
	waitMs?: number;
}

async function available(pkg: ReleasePackage, http: Http): Promise<boolean> {
	const { name, version } = pkg.manifest;
	const res = await http(`${registry}/${encodeURIComponent(name)}/${version}`, {
		cache: "no-store",
	});
	if (res.status === 404) return false;
	if (!res.ok)
		throw new Error(`${name}: npm version lookup HTTP ${res.status}`);
	const value = object(await res.json(), "npm version");
	if (value.name !== name || value.version !== version)
		throw new Error(`${name}: npm returned a different package or version`);
	return true;
}

async function latest(
	pkg: ReleasePackage,
	http: Http,
): Promise<string | undefined> {
	const { name } = pkg.manifest;
	const res = await http(`${registry}/${encodeURIComponent(name)}`, {
		cache: "no-store",
		headers: { Accept: "application/vnd.npm.install-v1+json" },
	});
	if (res.status === 404) return undefined;
	if (!res.ok)
		throw new Error(`${name}: npm dist-tags lookup HTTP ${res.status}`);
	const value = object(await res.json(), "npm packument");
	const tags = object(value["dist-tags"], "npm dist-tags");
	if (
		value.name !== name ||
		(tags.latest !== undefined && typeof tags.latest !== "string")
	)
		throw new Error(`${name}: invalid npm dist-tags response`);
	return tags.latest;
}

async function waitForNpm(
	pkg: ReleasePackage,
	http: Http,
	clock: NonNullable<PublishOptions["clock"]>,
	waitMs: number,
): Promise<void> {
	const { name, version } = pkg.manifest;
	const deadline = clock.now() + waitMs;
	for (;;) {
		const exists = await available(pkg, http);
		const current = exists ? await latest(pkg, http) : undefined;
		if (exists && current === version) return;
		const remaining = deadline - clock.now();
		if (remaining <= 0)
			throw new Error(
				name +
					"@" +
					version +
					": timed out verifying exact npm version and latest (observed " +
					(current ?? "unavailable") +
					"); check the registry before rerunning",
			);
		await clock.sleep(Math.min(15_000, remaining));
	}
}

function idOf(data: Json): number {
	if (
		typeof data.id !== "number" ||
		!Number.isSafeInteger(data.id) ||
		data.id <= 0
	)
		throw new Error("Invalid GitHub resource ID");
	return data.id;
}

async function deliverRelease(
	release: Release,
	token: string,
	http: Http,
): Promise<void> {
	const headers = {
		Authorization: `Bearer ${token}`,
		Accept: "application/vnd.github+json",
		"X-GitHub-Api-Version": "2022-11-28",
	};
	const call = async (
		url: string,
		method = "GET",
		json?: Json,
		allowMissing = false,
	) => {
		const res = await http(url, {
			method,
			headers: json
				? { ...headers, "Content-Type": "application/json" }
				: headers,
			...(json && { body: JSON.stringify(json) }),
		});
		if (!res.ok && !(allowMissing && res.status === 404))
			throw new Error(`GitHub ${method} failed: HTTP ${res.status}`);
		return res;
	};
	async function* pages(url: string) {
		for (let page = 1; ; page++) {
			const data: unknown = await (
				await call(`${url}?per_page=100&page=${page}`)
			).json();
			if (!Array.isArray(data)) throw new Error("Invalid GitHub collection");
			for (const row of data) yield object(row, "GitHub collection entry");
			if (data.length < 100) return;
		}
	}
	const lookup = await call(
		`${releases}/tags/${release.tag}`,
		"GET",
		undefined,
		true,
	);
	let current: Json | undefined;
	if (lookup.status === 404) {
		// Tag lookup may omit drafts; reuse one left behind by an interrupted upload.
		for await (const candidate of pages(releases)) {
			if (candidate.tag_name !== release.tag) continue;
			if (current)
				throw new Error(`Multiple GitHub releases for ${release.tag}`);
			current = candidate;
		}
	} else {
		current = object(await lookup.json(), "GitHub release");
	}
	current ??= object(
		await (
			await call(releases, "POST", {
				tag_name: release.tag,
				name: release.tag,
				draft: true,
				prerelease: false,
				generate_release_notes: true,
			})
		).json(),
		"created release",
	);
	if (
		current.tag_name !== release.tag ||
		current.prerelease !== false ||
		typeof current.draft !== "boolean"
	)
		throw new Error("Unexpected GitHub release identity or state");
	const resource = `${releases}/${idOf(current)}`;
	const names = new Set(release.packages.map(({ filename }) => filename));
	const existing = new Map<string, Json>();
	for await (const asset of pages(`${resource}/assets`)) {
		if (typeof asset.name !== "string")
			throw new Error("Invalid GitHub asset name");
		if (!names.has(asset.name)) continue;
		if (existing.has(asset.name))
			throw new Error(`Duplicate GitHub asset: ${asset.name}`);
		existing.set(asset.name, asset);
	}
	for (const { filename } of release.packages) {
		const bytes = readFileSync(join(release.output, filename));
		const digest = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
		const asset = existing.get(filename);
		if (asset?.digest === digest && asset.state === "uploaded") continue;
		if (asset) await call(`${releases}/assets/${idOf(asset)}`, "DELETE");
		const url =
			"https://uploads.github.com/repos/" +
			repository +
			"/releases/" +
			idOf(current) +
			"/assets?name=" +
			encodeURIComponent(filename);
		const upload = await http(url, {
			method: "POST",
			headers: { ...headers, "Content-Type": "application/gzip" },
			body: new Uint8Array(bytes),
		});
		if (!upload.ok)
			throw new Error(`${filename}: GitHub asset upload HTTP ${upload.status}`);
		const delivered = object(await upload.json(), "uploaded asset");
		if (
			delivered.name !== filename ||
			delivered.digest !== digest ||
			delivered.state !== "uploaded"
		)
			throw new Error(
				`${filename}: GitHub did not confirm the expected asset digest`,
			);
	}
	if (!current.draft) {
		const newest = await call(`${releases}/latest`, "GET", undefined, true);
		if (
			newest.ok &&
			idOf(object(await newest.json(), "latest release")) === idOf(current)
		)
			return;
	}
	const finished = object(
		await (
			await call(resource, "PATCH", {
				draft: false,
				prerelease: false,
				make_latest: "true",
			})
		).json(),
		"finalized release",
	);
	if (
		idOf(finished) !== idOf(current) ||
		finished.tag_name !== release.tag ||
		finished.draft !== false ||
		finished.prerelease !== false
	)
		throw new Error("GitHub did not finalize the expected stable release");
}

export async function publishArtifacts(
	release: Release,
	token: string,
	options: PublishOptions = {},
): Promise<void> {
	if (!token)
		throw new Error("GITHUB_TOKEN is required for GitHub Release delivery");
	const {
		run = runCommand,
		http = request,
		clock = publicationClock,
		waitMs = 20 * 60_000,
	} = options;
	verifyArtifacts(release, run);
	for (const pkg of release.packages) {
		if (await available(pkg, http)) {
			console.log(
				`Already on npm: ${pkg.manifest.name}@${pkg.manifest.version}`,
			);
		} else {
			run(
				"npm",
				[
					"publish",
					join(release.output, pkg.filename),
					"--ignore-scripts",
					"--access",
					"public",
					"--tag",
					"latest",
					"--registry",
					registry,
				],
				pkg.directory,
			);
		}
		await waitForNpm(pkg, http, clock, waitMs);
	}
	// Recheck earlier packages too; another run or maintainer may have moved latest.
	for (const pkg of release.packages) {
		if (
			!(await available(pkg, http)) ||
			(await latest(pkg, http)) !== release.version
		)
			throw new Error(
				pkg.manifest.name +
					": npm version/latest changed before GitHub delivery",
			);
	}
	await deliverRelease(release, token, http);
}

export function assertPublishContext(
	tag: string,
	env: NodeJS.ProcessEnv,
): void {
	if (
		env.GITHUB_ACTIONS !== "true" ||
		env.GITHUB_REPOSITORY !== repository ||
		env.GITHUB_EVENT_NAME !== "push" ||
		env.GITHUB_REF !== `refs/tags/${tag}` ||
		!env.ACTIONS_ID_TOKEN_REQUEST_URL ||
		!env.ACTIONS_ID_TOKEN_REQUEST_TOKEN ||
		env.NPM_TOKEN ||
		env.NODE_AUTH_TOKEN
	)
		throw new Error(
			"Publish requires this repository's Actions tag-push OIDC job without npm tokens",
		);
}

if (
	process.argv[1] &&
	resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
	try {
		const [mode, tag, ...rest] = process.argv.slice(2);
		if (
			!["validate", "pack", "verify", "publish"].includes(mode) ||
			!tag ||
			rest.length
		)
			throw new Error(
				"Usage: node scripts/release.ts <validate|pack|verify|publish> vX.Y.Z",
			);
		const release = loadRelease(
			fileURLToPath(new URL("../", import.meta.url)),
			tag,
		);
		if (mode === "pack") packArtifacts(release);
		if (mode === "verify") verifyArtifacts(release);
		if (mode === "publish") {
			assertPublishContext(tag, process.env);
			await publishArtifacts(release, process.env.GITHUB_TOKEN ?? "");
		}
		console.log(
			mode +
				" succeeded for " +
				tag +
				" (" +
				release.packages.length +
				" packages)",
		);
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
	}
}
