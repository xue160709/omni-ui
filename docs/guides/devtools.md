# DevTools

OmniUI DevTools helps inspect the command lifecycle during development. It is optional and should not be treated as a production dependency.

## What You Can Inspect

- Current page
- Visible entities
- Registered actions
- Bound executors
- Resolver chain
- Last user input
- Candidate command
- CommandEnvelope
- Validation result
- Policy and confirmation result
- Execution result
- Runtime errors

## Recommended During Development

Enable DevTools in local development and staging when you need to debug resolver or executor behavior. Do not expose sensitive snapshot data in production.

## Troubleshooting Flow

1. Check whether `MultimodalProvider` is mounted.
2. Check whether the current `MultimodalPage` is registered.
3. Check whether entities have stable ids and labels.
4. Check whether the action exists.
5. Check whether the executor is bound.
6. Check whether resolver output matches the action schema.
7. Check whether policy or confirmation rejected the command.
8. Check whether the executor returned a structured result.

## Import

DevTools are exported from the optional `@omni-ui/react/devtools` entry so production bundles can keep the main runtime path small.
