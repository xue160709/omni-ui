# VUI + GUI Runtime Refactor Completion Audit

Date: 2026-06-25

Spec: `OMNI_UI_VUI_GUI_RUNTIME_REFACTOR_SPEC.md`

This audit maps the spec Definition of Done to current repository evidence. It is meant to make review reproducible rather than relying on a conversational summary.

## Verification Snapshot

Commands run successfully:

```bash
npm run verify
npm run verify:registry
```

Observed passing coverage:

- `@omni-ui/core`: 18 test files, 81 tests passed.
- `@omni-ui/react`: 1 test file, 36 tests passed.
- `@omni-ui/shadcn`: 1 test file, 1 test passed.
- `apps/docs`: 1 test file, 28 tests passed.
- Runtime package builds, docs production build, and registry generation passed.
- Registry build generated 54 public registry items.

## Definition of Done Evidence

| Requirement | Status | Evidence |
| --- | --- | --- |
| All execution paths enter the unified Dispatcher. | Done | Domain, primitive, confirmation, and batch paths call `dispatchCommand` / `dispatchBatchCommands` in `packages/react/src/runtime.tsx`; dispatcher behavior is covered by `packages/core/test/dispatcher.test.ts`, `packages/core/test/batch.test.ts`, and `packages/react/test/runtime.test.tsx`. |
| Detached resolutions without an anchor cannot execute. | Done | `dispatchResolution` returns `missing_anchor`; dispatcher rejects missing anchors. Covered by `packages/core/test/p0-regression.todo.test.ts` and React runtime tests. |
| action-target, capability, scope, enabled, schema, confirmation, and authorization are checked before execution. | Done | Validator chain is implemented in `packages/core/src/dispatcher.ts`; legacy validation is hardened in `packages/core/src/action-registry.ts`. Covered by dispatcher, action-registry, scope, schema, and P0 regression tests. |
| Confirmation is not bound only to `actionId` and model text is not reparsed. | Done | Confirmation grants bind frozen `CommandEnvelope` canonical data in `packages/core/src/confirmation.ts`; assistant conversation calls `interaction.confirmTurn(turnId)`. Covered by P0 confirmation tests and React confirmation tests. |
| Primitive unsupported/no-op results are not reported as success. | Done | Primitive execution returns structured statuses in `packages/react/src/primitive-executor.ts`; dispatch maps unsupported/noop distinctly. Covered by P0 primitive tests and runtime tests. |
| password/OTP/API key values are excluded from model context and trace by default. | Done | Model projection and event redaction live in `packages/core/src/privacy.ts`; DOM extraction avoids sensitive values. Covered by privacy tests and P0 sensitive regression tests. |
| Model actions default to off or double allowlist. | Done | Assistant default policy is `mode: "off"`; model proposals require runtime policy and `modelCallable: true`. Covered by assistant policy tests and React model policy tests. |
| Runtime has formal InteractionTurn, cancellation, and supersede protection. | Done | Turn state and transition reducer live in `packages/core/src/turn.ts`; runtime stores turns and abort controllers. Covered by turn tests and P0 stale resolver tests. |
| Event Buffer and UnifiedFocus are injected into Snapshot. | Done | Implemented in `packages/core/src/events.ts`, `packages/core/src/focus.ts`, `packages/core/src/snapshot.ts`, and React runtime event capture. Covered by events, focus, snapshot, fusion, and React deictic tests. |
| Deictic references such as this/that/it can use recent GUI behavior. | Done | Fusion uses `UnifiedFocus` and recent targets; React records GUI events. Covered by fusion deictic test and React recent GUI semantic focus test. |
| Same-label objects do not silently choose the first target. | Done | Fusion returns clarification when scores are close; resolver no longer relies on first match for ambiguous labels. Covered by fusion, resolver, and React same-label clarification tests. |
| Modal scope is a hard execution constraint. | Done | `packages/core/src/scope.ts` is called by dispatcher and fusion hard filters. Covered by scope tests and React modal-first tests. |
| ASR partial never executes; final creates/submits the formal turn. | Done | `resolveVoice` handles partial preview turns; `submitVoice` submits finals. `VoiceAdapter` seam is exposed in `packages/react/src/voice.ts`. Covered by partial, n-best, VoiceAdapter, and voice clarification tests. |
| Executor results distinguish committed/noop/pending/unverified/rejected/failed. | Done | Structured dispatch statuses live in `packages/core/src/command.ts` and dispatcher normalization. Covered by dispatcher, verification, batch, and assistant reply tests. |
| Registry cleanup uses owner token. | Done | React runtime assigns `ownerId` to registrations and only disposes matching owners. Covered by duplicate group/action registration tests. |
| Unit, React integration, concurrency, and privacy tests pass. | Done | `npm run verify` passes core and React suites; P0 stale resolver and privacy tests cover concurrency and redaction. |
| README, migration notes, and examples are synchronized. | Done | `README.md`, `README_CN.md`, `packages/react/README.md`, and `packages/教程.md` document Dispatcher, Turn APIs, `interaction_hypotheses`, `VoiceAdapter`, confirmation, and verification commands. |
| `npm run verify` passes. | Done | Verified on 2026-06-25. |

## Additional Implemented Spec Items

- LLM semantic hypotheses are supported by `packages/core/src/llm-resolver.ts` and assistant model replies via `interaction_hypotheses`.
- Assistant model output remains a proposal; Runtime/Fusion/Dispatcher perform local arbitration and execution.
- `ActionTransactionAdapter` support covers atomic batch dispatch when a transaction adapter is supplied.
- Postcondition verification waits for refreshed snapshots before classifying execution as committed or failed.
- Public shadcn registry output is regenerated and verified separately with `npm run verify:registry`.

## Residual Non-Blocking Notes

- `packages/react/src/runtime.tsx` remains a large module. The highest-risk behavior has been moved into deeper core modules and tested, but further mechanical extraction could improve locality later.
- The project has a large in-flight refactor diff. Review should prefer reading by module clusters: core safety chain, React runtime bridge, assistant/LLM proposal path, shadcn registry, and docs.
