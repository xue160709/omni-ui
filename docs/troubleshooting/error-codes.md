# Error Codes

OmniUI errors use the `OmniError` shape from `@omni-ui/core`:

```ts
type OmniError = {
  code: string
  message: string
  stage: string
  recoverable: boolean
  retryable?: boolean
}
```

Errors are grouped by runtime stage. The codes below match the current `omniErrorCodes` registry.

## Snapshot

### OMNI_SNAPSHOT_TOO_LARGE

Meaning: The generated interaction snapshot exceeded the configured size limit.

Common causes:

- Too many visible entities were registered.
- Large text blocks were included.
- Private or low-value fields were not filtered.

How to fix:

- Limit entity scope on dense pages.
- Redact or summarize large fields.
- Add snapshot filters before sending data to external resolvers.

## Manifest

### OMNI_ACTION_DUPLICATED

Meaning: Two actions were registered with the same action id.

Common causes:

- The same feature mounted duplicate action registration.
- Two packages reused a generic id such as `complete`.

How to fix:

- Use stable globally unique action ids such as `todo.complete`.
- Register shared actions once near the owning feature boundary.

### OMNI_ACTION_NOT_FOUND

Meaning: A resolver selected an action id that is not registered in the current runtime context.

Common causes:

- The page that owns the action is not mounted.
- A local rule or server resolver returned an old action id.

How to fix:

- Check action ids in `defineAction`, local rules, and server resolver output.
- Confirm the feature component that registers the action is mounted.

## Resolution

### OMNI_RESOLUTION_NO_MATCH

Meaning: No resolver could convert the user input into a valid command.

Common causes:

- No local rule matches the utterance.
- The target entity is not visible in the snapshot.
- The resolver confidence is too low.

How to fix:

- Add a local rule for deterministic commands.
- Improve action titles, descriptions, and entity labels.
- Check whether the target entity is visible and has a stable id.

### OMNI_RESOLUTION_STALE

Meaning: The command was resolved against an old context.

Common causes:

- The page changed after resolution.
- The snapshot or context epoch advanced before submission.

How to fix:

- Resolve the user input again.
- Avoid submitting cached turn ids after navigation or major state changes.

## Validation

### OMNI_ARGUMENT_VALIDATION_FAILED

Meaning: The resolver returned arguments that do not match the action schema.

Common causes:

- `paramsFrom` produced missing or invalid fields.
- A server resolver returned a candidate with outdated parameter names.

How to fix:

- Check the action `paramsSchema`.
- Inspect resolver output in DevTools.
- Keep local rules and server resolver output aligned with action schemas.

### OMNI_COMMAND_PROVENANCE_INVALID

Meaning: The command is missing required provenance for formal dispatch.

Common causes:

- Legacy code called low-level dispatch APIs with a hand-written command.
- A command was rebuilt without its turn or snapshot anchor metadata.

How to fix:

- Prefer `resolveText()` followed by `submitTurn()`.
- Keep command envelopes produced by the runtime intact.

## Policy and Confirmation

### OMNI_POLICY_REJECTED

Meaning: Runtime policy rejected the command before execution.

Common causes:

- A model proposed an action that is not allowed by policy.
- The action risk exceeds the configured policy.

How to fix:

- Review `modelCallable`, action risk, and runtime policy.
- Keep high-risk actions behind confirmation.

### OMNI_CONFIRMATION_REQUIRED

Meaning: The command is valid, but user confirmation is required.

Common causes:

- The action is medium or high risk.
- Policy requires confirmation for model-proposed writes.

How to fix:

- Show the confirmation UI for the pending turn.
- Call the runtime confirmation API before submission.

## Execution

### OMNI_EXECUTOR_MISSING

Meaning: The action exists, but no executor is currently bound.

Common causes:

- The page registered an action but did not call `useActionExecutor`.
- The owning feature unmounted before submission.

How to fix:

- Call `useActionExecutor` inside the page or feature component that owns the business logic.
- Check DevTools for bound executors.

### OMNI_EXECUTION_FAILED

Meaning: The executor threw or returned a failed execution result.

Common causes:

- The underlying service failed.
- The action was valid, but the business state rejected it.

How to fix:

- Handle domain failures inside the executor.
- Return a structured rejected or pending result when the operation is not complete.

### Unverified Execution Result

Meaning: The executor returned `void` instead of a structured result.

Common causes:

- Legacy executor code mutates state but does not return a result.

How to fix:

- Return `{ status: "changed" }`, `{ status: "noop", reason }`, `{ status: "rejected", reason }`, or `{ status: "pending", operationId }`.

## Turn and Dispatch

### OMNI_TURN_NOT_FOUND

Meaning: A caller tried to submit, confirm, or cancel an unknown turn.

Common causes:

- The turn id is stale.
- The turn store was reset.

How to fix:

- Resolve the input again and use the returned turn id.

### OMNI_TURN_NOT_SUBMITTABLE

Meaning: The turn exists but is not in a state that can be submitted.

Common causes:

- The turn has no accepted command.
- The turn is waiting for confirmation.

How to fix:

- Inspect the turn in DevTools.
- Confirm or resolve the command again.

### OMNI_VOICE_PARTIAL_NOT_SUBMITTABLE

Meaning: A voice partial preview was submitted before the final ASR event.

Common causes:

- The ASR adapter treated partial input as final.

How to fix:

- Submit only final `VoiceInput` events.
- Keep partials as UI previews.

### OMNI_DISPATCH_CANCELLED

Meaning: The dispatch was cancelled before completion.

Common causes:

- A newer turn superseded the current one.
- The caller aborted the operation.

How to fix:

- Re-run the command if it is still relevant.
- Avoid submitting obsolete turns after route changes.
