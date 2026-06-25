# Release

Release flow:

```text
Changesets
  -> typecheck / unit tests
  -> build
  -> npm pack package-consumer validation
  -> publish npm
  -> GitHub Release
  -> changelog and migration notes
```

Package versions and protocol versions are separate. A package can ship `0.x` releases while `@omni-ui/core/protocol` exposes a stable envelope version for adapters. Current protocol serialization is `1.0` for ResolutionBundle, CommandEnvelope, and DispatchResult envelopes.

Every release should record:

- npm version
- GitHub Release URL
- changelog
- breaking changes
- migration guide
- compatibility matrix
- known issues
- example version
