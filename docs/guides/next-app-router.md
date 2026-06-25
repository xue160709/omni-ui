# Next.js App Router

Use `@omni-ui/react` from client components only. Keep `MultimodalProvider`, `CommandInput`, `MultimodalPage`, `MultimodalGroup`, and executor hooks behind `"use client"`.

Server-side model keys should stay in route handlers or server actions. A server resolver should return semantic hypotheses only; the browser runtime still performs Fusion, Command construction, validation, confirmation, execution, and verification.

```tsx
"use client"

import "@omni-ui/react/styles"
import { MultimodalProvider } from "@omni-ui/react"

export function Providers({ children }: { children: React.ReactNode }) {
  return <MultimodalProvider>{children}</MultimodalProvider>
}
```
