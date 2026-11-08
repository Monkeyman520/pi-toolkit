import { appendFileSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { createBashToolDefinition } from "@earendil-works/pi-coding-agent";
import { accountUsage, type UsageSample } from "../extensions/evaluation.ts";
import {
	prepareVerificationProfile,
	verificationEnvironment,
} from "./representative-environment.ts";

const object = (v: unknown): Record<string, unknown> =>
	v !== null && typeof v === "object" ? (v as Record<string, unknown>) : {};
// Antigravity 0.11.0 reports new input, cached input and output (including thoughts).
// Its cacheWrite default and catalog cost are NOT server-measured cache writes / fees.
function usage(raw: unknown) {
	const u = object(raw);
	const reported = typeof u.totalTokens === "number" && u.totalTokens > 0;
	return {
		input: reported ? u.input : null,
		output: reported ? u.output : null,
		cacheRead: reported ? u.cacheRead : null,
		cacheWrite: null,
		totalTokens: reported ? u.totalTokens : null,
		cost: {},
	};
}
export function accountWholeRun(
	entries: readonly unknown[],
	events: readonly unknown[],
) {
	const samples: UsageSample[] = [];
	const parents: Record<string, unknown>[] = [];
	const unmatchedEvents = new Map<string, number>();
	for (const event of events) {
		const e = object(event),
			m = object(e.message);
		if (e.type !== "message_end" || m.role !== "assistant") continue;
		parents.push(m);
		const key = JSON.stringify(m);
		unmatchedEvents.set(key, (unmatchedEvents.get(key) ?? 0) + 1);
	}
	// Multiset union, not a Set: identical completions can be distinct attempts.
	for (const entry of entries) {
		const e = object(entry),
			m = object(e.message);
		if (e.type !== "message" || m.role !== "assistant") continue;
		const key = JSON.stringify(m),
			count = unmatchedEvents.get(key) ?? 0;
		if (count) unmatchedEvents.set(key, count - 1);
		else parents.push(m);
	}
	for (const m of parents)
		samples.push({ owner: "parent", usage: usage(m.usage) });
	const intents = new Set<string>(),
		results = new Set<string>();
	for (const entry of entries) {
		const e = object(entry),
			d = object(e.data);
		if (
			e.type === "custom" &&
			e.customType === "aco-delegation-intent" &&
			typeof d.id === "string"
		)
			intents.add(d.id);
		if (
			e.type === "custom" &&
			e.customType === "aco-delegation-result" &&
			typeof d.id === "string" &&
			!results.has(d.id)
		) {
			results.add(d.id);
			samples.push({ owner: "child", usage: usage(d.providerUsage) });
		}
		if (
			e.type === "usage" ||
			e.type === "compaction" ||
			e.type === "branch_summary" ||
			(e.type === "message" &&
				object(e.message).role === "toolResult" &&
				object(e.message).usage)
		) {
			samples.push({
				owner: "management",
				usage: usage(e.type === "message" ? object(e.message).usage : e.usage),
			});
		}
	}
	const unresolvedChildren = [...intents].filter((id) => !results.has(id));
	for (const _id of unresolvedChildren)
		samples.push({ owner: "child", usage: null });
	const accounting = accountUsage(samples);
	return {
		accounting: {
			...accounting,
			scope:
				"Whole persisted session tree plus completed-message events, including failed/retry-only completions; multiset deduplication. Antigravity catalog cost and default cacheWrite excluded. Hidden provider-internal attempts and actual subscription charges unavailable.",
		},
		parentCompletions: parents.length,
		failedParentCompletions: parents.filter((m) =>
			["error", "aborted"].includes(String(m.stopReason)),
		).length,
		unresolvedChildren,
		providerInternalAttempts: null,
	};
}
export const verificationCommands = [
	"npm test",
	"npm test -- tests/delegation.test.ts",
	"npm test -- tests/recovery-boundary.test.ts",
	"npm run typecheck",
	"npm run check -- --diagnostic-level=error",
	"npm run check -- --write",
	"ls",
	"ls extensions",
	"ls tests",
	"ls reference",
] as const;
export function allowEvaluationTool(
	root: string,
	name: string,
	raw: unknown,
): boolean {
	const input = object(raw);
	if (name === "bash")
		return verificationCommands.some((s) => s === String(input.command).trim());
	if (
		!["read", "write", "edit"].includes(name) ||
		typeof input.path !== "string"
	)
		return false;
	const target = resolve(root, input.path),
		rel = relative(root, target);
	if (!rel || isAbsolute(rel) || rel === ".." || rel.startsWith(".." + sep))
		return false;
	if (
		name !== "read" &&
		!/^(extensions[/\\].+\.ts|tests[/\\].+\.test\.ts)$/.test(rel)
	)
		return false;
	// Check the nearest existing ancestor too, so a new file cannot escape through a junction.
	let p = target;
	for (;;) {
		try {
			const canonical = realpathSync(p),
				base = realpathSync(root),
				r = relative(base, canonical);
			return !isAbsolute(r) && r !== ".." && !r.startsWith(".." + sep);
		} catch {
			const parent = dirname(p);
			if (parent === p) return false;
			p = parent;
		}
	}
}

/** Test-only transport gate: preserve response bytes; never persist headers, prompts or credentials. */
export function createGuardedFetch(
	fetch: typeof globalThis.fetch,
	record: (row: Record<string, unknown>) => void,
): typeof globalThis.fetch {
	let attempt = 0;
	return async (input, init) => {
		const url = String(input instanceof Request ? input.url : input);
		if (!url.includes("/v1internal:streamGenerateContent"))
			return fetch(input, init);
		const raw =
			init?.body ??
			(input instanceof Request ? await input.clone().text() : undefined);
		const body = typeof raw === "string" ? object(JSON.parse(raw)) : {};
		const thinking = object(
			object(object(body.request).generationConfig).thinkingConfig,
		);
		if (
			body.model !== "gemini-3.8-flash-high" ||
			thinking.thinkingBudget !== -1 ||
			thinking.includeThoughts !== true
		) {
			record({ kind: "blocked", model: body.model, thinking });
			throw Error(
				"Evaluation model/thinking fallback refused before transmission",
			);
		}
		const id = ++attempt;
		record({
			kind: "request",
			requestBytes: typeof raw === "string" ? Buffer.byteLength(raw) : null,
			id,
			model: body.model,
			thinking,
			endpoint: new URL(url).origin,
		});
		const response = await fetch(input, init);
		record({ kind: "response", id, status: response.status });
		if (!response.body) return response;
		const decoder = new TextDecoder();
		let text = "";
		const inspect = (line: string) => {
			if (!line.startsWith("data:")) return;
			let parsed: unknown;
			try {
				parsed = JSON.parse(line.slice(5).trim());
			} catch {
				return;
			}
			const chunk = object(parsed),
				meta = object(
					object(chunk.response).usageMetadata ?? chunk.usageMetadata,
				);
			const usage = Object.fromEntries(
				[
					"promptTokenCount",
					"cachedContentTokenCount",
					"candidatesTokenCount",
					"thoughtsTokenCount",
					"totalTokenCount",
				]
					.filter((key) => typeof meta[key] === "number")
					.map((key) => [key, meta[key]]),
			);
			if (Object.keys(usage).length) record({ kind: "usage", id, usage });
		};
		return new Response(
			response.body.pipeThrough(
				new TransformStream<Uint8Array, Uint8Array>({
					transform(chunk, controller) {
						text += decoder.decode(chunk, { stream: true });
						const lines = text.split("\n");
						text = lines.pop() ?? "";
						for (const line of lines) inspect(line);
						controller.enqueue(chunk);
					},
					flush() {
						inspect(text + decoder.decode());
					},
				}),
			),
			{
				status: response.status,
				statusText: response.statusText,
				headers: response.headers,
			},
		);
	};
}

export function installEvaluationGuard(
	pi: import("@earendil-works/pi-coding-agent").ExtensionAPI,
	logRoot: string,
) {
	const append = (file: string, row: Record<string, unknown>) =>
		appendFileSync(
			resolve(logRoot, file),
			`${JSON.stringify({ at: Date.now(), ...row })}\n`,
		);
	const profile = resolve(logRoot, "tool-verification-profile");
	prepareVerificationProfile(profile);
	pi.registerTool(
		createBashToolDefinition(process.cwd(), {
			exposeSessionEnvironment: false,
			spawnHook: (ctx) => ({
				...ctx,
				env: verificationEnvironment(ctx.env, profile),
			}),
		}),
	);
	globalThis.fetch = createGuardedFetch(globalThis.fetch, (row) =>
		append("transport.jsonl", row),
	);
	pi.on("tool_call", (event, ctx) => {
		const allowed = allowEvaluationTool(ctx.cwd, event.toolName, event.input);
		append("tool-guard.jsonl", {
			tool: event.toolName,
			input: event.input,
			allowed,
		});
		if (!allowed)
			return {
				block: true,
				reason:
					"Evaluation scope: only task paths and the frozen verification commands are allowed.",
			};
	});
}
