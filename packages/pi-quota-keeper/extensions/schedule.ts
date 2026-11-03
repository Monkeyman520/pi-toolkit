import type { Snapshot } from "./providers.ts";
export interface ActivationConfig {
	mode: "reset" | "fixed";
	delayMs: number;
	enabledAccounts: string[];
}
export interface Entry {
	resetAt?: number;
	windowId?: string;
	anchor?: number;
	attempted?: string;
	outcome?: string;
}
export type Ledger = Record<string, Entry>;
const interval = 5 * 60 * 60 * 1000;
export function dueActivation(
	s: Snapshot,
	c: ActivationConfig,
	ledger: Ledger,
	now: number,
): { id: string; cycle: string } | undefined {
	if (!s.activation.supported || !c.enabledAccounts.includes(s.id)) return;
	if (
		s.status !== "available" &&
		!(s.activation.bestEffort && c.mode === "fixed")
	)
		return;
	ledger[s.id] ??= {};
	const entry = ledger[s.id];
	if (c.mode === "fixed") {
		entry.anchor ??= now;
		const slot = Math.floor((now - entry.anchor) / interval);
		if (slot < 1) return;
		const cycle = `fixed:${entry.anchor}:${slot}`;
		return entry.attempted === cycle ? undefined : { id: s.id, cycle };
	}
	const windowId =
		s.activation.windowId ??
		(!s.activation.bestEffort ? "five_hour" : undefined);
	const reset = s.windows.find((w) => w.id === windowId)?.resetAt;
	if (reset === undefined) return;
	if (entry.windowId !== undefined && entry.windowId !== windowId)
		delete entry.resetAt;
	entry.windowId = windowId;
	// A newer live window means normal work has already opened the current session.
	if (entry.resetAt === undefined || reset > entry.resetAt)
		entry.resetAt = reset;
	if (now < entry.resetAt + c.delayMs) return;
	// Keep legacy Claude cycle IDs so upgrading cannot replay its previous attempt.
	const cycle =
		windowId === "five_hour"
			? `reset:${entry.resetAt}`
			: `reset:${windowId}:${entry.resetAt}`;
	return entry.attempted === cycle ? undefined : { id: s.id, cycle };
}
