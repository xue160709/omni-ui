# @omni-ui/react

React runtime for OmniUI.

Use this package when you want to add voice, chat, keyboard, or other multimodal command surfaces to an existing React app without replacing your current UI library.

## Install

```bash
npm install @omni-ui/react
```

`@omni-ui/react` depends on `@omni-ui/core` and re-exports the common core APIs, so most React apps only need this package.

## Basic Usage

```tsx
import {
  defineMultimodalConfig,
  MultimodalProvider,
  MultimodalPage,
  MultimodalGroup,
  useInteractionActions,
} from "@omni-ui/react"

const multimodalConfig = defineMultimodalConfig({
  rules: [
    {
      id: "todo.complete",
      patterns: ["complete {todo}", "finish {todo}"],
      target: "entity.todo.byLabelOrIndex",
      actionId: "todo.complete",
    },
  ],
})

export function App() {
  return (
    <MultimodalProvider config={multimodalConfig}>
      <TodoPage />
    </MultimodalProvider>
  )
}

function TodoPage() {
  useInteractionActions({
    namespace: "todo",
    actions: {
      "todo.complete": {
        attachTo: { entityType: "todo" },
        executeScope: "object",
        modelCallable: true,
        risk: "low",
        paramsFrom: ({ target }) => ({ todoId: target.entity?.id }),
        availableWhen: ({ target }) => target.state?.completed === false,
      },
    },
    execute: (action) => {
      completeTodo(String(action.todoId))
      return { status: "changed" }
    },
  })

  return (
    <MultimodalPage id="page.todos" title="Todos" route="/todos">
      {todos.map((todo) => (
        <MultimodalGroup
          key={todo.id}
          id={`todo.item.${todo.id}`}
          role="list_item"
          label={todo.title}
          entity={{ type: "todo", id: todo.id }}
          state={{ completed: todo.completed }}
        >
          <button onClick={() => completeTodo(todo.id)}>Complete</button>
          {todo.title}
        </MultimodalGroup>
      ))}
    </MultimodalPage>
  )
}
```

Domain actions such as `todo.complete`, `issue.close`, or `order.refund` are app-owned. The library provides the runtime, snapshot, resolver chain, validation, and dispatch path.

## Main APIs

- `MultimodalProvider`: runtime provider and resolver configuration.
- `MultimodalPage`: registers the current page context.
- `MultimodalGroup`: registers semantic business objects such as rows, cards, dialogs, and panels.
- `useInteractionNode`: registers an existing DOM control with multimodal semantics.
- `useInteractionRoutes`: registers global route targets and the built-in `navigation.goto` action.
- `useInteractionActions`: registers app-owned action specs and executors.
- `useInteractionApi`: low-level snapshot, text/voice resolution, turn lookup, confirmation, cancellation, and dispatch APIs.
- `useVoiceAdapter`: connects an ASR adapter that emits `VoiceInput` partial/final events.
- `useAssistantConversation`: chat state, local fast path, LLM fallback, and confirmation flow.

For model-triggered actions, enable both the assistant/runtime policy and the action spec (`modelCallable: true`). Risky actions can require confirmation; confirmation stores and dispatches the frozen command for the original turn rather than reparsing model text.

## More Documentation

See the integration guide at [`packages/教程.md`](../教程.md).
