// Local, trusted Node ESM. No sandbox; do not load untrusted scripts.
export default function normalize(text, context) {
	return text.replace(/[ \t]+$/gm, "") + (context.options.suffix ?? "");
}
