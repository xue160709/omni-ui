# packages/

This directory contains the publishable OmniUI packages.

## Package Responsibilities

### `@omni-ui/react`

Use this for most React apps. It includes React runtime primitives, hooks, `CommandInput`, page and entity registration, action executor binding, resolver configuration, and optional development helpers.

Most React projects only install this package:

```bash
npm install @omni-ui/react
```

### `@omni-ui/core`

Use this for framework-agnostic protocols, manifests, command envelopes, validation, policies, resolver adapters, testing helpers, or server-side integration.

React apps usually do not install it directly because `@omni-ui/react` depends on it and re-exports the common APIs.

### `@omni-ui/shadcn`

This is optional. It provides shadcn/ui-compatible source components and registry recipes. It is not required for the OmniUI runtime.

## Package Relationship

```text
@omni-ui/react
  -> @omni-ui/core   (runtime dependency, common APIs re-exported)

@omni-ui/shadcn
  -> @omni-ui/react  (peer dependency for generated source recipes)
```

## Integration Guides

- [Quick Start](../docs/getting-started/quick-start.md)
- [Chinese Quick Start](../docs/getting-started/quick-start.zh-CN.md)
- [Minimal React Vite example](../examples/react-vite-minimal/)
- [Troubleshooting error codes](../docs/troubleshooting/error-codes.md)

The old `packages/教程.md` file now only redirects to the maintained docs entry points.

## Local Development

Run these commands from the repository root:

```bash
npm install
npm run dev
npm run verify:release
```

`npm run dev` starts the `apps/demo-todo` development server, including local registry files under `apps/demo-todo/public/r`.

Useful focused checks:

```bash
npm run verify
npm run verify:registry
npm run verify:examples
npm run verify:package-consumer
```

Package-specific scripts live in each package `package.json`.
