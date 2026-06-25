# Changelog

## Unreleased

- Keep `submitTurn(turnId)` source-compatible while reporting invalid turn submissions with stable `OmniError` codes.
- Add `trySubmitTurn(turnId)` for non-throwing turn submission handling.
- Keep voice partial turns as non-submittable listening previews and record `focusout` as focus state instead of navigation.

## 0.3.0

- Add resolver plugin contracts and rule-first resolver pipeline.
- Add opt-in LLM resolver support with safe candidate validation.
- Add docs demo controls for rule and LLM resolver behavior.

## 0.2.0

- Expand shadcn registry wrappers beyond the initial controls.
- Add shared wrapper utilities and consistent interaction props.
- Improve Dialog, FormField, Card, ListItem, Select, Tabs, and Command semantics.
- Add Snapshot DevTools filters.

## 0.1.0

- Add runtime-first core, React provider, DOM/ARIA extraction, action registry, visible-speak resolver, feedback states, shadcn registry MVP, and docs demo.
