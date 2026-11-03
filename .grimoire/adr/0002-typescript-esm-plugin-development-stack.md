# TypeScript ESM plugin development stack

**Status:** Proposed
**Date:** 2026-11-03

## Context

The user selected a common development stack and package layout for the independently installable Pi plugins established by [ADR 0001](./0001-independently-installable-pi-packages.md). These are explicit project constraints, not conclusions inferred from the repository's English-language convention.

## Decision

- Use TypeScript with ECMAScript modules and erasable syntax. Package metadata declares `"type": "module"`; TypeScript configuration enables `erasableSyntaxOnly`.
- Require Node.js >= 22.19.0.
- Use Biome for code checking and Vitest for tests.
- Use TypeBox through the `typebox` package for schema definitions and validation needs.
- Run type checking with `tsc --noEmit`. The plugin workflow does not require a bundler or an emitted JavaScript build to load extension sources through Pi.
- Use the host-provided SDK packages `@earendil-works/pi-coding-agent`, `@earendil-works/pi-agent-core`, and `@earendil-works/pi-tui` as needed. Host-provided SDK packages and `typebox`, when used, belong in `peerDependencies` with `"*"` ranges rather than runtime `dependencies`, following the [official Pi package contract](https://pi.dev/docs/latest/packages).
- Each plugin package has its own `package.json`, `tsconfig.json`, README, and main extension entry at `extensions/index.ts`. Include `skills/` and `prompts/` only when the package provides them. Skills contain skill documentation and scripts; prompts contain Markdown templates expanded through `/name`.
- Pi resource exposure may use conventional directory discovery or explicit package-relative entries under `package.json`'s `pi` field. Do not require both mechanisms or entries for optional resources that do not exist.

## Consequences

- Package and contributor documentation must consistently describe the selected stack and Node.js baseline.
- The TypeScript compiler must support `erasableSyntaxOnly` (introduced in TypeScript 5.8); constructs requiring TypeScript runtime code generation are outside the selected syntax subset. See the [TypeScript option documentation](https://www.typescriptlang.org/tsconfig/erasableSyntaxOnly.html).
- Tooling belongs to development setup. Any local copies needed for type checking or tests do not change the host-provided runtime dependency boundary; local package setup remains the developer's responsibility.
- Type checking, Biome checks, and Vitest tests are distinct checks; a no-emit type check does not replace tests or validate host resource discovery.
- Extension loading is verified through Pi, not by assuming that `node extensions/index.ts` is an equivalent loader. No bundler is required, but Node.js support alone does not prove that an installed Pi package loads correctly.
- This decision supplements ADR 0001 and does not select a package manager, workspace tool, publication scope, exact dependency versions, or concrete plugin behavior.

The status remains Proposed because configuration and plugin implementation have not started; the stack and layout choices are confirmed by the user.
