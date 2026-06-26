# Security and Model Keys

OmniUI is designed so models propose commands while your app keeps authority over validation, policy, confirmation, and execution.

## Model Keys

Do not expose model API keys in browser bundles.

Recommended production setup:

```text
Browser
  -> sends redacted snapshot / manifest summary
  -> your server resolver
  -> model provider
  -> candidate command
  -> browser local validation / policy / executor
```

Use model-provider helpers such as `createOpenAIResolver()` only in trusted server runtimes. Browser apps should call your own resolver endpoint.

## Business Authority

- OmniUI does not bypass business permissions.
- Executors remain owned by the business project.
- External resolvers only return candidate commands.
- Commands must pass local schema validation before dispatch.
- High-risk actions should require user confirmation.

## Snapshot Privacy

- Snapshot data should be redacted and trimmed before leaving the browser.
- Passwords, tokens, cookies, payment secrets, OTPs, and API keys should never be sent to model providers.
- Large text blocks should be summarized or excluded.
- DevTools exports and bug reports should use sanitized traces.

## Server Resolver Boundary

The server resolver should return semantic candidates, not perform business writes. The browser runtime still validates target anchors, action schemas, policy, confirmation, and executor availability.
