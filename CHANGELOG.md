# Changelog

## Unreleased

### Added

- Consumer-first README with alpha status, package responsibilities, and a five-minute local command path.
- `docs/getting-started/` Quick Start entry points.
- Standalone React Vite minimal example as the primary documentation reference.
- Troubleshooting, DevTools, security, and release-process documentation entry points.
- `verify:release` script and GitHub Actions CI workflow for release-oriented validation.

### Changed

- Clarified that most React apps install `@omni-ui/react` only.
- Clarified that `@omni-ui/shadcn` is optional and not required for runtime integration.
- Clarified package version, protocol version, and pre-release status.
- Switched `@omni-ui/react` styles to an explicit CSS import strategy.
- Kept package-consumer validation on package exports and tarball contents.

### Fixed

- Removed docs-app naming drift from contributor-facing instructions.
- Moved the main tutorial out of `packages/` and linked the new Quick Start paths.
- Aligned README, package READMEs, examples, and CSS import documentation.
