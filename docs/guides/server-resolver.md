# Server Resolver

Server resolvers are optional. The Quick Start works entirely with local rules.

Use a server resolver when you want LLM-backed command resolution without exposing model API keys to the browser. See also [Security and Model Keys](../architecture/security.md).

## Boundary

Production model keys should not be shipped to the browser. Put provider credentials behind a server endpoint and return semantic hypotheses or candidate commands.

The server response must not be treated as a trusted business write. The browser runtime still combines resolver output with the Interaction Snapshot, GUI event timeline, Unified Focus, context epoch, schema validation, policy, confirmation, and dispatcher validation.

Recommended production setup:

```text
Browser
  -> redacted snapshot / manifest summary
  -> your server resolver
  -> model provider
  -> candidate command
  -> browser local validation / policy / executor
```

## Response Shape

```ts
type ServerResolverResponse = {
  type: "interaction_hypotheses"
  hypotheses: Array<{
    intent: string
    actionHint?: string
    targetReference: { kind: string; text?: string; objectId?: string }
    slots?: Record<string, unknown>
    confidence: number
  }>
}
```

Keep responses small and semantic. Do not return secrets, raw model traces, or executable business code.
