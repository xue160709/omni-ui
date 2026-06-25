import * as React from "react"
import {
  CommandInput,
  MultimodalGroup,
  MultimodalPage,
  MultimodalProvider,
  defineAction,
  defineMultimodalConfig,
  useActionExecutor,
} from "@omni-ui/react"

type Todo = {
  id: string
  title: string
  completed: boolean
}

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
  voiceAliases: ["完成", "标记完成"],
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
      <TodoPage />
    </MultimodalProvider>
  )
}

function TodoPage() {
  const [todos, setTodos] = React.useState<Todo[]>([
    { id: "todo_1", title: "Review launch checklist", completed: false },
    { id: "todo_2", title: "Send design notes", completed: false },
  ])

  useActionExecutor(
    completeTodo,
    async ({ todoId }) => {
      setTodos((current) =>
        current.map((todo) =>
          todo.id === todoId ? { ...todo, completed: true } : todo
        )
      )
      return { status: "changed" }
    },
    {
      conflictKey: ({ params }) => `todo:${params.todoId}`,
    }
  )

  return (
    <MultimodalPage id="page.todos" title="Todos" route="/todos">
      <main>
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
              <li>
                <label>
                  <input
                    type="checkbox"
                    checked={todo.completed}
                    onChange={() =>
                      setTodos((current) =>
                        current.map((item) =>
                          item.id === todo.id ? { ...item, completed: !item.completed } : item
                        )
                      )
                    }
                  />
                  {todo.title}
                </label>
              </li>
            </MultimodalGroup>
          ))}
        </ul>
      </main>
    </MultimodalPage>
  )
}
