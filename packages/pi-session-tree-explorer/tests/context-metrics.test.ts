import { describe, expect, it } from "vitest";
import {
	ContextMetricsCache,
	computeContextMetrics,
	formatContextMetricsBadge,
	formatTokenNumber,
	resolveContextWindow,
} from "../extensions/context-metrics.ts";
import { buildTreeIndex } from "../extensions/tree-index.ts";
import type { SessionEntry } from "../extensions/types.ts";

describe("T0006: Context Metrics, Read-Only Projection & Bounded Cache", () => {
	it("resolves context window for known models and returns null when unknown", () => {
		expect(resolveContextWindow("gpt-4o")).toBe(128_000);
		expect(resolveContextWindow("claude-3-5-sonnet")).toBe(200_000);
		expect(resolveContextWindow("gemini-1.5-pro")).toBe(1_000_000);

		// Fallback to active model when matching
		expect(
			resolveContextWindow("custom-local-model", "local", {
				id: "custom-local-model",
				provider: "local",
				contextWindow: 65_536,
			}),
		).toBe(65_536);

		// Completely unknown model returns null (never fabricated)
		expect(resolveContextWindow("unknown-exotic-model")).toBeNull();
	});

	it("computes active leaf metrics using host usage without claiming exactness", () => {
		const entries: SessionEntry[] = [
			{
				type: "message",
				id: "1",
				parentId: null,
				timestamp: "T0",
				message: { role: "user", content: "Hi" },
			},
			{
				type: "message",
				id: "2",
				parentId: "1",
				timestamp: "T1",
				message: { role: "assistant", content: "Hello" },
			},
		];
		const index = buildTreeIndex(entries);

		const metrics = computeContextMetrics({
			entryId: "2",
			rawEntries: entries,
			index,
			sessionLeafId: "2", // Active leaf!
			activeUsage: { tokens: 94_000, contextWindow: 128_000, percent: 73 },
			activeModel: { id: "gpt-4o", provider: "openai", contextWindow: 128_000 },
		});

		expect(metrics.source).toBe("active-context");
		expect(metrics.tokens).toBe(94_000);
		expect(metrics.contextWindow).toBe(128_000);
		expect(metrics.percentage).toBe(73);
		expect(metrics.estimated).toBe(true); // Host usage is still estimated!
	});

	it("computes historical metrics via read-only ancestor projection (not cumulative usage)", () => {
		const entries: SessionEntry[] = [
			{
				type: "message",
				id: "step1",
				parentId: null,
				timestamp: "T0",
				message: { role: "user", content: "Analyze user requirement A" },
			},
			{
				type: "message",
				id: "step2",
				parentId: "step1",
				timestamp: "T1",
				message: {
					role: "assistant",
					model: "gpt-4o",
					content: "Here is the detailed analysis of requirement A.",
					usage: { input: 1500, output: 800, totalTokens: 2300 },
				},
			},
			{
				type: "message",
				id: "step3",
				parentId: "step2",
				timestamp: "T2",
				message: { role: "user", content: "Now write architecture plan B" },
			},
		];
		const index = buildTreeIndex(entries);

		// Projecting from step1: only step1 is visible in context
		const metricsStep1 = computeContextMetrics({
			entryId: "step1",
			rawEntries: entries,
			index,
			sessionLeafId: "step3",
			activeModel: { id: "gpt-4o", provider: "openai", contextWindow: 128_000 },
		});

		expect(metricsStep1.source).toBe("projection-estimate");
		expect(metricsStep1.tokens).toBeGreaterThan(0);
		expect(metricsStep1.tokens).toBeLessThan(100); // Only 1 prompt message!

		// Projecting from step2: step1 + step2 are visible
		const metricsStep2 = computeContextMetrics({
			entryId: "step2",
			rawEntries: entries,
			index,
			sessionLeafId: "step3",
			activeModel: { id: "gpt-4o", provider: "openai", contextWindow: 128_000 },
		});
		const t1 = metricsStep1.tokens ?? 0;
		expect(metricsStep2.tokens).toBeGreaterThan(t1);
	});

	it("honors compaction checkpoints and firstKeptEntryId boundaries", () => {
		const entries: SessionEntry[] = [
			{
				type: "message",
				id: "old1",
				parentId: null,
				timestamp: "T0",
				message: { role: "user", content: "Old topic 1" },
			},
			{
				type: "message",
				id: "old2",
				parentId: "old1",
				timestamp: "T1",
				message: { role: "assistant", content: "Old reply 1" },
			},
			{
				type: "message",
				id: "kept1",
				parentId: "old2",
				timestamp: "T2",
				message: { role: "user", content: "Kept topic" },
			},
			{
				type: "compaction",
				id: "compact1",
				parentId: "kept1",
				timestamp: "T3",
				summary: "Summary of old messages 1 and 2.",
				firstKeptEntryId: "kept1",
			},
			{
				type: "message",
				id: "post1",
				parentId: "compact1",
				timestamp: "T4",
				message: { role: "user", content: "Follow-up question" },
			},
		];
		const index = buildTreeIndex(entries);

		// Context at post1: includes compact1 checkpoint, kept1, and post1 (old1 and old2 omitted!)
		const metrics = computeContextMetrics({
			entryId: "post1",
			rawEntries: entries,
			index,
			sessionLeafId: "post1",
			activeModel: { id: "gpt-4o", provider: "openai", contextWindow: 128_000 },
		});

		expect(metrics.source).toBe("projection-estimate");
		expect(metrics.tokens).toBeGreaterThan(0);
	});

	it("isolates context edits to their own branch", () => {
		// Fork at root
		// Branch 1: root -> edit1 (replaces root content) -> branch1_leaf
		// Branch 2: root -> branch2_leaf (NO edit on root!)
		const entries: SessionEntry[] = [
			{
				type: "message",
				id: "root",
				parentId: null,
				timestamp: "T0",
				message: { role: "user", content: "Long original text: AAAA" },
			},
			// Branch 1
			{
				type: "context_edit",
				id: "edit1",
				parentId: "root",
				timestamp: "T1",
				targetId: "root",
				replacement: null,
			}, // Omit root!
			{
				type: "message",
				id: "b1_leaf",
				parentId: "edit1",
				timestamp: "T2",
				message: { role: "user", content: "B1" },
			},
			// Branch 2
			{
				type: "message",
				id: "b2_leaf",
				parentId: "root",
				timestamp: "T3",
				message: { role: "user", content: "B2" },
			},
		];
		const index = buildTreeIndex(entries);

		const b1Metrics = computeContextMetrics({
			entryId: "b1_leaf",
			rawEntries: entries,
			index,
			sessionLeafId: "b1_leaf",
			activeModel: { id: "gpt-4o", provider: "openai", contextWindow: 128_000 },
		});

		const b2Metrics = computeContextMetrics({
			entryId: "b2_leaf",
			rawEntries: entries,
			index,
			sessionLeafId: "b2_leaf",
			activeModel: { id: "gpt-4o", provider: "openai", contextWindow: 128_000 },
		});

		// b1_leaf context edits omitted root, so b1 has fewer tokens than b2
		const b2Tokens = b2Metrics.tokens ?? 0;
		expect(b1Metrics.tokens).toBeLessThan(b2Tokens);
	});

	it("honors historical model changes and does not silently borrow active model window", () => {
		const entries: SessionEntry[] = [
			{
				type: "message",
				id: "1",
				parentId: null,
				timestamp: "T0",
				message: { role: "user", content: "Hi" },
			},
			{
				type: "model_change",
				id: "mc1",
				parentId: "1",
				timestamp: "T1",
				provider: "openai",
				modelId: "gpt-4o",
			},
			{
				type: "message",
				id: "2",
				parentId: "mc1",
				timestamp: "T2",
				message: { role: "assistant", content: "Hello" },
			},
		];
		const index = buildTreeIndex(entries);

		// Active model today is Claude 3.5 Sonnet (200k), but node 2 historically used gpt-4o (128k)
		const metrics = computeContextMetrics({
			entryId: "2",
			rawEntries: entries,
			index,
			sessionLeafId: "2",
			activeModel: {
				id: "claude-3-5-sonnet",
				provider: "anthropic",
				contextWindow: 200_000,
			},
		});

		expect(metrics.contextWindow).toBe(128_000); // Honors historical gpt-4o window!
		expect(metrics.modelId).toBe("gpt-4o");
	});

	it("manages bounded LRU cache with hit and eviction behavior", () => {
		const cache = new ContextMetricsCache(2); // Max 2 entries

		const m1 = {
			entryId: "e1",
			tokens: 100,
			contextWindow: 1000,
			percentage: 10,
			source: "projection-estimate" as const,
			estimated: true,
		};
		const m2 = {
			entryId: "e2",
			tokens: 200,
			contextWindow: 1000,
			percentage: 20,
			source: "projection-estimate" as const,
			estimated: true,
		};
		const m3 = {
			entryId: "e3",
			tokens: 300,
			contextWindow: 1000,
			percentage: 30,
			source: "projection-estimate" as const,
			estimated: true,
		};

		cache.set("sess1", 1, "e1", m1);
		cache.set("sess1", 1, "e2", m2);

		// Access e2 first, then e1 (e1 becomes most recently used, e2 is oldest)
		expect(cache.get("sess1", 1, "e2")?.tokens).toBe(200);
		expect(cache.get("sess1", 1, "e1")?.tokens).toBe(100);

		// Adding 3rd entry evicts e2 (since e2 is oldest)
		cache.set("sess1", 1, "e3", m3);
		expect(cache.get("sess1", 1, "e3")?.tokens).toBe(300);
		expect(cache.get("sess1", 1, "e1")?.tokens).toBe(100);
		expect(cache.get("sess1", 1, "e2")).toBeUndefined(); // Evicted!

		// Clear cache
		cache.clear();
		expect(cache.get("sess1", 1, "e1")).toBeUndefined();
	});

	it("formats context badges with estimate marker, token units, and unknown dash", () => {
		// Unknown tokens
		expect(
			formatContextMetricsBadge({
				entryId: "u",
				tokens: null,
				contextWindow: null,
				percentage: null,
				source: "unknown",
				estimated: false,
			}),
		).toBe("—");

		// Estimated tokens with window
		expect(
			formatContextMetricsBadge({
				entryId: "e",
				tokens: 42_000,
				contextWindow: 128_000,
				percentage: 33,
				source: "projection-estimate",
				estimated: true,
			}),
		).toBe("~42k/128k 33%");

		// Number formatting
		expect(formatTokenNumber(null)).toBe("—");
		expect(formatTokenNumber(950)).toBe("950");
		expect(formatTokenNumber(18_400)).toBe("18.4k");
		expect(formatTokenNumber(1_200_000)).toBe("1.2m");
	});
});
