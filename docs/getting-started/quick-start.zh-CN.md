# Quick Start：5 分钟本地命令

这份教程与 [`examples/react-vite-minimal`](../../examples/react-vite-minimal/) 保持一致。首次接入不需要 LLM API Key、麦克风权限、shadcn/ui 或 server resolver。

## 1. 安装

发布包可用时：

```bash
npm install @omni-ui/react
```

当前仓库仍是 alpha。如果你的 npm 环境还没有对应发布包，请先在仓库内验证本地 tarball：

```bash
npm install
npm run verify:package-consumer
```

## 2. 导入 CSS

OmniUI 默认样式需要显式导入。请在应用入口导入一次：

```tsx
import "@omni-ui/react/styles.css"
```

`@omni-ui/react` 根入口不会自动导入 CSS。

## 3. 定义 Action

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

`todo.complete` 是你的业务约定。OmniUI 不内置 Todo、CRM、订单等业务 action。

## 4. 添加本地规则

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

本地规则会先于可选外部 resolver 执行。

## 5. 挂载 Runtime

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

## 6. 绑定 Executor

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

Executor 建议返回结构化结果，例如 `{ status: "changed" }`。返回 `void` 仍兼容旧代码，但会被视为未验证结果。

## 7. 标记页面和对象

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

## 8. 输入命令

在 `CommandInput` 中输入：

```text
完成第一个任务
```

预期结果：

- 本地 rule 找到第一个可见 `todo` 实体。
- Runtime 构造并校验 `CommandEnvelope`。
- 应用自己的 `todo.complete` executor 执行。
- 第一个 Todo 变成完成状态。

## 常见错误

- 没有任何响应：确认 `MultimodalProvider` 已包住当前页面。
- 找不到目标：确认每一行都有稳定的 `MultimodalGroup` id、label 和 `entity.type`。
- 参数校验失败：检查 `paramsFrom` 和 `paramsSchema`。
- 已解析但未执行：确认拥有业务状态的页面中调用了 `useActionExecutor`。
- 开发期排障可看 [DevTools](../guides/devtools.md) 和 [错误码](../troubleshooting/error-codes.md)。

## 下一步

- 需要 LLM 命令时，接入可选 [server resolver](../guides/server-resolver.md)。
- 向模型发送 snapshot 前，阅读 [安全与模型密钥说明](../architecture/security.md)。
- 想使用可编辑 shadcn 源码组件时，阅读 [shadcn guide](../guides/shadcn.md)。
- 发布前阅读 [release process](../release.md)。
