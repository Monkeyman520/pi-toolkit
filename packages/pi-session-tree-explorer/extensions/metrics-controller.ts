import {
	type ComputeContextParams,
	ContextMetricsCache,
	computeContextMetrics,
} from "./context-metrics.ts";
import type { ContextMetrics } from "./types.ts";

/** One bounded, disposable estimation queue per Explorer; rendering never runs projections. */
export class MetricsController {
	private cache: ContextMetricsCache;
	private queue = new Map<string, number>();
	private timer: ReturnType<typeof setTimeout> | undefined;
	private generation = 0;
	private disposed = false;
	private params: Omit<ComputeContextParams, "entryId">;
	private sessionId: string;
	private revision: number;
	private onChange: () => void;
	private estimateHistorical: boolean;
	private capacity: number;
	private admitted: Set<string> | undefined;
	constructor(
		sessionId: string,
		revision: number,
		params: Omit<ComputeContextParams, "entryId">,
		onChange: () => void,
		capacity = 512,
		estimateHistorical = true,
	) {
		this.sessionId = sessionId;
		this.revision = revision;
		this.params = params;
		this.onChange = onChange;
		this.capacity = Math.max(1, Math.min(capacity, 256));
		this.cache = new ContextMetricsCache(capacity);
		this.estimateHistorical = estimateHistorical;
	}
	public dispose() {
		this.disposed = true;
		this.generation++;
		this.queue.clear();
		if (this.timer) clearTimeout(this.timer);
		this.timer = undefined;
		this.cache.clear();
	}
	public prioritize(ids: string[]): void {
		this.admitted = new Set(
			[...new Set(ids)]
				.filter((id) => this.params.index.entryById.has(id))
				.slice(0, this.capacity),
		);
		this.queue.clear();
		let priority = 0;
		for (const id of this.admitted) this.request(id, priority++);
	}
	public request(entryId: string, priority = 1): ContextMetrics | undefined {
		if (this.disposed || !this.params.index.entryById.has(entryId))
			return undefined;
		const model = this.params.activeModel;
		const cached = this.cache.get(
			this.sessionId,
			this.revision,
			entryId,
			model ? `${model.provider}/${model.id}` : undefined,
		);
		if (cached) return cached;
		if (!this.estimateHistorical && entryId !== this.params.sessionLeafId)
			return undefined;
		if (this.admitted && !this.admitted.has(entryId)) return undefined;
		if (!this.queue.has(entryId) && this.queue.size >= this.capacity)
			return undefined;
		this.queue.set(
			entryId,
			Math.min(this.queue.get(entryId) ?? priority, priority),
		);
		this.schedule();
		return undefined;
	}
	private schedule() {
		if (this.timer || this.disposed || !this.queue.size) return;
		const generation = this.generation;
		this.timer = setTimeout(() => {
			this.timer = undefined;
			if (this.disposed || generation !== this.generation) return;
			let selected: string | undefined,
				priority = Infinity;
			for (const [id, p] of this.queue)
				if (p < priority) {
					selected = id;
					priority = p;
				}
			if (selected) {
				this.queue.delete(selected);
				const metrics = computeContextMetrics({
					...this.params,
					entryId: selected,
				});
				if (!this.disposed && generation === this.generation) {
					const model = this.params.activeModel;
					this.cache.set(
						this.sessionId,
						this.revision,
						selected,
						metrics,
						model ? `${model.provider}/${model.id}` : undefined,
					);
					this.onChange();
				}
			}
			this.schedule();
		}, 0);
	}
}
