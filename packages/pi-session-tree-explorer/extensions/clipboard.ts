import { spawnSync } from "node:child_process";

export interface ClipboardResult {
	success: boolean;
	error?: string;
}

let customWriter: ((text: string) => ClipboardResult) | null = null;

export function setClipboardWriter(
	writer: ((text: string) => ClipboardResult) | null,
): void {
	customWriter = writer;
}

export function copyToClipboard(text: string): ClipboardResult {
	if (customWriter) {
		return customWriter(text);
	}

	if (!text) {
		return { success: true };
	}

	try {
		if (process.platform === "win32") {
			const res = spawnSync("clip.exe", [], {
				input: text,
				encoding: "utf8",
				windowsHide: true,
				timeout: 1000,
			});
			if (res.status === 0) {
				return { success: true };
			}
			return {
				success: false,
				error: res.error
					? res.error.message
					: `clip exited with status ${res.status}`,
			};
		}

		if (process.platform === "darwin") {
			const res = spawnSync("pbcopy", [], {
				input: text,
				encoding: "utf8",
				timeout: 1000,
			});
			if (res.status === 0) return { success: true };
			return { success: false, error: res.error?.message };
		}

		if (process.platform === "linux") {
			const res = spawnSync("wl-copy", [text], {
				encoding: "utf8",
				timeout: 1000,
			});
			if (res.status === 0) return { success: true };

			const resX = spawnSync("xclip", ["-selection", "clipboard"], {
				input: text,
				encoding: "utf8",
				timeout: 1000,
			});
			if (resX.status === 0) return { success: true };
			return {
				success: false,
				error: resX.error?.message ?? "Clipboard write failed",
			};
		}

		return {
			success: false,
			error: `Clipboard not supported on platform ${process.platform}`,
		};
	} catch (err) {
		return {
			success: false,
			error: (err as Error).message,
		};
	}
}
