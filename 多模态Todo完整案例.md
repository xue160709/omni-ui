# 多模态 Todo 完整案例

这个案例用一个简单 Todo 功能说明：如何把 shadcn 风格的 GUI 页面升级成支持语音、手势、眼动、键盘等多模态交互的页面。

目标不是给每个控件写一堆语音命令，而是让系统运行时从 GUI 中自动生成 Interaction Snapshot，再让 LLM / NLU 基于快照理解用户意图，最后由确定性模块校验和执行。

## 1. 功能目标

Todo 页面支持这些基础能力：

- 新增待办。
- 勾选完成 / 取消完成。
- 删除待办。
- 编辑待办标题。
- 按全部 / 未完成 / 已完成过滤。
- 清理已完成。

用户可以用 GUI 操作，也可以用语音操作：

```text
添加一个待办：明天上午十点交周报
把第一个标记完成
删除买牛奶
只看未完成
清理已完成
把第二个改成下午三点开会
```

如果接入眼动或手势，还可以支持：

```text
看着某个待办说：“完成这个”
指向某个待办说：“删除这个”
看着输入框说：“输入买咖啡”
```

## 2. 页面结构

页面由四类对象组成：

```text
Page：Todo 页面
  ├─ Composer：新增待办组件
  │   ├─ Input：待办输入框
  │   └─ Button：添加按钮
  ├─ Filter Tabs：过滤器
  │   ├─ 全部
  │   ├─ 未完成
  │   └─ 已完成
  ├─ Todo List：待办列表容器
  │   ├─ Todo Item 1
  │   │   ├─ Checkbox
  │   │   ├─ Title
  │   │   ├─ Edit Button
  │   │   └─ Delete Button
  │   └─ Todo Item 2
  └─ Footer Actions
      └─ 清理已完成
```

重点是：用户语音通常不是直接说“点击第三个按钮”，而是说“完成第一个”“删除买牛奶”“只看未完成”。因此 Todo Item、Todo List、Page 都必须进入 Interaction Snapshot。

## 3. 数据模型

```ts
type Todo = {
  id: string
  title: string
  completed: boolean
  createdAt: number
  updatedAt: number
}

type TodoFilter = "all" | "active" | "completed"
```

页面状态：

```ts
type TodoPageState = {
  todos: Todo[]
  filter: TodoFilter
  draft: string
  editingTodoId?: string
}
```

## 4. 标准 Action Contract

Todo 页面对外暴露一组确定性 action：

```ts
type TodoAction =
  | {
      type: "todo.add"
      title: string
    }
  | {
      type: "todo.complete"
      todoId: string
    }
  | {
      type: "todo.uncomplete"
      todoId: string
    }
  | {
      type: "todo.toggle"
      todoId: string
    }
  | {
      type: "todo.delete"
      todoId: string
    }
  | {
      type: "todo.rename"
      todoId: string
      title: string
    }
  | {
      type: "todo.filter"
      filter: TodoFilter
    }
  | {
      type: "todo.clearCompleted"
    }
```

LLM 只能输出候选意图。真正执行时必须转换成这些业务 action。

底层 shadcn 组件仍然会提供 `press`、`check`、`select` 这类 primitive action，但 TodoItem、TodoList 和 TodoPage 聚合完成后，Snapshot 优先暴露 `todo.complete`、`todo.delete`、`todo.filter` 这些业务 action。primitive action 只作为内部执行能力或无聚合对象时的降级能力。

GUI 和多模态不能各写一套状态更新逻辑。这个案例使用同一个 `executeTodoAction`：

```text
GUI onClick / onValueChange
  ↓
executeTodoAction(TodoAction)

VUI / gaze / gesture
  ↓
LLM 输出候选意图
  ↓
Resolver 转成 TodoAction
  ↓
executeTodoAction(TodoAction)
```

## 5. shadcn 页面代码示例

下面是一个偏 shadcn 风格的页面结构。代码重点不是样式，而是多模态语义如何挂载。

```tsx
import * as React from "react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  MultimodalPage,
  MultimodalGroup,
  useInteractionActions,
} from "@/multimodal"

type Todo = {
  id: string
  title: string
  completed: boolean
  createdAt: number
  updatedAt: number
}

type TodoFilter = "all" | "active" | "completed"

export function TodoPage() {
  const [todos, setTodos] = React.useState<Todo[]>([
    {
      id: "todo_1",
      title: "买牛奶",
      completed: false,
      createdAt: Date.now() - 20000,
      updatedAt: Date.now() - 20000,
    },
    {
      id: "todo_2",
      title: "写周报",
      completed: false,
      createdAt: Date.now() - 10000,
      updatedAt: Date.now() - 10000,
    },
  ])
  const [draft, setDraft] = React.useState("")
  const [filter, setFilter] = React.useState<TodoFilter>("all")

  const visibleTodos = todos.filter((todo) => {
    if (filter === "active") return !todo.completed
    if (filter === "completed") return todo.completed
    return true
  })

  const executeTodoAction = React.useCallback((action: TodoAction) => {
    setTodos((current) => reduceTodos(current, action))

    if (action.type === "todo.filter") {
      setFilter(action.filter)
    }

    if (action.type === "todo.add") {
      setDraft("")
    }
  }, [])

  useInteractionActions<TodoAction>({
    namespace: "todo",
    actions: {
      "todo.add": {},
      "todo.complete": {},
      "todo.uncomplete": {},
      "todo.toggle": {},
      "todo.delete": { risk: "medium" },
      "todo.rename": {},
      "todo.filter": {},
      "todo.clearCompleted": { risk: "medium" },
    },
    execute: executeTodoAction,
  })

  return (
    <MultimodalPage
      id="page.todo"
      title="待办事项"
      route="/todo"
      actions={[
        "todo.add",
        "todo.filter",
        "todo.clearCompleted",
      ]}
      state={{
        filter,
        totalCount: todos.length,
        activeCount: todos.filter((todo) => !todo.completed).length,
        completedCount: todos.filter((todo) => todo.completed).length,
      }}
    >
      <section className="mx-auto max-w-xl space-y-4 p-6">
        <header>
          <h1 className="text-2xl font-semibold">待办事项</h1>
        </header>

        <MultimodalGroup
          id="todo.composer"
          role="composer"
          label="新增待办"
          entity={{ type: "todo_composer" }}
        >
          <div className="flex gap-2">
            <Input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="输入新的待办"
              aria-label="新的待办"
              interactionHint={{
                aliases: ["待办内容", "新任务", "新的待办"],
              }}
            />
            <Button
              onClick={() => {
                if (!draft.trim()) return
                executeTodoAction({
                  type: "todo.add",
                  title: draft.trim(),
                })
              }}
            >
              添加
            </Button>
          </div>
        </MultimodalGroup>

        <MultimodalGroup
          id="todo.filters"
          role="filter_tabs"
          label="待办过滤"
          entity={{ type: "todo_filter" }}
        >
          <Tabs
            value={filter}
            onValueChange={(value) =>
              executeTodoAction({
                type: "todo.filter",
                filter: value as TodoFilter,
              })
            }
          >
            <TabsList aria-label="待办过滤">
              <TabsTrigger value="all">全部</TabsTrigger>
              <TabsTrigger value="active">未完成</TabsTrigger>
              <TabsTrigger value="completed">已完成</TabsTrigger>
            </TabsList>
          </Tabs>
        </MultimodalGroup>

        <MultimodalGroup
          id="todo.list"
          role="list"
          label="待办列表"
          entity={{ type: "todo_list" }}
          indexBy="visible_order"
        >
          <ul className="space-y-2">
            {visibleTodos.map((todo) => (
              <TodoItem
                key={todo.id}
                todo={todo}
                onAction={executeTodoAction}
              />
            ))}
          </ul>
        </MultimodalGroup>

        <footer className="flex items-center justify-between text-sm">
          <span>{visibleTodos.length} 个可见待办</span>
          <Button
            variant="ghost"
            onClick={() => {
              executeTodoAction({ type: "todo.clearCompleted" })
            }}
          >
            清理已完成
          </Button>
        </footer>
      </section>
    </MultimodalPage>
  )
}
```

TodoItem 是一个组合组件，不应该只被抽成 Checkbox + Text + Button，而应该聚合成一个 Todo Item 对象。这里的 `MultimodalGroup` 只声明聚合边界和业务实体 ID；索引别名、业务 action 和 completed 状态都交给 Semantic Aggregator 从父级列表、action registry 和内部控件状态中推导。

```tsx
function TodoItem(props: {
  todo: Todo
  onAction: (action: TodoAction) => void
}) {
  const { todo, onAction } = props

  return (
    <MultimodalGroup
      id={`todo.item.${todo.id}`}
      role="list_item"
      label={todo.title}
      entity={{ type: "todo", id: todo.id }}
    >
      <li className="flex items-center gap-3 rounded-md border p-3">
        <Checkbox
          checked={todo.completed}
          onCheckedChange={() =>
            onAction({
              type: todo.completed ? "todo.uncomplete" : "todo.complete",
              todoId: todo.id,
            })
          }
          aria-label={todo.completed ? `取消完成 ${todo.title}` : `完成 ${todo.title}`}
        />
        <span
          className={todo.completed ? "flex-1 line-through text-muted-foreground" : "flex-1"}
        >
          {todo.title}
        </span>
        <Button
          variant="ghost"
          size="sm"
        >
          编辑
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            onAction({
              type: "todo.delete",
              todoId: todo.id,
            })
          }
        >
          删除
        </Button>
      </li>
    </MultimodalGroup>
  )
}
```

这个例子里有三条关键规则：

- `MultimodalGroup` 不再手写 `aliases`、`actions`、`state`。
- 删除、清理已完成等风险信息放在 action registry，而不是散落到每个按钮。
- GUI 点击和多模态执行都调用 `executeTodoAction`，没有平行状态更新路径。

Reducer 示例：

```ts
function reduceTodos(todos: Todo[], action: TodoAction): Todo[] {
  switch (action.type) {
    case "todo.add":
      return [...todos, createTodo(action.title)]

    case "todo.complete":
      return todos.map((todo) =>
        todo.id === action.todoId
          ? { ...todo, completed: true, updatedAt: Date.now() }
          : todo
      )

    case "todo.uncomplete":
      return todos.map((todo) =>
        todo.id === action.todoId
          ? { ...todo, completed: false, updatedAt: Date.now() }
          : todo
      )

    case "todo.toggle":
      return todos.map((todo) =>
        todo.id === action.todoId
          ? { ...todo, completed: !todo.completed, updatedAt: Date.now() }
          : todo
      )

    case "todo.delete":
      return todos.filter((todo) => todo.id !== action.todoId)

    case "todo.rename":
      return todos.map((todo) =>
        todo.id === action.todoId
          ? { ...todo, title: action.title, updatedAt: Date.now() }
          : todo
      )

    case "todo.clearCompleted":
      return todos.filter((todo) => !todo.completed)

    case "todo.filter":
      return todos
  }
}

function createTodo(title: string): Todo {
  return {
    id: crypto.randomUUID(),
    title,
    completed: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}
```

## 6. 运行时自动抽取结果

上面的 GUI 会先被抽成底层节点。

```json
{
  "page": {
    "id": "page.todo",
    "title": "待办事项",
    "route": "/todo"
  },
  "rawNodes": [
    {
      "id": "node.input.draft",
      "role": "textbox",
      "label": "新的待办",
      "value": "",
      "enabled": true,
      "primitiveActions": ["focus", "setText", "clear"]
    },
    {
      "id": "node.button.add",
      "role": "button",
      "label": "添加",
      "enabled": true,
      "primitiveActions": ["press"]
    },
    {
      "id": "node.tab.active",
      "role": "tab",
      "label": "未完成",
      "selected": false,
      "primitiveActions": ["select"]
    },
    {
      "id": "node.checkbox.todo_1",
      "role": "checkbox",
      "label": "完成 买牛奶",
      "checked": false,
      "primitiveActions": ["check", "uncheck", "toggle"]
    },
    {
      "id": "node.text.todo_1",
      "role": "text",
      "label": "买牛奶"
    },
    {
      "id": "node.button.delete.todo_1",
      "role": "button",
      "label": "删除",
      "primitiveActions": ["press"]
    }
  ]
}
```

## 7. Semantic Aggregator 聚合结果

Semantic Aggregator 会把底层节点聚合成更接近用户语言的对象。

这里的重点是：底层节点只有 `primitiveActions`，聚合对象才暴露 `todo.*` 业务 action。列表索引别名由 `todo.list` 的 `indexBy="visible_order"` 自动生成，风险信息来自 `useInteractionActions` 注册表。

```json
{
  "page": {
    "id": "page.todo",
    "type": "page",
    "title": "待办事项",
    "route": "/todo",
    "actions": [
      "todo.add",
      "todo.filter",
      "todo.clearCompleted"
    ],
    "actionSource": "registered_domain_actions",
    "state": {
      "filter": "all",
      "totalCount": 2,
      "activeCount": 2,
      "completedCount": 0
    }
  },
  "objects": [
    {
      "id": "todo.composer",
      "type": "composite",
      "role": "composer",
      "label": "新增待办",
      "children": [
        "node.input.draft",
        "node.button.add"
      ],
      "actions": ["todo.add"],
      "actionSource": "registered_domain_actions",
      "state": {
        "draft": ""
      }
    },
    {
      "id": "todo.filters",
      "type": "composite",
      "role": "filter_tabs",
      "label": "待办过滤",
      "actions": ["todo.filter"],
      "actionSource": "registered_domain_actions",
      "state": {
        "value": "all"
      },
      "options": [
        {
          "label": "全部",
          "value": "all"
        },
        {
          "label": "未完成",
          "value": "active"
        },
        {
          "label": "已完成",
          "value": "completed"
        }
      ]
    },
    {
      "id": "todo.list",
      "type": "container",
      "role": "list",
      "label": "待办列表",
      "indexBy": "visible_order",
      "state": {
        "count": 2,
        "filter": "all"
      },
      "items": [
        "todo.item.todo_1",
        "todo.item.todo_2"
      ]
    },
    {
      "id": "todo.item.todo_1",
      "type": "composite",
      "role": "list_item",
      "label": "买牛奶",
      "aliases": ["买牛奶", "第 1 个", "第 1 项"],
      "aliasSource": "list_index_adapter",
      "parent": "todo.list",
      "primaryControl": "node.checkbox.todo_1",
      "actions": [
        "todo.complete",
        "todo.uncomplete",
        "todo.toggle",
        "todo.delete",
        "todo.rename"
      ],
      "actionSource": "registered_domain_actions",
      "state": {
        "todoId": "todo_1",
        "index": 1,
        "title": "买牛奶",
        "completed": false
      }
    },
    {
      "id": "todo.item.todo_2",
      "type": "composite",
      "role": "list_item",
      "label": "写周报",
      "aliases": ["写周报", "第 2 个", "第 2 项"],
      "aliasSource": "list_index_adapter",
      "parent": "todo.list",
      "actions": [
        "todo.complete",
        "todo.uncomplete",
        "todo.toggle",
        "todo.delete",
        "todo.rename"
      ],
      "actionSource": "registered_domain_actions",
      "state": {
        "todoId": "todo_2",
        "index": 2,
        "title": "写周报",
        "completed": false
      }
    }
  ]
}
```

## 8. 完整 Interaction Snapshot

给 LLM / NLU 的不是原始 DOM，而是压缩后的交互快照：

```json
{
  "snapshotId": "snapshot_todo_042",
  "stateVersion": 42,
  "session": {
    "id": "session_todo_001",
    "language": "zh-CN",
    "device": "desktop"
  },
  "contextStack": [
    {
      "type": "page",
      "id": "page.todo",
      "title": "待办事项"
    }
  ],
  "page": {
    "id": "page.todo",
    "title": "待办事项",
    "route": "/todo"
  },
  "visibleObjects": [
    {
      "id": "todo.composer",
      "role": "composer",
      "label": "新增待办",
      "actions": ["todo.add"]
    },
    {
      "id": "todo.filters",
      "role": "filter_tabs",
      "label": "待办过滤",
      "state": {
        "value": "all"
      },
      "actions": ["todo.filter"],
      "options": ["全部", "未完成", "已完成"]
    },
    {
      "id": "todo.item.todo_1",
      "role": "list_item",
      "label": "买牛奶",
      "state": {
        "todoId": "todo_1",
        "index": 1,
        "completed": false
      },
      "actions": [
        "todo.complete",
        "todo.delete",
        "todo.rename"
      ]
    },
    {
      "id": "todo.item.todo_2",
      "role": "list_item",
      "label": "写周报",
      "state": {
        "todoId": "todo_2",
        "index": 2,
        "completed": false
      },
      "actions": [
        "todo.complete",
        "todo.delete",
        "todo.rename"
      ]
    }
  ],
  "focus": {
    "objectId": "todo.item.todo_2",
    "source": "gaze",
    "confidence": 0.76
  },
  "recentEvents": [
    {
      "modality": "gui",
      "type": "tap",
      "target": "todo.item.todo_2",
      "baseStateVersion": 41,
      "timestamp": 10001
    }
  ]
}
```

## 9. 语音意图理解示例

### 9.1 添加待办

用户说：

```text
添加一个待办：明天上午十点交周报
```

LLM 输出候选意图：

```json
{
  "intent": "create_todo",
  "target": "todo.composer",
  "params": {
    "title": "明天上午十点交周报"
  },
  "confidence": 0.96
}
```

Action Normalizer 转成业务 action：

```json
{
  "type": "todo.add",
  "title": "明天上午十点交周报"
}
```

反馈：

```json
{
  "gui": "新增一条待办，并高亮新建项",
  "vui": "已添加：明天上午十点交周报"
}
```

### 9.2 完成第一个

用户说：

```text
把第一个标记完成
```

LLM 输出：

```json
{
  "intent": "complete_todo",
  "targetHint": {
    "container": "todo.list",
    "index": 1
  },
  "confidence": 0.93
}
```

Target Resolver 查找 `todo.list` 的第一个 item：

```json
{
  "resolvedTarget": "todo.item.todo_1",
  "reason": "用户说第一个，当前待办列表中第一个对象是买牛奶"
}
```

最终 action：

```json
{
  "type": "todo.complete",
  "todoId": "todo_1"
}
```

### 9.3 完成这个

如果用户看着第二个待办说：

```text
完成这个
```

输入事件可能是：

```json
{
  "voice": {
    "text": "完成这个",
    "snapshotId": "snapshot_todo_042",
    "baseStateVersion": 42,
    "timestamp": 10005
  },
  "gaze": {
    "targetCandidate": "todo.item.todo_2",
    "confidence": 0.76,
    "snapshotId": "snapshot_todo_042",
    "baseStateVersion": 42,
    "timestamp": 10004
  }
}
```

LLM 输出：

```json
{
  "intent": "complete_todo",
  "deicticReference": "这个",
  "targetCandidates": [
    {
      "id": "todo.item.todo_2",
      "confidence": 0.88,
      "reason": "眼动焦点指向第二个待办"
    }
  ]
}
```

最终 action：

```json
{
  "type": "todo.complete",
  "todoId": "todo_2"
}
```

### 9.4 删除买牛奶

用户说：

```text
删除买牛奶
```

LLM 输出：

```json
{
  "intent": "delete_todo",
  "targetHint": {
    "label": "买牛奶"
  },
  "confidence": 0.94
}
```

因为删除是中风险操作，可以配置为无需二次确认但需要清晰反馈：

```json
{
  "type": "todo.delete",
  "todoId": "todo_1"
}
```

反馈：

```text
已删除：买牛奶
```

如果产品更谨慎，也可以要求确认：

```text
要删除“买牛奶”吗？
```

### 9.5 只看未完成

用户说：

```text
只看未完成
```

LLM 输出：

```json
{
  "intent": "filter_todos",
  "target": "todo.filters",
  "params": {
    "filter": "active"
  },
  "confidence": 0.97
}
```

最终 action：

```json
{
  "type": "todo.filter",
  "filter": "active"
}
```

### 9.6 把第二个改名

用户说：

```text
把第二个改成下午三点开会
```

LLM 输出：

```json
{
  "intent": "rename_todo",
  "targetHint": {
    "container": "todo.list",
    "index": 2
  },
  "params": {
    "title": "下午三点开会"
  },
  "confidence": 0.91
}
```

最终 action：

```json
{
  "type": "todo.rename",
  "todoId": "todo_2",
  "title": "下午三点开会"
}
```

## 10. ActionExecutor 校验逻辑

LLM 给出的候选意图不能直接执行。ActionExecutor 需要做确定性校验：

```ts
function validateTodoAction(
  action: TodoAction,
  snapshot: InteractionSnapshot
): ValidationResult {
  switch (action.type) {
    case "todo.add":
      if (!action.title.trim()) {
        return {
          ok: false,
          reason: "待办内容不能为空",
        }
      }
      return { ok: true }

    case "todo.complete":
    case "todo.uncomplete":
    case "todo.toggle":
    case "todo.delete":
    case "todo.rename": {
      const target = findTodoObject(snapshot, action.todoId)

      if (!target) {
        return {
          ok: false,
          reason: "没有找到对应的待办",
        }
      }

      if (!target.actions.includes(action.type)) {
        return {
          ok: false,
          reason: "当前待办不支持该操作",
        }
      }

      return { ok: true }
    }

    case "todo.clearCompleted": {
      const completedCount = snapshot.page.state.completedCount

      if (completedCount === 0) {
        return {
          ok: false,
          reason: "当前没有已完成的待办",
        }
      }

      return { ok: true }
    }

    case "todo.filter":
      return { ok: true }
  }
}
```

## 11. 完整执行链路

以“把第一个标记完成”为例：

```text
用户语音：“把第一个标记完成”
  ↓
ASR：把第一个标记完成
  ↓
读取 Interaction Snapshot
  ↓
LLM：
  intent = complete_todo
  targetHint = todo.list 第 1 项
  ↓
Target Resolver：
  第 1 项 = todo.item.todo_1
  todoId = todo_1
  ↓
Policy Validator：
  当前页面允许操作
  没有 Dialog 阻塞
  todo.item.todo_1 支持 todo.complete
  ↓
Action Dispatcher：
  executeTodoAction({ type: "todo.complete", todoId: "todo_1" })
  ↓
State Update：
  买牛奶 completed = true
  ↓
Feedback Manager：
  GUI 勾选 Checkbox，高亮该行
  VUI 播报“已完成：买牛奶”
```

## 12. 多模态组合示例

### 12.1 眼动 + 语音

```text
用户看着“写周报”
用户说：“完成这个”
```

系统理解：

```json
{
  "intent": "complete_todo",
  "target": "todo.item.todo_2",
  "evidence": [
    "voice contains deictic reference: 这个",
    "gaze target points to todo.item.todo_2"
  ]
}
```

### 12.2 手势 + 语音

```text
用户指向“买牛奶”
用户说：“删掉”
```

系统理解：

```json
{
  "intent": "delete_todo",
  "target": "todo.item.todo_1",
  "evidence": [
    "gesture points to todo.item.todo_1",
    "voice intent is delete"
  ]
}
```

### 12.3 键盘 + 语音

```text
用户用键盘选中第二项
用户说：“改成下午三点开会”
```

系统理解：

```json
{
  "intent": "rename_todo",
  "target": "todo.item.todo_2",
  "params": {
    "title": "下午三点开会"
  },
  "evidence": [
    "keyboard focus is todo.item.todo_2",
    "voice contains rename content"
  ]
}
```

## 13. 失败和澄清

### 13.1 目标不明确

如果页面里有两个相似待办：

```text
买牛奶
买酸奶
```

用户说：

```text
删除买奶
```

系统不应该猜，而应该澄清：

```text
你要删除“买牛奶”还是“买酸奶”？
```

候选输出：

```json
{
  "status": "needs_clarification",
  "reason": "target_ambiguous",
  "candidates": [
    "todo.item.todo_1",
    "todo.item.todo_2"
  ],
  "prompt": "你要删除“买牛奶”还是“买酸奶”？"
}
```

### 13.2 当前没有目标

用户说：

```text
完成这个
```

但没有 gaze、gesture、focus，也没有最近操作。

系统应该回答：

```text
你想完成哪一个待办？
```

### 13.3 动作无效

用户说：

```text
清理已完成
```

但当前没有已完成待办。

系统反馈：

```text
当前没有已完成的待办。
```

## 14. 为什么这个案例合理

这个 Todo 案例体现了完整的多模态组件思想：

- 底层 shadcn 组件保留原本 API。
- Button、Input、Checkbox、Tabs 自动提供基础 role / label / state / primitive action。
- TodoItem 通过轻量 MultimodalGroup 声明聚合边界和业务实体 ID。
- Semantic Aggregator 根据父级列表自动生成索引别名，并根据 action registry 暴露业务 action。
- TodoPage 通过 MultimodalPage 暴露页面级 action。
- Interaction Snapshot 是运行时生成的，不是手写大配置。
- LLM 只负责理解“第一个”“这个”“只看未完成”等自然表达。
- ActionExecutor 负责确定性校验，并最终调用和 GUI 共用的 `executeTodoAction`。
- GUI 和 VUI 共享同一份 Todo 状态。

核心结论：

```text
简单 Todo 不需要给每个控件配置语音命令。
只需要让控件可被抽取、组合组件声明边界、业务动作集中注册、GUI/VUI 共用执行入口。
```
