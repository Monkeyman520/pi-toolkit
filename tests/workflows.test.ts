import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

interface Step {
	uses?: string;
	run?: string;
	with?: Record<string, unknown>;
	env?: Record<string, string>;
}
interface Job {
	if?: string;
	needs?: string;
	permissions?: Record<string, string>;
	"runs-on": string;
	steps: Step[];
}
interface Workflow {
	on: unknown;
	env?: Record<string, string>;
	permissions: Record<string, string>;
	concurrency: Record<string, unknown>;
	jobs: Record<string, Job>;
}
const read = (path: string) =>
	readFileSync(new URL(path, import.meta.url), "utf8");
const ci = Bun.YAML.parse(read("../.github/workflows/ci.yml")) as Workflow;
const release = Bun.YAML.parse(
	read("../.github/workflows/release.yml"),
) as Workflow;
const bunVersion = JSON.parse(read("../package.json")).packageManager.split(
	"@",
)[1];
const quality = [
	"bun install --frozen-lockfile",
	"bun run check",
	"bun run typecheck",
	"bun run build",
	"bun run test",
];
const expr = (value: string) => `\${{ ${value} }}`;
const readOnly = { contents: "read" };

function action(step: Step, name: string) {
	const [source, pin] = step.uses?.split("@") ?? [];
	expect(source).toBe(name);
	expect(pin).toMatch(/^[0-9a-f]{40}$/);
}
function checkout(job: Job) {
	expect(job["runs-on"]).toBe("ubuntu-latest");
	action(job.steps[0], "actions/checkout");
	expect(job.steps[0].with).toEqual({
		ref: expr("github.sha"),
		"persist-credentials": false,
	});
	action(job.steps[1], "actions/setup-node");
	expect(job.steps[1].with).toEqual({ "node-version": "24" });
}
function setupBun(job: Job) {
	action(job.steps[2], "oven-sh/setup-bun");
	expect(job.steps[2].with).toEqual({ "bun-version": bunVersion });
}
const commands = (job: Job) =>
	job.steps.flatMap((step) => (step.run ? [step.run] : []));

describe("workflow contracts", () => {
	test("CI runs only the ordered quality gates for PRs and main pushes, with read-only access", () => {
		expect(ci.on).toEqual({ pull_request: null, push: { branches: ["main"] } });
		expect(ci.permissions).toEqual(readOnly);
		expect(ci.concurrency).toEqual({
			group: `ci-${expr("github.ref")}`,
			"cancel-in-progress": true,
		});
		expect(Object.keys(ci.jobs)).toEqual(["check"]);
		const job = ci.jobs.check;
		expect(job.permissions).toBeUndefined();
		expect(job.steps).toHaveLength(3 + quality.length);
		checkout(job);
		setupBun(job);
		expect(commands(job)).toEqual(quality);
	});

	test("only tag pushes enter release validation; publishing requires this repository's validation", () => {
		expect(release.on).toEqual({ push: { tags: ["v[0-9]*"] } });
		expect(Object.keys(release.jobs).sort()).toEqual(["publish", "validate"]);
		expect(release.env).toEqual({ RELEASE_TAG: expr("github.ref_name") });
		expect(release.permissions).toEqual(readOnly);
		expect(release.concurrency).toEqual({
			group: `release-${expr("github.ref")}`,
			"cancel-in-progress": false,
		});
		const repo = "github.repository == 'Monkeyman520/pi-toolkit'";
		expect(release.jobs.validate.if).toBe(
			`${repo} && github.event.deleted == false`,
		);
		expect(release.jobs.validate.permissions).toBeUndefined();
		expect(release.jobs.publish.if).toBe(repo);
		expect(release.jobs.publish.needs).toBe("validate");
	});

	test("validation builds and uploads only the checked release tarballs", () => {
		const job = release.jobs.validate;
		checkout(job);
		setupBun(job);
		expect(job.steps).toHaveLength(6 + quality.length);
		expect(commands(job)).toEqual([
			'node scripts/release.ts validate "$RELEASE_TAG"',
			...quality,
			'node scripts/release.ts pack "$RELEASE_TAG"',
		]);
		const upload = job.steps.at(-1);
		if (!upload) throw new Error("Missing artifact upload");
		action(upload, "actions/upload-artifact");
		expect(upload.with).toEqual({
			name: "release-tarballs",
			path: "dist/release/*.tgz",
			"retention-days": 7,
			"if-no-files-found": "error",
			overwrite: true,
		});
	});

	test("publish consumes the same artifact and uses only job-local OIDC and GitHub credentials", () => {
		const job = release.jobs.publish;
		checkout(job);
		expect(job.permissions).toEqual({ contents: "write", "id-token": "write" });
		expect(job.steps).toHaveLength(5);
		expect(job.steps[2]).toEqual({ run: "npm install --global npm@11" });
		action(job.steps[3], "actions/download-artifact");
		expect(job.steps[3].with).toEqual({
			name: "release-tarballs",
			path: "dist/release",
		});
		expect(job.steps[4]).toEqual({
			run: 'node scripts/release.ts publish "$RELEASE_TAG"',
			env: { GITHUB_TOKEN: expr("github.token") },
		});
		for (const file of ["ci.yml", "release.yml"]) {
			expect(read(`../.github/workflows/${file}`)).not.toMatch(
				/\b(?:NPM_TOKEN|NODE_AUTH_TOKEN)\b|\bsecrets\s*\./i,
			);
		}
	});
});
