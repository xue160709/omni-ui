# @omni-ui/core

Framework-agnostic primitives for OmniUI.

Most React applications should install `@omni-ui/react` instead. Use `@omni-ui/core` directly when you are building a non-React adapter, writing a custom resolver, or running server-side assistant and validation helpers.

## Install

```bash
npm install @omni-ui/core
```

## What It Provides

- Interaction object, snapshot, route, manifest, action, and resolver types.
- Local configured rule resolver for deterministic commands.
- Action validation and payload construction.
- Immutable command envelopes, snapshot anchors, confirmation grants, and unified dispatch results.
- Event buffers, unified focus, scope arbitration, privacy projection, verification, fusion ranking, and batch dispatch helpers.
- LLM resolver helpers for trusted server runtimes.
- Assistant prompt, reply parsing, local reply, and action policy helpers.

Executors should return structured results such as `{ status: "changed" }`, `{ status: "noop", reason }`, `{ status: "rejected", reason }`, or `{ status: "pending", operationId }`. A legacy `void` return is preserved for compatibility but is reported as `unverified`.

## Custom Resolver Example

```ts
import type { IntentResolver } from "@omni-ui/core"

export const helpResolver: IntentResolver = {
  id: "help",
  resolve({ utterance, snapshot }) {
    if (!/help|帮助/i.test(utterance)) {
      return {
        status: "not_found",
        utterance,
        confidence: 0,
      }
    }

    return {
      status: "resolved",
      utterance,
      targetId: snapshot.page?.id,
      actionId: "help.open",
      confidence: 0.95,
      reason: "matched help command",
    }
  },
}
```

React apps can pass custom resolvers to `MultimodalProvider` from `@omni-ui/react`.

## Server-Only LLM Resolver Example

```ts
import { createOpenAIResolver } from "@omni-ui/core"

export const resolver = createOpenAIResolver({
  model: process.env.OPENAI_MODEL,
  apiKeyEnv: "OPENAI_API_KEY",
})
```

Do not bundle provider API keys into browser code. Put LLM resolver helpers behind your own server endpoint.

## More Documentation

- [Quick Start](../../docs/getting-started/quick-start.md)
- [Concepts](../../docs/concepts/index.md)
- [Server Resolver](../../docs/guides/server-resolver.md)
- [Security and Model Keys](../../docs/architecture/security.md)
