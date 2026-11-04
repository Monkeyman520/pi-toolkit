import { execFile } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { SessionManager } from "@earendil-works/pi-coding-agent";

const execFileAsync = promisify(execFile);

export type ExecCommandFn = (
	command: string,
	args: string[],
	options?: { cwd?: string; timeout?: number },
) => Promise<{ code: number; stdout: string; stderr: string }>;

export interface ProjectGitInfo {
	isRepo: boolean;
	branch?: string;
	dirtyCount?: number;
	lastCommit?: string;
}

export interface ProjectManifestInfo {
	kind: "node" | "python" | "rust" | "go";
	file: string;
	name?: string;
	version?: string;
	scripts: string[];
	workspaces: boolean;
}

export interface ProjectInfo {
	name: string;
	cwd: string;
	shortCwd: string;
	git: ProjectGitInfo;
	manifest?: ProjectManifestInfo;
	sessionCount: number;
	inspectedAt: number;
}

const PRIORITY_SCRIPTS = [
	"dev",
	"start",
	"build",
	"test",
	"typecheck",
	"check",
	"lint",
	"smoke",
];

function cleanLine(text: string, maxLen = 72): string {
	const cleaned = text
		.replace(/\p{Cc}/gu, " ")
		.replace(/\s+/g, " ")
		.trim();
	return cleaned.length > maxLen ? `${cleaned.slice(0, maxLen - 1)}…` : cleaned;
}

export function shortenHomePath(cwd: string, home = homedir()): string {
	try {
		const resolvedCwd = resolve(cwd);
		const resolvedHome = resolve(home);
		const rel = relative(resolvedHome, resolvedCwd);
		if (rel === "") return "~";
		if (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel)) {
			return `~${sep}${rel}`;
		}
		return cwd;
	} catch {
		return cwd;
	}
}

async function defaultExec(
	command: string,
	args: string[],
	options?: { cwd?: string; timeout?: number },
): Promise<{ code: number; stdout: string; stderr: string }> {
	try {
		const { stdout, stderr } = await execFileAsync(command, args, {
			cwd: options?.cwd,
			timeout: options?.timeout ?? 3000,
			windowsHide: true,
			encoding: "utf8",
		});
		return { code: 0, stdout: stdout ?? "", stderr: stderr ?? "" };
	} catch (error) {
		const code =
			error &&
			typeof error === "object" &&
			"code" in error &&
			typeof error.code === "number"
				? error.code
				: 1;
		const stdout =
			error &&
			typeof error === "object" &&
			"stdout" in error &&
			typeof error.stdout === "string"
				? error.stdout
				: "";
		const stderr =
			error &&
			typeof error === "object" &&
			"stderr" in error &&
			typeof error.stderr === "string"
				? error.stderr
				: error instanceof Error
					? error.message
					: String(error);
		return { code, stdout, stderr };
	}
}

async function directoryExists(path: string): Promise<boolean> {
	try {
		const info = await stat(path);
		return info.isDirectory();
	} catch {
		return false;
	}
}

function selectPackageScripts(scriptsObj: Record<string, unknown>): string[] {
	const keys = Object.keys(scriptsObj).filter(
		(k) => typeof scriptsObj[k] === "string" && k.trim().length > 0,
	);
	const ordered: string[] = [];
	for (const priority of PRIORITY_SCRIPTS) {
		if (keys.includes(priority)) ordered.push(priority);
	}
	for (const key of keys) {
		if (!ordered.includes(key)) ordered.push(key);
	}
	return ordered.slice(0, 6);
}

function extractTomlSectionValue(
	content: string,
	sectionPattern: RegExp,
	key: string,
): string | undefined {
	const sectionMatch = sectionPattern.exec(content);
	if (!sectionMatch) return undefined;
	const start = sectionMatch.index + sectionMatch[0].length;
	const rest = content.slice(start);
	const nextSection = /^\s*\[/m.exec(rest);
	const body = nextSection ? rest.slice(0, nextSection.index) : rest;
	const keyRegex = new RegExp(
		`^\\s*${key}\\s*=\\s*["']([^"'\\r\\n]+)["']`,
		"m",
	);
	return keyRegex.exec(body)?.[1]?.trim();
}

export async function inspectManifest(
	cwd: string,
): Promise<ProjectManifestInfo | undefined> {
	// 1. package.json
	try {
		const raw = await readFile(join(cwd, "package.json"), "utf8");
		const parsed: unknown = JSON.parse(raw);
		if (parsed && typeof parsed === "object") {
			const obj = parsed as Record<string, unknown>;
			const name =
				typeof obj.name === "string" && obj.name.trim()
					? cleanLine(obj.name, 60)
					: undefined;
			const version =
				typeof obj.version === "string" && obj.version.trim()
					? cleanLine(obj.version, 32)
					: undefined;
			const scripts =
				obj.scripts && typeof obj.scripts === "object"
					? selectPackageScripts(obj.scripts as Record<string, unknown>)
					: [];
			const hasWorkspacesField =
				Array.isArray(obj.workspaces) ||
				(typeof obj.workspaces === "object" && obj.workspaces !== null);
			const hasPackagesDir = await directoryExists(join(cwd, "packages"));
			return {
				kind: "node",
				file: "package.json",
				name,
				version,
				scripts,
				workspaces: hasWorkspacesField || hasPackagesDir,
			};
		}
	} catch {
		// Fall through
	}

	// 2. pyproject.toml
	try {
		const raw = await readFile(join(cwd, "pyproject.toml"), "utf8");
		const name =
			extractTomlSectionValue(raw, /^\s*\[project\]/m, "name") ??
			extractTomlSectionValue(raw, /^\s*\[tool\.poetry\]/m, "name");
		const version =
			extractTomlSectionValue(raw, /^\s*\[project\]/m, "version") ??
			extractTomlSectionValue(raw, /^\s*\[tool\.poetry\]/m, "version");
		const workspaces = /^\s*\[tool\.uv\.workspace\]/m.test(raw);
		return {
			kind: "python",
			file: "pyproject.toml",
			name: name ? cleanLine(name, 60) : undefined,
			version: version ? cleanLine(version, 32) : undefined,
			scripts: [],
			workspaces,
		};
	} catch {
		// Fall through
	}

	// 3. Cargo.toml
	try {
		const raw = await readFile(join(cwd, "Cargo.toml"), "utf8");
		const name = extractTomlSectionValue(raw, /^\s*\[package\]/m, "name");
		const version = extractTomlSectionValue(raw, /^\s*\[package\]/m, "version");
		const workspaces = /^\s*\[workspace\]/m.test(raw);
		return {
			kind: "rust",
			file: "Cargo.toml",
			name: name ? cleanLine(name, 60) : undefined,
			version: version ? cleanLine(version, 32) : undefined,
			scripts: [],
			workspaces,
		};
	} catch {
		// Fall through
	}

	// 4. go.mod
	try {
		const raw = await readFile(join(cwd, "go.mod"), "utf8");
		const moduleMatch = /^\s*module\s+([^\s\r\n]+)/m.exec(raw);
		const goMatch = /^\s*go\s+([^\s\r\n]+)/m.exec(raw);
		return {
			kind: "go",
			file: "go.mod",
			name: moduleMatch?.[1] ? cleanLine(moduleMatch[1], 60) : undefined,
			version: goMatch?.[1] ? `go${cleanLine(goMatch[1], 24)}` : undefined,
			scripts: [],
			workspaces: false,
		};
	} catch {
		// Fall through
	}

	return undefined;
}

export async function inspectGit(
	cwd: string,
	exec: ExecCommandFn = defaultExec,
): Promise<ProjectGitInfo> {
	const safeExec: ExecCommandFn = async (cmd, args, opts) => {
		try {
			return await exec(cmd, args, opts);
		} catch (error) {
			return {
				code: 1,
				stdout: "",
				stderr: error instanceof Error ? error.message : String(error),
			};
		}
	};

	const inside = await safeExec("git", ["rev-parse", "--is-inside-work-tree"], {
		cwd,
		timeout: 2500,
	});
	if (inside.code !== 0 || inside.stdout.trim() !== "true") {
		return { isRepo: false };
	}

	const [branchRes, statusRes, logRes] = await Promise.all([
		safeExec("git", ["symbolic-ref", "--short", "HEAD"], {
			cwd,
			timeout: 2500,
		}),
		safeExec("git", ["status", "--porcelain"], {
			cwd,
			timeout: 2500,
		}),
		safeExec("git", ["log", "-1", "--pretty=format:%h %s"], {
			cwd,
			timeout: 2500,
		}),
	]);

	let branch = branchRes.code === 0 ? cleanLine(branchRes.stdout, 48) : "";
	if (!branch) {
		const detached = await safeExec("git", ["rev-parse", "--short", "HEAD"], {
			cwd,
			timeout: 2500,
		});
		if (detached.code === 0 && detached.stdout.trim()) {
			branch = `detached@${cleanLine(detached.stdout, 24)}`;
		} else {
			branch = "unborn";
		}
	}

	const dirtyCount =
		statusRes.code === 0
			? statusRes.stdout
					.split(/\r?\n/)
					.map((l) => l.trim())
					.filter((l) => l.length > 0).length
			: undefined;

	const lastCommit =
		logRes.code === 0 && logRes.stdout.trim()
			? cleanLine(logRes.stdout, 72)
			: undefined;

	return {
		isRepo: true,
		branch,
		dirtyCount,
		lastCommit,
	};
}

export async function inspectProject(
	cwd: string,
	options?: {
		exec?: ExecCommandFn;
		sessionDir?: string;
		sessionCount?: number;
		homeDir?: string;
		now?: number;
	},
): Promise<ProjectInfo> {
	const resolvedCwd = resolve(cwd);
	const exec = options?.exec ?? defaultExec;
	const [manifest, git, resolvedSessionCount] = await Promise.all([
		inspectManifest(resolvedCwd),
		inspectGit(resolvedCwd, exec),
		options?.sessionCount !== undefined
			? Promise.resolve(options.sessionCount)
			: SessionManager.list(resolvedCwd, options?.sessionDir)
					.then((list) => list.length)
					.catch(() => 0),
	]);

	const fallbackDirName = basename(resolvedCwd) || resolvedCwd;
	const name = manifest?.name || fallbackDirName;

	return {
		name,
		cwd: resolvedCwd,
		shortCwd: shortenHomePath(resolvedCwd, options?.homeDir),
		git,
		manifest,
		sessionCount: resolvedSessionCount,
		inspectedAt: options?.now ?? Date.now(),
	};
}
