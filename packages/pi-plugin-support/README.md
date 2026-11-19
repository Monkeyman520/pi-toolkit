# Pi Plugin Support

`pi-plugin-support` is a permanently private workspace library, **not a Pi plugin, collection loader or manager**. It exposes source-only ESM modules and no Pi resources. Consumers own their instances, sessions and cleanup; importing the library starts no resources.

## Modules and ownership

- `pi-plugin-support/config`: `readJsonConfig(path, schema, maxBytes)` distinguishes missing, valid, invalid and unreadable object JSON; `writeJsonConfig(path, data, schema)` validates and atomically replaces the explicit target through a private temporary file. `JsonConfigStore` owns per-instance current/raw configuration, mtime/content checks, force reload and error-notification tracking, but never starts a watcher.
- `JsonConfigStore` accepts caller defaults, size bound, error text and optional `onInvalid(previous)` / `identifyError(...)` policy. Without a fallback it retains previous safe values. The plugins retain their own parsing/aliases and fail-closed, keep-safe or quota-pause policies.
- `pi-plugin-support/settings`: schema-based `settingCandidates` and `parseBoolean`. Explicit presets remain suggestions, not validation bounds; descriptions and dynamic candidates belong to the plugin.
- `pi-plugin-support/discovery`: the existing `pi-packages:ui:discover` callback/descriptor protocol, guards and deduplicated collection. The caller supplies its event bus and owns registration/unsubscription. Separate physical library copies interoperate without shared module identity.
- `pi-plugin-support/panels`: `createSettingsPanel`, `pluginSwitcherItem` and SelectList theming. The shared shell owns only invocation-local UI composition/navigation; callers supply headers, items, callbacks and feedback. It knows no plugin catalog, Recovery, accounts, credentials, ledger or session metadata.

The config store preserves existing adapters' update-before-persist behavior: a rejected write never reports durable success, but attempted in-memory values may already have changed. It does not promise rollback, locking, cross-process merging, fsync durability or exactly-once delivery. Atomic replacement is not writer coordination. Quota state/ledger and credential I/O stay outside this API.

## Compatibility and delivery

Rolldown inlines this library into consumer bundles. It is not separately installed or published. Use Node.js >= 22.19.0, TypeScript ESM and host-provided Pi SDK/TypeBox peers. Inlined copies interoperate through the event protocol without sharing mutable runtime ownership.

## Development and verification

From the repository root:

```sh
bun install --frozen-lockfile
bun run check
bun run --cwd packages/pi-plugin-support typecheck
bun run --cwd packages/pi-plugin-support test
bun run build
node tests/support-library-smoke.mjs
node tests/plugin-isolation.mjs
```

Set `PI_BINARY` to the actual Pi executable if needed. The support probe exercises inlined code and host-peer resolution. The isolation matrix loads independently packed bundles, verifies seven combinations and three session lifecycles per combination, and checks interoperability with a frozen baseline reader. This does not establish live-service or physical-terminal coverage.

## Permissions

Explicit config operations read/write caller-selected paths with Pi's process permissions; this library is not a sandbox or path authorization layer. The UI uses host components. The library performs no provider requests, credential discovery, global registration, scheduler startup or automatic background I/O.
