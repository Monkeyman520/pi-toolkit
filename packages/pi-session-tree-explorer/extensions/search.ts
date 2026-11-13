import { extractSummary } from "./display.ts";
import type { SessionEntry, TreeIndex } from "./types.ts";

export interface SearchDocument {
	id: string;
	type: string;
	role?: string;
	label?: string;
	timestamp: string;
	summaryText: string;
	fullText: string;
	toolName?: string;
	sessionOrder: number;
	branchRootId?: string;
}

export interface SearchOptions {
	mode: "fuzzy" | "exact" | "regex";
	scope: "all" | "focused-subtree";
	caseSensitive: boolean;
	maxResults: number;
	focusedBranchId?: string | null;
}

export interface SearchResult {
	document: SearchDocument;
	score: number;
	matches: string[];
}

function messageTextParts(content: unknown): string[] {
	if (typeof content === "string") return [content];
	if (!Array.isArray(content)) return [];
	const parts: string[] = [];
	for (const block of content) {
		if (typeof block === "string") {
			parts.push(block);
			continue;
		}
		if (!block || typeof block !== "object") continue;
		for (const key of ["text", "thinking", "name"])
			if (key in block && typeof block[key] === "string")
				parts.push(block[key]);
		for (const key of ["arguments", "input"])
			if (key in block && block[key] !== undefined)
				parts.push(JSON.stringify(block[key]));
	}
	return parts;
}
export function extractContentText(entry: SessionEntry): string {
	if (entry.type === "message" && entry.message) {
		return messageTextParts(entry.message.content).join("\n");
	}
	if (entry.type === "compaction" && entry.summary) return entry.summary;
	if (entry.type === "branch_summary" && entry.summary) return entry.summary;
	if (entry.type === "custom_message" && typeof entry.content === "string")
		return entry.content;
	return extractFullText(entry);
}

export function extractFullText(entry: SessionEntry): string {
	const parts: string[] = [];

	if (entry.id) parts.push(entry.id);
	if (entry.label) parts.push(entry.label);
	if (entry.timestamp) parts.push(entry.timestamp);

	if (entry.type === "message" && entry.message) {
		const msg = entry.message;
		if (msg.role) parts.push(msg.role);
		if (msg.model) parts.push(msg.model);
		if (msg.provider) parts.push(msg.provider);
		if (msg.toolName) parts.push(msg.toolName);
		if (msg.toolCallId) parts.push(msg.toolCallId);

		parts.push(...messageTextParts(msg.content));
	} else if (entry.type === "compaction") {
		if (entry.summary) parts.push(entry.summary);
		if (entry.firstKeptEntryId) parts.push(entry.firstKeptEntryId);
	} else if (entry.type === "branch_summary") {
		if (entry.summary) parts.push(entry.summary);
		if (entry.fromId) parts.push(entry.fromId);
	} else if (entry.type === "custom_message") {
		if (typeof entry.content === "string") parts.push(entry.content);
		if (entry.customType) parts.push(entry.customType);
	} else if (entry.type === "custom") {
		if (entry.customType) parts.push(entry.customType);
		if (entry.data) parts.push(JSON.stringify(entry.data));
	} else if (entry.type === "session_info") {
		if (entry.name) parts.push(entry.name);
	} else if (entry.type === "model_change") {
		if (entry.modelId) parts.push(entry.modelId);
		if (entry.provider) parts.push(entry.provider);
	} else if (entry.type === "thinking_level_change") {
		if (entry.thinkingLevel) parts.push(entry.thinkingLevel);
	} else if (entry.type === "usage") {
		if (entry.kind) parts.push(entry.kind);
	}

	return parts.join(" ");
}

/**
 * Build searchable index documents for all raw entries in the tree.
 */
export function buildSearchIndex(index: TreeIndex): SearchDocument[] {
	const documents: SearchDocument[] = [];
	let order = 0;
	const branchRoots = new Map<string, string>();
	for (const id of index.preorderIds) {
		const parent = index.parentById.get(id);
		branchRoots.set(
			id,
			!parent || (index.childrenById.get(parent)?.length ?? 0) > 1
				? id
				: (branchRoots.get(parent) ?? id),
		);
	}

	for (const [id, entry] of index.entryById.entries()) {
		const label = index.displayLabelsById.get(id);
		const fullText = [extractFullText(entry), label].filter(Boolean).join(" ");
		const { summaryText, role } = extractSummary(entry);

		const branchRootId = branchRoots.get(id) ?? id;
		documents.push({
			id,
			type: entry.type,
			role,
			label,
			timestamp: entry.timestamp,
			summaryText,
			fullText,
			toolName: entry.message?.toolName,
			sessionOrder: order++,
			branchRootId,
		});
	}

	return documents;
}

function fuzzyMatch(
	text: string,
	query: string,
	caseSensitive: boolean,
): { matched: boolean; score: number } {
	const t = caseSensitive ? text : text.toLowerCase();
	const q = caseSensitive ? query : query.toLowerCase();

	if (t.includes(q)) {
		return { matched: true, score: 100 };
	}

	let qIdx = 0;
	let score = 0;
	let prevMatchIdx = -1;

	for (let i = 0; i < t.length && qIdx < q.length; i++) {
		if (t[i] === q[qIdx]) {
			score += 10;
			if (prevMatchIdx === i - 1) {
				score += 5; // Consecutive match bonus
			}
			prevMatchIdx = i;
			qIdx++;
		}
	}

	if (qIdx === q.length) {
		return { matched: true, score };
	}

	return { matched: false, score: 0 };
}

/**
 * Execute search over indexed raw entries with ranking and scoping.
 */
export function executeSearch(
	query: string,
	documents: SearchDocument[],
	options: SearchOptions,
	index: TreeIndex,
): SearchResult[] {
	const q = query.trim();
	if (!q) return [];

	const results: SearchResult[] = [];
	const totalDocs = Math.max(1, documents.length);

	// Scope filter: focused subtree only
	let allowedDocIds: Set<string> | null = null;
	if (options.scope === "focused-subtree" && options.focusedBranchId) {
		allowedDocIds = new Set<string>();
		const stack = [options.focusedBranchId];
		while (stack.length) {
			const id = stack.pop();
			if (!id || allowedDocIds.has(id)) continue;
			allowedDocIds.add(id);
			for (const child of index.childrenById.get(id) ?? []) stack.push(child);
		}
	}

	let regex: RegExp | null = null;
	if (options.mode === "regex") {
		try {
			regex = new RegExp(q, options.caseSensitive ? "" : "i");
		} catch {
			// Malformed regex falls back to exact match
			regex = null;
		}
	}

	for (const doc of documents) {
		if (allowedDocIds && !allowedDocIds.has(doc.id)) {
			continue;
		}

		let matched = false;
		let baseScore = 0;
		const matchFragments: string[] = [];

		if (regex) {
			// Regex match
			if (regex.test(doc.fullText) || (doc.label && regex.test(doc.label))) {
				matched = true;
				baseScore = 150;
				matchFragments.push(q);
			}
		} else if (options.mode === "exact") {
			// Exact substring match
			const t = options.caseSensitive
				? doc.fullText
				: doc.fullText.toLowerCase();
			const targetQ = options.caseSensitive ? q : q.toLowerCase();
			if (t.includes(targetQ)) {
				matched = true;
				baseScore = 120;
				matchFragments.push(q);
			}
		} else {
			// Fuzzy mode (default)
			// Check exact label match bonus
			if (doc.label) {
				const labelNorm = options.caseSensitive
					? doc.label
					: doc.label.toLowerCase();
				const qNorm = options.caseSensitive ? q : q.toLowerCase();
				if (labelNorm === qNorm) {
					matched = true;
					baseScore += 500;
					matchFragments.push(doc.label);
				} else if (labelNorm.includes(qNorm)) {
					matched = true;
					baseScore += 300;
					matchFragments.push(doc.label);
				}
			}

			// Check title / summary prefix match
			const summaryNorm = options.caseSensitive
				? doc.summaryText
				: doc.summaryText.toLowerCase();
			const qNorm = options.caseSensitive ? q : q.toLowerCase();
			if (summaryNorm.startsWith(qNorm)) {
				matched = true;
				baseScore += 200;
				matchFragments.push(q);
			}

			// Check full text match
			const fz = fuzzyMatch(doc.fullText, q, options.caseSensitive);
			if (fz.matched) {
				matched = true;
				baseScore += fz.score;
				matchFragments.push(q);
			}
		}

		if (matched) {
			// Recency boost (normalized by session order)
			const recencyBoost = Math.round((doc.sessionOrder / totalDocs) * 30);

			// Focused branch boost
			let focusBoost = 0;
			if (
				options.focusedBranchId &&
				doc.branchRootId === options.focusedBranchId
			) {
				focusBoost = 40;
			}

			const finalScore = baseScore + recencyBoost + focusBoost;

			results.push({
				document: doc,
				score: finalScore,
				matches: matchFragments,
			});
		}
	}

	// Stable sort: highest score first, ties broken by original sessionOrder
	results.sort((a, b) => {
		if (b.score !== a.score) {
			return b.score - a.score;
		}
		return a.document.sessionOrder - b.document.sessionOrder;
	});

	if (results.length > options.maxResults) {
		return results.slice(0, options.maxResults);
	}

	return results;
}
