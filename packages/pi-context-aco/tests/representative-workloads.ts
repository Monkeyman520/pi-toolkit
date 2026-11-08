import { cp, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export const workloads = {
	B1: {
		phase: "explore",
		remainingSteps: 3,
		futureTokens: 10000,
		goal: "Repair a replayed provider-admission regression: an unregistered model provider must produce a local recommendation before reservation, intent, dispatch or context edit. Preserve registered-provider behavior, completed usage/budget safety and the existing CLI/TUI boundaries. Only the provider-admission code and focused tests need correction; UI source must remain unchanged. Add or retain regression coverage, and verify the package.",
		hiddenUnits: ["delegation.test.ts"],
		hostVerifier: "representative-verifier.mjs",
	},
	P1: {
		phase: "implement",
		remainingSteps: 3,
		futureTokens: 10000,
		goal: "Fix delegation admission when Pi exposes a placeholder model and stream method but that model's provider is unregistered. Return a local recommendation before any reservation, intent, dispatch or context edit. Preserve registered-provider behavior, scoped authority, independence and finite budgets. Add regression coverage.",
		hiddenUnits: ["delegation.test.ts"],
		hostVerifier: "representative-verifier.mjs",
	},
	P2: {
		phase: "explore",
		remainingSteps: 3,
		futureTokens: 40000,
		goal: "Fix interrupted paired exact pruning: one omission can persist while the second boundary append fails. After restart, ordinary input and extension-triggered runs must never send an illegal tool exchange. Require explicit recovery, verify scoped originals again, restore a legal recovery request and persist restoration only at a completed supported boundary. Preserve raw history, peer proposals, authorization, budgets and normal CLI/TUI behavior. Missing or ambiguous evidence must fail closed; never rewrite session JSONL or blindly replay edits. Add regression coverage.",
		hiddenUnits: ["prune.test.ts"],
		hostVerifier: "recovery-pi-smoke.mjs",
	},
	P3: {
		phase: "review",
		remainingSteps: 1,
		futureTokens: 5000,
		goal: "Review the completed provider-admission, failed-usage accounting and interrupted-exact-pruning repairs against their original contracts. Missing providers must reserve/dispatch nothing; failed SDK zero-default usage must not establish known zero or bypass child budgets; interrupted pruning must block illegal ordinary/custom requests and permit only explicit verified append-only restoration. Independently assess real defects, make a focused tested correction only if justified, or explain why unchanged code is correct. Do not manufacture an optimization or treat documented test-only fault injection as a production host patch. Preserve all original assertions, permissions and finite safety budgets.",
		hiddenUnits: ["prune.test.ts", "delegation.test.ts"],
		hostVerifier: "recovery-pi-smoke.mjs",
	},
} as const;
export type WorkloadId = keyof typeof workloads;

export async function seedWorkload(id: WorkloadId, pkg: string, input: string) {
	if (id === "P2") {
		// Deliver completed admission/accounting prerequisites without leaking the P2 repair.
		for (const f of [
			"extensions/delegation.ts",
			"extensions/delegation-contracts.ts",
			"extensions/evaluation.ts",
			"tests/delegation.test.ts",
			"tests/evaluation.test.ts",
			"tests/lifecycle.test.ts",
		])
			await cp(join(pkg, f), join(input, f));
		const path = join(input, "extensions/index.ts");
		let text = await readFile(path, "utf8");
		const before = 'import { branchAccounting } from "./evaluation.ts";';
		const usage = 'u = m.role === "assistant" ? object(m.usage) : {},';
		if (!text.includes(before) || !text.includes(usage))
			throw Error("Unexpected frozen P2 baseline");
		text = text
			.replace(
				before,
				'import { assistantUsage, branchAccounting } from "./evaluation.ts";',
			)
			.replace(
				usage,
				'u = m.role === "assistant" ? object(assistantUsage({stopReason:m.stopReason,usage:m.usage})) : {},',
			);
		const current = await readFile(join(pkg, "extensions/index.ts"), "utf8");
		const from = current.indexOf("function providerUsage("),
			to = current.indexOf("type ProviderUsage", from),
			first = text.indexOf("function providerUsage("),
			last = text.indexOf("type ProviderUsage", first);
		if (Math.min(from, to, first, last) < 0)
			throw Error("Missing usage seed seam");
		text = text.slice(0, first) + current.slice(from, to) + text.slice(last);
		await writeFile(path, text);
	} else if (id === "P3" || id === "B1") {
		await cp(join(pkg, "extensions"), join(input, "extensions"), {
			recursive: true,
		});
		for (const f of ["package.json", "README.md"])
			await cp(join(pkg, f), join(input, f));
		for (const f of await readdir(join(pkg, "tests"), { withFileTypes: true }))
			if (f.isFile() && !f.name.startsWith("representative-"))
				await cp(join(pkg, "tests", f.name), join(input, "tests", f.name));
	}
	if (id === "B1") await replayProviderRegression(input);
}
/** Replay only the missing-provider guard; all completed budget/recovery code stays intact. */
export async function replayProviderRegression(input: string) {
	const path = join(input, "extensions/delegation.ts");
	const text = await readFile(path, "utf8");
	const guard =
		'typeof ctx.modelRegistry?.streamSimple !== "function" ||\n\t\t\ttypeof ctx.modelRegistry?.getProvider !== "function" ||\n\t\t\t!ctx.modelRegistry.getProvider(ctx.model.provider)';
	if (!text.includes(guard)) throw Error("Provider replay guard seam changed");
	const original = "if (\n\t\t\t!ctx.model ||\n\t\t\t" + guard + "\n\t\t)";
	if (!text.includes(original))
		throw Error("Provider replay statement changed");
	await writeFile(
		path,
		text.replace(
			original,
			'if (!ctx.model || typeof ctx.modelRegistry?.streamSimple !== "function")',
		),
	);
}
const object = (v: unknown): Record<string, unknown> =>
	v !== null && typeof v === "object" ? (v as Record<string, unknown>) : {};
/** Trusted phase metadata after a real completed exploration; never fabricate source IDs. */
export function researchDeclaration(
	raw: readonly unknown[],
	taskId: WorkloadId = "P2",
) {
	const entries = raw.map(object);
	const goal = entries.find(
		(e) => e.type === "message" && object(e.message).role === "user",
	);
	const plan = [...entries]
		.reverse()
		.find(
			(e) =>
				e.type === "message" &&
				object(e.message).role === "assistant" &&
				object(e.message).stopReason === "stop" &&
				Array.isArray(object(e.message).content) &&
				(object(e.message).content as unknown[]).some(
					(c) =>
						object(c).type === "text" &&
						typeof object(c).text === "string" &&
						String(object(c).text).trim().length > 0,
				),
		);
	const uiCalls = new Set<string>(),
		coreCalls = new Set<string>();
	for (const e of entries) {
		const m = object(e.message);
		if (
			e.type !== "message" ||
			m.role !== "assistant" ||
			!Array.isArray(m.content)
		)
			continue;
		const calls = m.content.map(object).filter((c) => c.type === "toolCall");
		const readsUiOnly =
			calls.length > 0 &&
			calls.every(
				(c) =>
					c.name === "read" &&
					/(^|[/\\])extensions[/\\]ui\.ts$/i.test(
						String(object(c.arguments).path),
					),
			);
		for (const c of calls) {
			if (readsUiOnly && typeof c.id === "string") uiCalls.add(c.id);
			if (
				c.name === "read" &&
				/(^|[/\\])extensions[/\\](index|prune|actions|continuity)\.ts$/i.test(
					String(object(c.arguments).path),
				) &&
				typeof c.id === "string"
			)
				coreCalls.add(c.id);
		}
	}
	const ids = (calls: Set<string>) =>
		entries
			.filter(
				(e) =>
					e.type === "message" &&
					object(e.message).role === "toolResult" &&
					object(e.message).isError !== true &&
					calls.has(String(object(e.message).toolCallId)) &&
					typeof e.id === "string",
			)
			.map((e) => e.id as string)
			.slice(0, 32);
	const retiredSourceEntryIds = ids(uiCalls);
	const core = ids(coreCalls);
	if (typeof goal?.id !== "string" || typeof plan?.id !== "string") return null;
	return {
		retiredSourceEntryIds,
		declaration: {
			taskId,
			active: true,
			phase: "implement",
			status: "running",
			remainingSteps: 3,
			estimatedFutureTokens: workloads[taskId].futureTokens,
			writeConflictRisk: 1,
			requiredContextIds: ["goal", "plan", ...(core.length ? ["core"] : [])],
			references: [
				{
					id: "goal",
					kind: "constraint",
					sourceEntryIds: [goal.id],
					pinned: true,
					precisionSensitive: true,
				},
				{
					id: "plan",
					kind: "decision",
					sourceEntryIds: [plan.id],
					pinned: true,
				},
				...(core.length
					? [
							{
								id: "core",
								kind: "evidence",
								sourceEntryIds: core,
								pinned: true,
								precisionSensitive: true,
							},
						]
					: []),
				...(retiredSourceEntryIds.length
					? [
							{
								id: "completed-ui",
								kind: "evidence",
								sourceEntryIds: retiredSourceEntryIds,
								completedResearch: true,
								redundant: true,
								reproducibleData: true,
								summary:
									"Completed UI-boundary lookup; preserve the exact final plan/constraints/core evidence. UI workspace facts are reproducible; implementation does not change UI source.",
							},
						]
					: []),
			],
		},
	};
}
