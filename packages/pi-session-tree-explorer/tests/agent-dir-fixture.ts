let snapshot: { previous: string | undefined } | undefined;

export function setAgentDir(directory: string) {
	snapshot ??= { previous: process.env.PI_CODING_AGENT_DIR };
	process.env.PI_CODING_AGENT_DIR = directory;
}

export function restoreAgentDir() {
	if (!snapshot) return;
	if (snapshot.previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
	else process.env.PI_CODING_AGENT_DIR = snapshot.previous;
	snapshot = undefined;
}
