import {
  MultimodalGroup,
  MultimodalPage,
  MultimodalProvider,
  createLlmResolver,
  useInteractionActions,
  useLastResolution,
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
  | { type: "settings.temperature.increase" }
  | { type: "settings.temperature.decrease" }

export function App() {
  const [llmEnabled, setLlmEnabled] = React.useState(false)
  const demoLlmResolver = React.useMemo(
    () =>
      createLlmResolver({
        id: "demo-llm",
        complete: ({ utterance, snapshot }) => {
          if (/买牛奶.*完成|完成.*买牛奶/.test(utterance)) {
            const target = snapshot.visibleObjects.find((object) => object.label === "买牛奶")
            return {
              status: target ? "resolved" : "not_found",
              utterance,
              intent: "complete_todo",
              targetId: target?.id,
              actionId: "todo.complete",
              confidence: target ? 0.91 : 0,
              reason: "demo LLM matched the todo title in a natural expression",
            }
          }

          if (/还没做完|没做完|未做完/.test(utterance)) {
            return {
              status: "resolved",
              utterance,
              intent: "filter_todos",
              targetId: "todo.filters",
              actionId: "todo.filter",
              params: { filter: "active" },
              confidence: 0.9,
              reason: "demo LLM mapped colloquial unfinished wording to active filter",
            }
          }

          if (/温度.*(调高|高一点|升高)|调高.*温度/.test(utterance)) {
            return {
              status: "resolved",
              utterance,
              intent: "increase_temperature",
              targetId: "settings.temperature",
              actionId: "settings.temperature.increase",
              confidence: 0.88,
              reason: "demo LLM mapped vague temperature wording to a domain action",
            }
          }

          return {
            status: "not_found",
            utterance,
            confidence: 0,
            reason: "demo LLM has no scripted match",
          }
        },
      }),
    []
  )

  return (
    <MultimodalProvider resolverMode="rule-first" resolvers={llmEnabled ? [demoLlmResolver] : []}>
      <Shell llmEnabled={llmEnabled} onLlmEnabledChange={setLlmEnabled} />
    </MultimodalProvider>
  )
}

function Shell(props: {
  llmEnabled: boolean
  onLlmEnabledChange: (enabled: boolean) => void
}) {
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

        <VoiceConsole
          llmEnabled={props.llmEnabled}
          onLlmEnabledChange={props.onLlmEnabledChange}
        />

        <div className="demo-grid">
          <TodoDemo />
          <SettingsDemo />
        </div>

        <SnapshotDevTools />
      </main>
    </MultimodalPage>
  )
}

function VoiceConsole(props: {
  llmEnabled: boolean
  onLlmEnabledChange: (enabled: boolean) => void
}) {
  const submitUtterance = useSubmitUtterance()
  const [text, setText] = React.useState("完成第一个")
  const samples = [
    "点击添加",
    "添加一个待办：准备发布文档",
    "完成第一个",
    "只看未完成",
    "打开蓝牙",
    "关闭 Wi-Fi",
    "把买牛奶那个完成",
    "只显示还没做完的",
    "把温度稍微调高一点",
  ]

  return (
    <section className="voice-console" data-mm-ignore="true">
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
        <label className="llm-toggle">
          <input
            type="checkbox"
            checked={props.llmEnabled}
            onChange={(event) => props.onLlmEnabledChange(event.target.checked)}
          />
          <span>LLM resolver demo</span>
        </label>
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
  const [confirmOpen, setConfirmOpen] = React.useState(false)

  const executeSettingsAction = React.useCallback((action: ActionPayload) => {
    if (action.type === "settings.wifi.turnOn") setWifi(true)
    if (action.type === "settings.wifi.turnOff") setWifi(false)
    if (action.type === "settings.bluetooth.turnOn") setBluetooth(true)
    if (action.type === "settings.bluetooth.turnOff") setBluetooth(false)
    if (action.type === "settings.temperature.increase") {
      setTemperature((current) => Math.min(30, current + 1))
    }
    if (action.type === "settings.temperature.decrease") {
      setTemperature((current) => Math.max(16, current - 1))
    }
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
      "settings.temperature.increase": {
        attachTo: { id: "settings.temperature" },
        executeScope: "object" as const,
        availableWhen: () => temperature < 30,
      },
      "settings.temperature.decrease": {
        attachTo: { id: "settings.temperature" },
        executeScope: "object" as const,
        availableWhen: () => temperature > 16,
      },
    }),
    [bluetooth, temperature, wifi]
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

        <button type="button" className="dialog-trigger" onClick={() => setConfirmOpen(true)}>
          打开确认弹窗
        </button>

        {confirmOpen ? (
          <MultimodalGroup id="settings.confirm" role="dialog" label="恢复默认确认" state={{ open: true }}>
            <div className="dialog-demo" role="dialog" aria-modal="true" aria-label="恢复默认确认">
              <p>要恢复默认设置吗？</p>
              <div className="dialog-actions">
                <button type="button" className="ghost-button" onClick={() => setConfirmOpen(false)}>
                  取消
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setWifi(true)
                    setBluetooth(false)
                    setTemperature(24)
                    setConfirmOpen(false)
                  }}
                >
                  确认
                </button>
              </div>
            </div>
          </MultimodalGroup>
        ) : null}
      </div>
    </section>
  )
}

function SnapshotDevTools() {
  const snapshot = useInteractionSnapshot()
  const lastResolution = useLastResolution()
  const [filter, setFilter] = React.useState<"all" | "page" | "group" | "raw" | "actions">("all")
  const visibleObjects = snapshot.visibleObjects.filter((object) => {
    if (filter === "all") return true
    if (filter === "page") return object.type === "page"
    if (filter === "group") return object.type === "composite" || object.type === "container"
    if (filter === "raw") return object.type === "raw"
    if (filter === "actions") return Boolean(object.actions?.length || object.primitiveActions?.length)
    return true
  })
  const displaySnapshot = {
    ...snapshot,
    visibleObjects,
    lastResolution,
  }

  return (
    <section className="devtools" data-mm-ignore="true">
      <div className="panel-header">
        <h2>Interaction Snapshot</h2>
        <span>stateVersion {snapshot.stateVersion}</span>
      </div>
      <div className="devtools-filters" role="tablist" aria-label="Snapshot filters">
        {[
          ["all", "All"],
          ["page", "Page"],
          ["group", "Groups"],
          ["raw", "Raw"],
          ["actions", "Actions"],
        ].map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-selected={filter === value}
            onClick={() => setFilter(value as typeof filter)}
          >
            {label}
          </button>
        ))}
      </div>
      <pre>{JSON.stringify(displaySnapshot, null, 2)}</pre>
    </section>
  )
}
