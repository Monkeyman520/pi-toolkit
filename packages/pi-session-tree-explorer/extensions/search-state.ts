import { buildDisplayProjection, reconcileSelection } from "./display.ts";
import {
	buildSearchIndex,
	executeSearch,
	type SearchDocument,
	type SearchOptions,
} from "./search.ts";
import type { ActionContext, ExplorerState, TreeIndex } from "./types.ts";

function reveal(id: string, index: TreeIndex, state: ExplorerState) {
	let cur: string | null = id;
	while (cur) {
		state.temporaryRevealedIds.add(cur);
		cur = index.parentById.get(cur) ?? null;
	}
}
export function transitionSearch(ctx: ActionContext, id: string): void {
	const s = ctx.state;
	let needsReconciliation = false;
	switch (id) {
		case "search.open":
			s.searchSnapshot = {
				searchQuery: s.searchQuery,
				selectedEntryId: s.selectedEntryId,
				temporaryRevealedIds: new Set(s.temporaryRevealedIds),
				manualExpandedIds: new Set(s.manualExpandedIds),
				manualCollapsedIds: new Set(s.manualCollapsedIds),
				results: [...s.searchResults],
				resultIndex: s.searchResultIndex,
				regex: s.searchRegex,
				scope: s.searchScope,
			};
			s.mode = "search";
			break;
		case "search.clear":
			if (s.mode === "search") {
				const saved = s.searchSnapshot;
				if (saved) {
					s.searchQuery = saved.searchQuery;
					s.selectedEntryId = saved.selectedEntryId;
					s.temporaryRevealedIds = new Set(saved.temporaryRevealedIds);
					s.manualExpandedIds = new Set(saved.manualExpandedIds);
					s.manualCollapsedIds = new Set(saved.manualCollapsedIds);
					s.searchResults = saved.results ?? [];
					s.searchResultIndex = saved.resultIndex ?? -1;
					s.searchRegex = saved.regex ?? s.searchRegex;
					s.searchScope = saved.scope ?? s.searchScope;
				}
			} else {
				s.searchQuery = "";
				s.temporaryRevealedIds.clear();
				s.searchResults = [];
				s.searchResultIndex = -1;
				needsReconciliation = true;
			}
			s.searchSnapshot = undefined;
			s.mode = "normal";
			break;
		case "search.accept": {
			const match = s.searchResults[s.searchResultIndex];
			if (match && ctx.index.entryById.has(match.id)) {
				reveal(match.id, ctx.index, s);
				s.selectedEntryId = match.id;
			}
			s.mode = "normal";
			s.searchSnapshot = undefined;
			break;
		}
		case "search.next":
		case "search.prev": {
			if (!s.searchResults.length) return;
			s.searchResultIndex =
				(s.searchResultIndex +
					(id === "search.next" ? 1 : -1) +
					s.searchResults.length) %
				s.searchResults.length;
			const target = s.searchResults[s.searchResultIndex].id;
			if (ctx.index.entryById.has(target)) {
				reveal(target, ctx.index, s);
				s.selectedEntryId = target;
			}
			break;
		}
		case "search.toggleRegex":
			s.searchRegex = !s.searchRegex;
			break;
		case "search.toggleScope":
			s.searchScope = s.searchScope === "all" ? "focused-subtree" : "all";
			break;
	}
	s.version++;
	const projection = ctx.reproject?.();
	if (needsReconciliation)
		reconcileSelection(
			ctx.index,
			s,
			projection ?? buildDisplayProjection(ctx.index, s),
		);
}
export interface SearchRuntimeOptions {
	mode: SearchOptions["mode"];
	caseSensitive: boolean;
	maxResults: number;
	debounceMs: number;
	includeHiddenNodes: boolean;
	autoExpandMatches: boolean;
}
export class SearchController {
	private docs: SearchDocument[] | null = null;
	private timer: ReturnType<typeof setTimeout> | undefined;
	private generation = 0;
	private disposed = false;
	private state: ExplorerState;
	private getIndex: () => TreeIndex;
	private onChange: () => void;
	private options: SearchRuntimeOptions;
	constructor(
		state: ExplorerState,
		getIndex: () => TreeIndex,
		onChange: () => void,
		options: SearchRuntimeOptions,
	) {
		this.state = state;
		this.getIndex = getIndex;
		this.onChange = onChange;
		this.options = options;
	}
	public configure(options: SearchRuntimeOptions) {
		this.options = options;
		this.cancel();
		if (this.state.searchQuery || this.state.mode === "search")
			this.run(this.state.searchQuery);
	}
	public cancel() {
		this.generation++;
		if (this.timer) clearTimeout(this.timer);
		this.timer = undefined;
	}
	public dispose() {
		this.cancel();
		this.disposed = true;
		this.docs = null;
	}
	public invalidate() {
		this.cancel();
		this.docs = null;
		this.state.searchResults = [];
		this.state.searchResultIndex = -1;
		if (this.state.searchQuery) this.run(this.state.searchQuery);
	}
	public edit(text: string) {
		this.state.searchQuery =
			text === "\b"
				? [...this.state.searchQuery].slice(0, -1).join("")
				: this.state.searchQuery + text;
		this.cancel();
		const generation = this.generation;
		this.timer = setTimeout(() => {
			this.timer = undefined;
			if (!this.disposed && generation === this.generation)
				this.run(this.state.searchQuery);
		}, this.options.debounceMs);
		this.onChange();
	}
	public run(query: string) {
		if (this.disposed) return;
		this.cancel();
		this.state.searchQuery = query;
		const index = this.getIndex();
		this.docs ??= buildSearchIndex(index);
		const visible = this.options.includeHiddenNodes
			? null
			: new Set(
					buildDisplayProjection(index, this.state)
						.filter((n) => n.realId)
						.map((n) => n.realId),
				);
		const results = executeSearch(
			query,
			visible ? this.docs.filter((d) => visible.has(d.id)) : this.docs,
			{
				mode: this.state.searchRegex
					? "regex"
					: this.options.mode === "regex"
						? "fuzzy"
						: this.options.mode,
				caseSensitive: this.options.caseSensitive,
				maxResults: this.options.maxResults,
				scope: this.state.searchScope,
				focusedBranchId: this.state.focusedBranchId,
			},
			index,
		);
		this.state.searchResults = results.map((r) => ({
			id: r.document.id,
			score: r.score,
		}));
		this.state.searchResultIndex = results.length ? 0 : -1;
		this.state.temporaryRevealedIds = new Set(
			this.state.searchSnapshot?.temporaryRevealedIds ?? [],
		);
		if (results.length) {
			this.state.selectedEntryId = results[0].document.id;
			if (this.options.autoExpandMatches)
				reveal(results[0].document.id, index, this.state);
		}
		this.state.version++;
		this.onChange();
	}
	public execute(ctx: ActionContext, id: string) {
		if (id === "search.accept" && this.timer) this.run(this.state.searchQuery);
		if (id === "search.clear") this.cancel();
		transitionSearch(ctx, id);
		if (id === "search.toggleRegex" || id === "search.toggleScope")
			this.run(this.state.searchQuery);
		this.onChange();
	}
}
