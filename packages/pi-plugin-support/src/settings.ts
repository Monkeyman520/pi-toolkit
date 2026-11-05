import { type TSchema, Type } from "typebox";

/** Presets are suggestions, never validation limits. */
export function settingCandidates(
	schema: TSchema,
	presets: readonly string[],
): string[] {
	return Type.IsBoolean(schema) ? [...presets, "on", "off"] : [...presets];
}

export function parseBoolean(raw: string): boolean | undefined {
	const value = raw.trim().toLowerCase();
	if (value === "true" || value === "on" || value === "1") return true;
	if (value === "false" || value === "off" || value === "0") return false;
	return undefined;
}
