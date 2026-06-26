# Vite

Use the same setup as [`examples/react-vite-minimal`](../../examples/react-vite-minimal/).

```tsx
import "@omni-ui/react/styles.css"
import { MultimodalProvider } from "@omni-ui/react"
```

For local repository validation, run:

```bash
npm run verify:examples
```

The minimal example uses package exports rather than monorepo source aliases, so it exercises the same import paths a consumer uses after package build.
