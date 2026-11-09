import { execSync } from "node:child_process";

export interface ClipboardResult {
	success: boolean;
	error?: string;
}

export function copyToClipboard(text: string): ClipboardResult {
	if (!text) {
		return { success: true };
	}

	try {
		if (process.platform === "win32") {
			// Windows clip.exe
			execSync("clip", {
				input: text,
				encoding: "utf8",
				stdio: ["pipe", "ignore", "ignore"],
				windowsHide: true,
				timeout: 2000,
			});
			return { success: true };
		}

		if (process.platform === "darwin") {
			// macOS pbcopy
			execSync("pbcopy", {
				input: text,
				encoding: "utf8",
				stdio: ["pipe", "ignore", "ignore"],
				timeout: 2000,
			});
			return { success: true };
		}

		if (process.platform === "linux") {
			// Linux xclip or wl-copy
			try {
				execSync("wl-copy", {
					input: text,
					encoding: "utf8",
					stdio: ["pipe", "ignore", "ignore"],
					timeout: 2000,
				});
				return { success: true };
			} catch {
				execSync("xclip -selection clipboard", {
					input: text,
					encoding: "utf8",
					stdio: ["pipe", "ignore", "ignore"],
					timeout: 2000,
				});
				return { success: true };
			}
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
