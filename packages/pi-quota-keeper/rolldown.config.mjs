import { readFileSync } from "node:fs";
import { defineConfig } from "rolldown";

export default defineConfig({
	input: "extensions/index.ts",
	platform: "node",
	external: [
		/^node:/,
		/^@earendil-works\//,
		/^typebox(\/|$)/,
		/^proper-lockfile(\/|$)/,
	],
	plugins: [
		{
			name: "include-release-docs",
			generateBundle() {
				this.emitFile({
					type: "asset",
					fileName: "LICENSE",
					source: readFileSync(
						new URL("../../LICENSE", import.meta.url),
						"utf8",
					),
				});
				this.emitFile({
					type: "asset",
					fileName: "CHANGELOG.md",
					source: readFileSync(
						new URL("../../CHANGELOG.md", import.meta.url),
						"utf8",
					),
				});
			},
		},
	],
	output: {
		dir: "dist",
		format: "esm",
		sourcemap: true,
		cleanDir: true,
	},
});
