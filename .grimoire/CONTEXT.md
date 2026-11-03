# Context

## Concepts

### Pi Agent
- **Definition:** The Pi coding agent host targeted by this repository's plugins. Plugin development follows the package and extension contracts for the relevant host version; this repository is not the host's source tree.
- **Synonyms:** Pi, pi-agent, Pi coding agent

### Pi Plugin Collection
- **Definition:** `pi-packages` is a personally developed and maintained collection of plugins for Pi Agent. Its identity must guide future development rather than inferring another project category from generic directory names or development-tool configuration. Plugins are organized as independently installable packages under `packages/<plugin-name>/`, as recorded in [ADR 0001](./adr/0001-independently-installable-pi-packages.md).
- **Relationships:**
  - depends on Pi Agent
  - contains Pi Plugin Package

### Pi Plugin Package
- **Definition:** An independently installable member of the Pi Plugin Collection, with its own package manifest and README under `packages/<plugin-name>/`. The collection is not a single mandatory all-plugins installation unit. Its development stack and extension layout follow [ADR 0002](./adr/0002-typescript-esm-plugin-development-stack.md).
- **Relationships:**
  - belongs to Pi Plugin Collection
  - depends on Pi Agent

### Project Language
- **Definition:** English is the language for repository-maintained documentation and written project guidance, including README files, agent guidance, context, architectural decisions, and specifications. This is a human-language convention, not a programming-language selection.
