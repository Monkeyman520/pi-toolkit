import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import { ConfigManager } from "../extensions/config.ts";
import { openSessionTreeSettingsPanel } from "../extensions/ui.ts";

describe("settings publication boundary", () => {
	it("waits for panel writes before the caller reapplies effective settings", async () => {
		let release = () => {};
		const manager = new ConfigManager(),
			gate = new Promise<void>((resolve) => {
				release = resolve;
			}),
			original = manager.updateSetting.bind(manager);
		vi.spyOn(manager, "updateSetting").mockImplementation(async (key, val) => {
			await gate;
			return original(key, val);
		});
		let settled = false;
		const opening = openSessionTreeSettingsPanel({
			configManager: manager,
			events: { emit() {} } as unknown as ExtensionAPI["events"],
			ctx: {
				ui: {
					notify: vi.fn(),
					custom: async (
						factory: (...args: unknown[]) => { handleInput(key: string): void },
					) => {
						const panel = factory(
							{ requestRender() {} },
							{
								fg: (_color: string, text: string) => text,
								bg: (_color: string, text: string) => text,
								bold: (text: string) => text,
							},
							{},
							() => {},
						);
						panel.handleInput("\r");
						return undefined;
					},
				},
			} as unknown as ExtensionContext,
		}).then(() => {
			settled = true;
		});
		try {
			await new Promise<void>((resolve) => setImmediate(resolve));
			expect(manager.updateSetting).toHaveBeenCalledWith("vimMode", false);
			expect(settled).toBe(false);
		} finally {
			release();
			await opening;
		}
		expect(manager.getConfig().vimMode).toBe(false);
	});
});
