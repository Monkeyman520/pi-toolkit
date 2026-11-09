import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Check } from "typebox/value";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ConfigManager, deepMergeConfig } from "../extensions/config.ts";
import {
	formatSchemaDiagnostics,
	getDefaultConfig,
	SessionTreeConfigSchema,
} from "../extensions/config-schema.ts";

describe("T0003: Configuration Layers, Schema Validation & Trust", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), "pi-session-tree-config-test-"));
	});

	afterEach(async () => {
		await rm(tempDir, { recursive: true, force: true });
	});

	it("validates default configuration against TypeBox schema", () => {
		const defaultConfig = getDefaultConfig();
		expect(Check(SessionTreeConfigSchema, defaultConfig)).toBe(true);
	});

	it("detects invalid fields with exact field-path diagnostics", () => {
		const invalidConfig = {
			display: {
				maxMessageLength: 5, // minimum is 10!
			},
			unknownField: "not-allowed", // additionalProperties: false!
		};

		expect(Check(SessionTreeConfigSchema, invalidConfig)).toBe(false);
		const diagnostics = formatSchemaDiagnostics(invalidConfig);
		expect(
			diagnostics.some((d) => d.includes("/display/maxMessageLength")),
		).toBe(true);
		expect(
			diagnostics.some((d) => d.includes("unknownField") || d.includes("/")),
		).toBe(true);
	});

	it("merges objects field-by-field and replaces arrays wholesale", () => {
		const base = {
			vimMode: true,
			display: {
				showAssistantNodes: false,
				showDepth: true,
			},
			keybindings: {
				"node.next": ["j", "down"],
			},
		};

		const override = {
			display: {
				showAssistantNodes: true, // overrides boolean
			},
			keybindings: {
				"node.next": ["down"], // replaces array wholesale!
			},
		};

		const merged = deepMergeConfig(base, override);
		// Nested field merged
		expect(merged.display.showAssistantNodes).toBe(true);
		expect(merged.display.showDepth).toBe(true); // preserved!
		// Array replaced wholesale
		expect(merged.keybindings["node.next"]).toEqual(["down"]);
	});

	it("applies 4-layer precedence: defaults -> global -> trusted project -> runtime overrides", async () => {
		const agentDir = join(tempDir, "agent");
		const cwd = join(tempDir, "project");
		const projectPiDir = join(cwd, ".pi");

		const { mkdir } = await import("node:fs/promises");
		await mkdir(agentDir, { recursive: true });
		await mkdir(cwd, { recursive: true });
		await mkdir(projectPiDir, { recursive: true });

		// 1. Global config overrides vimMode and maxMessageLength
		await writeFile(
			join(agentDir, "session-tree.json"),
			JSON.stringify({
				vimMode: false,
				display: { maxMessageLength: 60 },
			}),
		);

		// 2. Project config overrides maxMessageLength and showAssistantNodes
		await writeFile(
			join(projectPiDir, "session-tree.json"),
			JSON.stringify({
				display: { maxMessageLength: 120, showAssistantNodes: true },
			}),
		);

		const manager = new ConfigManager();

		// Load with trusted project: project overrides global, global overrides defaults
		const { config } = await manager.loadLayers({
			agentDir,
			cwd,
			isProjectTrusted: true,
			runtimeOverrides: {
				display: { maxMessageLength: 160 }, // runtime highest precedence!
			},
		});

		expect(config.vimMode).toBe(false); // from global
		expect(config.display.showAssistantNodes).toBe(true); // from project
		expect(config.display.maxMessageLength).toBe(160); // from runtime
		expect(config.display.showDepth).toBe(true); // from built-in default
	});

	it("does not load project configuration when project is untrusted", async () => {
		const agentDir = join(tempDir, "agent");
		const cwd = join(tempDir, "project");
		const projectPiDir = join(cwd, ".pi");

		const { mkdir } = await import("node:fs/promises");
		await mkdir(agentDir, { recursive: true });
		await mkdir(projectPiDir, { recursive: true });

		await writeFile(
			join(projectPiDir, "session-tree.json"),
			JSON.stringify({
				vimMode: false,
				display: { showAssistantNodes: true },
			}),
		);

		const manager = new ConfigManager();
		const { config } = await manager.loadLayers({
			agentDir,
			cwd,
			isProjectTrusted: false, // UNTRUSTED!
		});

		// Project settings must NOT be applied
		expect(config.vimMode).toBe(true); // default
		expect(config.display.showAssistantNodes).toBe(false); // default
	});

	it("startup failure policy: invalid layer is wholly ignored with diagnostics while valid layers survive", async () => {
		const agentDir = join(tempDir, "agent");
		const cwd = join(tempDir, "project");
		const projectPiDir = join(cwd, ".pi");

		const { mkdir } = await import("node:fs/promises");
		await mkdir(agentDir, { recursive: true });
		await mkdir(projectPiDir, { recursive: true });

		// Malformed JSON in global
		await writeFile(
			join(agentDir, "session-tree.json"),
			"{ malformed JSON syntax !!!",
		);

		// Valid JSON in project
		await writeFile(
			join(projectPiDir, "session-tree.json"),
			JSON.stringify({
				display: { showAssistantNodes: true },
			}),
		);

		const manager = new ConfigManager();
		const { config, diagnostics } = await manager.loadLayers({
			agentDir,
			cwd,
			isProjectTrusted: true,
		});

		// Malformed global layer was ignored and diagnosed
		expect(diagnostics.some((d) => d.layer === "global")).toBe(true);
		// Valid project layer still applied!
		expect(config.display.showAssistantNodes).toBe(true);
		expect(config.vimMode).toBe(true); // default
	});

	it("reload failure policy: failed reload retains last valid configuration without partial changes", async () => {
		const agentDir = join(tempDir, "agent");
		const cwd = join(tempDir, "project");

		const { mkdir } = await import("node:fs/promises");
		await mkdir(agentDir, { recursive: true });

		// Initial valid config
		await writeFile(
			join(agentDir, "session-tree.json"),
			JSON.stringify({ vimMode: false }),
		);

		const manager = new ConfigManager();
		const init = await manager.loadLayers({
			agentDir,
			cwd,
			isProjectTrusted: true,
		});
		expect(init.config.vimMode).toBe(false);

		// Now corrupt the global config file
		await writeFile(join(agentDir, "session-tree.json"), "{ corrupted syntax");

		// Attempt reload
		const reloadRes = await manager.reload();
		expect(reloadRes.success).toBe(false);
		expect(reloadRes.error).toBeDefined();

		// MUST retain last valid effective configuration!
		expect(reloadRes.config.vimMode).toBe(false);
		expect(manager.getConfig().vimMode).toBe(false);
	});

	it("updateSetting updates setting and persists to global config file", async () => {
		const agentDir = join(tempDir, "agent");
		const cwd = join(tempDir, "project");

		const { mkdir } = await import("node:fs/promises");
		await mkdir(agentDir, { recursive: true });

		const manager = new ConfigManager();
		await manager.loadLayers({ agentDir, cwd, isProjectTrusted: true });

		await manager.updateSetting("display.showAssistantNodes", true);
		expect(manager.getConfig().display.showAssistantNodes).toBe(true);

		// Re-read file from disk to verify persistence
		const diskText = await (await import("node:fs/promises")).readFile(
			join(agentDir, "session-tree.json"),
			"utf8",
		);
		const diskJson = JSON.parse(diskText);
		expect(diskJson.display.showAssistantNodes).toBe(true);
	});
});
