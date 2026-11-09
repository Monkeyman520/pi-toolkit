import { describe, expect, it } from "vitest";
import {
	getStreeArgumentCompletions,
	parseSettingValue,
	streeUsage,
} from "../extensions/commands.ts";

describe("T0003: Command Grammar and Multi-Token Autocompletion", () => {
	it("exposes clear command usage lines", () => {
		expect(streeUsage.length).toBeGreaterThan(3);
		expect(streeUsage.some((line) => line.includes("/stree config"))).toBe(
			true,
		);
	});

	it("completes first token subcommands (config, help)", () => {
		// Empty prefix
		const all = getStreeArgumentCompletions("");
		expect(all).not.toBeNull();
		const values = all?.map((a) => a.value);
		expect(values).toContain("config");
		expect(values).toContain("help");

		// Partial prefix 'con'
		const con = getStreeArgumentCompletions("con");
		expect(con).not.toBeNull();
		expect(con?.map((a) => a.value)).toEqual(["config"]);
	});

	it("completes second token configuration keys and reload under 'config '", () => {
		const items = getStreeArgumentCompletions("config ");
		expect(items).not.toBeNull();

		const values = items?.map((a) => a.value);
		expect(values).toContain("config reload");
		expect(values).toContain("config vimMode");
		expect(values).toContain("config display.showAssistantNodes");
		expect(values).toContain("config fold.mode");

		// Filter with partial key prefix
		const filtered = getStreeArgumentCompletions("config disp");
		expect(filtered).not.toBeNull();
		expect(filtered?.every((a) => a.value.startsWith("config display."))).toBe(
			true,
		);

		// Every returned item must contain the full argument string starting from 'config '
		for (const item of filtered ?? []) {
			expect(item.value.startsWith("config ")).toBe(true);
		}
	});

	it("completes third token configuration values under 'config <key> '", () => {
		// Boolean key completions
		const boolItems = getStreeArgumentCompletions("config vimMode ");
		expect(boolItems).not.toBeNull();
		expect(boolItems?.map((a) => a.label)).toEqual([
			"true",
			"false",
			"on",
			"off",
		]);
		expect(boolItems?.every((a) => a.value.startsWith("config vimMode "))).toBe(
			true,
		);

		// Enum key completions
		const enumItems = getStreeArgumentCompletions("config display.depthMode ");
		expect(enumItems).not.toBeNull();
		expect(enumItems?.map((a) => a.label)).toEqual(["raw", "turn", "branch"]);
		expect(
			enumItems?.every((a) => a.value.startsWith("config display.depthMode ")),
		).toBe(true);

		// Filtered value prefix
		const filteredEnum = getStreeArgumentCompletions(
			"config display.depthMode br",
		);
		expect(filteredEnum).not.toBeNull();
		expect(filteredEnum?.map((a) => a.value)).toEqual([
			"config display.depthMode branch",
		]);
	});

	it("parses raw setting string values into appropriate types", () => {
		// Booleans
		expect(parseSettingValue("vimMode", "true")).toBe(true);
		expect(parseSettingValue("vimMode", "on")).toBe(true);
		expect(parseSettingValue("vimMode", "false")).toBe(false);
		expect(parseSettingValue("vimMode", "off")).toBe(false);

		// Numbers
		expect(parseSettingValue("display.maxMessageLength", "120")).toBe(120);

		// Enums / strings
		expect(parseSettingValue("display.depthMode", "branch")).toBe("branch");
	});
});
