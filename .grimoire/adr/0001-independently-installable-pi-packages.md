# Independently installable Pi plugin packages

**Status:** Proposed
**Date:** 2026-11-03

## Context

`pi-packages` is a personal collection of plugins for Pi coding agent. Refinement offered two organizational alternatives: independently installable plugins under `packages/<plugin-name>/`, each with a manifest and README, or a single package that installs the entire collection. The user explicitly selected independent installation and an English requirements specification.

## Decision

Organize the collection under `packages/<plugin-name>/`. Each plugin package owns its package manifest and README and is an independent installation unit. Installing one package must not implicitly install or activate the rest of the collection.

The repository root describes and organizes the collection; it is not the mandatory installation unit for every plugin.

## Consequences

- Users can select individual plugin packages instead of installing the collection as a bundle.
- Installation instructions and Pi resource declarations belong to the corresponding package and must describe that package's resources.
- Package development must not depend on another sibling package being present merely because both live in this repository. Required dependencies must be declared and made available to the installed package.
- This decision does not select a workspace tool, package manager, npm scope, publishing process, or concrete plugin functionality.

The status remains Proposed because the structure has not been implemented; the organizational choice is confirmed by the user.
