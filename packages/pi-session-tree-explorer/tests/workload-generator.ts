import type { SessionEntry } from "../extensions/types.ts";

export interface WorkloadOptions {
	size: number;
	topology: "linear" | "wide" | "deep" | "mixed";
}

export function generateWorkload(options: WorkloadOptions): SessionEntry[] {
	const { size, topology } = options;
	const entries: SessionEntry[] = [];

	if (size <= 0) return entries;

	// Root entry
	entries.push({
		type: "message",
		id: "entry_0",
		parentId: null,
		timestamp: new Date(1730000000000).toISOString(),
		message: {
			role: "system",
			content:
				"System prompt preamble with tools and instructions for benchmark evaluation.",
		},
	});

	if (topology === "linear") {
		for (let i = 1; i < size; i++) {
			const isUser = i % 2 === 1;
			entries.push({
				type: "message",
				id: `entry_${i}`,
				parentId: `entry_${i - 1}`,
				timestamp: new Date(1730000000000 + i * 1000).toISOString(),
				message: {
					role: isUser ? "user" : "assistant",
					content: isUser
						? `User turn prompt number ${i} discussing architecture and benchmarks.`
						: `Assistant response number ${i} detailing implementation steps and code.`,
				},
			});
		}
		return entries;
	}

	if (topology === "wide") {
		// Single fork at entry 1 into many sibling branches
		entries.push({
			type: "message",
			id: "entry_1",
			parentId: "entry_0",
			timestamp: new Date(1730000001000).toISOString(),
			message: { role: "user", content: "Wide fork root" },
		});

		for (let i = 2; i < size; i++) {
			entries.push({
				type: "message",
				id: `entry_${i}`,
				parentId: "entry_1", // All children of entry_1
				timestamp: new Date(1730000000000 + i * 1000).toISOString(),
				message: {
					role: "assistant",
					content: `Sibling branch answer variant number ${i}.`,
				},
			});
		}
		return entries;
	}

	if (topology === "deep") {
		// Deep branching with frequent forks
		let currentParent = "entry_0";
		for (let i = 1; i < size; i++) {
			const id = `entry_${i}`;
			entries.push({
				type: "message",
				id,
				parentId: currentParent,
				timestamp: new Date(1730000000000 + i * 1000).toISOString(),
				message: {
					role: i % 2 === 1 ? "user" : "assistant",
					content: `Deep node ${i}`,
				},
			});
			// Branch every 3 entries
			if (i % 3 !== 0) {
				currentParent = id;
			}
		}
		return entries;
	}

	// Mixed topology (realistic conversation with compactions, tool results, model changes, branches)
	let currentParent = "entry_0";
	for (let i = 1; i < size; i++) {
		const id = `entry_${i}`;
		const time = new Date(1730000000000 + i * 1000).toISOString();

		if (i % 500 === 0) {
			// Periodic compaction
			entries.push({
				type: "compaction",
				id,
				parentId: currentParent,
				timestamp: time,
				summary: `Compaction summary checkpoint at turn ${i}.`,
				firstKeptEntryId: `entry_${Math.max(0, i - 100)}`,
			});
			currentParent = id;
		} else if (i % 200 === 0) {
			// Model change
			entries.push({
				type: "model_change",
				id,
				parentId: currentParent,
				timestamp: time,
				provider: "openai",
				modelId: "gpt-4o",
			});
			currentParent = id;
		} else if (i % 10 === 0) {
			// Tool result
			entries.push({
				type: "message",
				id,
				parentId: currentParent,
				timestamp: time,
				message: {
					role: "toolResult",
					toolName: "bash",
					toolCallId: `call_${i}`,
					content: `Execution output for command ${i}.`,
				},
			});
			currentParent = id;
		} else {
			// Alternating user / assistant messages with occasional forks
			const isUser = i % 2 === 1;
			entries.push({
				type: "message",
				id,
				parentId: currentParent,
				timestamp: time,
				label: i % 50 === 0 ? `checkpoint_${i}` : undefined,
				message: {
					role: isUser ? "user" : "assistant",
					content: isUser
						? `User query ${i}: describe system performance and benchmarks.`
						: `Assistant reply ${i}: system analysis and code implementation.`,
				},
			});

			// Fork branch occasionally
			if (i % 8 === 0) {
				// Don't advance parent, creates a fork
			} else {
				currentParent = id;
			}
		}
	}

	return entries;
}
