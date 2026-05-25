# Contributing

Thanks for helping shape OmniUI.

## Development

```bash
npm install
npm run dev
```

Use the docs app at `http://127.0.0.1:5173/` for manual checks.

## Checks

Run the full verification suite before opening a PR:

```bash
npm run verify
```

## Design Rules

- Keep the runtime first. shadcn wrappers are optional enhancement, not a fork.
- Do not add per-control voice scripts as the primary API.
- LLM resolvers may propose candidates, but validation and dispatch stay local.
- Do not execute string expressions with `eval`.
- Keep generated registry items under `apps/docs/public/r` reproducible from `packages/shadcn/registry`.
