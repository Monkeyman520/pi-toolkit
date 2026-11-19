import { setImmediate } from "node:timers/promises";

// Poll async test readiness without advancing the suite's fake timers.
export async function waitFor(assertion: () => void) {
	const deadline = performance.now() + 1000;
	for (;;) {
		try {
			assertion();
			return;
		} catch (error) {
			if (performance.now() >= deadline) throw error;
			await setImmediate();
		}
	}
}
