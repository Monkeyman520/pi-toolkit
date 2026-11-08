// Read-only test command: no provider authentication or model inference.
export default function proxyFixture(pi) {
	pi.registerCommand("proxy-probe", {
		handler: async (_args, ctx) => {
			const proxy = process.env.ACO_TEST_PROXY;
			if (
				proxy !== "http://127.0.0.1:7890" ||
				process.env.HTTPS_PROXY !== proxy
			)
				throw Error("Explicit approved proxy environment missing");
			const started = Date.now();
			const response = await fetch("https://cloudcode-pa.googleapis.com/", {
				method: "HEAD",
			});
			ctx.ui.notify(
				JSON.stringify({
					pid: process.pid,
					runtime: {
						node: process.versions.node,
						bun: process.versions.bun ?? null,
					},
					proxy,
					status: response.status,
					elapsedMs: Date.now() - started,
					inferenceCalls: 0,
				}),
				"info",
			);
		},
	});
}
