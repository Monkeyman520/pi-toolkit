import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { Session as InspectorSession } from "node:inspector/promises";
import { arch, cpus, platform, tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import {
	type ExtensionAPI,
	type ExtensionCommandContext,
	SessionManager,
} from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import { ConfigManager } from "../extensions/config.ts";
import { getDefaultConfig } from "../extensions/config-schema.ts";
import { ContextMetricsCache } from "../extensions/context-metrics.ts";
import plugin from "../extensions/index.ts";
import { captureSessionSnapshot } from "../extensions/session-snapshot.ts";
import { createInitialState } from "../extensions/state.ts";
import { buildTreeIndex } from "../extensions/tree-index.ts";
import { SessionTreeComponent } from "../extensions/tui.ts";
import {
	getViewStateFilePath,
	loadViewState,
} from "../extensions/view-state.ts";
import { generateWorkload } from "./workload-generator.ts";

function p95(values: number[]) {
	return [...values].sort((a, b) => a - b)[
		Math.min(values.length - 1, Math.floor(values.length * 0.95))
	];
}
describe("combined interaction workload evidence", () => {
	it("measures the real snapshot/input/dispatch/projection/render boundaries", async () => {
		const root = await mkdtemp(join(tmpdir(), "stree-bench-"));
		const config = getDefaultConfig();
		config.performance.searchDebounceMs = 0;
		const profiler = process.env.STREE_PROFILE_DIR
			? new InspectorSession()
			: undefined;
		if (profiler) {
			profiler.connect();
			await profiler.post("Profiler.enable");
		}
		const finishProfile = async (name: string) => {
			if (!profiler || !process.env.STREE_PROFILE_DIR) return;
			const { profile } = await profiler.post("Profiler.stop");
			await writeFile(
				join(process.env.STREE_PROFILE_DIR, `${name}.cpuprofile`),
				JSON.stringify(profile),
			);
		};
		const scores: Record<
			string,
			{ p95Ms: number; targetMs: number; met: boolean; samples: number }
		> = {};
		const record = (name: string, values: number[], targetMs: number) => {
			const p95Ms = p95(values);
			scores[name] = {
				p95Ms,
				targetMs,
				met: p95Ms < targetMs,
				samples: values.length,
			};
		};
		const data = generateWorkload({ size: 5000, topology: "mixed" });
		const linear = generateWorkload({ size: 5000, topology: "linear" });
		let component: SessionTreeComponent | undefined;
		try {
			const indexTimes = [];
			for (let i = 0; i < 20; i++) {
				const t = performance.now();
				buildTreeIndex(data);
				indexTimes.push(performance.now() - t);
			}
			record("index5k", indexTimes, 200);
			const index = buildTreeIndex(data),
				state = createInitialState("bench", {
					selectedEntryId: index.preorderIds[0],
					sessionLeafId: data.at(-1)?.id ?? null,
				});
			state.foldOptions.mode = "all";
			state.displayOptions.showAssistantNodes = true;
			component = new SessionTreeComponent({
				state,
				index,
				config,
				tui: { requestRender() {} },
				theme: {},
				done() {},
			});
			component.render(120);
			const movement = [];
			for (let i = 0; i < 120; i++) {
				const t = performance.now();
				component.handleInput(i % 2 ? "k" : "j");
				component.render(120);
				if (i >= 20) movement.push(performance.now() - t);
			}
			record("movement5k", movement, 16);
			const branch = [];
			if (profiler) await profiler.post("Profiler.start");
			for (let i = 0; i < 50; i++) {
				const t = performance.now();
				component.handleInput(i % 2 ? "[" : "]");
				component.handleInput("b");
				component.render(120);
				branch.push(performance.now() - t);
			}
			record("branch5k", branch, 20);
			if (profiler) await finishProfile("branch");
			component.dispose();
			const linIndex = buildTreeIndex(linear),
				linState = createInitialState("search-bench", {
					selectedEntryId: linIndex.preorderIds[0],
				});
			component = new SessionTreeComponent({
				state: linState,
				index: linIndex,
				config,
				tui: { requestRender() {} },
				theme: {},
				done() {},
			});
			const search = [];
			if (profiler) await profiler.post("Profiler.start");
			for (let i = 0; i < 20; i++) {
				component.handleInput("\u001b");
				const t = performance.now();
				for (const key of ["/", ..."user"]) component.handleInput(key);
				component.handleInput("\r");
				component.render(120);
				search.push(performance.now() - t);
			}
			record("search5kLinear", search, 100);
			if (profiler) await finishProfile("search");
			component.dispose();
			const ten = generateWorkload({ size: 10000, topology: "mixed" }),
				open = [];
			for (let i = 0; i < 10; i++) {
				const t = performance.now(),
					manager = new ConfigManager();
				await manager.loadLayers({
					agentDir: root,
					cwd: root,
					isProjectTrusted: false,
				});
				const snapshot = captureSessionSnapshot({
					getEntries: () => ten,
					getSessionId: () => "open-bench",
					getLeafId: () => ten.at(-1)?.id ?? null,
					getLabel: () => undefined,
				});
				const focusedPathIds = new Set<string>();
				let focal = snapshot.leafId;
				while (focal) {
					focusedPathIds.add(focal);
					focal = snapshot.index.parentById.get(focal) ?? null;
				}
				const initial = createInitialState(snapshot.sessionId, {
					sessionLeafId: snapshot.leafId,
					selectedEntryId: snapshot.leafId,
					focusedPathIds,
				});
				await loadViewState(root, snapshot.sessionId, snapshot.index);
				component = new SessionTreeComponent({
					state: initial,
					index: snapshot.index,
					config: manager.getConfig(),
					tui: { requestRender() {} },
					theme: {},
					done() {},
				});
				component.render(120);
				open.push(performance.now() - t);
				component.dispose();
			}
			record("firstOpen10kHeadless", open, 500);
			const cache = new ContextMetricsCache(16);
			cache.set("cache", 1, "u", {
				entryId: "u",
				tokens: 10,
				contextWindow: null,
				percentage: null,
				source: "projection-estimate",
				estimated: true,
			});
			const hit = [];
			for (let i = 0; i < 1000; i++) {
				const t = performance.now();
				expect(cache.get("cache", 1, "u")?.tokens).toBe(10);
				hit.push(performance.now() - t);
			}
			record("cacheHit", hit, 5);
			const datasets = [100, 1000, 5000, 10000, 20000].flatMap((size) =>
				["linear", "wide", "deep", "mixed"].map((topology) => {
					const entries = generateWorkload({
						size,
						topology: topology as "linear" | "wide" | "deep" | "mixed",
					});
					expect(buildTreeIndex(entries).entryById.size).toBe(size);
					return {
						size,
						topology,
						bytes: Buffer.byteLength(JSON.stringify(entries)),
					};
				}),
			);
			const heavy = generateWorkload({ size: 5000, topology: "linear" });
			for (const entry of heavy)
				if (entry.message) {
					entry.message.content = Array.isArray(entry.message.content)
						? [{ type: "text", text: "payload ".repeat(625) }]
						: "payload ".repeat(625);
				}
			const heavyBytes = Buffer.byteLength(JSON.stringify(heavy));
			expect(heavyBytes).toBeGreaterThan(25_000_000);
			const heavyOpen = [];
			for (let i = 0; i < 3; i++) {
				const t = performance.now(),
					snapshot = captureSessionSnapshot({
						getEntries: () => heavy,
						getSessionId: () => "heavy",
						getLeafId: () => heavy.at(-1)?.id ?? null,
						getLabel: () => undefined,
					});
				const state = createInitialState("heavy", {
					selectedEntryId: snapshot.leafId,
					sessionLeafId: snapshot.leafId,
					focusedPathIds: new Set(snapshot.index.preorderIds),
				});
				component = new SessionTreeComponent({
					state,
					index: snapshot.index,
					config,
					tui: { requestRender() {} },
					theme: {},
					done() {},
				});
				component.render(120);
				heavyOpen.push(performance.now() - t);
				component.dispose();
			}
			record("snapshotRender5k25MBHeadless", heavyOpen, 500);
			datasets.push({
				size: 5000,
				topology: "linear-payload",
				bytes: heavyBytes,
			});
			vi.stubEnv("PI_CODING_AGENT_DIR", root);
			const session = SessionManager.inMemory(root);
			for (let i = 0; i < 10000; i++)
				session.appendMessage({
					role: "user",
					content: `native fixture ${i}`,
					timestamp: 1730000000000 + i,
				});
			const assembled: number[] = [];
			for (let i = 0; i < 10; i++) {
				await rm(getViewStateFilePath(root, session.getSessionId()), {
					force: true,
				});
				let handler:
					| ((args: string, ctx: ExtensionCommandContext) => Promise<void>)
					| undefined;
				plugin({
					on() {},
					events: { on() {}, emit() {} },
					registerCommand(
						_name: string,
						definition: { handler: typeof handler },
					) {
						handler = definition.handler;
					},
				} as unknown as ExtensionAPI);
				let start = 0;
				const context = {
					cwd: root,
					mode: "tui",
					sessionManager: session,
					isProjectTrusted: () => false,
					isIdle: () => true,
					getContextUsage: () => null,
					ui: {
						notify() {},
						custom: async (
							factory: (...args: unknown[]) => SessionTreeComponent,
						) => {
							let result: unknown;
							const view = factory(
								{ requestRender() {} },
								{},
								{},
								(r: unknown) => {
									result = r;
								},
							);
							view.render(120);
							assembled.push(performance.now() - start);
							view.handleInput("q");
							return result;
						},
					},
				} as unknown as ExtensionCommandContext;
				if (!handler) throw new Error("Missing actual stree command");
				start = performance.now();
				await handler("", context);
			}
			record("assembledCommandFirstOpen10kHeadless", assembled, 500);
			datasets.push({
				size: 10000,
				topology: "native-memory-linear-user",
				bytes: Buffer.byteLength(JSON.stringify(session.getEntries())),
			});
			const queuedEntries = session.getEntries().slice(0, 5000),
				queuedLeaf = queuedEntries.at(-1)?.id ?? null;
			const queuedSnapshot = captureSessionSnapshot({
				getEntries: () => queuedEntries,
				getSessionId: () => "queued",
				getLeafId: () => queuedLeaf,
				getLabel: () => undefined,
			});
			const queuedState = createInitialState("queued", {
				selectedEntryId: queuedLeaf,
				sessionLeafId: queuedLeaf,
				focusedPathIds: new Set(queuedSnapshot.index.preorderIds),
			});
			component = new SessionTreeComponent({
				state: queuedState,
				index: queuedSnapshot.index,
				config,
				tui: { requestRender() {} },
				theme: {},
				done() {},
			});
			component.render(120);
			const queuedTimes: number[] = [];
			for (let i = 0; i < 120; i++) {
				const due = performance.now();
				await new Promise<void>((resolve) =>
					setImmediate(() => {
						component?.handleInput(i % 2 ? "j" : "k");
						component?.render(120);
						if (i >= 20) queuedTimes.push(performance.now() - due);
						resolve();
					}),
				);
			}
			record("queuedMovement5kWithPendingEstimates", queuedTimes, 16);
			component.dispose();
			const report = {
				environment: {
					platform: platform(),
					arch: arch(),
					cpu: cpus()[0]?.model,
					node: process.version,
					terminal:
						"headless 120-column injected TUI boundary; not a physical terminal",
				},
				method:
					"index20; movement20 warmup+100 samples; ready-setImmediate queued native-history movement20 warmup+100 enqueue-to-render samples with live estimate timers; branch50; cold+warm search20 (debounce=0, Enter flush); modeled first open10; actual stree command+real SessionManager+headless first render10 (fresh config/view IO); cache1000; 5k/25MB snapshot/render3; P95=floor(n*.95)",
				scores,
				targetsMet: Object.values(scores).every((s) => s.met),
				datasets,
			};
			if (process.env.STREE_BENCH_REPORT)
				await writeFile(
					process.env.STREE_BENCH_REPORT,
					JSON.stringify(report, null, 2),
				);
			console.log(JSON.stringify(report));
			for (const score of Object.values(scores))
				expect(Number.isFinite(score.p95Ms)).toBe(true);
		} finally {
			profiler?.disconnect();
			vi.unstubAllEnvs();
			component?.dispose();
			await rm(root, { recursive: true, force: true });
		}
	}, 15_000);
});
