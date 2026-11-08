import { Check } from "typebox/value";
import { describe, expect, it } from "vitest";
import { declarationSchema } from "../extensions/tasks.ts";
import { researchDeclaration } from "./representative-workloads.ts";

const read = (id: string, path: string) => ({
	type: "toolCall",
	id,
	name: "read",
	arguments: { path },
});
const assistant = (content: unknown[]) => ({
	type: "message",
	id: "call",
	message: { role: "assistant", content },
});
const result = (id: string, toolCallId: string) => ({
	type: "message",
	id,
	message: { role: "toolResult", toolCallId },
});
const goal = { type: "message", id: "goal", message: { role: "user" } };
const plan = {
	type: "message",
	id: "plan",
	message: {
		role: "assistant",
		stopReason: "stop",
		content: [
			{
				type: "text",
				text: "Plan: preserve core constraints and UI interfaces; implement, test, report.",
			},
		],
	},
};
describe("frozen real-workload phase metadata", () => {
	it("binds bounded exploration evidence to its own workload rather than P2", () => {
		const r = researchDeclaration(
			[
				goal,
				assistant([read("ui", "extensions/ui.ts")]),
				result("ui-result", "ui"),
				plan,
			],
			"B1",
		);
		expect(r?.declaration.taskId).toBe("B1");
		expect(r?.declaration.estimatedFutureTokens).toBe(10000);
		expect(Check(declarationSchema, r?.declaration)).toBe(true);
	});
	it("does not attest completed research from an empty final report", () => {
		expect(
			researchDeclaration([
				goal,
				{
					type: "message",
					id: "blank",
					message: { role: "assistant", stopReason: "stop", content: [] },
				},
			]),
		).toBeNull();
	});
	it("does not mark a failed UI read as completed research", () => {
		const r = researchDeclaration([
			goal,
			assistant([read("ui", "extensions/ui.ts")]),
			{
				type: "message",
				id: "failed",
				message: { role: "toolResult", toolCallId: "ui", isError: true },
			},
			plan,
		]);
		expect(r?.retiredSourceEntryIds).toEqual([]);
	});
	it("selects only actually read completed UI exchanges and pins current constraints/plan/core", () => {
		const r = researchDeclaration([
			goal,
			assistant([read("ui", "extensions/ui.ts")]),
			result("ui-result", "ui"),
			assistant([read("core", "extensions/prune.ts")]),
			result("core-result", "core"),
			plan,
		]);
		expect(r?.retiredSourceEntryIds).toEqual(["ui-result"]);
		expect(Check(declarationSchema, r?.declaration)).toBe(true);
		expect(r?.declaration.requiredContextIds).toEqual(["goal", "plan", "core"]);
	});
	it("does not nominate a UI result paired with protected core research", () => {
		const r = researchDeclaration([
			goal,
			assistant([
				read("ui", "extensions/ui.ts"),
				read("core", "extensions/index.ts"),
			]),
			result("ui-result", "ui"),
			result("core-result", "core"),
			plan,
		]);
		expect(r?.retiredSourceEntryIds).toEqual([]);
	});
	it("does not fabricate an evidence/plan identity for incomplete exploration", () => {
		expect(researchDeclaration([goal])).toBeNull();
		const r = researchDeclaration([goal, plan]);
		expect(r?.retiredSourceEntryIds).toEqual([]);
		expect(Check(declarationSchema, r?.declaration)).toBe(true);
	});
});
