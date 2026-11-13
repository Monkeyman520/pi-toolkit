import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import { getDefaultConfig } from "../extensions/config-schema.ts";
import { executeSessionIntent } from "../extensions/session-effects.ts";
import type { captureSessionSnapshot } from "../extensions/session-snapshot.ts";
import { createInitialState } from "../extensions/state.ts";
import { buildTreeIndex } from "../extensions/tree-index.ts";
import { SessionTreeComponent } from "../extensions/tui.ts";

describe("remediation: stale asynchronous effects", () => {
	for (const change of ["session", "busy"] as const)
		it(`revalidates ${change} after fork confirmation`, async () => {
			let sessionId = "original",
				idle = true;
			const entry = {
				id: "u",
				parentId: null,
				type: "message",
				timestamp: "T0",
				message: { role: "user", content: "prompt" },
			};
			const fork = vi.fn();
			const ctx = {
				sessionManager: {
					getEntry: () => entry,
					getSessionId: () => sessionId,
				},
				isIdle: () => idle,
				ui: {
					confirm: async () => {
						if (change === "session") sessionId = "replacement";
						else idle = false;
						return true;
					},
				},
				fork,
			};
			const config = getDefaultConfig();
			config.session.confirmFork = true;
			const result = await executeSessionIntent({
				intent: { type: "fork", entryId: "u", position: "at" },
				ctx: ctx as unknown as ExtensionCommandContext,
				config,
				expectedSessionId: "original",
			});
			expect(result.success).toBe(false);
			expect(fork).not.toHaveBeenCalled();
		});
	it("ignores refresh completion after close", async () => {
		let resolve: (value: ReturnType<typeof captureSessionSnapshot>) => void =
			() => {};
		const pending = new Promise<ReturnType<typeof captureSessionSnapshot>>(
			(r) => {
				resolve = r;
			},
		);
		const state = createInitialState("original", { selectedEntryId: "u" });
		const component = new SessionTreeComponent({
			state,
			index: buildTreeIndex([
				{ id: "u", parentId: null, type: "message", timestamp: "T0" },
			]),
			tui: { requestRender() {} },
			theme: {},
			done() {},
			onRefresh: () => pending,
		});
		const version = state.version;
		component.handleInput("r");
		component.handleInput("q");
		resolve({
			sessionId: "replacement",
			leafId: "new",
			revision: 2,
			index: buildTreeIndex([
				{ id: "new", parentId: null, type: "message", timestamp: "T1" },
			]),
		});
		await component.whenSettled();
		expect(state.sessionId).toBe("original");
		expect(state.version).toBe(version);
	});
});
