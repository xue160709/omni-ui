# VUI + GUI Runtime Refactor Baseline

Date: 2026-06-24

Spec: `OMNI_UI_VUI_GUI_RUNTIME_REFACTOR_SPEC.md`

Current commit SHA: `10a2277ede0cd0f17d43626d38e5e549a1398eb4`

Baseline command:

```bash
npm run verify
```

Baseline result: passed.

Observed baseline coverage:

- `@omni-ui/core`: 5 test files, 24 tests passed.
- `@omni-ui/react`: 1 test file, 19 tests passed.
- `@omni-ui/shadcn`: 1 test file, 1 test passed.
- `apps/docs`: 1 test file, 28 tests passed.
- Runtime package builds and docs production build passed.

Worktree note: `.DS_Store` and `.gitignore` already had local modifications before the refactor work in this thread.
