# Multimodal UI

Runtime-first multimodal interaction primitives for React and shadcn/ui.

Multimodal UI turns the current GUI into a compact Interaction Snapshot, resolves visible speech commands such as "click add" or "complete the first item", validates the requested action, and dispatches through the same command handler used by GUI clicks.

## Packages

- `@multimodal-ui/core`: framework-agnostic types, snapshot creation, action registry, resolver contracts, validation, and feedback primitives.
- `@multimodal-ui/react`: React runtime, DOM/ARIA extraction, provider, hooks, and default feedback styles.
- `@multimodal-ui/shadcn`: shadcn registry source for optional wrappers installed into `components/multimodal/*`.
- `apps/docs`: local mobile TodoList project with bottom tabs, todo detail screens, a floating Chatbot, settings, and registry output.

## Quick Start

Install dependencies and run the local TodoList app:

```bash
npm install
npm run dev
```

Open:

```text
http://127.0.0.1:5173/
```

The local app exposes `/`, `/todos`, and `/settings`. Chatbot is a global floating sheet opened from the bottom tab, so it stays available while you move between pages. Enter your SiliconFlow API key in the Settings tab before sending messages.

You can also set `SILICONFLOW_API_KEY` before starting Vite as a server-side fallback, but local UI usage should go through Settings.

Do not open `apps/docs/index.html` directly with `file://`; the TodoList app and registry output are served by Vite.

Try these utterances in the demo:

```text
完成第一个
打开 Chatbot
只看今天
清空已完成
把买牛奶那个完成
只显示还没做完的
```

## Minimal React Usage

```tsx
import {
  MultimodalProvider,
  MultimodalPage,
  MultimodalGroup,
  useInteractionActions,
} from "@multimodal-ui/react"

function App() {
  return (
    <MultimodalProvider>
      <MultimodalPage id="page.todo" title="Todo" route="/todo">
        <TodoPage />
      </MultimodalPage>
    </MultimodalProvider>
  )
}

function TodoItem({ todo, executeTodoAction }) {
  return (
    <MultimodalGroup
      id={`todo.item.${todo.id}`}
      role="list_item"
      label={todo.title}
      entity={{ type: "todo", id: todo.id }}
    >
      <button onClick={() => executeTodoAction({ type: "todo.complete", todoId: todo.id })}>
        完成
      </button>
      <span>{todo.title}</span>
    </MultimodalGroup>
  )
}
```

Register domain actions once in the page:

```tsx
useInteractionActions({
  namespace: "todo",
  actions: {
    "todo.complete": {
      attachTo: { entityType: "todo" },
      executeScope: "object",
      paramsFrom: ({ target }) => ({ todoId: target.entity?.id }),
      availableWhen: ({ target }) => target.state?.completed === false,
    },
  },
  execute: executeTodoAction,
})
```

## shadcn Registry

The local registry is generated into `apps/docs/public/r`.

```bash
npm run registry:build
```

During local development, registry items are available at:

```text
http://127.0.0.1:5173/r/index.json
http://127.0.0.1:5173/r/multimodal-provider.json
```

The registry installs wrappers into `components/multimodal/*` and does not overwrite `components/ui/*`.

## Resolver Model

By default, the runtime uses the built-in rule resolver. It is offline and handles visible-speak commands against the current Interaction Snapshot.

LLM support is opt-in through the `IntentResolver` interface. The LLM can propose candidates, but it cannot execute actions directly; local validation still enforces scope, state version, availability, and confirmation policies.

Provider helpers read API keys from environment variables. Set `OPENAI_API_KEY` + `OPENAI_MODEL` or `ANTHROPIC_API_KEY` + `ANTHROPIC_MODEL`; optional base URLs can come from `OPENAI_BASE_URL` or `ANTHROPIC_BASE_URL`.

```ts
import { createOpenAIResolver } from "@multimodal-ui/react"

const resolver = createOpenAIResolver()
```

Use these helpers from a server or trusted runtime. In browser apps, keep API keys on your server and expose a small resolver endpoint.

```ts
const resolution = await resolver.resolve({ utterance, snapshot })
```

## Low-level Interaction API

The runtime is not tied to a specific dialog UI. Any input surface can call the API directly:

```tsx
import { useInteractionApi } from "@multimodal-ui/react"

function MyInput() {
  const interaction = useInteractionApi()

  async function send(text: string) {
    const snapshot = interaction.getSnapshot()
    const resolved = await interaction.resolveText(text)
    const submitted = await interaction.submitUtterance(text)

    return { snapshot, resolved, submitted }
  }
}
```

- `getSnapshot()` returns the current page, visible objects, state, focus, and registered actions.
- `resolveText(text)` calls the rule/LLM resolver and returns the proposed target/action without executing it.
- `submitUtterance(text)` resolves, validates, executes the matching domain or primitive action, and returns a structured result.

## Verification

```bash
npm run verify
```

The verification command runs typecheck, tests, registry generation, and production build.

## Version Roadmap

- `v0.1`: runtime-first visible-speak MVP.
- `v0.2`: richer shadcn wrappers, Dialog/FormField/Card/ListItem aggregation, and DevTools filters.
- `v0.3`: resolver plugins and opt-in LLM intent understanding.
- `v0.4`: gaze, gesture, keyboard target hints, and multimodal event fusion.
