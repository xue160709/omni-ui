import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import * as React from "react"
import { afterEach, describe, expect, it } from "vitest"
import {
  MultimodalGroup,
  MultimodalProvider,
  createLlmResolver,
  useInteractionApi,
  useInteractionActions,
  useInteractionSnapshot,
  useSubmitUtterance,
  type ActionContext,
  type ActionPayload,
  type ResolvedInteraction,
} from "../src"

afterEach(() => {
  cleanup()
})

function TodoHarness() {
  const [completed, setCompleted] = React.useState(false)
  const submitUtterance = useSubmitUtterance()

  const actions = React.useMemo(
    () => ({
      "todo.complete": {
        attachTo: { entityType: "todo" },
        executeScope: "object" as const,
        paramsFrom: ({ target }: ActionContext) => ({ todoId: target.entity?.id }),
        availableWhen: ({ target }: ActionContext) => target.state?.completed === false,
      },
    }),
    []
  )

  useInteractionActions({
    namespace: "todo",
    actions,
    execute: (action: ActionPayload) => {
      if (action.type === "todo.complete" && action.todoId === "todo_1") {
        setCompleted(true)
      }
    },
  })

  return (
    <>
      <button type="button" onClick={() => void submitUtterance("完成第一个")}>
        voice
      </button>
      <MultimodalGroup id="todo.list" role="list" label="待办列表" indexBy="visible_order">
        <MultimodalGroup
          id="todo.item.todo_1"
          role="list_item"
          label="买牛奶"
          entity={{ type: "todo", id: "todo_1" }}
        >
          <label>
            <input type="checkbox" checked={completed} onChange={() => setCompleted((value) => !value)} />
            买牛奶
          </label>
        </MultimodalGroup>
      </MultimodalGroup>
    </>
  )
}

function DynamicTodoHarness() {
  const [todos, setTodos] = React.useState([{ id: "todo_1", title: "买牛奶", completed: false }])
  const submitUtterance = useSubmitUtterance()

  const actions = React.useMemo(
    () => ({
      "todo.complete": {
        attachTo: { entityType: "todo" },
        executeScope: "object" as const,
        paramsFrom: ({ target }: ActionContext) => ({ todoId: target.entity?.id }),
        availableWhen: ({ target }: ActionContext) => target.state?.completed === false,
      },
    }),
    []
  )

  useInteractionActions({
    namespace: "todo",
    actions,
    execute: (action: ActionPayload) => {
      if (action.type !== "todo.complete") return
      setTodos((current) =>
        current.map((todo) =>
          todo.id === action.todoId ? { ...todo, completed: true } : todo
        )
      )
    },
  })

  return (
    <>
      <button
        type="button"
        onClick={() =>
          setTodos((current) => [
            { id: "todo_2", title: "写方案", completed: false },
            ...current,
          ])
        }
      >
        add first
      </button>
      <button type="button" onClick={() => void submitUtterance("完成第一个")}>
        voice
      </button>
      <MultimodalGroup id="todo.list" role="list" label="待办列表" indexBy="visible_order">
        {todos.map((todo) => (
          <MultimodalGroup
            key={todo.id}
            id={`todo.item.${todo.id}`}
            role="list_item"
            label={todo.title}
            entity={{ type: "todo", id: todo.id }}
            state={{ completed: todo.completed }}
          >
            <label>
              <input type="checkbox" checked={todo.completed} onChange={() => {}} />
              {todo.title}
            </label>
          </MultimodalGroup>
        ))}
      </MultimodalGroup>
    </>
  )
}

function LlmTodoHarness() {
  const [completed, setCompleted] = React.useState(false)
  const submitUtterance = useSubmitUtterance()

  const actions = React.useMemo(
    () => ({
      "todo.complete": {
        attachTo: { entityType: "todo" },
        executeScope: "object" as const,
        paramsFrom: ({ target }: ActionContext) => ({ todoId: target.entity?.id }),
        availableWhen: ({ target }: ActionContext) => target.state?.completed === false,
      },
    }),
    []
  )

  useInteractionActions({
    namespace: "todo",
    actions,
    execute: (action: ActionPayload) => {
      if (action.type === "todo.complete" && action.todoId === "todo_1") {
        setCompleted(true)
      }
    },
  })

  return (
    <>
      <button type="button" onClick={() => void submitUtterance("把买牛奶那个完成")}>
        voice llm
      </button>
      <MultimodalGroup id="todo.list" role="list" label="待办列表" indexBy="visible_order">
        <MultimodalGroup
          id="todo.item.todo_1"
          role="list_item"
          label="买牛奶"
          entity={{ type: "todo", id: "todo_1" }}
        >
          <label>
            <input type="checkbox" checked={completed} onChange={() => setCompleted((value) => !value)} />
            买牛奶
          </label>
        </MultimodalGroup>
      </MultimodalGroup>
    </>
  )
}

function BluetoothHarness() {
  const [enabled, setEnabled] = React.useState(false)
  const submitUtterance = useSubmitUtterance()

  useInteractionActions({
    namespace: "settings",
    actions: {
      "settings.bluetooth.turnOn": {
        attachTo: { id: "settings.bluetooth" },
        executeScope: "object",
        availableWhen: () => !enabled,
      },
    },
    execute: () => setEnabled(true),
  })

  return (
    <>
      <button type="button" onClick={() => void submitUtterance("打开蓝牙")}>
        voice bluetooth
      </button>
      <div data-testid="bluetooth-state">{String(enabled)}</div>
      <MultimodalGroup id="settings.bluetooth" role="switch" label="蓝牙" state={{ checked: enabled }}>
        <button type="button" role="switch" aria-checked={enabled}>
          蓝牙 {enabled ? "开启" : "关闭"}
        </button>
      </MultimodalGroup>
    </>
  )
}

function DialogHarness() {
  const [open, setOpen] = React.useState(false)
  const snapshot = useInteractionSnapshot()

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        open dialog
      </button>
      <div data-testid="contexts">{snapshot.contextStack.map((context) => context.id).join(",")}</div>
      <div data-testid="objects">{snapshot.visibleObjects.map((object) => object.label).join(",")}</div>
      <MultimodalGroup id="settings.confirm" role="dialog" label="恢复默认确认">
        <details open={open}>
          <summary>打开确认弹窗</summary>
          <button type="button">取消</button>
          <button type="button">确认</button>
        </details>
      </MultimodalGroup>
    </>
  )
}

function IgnoredMutationHarness() {
  const snapshot = useInteractionSnapshot()
  const [text, setText] = React.useState("before")

  return (
    <>
      <div data-testid="version">{snapshot.stateVersion}</div>
      <div data-mm-ignore="true">
        <button type="button" onClick={() => setText("after")}>
          ignored update
        </button>
        <span data-testid="ignored-text">{text}</span>
      </div>
    </>
  )
}

function ControlledInputHarness() {
  const snapshot = useInteractionSnapshot()
  const [value, setValue] = React.useState("")
  const snapshotValue =
    snapshot.visibleObjects.find((object) => object.label === "Task title")?.state?.value ?? ""

  return (
    <>
      <label htmlFor="controlled-title">Task title</label>
      <input
        id="controlled-title"
        value={value}
        onChange={(event) => setValue(event.currentTarget.value)}
      />
      <div data-testid="controlled-value">{value}</div>
      <div data-testid="snapshot-value">{String(snapshotValue)}</div>
    </>
  )
}

function ApiHarness() {
  const api = useInteractionApi()
  const [result, setResult] = React.useState("")

  useInteractionActions({
    namespace: "todo",
    actions: {
      "todo.complete": {
        attachTo: { entityType: "todo" },
        executeScope: "object",
        availableWhen: ({ target }) => target.state?.completed === false,
      },
    },
    execute: () => undefined,
  })

  return (
    <>
      <button
        type="button"
        onClick={async () => {
          const submitted = await api.submitUtterance("完成第一个")
          const snapshot = api.getSnapshot()
          setResult(`${submitted.ok}:${submitted.execution}:${snapshot.visibleObjects.length}`)
        }}
      >
        submit api
      </button>
      <button
        type="button"
        onClick={async () => {
          const resolved = await api.resolveText("完成第一个")
          setResult(`${resolved.resolution.status}:${resolved.resolution.targetId}`)
        }}
      >
        resolve api
      </button>
      <div data-testid="api-result">{result}</div>
      <MultimodalGroup id="todo.list" role="list" label="待办列表" indexBy="visible_order">
        <MultimodalGroup
          id="todo.item.todo_1"
          role="list_item"
          label="买牛奶"
          entity={{ type: "todo", id: "todo_1" }}
          state={{ completed: false }}
        >
          <span>买牛奶</span>
        </MultimodalGroup>
      </MultimodalGroup>
    </>
  )
}

describe("MultimodalProvider", () => {
  it("resolves a voice command and executes the registered domain action", async () => {
    render(
      <MultimodalProvider>
        <TodoHarness />
      </MultimodalProvider>
    )

    fireEvent.click(screen.getByRole("button", { name: "voice" }))

    await waitFor(() => {
      expect((screen.getByRole("checkbox", { name: "买牛奶" }) as HTMLInputElement).checked).toBe(true)
    })
  })

  it("indexes dynamic list items by their visible DOM order", async () => {
    render(
      <MultimodalProvider>
        <DynamicTodoHarness />
      </MultimodalProvider>
    )

    fireEvent.click(screen.getByRole("button", { name: "add first" }))

    await waitFor(() => {
      expect(screen.getByRole("checkbox", { name: "写方案" })).not.toBeNull()
    })

    fireEvent.click(screen.getByRole("button", { name: "voice" }))

    await waitFor(() => {
      expect((screen.getByRole("checkbox", { name: "写方案" }) as HTMLInputElement).checked).toBe(true)
      expect((screen.getByRole("checkbox", { name: "买牛奶" }) as HTMLInputElement).checked).toBe(false)
    })
  })

  it("falls back to an opt-in LLM resolver after low-confidence rule resolution", async () => {
    const llmResolver = createLlmResolver({
      complete: () => ({
        status: "resolved",
        utterance: "把买牛奶那个完成",
        intent: "complete_todo",
        targetId: "todo.item.todo_1",
        actionId: "todo.complete",
        confidence: 0.91,
      }),
    })

    render(
      <MultimodalProvider resolvers={[llmResolver]} resolverMode="rule-first">
        <LlmTodoHarness />
      </MultimodalProvider>
    )

    fireEvent.click(screen.getByRole("button", { name: "voice llm" }))

    await waitFor(() => {
      expect((screen.getByRole("checkbox", { name: "买牛奶" }) as HTMLInputElement).checked).toBe(true)
    })
  })

  it("uses an opt-in resolver before a medium-confidence rule match in rule-first mode", async () => {
    const resolutions: ResolvedInteraction[] = []
    const llmResolver = createLlmResolver({
      id: "test-llm",
      complete: () => ({
        status: "resolved",
        utterance: "打开蓝牙",
        intent: "turn_on_bluetooth",
        targetId: "settings.bluetooth",
        actionId: "settings.bluetooth.turnOn",
        confidence: 0.91,
      }),
    })

    render(
      <MultimodalProvider
        resolvers={[llmResolver]}
        resolverMode="rule-first"
        onResolution={(resolution) => resolutions.push(resolution)}
      >
        <BluetoothHarness />
      </MultimodalProvider>
    )

    fireEvent.click(screen.getByRole("button", { name: "voice bluetooth" }))

    await waitFor(() => {
      expect(screen.getByTestId("bluetooth-state").textContent).toBe("true")
      expect(resolutions.at(-1)?.resolverId).toBe("test-llm")
    })
  })

  it("does not let LLM candidates bypass availableWhen validation", async () => {
    const llmResolver = createLlmResolver({
      complete: () => ({
        status: "resolved",
        utterance: "完成买牛奶",
        intent: "complete_todo",
        targetId: "todo.item.todo_1",
        actionId: "todo.complete",
        confidence: 0.91,
      }),
    })

    function CompletedHarness() {
      const [executed, setExecuted] = React.useState(false)
      const submitUtterance = useSubmitUtterance()

      useInteractionActions({
        namespace: "todo",
        actions: {
          "todo.complete": {
            attachTo: { entityType: "todo" },
            executeScope: "object",
            availableWhen: ({ target }) => target.state?.completed === false,
          },
        },
        execute: () => setExecuted(true),
      })

      return (
        <>
          <button type="button" onClick={() => void submitUtterance("完成买牛奶")}>
            invalid llm
          </button>
          <div data-testid="executed">{String(executed)}</div>
          <MultimodalGroup
            id="todo.item.todo_1"
            role="list_item"
            label="买牛奶"
            entity={{ type: "todo", id: "todo_1" }}
            state={{ completed: true }}
          >
            <span>买牛奶</span>
          </MultimodalGroup>
        </>
      )
    }

    render(
      <MultimodalProvider resolvers={[llmResolver]} resolverMode="llm-first">
        <CompletedHarness />
      </MultimodalProvider>
    )

    fireEvent.click(screen.getByRole("button", { name: "invalid llm" }))

    await waitFor(() => {
      expect(screen.getByTestId("executed").textContent).toBe("false")
    })
  })

  it("only applies modal-first dialog scope when the dialog content is open", async () => {
    render(
      <MultimodalProvider>
        <DialogHarness />
      </MultimodalProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId("contexts").textContent).not.toContain("settings.confirm")
      expect(screen.getByTestId("objects").textContent).not.toContain("取消")
    })

    fireEvent.click(screen.getByRole("button", { name: "open dialog" }))

    await waitFor(() => {
      expect(screen.getByTestId("contexts").textContent).toContain("settings.confirm")
      expect(screen.getByTestId("objects").textContent).toContain("取消")
    })
  })

  it("ignores DOM mutations inside runtime ignored regions", async () => {
    render(
      <MultimodalProvider>
        <IgnoredMutationHarness />
      </MultimodalProvider>
    )

    await waitFor(() => {
      expect(Number(screen.getByTestId("version").textContent)).toBeGreaterThan(0)
    })

    const version = screen.getByTestId("version").textContent
    fireEvent.click(screen.getByRole("button", { name: "ignored update" }))

    await waitFor(() => {
      expect(screen.getByTestId("ignored-text").textContent).toBe("after")
    })

    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(screen.getByTestId("version").textContent).toBe(version)
  })

  it("does not reset controlled text inputs while refreshing snapshots", async () => {
    render(
      <MultimodalProvider>
        <ControlledInputHarness />
      </MultimodalProvider>
    )

    const input = screen.getByRole("textbox", { name: "Task title" }) as HTMLInputElement
    fireEvent.input(input, { target: { value: "abc123" } })

    expect(input.value).toBe("abc123")
    expect(screen.getByTestId("controlled-value").textContent).toBe("abc123")
    await waitFor(() => {
      expect(screen.getByTestId("snapshot-value").textContent).toBe("abc123")
    })
  })

  it("exposes low-level snapshot, resolve, and submit APIs", async () => {
    render(
      <MultimodalProvider>
        <ApiHarness />
      </MultimodalProvider>
    )

    fireEvent.click(screen.getByRole("button", { name: "resolve api" }))

    await waitFor(() => {
      expect(screen.getByTestId("api-result").textContent).toBe("resolved:todo.item.todo_1")
    })

    fireEvent.click(screen.getByRole("button", { name: "submit api" }))

    await waitFor(() => {
      expect(screen.getByTestId("api-result").textContent).toMatch(/^true:domain-action:/)
    })
  })
})
