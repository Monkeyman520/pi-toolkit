import { truncateToWidth } from "@earendil-works/pi-tui";
import type { InspectionScroll } from "./types.ts";
/** Line-window rendering for the existing inline component (no layout-node SDK dependency). */
export class InspectionView {
	private identity = "";
	private contentKey = "";
	private lines: string[] = [];
	private offset = 0;
	private viewport = 1;
	private maxOffset = 0;
	public reset() {
		this.identity = "";
		this.contentKey = "";
		this.lines = [];
		this.offset = 0;
		this.maxOffset = 0;
	}
	public scroll(move: InspectionScroll) {
		const next =
			move === "first"
				? 0
				: move === "last"
					? this.maxOffset
					: this.offset +
						(move === "up"
							? -1
							: move === "down"
								? 1
								: move === "pageUp"
									? -this.viewport
									: this.viewport);
		this.offset = Math.max(0, Math.min(this.maxOffset, next));
	}
	public render(options: {
		identity: string;
		contentKey: string;
		width: number;
		height: number;
		title: string;
		footer: string;
		body: () => string[];
	}): string[] {
		const { identity, contentKey, width, title, footer } = options,
			height = Math.max(1, Math.floor(options.height));
		if (identity !== this.identity) {
			this.reset();
			this.identity = identity;
		}
		if (contentKey !== this.contentKey) {
			this.lines = options.body();
			this.contentKey = contentKey;
		}
		const chrome = height >= 5 ? 4 : height >= 3 ? 2 : height === 2 ? 1 : 0;
		this.viewport = Math.max(1, height - chrome);
		this.maxOffset = Math.max(0, this.lines.length - this.viewport);
		this.offset = Math.min(this.offset, this.maxOffset);
		const body = this.lines.slice(this.offset, this.offset + this.viewport);
		const end = Math.min(this.lines.length, this.offset + this.viewport);
		const hint = `[${this.lines.length ? this.offset + 1 : 0}-${end}/${this.lines.length}] ${footer}`;
		const divider = "─".repeat(width);
		const output =
			height >= 5
				? [title, divider, ...body, divider, hint]
				: height >= 3
					? [title, ...body, hint]
					: height === 2
						? [...body, hint]
						: body;
		return output.map((line) => truncateToWidth(line, width));
	}
}
