import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { setTimeout as pause } from "node:timers/promises";

/** Test-only client: isolated callers supply cwd, environment and extension paths. */
export function startPi({ cwd, env, extensions, args = [], persist = false }) {
	const events = [];
	let output = "",
		stderr = "",
		failure;
	let id = 0;
	const child = spawn(
		process.env.PI_BINARY ?? "pi",
		[
			"--mode",
			"rpc",
			...(persist ? [] : ["--no-session"]),
			"--no-extensions",
			"--no-mcp",
			"--no-skills",
			"--no-prompt-templates",
			"--no-themes",
			"--no-context-files",
			"--offline",
			...extensions.flatMap((path) => ["-e", path]),
			...args,
		],
		{
			cwd,
			env: { ...process.env, ...env, PI_OFFLINE: "1" },
			stdio: ["pipe", "pipe", "pipe"],
		},
	);
	const closed = new Promise((resolve) =>
		child.once("close", (code, signal) => resolve({ code, signal })),
	);
	child.on("error", (error) => {
		failure = error;
	});
	child.stdin.on("error", (error) => {
		failure = error;
	});
	child.stderr.on("data", (chunk) => {
		stderr += chunk;
	});
	child.stdout.on("data", (chunk) => {
		output += chunk;
		for (;;) {
			const end = output.indexOf("\n");
			if (end < 0) break;
			const line = output.slice(0, end);
			output = output.slice(end + 1);
			try {
				events.push(JSON.parse(line));
			} catch {}
		}
	});
	async function until(predicate, label = "condition", ms = 20000) {
		const deadline = Date.now() + ms;
		while (!predicate()) {
			if (failure) throw failure;
			if (child.exitCode !== null || child.signalCode !== null)
				throw Error(`Pi exited: ${stderr}`);
			if (Date.now() > deadline)
				throw Error(`Timeout: ${label}: ${stderr.slice(-3000)}`);
			await pause(25);
		}
	}
	async function command(type, data = {}) {
		const key = String(++id);
		child.stdin.write(`${JSON.stringify({ id: key, type, ...data })}\n`);
		await until(
			() =>
				events.some((event) => event.type === "response" && event.id === key),
			type,
		);
		const response = events.find(
			(event) => event.type === "response" && event.id === key,
		);
		assert.equal(response.success, true, JSON.stringify(response));
		return response.data;
	}
	async function close() {
		if (child.exitCode !== null || child.signalCode !== null) return;
		child.stdin.end();
		let timer;
		const outcome = await Promise.race([
			closed,
			new Promise((_, reject) => {
				timer = setTimeout(() => reject(Error("Pi shutdown timed out")), 5000);
			}),
		]).finally(() => clearTimeout(timer));
		assert.equal(outcome.code, 0, stderr);
		assert.ok(!stderr.includes("Failed to load extension"), stderr);
	}
	async function dispose() {
		if (child.pid && child.exitCode === null && child.signalCode === null) {
			child.kill("SIGKILL");
			await closed;
		}
	}
	return {
		events,
		command,
		until,
		close,
		dispose,
		get stderr() {
			return stderr;
		},
	};
}
