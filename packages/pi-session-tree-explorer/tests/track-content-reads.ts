import { mock } from "bun:test";
import assert from "node:assert/strict";

// Bun's spyOn does not support accessors. Wrap the fixture getter without reading it early.
export function trackContentReads<T>(message: { readonly content: T }) {
	const descriptor = Object.getOwnPropertyDescriptor(message, "content");
	assert.ok(descriptor?.get, "the fixture must define a content getter");
	const read = mock(() => descriptor.get?.call(message) as T);
	Object.defineProperty(message, "content", { ...descriptor, get: read });
	return read;
}
