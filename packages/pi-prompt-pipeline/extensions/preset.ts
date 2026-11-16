import type { SourcedRule } from "./pipeline.ts";
export function compatibilityRules(baseDir: string): SourcedRule[] {
	const when = {
		providers: ["antigravity"],
		models: ["gemini-*"],
		customPrompt: false,
	};
	return [
		{
			id: "antigravity-intro-compat",
			stage: "agent",
			when,
			targets: ["intro"],
			actions: [
				{
					type: "literal",
					find: "You are a coding assistant running inside pi, a coding agent harness.",
					replace: "You are a software engineering assistant.",
				},
			],
			baseDir,
		},
		{
			id: "antigravity-docs-compat",
			stage: "agent",
			when,
			targets: ["docs"],
			actions: [{ type: "removeLines", pattern: "^- When asked about: " }],
			baseDir,
		},
	];
}
