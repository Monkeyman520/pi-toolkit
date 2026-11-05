import { Type } from "typebox";
import { expect, it } from "vitest";
import { settingCandidates } from "../src/settings.ts";

it("preserves explicit presets and derives boolean aliases from the schema", () => {
	expect(settingCandidates(Type.Boolean(), ["true", "false"])).toEqual([
		"true",
		"false",
		"on",
		"off",
	]);
	expect(settingCandidates(Type.Integer({ minimum: 1 }), ["3", "5"])).toEqual([
		"3",
		"5",
	]);
});
