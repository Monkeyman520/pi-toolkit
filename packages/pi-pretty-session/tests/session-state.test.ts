import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { expect, it, vi } from "vitest";
import { ConfigManager } from "../extensions/config.ts";
import { SessionState } from "../extensions/session-state.ts";

const work = vi.hoisted(() => ({ inspect: vi.fn(), summary: vi.fn() }));
vi.mock("../extensions/project.ts", () => ({ inspectProject: work.inspect }));
vi.mock("../extensions/summarizer.ts", async (original) => ({
	...(await original<typeof import("../extensions/summarizer.ts")>()),
	generateSessionSummary: work.summary,
}));
function setup() {
	let id = "session-a";
	const ctx = {
		cwd: "/fixture",
		getContextUsage: () => undefined,
		sessionManager: {
			getBranch: () => [],
			getEntries: () => [],
			getHeader: () => null,
			getSessionId: () => id,
			getSessionFile: () => undefined,
			getSessionDir: () => "/fixture",
			getSessionName: () => undefined,
		},
	} as unknown as ExtensionContext;
	const pi = { exec: vi.fn(), appendEntry: vi.fn(), setSessionName: vi.fn() };
	const owner = new SessionState(
		pi as unknown as ExtensionAPI,
		new ConfigManager("/unused", {}),
		vi.fn(),
	);
	owner.attach(ctx);
	work.inspect.mockResolvedValue({
		name: "fixture",
		cwd: "/fixture",
		shortCwd: "fixture",
		git: { isRepo: false },
		sessionCount: 0,
		inspectedAt: Date.now(),
	});
	return {
		owner,
		ctx,
		pi,
		changeId: () => {
			id = "session-b";
		},
	};
}
it("does not start a provider summary after project inspection belongs to an obsolete session", async () => {
	work.summary.mockReset();
	const { owner, ctx, pi } = setup();
	let finish!: (value: unknown) => void;
	work.inspect.mockImplementationOnce(
		() =>
			new Promise((resolve) => {
				finish = resolve;
			}),
	);
	const pending = owner.summarize(ctx, { updateTitle: true });
	owner.stop();
	finish({
		name: "obsolete",
		cwd: "/fixture",
		git: { isRepo: false },
		inspectedAt: Date.now(),
	});
	await pending;
	expect(owner.project).toBeUndefined();
	expect(work.summary).not.toHaveBeenCalled();
	expect(pi.appendEntry).not.toHaveBeenCalled();
});
it("rejects old results even when the host reuses a context object for another session", async () => {
	const { owner, ctx, pi, changeId } = setup();
	let finish!: (value: unknown) => void;
	work.summary.mockImplementationOnce(
		() =>
			new Promise((resolve) => {
				finish = resolve;
			}),
	);
	const pending = owner.summarize(ctx, { updateTitle: true });
	await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
	changeId();
	owner.attach(ctx);
	finish({
		title: "Old title",
		description: "Old description",
		source: "heuristic",
	});
	expect(await pending).toBeUndefined();
	expect(pi.appendEntry).not.toHaveBeenCalled();
	expect(pi.setSessionName).not.toHaveBeenCalled();
});
it("keeps only the latest summary and respects manual lock transitions", async () => {
	const { owner, ctx, pi } = setup();
	let first!: (value: unknown) => void;
	work.summary.mockImplementationOnce(
		() =>
			new Promise((resolve) => {
				first = resolve;
			}),
	);
	const pending = owner.summarize(ctx, { updateTitle: true });
	await vi.waitFor(() => expect(first).toBeTypeOf("function"));
	owner.nameChanged("Manual title", ctx);
	first({
		title: "Obsolete automatic title",
		description: "old",
		source: "heuristic",
	});
	await pending;
	expect(pi.appendEntry).toHaveBeenCalledTimes(1);
	expect(owner.metadata?.manualLocked).toBe(true);
	expect(owner.metadata?.title).toBe("Manual title");
});
