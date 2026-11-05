import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { startPi } from "./pi-client.mjs";

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const npm =
	process.env.npm_execpath ??
	join(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
const root = await mkdtemp(join(tmpdir(), "pi-support-load-"));
let client;
try {
	const packed = spawnSync(
		process.execPath,
		[npm, "pack", "--ignore-scripts", "--json", "--pack-destination", root],
		{
			cwd: join(repository, "packages", "pi-plugin-support"),
			encoding: "utf8",
			timeout: 30000,
		},
	);
	assert.equal(packed.status, 0, packed.stderr);
	const info = JSON.parse(packed.stdout)[0];
	assert.ok(info.files.some((file) => file.path === "src/discovery.ts"));
	assert.ok(
		!info.files.some(
			(file) =>
				file.path.startsWith("node_modules/") ||
				file.path.startsWith("extensions/"),
		),
	);
	const consumer = join(root, "consumer");
	await mkdir(consumer);
	await cp(join(root, info.filename), join(consumer, info.filename));
	await writeFile(
		join(consumer, "package.json"),
		JSON.stringify({
			type: "module",
			dependencies: { "pi-plugin-support": `file:${info.filename}` },
			pi: { extensions: ["./probe.ts"] },
		}),
	);
	const install = spawnSync(
		process.execPath,
		[
			npm,
			"install",
			"--omit=dev",
			"--ignore-scripts",
			"--legacy-peer-deps",
			"--offline",
			"--no-audit",
		],
		{ cwd: consumer, encoding: "utf8", timeout: 30000 },
	);
	assert.equal(install.status, 0, install.stderr);
	await writeFile(
		join(consumer, "probe.ts"),
		`
 import {createEventBus} from "@earendil-works/pi-coding-agent";
 import {Type} from "typebox";
 import {settingCandidates} from "pi-plugin-support/settings";
 import {discoverLoadedPanels} from "pi-plugin-support/discovery";
 import {createSettingsPanel} from "pi-plugin-support/panels";
 import {readJsonConfig} from "pi-plugin-support/config";
 export default function(pi){pi.registerCommand("support-probe",{description:"fixture",handler:async(_args,ctx)=>ctx.ui.notify(JSON.stringify({values:settingCandidates(Type.Boolean(),["true","false"]),panels:discoverLoadedPanels(createEventBus()),panelFactory:typeof createSettingsPanel,configReader:typeof readJsonConfig}),"info")});}
 `,
	);
	client = startPi({
		cwd: root,
		env: { PI_CODING_AGENT_DIR: root },
		extensions: [consumer],
	});
	const commands = await client.command("get_commands");
	assert.ok(
		commands.commands.some((command) => command.name === "support-probe"),
	);
	await client.command("prompt", { message: "/support-probe" });
	const notice = client.events.find(
		(event) =>
			event.type === "extension_ui_request" && event.method === "notify",
	);
	assert.deepEqual(JSON.parse(notice.message), {
		values: ["true", "false", "on", "off"],
		panels: [],
		panelFactory: "function",
		configReader: "function",
	});
	for (const name of ["auto-resume", "quota", "pretty-session", "ps"])
		assert.ok(!commands.commands.some((command) => command.name === name));
	await client.close();
	const installed = JSON.parse(
		await readFile(
			join(consumer, "node_modules", "pi-plugin-support", "package.json"),
			"utf8",
		),
	);
	assert.equal(installed.version, "0.1.0");
	console.log(
		"Support library distributed source + real Pi host-peer resolution PASS",
	);
} finally {
	await client?.dispose();
	await rm(root, { recursive: true, force: true });
}
