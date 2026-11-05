import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";

export const DISCOVER_EVENT = "pi-packages:ui:discover";

export interface PluginUiDescriptor {
	id: string;
	title: string;
	command: string;
	getSummary(): string;
	open(ctx: ExtensionContext): Promise<void>;
}

export interface PluginUiDiscoverPayload {
	register(descriptor: PluginUiDescriptor): void;
}

export function isDiscoverPayload(
	value: unknown,
): value is PluginUiDiscoverPayload {
	return (
		typeof value === "object" &&
		value !== null &&
		"register" in value &&
		typeof (value as { register?: unknown }).register === "function"
	);
}

export function discoverLoadedPanels(
	events: ExtensionAPI["events"],
): PluginUiDescriptor[] {
	const byId = new Map<string, PluginUiDescriptor>();
	events.emit(DISCOVER_EVENT, {
		register(descriptor: PluginUiDescriptor) {
			if (
				descriptor &&
				typeof descriptor.id === "string" &&
				typeof descriptor.title === "string" &&
				typeof descriptor.open === "function"
			) {
				byId.set(descriptor.id, descriptor);
			}
		},
	} satisfies PluginUiDiscoverPayload);
	return [...byId.values()];
}
