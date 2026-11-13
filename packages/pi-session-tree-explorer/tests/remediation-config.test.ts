import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ConfigManager } from "../extensions/config.ts";

describe("remediation: config transactions", () => {
	it("does not copy project settings into global or publish a rejected candidate", async () => {
		const root = await mkdtemp(join(tmpdir(), "stree-remediation-"));
		try {
			const agentDir = join(root, "agent"),
				cwd = join(root, "project");
			await mkdir(agentDir, { recursive: true });
			await mkdir(join(cwd, ".pi"), { recursive: true });
			await writeFile(
				join(cwd, ".pi", "session-tree.json"),
				JSON.stringify({ display: { showAssistantNodes: true } }),
			);
			const manager = new ConfigManager();
			await manager.loadLayers({ agentDir, cwd, isProjectTrusted: true });
			await manager.updateSetting("vimMode", false);
			const disk = JSON.parse(
				await readFile(join(agentDir, "session-tree.json"), "utf8"),
			);
			expect(disk.display?.showAssistantNodes).not.toBe(true);
			await expect(
				manager.updateSetting("display.maxMessageLength", 1),
			).rejects.toThrow();
			expect(manager.getConfig().display.maxMessageLength).toBe(80);
			const borrowed = manager.getConfig();
			borrowed.vimMode = true;
			expect(manager.getConfig().vimMode).toBe(false);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
	it("does not publish an update if persistence fails", async () => {
		const root = await mkdtemp(join(tmpdir(), "stree-write-failure-"));
		try {
			const manager = new ConfigManager();
			await manager.loadLayers({
				agentDir: root,
				cwd: root,
				isProjectTrusted: false,
			});
			await mkdir(join(root, "session-tree.json"));
			await expect(manager.updateSetting("vimMode", false)).rejects.toThrow();
			expect(manager.getConfig().vimMode).toBe(true);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});
