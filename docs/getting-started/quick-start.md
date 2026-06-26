# Quick Start

This guide mirrors [`examples/react-vite-minimal`](../../examples/react-vite-minimal/). It runs a local text command without an LLM API key, microphone permission, shadcn/ui, or a server resolver.

## 1. Install

For published builds:

```bash
npm install @omni-ui/react
```

This repository is still alpha. If a package is not published in your npm environment yet, use the repository workflow:

```bash
npm install
npm run verify:package-consumer
```

## 2. Import CSS

OmniUI base styles are explicit. Import them once from your app entry:

```tsx
import "@omni-ui/react/styles.css"
```

`@omni-ui/react` does not import CSS from its root entry.

## 3. Define a Local Action

```tsx
import { defineAction } from "@omni-ui/react"

const completeTodo = defineAction<{ todoId: string }>({
  id: "todo.complete",
  title: "Complete todo",
  description: "Mark one todo as complete",
  attachTo: { entityType: "todo" },
  executeScope: "object",
  risk: "low",
  voiceCallable: true,
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
```

The action id is your domain contract. OmniUI does not ship business actions such as `todo.complete`; your app owns them.

## 4. Add a Local Rule

```tsx
import { defineMultimodalConfig } from "@omni-ui/react"

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
```

Configured rules run locally before optional external resolvers.

## 5. Mount the Runtime

```tsx
import { MultimodalProvider } from "@omni-ui/react"

export function App() {
  return (
    <MultimodalProvider config={config}>
      <TodoPage />
    </MultimodalProvider>
  )
}
```

## 6. Bind the Executor

```tsx
import { useActionExecutor } from "@omni-ui/react"

function TodoPage() {
  const [todos, setTodos] = React.useState([
    { id: "todo_1", title: "Review launch checklist", completed: false },
    { id: "todo_2", title: "Send design notes", completed: false },
  ])

  useActionExecutor(completeTodo, async ({ todoId }) => {
    setTodos((current) =>
      current.map((todo) =>
        todo.id === todoId ? { ...todo, completed: true } : todo
      )
    )
    return { status: "changed" }
  })

  return <TodoList todos={todos} />
}
```

Executors should return structured results such as `{ status: "changed" }`. Returning `void` is preserved for compatibility but is treated as unverified.

## 7. Mark the Page and Entities

```tsx
import { CommandInput, MultimodalGroup, MultimodalPage } from "@omni-ui/react"

function TodoList({ todos }: { todos: Array<{ id: string; title: string; completed: boolean }> }) {
  return (
    <MultimodalPage id="page.todos" title="Todos" route="/todos">
      <CommandInput aria-label="Command" placeholder="完成第一个任务" />
      <ul>
        {todos.map((todo) => (
          <MultimodalGroup
            key={todo.id}
            id={`todo.item.${todo.id}`}
            role="list_item"
            label={todo.title}
            entity={{ type: "todo", id: todo.id }}
            state={{ completed: todo.completed }}
          >
            <li>{todo.title}</li>
          </MultimodalGroup>
        ))}
      </ul>
    </MultimodalPage>
  )
}
```

## 8. Try the Command

Type this into `CommandInput`:

```text
完成第一个任务
```

Expected result:

- The local rule resolves the first visible `todo` entity.
- The runtime builds and validates a `CommandEnvelope`.
- Your `todo.complete` executor runs.
- The first Todo changes to completed state.

## Troubleshooting

- If nothing runs, confirm `MultimodalProvider` wraps the page.
- If no target is found, confirm each row has a stable `MultimodalGroup` id, label, and `entity.type`.
- If validation fails, inspect `paramsFrom` and `paramsSchema`.
- If the command resolves but does not execute, confirm `useActionExecutor` is mounted on the page that owns the state.
- During development, use [DevTools](../guides/devtools.md) and [Error Codes](../troubleshooting/error-codes.md).

## Next Steps

- Add an optional [server resolver](../guides/server-resolver.md) for LLM-backed commands.
- Read the [security guide](../architecture/security.md) before sending snapshots to model providers.
- Use the optional [shadcn guide](../guides/shadcn.md) if you want editable source components.
- Review the [release process](../release.md) before publishing packages.
