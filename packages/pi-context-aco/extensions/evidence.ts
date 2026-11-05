import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, realpath, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { type Static, Type } from "typebox";
import { Check } from "typebox/value";

const MAX_SEGMENT = 4 * 1024 * 1024;
const MAX_MANIFEST = 256 * 1024;
const digest = (text: string) =>
	createHash("sha256").update(text).digest("hex");
const hashSchema = Type.String({ pattern: "^[a-f0-9]{64}$" });
const identifier = Type.String({ minLength: 1, maxLength: 128 });
const checkpointId = Type.String({ pattern: "^[a-f0-9-]{36}$" });
const scopeSchema = Type.Object(
	{
		project: hashSchema,
		taskId: identifier,
		sessionId: identifier,
	},
	{ additionalProperties: false },
);
export type Scope = Static<typeof scopeSchema>;
export const receiptSchema = Type.Object(
	{
		version: Type.Literal(1),
		id: checkpointId,
		digest: hashSchema,
		scope: scopeSchema,
		anchorId: identifier,
	},
	{ additionalProperties: false },
);
export type Receipt = Static<typeof receiptSchema>;
const segmentSchema = Type.Object(
	{
		id: identifier,
		file: Type.String({ pattern: "^(s[0-9]+|continuity)\\.json$" }),
		digest: hashSchema,
		bytes: Type.Integer({ minimum: 0, maximum: MAX_SEGMENT }),
	},
	{ additionalProperties: false },
);
const manifestSchema = Type.Object(
	{
		version: Type.Literal(1),
		id: checkpointId,
		scope: scopeSchema,
		anchorId: identifier,
		createdAt: Type.String({ maxLength: 64 }),
		segments: Type.Array(segmentSchema, { minItems: 2, maxItems: 129 }),
	},
	{ additionalProperties: false },
);
type Manifest = Static<typeof manifestSchema>;
export interface Access extends Scope {
	receipts: Receipt[];
}
interface Grant {
	receipt: Receipt;
	child: Scope;
	segments: string[];
}
export interface EvidenceIO {
	read(path: string, maxBytes: number): Promise<string>;
	write(path: string, text: string): Promise<void>;
	mkdir(path: string, recursive: boolean): Promise<void>;
	rename(from: string, to: string): Promise<void>;
}
export const fileIO: EvidenceIO = {
	async read(path, maxBytes) {
		const handle = await open(path, "r");
		try {
			const buffer = Buffer.alloc(maxBytes + 1);
			let size = 0;
			while (size < buffer.length) {
				const { bytesRead } = await handle.read(
					buffer,
					size,
					buffer.length - size,
					null,
				);
				if (!bytesRead) break;
				size += bytesRead;
			}
			if (size > maxBytes) throw Error("Evidence file exceeds bound");
			return buffer.subarray(0, size).toString("utf8");
		} finally {
			await handle.close();
		}
	},
	async write(path, text) {
		await writeFile(path, text, { encoding: "utf8", flag: "wx", mode: 0o600 });
	},
	async mkdir(path, recursive) {
		await mkdir(path, { recursive, mode: 0o700 });
	},
	rename,
};
export async function projectKey(cwd: string) {
	const canonical = await realpath(cwd);
	return digest(
		process.platform === "win32" ? canonical.toLowerCase() : canonical,
	);
}
function sameScope(a: Scope, b: Scope) {
	return (
		a.project === b.project &&
		a.taskId === b.taskId &&
		a.sessionId === b.sessionId
	);
}
function validReceipt(value: unknown): asserts value is Receipt {
	if (!Check(receiptSchema, value)) throw Error("Invalid evidence receipt");
}
export interface PersistInput {
	scope: Scope;
	anchorId: string;
	continuity: string;
	sources: { id: string; original: string }[];
	id?: string;
}
/** Local immutable originals. Caller supplies host-derived active-branch authority, never model claims. */
export class EvidenceStore {
	private root: string;
	private io: EvidenceIO;
	private grants = new WeakMap<object, Grant>();
	constructor(root: string, io: EvidenceIO = fileIO) {
		this.root = root;
		this.io = io;
	}
	private directory(receipt: Receipt) {
		validReceipt(receipt);
		return join(this.root, receipt.scope.project, receipt.id);
	}
	private authorized(
		id: string,
		access: Access,
		segment?: string,
		grant?: object,
	): Receipt {
		if (
			!Check(checkpointId, id) ||
			!Check(scopeSchema, {
				project: access.project,
				taskId: access.taskId,
				sessionId: access.sessionId,
			})
		)
			throw Error("Invalid evidence scope/ID");
		const delegated = grant && this.grants.get(grant);
		if (
			delegated &&
			sameScope(delegated.child, access) &&
			delegated.receipt.id === id &&
			segment &&
			delegated.segments.includes(segment)
		)
			return delegated.receipt;
		const receipt = access.receipts.find(
			(r) =>
				r.id === id &&
				r.scope.project === access.project &&
				r.scope.taskId === access.taskId,
		);
		if (!receipt)
			throw Error(
				"Evidence access denied: active task/branch receipt or necessary child grant required",
			);
		validReceipt(receipt);
		return receipt;
	}
	private async manifest(receipt: Receipt): Promise<Manifest> {
		const raw = await this.io.read(
			join(this.directory(receipt), "manifest.json"),
			MAX_MANIFEST,
		);
		if (digest(raw) !== receipt.digest)
			throw Error("Evidence manifest readback mismatch");
		const value: unknown = JSON.parse(raw);
		if (
			!Check(manifestSchema, value) ||
			value.id !== receipt.id ||
			!sameScope(value.scope, receipt.scope) ||
			value.anchorId !== receipt.anchorId ||
			new Set(value.segments.map((s) => s.id)).size !== value.segments.length ||
			new Set(value.segments.map((s) => s.file)).size !== value.segments.length
		)
			throw Error("Invalid evidence manifest");
		return value;
	}
	private async original(
		receipt: Receipt,
		segment: Manifest["segments"][number],
	) {
		const raw = await this.io.read(
			join(this.directory(receipt), segment.file),
			MAX_SEGMENT,
		);
		if (
			digest(raw) !== segment.digest ||
			Buffer.byteLength(raw) !== segment.bytes
		)
			throw Error("Original evidence readback mismatch");
		return raw;
	}
	async persist(input: PersistInput): Promise<Receipt> {
		const id = input.id ?? randomUUID();
		const originals = [
			{ id: "continuity", original: input.continuity, file: "continuity.json" },
			...input.sources.map((s, i) => ({ ...s, file: `s${i}.json` })),
		];
		if (
			input.sources.length < 1 ||
			input.sources.length > 128 ||
			new Set(originals.map((s) => s.id)).size !== originals.length ||
			originals.some(
				(s) =>
					!Check(identifier, s.id) ||
					typeof s.original !== "string" ||
					Buffer.byteLength(s.original) > MAX_SEGMENT,
			) ||
			originals.reduce((n, s) => n + Buffer.byteLength(s.original), 0) >
				16 * 1024 * 1024
		)
			throw Error("Invalid/oversized evidence segments");
		const manifest: Manifest = {
			version: 1,
			id,
			scope: input.scope,
			anchorId: input.anchorId,
			createdAt: new Date().toISOString(),
			segments: originals.map((s) => ({
				id: s.id,
				file: s.file,
				digest: digest(s.original),
				bytes: Buffer.byteLength(s.original),
			})),
		};
		if (!Check(manifestSchema, manifest))
			throw Error("Invalid evidence manifest input");
		const raw = JSON.stringify(manifest);
		if (Buffer.byteLength(raw) > MAX_MANIFEST)
			throw Error("Evidence index too large");
		const receipt: Receipt = {
			version: 1,
			id,
			digest: digest(raw),
			scope: input.scope,
			anchorId: input.anchorId,
		};
		const parent = join(this.root, input.scope.project),
			pending = join(parent, `pending-${id}`);
		await this.io.mkdir(parent, true);
		await this.io.mkdir(pending, false);
		for (const original of originals)
			await this.io.write(join(pending, original.file), original.original);
		await this.io.write(join(pending, "manifest.json"), raw);
		await this.io.rename(pending, this.directory(receipt));
		const stored = await this.manifest(receipt);
		for (let i = 0; i < originals.length; i++) {
			if (
				(await this.original(receipt, stored.segments[i])) !==
				originals[i].original
			)
				throw Error("Original evidence differs from captured source");
		}
		return receipt;
	}
	async verify(receipt: Receipt, access: Access) {
		const authorized = this.authorized(receipt.id, access);
		if (JSON.stringify(authorized) !== JSON.stringify(receipt))
			throw Error("Receipt authority mismatch");
		const manifest = await this.manifest(receipt);
		for (const segment of manifest.segments)
			await this.original(receipt, segment);
		return manifest;
	}
	/** Host-only policy seam for T0006; no tool/command can mint a grant. Runtime-local and revocable on reload. */
	async grant(
		id: string,
		parent: Access,
		child: Scope,
		segments: string[],
	): Promise<object> {
		if (
			!Check(scopeSchema, {
				project: child.project,
				taskId: child.taskId,
				sessionId: child.sessionId,
			}) ||
			child.project !== parent.project ||
			child.taskId !== parent.taskId ||
			child.sessionId === parent.sessionId ||
			!segments.length ||
			segments.length > 128
		)
			throw Error("Invalid child scope/necessary references");
		const receipt = this.authorized(id, parent);
		const manifest = await this.verify(receipt, parent);
		if (segments.some((id) => !manifest.segments.some((s) => s.id === id)))
			throw Error("Unknown necessary child segment");
		const token = {};
		this.grants.set(token, {
			receipt: structuredClone(receipt),
			child: structuredClone(child),
			segments: [...segments],
		});
		return token;
	}
	async recall(
		id: string,
		segmentId: string,
		access: Access,
		budgetBytes: number,
		offset = 0,
		grant?: object,
	): Promise<string> {
		if (
			!Number.isInteger(budgetBytes) ||
			budgetBytes < 512 ||
			budgetBytes > 32768 ||
			!Number.isInteger(offset) ||
			offset < 0
		)
			throw Error(
				"Recall budget must be 512–32768 bytes; offset must be a nonnegative UTF-16 index",
			);
		const receipt = this.authorized(id, access, segmentId, grant);
		const manifest = await this.manifest(receipt);
		const segment = manifest.segments.find((s) => s.id === segmentId);
		if (!segment) throw Error("Unknown evidence segment");
		const original = await this.original(receipt, segment);
		if (
			offset > original.length ||
			(offset > 0 &&
				/[\uDC00-\uDFFF]/.test(original[offset] ?? "") &&
				/[\uD800-\uDBFF]/.test(original[offset - 1]))
		)
			throw Error("Invalid recall offset");
		const render = (end: number) =>
			JSON.stringify({
				checkpointId: id,
				segmentId,
				scope: manifest.scope,
				sourceEntryId: segmentId === "continuity" ? null : segmentId,
				historical: true,
				currentSourceVerified: false,
				offset,
				nextOffset: end < original.length ? end : null,
				totalChars: original.length,
				text: original.slice(offset, end),
			});
		let low = offset,
			high = Math.min(original.length, offset + budgetBytes);
		while (low < high) {
			const mid = Math.ceil((low + high) / 2);
			if (Buffer.byteLength(render(mid)) <= budgetBytes) low = mid;
			else high = mid - 1;
		}
		if (
			low > offset &&
			/[\uD800-\uDBFF]/.test(original[low - 1]) &&
			/[\uDC00-\uDFFF]/.test(original[low] ?? "")
		)
			low--;
		const result = render(low);
		if (
			Buffer.byteLength(result) > budgetBytes ||
			(low === offset && offset < original.length)
		)
			throw Error(
				"Recall budget too small for provenance envelope and content",
			);
		return result;
	}
}
