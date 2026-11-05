import {
	mkdirSync,
	readFileSync,
	renameSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { resolve, sep } from "node:path";
import { Type } from "typebox";
export default function fixture(pi) {
	let blockedFile;
	const probe = (ctx) => {
		if (!process.env.ACO_PROBE) return;
		writeFileSync(
			process.env.ACO_PROBE,
			JSON.stringify({
				branch: ctx.sessionManager.getBranch(),
				sourceIds: ctx.sessionManager
					.buildSessionProjection()
					.entries.filter((e) => e.messages.length)
					.map((e) => e.sourceEntry.id),
			}),
		);
	};
	pi.on("agent_settled", (_event, ctx) => probe(ctx));
	pi.on("session_compact", (_event, ctx) => probe(ctx));
	pi.registerCommand("v3-probe", { handler: async (_args, ctx) => probe(ctx) });
	pi.on("session_compact_failed", (_event, ctx) => {
		if (blockedFile) {
			rmSync(blockedFile, { recursive: true });
			renameSync(`${blockedFile}.fault-backup`, blockedFile);
			blockedFile = undefined;
		}
		probe(ctx);
	});
	pi.registerTool({
		name: "v3_research",
		label: "Controlled research",
		description: "Test-only repeated exact evidence",
		parameters: Type.Object({ path: Type.Optional(Type.String()) }),
		async execute() {
			return {
				content: [
					{
						type: "text",
						text: "Decision: use API v2; rationale: compatibility; constraint: preserve exact 0xDEADBEEF\n".repeat(
							1000,
						),
					},
				],
				details: { exact: "0xDEADBEEF", source: "controlled fixture" },
			};
		},
	});
	pi.on("session_before_compact", (event, ctx) => {
		if (!event.customInstructions?.startsWith("aco-native:")) return;
		let fault;
		try {
			fault = readFileSync(process.env.ACO_FAULT, "utf8").trim();
		} catch {
			return;
		}
		if (fault === "write-fail") {
			const path = resolve(ctx.sessionManager.getSessionFile());
			if (!path.startsWith(resolve(process.env.ACO_FAULT_ROOT) + sep))
				throw Error("Fault injection outside disposable root refused");
			renameSync(path, `${path}.fault-backup`);
			mkdirSync(path);
			blockedFile = path;
		}
		if (fault === "cancel") return { cancel: true };
		if (fault === "interfere")
			return {
				compaction: {
					summary: "FOREIGN_OVERRIDE",
					firstKeptEntryId: event.preparation.firstKeptEntryId,
					tokensBefore: event.preparation.tokensBefore,
				},
			};
	});
}
