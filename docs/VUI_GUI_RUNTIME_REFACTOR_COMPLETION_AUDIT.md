# Unified Runtime + DX Refactor Completion Audit

Date: 2026-06-26

Spec: `OMNI_UI_UNIFIED_RUNTIME_DX_REFACTOR_SPEC.md` + `OMNI_UI_A4DC4D2_RUNTIME_REVIEW_FIX_SPEC.md`

Review baseline: `a4dc4d2b27f5aea1a865b753d2816186eb43bb4e`

This audit maps the unified runtime/DX checklist to repository evidence and repeatable verification commands.

## Verification Snapshot

Commands run successfully:

```bash
npm --workspace @omni-ui/core run build
npm --workspace @omni-ui/core run test
npm --workspace @omni-ui/react run typecheck
npm --workspace @omni-ui/react run test
npm run build:runtime
npm run verify:package-consumer
```

Observed passing coverage:

- `@omni-ui/core`: 21 test files, 96 tests passed.
- `@omni-ui/react`: 1 test file, 44 tests passed.
- `build:runtime`: core and React production builds passed.
- `verify:package-consumer`: package tarball smoke, demo-todo package-consumer typecheck, 28 tests, and production build passed.

## Definition of Done Evidence

| Requirement | Status | Evidence |
| --- | --- | --- |
| Turn is the single source of truth for hypotheses, candidates, decisions, commands, and results. | Done | `packages/core/src/turn.ts`, `packages/core/src/turn-store.ts`, and `packages/react/src/runtime.tsx`; `TurnEvent` is a domain event union, `submitUtterance` routes through Turn submission, and tests cover partial guards, late result cancellation, frozen params, confirmation, phase history, and lifecycle events. |
| Partial/final voice input in the same session stays in the same Turn. | Done | Voice session reuse is implemented in `resolveVoice`; covered by `keeps partial and final voice input in the same session turn`. |
| Each Turn has independent cancellation and CAS write protection. | Done | Turn store CAS and per-turn abort controllers prevent late writes; covered by turn store and runtime tests. |
| Terminal Turns are immutable and active pointer never returns terminal Turns. | Done | `isTerminalTurnStatus` and active cleanup live in `packages/core/src/turn.ts` and `packages/core/src/turn-store.ts`. |
| Resolver V2 emits hypotheses and Fusion uses formal temporal context. | Done | `packages/core/src/resolution.ts` and `packages/core/src/fusion-context.ts`; legacy resolvers adapt into hypotheses, resolver mode is honored, and `ResolutionBundle` now exposes `fusionSummary` instead of retaining full `FusionContext`. |
| No first-item fallback remains in Fusion/Runtime execution. | Done | Removed target/action first fallback; `action_ambiguous` clarification is tested in `packages/core/test/fusion.test.ts`. |
| Commands are built from Turn decisions and no snapshot is forged. | Done | `buildCommandFromTurnDecision` and `submitTurn(turnId)` use frozen Turn decisions; `dispatchResolution` without provenance is rejected. |
| Confirmation binds frozen commands and tolerates only irrelevant state drift. | Done | Confirmation grants bind command fingerprints; dispatcher keeps strict context/focus validation and tests cover explicit strict, revalidate, `stateKeys`, context epoch, and primitive strictness. |
| Dispatcher publishes realtime phases and Trace uses real phase timing. | Done | `DispatchPhaseEvent` flows through React turn phase history and lifecycle events; non-status-changing phases are retained. |
| Provider uses shared conflict lock. | Done | React runtime passes one `CommandConflictLock` through domain, primitive, batch, confirmation, and Turn submission paths. |
| Stale policy defaults strict. | Done | `defineAction` defaults `stalePolicy` to `strict`; dispatcher reads action `stalePolicy`, supports `revalidate.stateKeys`, and keeps primitive commands strict. |
| Action events and Focus form a feedback loop. | Done | Dispatcher validation/execution/verification/result lifecycle events are recorded with command provenance; semantic focus updates only after committed dispatch results. |
| Public API separates root, advanced, devtools, testing, server, protocol, and styles. | Done | Package exports exist for `@omni-ui/core/advanced`, `server`, `testing`, `protocol`; React exports include `advanced`, `devtools`, `server`, `testing`, `styles`. |
| `defineAction` and `useActionExecutor` are available. | Done | Implemented in core and React, with minimal Vite example using both. |
| `modelCallable` defaults false. | Done | `defineAction` and registry normalization keep model execution opt-in. |
| Errors use stable `OmniError` codes. | Done | `packages/core/src/errors.ts` provides stable error constants and mapping helpers. |
| DevTools are Turn/Trace based and support diagnostics/export. | Done | `packages/react/src/devtools.tsx` renders turns, candidates, evidence, phases, result status, diagnostics, and sanitized export. |
| Snapshot/Trace/Event privacy boundary remains intact. | Done | Existing privacy redaction remains covered by core privacy tests; DevTools export is sanitized. |
| README and five-minute tutorial are consumer-first and need no API key. | Done | `README.md`, `README_CN.md`, and `examples/react-vite-minimal` use local actions first; low-level docs now prefer Turn submission and move legacy dispatch into migration guidance. |
| Example source is unambiguous. | Done | Todo demo is `apps/demo-todo`; legacy docs-app references were updated. |
| Package consumer CI, CSS export, peer dependencies, and guides exist. | Done | `npm run verify:package-consumer`, `@omni-ui/react/styles.css`, React 18/19 peer range, and guides under `docs/guides/`. |
| Changesets/release/protocol docs exist. | Done | `.changeset/config.json`, `docs/release.md`, and `@omni-ui/core/protocol` with version negotiation and envelopes. |

## Notes

- `packages/react/src/runtime.tsx` is now the Provider/context/hooks composition layer. Runtime-specific helpers were split into `runtime-types.ts`, `runtime-snapshot.ts`, `runtime-dispatch.ts`, `runtime-resolution.ts`, and `runtime-voice.ts`; `runtime.tsx` dropped from 4080 to 2746 lines in this review pass.
- The standalone CLI package remains a future release surface on top of the now-exported protocol/server/testing APIs; this implementation added the protocol anchor and package-consumer checks that the CLI would depend on.
