# shadcn/ui

`@omni-ui/shadcn` is optional. It provides shadcn/ui-compatible source components and registry recipes, not a required runtime dependency.

Use the runtime first:

```bash
npm install @omni-ui/react
```

Then install registry items only if you want editable source files under `components/multimodal/*`.

During repository development, generated registry files are served from `apps/demo-todo/public/r`:

```bash
npm run dev
npx shadcn@latest add http://127.0.0.1:5173/r/multimodal-provider.json
```

Registry items should import runtime APIs from `@omni-ui/react` and styles from `@omni-ui/react/styles.css`.
