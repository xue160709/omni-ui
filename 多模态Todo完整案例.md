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

LLM 只能输出候选意图。真正执行时必须转换成这些标准 action。

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
  useInteractionAction,
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

  useInteractionAction<TodoAction>("todo.dispatch", (action) => {
    setTodos((current) => reduceTodos(current, action))

    if (action.type === "todo.filter") {
      setFilter(action.filter)
    }

    if (action.type === "todo.add") {
      setDraft("")
    }
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
          actions={["todo.add"]}
          state={{ draft }}
        >
          <div className="flex gap-2">
            <Input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="输入新的待办"
              aria-label="新的待办"
              interactionHint={{
                role: "text_input",
                aliases: ["待办内容", "新任务", "新的待办"],
              }}
            />
            <Button
              onClick={() => {
                if (!draft.trim()) return
                setTodos((current) => [
                  ...current,
                  createTodo(draft.trim()),
                ])
                setDraft("")
              }}
              interactionHint={{
                aliases: ["添加待办", "新增待办", "加入列表"],
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
          actions={["todo.filter"]}
          state={{ value: filter }}
        >
          <Tabs value={filter} onValueChange={(value) => setFilter(value as TodoFilter)}>
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
          actions={[
            "todo.complete",
            "todo.uncomplete",
            "todo.toggle",
            "todo.delete",
            "todo.rename",
          ]}
          state={{
            count: visibleTodos.length,
            filter,
          }}
        >
          <ul className="space-y-2">
            {visibleTodos.map((todo, index) => (
              <TodoItem
                key={todo.id}
                todo={todo}
                index={index + 1}
                onToggle={() => {
                  setTodos((current) =>
                    current.map((item) =>
                      item.id === todo.id
                        ? { ...item, completed: !item.completed, updatedAt: Date.now() }
                        : item
                    )
                  )
                }}
                onDelete={() => {
                  setTodos((current) => current.filter((item) => item.id !== todo.id))
                }}
              />
            ))}
          </ul>
        </MultimodalGroup>

        <footer className="flex items-center justify-between text-sm">
          <span>{visibleTodos.length} 个可见待办</span>
          <Button
            variant="ghost"
            onClick={() => {
              setTodos((current) => current.filter((todo) => !todo.completed))
            }}
            interactionHint={{
              aliases: ["清理已完成", "删除已完成", "清空完成项"],
              risk: "medium",
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

TodoItem 是一个组合组件，不应该只被抽成 Checkbox + Text + Button，而应该聚合成一个 Todo Item 对象。

```tsx
function TodoItem(props: {
  todo: Todo
  index: number
  onToggle: () => void
  onDelete: () => void
}) {
  const { todo, index, onToggle, onDelete } = props

  return (
    <MultimodalGroup
      id={`todo.item.${todo.id}`}
      role="list_item"
      label={todo.title}
      aliases={[
        todo.title,
        `第 ${index} 个`,
        `第 ${index} 项`,
      ]}
      actions={[
        "todo.complete",
        "todo.uncomplete",
        "todo.toggle",
        "todo.delete",
        "todo.rename",
      ]}
      state={{
        id: todo.id,
        index,
        title: todo.title,
        completed: todo.completed,
      }}
    >
      <li className="flex items-center gap-3 rounded-md border p-3">
        <Checkbox
          checked={todo.completed}
          onCheckedChange={onToggle}
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
          interactionHint={{
            aliases: [`编辑 ${todo.title}`, `修改 ${todo.title}`],
          }}
        >
          编辑
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onDelete}
          interactionHint={{
            aliases: [`删除 ${todo.title}`, `移除 ${todo.title}`],
            risk: "medium",
          }}
        >
          删除
        </Button>
      </li>
    </MultimodalGroup>
  )
}
```

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
      "actions": ["focus", "setText", "clear"]
    },
    {
      "id": "node.button.add",
      "role": "button",
      "label": "添加",
      "enabled": true,
      "actions": ["press"]
    },
    {
      "id": "node.tab.active",
      "role": "tab",
      "label": "未完成",
      "selected": false,
      "actions": ["select"]
    },
    {
      "id": "node.checkbox.todo_1",
      "role": "checkbox",
      "label": "完成 买牛奶",
      "checked": false,
      "actions": ["check", "uncheck", "toggle"]
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
      "actions": ["press"]
    }
  ]
}
```

## 7. Semantic Aggregator 聚合结果

Semantic Aggregator 会把底层节点聚合成更接近用户语言的对象。

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
      "parent": "todo.list",
      "primaryControl": "node.checkbox.todo_1",
      "actions": [
        "todo.complete",
        "todo.uncomplete",
        "todo.toggle",
        "todo.delete",
        "todo.rename"
      ],
      "state": {
        "id": "todo_1",
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
      "parent": "todo.list",
      "actions": [
        "todo.complete",
        "todo.uncomplete",
        "todo.toggle",
        "todo.delete",
        "todo.rename"
      ],
      "state": {
        "id": "todo_2",
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

Resolver 转成确定性 action：

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
    "timestamp": 10005
  },
  "gaze": {
    "targetCandidate": "todo.item.todo_2",
    "confidence": 0.76,
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
  dispatch({ type: "todo.complete", todoId: "todo_1" })
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
- Button、Input、Checkbox、Tabs 自动提供基础 role / label / state / action。
- TodoItem 通过 MultimodalGroup 聚合为一个 list_item。
- TodoPage 通过 MultimodalPage 暴露页面级 action。
- Interaction Snapshot 是运行时生成的，不是手写大配置。
- LLM 只负责理解“第一个”“这个”“只看未完成”等自然表达。
- ActionExecutor 负责确定性校验和执行。
- GUI 和 VUI 共享同一份 Todo 状态。

核心结论：

```text
简单 Todo 不需要给每个控件配置语音命令。
只需要让控件可被抽取、组合组件可被聚合、页面动作可被声明。
```
