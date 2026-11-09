import os from "node:os";
import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";
import { ContextMetricsCache } from "../extensions/context-metrics.ts";
import {
	buildDisplayProjection,
	buildSearchIndex,
	buildTreeIndex,
	createInitialState,
	executeSearch,
	navBranchNext,
	navBranchPrev,
	navNodeNext,
	navNodePrev,
} from "../extensions/index.ts";
import { generateWorkload } from "./workload-generator.ts";

function p95(samples: number[]) {
	if (samples.length === 0) return 0;
	const sorted = [...samples].sort((a, b) => a - b);
	const idx = Math.floor(sorted.length * 0.95);
	return Math.round(sorted[Math.min(sorted.length - 1, idx)] * 100) / 100;
}

describe("T0008: Performance Benchmarks (Spec R14)", () => {
	it("collects environment and executes 6 P95 benchmarks", () => {
		const envInfo = `${os.platform()} ${os.arch()} | CPU: ${os.cpus()[0]?.model} | Node: ${process.version}`;
		expect(envInfo.length).toBeGreaterThan(0);

		// 1. 5,000-entry Index Build (Target P95 < 200ms)
		const entries5k = generateWorkload({ size: 5000, topology: "mixed" });
		const indexBuildSamples: number[] = [];
		let index5k = buildTreeIndex(entries5k);

		for (let i = 0; i < 15; i++) {
			const t0 = performance.now();
			index5k = buildTreeIndex(entries5k);
			const t1 = performance.now();
			indexBuildSamples.push(t1 - t0);
		}
		const p95IndexBuild = p95(indexBuildSamples);
		console.log(`[1] 5k index build: P95 = ${p95IndexBuild}ms (< 200ms)`);
		expect(p95IndexBuild).toBeLessThan(200);

		// 2. 5,000-entry Up/Down Movement (Target P95 < 16ms)
		const state5k = createInitialState("bench-5k", {
			selectedEntryId: entries5k[0].id,
			foldOptions: {
				mode: "all",
				collapseInactiveBranches: false,
				collapseLinearPaths: false,
				rememberManualOverrides: false,
				maxExpandDepth: 0,
			},
		});
		const visible5k = buildDisplayProjection(index5k, state5k);
		const moveSamples: number[] = [];
		let curId = entries5k[0].id;

		for (let i = 0; i < 100; i++) {
			const t0 = performance.now();
			curId = navNodeNext(curId, visible5k) ?? curId;
			curId = navNodePrev(curId, visible5k) ?? curId;
			const t1 = performance.now();
			moveSamples.push(t1 - t0);
		}
		const p95Move = p95(moveSamples);
		console.log(`[2] 5k move: P95 = ${p95Move}ms (< 16ms)`);
		expect(p95Move).toBeLessThan(16);

		// 3. Branch Jump (Target P95 < 20ms)
		const branchJumpSamples: number[] = [];
		for (let i = 0; i < 50; i++) {
			const sampleEntry =
				entries5k[Math.floor(Math.random() * entries5k.length)].id;
			const t0 = performance.now();
			const nextBranch = navBranchNext(sampleEntry, index5k);
			navBranchPrev(nextBranch ?? sampleEntry, index5k);
			const t1 = performance.now();
			branchJumpSamples.push(t1 - t0);
		}
		const p95Branch = p95(branchJumpSamples);
		console.log(`[3] Branch jump: P95 = ${p95Branch}ms (< 20ms)`);
		expect(p95Branch).toBeLessThan(20);

		// 4. Search Input Feedback (Target P95 < 100ms)
		const searchDocs5k = buildSearchIndex(index5k);
		const searchSamples: number[] = [];
		const queries = [
			"architecture",
			"benchmark",
			"compaction",
			"user query",
			"token",
			"database",
		];

		for (let i = 0; i < 50; i++) {
			const q = queries[i % queries.length];
			const t0 = performance.now();
			executeSearch(
				q,
				searchDocs5k,
				{
					mode: "fuzzy",
					scope: "all",
					caseSensitive: false,
					maxResults: 100,
				},
				index5k,
			);
			const t1 = performance.now();
			searchSamples.push(t1 - t0);
		}
		const p95Search = p95(searchSamples);
		console.log(`[4] Search feedback: P95 = ${p95Search}ms (< 100ms)`);
		expect(p95Search).toBeLessThan(100);

		// 5. 10,000-entry First Open (Target P95 < 500ms)
		const entries10k = generateWorkload({ size: 10000, topology: "mixed" });
		const firstOpenSamples: number[] = [];

		for (let i = 0; i < 10; i++) {
			const t0 = performance.now();
			const idx = buildTreeIndex(entries10k);
			const st = createInitialState("bench-10k", {
				selectedEntryId: entries10k[0].id,
				sessionLeafId: entries10k[entries10k.length - 1].id,
			});
			buildDisplayProjection(idx, st);
			const t1 = performance.now();
			firstOpenSamples.push(t1 - t0);
		}
		const p95FirstOpen = p95(firstOpenSamples);
		console.log(`[5] 10k first open: P95 = ${p95FirstOpen}ms (< 500ms)`);
		expect(p95FirstOpen).toBeLessThan(500);

		// 6. Context Cache Hit (Target P95 < 5ms)
		const cache = new ContextMetricsCache(512);
		for (let i = 0; i < 100; i++) {
			cache.set("bench-sess", 1, `entry_${i}`, {
				entryId: `entry_${i}`,
				tokens: 1500,
				contextWindow: 128000,
				percentage: 1,
				source: "projection-estimate",
				estimated: true,
			});
		}

		const cacheHitSamples: number[] = [];
		for (let i = 0; i < 500; i++) {
			const targetId = `entry_${i % 100}`;
			const t0 = performance.now();
			cache.get("bench-sess", 1, targetId);
			const t1 = performance.now();
			cacheHitSamples.push(t1 - t0);
		}
		const p95CacheHit = p95(cacheHitSamples);
		console.log(`[6] Cache hit: P95 = ${p95CacheHit}ms (< 5ms)`);
		expect(p95CacheHit).toBeLessThan(5);

		// 7. Huge Workload Sanity Check (20,000 entries)
		const entries20k = generateWorkload({ size: 20000, topology: "mixed" });
		const t0Huge = performance.now();
		const index20k = buildTreeIndex(entries20k);
		const t1Huge = performance.now();
		expect(index20k.entryById.size).toBe(20000);
		console.log(
			`[7] 20k huge index: ${Math.round(t1Huge - t0Huge)}ms (< 1000ms)`,
		);
		expect(t1Huge - t0Huge).toBeLessThan(1000);
	});
});
