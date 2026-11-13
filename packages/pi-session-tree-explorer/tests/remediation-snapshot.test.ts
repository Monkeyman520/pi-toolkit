import { SessionManager } from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import { createActionRegistry } from "../extensions/actions.ts";
import { captureSessionSnapshot } from "../extensions/session-snapshot.ts";
import { createInitialState } from "../extensions/state.ts";
import { buildTreeIndex } from "../extensions/tree-index.ts";

describe("remediation: owned host data", () => {
	it("does not mutate a borrowed raw entry when labeling", async () => {
		const host = SessionManager.inMemory();
		const id = host.appendMessage({
			role: "user",
			content: "hello",
			timestamp: Date.now(),
		});
		const raw = host.getEntry(id);
		if (!raw) throw new Error("Missing host fixture");
		const original = JSON.stringify(raw);
		const index = captureSessionSnapshot(host).index;
		const state = createInitialState("host", { selectedEntryId: id });
		await createActionRegistry()
			.get("session.setLabel")
			?.execute({
				state,
				index,
				visibleNodes: [],
				close() {},
				setLabel: (id, label) => {
					host.appendLabelChange(id, label);
				},
			});
		expect(JSON.stringify(raw)).toBe(original);
		expect(host.getLabel(id)).toBe("bookmark");
	});
	it("does not publish a local label when the host rejects it", async () => {
		const raw = { id: "u", parentId: null, type: "message", timestamp: "T0" };
		const index = buildTreeIndex([raw]),
			state = createInitialState("host", { selectedEntryId: "u" });
		const notify = vi.fn();
		await expect(
			createActionRegistry()
				.get("session.setLabel")
				?.execute({
					state,
					index,
					visibleNodes: [],
					close() {},
					setLabel() {
						throw new Error("rejected");
					},
					notify,
				}),
		).rejects.toThrow("rejected");
		expect(index.entryById.get("u")?.label).toBeUndefined();
	});
});
