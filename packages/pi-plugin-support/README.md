# Pi Plugin Support

`pi-plugin-support@0.1.0` is an ordinary versioned dependency, **not a Pi plugin, collection loader or manager**. It exposes source-only ESM modules and no Pi resources. Consumers own their instances, sessions and cleanup; importing the library starts no resources.

## Modules and ownership

- `pi-plugin-support/config`: `readJsonConfig(path, schema, maxBytes)` distinguishes missing, valid, invalid and unreadable object JSON; `writeJsonConfig(path, data, schema)` validates and atomically replaces the explicit target through a private temporary file. `JsonConfigStore` owns per-instance current/raw configuration, mtime/content checks, force reload and error-notification tracking, but never starts a watcher.
- `JsonConfigStore` accepts caller defaults, size bound, error text and optional `onInvalid(previous)` / `identifyError(...)` policy. Without a fallback it retains previous safe values. The plugins retain their own parsing/aliases and fail-closed, keep-safe or quota-pause policies.
- `pi-plugin-support/settings`: schema-based `settingCandidates` and `parseBoolean`. Explicit presets remain suggestions, not validation bounds; descriptions and dynamic candidates belong to the plugin.
- `pi-plugin-support/discovery`: the existing `pi-packages:ui:discover` callback/descriptor protocol, guards and deduplicated collection. The caller supplies its event bus and owns registration/unsubscription. Separate physical library copies interoperate without shared module identity.
- `pi-plugin-support/panels`: `createSettingsPanel`, `pluginSwitcherItem` and SelectList theming. The shared shell owns only invocation-local UI composition/navigation; callers supply headers, items, callbacks and feedback. It knows no plugin catalog, Recovery, accounts, credentials, ledger or session metadata.

The config store preserves existing adapters' update-before-persist behavior: a rejected write never reports durable success, but attempted in-memory values may already have changed. It does not promise rollback, locking, cross-process merging, fsync durability or exactly-once delivery. Atomic replacement is not writer coordination. Quota state/ledger and credential I/O stay outside this API.

## Compatibility and delivery

Node.js >=22.19.0, TypeScript ESM/erasable syntax, TypeBox and no required bundler/emitted build. Pi 1.5.0 on Windows is the verified host. Used Pi SDK packages and `typebox` are host-provided `"*"` peers, not bundled host copies.

No registry identity/publication is claimed. Each plugin declares the exact ordinary dependency `pi-plugin-support: 0.1.0` and includes **only that dependency** in npm `bundledDependencies`. npm plugin tarballs carry the prepared library source package; this is not a JavaScript bundler or shared runtime singleton. Each plugin also ships `vendor/pi-plugin-support-0.1.0.tgz`, and its local lockfile resolves that archive for independent checkout/copy setup. Do not replace the manifest dependency with a nested `file:vendor` specifier: actual npm tarball installation reproduced ENOENT for that form.

From the collection checkout, after library source/API/README changes:

```sh
node scripts/package-support.mjs
node scripts/package-support.mjs --check
```

The first command packs the canonical library, refreshes consumer archives/installed library copies and npm lock integrity, then restores the exact declared version. The check packs into a temporary directory and verifies archive parity without modifying the checkout. Prepare all affected consumers before packing them; a clean plugin tarball install is covered by the isolation matrix. Before any external release, version changes must be coordinated explicitly; do not silently overwrite a published version.

## Development and verification

```sh
cd packages/pi-plugin-support
npm ci --ignore-scripts --legacy-peer-deps
npm run typecheck
npm run check
npm test
```

These are separate checks; no JavaScript is emitted. From the collection root, with `PI_BINARY` pointing at the installed executable when needed:

```sh
node tests/support-library-smoke.mjs
node tests/plugin-isolation.mjs
```

The library smoke installs an independent archive consumer outside the checkout and exercises real Pi host-peer resolution. The matrix installs complete plugin tarballs as dependencies in separate temporary roots, verifies only the support library is bundled, checks seven combinations and repeated session cleanup, and tests a frozen baseline protocol reader against migrated registrations. Offline installation requires the normal dependency cache prepared by documented package setup.

Real Windows Terminal keyboard interaction additionally verified configuration changes/reload, navigation/search/Escape, stop/owner refresh, loaded-plugin switching, full-prefix Tab completion and orderly exit using isolated empty auth and no live provider calls. Component tests remain a separate evidence class. Other operating systems, physical sleep/wake and live services are not claimed.

## Permissions

Explicit config operations read/write caller-selected paths with Pi's process permissions; this library is not a sandbox or path authorization layer. The UI uses host components. The library performs no provider requests, credential discovery, global registration, scheduler startup or automatic background I/O.
