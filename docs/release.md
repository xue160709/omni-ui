# Release

OmniUI is currently alpha. Package versions are `0.1.0`; release notes stay in `CHANGELOG.md` under `Unreleased` until a GitHub Release and npm publication are prepared.

Package versions and protocol versions are separate. A package can ship `0.x` releases while `@omni-ui/core/protocol` exposes protocol serialization version `1.0` for ResolutionBundle, CommandEnvelope, and DispatchResult envelopes.

## Release Flow

```text
1. Confirm version status
2. Run verify:release
3. Generate or review changeset
4. Build packages
5. Run npm pack package-consumer validation
6. Publish npm packages
7. Create GitHub Release
8. Update CHANGELOG
9. Check README badges and documentation versions
```

## Verification

Run from the repository root:

```bash
npm install
npm run verify:release
```

`verify:release` covers:

- Type checking
- Unit tests
- Runtime and demo builds
- shadcn registry tests and registry build
- `examples/react-vite-minimal` typecheck and build
- `npm pack` package-consumer validation for runtime packages

Focused commands:

```bash
npm run verify
npm run verify:registry
npm run verify:examples
npm run verify:package-consumer
```

## Pre-release Checklist

- [ ] Package versions are aligned.
- [ ] CHANGELOG reflects the release.
- [ ] README installation command is correct for the release state.
- [ ] Quick Start works from a clean project.
- [ ] `npm run verify:release` passes.
- [ ] GitHub Actions pass.
- [ ] npm package contents are inspected.
- [ ] GitHub Release notes are prepared.
- [ ] Breaking changes have migration notes.
- [ ] CSS import strategy is documented.
- [ ] Model key and snapshot privacy guidance is linked.

## Release Notes

Every release should record:

- npm package versions
- GitHub Release URL
- changelog summary
- breaking changes
- migration notes
- compatibility matrix
- known issues
- example version or commit
