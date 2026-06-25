# Error Codes

Core errors use the `OmniError` shape from `@omni-ui/core`:

```ts
type OmniError = {
  code: string
  message: string
  stage: string
  recoverable: boolean
  retryable?: boolean
}
```

Common codes include:

- `OMNI_TURN_REVISION_CONFLICT`
- `OMNI_CONTEXT_EPOCH_CHANGED`
- `OMNI_FUSION_AMBIGUOUS_TARGET`
- `OMNI_FUSION_AMBIGUOUS_ACTION`
- `OMNI_ARGUMENT_VALIDATION_FAILED`
- `OMNI_CONFIRMATION_REQUIRED`
- `OMNI_EXECUTION_FAILED`
- `OMNI_DISPATCH_CANCELLED`
- `OMNI_VERIFICATION_FAILED`

Production logs should serialize sanitized errors and avoid raw `cause` values that may contain secrets.
