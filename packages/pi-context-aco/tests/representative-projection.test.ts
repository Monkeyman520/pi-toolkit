import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { actionDrafts } from "../extensions/actions.ts";
import {
	comparePrunedProjection,
	projectionSummary,
} from "./representative-projection.ts";

describe("same-request context evidence", () => {
	it("compares the exact same branch with only committed ACO null edits neutralized", () => {
		const branch: SessionEntry[] = [];
		const add = (value: object) => {
			const id = String(branch.length);
			branch.push({
				id,
				parentId: branch.at(-1)?.id ?? null,
				timestamp: new Date(1).toISOString(),
				...value,
			} as SessionEntry);
		};
		add({
			type: "message",
			message: { role: "user", content: "keep constraint", timestamp: 1 },
		});
		add({
			type: "message",
			message: {
				role: "assistant",
				content: [
					{
						type: "toolCall",
						id: "read-ui",
						name: "read",
						arguments: { path: "extensions/ui.ts" },
					},
				],
			},
		});
		add({
			type: "message",
			message: {
				role: "toolResult",
				toolCallId: "read-ui",
				toolName: "read",
				content: [{ type: "text", text: "completed lookup ".repeat(100) }],
			},
		});
		for (const draft of actionDrafts(
			"prune",
			[
				{ type: "context_edit", targetId: "1", replacement: null },
				{ type: "context_edit", targetId: "2", replacement: null },
			],
			[],
			1000,
			0,
		))
			add(draft);
		const original = JSON.stringify(branch),
			r = comparePrunedProjection(branch);
		expect(r.removedMessages).toBe(2);
		expect(r.removedBytes).toBeGreaterThan(1000);
		expect(JSON.stringify(branch)).toBe(original);
		expect(r.actual.messages[0].role).toBe("user");
	});
	it("measures removed bytes without storing source text or claiming provider tokens", () => {
		const message = {
			role: "toolResult",
			toolCallId: "lookup",
			content: [{ type: "text", text: "exact-evidence" }],
		};
		const before = projectionSummary([message]),
			after = projectionSummary([]);
		expect(before.messageCount - after.messageCount).toBe(1);
		expect(before.serializedBytes).toBe(
			Buffer.byteLength(JSON.stringify([message])),
		);
		expect(before.messages[0].toolCallId).toBe("lookup");
		expect(before.messages[0].contentHash).toMatch(/^[a-f0-9]{64}$/);
		expect(JSON.stringify(before)).not.toContain("exact-evidence");
	});
});
