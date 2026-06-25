# Server Resolver

Production model keys should not be shipped to the browser. Put provider credentials behind a server endpoint and return semantic hypotheses.

The server response must not be treated as a command. The browser runtime still combines hypotheses with the Interaction Snapshot, GUI event timeline, Unified Focus, context epoch, and dispatcher validation.

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
