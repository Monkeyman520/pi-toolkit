import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { rolldown } from "rolldown";
import { startPi } from "./pi-client.mjs";

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const root = await mkdtemp(join(tmpdir(), "pi-support-inline-"));
let client;
try {
	const srcDir = join(root, "src");
	const consumer = join(root, "consumer");
	await Promise.all([
		mkdir(srcDir),
		mkdir(join(consumer, "dist"), { recursive: true }),
	]);
	const entry = join(srcDir, "probe.ts");
	await writeFile(
		entry,
		`
import { createEventBus } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { readJsonConfig } from ${JSON.stringify(join(repository, "packages/pi-plugin-support/src/config.ts"))};
import { discoverLoadedPanels } from ${JSON.stringify(join(repository, "packages/pi-plugin-support/src/discovery.ts"))};
import { createSettingsPanel } from ${JSON.stringify(join(repository, "packages/pi-plugin-support/src/panels.ts"))};
import { settingCandidates } from ${JSON.stringify(join(repository, "packages/pi-plugin-support/src/settings.ts"))};

export default function (pi) {
	pi.registerCommand("support-probe", {
		description: "fixture",
		handler: async (_args, ctx) =>
			ctx.ui.notify(
				JSON.stringify({
					values: settingCandidates(Type.Boolean(), ["true", "false"]),
					panels: discoverLoadedPanels(createEventBus()),
					panelFactory: typeof createSettingsPanel,
					configReader: typeof readJsonConfig,
				}),
				"info",
			),
	});
}
`,
	);
	const bundle = await rolldown({
		input: entry,
		platform: "node",
		external: [/^node:/, /^@earendil-works\//, /^typebox(\/|$)/],
	});
	await bundle.write({
		dir: join(consumer, "dist"),
		entryFileNames: "index.js",
		format: "esm",
	});
	await bundle.close();
	await writeFile(
		join(consumer, "package.json"),
		JSON.stringify({
			type: "module",
			pi: { extensions: ["./dist/index.js"] },
		}),
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
	for (const name of ["auto-resume", "quota", "pretty-session", "ps"]) {
		assert.ok(!commands.commands.some((command) => command.name === name));
	}
	await client.close();
	console.log(
		"Support library Rolldown inlining + real Pi host-peer resolution PASS",
	);
} finally {
	await client?.dispose();
	await rm(root, { recursive: true, force: true });
}
