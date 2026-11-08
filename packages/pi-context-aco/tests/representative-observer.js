// Read-only checkpoint evidence; this command is not an LLM tool.
export default function observer(pi) {
	pi.registerCommand("evaluation-snapshot", {
		handler: async (_args, ctx) =>
			ctx.ui.notify(
				JSON.stringify({
					sessionId: ctx.sessionManager.getSessionId(),
					sessionFile: ctx.sessionManager.getSessionFile(),
					branch: ctx.sessionManager.getBranch(),
					projection: ctx.sessionManager.buildSessionProjection().messages,
				}),
				"info",
			),
	});
}
