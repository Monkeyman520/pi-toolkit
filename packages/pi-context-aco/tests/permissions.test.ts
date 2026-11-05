import type {
	ExtensionContext,
	SessionEntry,
} from "@earendil-works/pi-coding-agent";
import { expect, test, vi } from "vitest";
import { Permissions } from "../extensions/permissions.ts";

function context(mode = "rpc") {
	const branch = [
		{
			id: "u",
			parentId: null,
			type: "message",
			message: { role: "user", content: "work", timestamp: 1 },
			timestamp: "now",
		},
	] as SessionEntry[];
	const confirm = vi.fn(async () => true);
	return {
		ctx: {
			cwd: "project",
			mode,
			hasUI: true,
			sessionManager: {
				getSessionId: () => "session",
				getBranch: () => branch,
			},
			ui: { confirm },
		} as unknown as ExtensionContext,
		branch,
		confirm,
	};
}
test("non-interactive default never waits for confirmation, interactive denial has no authority", async () => {
	const p = new Permissions(),
		h = context();
	expect(await p.allow(h.ctx, "semantic", ["u"], 100, 10)).toBe(
		"recommendation",
	);
	expect(h.confirm).not.toHaveBeenCalled();
	const tui = context("tui");
	tui.confirm.mockResolvedValue(false);
	expect(await p.allow(tui.ctx, "native", ["u"], 100, 10)).toBe("denied");
});
test("explicit automation is operation, source, task, session and budget scoped, revocation invalidates guards", async () => {
	const p = new Permissions(),
		h = context();
	p.grant(h.ctx, {
		operation: "semantic",
		taskId: "task:u",
		sourceEntryIds: ["u"],
		maxInputTokens: 200,
		maxSummaryTokens: 50,
	});
	expect(await p.allow(h.ctx, "semantic", ["u"], 100, 10)).toBe("authorized");
	expect(await p.allow(h.ctx, "native", ["u"], 100, 10)).toBe("recommendation");
	expect(await p.allow(h.ctx, "semantic", ["u"], 201, 10)).toBe(
		"recommendation",
	);
	const check = p.guard();
	p.reset();
	expect(check).toThrow();
});
