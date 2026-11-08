// Controlled co-loaded extension. Copied under two names to give each peer its own ownership.
import { appendFileSync } from "node:fs";
import { basename } from "node:path";
import { fileURLToPath } from "node:url";

export default function peer(pi) {
	const name = basename(fileURLToPath(import.meta.url), ".js");
	let hits = 0;
	const channel = "t0008:" + name;
	const offPing = pi.events.on(channel, () => hits++);
	const offDiscover = pi.events.on("pi-packages:ui:discover", (payload) =>
		payload.register({
			id: name,
			title: name,
			command: "/" + name,
			getSummary: () => "controlled peer",
			open: async (ctx) => ctx.ui.notify(name + " alive", "info"),
		}),
	);
	pi.on("context", (event) => ({
		messages: [
			{ role: "user", content: "CONTEXT:" + name, timestamp: 1 },
			...event.messages,
		],
	}));
	pi.on("turn_end", (event) => ({
		entries: [
			...event.entries,
			{
				type: "custom",
				customType: "t0008-peer",
				data: {
					name,
					sawEdit: event.entries.some((e) => e.type === "context_edit"),
				},
			},
		],
	}));
	pi.registerCommand(name, {
		handler: async (args, ctx) => {
			if (args === "reload") {
				await ctx.reload();
				return;
			}
			const panels = [];
			pi.events.emit(channel);
			pi.events.emit("pi-packages:ui:discover", {
				register: (panel) => panels.push(panel.id),
			});
			ctx.ui.notify(JSON.stringify({ name, hits, panels }), "info");
		},
	});
	pi.on("session_start", (event) => {
		appendFileSync(
			process.env.ACO_PEER_LOG,
			JSON.stringify({ name, event: "start", reason: event.reason }) + "\n",
		);
	});
	pi.on("session_shutdown", (event) => {
		const before = hits;
		pi.events.emit(channel);
		appendFileSync(
			process.env.ACO_PEER_LOG,
			JSON.stringify({
				name,
				event: "shutdown",
				reason: event.reason,
				ownListenerAlive: hits === before + 1,
			}) + "\n",
		);
		offPing();
		offDiscover();
	});
}
