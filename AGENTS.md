# pi-packages — Agent Guidance

## Project identity

`pi-packages` is a personally maintained collection of independently installable Pi coding agent plugins. The root organizes the collection; plugin code belongs under `packages/<plugin-name>/`. This is not the Pi host's source tree or a standalone application.

Use English for repository documentation and written project guidance. Preserve this identity rather than selecting an unrelated scaffold from generic directory names or tool configuration.

## Package development

- Before adding or changing a package, read [packages/README.md](packages/README.md) for layout, manifests, development setup, resource discovery, and verification.
- Before changing package boundaries or stack constraints, read [CONTEXT.md](.grimoire/CONTEXT.md), the relevant [ADRs](.grimoire/adr/), and the task's specification. Check the applicable official Pi documentation linked from the package reference.
- Use TypeScript ESM with erasable syntax, Node.js >= 22.19.0, Biome, Vitest, TypeBox (`typebox`), and `tsc --noEmit`; no bundler or emitted build is required.
- Keep used host SDK packages and `typebox` as host-provided peers with `"*"` ranges; declare other runtime dependencies and avoid undeclared sibling imports.
- Keep package READMEs specific to actual resources, compatibility, permissions, and verified commands. Reflect the actual package catalog and available tooling; distinguish reference examples from runnable commands.
- Verify each real package with its own type check, Biome check, Vitest tests, and Pi loading/usage evidence. Documentation/configuration inspection is not a runtime test.

<!-- CODEGRAPH_START -->
## CodeGraph

In repositories indexed by CodeGraph (a `.codegraph/` directory exists at the repo root), reach for it BEFORE grep/find or reading files when you need to understand or locate code:

- **MCP tool** (when available): `codegraph_explore` answers most code questions in one call — the relevant symbols' verbatim source plus the call paths between them, including dynamic-dispatch hops grep can't follow. Name a file or symbol in the query to read its current line-numbered source. If it's listed but deferred, load it by name via tool search.
- **Shell** (always works): `codegraph explore "<symbol names or question>"` prints the same output.

If there is no `.codegraph/` directory, skip CodeGraph entirely — indexing is the user's decision.
<!-- CODEGRAPH_END -->

<!-- GRIMOIRE:START -->
## Grimoire

This project maintains a grimoire at `.grimoire/`:

- `CONTEXT.md` — domain concepts and terminology (may split into `CONTEXT-[domain].md`)
- `adr/` — architecture decision records
- `spec/` — requirements specifications
- `ticket/` — implementation plans

Consult relevant grimoire files before making design decisions that affect project concepts, architecture, or requirements.
<!-- GRIMOIRE:END -->


## Git Commit Guidelines

Commit messages must follow the [Angular Git Commit Guidelines](https://github.com/angular/angular/blob/main/contributing-guidelines/CONTRIBUTING.md#commit-message-format) preceded by a gitmoji:

`<gitmoji> <type>(<scope>): <subject>`

### Format
- `<gitmoji>`: Gitmoji representing the intent of the commit (e.g., `🎉`, `✨`, `🐛`, `📝`, `🔧`, `♻️`, `⚡️`, `✅`, `📦`).
- `<type>`: Must be one of:
  - `feat`: A new feature
  - `fix`: A bug fix
  - `docs`: Documentation only changes
  - `style`: Changes that do not affect the meaning of the code (formatting, missing semicolons, etc.)
  - `refactor`: A code change that neither fixes a bug nor adds a feature
  - `perf`: A code change that improves performance
  - `test`: Adding missing tests or correcting existing tests
  - `build`: Changes that affect the build system or external dependencies
  - `ci`: Changes to CI configuration files and scripts
  - `chore`: Other changes that do not modify src or test files
  - `revert`: Reverts a previous commit
- `<scope>`: Optional, indicates the scope/component of the change (e.g., `(project)`, `(grimoire)`, `(config)`).
- `<subject>`: Imperative, present-tense, lowercase description without a trailing period.

### Example
`🎉 feat(project): initialize project structure and configuration`
