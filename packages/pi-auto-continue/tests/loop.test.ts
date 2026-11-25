import { describe, expect, it } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AutoContinueConfigManager } from "../extensions/config.ts";
import {
	ContinueController,
	defaults,
	formatCountdown,
	isQuotaOrRateLimitError,
	parseDelayInputMs,
	parsePositiveDurationMs,
	parseQuotaResetTimeMs,
	parseUntilMs,
} from "../extensions/loop.ts";

describe("ContinueController explicit arming and turn lifecycle", () => {
	it("starts disarmed and never schedules continuation on normal completion", () => {
		const ctrl = new ContinueController();
		expect(ctrl.isArmed()).toBe(false);
		expect(ctrl.formatStatus()).toBe("disarmed");

		ctrl.recordAssistantMessage("stop");
		ctrl.settleTurn(false, 1000);
		expect(ctrl.hasPending()).toBe(false);
		expect(ctrl.peekDue(100000, true)).toBeUndefined();

		// Updating global base settings never auto-arms a disarmed session
		ctrl.updateBaseSettings({ delayMs: 500, maxRounds: 5 });
		expect(ctrl.isArmed()).toBe(false);
		ctrl.recordAssistantMessage("stop");
		ctrl.settleTurn(false, 2000);
		expect(ctrl.hasPending()).toBe(false);
	});

	it("schedules bounded continuation after normal completion when explicitly armed", () => {
		const ctrl = new ContinueController({ delayMs: 5000, maxRounds: 2 });
		const armed = ctrl.arm({}, 1000, true);
		expect(armed.ok).toBe(true);
		expect(ctrl.isArmed()).toBe(true);
		// Idle arm with empty queue does not immediately schedule
		expect(ctrl.hasPending()).toBe(false);

		// Round 1 scheduled after normal completion
		ctrl.recordAssistantMessage("stop");
		ctrl.settleTurn(false, 10000);
		expect(ctrl.hasPending()).toBe(true);
		expect(ctrl.formatStatus(10000)).toBe("continuing in 5s (1/2)");
		expect(ctrl.peekDue(14999, true)).toBeUndefined();
		expect(ctrl.peekDue(15000, false)).toBeUndefined();

		const due1 = ctrl.peekDue(15000, true);
		expect(due1?.nextRound).toBe(1);
		expect(due1?.source).toBe("loop");
		const taken1 = ctrl.takeRound(15000, true, due1?.at);
		expect(taken1?.round).toBe(1);
		expect(taken1?.maxRounds).toBe(2);

		// Round 2
		ctrl.recordAssistantMessage("stop");
		ctrl.settleTurn(false, 20000);
		const taken2 = ctrl.takeRound(25000, true);
		expect(taken2?.round).toBe(2);

		// After round 2 completes normally, round limit stops and disarms
		ctrl.recordAssistantMessage("stop");
		ctrl.settleTurn(false, 30000);
		expect(ctrl.isArmed()).toBe(false);
		expect(ctrl.getDiagnostics().lastStopReason).toBe("round limit reached");
	});

	it("resets pending countdown on human input while remaining armed, and disarms on abort", () => {
		const ctrl = new ContinueController({ delayMs: 5000 });
		ctrl.arm({}, 0, true);
		ctrl.recordAssistantMessage("stop");
		ctrl.settleTurn(false, 1000);
		expect(ctrl.hasPending()).toBe(true);

		// Human input cancels pending wait without disarming
		ctrl.userInput();
		expect(ctrl.hasPending()).toBe(false);
		expect(ctrl.isArmed()).toBe(true);

		// Subsequent normal turn resumes waiting
		ctrl.recordAssistantMessage("stop");
		ctrl.settleTurn(false, 2000);
		expect(ctrl.hasPending()).toBe(true);

		// Aborted turn disarms immediately
		ctrl.recordAssistantMessage("aborted");
		ctrl.settleTurn(true, 3000);
		expect(ctrl.isArmed()).toBe(false);
		expect(ctrl.hasPending()).toBe(false);
	});

	it("enforces session duration/until deadline", () => {
		const ctrl = new ContinueController({ delayMs: 5000 });
		expect(ctrl.arm({ deadlineMs: 1000 }, 1000, true).ok).toBe(false);
		expect(ctrl.arm({ deadlineMs: 20000 }, 10000, true).ok).toBe(true);

		// Normal completion at 16000 + 5000 delay = 21000 > deadline 20000 -> disarms
		ctrl.recordAssistantMessage("stop");
		ctrl.settleTurn(false, 16000);
		expect(ctrl.isArmed()).toBe(false);
		expect(ctrl.getDiagnostics().lastStopReason).toBe("wait exceeds deadline");
	});
});

describe("ContinueController FIFO queue, disarm preservation, and empty policy", () => {
	it("supports enqueue, prepend, removeAt, move, takeAt, restoreAt, and clear", () => {
		const ctrl = new ContinueController();
		expect(ctrl.enqueue("   ")).toBeUndefined();
		const a = ctrl.enqueue("Task A", 100);
		const b = ctrl.enqueue("Task B", 200);
		const c = ctrl.prepend("Task 0", 300);
		expect(a?.text).toBe("Task A");
		expect(b?.text).toBe("Task B");
		expect(c?.text).toBe("Task 0");
		expect(ctrl.listQueue().map((item) => item.text)).toEqual([
			"Task 0",
			"Task A",
			"Task B",
		]);

		// Move 3 -> 1
		expect(ctrl.move(3, 1)?.text).toBe("Task B");
		expect(ctrl.listQueue().map((item) => item.text)).toEqual([
			"Task B",
			"Task 0",
			"Task A",
		]);

		// Invalid bounds return undefined
		expect(ctrl.move(0, 1)).toBeUndefined();
		expect(ctrl.removeAt(99)).toBeUndefined();

		// Remove 2 ("Task 0")
		expect(ctrl.removeAt(2)?.text).toBe("Task 0");
		expect(ctrl.listQueue().map((item) => item.text)).toEqual([
			"Task B",
			"Task A",
		]);

		// Take and rollback restore
		const taken = ctrl.takeAt(1);
		expect(taken?.text).toBe("Task B");
		expect(ctrl.queueLength()).toBe(1);
		if (taken) ctrl.restoreAt(0, taken);
		expect(ctrl.listQueue().map((item) => item.text)).toEqual([
			"Task B",
			"Task A",
		]);

		expect(ctrl.clearQueue()).toBe(2);
		expect(ctrl.queueLength()).toBe(0);
	});

	it("preserves queued items across disarm and honors queueEmptyPolicy stop vs continue", () => {
		const ctrl = new ContinueController({
			delayMs: 1000,
			queueEmptyPolicy: "stop",
		});
		ctrl.enqueue("Step 1");
		ctrl.enqueue("Step 2");

		// Arming while idle with non-empty queue schedules item 1 immediately
		ctrl.arm({}, 1000, true);
		expect(ctrl.hasPending()).toBe(true);
		expect(ctrl.formatStatus(1000)).toBe("next queue item in 1s (q:2)");

		const r1 = ctrl.takeRound(2000, true);
		expect(r1?.source).toBe("queue");
		expect(r1?.queueItem?.text).toBe("Step 1");
		expect(ctrl.queueLength()).toBe(1);

		// Disarm preserves Step 2
		ctrl.disarm("stopped by user");
		expect(ctrl.isArmed()).toBe(false);
		expect(ctrl.queueLength()).toBe(1);
		expect(ctrl.peekQueueHead()?.text).toBe("Step 2");

		// Re-arm idle drains Step 2
		ctrl.arm({}, 3000, true);
		const r2 = ctrl.takeRound(4000, true);
		expect(r2?.queueItem?.text).toBe("Step 2");
		expect(ctrl.queueLength()).toBe(0);

		// When Step 2 completes normally, queueEmptyPolicy="stop" disarms cleanly
		ctrl.recordAssistantMessage("stop");
		ctrl.settleTurn(false, 5000);
		expect(ctrl.isArmed()).toBe(false);
		expect(ctrl.getDiagnostics().lastStopReason).toBe("queue completed");

		// Now test queueEmptyPolicy="continue" falling through to loop mode
		ctrl.enqueue("Only queued item");
		ctrl.arm({ queueEmptyPolicy: "continue" }, 6000, true);
		const r3 = ctrl.takeRound(7000, true);
		expect(r3?.source).toBe("queue");
		expect(ctrl.queueLength()).toBe(0);

		ctrl.recordAssistantMessage("stop");
		ctrl.settleTurn(false, 8000);
		expect(ctrl.isArmed()).toBe(true);
		const r4 = ctrl.takeRound(9000, true);
		expect(r4?.source).toBe("loop");
		expect(r4?.queueItem).toBeUndefined();
	});

	it("clears queue on resetSession and rolls back failed dispatches", () => {
		const ctrl = new ContinueController({ delayMs: 500 });
		ctrl.enqueue("Must not drop");
		ctrl.arm({}, 1000, true);
		const r1 = ctrl.takeRound(1500, true);
		expect(ctrl.queueLength()).toBe(0);

		ctrl.rollbackFailedDispatch(r1?.queueItem, "send failed");
		expect(ctrl.isArmed()).toBe(false);
		expect(ctrl.queueLength()).toBe(1);
		expect(ctrl.peekQueueHead()?.text).toBe("Must not drop");
		expect(ctrl.getRounds()).toBe(0);

		ctrl.resetSession();
		expect(ctrl.queueLength()).toBe(0);
	});
});

describe("Quota reset parsing and onError policies", () => {
	it("parses Retry-After, Anthropic unified headers, x-ratelimit-reset*, and structured fields", () => {
		const now = 1_700_000_000_000;
		expect(parseQuotaResetTimeMs({ "Retry-After": "12" }, "", now)).toBe(
			now + 12000,
		);
		expect(
			parseQuotaResetTimeMs(
				{ "anthropic-ratelimit-unified-5h-reset": "1700000100" },
				"",
				now,
			),
		).toBe(1_700_000_100_000);
		expect(
			parseQuotaResetTimeMs({ "x-ratelimit-reset-requests": "1m30s" }, "", now),
		).toBe(now + 90000);
		expect(
			parseQuotaResetTimeMs({ "x-ratelimit-reset-tokens": "500ms" }, "", now),
		).toBe(now + 500);
		expect(
			parseQuotaResetTimeMs(
				{},
				'quota exhausted {"resets_at": "2026-11-26T00:00:00Z"}',
				now,
			),
		).toBe(Date.parse("2026-11-26T00:00:00Z"));
		expect(parseQuotaResetTimeMs({}, "quota exceeded", now)).toBeUndefined();
		expect(isQuotaOrRateLimitError("HTTP 429 rate limit", 429)).toBe(true);
		expect(isQuotaOrRateLimitError("invalid api key", 401)).toBe(false);
		expect(isQuotaOrRateLimitError("context length exceeded", 400)).toBe(false);
	});

	it("handles onError defer, wait-quota, and stop accurately", () => {
		const now = 10_000;
		// 1. defer (default): stays armed, does not schedule, preserves queue
		const deferCtrl = new ContinueController({
			delayMs: 500,
			onError: "defer",
		});
		deferCtrl.enqueue("Next task");
		deferCtrl.arm({}, now, false);
		deferCtrl.recordProviderResponse({ "retry-after": "5" }, 429);
		deferCtrl.recordAssistantMessage("error", "rate limit exceeded");
		deferCtrl.settleTurn(false, now);
		expect(deferCtrl.isArmed()).toBe(true);
		expect(deferCtrl.hasPending()).toBe(false);
		expect(deferCtrl.queueLength()).toBe(1);

		// Once recovery finishes normally, continuation resumes cleanly
		deferCtrl.recordAssistantMessage("stop");
		deferCtrl.settleTurn(false, now + 6000);
		expect(deferCtrl.hasPending()).toBe(true);

		// 2. wait-quota: schedules queued item at resetTime + quotaDelayMs
		const waitCtrl = new ContinueController({
			delayMs: 15000,
			onError: "wait-quota",
			quotaWait: true,
			quotaDelayMs: 500,
		});
		waitCtrl.enqueue("After quota");
		waitCtrl.arm({}, now, false);
		waitCtrl.recordProviderResponse({ "retry-after": "2" }, 429);
		waitCtrl.recordAssistantMessage("error", "quota exhausted");
		waitCtrl.settleTurn(false, now);
		expect(waitCtrl.hasPending()).toBe(true);
		expect(waitCtrl.getDiagnostics(now).pendingAt).toBe(now + 2500);
		expect(waitCtrl.formatStatus(now)).toBe("quota wait 3s (q:1)");

		// wait-quota without reset time pauses without guessing
		const noResetCtrl = new ContinueController({
			onError: "wait-quota",
			quotaWait: true,
		});
		noResetCtrl.enqueue("Waiting");
		noResetCtrl.arm({}, now, false);
		noResetCtrl.recordProviderResponse({}, 429);
		noResetCtrl.recordAssistantMessage("error", "subscription quota exceeded");
		noResetCtrl.settleTurn(false, now);
		expect(noResetCtrl.hasPending()).toBe(false);
		expect(noResetCtrl.getDiagnostics(now).status).toBe(
			"quota: reset time unavailable (q:1)",
		);

		// 3. stop: disarms immediately while preserving queue
		const stopCtrl = new ContinueController({ onError: "stop" });
		stopCtrl.enqueue("Keep me");
		stopCtrl.arm({}, now, false);
		stopCtrl.recordAssistantMessage("error", "upstream 500");
		stopCtrl.settleTurn(false, now);
		expect(stopCtrl.isArmed()).toBe(false);
		expect(stopCtrl.queueLength()).toBe(1);
		expect(stopCtrl.getDiagnostics().lastStopReason).toBe("stopped on error");
	});

	it("honors already-observed quota reset floor when arming idle with queued items", () => {
		const now = 50_000;
		const ctrl = new ContinueController({
			delayMs: 500,
			quotaWait: true,
			quotaDelayMs: 1000,
		});
		// Quota hit while disarmed
		ctrl.recordProviderResponse({ "retry-after": "10" }, 429);
		ctrl.recordAssistantMessage("error", "quota exceeded");
		ctrl.settleTurn(false, now);

		// User queues a task and arms while idle
		ctrl.enqueue("Post-quota task");
		ctrl.arm({}, now + 1000, true);
		expect(ctrl.getDiagnostics(now + 1000).pendingAt).toBe(now + 11000);
		expect(ctrl.getDiagnostics(now + 1000).waitingForQuota).toBe(true);
	});
});

describe("Time parsing and AutoContinueConfigManager fail-closed behavior", () => {
	it("parses delays, durations, until timestamps, and formats countdowns", () => {
		expect(parseDelayInputMs("500")).toBe(500);
		expect(parseDelayInputMs("15s")).toBe(15000);
		expect(parsePositiveDurationMs("1h30m")).toBe(5400000);
		expect(parsePositiveDurationMs("0s")).toBeUndefined();
		expect(parseUntilMs("2026-11-26 08:30:00")).toBeGreaterThan(0);
		expect(parseUntilMs("2026-02-31 08:00:00")).toBeUndefined();
		expect(formatCountdown(500)).toBe("1s");
		expect(formatCountdown(125000)).toBe("2m 05s");
		expect(formatCountdown(7260000)).toBe("2h 01m");
	});

	it("validates settings and fails closed on unknown or invalid fields", async () => {
		const dir = await mkdtemp(join(tmpdir(), "pi-auto-continue-cfg-"));
		try {
			const cfgPath = join(dir, "pi-auto-continue.json");
			const manager = new AutoContinueConfigManager(cfgPath);

			// Missing file loads defaults cleanly
			const initial = await manager.reloadIfChanged(true);
			expect(initial.error).toBeUndefined();
			expect(initial.settings).toEqual(defaults);

			// Valid partial config merges with defaults
			await writeFile(
				cfgPath,
				JSON.stringify({
					delayMs: 3000,
					onError: "wait-quota",
					queueEmptyPolicy: "continue",
				}),
				"utf8",
			);
			const valid = await manager.reloadIfChanged(true);
			expect(valid.error).toBeUndefined();
			expect(valid.settings.delayMs).toBe(3000);
			expect(valid.settings.onError).toBe("wait-quota");
			expect(valid.settings.queueEmptyPolicy).toBe("continue");

			// Unknown field fails closed
			await writeFile(cfgPath, JSON.stringify({ unknownField: true }), "utf8");
			const invalid = await manager.reloadIfChanged(true);
			expect(invalid.error).toBeDefined();
			expect(manager.error).toBeDefined();

			// setOption validates bounds and persists valid values
			await writeFile(cfgPath, JSON.stringify({}), "utf8");
			await manager.reloadIfChanged(true);
			expect((await manager.setOption("delayMs", "50", false)).ok).toBe(false);
			expect((await manager.setOption("onError", "bogus", false)).ok).toBe(
				false,
			);
			const okSet = await manager.setOption("maxRounds", "25", true);
			expect(okSet.ok).toBe(true);
			expect(manager.settings.maxRounds).toBe(25);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});
});
