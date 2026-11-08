import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

/** Opt-in fixture evidence only. Never supply credentials or real user session data. */
export async function saveEvidence(name, data) {
	if (!process.env.ACO_TEST_ARTIFACTS) return;
	if (!/^[a-z0-9-]+$/.test(name)) throw Error("Invalid artifact name");
	const directory = resolve(process.env.ACO_TEST_ARTIFACTS);
	await mkdir(directory, { recursive: true });
	const json = JSON.stringify(
		data,
		(key, value) =>
			key === "events" && Array.isArray(value)
				? value.filter(
						(event) =>
							!["extension_ui_request", "response", "message_update"].includes(
								event.type,
							),
					)
				: value,
		2,
	);
	await writeFile(join(directory, name + ".json"), json + "\n");
}
