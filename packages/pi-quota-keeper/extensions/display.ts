import type { Snapshot } from "./providers.ts";
import type { ActivationConfig, Ledger } from "./schedule.ts";

interface View {
	snapshots: readonly Snapshot[];
	ledger: Readonly<Ledger>;
	schedule: ActivationConfig;
	owner: boolean;
	problem?: string;
	detailed?: boolean;
	now?: number;
}
const providers = new Map([
	["openai", "OpenAI"],
	["openai-codex", "OpenAI Codex"],
	["anthropic", "Claude"],
	["antigravity", "Google Antigravity"],
	["google-antigravity", "Google Antigravity"],
	["github-copilot", "GitHub Copilot"],
	["xai", "Grok"],
]);
const windows = new Map([
	["primary_window", "Primary"],
	["secondary_window", "Secondary"],
	["five_hour", "5-hour"],
	["seven_day", "Weekly"],
	["seven_day_sonnet", "Weekly Sonnet"],
	["seven_day_opus", "Weekly Opus"],
	["premium_interactions", "Premium requests"],
]);
function clean(text: string): string {
	return text
		.replace(/\p{Cc}/gu, " ")
		.replace(/\s+/g, " ")
		.trim();
}
function duration(ms: number): string {
	const seconds = Math.max(0, Math.ceil(ms / 1000));
	if (seconds < 60) return `${seconds}s`;
	let minutes = Math.floor(seconds / 60);
	const days = Math.floor(minutes / 1440);
	minutes %= 1440;
	const hours = Math.floor(minutes / 60);
	minutes %= 60;
	return [
		days ? `${days}d` : "",
		hours ? `${hours}h` : "",
		minutes ? `${minutes}m` : "",
	]
		.filter(Boolean)
		.join(" ");
}
function validTime(value: number | undefined): value is number {
	return (
		value !== undefined &&
		Number.isFinite(value) &&
		value >= 0 &&
		value <= 8.64e15
	);
}
function utc(value: number): string {
	return validTime(value) ? new Date(value).toISOString() : "unknown";
}
function title(s: Snapshot): string {
	const name = providers.get(s.provider) ?? clean(s.provider);
	const label = clean(s.label);
	if (!label || label === s.provider || label === name) return name;
	if (label.startsWith(`${s.provider} `))
		return name + label.slice(s.provider.length);
	return `${name} · ${label}`;
}
function failure(s: Snapshot, detailed: boolean): string {
	const reason = clean(s.reason ?? "Quota information unavailable.");
	const login = `/login ${clean(s.provider)}`;
	const http = /^HTTP (\d{3})$/.exec(reason);
	if (http) {
		const labels: Record<string, string> = {
			"401": "Authentication rejected",
			"403": "Access denied",
			"404": "Quota endpoint unavailable",
			"429": "Rate limited",
		};
		return `${labels[http[1]] ?? "Request rejected"} (HTTP ${http[1]}).${http[1] === "401" ? ` Try ${login}.` : ""}`;
	}
	if (detailed) return reason;
	if (reason.startsWith("Linked Pi Antigravity account token expired"))
		return "Saved token expired. Refresh this account using pi-antigravity.";
	if (reason.startsWith("Quota request failed")) {
		const hint =
			s.provider === "antigravity" || s.provider === "google-antigravity"
				? " Try /antigravity.doctor."
				: "";
		return `Request failed (network, access, timeout, or response format).${hint}`;
	}
	if (
		reason.startsWith("Pi credential resolution failed") ||
		reason.startsWith("No usable Pi OAuth token")
	)
		return `Pi OAuth credentials unavailable. Try ${login}.`;
	if (reason.startsWith("Subscription quota endpoint not qualified"))
		return "Quota query unavailable: no verified endpoint.";
	return reason;
}

function resetExpiryLines(
	credits: Snapshot["resetCredits"],
	now: number,
): string[] {
	if (credits?.availableCount === 0) return ["    Expiry: no available resets"];
	if (credits?.detailsUnavailable)
		return [`    Expiry: unavailable (${clean(credits.detailsUnavailable)})`];
	if (!credits?.expirations?.length)
		return ["    Expiry: unknown (not reported)"];
	const groups = new Map<number | undefined, number>();
	for (const credit of credits.expirations) {
		const expiry = validTime(credit.expiresAt) ? credit.expiresAt : undefined;
		groups.set(expiry, (groups.get(expiry) ?? 0) + 1);
	}
	const missing = credits.availableCount - credits.expirations.length;
	if (missing > 0)
		groups.set(undefined, (groups.get(undefined) ?? 0) + missing);
	const lines: string[] = [];
	for (const [expiry, count] of [...groups].sort(
		(a, b) => (a[0] ?? Infinity) - (b[0] ?? Infinity),
	)) {
		const unit = count === 1 ? "reset" : "resets";
		if (expiry === undefined)
			lines.push(`    ${count} ${unit}: expiry unknown`);
		else if (expiry <= now)
			lines.push(
				`    ${count} ${unit} expired ${utc(expiry)} (${duration(now - expiry)} ago)`,
			);
		else
			lines.push(
				`    ${count} ${unit} expire${count === 1 ? "s" : ""} ${utc(expiry)} (in ${duration(expiry - now)})`,
			);
	}
	if (missing < 0)
		lines.push(
			`    Listed expiry entries: ${credits.expirations.length}; reported available: ${credits.availableCount}.`,
		);
	return lines;
}
function percentage(value: number | undefined): string {
	if (
		value === undefined ||
		!Number.isFinite(value) ||
		value < 0 ||
		value > 100
	)
		return "[??????????] unknown";
	const filled = Math.round(value / 10);
	return `[${"#".repeat(filled)}${"-".repeat(10 - filled)}] ${Math.round(value * 10) / 10}%`;
}

export function formatQuotaView(view: View): string[] {
	const now = view.now ?? Date.now(),
		detailed = view.detailed ?? false;
	const available = view.snapshots.filter(
		(s) => s.status === "available",
	).length;
	const delay =
		view.schedule.delayMs < 1000
			? `${view.schedule.delayMs}ms`
			: duration(view.schedule.delayMs);
	const lines = [
		`Quota Keeper · ${view.snapshots.length} accounts · ${available} available · ${view.snapshots.length - available} unavailable`,
		`${view.owner ? "Owner" : "Follower"} · ${view.schedule.mode === "reset" ? `reset +${delay}` : "every 5h"}`,
	];
	if (view.problem) lines.push(`Maintenance: ${clean(view.problem)}`);
	if (!view.snapshots.length)
		lines.push(
			"",
			"No cached Pi accounts. Wait for the owner to poll, or log in using Pi.",
		);
	const ordered = [...view.snapshots].sort(
		(a, b) =>
			Number(b.status === "available") - Number(a.status === "available"),
	);
	for (const s of ordered) {
		lines.push(
			"",
			`${s.status === "available" ? "✓" : "!"} ${title(s)}${s.status === "unavailable" ? " · Unavailable" : ""}`,
		);
		if (detailed)
			lines.push(`  ID: ${clean(s.id)}`, `  Checked: ${utc(s.fetchedAt)}`);
		if (s.status === "unavailable") lines.push(`  ${failure(s, detailed)}`);
		else {
			if (s.provider === "openai" || s.provider === "openai-codex") {
				lines.push(
					`  Rate-limit resets: ${s.resetCredits === undefined ? "unknown (not reported)" : `${s.resetCredits.availableCount} available`}`,
				);
				if (detailed) lines.push(...resetExpiryLines(s.resetCredits, now));
			}
			const visible = detailed ? s.windows : s.windows.slice(0, 6);
			for (const w of visible) {
				const name = clean(windows.get(w.id) ?? w.id);
				const label =
					!detailed && name.length > 24 ? `${name.slice(0, 23)}…` : name;
				const reset = !validTime(w.resetAt)
					? "reset unknown"
					: w.resetAt <= now
						? "reset due"
						: `resets in ${duration(w.resetAt - now)}`;
				lines.push(
					`  ${label.padEnd(10)} ${percentage(w.remainingPercent)} · ${reset}${w.shared ? " · shared pool" : ""}`,
				);
				if (detailed)
					lines.push(
						`    Reset: ${w.resetAt === undefined ? "unknown" : utc(w.resetAt)}`,
					);
			}
			if (visible.length < s.windows.length)
				lines.push(
					`  … ${s.windows.length - visible.length} more limits; /quota details`,
				);
			const activation = !s.activation.supported
				? "unsupported"
				: view.schedule.enabledAccounts.includes(s.id)
					? "enabled"
					: "off (not opted in)";
			if (!s.activation.bestEffort) {
				lines.push(`  Activation: ${activation}`);
				if (detailed) lines.push(`    ${clean(s.activation.reason)}`);
			}
		}

		if (s.activation.bestEffort) {
			const status = view.schedule.enabledAccounts.includes(s.id)
				? "enabled"
				: "off (not opted in)";
			lines.push(`  Wake-up: ${status} (best-effort)`);
			if (view.schedule.mode === "reset")
				lines.push(
					s.activation.windowId
						? `    Reset window: ${clean(s.activation.windowId)}`
						: "    Paused: reset window unknown; select a resetWindows ID or explicitly use fixed mode.",
				);
			lines.push(
				"    Window opening is not guaranteed; requests may consume quota or credits.",
			);
			if (detailed) lines.push(`    ${clean(s.activation.reason)}`);
		}
		const outcome = view.ledger[s.id]?.outcome;
		if (outcome)
			lines.push(
				`  ${s.activation.bestEffort ? "Last wake-up" : "Last activation"}: ${clean(outcome)}`,
			);
	}
	const checked = view.snapshots.map((s) => s.fetchedAt).filter(validTime);
	if (checked.length)
		lines.push(
			"",
			`Latest check ${duration(Math.max(0, now - Math.max(...checked)))} ago`,
		);
	if (!detailed)
		lines.push(
			"/quota details: account IDs, exact UTC times, and full diagnostics.",
		);
	return lines.length > 200
		? [...lines.slice(0, 199), "[Display truncated to 200 lines.]"]
		: lines;
}

export function formatQuotaList(snapshots: readonly Snapshot[]): string[] {
	if (!snapshots.length)
		return ["No cached Pi accounts. Use /quota refresh or log in using Pi."];
	const rows = snapshots.slice(0, 196).map((s) => {
		const label = clean(s.label);
		const account =
			label === s.provider
				? "(label unavailable)"
				: label.startsWith(`${s.provider} `)
					? label.slice(s.provider.length + 1)
					: label;
		const auth =
			s.credentialType === "oauth"
				? "OAuth"
				: s.credentialType === "api_key"
					? "API key"
					: "unknown";
		return {
			id: clean(s.id),
			account: account.slice(0, 48),
			type: `${providers.get(s.provider) ?? clean(s.provider)} / ${auth}`,
		};
	});
	const idWidth = rows.reduce((n, row) => Math.max(n, row.id.length), 2);
	const accountWidth = rows.reduce(
		(n, row) => Math.max(n, row.account.length),
		7,
	);
	const lines = [
		`Pi accounts · ${snapshots.length}`,
		`${"ID".padEnd(idWidth)} | ${"Account".padEnd(accountWidth)} | Type`,
		...rows.map(
			(row) =>
				`${row.id.padEnd(idWidth)} | ${row.account.padEnd(accountWidth)} | ${row.type}`,
		),
		"/quota <account-id> [details]",
	];
	if (rows.length < snapshots.length)
		lines.push("[Account list truncated to 196 entries.]");
	return lines;
}
