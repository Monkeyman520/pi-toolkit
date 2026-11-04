import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	inspectGit,
	inspectManifest,
	inspectProject,
	shortenHomePath,
} from "../extensions/project.ts";

describe("project inspection", () => {
	let dir = "";

	beforeEach(async () => {
		dir = await mkdtemp(join(tmpdir(), "pi-pretty-session-proj-"));
	});

	afterEach(async () => {
		if (dir) {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it("shortens paths under home directory", () => {
		const home = join(dir, "home");
		const sub = join(home, "work", "repo");
		expect(shortenHomePath(home, home)).toBe("~");
		expect(shortenHomePath(sub, home)).toMatch(/^~[\\/]work[\\/]repo$/);
	});

	it("detects package.json, priority scripts, and workspace structure", async () => {
		await mkdir(join(dir, "packages"), { recursive: true });
		await writeFile(
			join(dir, "package.json"),
			JSON.stringify({
				name: "my-workspace",
				version: "1.2.3",
				scripts: {
					custom: "node custom.js",
					test: "vitest run",
					build: "tsc",
					typecheck: "tsc --noEmit",
				},
			}),
			"utf8",
		);

		const manifest = await inspectManifest(dir);
		expect(manifest).toEqual({
			kind: "node",
			file: "package.json",
			name: "my-workspace",
			version: "1.2.3",
			scripts: ["build", "test", "typecheck", "custom"],
			workspaces: true,
		});
	});

	it("detects pyproject.toml, Cargo.toml, and go.mod manifests", async () => {
		const pyDir = join(dir, "py");
		await mkdir(pyDir, { recursive: true });
		await writeFile(
			join(pyDir, "pyproject.toml"),
			'[project]\nname = "py-app"\nversion = "0.4.0"\n[tool.uv.workspace]\nmembers = ["pkg"]\n',
			"utf8",
		);
		expect(await inspectManifest(pyDir)).toEqual({
			kind: "python",
			file: "pyproject.toml",
			name: "py-app",
			version: "0.4.0",
			scripts: [],
			workspaces: true,
		});

		const rsDir = join(dir, "rs");
		await mkdir(rsDir, { recursive: true });
		await writeFile(
			join(rsDir, "Cargo.toml"),
			'[package]\nname = "rust-crate"\nversion = "0.9.1"\n',
			"utf8",
		);
		expect(await inspectManifest(rsDir)).toEqual({
			kind: "rust",
			file: "Cargo.toml",
			name: "rust-crate",
			version: "0.9.1",
			scripts: [],
			workspaces: false,
		});

		const goDir = join(dir, "go");
		await mkdir(goDir, { recursive: true });
		await writeFile(
			join(goDir, "go.mod"),
			"module example.com/service\n\ngo 1.23\n",
			"utf8",
		);
		expect(await inspectManifest(goDir)).toEqual({
			kind: "go",
			file: "go.mod",
			name: "example.com/service",
			version: "go1.23",
			scripts: [],
			workspaces: false,
		});
	});

	it("inspects git repository branch, dirty status, and latest commit via exec", async () => {
		const mockExec = async (_cmd: string, args: string[]) => {
			if (args[0] === "rev-parse" && args[1] === "--is-inside-work-tree") {
				return { code: 0, stdout: "true\n", stderr: "" };
			}
			if (args[0] === "symbolic-ref") {
				return { code: 0, stdout: "feat/pretty-session\n", stderr: "" };
			}
			if (args[0] === "status") {
				return {
					code: 0,
					stdout: " M README.md\n?? packages/pi-pretty-session/\n",
					stderr: "",
				};
			}
			if (args[0] === "log") {
				return {
					code: 0,
					stdout: "a1b2c3d feat: add session summarizer\n",
					stderr: "",
				};
			}
			return { code: 1, stdout: "", stderr: "" };
		};

		const git = await inspectGit(dir, mockExec);
		expect(git).toEqual({
			isRepo: true,
			branch: "feat/pretty-session",
			dirtyCount: 2,
			lastCommit: "a1b2c3d feat: add session summarizer",
		});

		const project = await inspectProject(dir, {
			exec: mockExec,
			sessionCount: 7,
			now: 1700000000000,
		});
		expect(project.git.branch).toBe("feat/pretty-session");
		expect(project.sessionCount).toBe(7);
		expect(project.inspectedAt).toBe(1700000000000);
	});
});
