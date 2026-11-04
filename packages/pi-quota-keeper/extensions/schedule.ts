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
const FIVE_HOURS_MS = 5 * 60 * 60 * 1000;
export function dueActivation(
	snapshot: Snapshot,
	config: ActivationConfig,
	ledger: Ledger,
	now: number,
): { id: string; cycle: string } | undefined {
	if (
		!snapshot.activation.supported ||
		!config.enabledAccounts.includes(snapshot.id)
	)
		return;
	if (
		snapshot.status !== "available" &&
		!(snapshot.activation.bestEffort && config.mode === "fixed")
	)
		return;
	ledger[snapshot.id] ??= {};
	const entry = ledger[snapshot.id];
	if (config.mode === "fixed") {
		entry.anchor ??= now;
		const slot = Math.floor((now - entry.anchor) / FIVE_HOURS_MS);
		if (slot < 1) return;
		const cycle = `fixed:${entry.anchor}:${slot}`;
		return entry.attempted === cycle ? undefined : { id: snapshot.id, cycle };
	}
	const windowId =
		snapshot.activation.windowId ??
		(!snapshot.activation.bestEffort ? "five_hour" : undefined);
	const reset = snapshot.windows.find((w) => w.id === windowId)?.resetAt;
	if (reset === undefined) return;
	if (entry.windowId !== undefined && entry.windowId !== windowId)
		delete entry.resetAt;
	entry.windowId = windowId;
	// A newer live window means normal work has already opened the current session.
	if (entry.resetAt === undefined || reset > entry.resetAt)
		entry.resetAt = reset;
	if (now < entry.resetAt + config.delayMs) return;
	// Keep legacy Claude cycle IDs so upgrading cannot replay its previous attempt.
	const cycle =
		windowId === "five_hour"
			? `reset:${entry.resetAt}`
			: `reset:${windowId}:${entry.resetAt}`;
	return entry.attempted === cycle ? undefined : { id: snapshot.id, cycle };
}
