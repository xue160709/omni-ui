# @omni-ui/react

React runtime for OmniUI.

Use this package when you want to add text, voice, chat, keyboard, or AI-assisted command surfaces to an existing React app without replacing your UI library or business state.

## Install

```bash
npm install @omni-ui/react
```

`@omni-ui/react` depends on `@omni-ui/core` and re-exports the common core APIs, so most React apps only need this package.

Import default styles explicitly:

```ts
import "@omni-ui/react/styles.css"
```

The root entry does not import CSS automatically.

## Basic Usage

This mirrors [`examples/react-vite-minimal`](../../examples/react-vite-minimal/).

```tsx
import {
  CommandInput,
  MultimodalGroup,
  MultimodalPage,
  MultimodalProvider,
  defineAction,
  defineMultimodalConfig,
  useActionExecutor,
} from "@omni-ui/react"

const completeTodo = defineAction<{ todoId: string }>({
  id: "todo.complete",
  title: "Complete todo",
  attachTo: { entityType: "todo" },
  executeScope: "object",
  risk: "low",
  modelCallable: false,
  paramsFrom: ({ target }) => ({ todoId: target.entity?.id }),
  paramsSchema: {
    safeParse(input) {
      const value = input as Record<string, unknown>
      return typeof value.todoId === "string"
        ? { success: true, data: { todoId: value.todoId } }
        : { success: false, error: "todoId must be a string" }
    },
  },
})

const config = defineMultimodalConfig({
  rules: [
    {
      id: "todo.complete",
      patterns: ["完成第{item}个任务", "完成{target}"],
      target: "entity.todo.byLabelOrIndex",
      actionId: "todo.complete",
    },
  ],
})

export function App() {
  return (
    <MultimodalProvider config={config}>
      <MultimodalPage id="page.todos" title="Todos" route="/todos">
        <CommandInput aria-label="Command" placeholder="完成第一个任务" />
        <TodoList />
      </MultimodalPage>
    </MultimodalProvider>
  )
}

function TodoList() {
  useActionExecutor(completeTodo, async ({ todoId }) => {
    await completeTodoInYourStore(todoId)
    return { status: "changed" }
  })

  return todos.map((todo) => (
    <MultimodalGroup
      key={todo.id}
      id={`todo.item.${todo.id}`}
      role="list_item"
      label={todo.title}
      entity={{ type: "todo", id: todo.id }}
      state={{ completed: todo.completed }}
    >
      <TodoItem todo={todo} />
    </MultimodalGroup>
  ))
}
```

Domain actions such as `todo.complete`, `issue.close`, or `order.refund` are app-owned. OmniUI provides the runtime, snapshot, resolver chain, validation, and dispatch path.

Executors should return structured results such as `{ status: "changed" }`, `{ status: "noop", reason }`, `{ status: "rejected", reason }`, or `{ status: "pending", operationId }`. Legacy `void` returns are preserved for compatibility but are reported as `unverified`.

## Main APIs

- `MultimodalProvider`: runtime provider and resolver configuration.
- `CommandInput`: local text command input surface.
- `MultimodalPage`: registers the current page context.
- `MultimodalGroup`: registers semantic business objects such as rows, cards, dialogs, and panels.
- `useActionExecutor`: binds an app-owned executor to an action.
- `useInteractionRoutes`: registers global route targets and the built-in navigation action.
- `useInteractionApi`: low-level snapshot, text/voice resolution, turn lookup, confirmation, cancellation, and dispatch APIs.
- `useVoiceAdapter`: connects an ASR adapter that emits `VoiceInput` partial/final events.
- `useAssistantConversation`: chat state, local fast path, LLM fallback, and confirmation flow.

For model-triggered actions, enable both runtime policy and the action spec (`modelCallable: true`). Risky actions can require confirmation.

## More Documentation

- [Quick Start](../../docs/getting-started/quick-start.md)
- [DevTools](../../docs/guides/devtools.md)
- [Error Codes](../../docs/troubleshooting/error-codes.md)
- [Security and Model Keys](../../docs/architecture/security.md)
