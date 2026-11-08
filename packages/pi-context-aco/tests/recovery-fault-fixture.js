// Privileged test-only fault injection, loaded solely in the disposable installed Pi process.
import fs from "node:fs";
import { resolve, sep } from "node:path";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { fileIO } from "./consumer/node_modules/pi-context-aco/extensions/evidence.ts";
import aco from "./consumer/node_modules/pi-context-aco/extensions/index.ts";

export default function faults(pi) {
	aco(pi); // Same Jiti import graph: the installed ACO owns real host hooks; this wrapper only injects faults.
	const root = resolve(process.env.ACO_FAULT_ROOT);
	const originalRead = fileIO.read,
		originalWrite = fileIO.write;
	const originalAppend = SessionManager.prototype.appendContextEdit;
	let mode = "none",
		writes = 0,
		edits = 0,
		release;
	const audit = [];
	const inside = (path) =>
		typeof path === "string" && resolve(path).startsWith(root + sep);
	fileIO.write = async (path, value) => {
		await originalWrite(path, value);
		if (inside(path)) writes++;
	};
	fileIO.read = async (path, bound) => {
		if (inside(path) && mode === "readback" && writes > 0) {
			mode = "none";
			audit.push({ event: "readback-fault", acknowledgedWrites: writes });
			throw Error("CONTROLLED_READBACK_FAILURE");
		}
		if (inside(path) && mode === "hold" && writes > 0) {
			mode = "none";
			audit.push({ event: "held-read", acknowledgedWrites: writes });
			await new Promise((done) => {
				release = done;
			});
		}
		return originalRead(path, bound);
	};
	// Test-only adapter on the host's exported public class, NOT the read-only ctx facade.
	// The real writer sees a real filesystem error on its second edit; original bytes are not rewritten.
	SessionManager.prototype.appendContextEdit = function (...args) {
		const path = this.getSessionFile();
		if (inside(path) && mode === "partial" && ++edits === 2) {
			mode = "none";
			audit.push({ event: "partial-append-fault", acceptedEdits: 1 });
			const backup = path + ".fault-backup";
			fs.renameSync(path, backup);
			fs.mkdirSync(path);
			try {
				return originalAppend.apply(this, args);
			} finally {
				fs.rmdirSync(path);
				fs.renameSync(backup, path);
			}
		}
		return originalAppend.apply(this, args);
	};
	pi.registerCommand("recovery-fault", {
		handler: async (args, ctx) => {
			if (args !== "status") {
				if (!["none", "readback", "hold", "partial"].includes(args))
					throw Error("Unknown fault");
				mode = args;
				writes = 0;
				edits = 0;
				audit.length = 0;
			}
			ctx.ui.notify(JSON.stringify({ mode, audit }), "info");
		},
	});
	pi.registerCommand("recovery-trigger", {
		handler: async () =>
			pi.sendMessage(
				{
					customType: "controlled-recovery-probe",
					content: "custom run while partial",
					display: false,
				},
				{ triggerTurn: true },
			),
	});
	pi.registerCommand("recovery-release", {
		handler: async () => {
			release?.();
			release = undefined;
		},
	});
	pi.registerCommand("recovery-reload", {
		handler: async (_args, ctx) => {
			await ctx.reload();
		},
	});
	pi.on("session_shutdown", () => {
		fileIO.read = originalRead;
		fileIO.write = originalWrite;
		SessionManager.prototype.appendContextEdit = originalAppend;
		release?.();
		release = undefined;
	});
}
