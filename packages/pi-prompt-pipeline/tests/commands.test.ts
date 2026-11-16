import { expect, it } from "vitest";
import { completions, parseCommand } from "../extensions/commands.ts";

it("parses stage/mode and rejects accidental requests or trailing junk", () => {
	expect(parseCommand("export agent before")).toEqual({
		kind: "export",
		stage: "agent",
		mode: "before",
	});
	expect(parseCommand("export request both")).toEqual({
		kind: "export",
		stage: "request",
		mode: "both",
	});
	expect(parseCommand("export request after").kind).toBe("help");
	expect(parseCommand("export agent before extra").kind).toBe("help");
	expect(parseCommand("config logging silent")).toEqual({
		kind: "set",
		key: "logging",
		value: "silent",
	});
});
it("returns complete multi-token completion values", () => {
	expect(completions("export req")?.map((c) => c.value)).toEqual([
		"export request",
	]);
	expect(completions("export agent b")?.map((c) => c.value)).toEqual([
		"export agent before",
		"export agent both",
	]);
	expect(completions("config logging s")?.map((c) => c.value)).toEqual([
		"config logging silent",
	]);
});
