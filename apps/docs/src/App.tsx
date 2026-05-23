import {
  MultimodalGroup,
  MultimodalPage,
  MultimodalProvider,
  useInteractionActions,
  useInteractionSnapshot,
  useSubmitUtterance,
  type ActionPayload,
  type ActionContext,
} from "@multimodal-ui/react"
import * as React from "react"

type Todo = {
  id: string
  title: string
  completed: boolean
}

type TodoFilter = "all" | "active" | "completed"

type TodoAction =
  | { type: "todo.add"; title: string }
  | { type: "todo.complete"; todoId: string }
  | { type: "todo.uncomplete"; todoId: string }
  | { type: "todo.delete"; todoId: string }
  | { type: "todo.filter"; filter: TodoFilter }
  | { type: "todo.clearCompleted" }

type SettingsAction =
  | { type: "settings.wifi.turnOn" }
  | { type: "settings.wifi.turnOff" }
  | { type: "settings.bluetooth.turnOn" }
  | { type: "settings.bluetooth.turnOff" }

export function App() {
  return (
    <MultimodalProvider>
      <Shell />
    </MultimodalProvider>
  )
}

function Shell() {
  return (
    <MultimodalPage id="page.demo" title="Multimodal UI Demo" route="/">
      <main className="app-shell">
        <header className="app-header">
          <div>
            <p className="eyebrow">runtime-first shadcn/ui extension</p>
            <h1>Multimodal UI</h1>
          </div>
          <a href="/r/index.json" className="registry-link">
            Registry JSON
          </a>
        </header>

        <VoiceConsole />

        <div className="demo-grid">
          <TodoDemo />
          <SettingsDemo />
        </div>

        <SnapshotDevTools />
      </main>
    </MultimodalPage>
  )
}

function VoiceConsole() {
  const submitUtterance = useSubmitUtterance()
  const [text, setText] = React.useState("完成第一个")
  const samples = ["点击添加", "添加一个待办：准备发布文档", "完成第一个", "只看未完成", "打开蓝牙", "关闭 Wi-Fi"]

  return (
    <section className="voice-console">
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void submitUtterance(text)
        }}
      >
        <label htmlFor="utterance">语音文本</label>
        <div className="voice-row">
          <input
            id="utterance"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="输入语音识别结果，例如：完成第一个"
          />
          <button type="submit">提交语音</button>
        </div>
      </form>
      <div className="sample-row">
        {samples.map((sample) => (
          <button
            key={sample}
            type="button"
            className="ghost-button"
            onClick={() => {
              setText(sample)
              void submitUtterance(sample)
            }}
          >
            {sample}
          </button>
        ))}
      </div>
    </section>
  )
}

function TodoDemo() {
  const [todos, setTodos] = React.useState<Todo[]>([
    { id: "todo_1", title: "买牛奶", completed: false },
    { id: "todo_2", title: "写周报", completed: false },
  ])
  const [draft, setDraft] = React.useState("")
  const [filter, setFilter] = React.useState<TodoFilter>("all")

  const visibleTodos = todos.filter((todo) => {
    if (filter === "active") return !todo.completed
    if (filter === "completed") return todo.completed
    return true
  })

  const executeTodoAction = React.useCallback((action: ActionPayload) => {
    const todoAction = action as TodoAction

    if (todoAction.type === "todo.filter") {
      setFilter(todoAction.filter)
      return
    }

    if (todoAction.type === "todo.add") {
      const title = todoAction.title.trim()
      if (!title) return
      setTodos((current) => [
        ...current,
        {
          id: `todo_${Date.now()}`,
          title,
          completed: false,
        },
      ])
      setDraft("")
      return
    }

    setTodos((current) => {
      if (todoAction.type === "todo.complete") {
        return current.map((todo) =>
          todo.id === todoAction.todoId ? { ...todo, completed: true } : todo
        )
      }

      if (todoAction.type === "todo.uncomplete") {
        return current.map((todo) =>
          todo.id === todoAction.todoId ? { ...todo, completed: false } : todo
        )
      }

      if (todoAction.type === "todo.delete") {
        return current.filter((todo) => todo.id !== todoAction.todoId)
      }

      if (todoAction.type === "todo.clearCompleted") {
        return current.filter((todo) => !todo.completed)
      }

      return current
    })
  }, [])

  const todoActionSpecs = React.useMemo(
    () => ({
      "todo.add": {
        attachTo: { id: "todo.composer" },
        executeScope: "page" as const,
        paramsFrom: ({ candidate }: ActionContext) => ({
          title: String(candidate?.params?.title ?? draft),
        }),
      },
      "todo.complete": {
        attachTo: { entityType: "todo" },
        executeScope: "object" as const,
        paramsFrom: ({ target }: ActionContext) => ({
          todoId: target.entity?.id,
        }),
        availableWhen: ({ target }: ActionContext) => target.state?.completed === false,
      },
      "todo.uncomplete": {
        attachTo: { entityType: "todo" },
        executeScope: "object" as const,
        paramsFrom: ({ target }: ActionContext) => ({
          todoId: target.entity?.id,
        }),
        availableWhen: ({ target }: ActionContext) => target.state?.completed === true,
      },
      "todo.delete": {
        attachTo: { entityType: "todo" },
        executeScope: "object" as const,
        paramsFrom: ({ target }: ActionContext) => ({
          todoId: target.entity?.id,
        }),
        risk: "medium" as const,
      },
      "todo.filter": {
        attachTo: { id: "todo.filters" },
        executeScope: "container" as const,
        paramsFrom: ({ candidate }: ActionContext) => ({
          filter: candidate?.params?.filter ?? "all",
        }),
      },
      "todo.clearCompleted": {
        executeScope: "page" as const,
        risk: "medium" as const,
      },
    }),
    [draft]
  )

  useInteractionActions({
    namespace: "todo",
    actions: todoActionSpecs,
    execute: executeTodoAction,
  })

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Todo Demo</h2>
        <span>{visibleTodos.length} visible</span>
      </div>

      <MultimodalGroup id="todo.composer" role="composer" label="新增待办">
        <div className="composer">
          <input
            aria-label="新的待办"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="输入新的待办"
          />
          <button
            type="button"
            onClick={() => executeTodoAction({ type: "todo.add", title: draft || "新待办" })}
          >
            添加
          </button>
        </div>
      </MultimodalGroup>

      <MultimodalGroup id="todo.filters" role="filter_tabs" label="待办过滤">
        <div className="segmented" role="tablist" aria-label="待办过滤">
          {[
            ["all", "全部"],
            ["active", "未完成"],
            ["completed", "已完成"],
          ].map(([value, label]) => (
            <button
              key={value}
              role="tab"
              aria-selected={filter === value}
              type="button"
              onClick={() => executeTodoAction({ type: "todo.filter", filter: value as TodoFilter })}
            >
              {label}
            </button>
          ))}
        </div>
      </MultimodalGroup>

      <MultimodalGroup id="todo.list" role="list" label="待办列表" indexBy="visible_order">
        <div className="todo-list">
          {visibleTodos.map((todo) => (
            <MultimodalGroup
              key={todo.id}
              id={`todo.item.${todo.id}`}
              role="list_item"
              label={todo.title}
              entity={{ type: "todo", id: todo.id }}
            >
              <div className="todo-item">
                <input
                  type="checkbox"
                  aria-label={todo.completed ? `取消完成 ${todo.title}` : `完成 ${todo.title}`}
                  checked={todo.completed}
                  onChange={() =>
                    executeTodoAction({
                      type: todo.completed ? "todo.uncomplete" : "todo.complete",
                      todoId: todo.id,
                    })
                  }
                />
                <span className={todo.completed ? "done" : ""}>{todo.title}</span>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => executeTodoAction({ type: "todo.delete", todoId: todo.id })}
                >
                  删除
                </button>
              </div>
            </MultimodalGroup>
          ))}
        </div>
      </MultimodalGroup>
    </section>
  )
}

function SettingsDemo() {
  const [wifi, setWifi] = React.useState(true)
  const [bluetooth, setBluetooth] = React.useState(false)
  const [temperature, setTemperature] = React.useState(24)

  const executeSettingsAction = React.useCallback((action: ActionPayload) => {
    if (action.type === "settings.wifi.turnOn") setWifi(true)
    if (action.type === "settings.wifi.turnOff") setWifi(false)
    if (action.type === "settings.bluetooth.turnOn") setBluetooth(true)
    if (action.type === "settings.bluetooth.turnOff") setBluetooth(false)
  }, [])

  const settingsActions = React.useMemo(
    () => ({
      "settings.wifi.turnOn": {
        attachTo: { id: "settings.wifi" },
        executeScope: "object" as const,
        availableWhen: () => !wifi,
      },
      "settings.wifi.turnOff": {
        attachTo: { id: "settings.wifi" },
        executeScope: "object" as const,
        availableWhen: () => wifi,
      },
      "settings.bluetooth.turnOn": {
        attachTo: { id: "settings.bluetooth" },
        executeScope: "object" as const,
        availableWhen: () => !bluetooth,
      },
      "settings.bluetooth.turnOff": {
        attachTo: { id: "settings.bluetooth" },
        executeScope: "object" as const,
        availableWhen: () => bluetooth,
      },
    }),
    [bluetooth, wifi]
  )

  useInteractionActions({
    namespace: "settings",
    actions: settingsActions,
    execute: executeSettingsAction,
  })

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Settings Demo</h2>
        <span>Switch / Slider / Dialog</span>
      </div>

      <div className="settings-list">
        <MultimodalGroup id="settings.wifi" role="switch" label="Wi-Fi" state={{ checked: wifi }}>
          <button
            type="button"
            role="switch"
            aria-checked={wifi}
            onClick={() => setWifi((current) => !current)}
            className="setting-row"
          >
            <span>Wi-Fi</span>
            <strong>{wifi ? "开启" : "关闭"}</strong>
          </button>
        </MultimodalGroup>

        <MultimodalGroup
          id="settings.bluetooth"
          role="switch"
          label="蓝牙"
          state={{ checked: bluetooth }}
        >
          <button
            type="button"
            role="switch"
            aria-checked={bluetooth}
            onClick={() => setBluetooth((current) => !current)}
            className="setting-row"
          >
            <span>蓝牙</span>
            <strong>{bluetooth ? "开启" : "关闭"}</strong>
          </button>
        </MultimodalGroup>

        <MultimodalGroup
          id="settings.temperature"
          role="value_control"
          label="温度"
          state={{ value: temperature, min: 16, max: 30 }}
        >
          <label className="slider-row">
            <span>温度 {temperature}℃</span>
            <input
              type="range"
              min={16}
              max={30}
              value={temperature}
              onChange={(event) => setTemperature(Number(event.target.value))}
            />
          </label>
        </MultimodalGroup>

        <MultimodalGroup id="settings.confirm" role="dialog" label="恢复默认确认">
          <details className="dialog-demo">
            <summary>打开确认弹窗</summary>
            <div>
              <p>要恢复默认设置吗？</p>
              <button type="button">取消</button>
              <button type="button">确认</button>
            </div>
          </details>
        </MultimodalGroup>
      </div>
    </section>
  )
}

function SnapshotDevTools() {
  const snapshot = useInteractionSnapshot()

  return (
    <section className="devtools">
      <div className="panel-header">
        <h2>Interaction Snapshot</h2>
        <span>stateVersion {snapshot.stateVersion}</span>
      </div>
      <pre>{JSON.stringify(snapshot, null, 2)}</pre>
    </section>
  )
}
