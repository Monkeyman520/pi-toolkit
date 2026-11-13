import { SessionManager } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { buildDisplayProjection } from "../extensions/display.ts";
import { buildSearchIndex, extractContentText } from "../extensions/search.ts";
import { captureSessionSnapshot } from "../extensions/session-snapshot.ts";
import { createInitialState } from "../extensions/state.ts";

function fixture() {
	const host = SessionManager.inMemory(),
		root = host.appendMessage({ role: "user", content: "root", timestamp: 1 });
	host.appendLabelChange(root, "historical-payload");
	host.appendLabelChange(root, "current-bookmark");
	const child = host.appendMessage({
		role: "user",
		content: "child",
		timestamp: 2,
	});
	const raw = host.getEntries(),
		label = raw.find((e) => e.type === "label");
	if (!label) throw new Error("Missing native label event");
	return { host, root, child, raw, label };
}
describe("native label data versus display annotations", () => {
	it("preserves native payloads and raw identities while resolving current bookmarks separately", () => {
		const { host, root, raw, label } = fixture(),
			before = JSON.stringify(raw),
			snapshot = captureSessionSnapshot(host);
		expect(snapshot.index.entryById.get(label.id)?.label).toBe(
			"historical-payload",
		);
		expect(snapshot.index.entryById.get(root)).not.toHaveProperty("label");
		expect(snapshot.index.displayLabelsById?.get(root)).toBe(
			"current-bookmark",
		);
		expect(snapshot.index.displayLabelsById?.has(label.id)).toBe(false);
		expect(JSON.stringify(raw)).toBe(before);
		host.appendLabelChange(root, undefined);
		const cleared = captureSessionSnapshot(host, 2);
		expect(cleared.index.displayLabelsById?.has(root)).toBe(false);
		expect(cleared.index.entryById.get(label.id)?.label).toBe(
			"historical-payload",
		);
	});
	it("keeps historical label payload searchable and inspectable after relabeling and clearing", () => {
		const { host, root, label } = fixture();
		host.appendLabelChange(root, undefined);
		const index = captureSessionSnapshot(host).index,
			entry = index.entryById.get(label.id);
		if (!entry) throw new Error("Missing owned event");
		expect(extractContentText(entry)).toContain("historical-payload");
		expect(
			buildSearchIndex(index).find((d) => d.id === label.id)?.fullText,
		).toContain("historical-payload");
		expect(
			buildSearchIndex(index).find((d) => d.id === label.id)?.label,
		).toBeUndefined();
	});
	it("hides/shows native label metadata without losing descendants or treating its payload as a bookmark", () => {
		const { host, root, child, label } = fixture(),
			index = captureSessionSnapshot(host).index;
		const state = createInitialState("labels", { selectedEntryId: root });
		state.foldOptions.mode = "all";
		let nodes = buildDisplayProjection(index, state);
		expect(nodes.map((n) => n.realId)).toEqual([root, child]);
		expect(nodes.find((n) => n.realId === child)?.visibleParentId).toBe(root);
		state.displayOptions.showMetadataNodes = true;
		nodes = buildDisplayProjection(index, state);
		expect(nodes.find((n) => n.realId === label.id)?.summaryText).toContain(
			"historical-payload",
		);
		expect(nodes.find((n) => n.realId === label.id)?.label).toBeUndefined();
		state.displayOptions.labeledOnly = true;
		expect(buildDisplayProjection(index, state).map((n) => n.realId)).toEqual([
			root,
		]);
	});
});
