import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { startPi } from "./pi-client.mjs";

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packages = [
	{
		id: "pi-auto-resume",
		pkgName: "@monkeyman520/pi-auto-resume",
		commands: ["auto-resume"],
	},
	{
		id: "pi-pretty-session",
		pkgName: "@monkeyman520/pi-pretty-session",
		commands: ["pretty-session", "ps"],
	},
	{
		id: "pi-quota-keeper",
		pkgName: "@monkeyman520/pi-quota-keeper",
		commands: ["quota"],
	},
];
const npm =
	(process.env.npm_execpath?.endsWith(".js")
		? process.env.npm_execpath
		: undefined) ??
	join(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
const allCommands = packages.flatMap((plugin) => plugin.commands);

async function checkCombination(selected) {
	const root = await mkdtemp(join(tmpdir(), "pi-plugin-isolation-"));
	let client;
	try {
		const paths = [];
		for (const plugin of selected) {
			const wrapper = join(root, plugin.id);
			await mkdir(wrapper);
			const packed = spawnSync(
				process.execPath,
				[npm, "pack", "--ignore-scripts", "--json", "--pack-destination", root],
				{
					cwd: join(repository, "packages", plugin.id),
					encoding: "utf8",
					timeout: 30000,
				},
			);
			assert.equal(packed.status, 0, packed.stderr);
			const info = JSON.parse(packed.stdout)[0];
			assert.equal(
				info.bundled?.length ?? 0,
				0,
				"no bundledDependencies; support library is inlined into dist/index.js",
			);
			assert.ok(
				info.files.some((file) => file.path === "dist/index.js"),
				"built dist/index.js must be packed",
			);
			assert.ok(
				info.files.some((file) => file.path === "dist/LICENSE"),
				"dist/LICENSE must be packed",
			);
			assert.ok(
				info.files.some((file) => file.path === "dist/CHANGELOG.md"),
				"dist/CHANGELOG.md must be packed",
			);
			assert.ok(
				!info.files.some(
					(file) =>
						file.path.startsWith("vendor/") ||
						file.path.startsWith("node_modules/"),
				),
				"tarball must not ship vendor/ or node_modules/",
			);
			await writeFile(
				join(wrapper, "package.json"),
				JSON.stringify({
					private: true,
					dependencies: {
						[plugin.pkgName]: `file:${join(root, info.filename).replaceAll("\\", "/")}`,
					},
				}),
			);
			const installed = spawnSync(
				process.execPath,
				[
					npm,
					"install",
					"--omit=dev",
					"--ignore-scripts",
					"--legacy-peer-deps",
					"--prefer-offline",
					"--no-audit",
				],
				{ cwd: wrapper, encoding: "utf8", windowsHide: true, timeout: 60000 },
			);
			assert.equal(installed.status, 0, installed.stderr);
			const installedPkg = join(
				wrapper,
				"node_modules",
				...plugin.pkgName.split("/"),
			);
			assert.equal(
				existsSync(join(installedPkg, "node_modules", "pi-plugin-support")),
				false,
				"pi-plugin-support is inlined and must not be installed as a runtime dependency",
			);
			assert.equal(
				existsSync(join(wrapper, "node_modules", "pi-plugin-support")),
				false,
				"pi-plugin-support must not appear in consumer node_modules",
			);
			paths.push(installedPkg);
		}
		await cp(
			join(repository, "tests", "fixtures", "baseline-discovery.ts"),
			join(root, "baseline-discovery.ts"),
		);
		await writeFile(join(root, "auth.json"), "{}");
		if (selected.some((plugin) => plugin.id === "pi-pretty-session")) {
			await writeFile(
				join(root, "pi-pretty-session.json"),
				JSON.stringify({ useLlm: false }),
			);
		}
		await writeFile(
			join(root, "probe.ts"),
			`
import {appendFileSync} from "node:fs";
import {discoverLoadedPanels as baselineDiscover} from "./baseline-discovery.ts";
export default function(pi){
 const collect=()=>{const panels=[];pi.events.emit("pi-packages:ui:discover",{register:panel=>panels.push(panel)});return panels;};
 pi.registerCommand("isolation-probe",{description:"fixture",handler:async(_args,ctx)=>{
  const raw=collect().map(panel=>({id:panel.id,command:panel.command,summary:panel.getSummary(),canOpen:typeof panel.open==="function"}));
  const off=pi.events.on("pi-packages:ui:discover",payload=>payload.register({id:"baseline-peer",title:"Baseline",command:"/baseline",getSummary:()=>"baseline",open:async()=>{}}));
  const mixed=baselineDiscover(pi.events).map(panel=>panel.id).sort();off();
  ctx.ui.notify("ISOLATION:"+JSON.stringify({raw,mixed}),"info");
 }});
 pi.on("session_shutdown",()=>appendFileSync(process.env.ISOLATION_SHUTDOWN_LOG,JSON.stringify(collect().map(panel=>panel.id))+"\\n"));
}
`,
		);
		client = startPi({
			cwd: root,
			env: {
				PI_CODING_AGENT_DIR: root,
				ISOLATION_SHUTDOWN_LOG: join(root, "shutdown.jsonl"),
			},
			extensions: [...paths, join(root, "probe.ts")],
		});
		const expectedIds = selected.map((plugin) => plugin.id).sort();
		for (let session = 0; session < 3; session++) {
			if (session > 0) {
				assert.equal((await client.command("new_session")).cancelled, false);
			}
			const commands = await client.command("get_commands");
			assert.deepEqual(
				commands.commands
					.map((command) => command.name)
					.filter((name) => allCommands.includes(name))
					.sort(),
				selected.flatMap((plugin) => plugin.commands).sort(),
			);
			const from = client.events.length;
			await client.command("prompt", { message: "/isolation-probe" });
			await client.until(
				() =>
					client.events
						.slice(from)
						.some((event) => String(event.message).startsWith("ISOLATION:")),
				"discovery probe",
			);
			const event = client.events
				.slice(from)
				.find((event) => String(event.message).startsWith("ISOLATION:"));
			const result = JSON.parse(event.message.slice("ISOLATION:".length));
			assert.deepEqual(
				result.raw.map((panel) => panel.id).sort(),
				expectedIds,
				"exact loaded registrations, no duplicates",
			);
			for (const panel of result.raw) {
				assert.equal(panel.canOpen, true);
				assert.equal(typeof panel.summary, "string");
				assert.ok(
					panel.command.includes(
						`/${selected.find((plugin) => plugin.id === panel.id).commands[0]}`,
					),
				);
			}
			assert.deepEqual(
				result.mixed,
				[...expectedIds, "baseline-peer"].sort(),
				"baseline protocol interoperability",
			);
		}
		await client.close();
		const shutdowns = (await readFile(join(root, "shutdown.jsonl"), "utf8"))
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line));
		assert.deepEqual(
			shutdowns,
			[[], [], []],
			"session cleanup removes only its registered resources",
		);
		console.log(
			`PASS ${expectedIds.join(" + ")}: built tarball install, inlined support, baseline protocol, 3 lifecycles`,
		);
	} finally {
		await client?.dispose();
		await rm(root, { recursive: true, force: true });
	}
}

for (let mask = 1; mask < 1 << packages.length; mask++) {
	await checkCombination(packages.filter((_, index) => mask & (1 << index)));
}
console.log("Pi plugin isolation matrix: all 7 combinations PASS");
