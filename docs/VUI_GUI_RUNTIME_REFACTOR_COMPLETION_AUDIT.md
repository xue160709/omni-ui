# Unified Runtime + DX Refactor Completion Audit

Date: 2026-06-25

Spec: `OMNI_UI_UNIFIED_RUNTIME_DX_REFACTOR_SPEC.md`

Baseline HEAD: `e06a7191f61c22da5975ddd41963162eac2b8662`

This audit maps the unified runtime/DX checklist to repository evidence and repeatable verification commands.

## Verification Snapshot

Commands run successfully:

```bash
npm --workspace @omni-ui/core run build
npm --workspace @omni-ui/core run test
npm --workspace @omni-ui/react run build
npm --workspace @omni-ui/react run test
npm run verify:package-consumer
npm run verify:registry
npm run verify:examples
npm run verify
```

Observed passing coverage:

- `@omni-ui/core`: 20 test files, 87 tests passed.
- `@omni-ui/react`: 1 test file, 37 tests passed.
- `@omni-ui/shadcn`: 1 test file, 1 test passed.
- `apps/demo-todo`: 1 test file, 28 tests passed.
- `examples/react-vite-minimal`: typecheck and production build passed.
- `npm pack` consumer verification passed for `@omni-ui/core` and `@omni-ui/react`.
- Registry build generated 54 public registry items in `apps/demo-todo/public/r`.

## Definition of Done Evidence

| Requirement | Status | Evidence |
| --- | --- | --- |
| Turn is the single source of truth for hypotheses, candidates, decisions, commands, and results. | Done | `packages/core/src/turn.ts`, `packages/core/src/turn-store.ts`, and `packages/react/src/runtime.tsx`; covered by `packages/core/test/turn-store.test.ts` and `packages/react/test/runtime.test.tsx`. |
| Partial/final voice input in the same session stays in the same Turn. | Done | Voice session reuse is implemented in `resolveVoice`; covered by `keeps partial and final voice input in the same session turn`. |
| Each Turn has independent cancellation and CAS write protection. | Done | Turn store CAS and per-turn abort controllers prevent late writes; covered by turn store and runtime tests. |
| Terminal Turns are immutable and active pointer never returns terminal Turns. | Done | `isTerminalTurnStatus` and active cleanup live in `packages/core/src/turn.ts` and `packages/core/src/turn-store.ts`. |
| Resolver V2 emits hypotheses and Fusion uses formal temporal context. | Done | `packages/core/src/resolution.ts` and `packages/core/src/fusion-context.ts`; legacy resolvers adapt into `ResolutionBundle`. |
| No first-item fallback remains in Fusion/Runtime execution. | Done | Removed target/action first fallback; `action_ambiguous` clarification is tested in `packages/core/test/fusion.test.ts`. |
| Commands are built from Turn decisions and no snapshot is forged. | Done | `buildCommandFromTurnDecision` and `submitTurn(turnId)` replace formal `lastResolution` execution. |
| Confirmation binds frozen commands and tolerates only irrelevant state drift. | Done | Confirmation grants bind command fingerprints; dispatcher keeps strict context/focus validation and has explicit irrelevant state-drift coverage in `packages/core/test/dispatcher.test.ts`. |
| Dispatcher publishes realtime phases and Trace uses real phase timing. | Done | `DispatchPhaseEvent` flows through React turn phase history and `packages/core/src/observability.ts`. |
| Provider uses shared conflict lock. | Done | React runtime passes one `CommandConflictLock` through domain, primitive, batch, confirmation, and Turn submission paths. |
| Stale policy defaults strict. | Done | `defineAction` defaults `stalePolicy` to `strict`; dispatcher validates anchor state, context hash, context epoch, and focus revision. |
| Action events and Focus form a feedback loop. | Done | Committed action events update semantic focus only after committed dispatch results. |
| Public API separates root, advanced, devtools, testing, server, protocol, and styles. | Done | Package exports exist for `@omni-ui/core/advanced`, `server`, `testing`, `protocol`; React exports include `advanced`, `devtools`, `server`, `testing`, `styles`. |
| `defineAction` and `useActionExecutor` are available. | Done | Implemented in core and React, with minimal Vite example using both. |
| `modelCallable` defaults false. | Done | `defineAction` and registry normalization keep model execution opt-in. |
| Errors use stable `OmniError` codes. | Done | `packages/core/src/errors.ts` provides stable error constants and mapping helpers. |
| DevTools are Turn/Trace based and support diagnostics/export. | Done | `packages/react/src/devtools.tsx` renders turns, candidates, evidence, phases, result status, diagnostics, and sanitized export. |
| Snapshot/Trace/Event privacy boundary remains intact. | Done | Existing privacy redaction remains covered by core privacy tests; DevTools export is sanitized. |
| README and five-minute tutorial are consumer-first and need no API key. | Done | `README.md`, `README_CN.md`, and `examples/react-vite-minimal` use local actions first. |
| Example source is unambiguous. | Done | Todo demo is `apps/demo-todo`; registry/docs references were updated away from `apps/docs`. |
| Package consumer CI, CSS export, peer dependencies, and guides exist. | Done | `npm run verify:package-consumer`, `@omni-ui/react/styles`, React 18/19 peer range, and guides under `docs/guides/`. |
| Changesets/release/protocol docs exist. | Done | `.changeset/config.json`, `docs/release.md`, and `@omni-ui/core/protocol` with version negotiation and envelopes. |

## Notes

- `packages/react/src/runtime.tsx` is still intentionally the composition layer; the lower-level safety, resolution, store, protocol, and observability behavior now lives in core modules with focused tests.
- The standalone CLI package remains a future release surface on top of the now-exported protocol/server/testing APIs; this implementation added the protocol anchor and package-consumer checks that the CLI would depend on.
