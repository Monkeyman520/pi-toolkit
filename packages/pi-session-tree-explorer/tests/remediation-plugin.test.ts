import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	type ExtensionAPI,
	type ExtensionCommandContext,
	SessionManager,
} from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import plugin from "../extensions/index.ts";
import type { SessionTreeComponent } from "../extensions/tui.ts";
import type { ExplorerResult } from "../extensions/types.ts";

describe("remediation: real assembly with controlled UI boundary", () => {
	it("reads host labels and passes effective search settings through /stree", async () => {
		const dir = await mkdtemp(join(tmpdir(), "stree-assembly-"));
		vi.stubEnv("PI_CODING_AGENT_DIR", dir);
		vi.useFakeTimers();
		try {
			await writeFile(
				join(dir, "session-tree.json"),
				JSON.stringify({
					search: { mode: "exact", caseSensitive: true, maxResults: 1 },
					performance: { searchDebounceMs: 0 },
					display: { showNodeId: true },
				}),
			);
			const session = SessionManager.inMemory(dir);
			const first = session.appendMessage({
				role: "user",
				content: "NEEDLE",
				timestamp: Date.now(),
			});
			session.appendLabelChange(first, "host-existing-label");
			const second = session.appendMessage({
				role: "user",
				content: "needle",
				timestamp: Date.now(),
			});
			let handler:
				| ((args: string, ctx: ExtensionCommandContext) => Promise<void>)
				| undefined;
			plugin({
				on() {},
				events: { on() {}, emit() {} },
				registerCommand(
					_name: string,
					definition: { handler: typeof handler },
				) {
					handler = definition.handler;
				},
				setLabel(id: string, label: string | undefined) {
					session.appendLabelChange(id, label);
				},
			} as unknown as ExtensionAPI);
			const notify = vi.fn();
			const ctx = {
				cwd: dir,
				mode: "tui",
				sessionManager: session,
				isProjectTrusted: () => false,
				isIdle: () => true,
				getContextUsage: () => null,
				ui: {
					notify,
					custom: async (
						factory: (
							tui: unknown,
							theme: unknown,
							kb: unknown,
							done: (result: ExplorerResult) => void,
						) => SessionTreeComponent,
					) => {
						let result: ExplorerResult | undefined;
						const component = factory({ requestRender() {} }, {}, {}, (r) => {
							result = r;
						});
						expect(component.render(130).join("\n")).toContain(
							"host-existing-label",
						);
						expect(component.render(130).join("\n")).toContain(second);
						for (const key of ["/", ..."needle"]) component.handleInput(key);
						vi.runAllTimers();
						const rendered = component.render(130).join("\n");
						expect(rendered).toContain("1 matches");
						component.handleInput("\r");
						component.handleInput("q");
						return result;
					},
				},
			};
			if (!handler) throw new Error("Missing stree handler");
			await handler("", ctx as unknown as ExtensionCommandContext);
			expect(session.getLabel(first)).toBe("host-existing-label");
			expect(session.getEntry(first)).not.toHaveProperty("label");
		} finally {
			vi.useRealTimers();
			vi.unstubAllEnvs();
			await rm(dir, { recursive: true, force: true });
		}
	});
});
