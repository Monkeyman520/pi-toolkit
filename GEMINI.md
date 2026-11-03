# pi-packages

This is a personally maintained collection of independently installable Pi coding agent plugins. Repository documentation and written guidance use English.

For every task, follow [AGENTS.md](AGENTS.md) for canonical project identity and package development requirements, together with the existing guidance below.

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
