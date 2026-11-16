import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
export default function (pi: ExtensionAPI) {
	pi.on("before_agent_start", (event) => ({
		systemPrompt: `${event.systemPrompt}\npeer-after`,
	}));
	pi.on("before_provider_request", (event) => {
		const payload = event.payload as {
			request: { systemInstruction: { parts: Array<{ text?: string }> } };
		};
		if (!payload?.request?.systemInstruction?.parts) return;
		return {
			...payload,
			request: {
				...payload.request,
				systemInstruction: {
					...payload.request.systemInstruction,
					parts: payload.request.systemInstruction.parts.map((part) =>
						typeof part.text === "string"
							? { ...part, text: `${part.text}\nrequest-peer-after` }
							: part,
					),
				},
			},
		};
	});
}
