import { describe, expect, it } from "vitest";
import {
	matches,
	type PipelineContext,
	runPipeline,
	type SourcedRule,
} from "../extensions/pipeline.ts";
import { compatibilityRules } from "../extensions/preset.ts";

const context: PipelineContext = {
	provider: "antigravity",
	model: "gemini-test",
	stage: "agent",
	cwd: process.cwd(),
	customPrompt: false,
	extensions: ["/plugins/pi-antigravity/src/index.ts"],
	options: {},
};
const rule = (patch: Partial<SourcedRule> = {}): SourcedRule => ({
	id: "r",
	stage: "agent",
	targets: ["intro"],
	actions: [{ type: "append", text: "!" }],
	baseDir: process.cwd(),
	...patch,
});
const apply = async (text: string, rules: SourcedRule[]) =>
	(await runPipeline([{ text }], rules, context)).parts[0].text;

describe("rule pipeline", () => {
	it("applies the compatibility preset without touching other sections", async () => {
		const original =
			"You are a coding assistant running inside pi, a coding agent harness. Help users.\r\n<docs>\r\n- Keep\r\n- When asked about: remove\r\n- Also keep\r\n</docs>\r\n<tools>same</tools><skills>same</skills><cwd>same</cwd>";
		expect(await apply(original, compatibilityRules(process.cwd()))).toBe(
			original
				.replace(
					"You are a coding assistant running inside pi, a coding agent harness.",
					"You are a software engineering assistant.",
				)
				.replace("- When asked about: remove\r\n", ""),
		);
		expect(
			await runPipeline([{ text: original }], compatibilityRules("."), {
				...context,
				customPrompt: true,
			}),
		).toMatchObject({ parts: [{ text: original }] });
	});
	it("matches glob lists and observable all/any/none provenance", () => {
		expect(
			matches(
				rule({
					when: {
						providers: ["openai", "antigravity"],
						models: ["gemini-*"],
						extensions: { all: ["*pi-antigravity*"], none: ["*experimental*"] },
						customPrompt: false,
					},
				}),
				context,
			),
		).toBe(true);
		expect(matches(rule({ when: { models: ["gemini-"] } }), context)).toBe(
			false,
		);
		expect(
			matches(rule({ when: { extensions: { any: ["*absent*"] } } }), context),
		).toBe(false);
		expect(
			matches(
				rule({ when: { extensions: { none: ["*antigravity*"] } } }),
				context,
			),
		).toBe(false);
		expect(matches(rule({ when: { providers: [] } }), context)).toBe(false);
	});
	it("transforms every top-level occurrence and not nested selections", async () => {
		expect(
			await apply("head<docs>a<skills>nested</skills></docs><docs>b</docs>", [
				rule({
					targets: ["doc", "skill"],
					actions: [{ type: "append", text: "!" }],
				}),
			]),
		).toBe("head<docs>a<skills>nested</skills>!</docs><docs>b!</docs>");
	});
	it("honors target/action order and keeps absent targets unchanged", async () => {
		expect(
			await apply("a<docs>x</docs>", [
				rule({
					targets: ["docs", "all"],
					actions: [
						{ type: "prepend", text: "[" },
						{ type: "append", text: "]" },
					],
				}),
			]),
		).toBe("[a<docs>[x]</docs>]");
		expect(await apply("a", [rule({ targets: ["tag:absent"] })])).toBe("a");
	});
	it("rolls back a whole rule across parts and continues later rules", async () => {
		const rules = [
			rule({ targets: ["all"], actions: [{ type: "append", text: "1" }] }),
			rule({
				id: "bad",
				targets: ["all"],
				actions: [
					{ type: "append", text: "lost" },
					{ type: "regex", pattern: "[", replace: "bad" },
				],
			}),
			rule({ targets: ["all"], actions: [{ type: "append", text: "2" }] }),
		];
		const result = await runPipeline(
			[{ text: "a" }, { text: "b" }],
			rules,
			context,
		);
		expect(result.parts.map((p) => p.text)).toEqual(["a12", "b12"]);
		expect(result.failures).toEqual(["bad"]);
	});
	it("treats malformed tag nesting as a rule failure", async () => {
		expect(await apply("a<docs>x</skills>", [rule()])).toBe(
			"a<docs>x</skills>",
		);
	});
	it("uses literal replacement text literally, firstOnly and JS regex substitutions", async () => {
		expect(
			await apply("a a", [
				rule({
					targets: ["all"],
					actions: [{ type: "literal", find: "a", replace: "$&" }],
				}),
			]),
		).toBe("$& $&");
		expect(
			await apply("a a", [
				rule({
					targets: ["all"],
					actions: [
						{ type: "literal", find: "a", replace: "b", firstOnly: true },
						{ type: "regex", pattern: "(b)", flags: "g", replace: "$1$&" },
					],
				}),
			]),
		).toBe("bb a");
	});
	it("preserves self-closing tags, edits empty paired tags and supports custom tags", async () => {
		expect(
			await apply("p<docs/><docs></docs><custom>x</custom>", [
				rule({
					targets: ["docs", "tag:custom"],
					actions: [{ type: "append", text: "!" }],
				}),
			]),
		).toBe("p<docs/><docs>!</docs><custom>x!</custom>");
	});

	it("does not reject compatibility rules for tag examples inside project context", async () => {
		const project =
			"<project_context>Commit format: <gitmoji> <type>(<scope>): <subject>\nTools accept <path> placeholders.</project_context>";
		const original =
			"You are a coding assistant running inside pi, a coding agent harness.\n<docs>\n- Keep\n- When asked about: index\n</docs>\n" +
			project;
		const result = await runPipeline(
			[{ text: original }],
			compatibilityRules("."),
			context,
		);
		expect(result.failures).toEqual([]);
		expect(result.parts[0].text).toBe(
			original
				.replace(
					"You are a coding assistant running inside pi, a coding agent harness.",
					"You are a software engineering assistant.",
				)
				.replace("- When asked about: index\n", ""),
		);
		expect(result.parts[0].text).toContain(project);
	});
	it("treats unmatched inner examples as opaque while selecting only outer ranges", async () => {
		expect(
			await apply(
				"head<docs>Example <name> and </example> text</docs><docs>two</docs>",
				[
					rule({
						targets: ["docs", "tag:name"],
						actions: [{ type: "append", text: "!" }],
					}),
				],
			),
		).toBe(
			"head<docs>Example <name> and </example> text!</docs><docs>two!</docs>",
		);
	});
	it("keeps same-name nested sections within their outer range", async () => {
		expect(
			await apply(
				"head<docs>outer<docs>nested</docs>end</docs><docs>two</docs>",
				[rule({ targets: ["docs"] })],
			),
		).toBe("head<docs>outer<docs>nested</docs>end!</docs><docs>two!</docs>");
	});
	it("rolls back malformed outer boundaries even when another target could succeed", async () => {
		for (const text of [
			"head<docs>unclosed",
			"head</docs>",
			"head<docs>x</skills>",
		]) {
			const result = await runPipeline(
				[{ text }],
				[rule({ targets: ["intro", "docs"] })],
				context,
			);
			expect(result.parts[0].text).toBe(text);
			expect(result.failures).toEqual(["r"]);
		}
	});
});
