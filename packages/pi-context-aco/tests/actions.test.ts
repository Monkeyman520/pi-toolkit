import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import { expect, test } from "vitest";
import { actionDrafts, reconcileActions } from "../extensions/actions.ts";

test("drafts are not completion and partial append never becomes success", () => {
	const drafts = actionDrafts(
		"prune",
		[
			{ type: "context_edit", targetId: "a", replacement: null },
			{ type: "context_edit", targetId: "b", replacement: null },
		],
		[],
		0,
		0,
	);
	const persist = (n: number) =>
		drafts.slice(0, n).map((d, i) => ({
			...d,
			id: String(i),
			parentId: i ? String(i - 1) : null,
			timestamp: "now",
		})) as SessionEntry[];
	expect(reconcileActions(persist(1))[0].status).toBe("not-committed");
	expect(reconcileActions(persist(2))[0].status).toBe("partial");
	expect(reconcileActions(persist(3))[0].status).toBe("committed");
	expect(reconcileActions(persist(3))[0].observedTargetIds).toEqual(["a", "b"]);
});

test("a later action cannot retroactively complete an interrupted earlier append", () => {
	const first = actionDrafts(
		"prune",
		[{ type: "context_edit", targetId: "a", replacement: null }],
		[],
		1,
		0,
	);
	const next = actionDrafts(
		"prune",
		[{ type: "context_edit", targetId: "a", replacement: null }],
		[],
		1,
		0,
	);
	const branch = [first[0], ...next].map((d, i) => ({
		...d,
		id: String(i),
		parentId: i ? String(i - 1) : null,
		timestamp: "now",
	})) as SessionEntry[];
	expect(reconcileActions(branch).map((a) => a.status)).toEqual([
		"not-committed",
		"committed",
	]);
});
