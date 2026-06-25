import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import * as React from "react"
import { afterEach, describe, expect, it } from "vitest"
import {
  NAVIGATION_BACK_ACTION_ID,
  NAVIGATION_FORWARD_ACTION_ID,
  MultimodalGroup,
  MultimodalPage,
  MultimodalProvider,
  createLlmResolver,
  useAssistantConversation,
  useInteractionAssistant,
  useInteractionApi,
  useInteractionActions,
  useInteractionNavigationHistory,
  useInteractionRoutes,
  useInteractionSnapshot,
  useSubmitUtterance,
  type ActionContext,
  type ActionPayload,
  type LocalInteractionRule,
  type ResolvedInteraction,
} from "../src"

afterEach(() => {
  cleanup()
})

function TaskHarness() {
  const [completed, setCompleted] = React.useState(false)
  const submitUtterance = useSubmitUtterance()

  const actions = React.useMemo(
    () => ({
      "task.complete": {
        attachTo: { entityType: "task" },
        executeScope: "object" as const,
        modelCallable: true,
        paramsFrom: ({ target }: ActionContext) => ({ taskId: target.entity?.id }),
        availableWhen: ({ target }: ActionContext) => target.state?.completed === false,
      },
    }),
    []
  )

  useInteractionActions({
    namespace: "task",
    actions,
    execute: (action: ActionPayload) => {
      if (action.type === "task.complete" && action.taskId === "task_1") {
        setCompleted(true)
      }
    },
  })

  return (
    <>
      <button type="button" onClick={() => void submitUtterance("完成第一个")}>
        voice
      </button>
      <MultimodalGroup id="task.list" role="list" label="任务列表" indexBy="visible_order">
        <MultimodalGroup
          id="task.item.task_1"
          role="list_item"
          label="评审方案"
          entity={{ type: "task", id: "task_1" }}
        >
          <label>
            <input type="checkbox" checked={completed} onChange={() => setCompleted((value) => !value)} />
            评审方案
          </label>
        </MultimodalGroup>
      </MultimodalGroup>
    </>
  )
}

function DynamicTaskHarness() {
  const [tasks, setTasks] = React.useState([{ id: "task_1", title: "评审方案", completed: false }])
  const submitUtterance = useSubmitUtterance()

  const actions = React.useMemo(
    () => ({
      "task.complete": {
        attachTo: { entityType: "task" },
        executeScope: "object" as const,
        modelCallable: true,
        paramsFrom: ({ target }: ActionContext) => ({ taskId: target.entity?.id }),
        availableWhen: ({ target }: ActionContext) => target.state?.completed === false,
      },
    }),
    []
  )

  useInteractionActions({
    namespace: "task",
    actions,
    execute: (action: ActionPayload) => {
      if (action.type !== "task.complete") return
      setTasks((current) =>
        current.map((task) =>
          task.id === action.taskId ? { ...task, completed: true } : task
        )
      )
    },
  })

  return (
    <>
      <button
        type="button"
        onClick={() =>
          setTasks((current) => [
            { id: "task_2", title: "整理需求", completed: false },
            ...current,
          ])
        }
      >
        add first
      </button>
      <button type="button" onClick={() => void submitUtterance("完成第一个")}>
        voice
      </button>
      <MultimodalGroup id="task.list" role="list" label="任务列表" indexBy="visible_order">
        {tasks.map((task) => (
          <MultimodalGroup
            key={task.id}
            id={`task.item.${task.id}`}
            role="list_item"
            label={task.title}
            entity={{ type: "task", id: task.id }}
            state={{ completed: task.completed }}
          >
            <label>
              <input type="checkbox" checked={task.completed} onChange={() => {}} />
              {task.title}
            </label>
          </MultimodalGroup>
        ))}
      </MultimodalGroup>
    </>
  )
}

function LlmTaskHarness() {
  const [completed, setCompleted] = React.useState(false)
  const submitUtterance = useSubmitUtterance()

  const actions = React.useMemo(
    () => ({
      "task.complete": {
        attachTo: { entityType: "task" },
        executeScope: "object" as const,
        modelCallable: true,
        paramsFrom: ({ target }: ActionContext) => ({ taskId: target.entity?.id }),
        availableWhen: ({ target }: ActionContext) => target.state?.completed === false,
      },
    }),
    []
  )

  useInteractionActions({
    namespace: "task",
    actions,
    execute: (action: ActionPayload) => {
      if (action.type === "task.complete" && action.taskId === "task_1") {
        setCompleted(true)
      }
    },
  })

  return (
    <>
      <button type="button" onClick={() => void submitUtterance("把评审方案那个完成")}>
        voice llm
      </button>
      <MultimodalGroup id="task.list" role="list" label="任务列表" indexBy="visible_order">
        <MultimodalGroup
          id="task.item.task_1"
          role="list_item"
          label="评审方案"
          entity={{ type: "task", id: "task_1" }}
        >
          <label>
            <input type="checkbox" checked={completed} onChange={() => setCompleted((value) => !value)} />
            评审方案
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
        modelCallable: true,
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
  const inputState = snapshot.visibleObjects.find((object) => object.label === "Task title")?.state
  const snapshotValue = `${String(inputState?.hasValue ?? false)}:${String(inputState?.length ?? 0)}`

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
    namespace: "task",
    actions: {
      "task.complete": {
        attachTo: { entityType: "task" },
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
      <MultimodalGroup id="task.list" role="list" label="任务列表" indexBy="visible_order">
        <MultimodalGroup
          id="task.item.task_1"
          role="list_item"
          label="评审方案"
          entity={{ type: "task", id: "task_1" }}
          state={{ completed: false }}
        >
          <span>评审方案</span>
        </MultimodalGroup>
      </MultimodalGroup>
    </>
  )
}

function ConfirmTurnHarness() {
  const api = useInteractionApi()
  const [deleted, setDeleted] = React.useState(false)
  const [result, setResult] = React.useState("")

  useInteractionActions({
    namespace: "task",
    actions: {
      "task.delete": {
        attachTo: { entityType: "task" },
        executeScope: "object",
        confirmation: { required: true },
        paramsFrom: ({ target }) => ({ taskId: target.entity?.id }),
      },
    },
    execute: () => {
      setDeleted(true)
      return { status: "changed" }
    },
  })

  return (
    <>
      <button
        type="button"
        onClick={async () => {
          const resolved = await api.resolveText("删除第一个")
          const submitted = await api.dispatchResolution(resolved.resolution, {
            baseStateVersion: resolved.snapshot.stateVersion,
          })
          const validationCode =
            submitted.validation && !submitted.validation.ok
              ? submitted.validation.code
              : "none"
          const pendingTurnId = submitted.pendingCommand?.turnId
          const activeBeforeConfirm = api.getActiveTurn()?.status
          const confirmed = pendingTurnId
            ? await api.confirmTurn(pendingTurnId)
            : undefined
          setResult(
            `${submitted.ok}:${validationCode}:${activeBeforeConfirm}:${confirmed?.ok}:${confirmed?.status}`
          )
        }}
      >
        confirm api
      </button>
      <div data-testid="confirm-result">{result}</div>
      <div data-testid="confirm-deleted">{String(deleted)}</div>
      <MultimodalGroup id="task.list" role="list" label="任务列表" indexBy="visible_order">
        <MultimodalGroup
          id="task.item.task_1"
          role="list_item"
          label="评审方案"
          entity={{ type: "task", id: "task_1" }}
        >
          <span>评审方案</span>
        </MultimodalGroup>
      </MultimodalGroup>
    </>
  )
}

function ConfirmationInvalidationHarness() {
  const api = useInteractionApi()
  const [deleted, setDeleted] = React.useState(false)
  const [pendingTurnId, setPendingTurnId] = React.useState("")
  const [result, setResult] = React.useState("")

  useInteractionActions({
    namespace: "task",
    actions: {
      "task.delete": {
        attachTo: { entityType: "task" },
        executeScope: "object",
        confirmation: { required: true },
        paramsFrom: ({ target }) => ({ taskId: target.entity?.id }),
      },
    },
    execute: () => {
      setDeleted(true)
      return { status: "changed" }
    },
  })

  return (
    <>
      <button
        type="button"
        onClick={async () => {
          const resolved = await api.resolveText("删除第一个")
          const submitted = await api.dispatchResolution(resolved.resolution, {
            baseStateVersion: resolved.snapshot.stateVersion,
          })
          setPendingTurnId(submitted.pendingCommand?.turnId ?? "")
          const validationCode =
            submitted.validation && !submitted.validation.ok
              ? submitted.validation.code
              : "none"
          setResult(`prepared:${validationCode}`)
        }}
      >
        prepare invalidated delete
      </button>
      <button
        type="button"
        disabled={!pendingTurnId}
        onClick={async () => {
          api.invalidateSnapshot("test invalidation before confirmation")
          await new Promise((resolve) => setTimeout(resolve, 0))
          const confirmed = await api.confirmTurn(pendingTurnId)
          const validationCode =
            confirmed.validation && !confirmed.validation.ok
              ? confirmed.validation.code
              : confirmed.error?.code ?? "none"
          setResult(`confirmed:${confirmed.ok}:${validationCode}`)
        }}
      >
        confirm invalidated delete
      </button>
      <div data-testid="invalidation-result">{result}</div>
      <div data-testid="invalidation-deleted">{String(deleted)}</div>
      <MultimodalGroup id="task.list" role="list" label="任务列表" indexBy="visible_order">
        <MultimodalGroup
          id="task.item.task_1"
          role="list_item"
          label="评审方案"
          entity={{ type: "task", id: "task_1" }}
        >
          <span>评审方案</span>
        </MultimodalGroup>
      </MultimodalGroup>
    </>
  )
}

function RouteHarness() {
  const [screen, setScreen] = React.useState("home")
  const submitUtterance = useSubmitUtterance()

  useInteractionRoutes({
    routes: [
      {
        id: "app.route.home",
        label: "首页",
        aliases: ["主页"],
        route: "home",
      },
      {
        id: "app.route.settings",
        label: "设置",
        aliases: ["配置"],
        route: "settings",
      },
    ],
    execute: (route) => setScreen(String(route)),
  })

  return (
    <>
      <button type="button" onClick={() => void submitUtterance("回到设置")}>
        voice route
      </button>
      <div data-testid="screen">{screen}</div>
    </>
  )
}

const navigationHistoryRules = [
  {
    id: "navigation.back",
    patterns: ["返回上一页"],
    target: "page.current",
    actionId: NAVIGATION_BACK_ACTION_ID,
  },
  {
    id: "navigation.forward",
    patterns: ["前进下一页"],
    target: "page.current",
    actionId: NAVIGATION_FORWARD_ACTION_ID,
  },
] satisfies LocalInteractionRule[]

function NavigationHistoryHarness() {
  const [screen, setScreen] = React.useState<"home" | "details">("details")
  const submitUtterance = useSubmitUtterance()

  useInteractionNavigationHistory({
    goBack: () => setScreen("home"),
    goForward: () => setScreen("details"),
  })

  return (
    <MultimodalPage
      id={`page.${screen}`}
      title={screen === "home" ? "首页" : "详情"}
      state={{
        canGoBack: screen === "details",
        canGoForward: screen === "home",
      }}
    >
      <button type="button" onClick={() => void submitUtterance("返回上一页")}>
        voice back
      </button>
      <button type="button" onClick={() => void submitUtterance("前进下一页")}>
        voice forward
      </button>
      <div data-testid="history-screen">{screen}</div>
    </MultimodalPage>
  )
}

function AssistantHarness() {
  const assistant = useInteractionAssistant({
    localReply: {
      actionReplies: {
        "navigation.goto": ({ result }) => `已打开${result.target?.label ?? "目标"}。`,
      },
    },
  })
  const [reply, setReply] = React.useState("")

  useInteractionRoutes({
    routes: [
      {
        id: "app.route.home",
        label: "首页",
        route: "home",
      },
    ],
    execute: () => undefined,
  })

  return (
    <>
      <button
        type="button"
        onClick={async () => {
          const result = await assistant.trySubmitLocal("回到首页")
          setReply(`${result.handled}:${result.reply?.content ?? ""}`)
        }}
      >
        assistant route
      </button>
      <div data-testid="assistant-reply">{reply}</div>
    </>
  )
}

function AssistantConversationHarness() {
  const conversation = useAssistantConversation({
    initialDraft: "你好",
    callModel: async () => "你好，我是模型回复。",
  })

  return (
    <>
      <button type="button" onClick={() => void conversation.submitMessage()}>
        conversation submit
      </button>
      <div data-testid="conversation-status">{conversation.status}</div>
      <div data-testid="conversation-messages">
        {conversation.messages.map((message) => message.content).join("|")}
      </div>
    </>
  )
}

function AssistantPromptManifestHarness() {
  const assistant = useInteractionAssistant()
  const [prompt, setPrompt] = React.useState("")

  useInteractionRoutes({
    routes: [
      {
        id: "app.route.profile",
        label: "个人资料",
        aliases: ["资料"],
        path: "/profile",
        route: "profile",
      },
    ],
    execute: () => undefined,
  })

  return (
    <>
      <button type="button" onClick={() => setPrompt(assistant.createSystemPrompt())}>
        create prompt
      </button>
      <pre data-testid="assistant-prompt">{prompt}</pre>
    </>
  )
}

function DisabledLocalAssistantHarness() {
  const assistant = useInteractionAssistant({
    localExecution: {
      mode: "off",
    },
  })
  const [reply, setReply] = React.useState("")

  useInteractionRoutes({
    routes: [
      {
        id: "app.route.home",
        label: "首页",
        route: "home",
      },
    ],
    execute: () => undefined,
  })

  return (
    <>
      <button
        type="button"
        onClick={async () => {
          const result = await assistant.trySubmitLocal("回到首页")
          setReply(String(result.handled))
        }}
      >
        disabled assistant route
      </button>
      <div data-testid="disabled-assistant-reply">{reply}</div>
    </>
  )
}

function AllowlistedLocalAssistantHarness() {
  const assistant = useInteractionAssistant({
    localExecution: {
      mode: "allowlist",
      actionIds: ["navigation.goto"],
    },
    localReply: {
      actionReplies: {
        "navigation.goto": "allowed route",
      },
    },
  })
  const [reply, setReply] = React.useState("")

  useInteractionRoutes({
    routes: [
      {
        id: "app.route.home",
        label: "首页",
        route: "home",
      },
    ],
    execute: () => undefined,
  })

  return (
    <>
      <button
        type="button"
        onClick={async () => {
          const result = await assistant.trySubmitLocal("回到首页")
          setReply(`${result.handled}:${result.reply?.content ?? ""}`)
        }}
      >
        allowlisted assistant route
      </button>
      <div data-testid="allowlisted-assistant-reply">{reply}</div>
    </>
  )
}

function ModelActionPolicyHarness() {
  const assistant = useInteractionAssistant({
    modelActionPolicy: {
      mode: "allowlist",
      actionIds: ["task.complete"],
      allowPrimitiveActions: false,
    },
  })
  const [reply, setReply] = React.useState("")
  const [executed, setExecuted] = React.useState("none")

  useInteractionActions({
    namespace: "task",
    actions: {
      "task.complete": {
        attachTo: { entityType: "task" },
        executeScope: "object",
      },
      "task.delete": {
        attachTo: { entityType: "task" },
        executeScope: "object",
      },
    },
    execute: (action) => setExecuted(action.type),
  })

  return (
    <>
      <button
        type="button"
        onClick={async () => {
          const result = await assistant.trySubmitModelReply(
            JSON.stringify({
              type: "interaction_action",
              resolution: {
                status: "resolved",
                utterance: "删除评审方案",
                targetId: "task.item.task_1",
                actionId: "task.delete",
                confidence: 0.92,
              },
            }),
            "删除评审方案"
          )
          setReply(`${result.handled}:${result.result?.executed}:${result.reply?.content ?? ""}`)
        }}
      >
        model disallowed delete
      </button>
      <div data-testid="model-policy-reply">{reply}</div>
      <div data-testid="model-policy-executed">{executed}</div>
      <MultimodalGroup
        id="task.item.task_1"
        role="list_item"
        label="评审方案"
        entity={{ type: "task", id: "task_1" }}
      >
        <span>评审方案</span>
      </MultimodalGroup>
    </>
  )
}

function ModelRiskPolicyHarness() {
  const assistant = useInteractionAssistant({
    modelActionPolicy: {
      mode: "allowlist",
      actionIds: ["task.delete"],
      allowDomainActions: true,
      allowPrimitiveActions: false,
      requireConfirmationForRisk: ["medium", "high"],
    },
  })
  const [reply, setReply] = React.useState("")
  const [executed, setExecuted] = React.useState("none")

  useInteractionActions({
    namespace: "task",
    actions: {
      "task.delete": {
        attachTo: { entityType: "task" },
        executeScope: "object",
        risk: "medium",
        modelCallable: true,
      },
    },
    execute: (action) => setExecuted(action.type),
  })

  return (
    <>
      <button
        type="button"
        onClick={async () => {
          const result = await assistant.trySubmitModelReply(
            JSON.stringify({
              type: "interaction_action",
              resolution: {
                status: "resolved",
                utterance: "删除评审方案",
                targetId: "task.item.task_1",
                actionId: "task.delete",
                confidence: 0.92,
              },
            }),
            "删除评审方案"
          )
          setReply(`${result.handled}:${result.result?.executed}:${result.reply?.content ?? ""}`)
        }}
      >
        model risky delete
      </button>
      <div data-testid="model-risk-reply">{reply}</div>
      <div data-testid="model-risk-executed">{executed}</div>
      <MultimodalGroup
        id="task.item.task_1"
        role="list_item"
        label="评审方案"
        entity={{ type: "task", id: "task_1" }}
      >
        <span>评审方案</span>
      </MultimodalGroup>
    </>
  )
}

function ModelMissingTargetHarness() {
  const assistant = useInteractionAssistant({
    modelActionPolicy: {
      mode: "allowlist",
      actionIds: ["task.create"],
    },
  })
  const [reply, setReply] = React.useState("")
  const [executed, setExecuted] = React.useState("none")

  useInteractionActions({
    namespace: "task",
    actions: {
      "task.create": {
        attachTo: { id: "task.composer" },
        executeScope: "page",
        modelCallable: true,
        paramsFrom: ({ candidate }: ActionContext) => ({
          title: String(candidate?.params?.title ?? ""),
        }),
      },
    },
    execute: (action) => {
      setExecuted(`${action.type}:${action.title ?? ""}`)
      return { status: "changed" }
    },
  })

  return (
    <>
      <button
        type="button"
        onClick={async () => {
          const result = await assistant.trySubmitModelReply(
            JSON.stringify({
              type: "interaction_action",
              resolution: {
                status: "resolved",
                utterance: "创建任务：发布说明",
                actionId: "task.create",
                params: { title: "发布说明" },
                confidence: 0.92,
              },
            }),
            "创建任务：发布说明"
          )
          setReply(`${result.handled}:${result.result?.executed}:${result.reply?.content ?? ""}`)
        }}
      >
        model add without target
      </button>
      <div data-testid="model-missing-target-reply">{reply}</div>
      <div data-testid="model-missing-target-executed">{executed}</div>
      <MultimodalGroup id="task.composer" role="composer" label="新建任务">
        <input aria-label="任务标题" />
      </MultimodalGroup>
    </>
  )
}

function ModelBatchPreflightHarness() {
  const assistant = useInteractionAssistant({
    modelActionPolicy: {
      mode: "allowlist",
      actionIds: ["task.complete"],
      allowDomainActions: true,
      allowPrimitiveActions: false,
    },
  })
  const [reply, setReply] = React.useState("")
  const [executed, setExecuted] = React.useState("none")

  useInteractionActions({
    namespace: "task",
    actions: {
      "task.complete": {
        attachTo: { entityType: "task" },
        executeScope: "object",
        modelCallable: true,
        paramsFrom: ({ target }) => ({ taskId: target.entity?.id }),
      },
    },
    execute: (action) => {
      setExecuted(String(action.taskId))
      return { status: "changed" }
    },
  })

  return (
    <>
      <button
        type="button"
        onClick={async () => {
          const result = await assistant.trySubmitModelReply(
            JSON.stringify({
              type: "interaction_actions",
              resolutions: [
                {
                  status: "resolved",
                  utterance: "完成全部任务",
                  targetId: "task.item.task_1",
                  actionId: "task.complete",
                  confidence: 0.92,
                },
                {
                  status: "resolved",
                  utterance: "完成全部任务",
                  targetId: "task.item.missing",
                  actionId: "task.complete",
                  confidence: 0.92,
                },
              ],
            }),
            "完成全部任务"
          )
          setReply(`${result.handled}:${result.result?.executed}:${result.reply?.content ?? ""}`)
        }}
      >
        model batch invalid
      </button>
      <div data-testid="model-batch-reply">{reply}</div>
      <div data-testid="model-batch-executed">{executed}</div>
      <MultimodalGroup
        id="task.item.task_1"
        role="list_item"
        label="评审方案"
        entity={{ type: "task", id: "task_1" }}
      >
        <span>评审方案</span>
      </MultimodalGroup>
    </>
  )
}

function DuplicateGroupHarness() {
  const snapshot = useInteractionSnapshot()
  const duplicateGroup = snapshot.visibleObjects
    .filter((object) => object.id === "dup.group")
    .map((object) => `${object.label}:${object.source}`)
    .join("|")

  return (
    <>
      <div data-testid="duplicate-group">{duplicateGroup}</div>
      <MultimodalGroup id="dup.group" role="panel" label="First">
        <span>First body</span>
      </MultimodalGroup>
      <MultimodalGroup id="dup.group" role="panel" label="Second">
        <span>Second body</span>
      </MultimodalGroup>
    </>
  )
}

function SameLabelClarificationHarness() {
  const submitUtterance = useSubmitUtterance()
  const [completed, setCompleted] = React.useState<Record<string, boolean>>({
    today: false,
    tomorrow: false,
  })
  const [result, setResult] = React.useState("")

  useInteractionActions({
    namespace: "task",
    actions: {
      "task.complete": {
        attachTo: { entityType: "task" },
        executeScope: "object",
        paramsFrom: ({ target }) => ({ taskId: target.entity?.id }),
      },
    },
    execute: (action) => {
      setCompleted((current) => ({
        ...current,
        [String(action.taskId)]: true,
      }))
      return { status: "changed" }
    },
  })

  return (
    <>
      <button
        type="button"
        onClick={async () => {
          const submitted = await submitUtterance("完成开会")
          setResult(`${submitted.resolution.status}:${submitted.executed ?? false}`)
        }}
      >
        voice same label
      </button>
      <div data-testid="same-label-result">{result}</div>
      <div data-testid="same-label-state">{`${completed.today}:${completed.tomorrow}`}</div>
      <MultimodalGroup id="task.list" role="list" label="任务列表" indexBy="visible_order">
        <MultimodalGroup
          id="task.item.today"
          role="list_item"
          label="开会"
          entity={{ type: "task", id: "today" }}
          state={{ completed: completed.today }}
        >
          <span>开会</span>
        </MultimodalGroup>
        <MultimodalGroup
          id="task.item.tomorrow"
          role="list_item"
          label="开会"
          entity={{ type: "task", id: "tomorrow" }}
          state={{ completed: completed.tomorrow }}
        >
          <span>开会</span>
        </MultimodalGroup>
      </MultimodalGroup>
    </>
  )
}

function DeicticFocusHarness() {
  const snapshot = useInteractionSnapshot()
  const submitUtterance = useSubmitUtterance()
  const [completed, setCompleted] = React.useState<Record<string, boolean>>({
    today: false,
    tomorrow: false,
  })

  useInteractionActions({
    namespace: "task",
    actions: {
      "task.complete": {
        attachTo: { entityType: "task" },
        executeScope: "object",
        paramsFrom: ({ target }) => ({ taskId: target.entity?.id }),
      },
    },
    execute: (action) => {
      setCompleted((current) => ({
        ...current,
        [String(action.taskId)]: true,
      }))
      return { status: "changed" }
    },
  })

  return (
    <>
      <button type="button" onClick={() => void submitUtterance("完成这个")}>
        voice this item
      </button>
      <div data-testid="deictic-focus">{snapshot.unifiedFocus.semanticFocus?.objectId ?? "none"}</div>
      <div data-testid="deictic-state">{`${completed.today}:${completed.tomorrow}`}</div>
      <MultimodalGroup id="task.list" role="list" label="任务列表" indexBy="visible_order">
        <MultimodalGroup
          id="task.item.today"
          role="list_item"
          label="开会"
          entity={{ type: "task", id: "today" }}
          state={{ completed: completed.today }}
        >
          <span data-testid="today-label">开会</span>
        </MultimodalGroup>
        <MultimodalGroup
          id="task.item.tomorrow"
          role="list_item"
          label="开会"
          entity={{ type: "task", id: "tomorrow" }}
          state={{ completed: completed.tomorrow }}
        >
          <span data-testid="tomorrow-label">开会</span>
        </MultimodalGroup>
      </MultimodalGroup>
    </>
  )
}

function DuplicateActionHarness() {
  const submitUtterance = useSubmitUtterance()
  const [executed, setExecuted] = React.useState("none")

  useInteractionActions({
    namespace: "first",
    actions: {
      "task.complete": {
        attachTo: { entityType: "task" },
        executeScope: "object",
      },
    },
    execute: () => {
      setExecuted("first")
      return { status: "changed" }
    },
  })
  useInteractionActions({
    namespace: "second",
    actions: {
      "task.complete": {
        attachTo: { entityType: "task" },
        executeScope: "object",
      },
    },
    execute: () => {
      setExecuted("second")
      return { status: "changed" }
    },
  })

  return (
    <>
      <button type="button" onClick={() => void submitUtterance("完成第一个")}>
        voice duplicate action
      </button>
      <div data-testid="duplicate-action-executed">{executed}</div>
      <MultimodalGroup id="task.list" role="list" label="任务列表" indexBy="visible_order">
        <MultimodalGroup
          id="task.item.task_1"
          role="list_item"
          label="评审方案"
          entity={{ type: "task", id: "task_1" }}
          state={{ completed: false }}
        >
          <span>评审方案</span>
        </MultimodalGroup>
      </MultimodalGroup>
    </>
  )
}

describe("MultimodalProvider", () => {
  it("resolves a voice command and executes the registered domain action", async () => {
    render(
      <MultimodalProvider>
        <TaskHarness />
      </MultimodalProvider>
    )

    fireEvent.click(screen.getByRole("button", { name: "voice" }))

    await waitFor(() => {
      expect((screen.getByRole("checkbox", { name: "评审方案" }) as HTMLInputElement).checked).toBe(true)
    })
  })

  it("indexes dynamic list items by their visible DOM order", async () => {
    render(
      <MultimodalProvider>
        <DynamicTaskHarness />
      </MultimodalProvider>
    )

    fireEvent.click(screen.getByRole("button", { name: "add first" }))

    await waitFor(() => {
      expect(screen.getByRole("checkbox", { name: "整理需求" })).not.toBeNull()
    })

    fireEvent.click(screen.getByRole("button", { name: "voice" }))

    await waitFor(() => {
      expect((screen.getByRole("checkbox", { name: "整理需求" }) as HTMLInputElement).checked).toBe(true)
      expect((screen.getByRole("checkbox", { name: "评审方案" }) as HTMLInputElement).checked).toBe(false)
    })
  })

  it("falls back to an opt-in LLM resolver after low-confidence rule resolution", async () => {
    const llmResolver = createLlmResolver({
      complete: () => ({
        status: "resolved",
        utterance: "把评审方案那个完成",
        intent: "complete_task",
        targetId: "task.item.task_1",
        actionId: "task.complete",
        confidence: 0.91,
      }),
    })

    render(
      <MultimodalProvider resolvers={[llmResolver]} resolverMode="rule-first">
        <LlmTaskHarness />
      </MultimodalProvider>
    )

    fireEvent.click(screen.getByRole("button", { name: "voice llm" }))

    await waitFor(() => {
      expect((screen.getByRole("checkbox", { name: "评审方案" }) as HTMLInputElement).checked).toBe(true)
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
        utterance: "完成评审方案",
        intent: "complete_task",
        targetId: "task.item.task_1",
        actionId: "task.complete",
        confidence: 0.91,
      }),
    })

    function CompletedHarness() {
      const [executed, setExecuted] = React.useState(false)
      const submitUtterance = useSubmitUtterance()

      useInteractionActions({
        namespace: "task",
        actions: {
          "task.complete": {
            attachTo: { entityType: "task" },
            executeScope: "object",
            availableWhen: ({ target }) => target.state?.completed === false,
          },
        },
        execute: () => setExecuted(true),
      })

      return (
        <>
          <button type="button" onClick={() => void submitUtterance("完成评审方案")}>
            invalid llm
          </button>
          <div data-testid="executed">{String(executed)}</div>
          <MultimodalGroup
            id="task.item.task_1"
            role="list_item"
            label="评审方案"
            entity={{ type: "task", id: "task_1" }}
            state={{ completed: true }}
          >
            <span>评审方案</span>
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
      expect(screen.getByTestId("snapshot-value").textContent).toBe("true:6")
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
      expect(screen.getByTestId("api-result").textContent).toBe("resolved:task.item.task_1")
    })

    fireEvent.click(screen.getByRole("button", { name: "submit api" }))

    await waitFor(() => {
      expect(screen.getByTestId("api-result").textContent).toMatch(/^true:domain-action:/)
    })
  })

  it("confirms a pending turn by dispatching the frozen command", async () => {
    render(
      <MultimodalProvider>
        <ConfirmTurnHarness />
      </MultimodalProvider>
    )

    fireEvent.click(screen.getByRole("button", { name: "confirm api" }))

    await waitFor(() => {
      expect(screen.getByTestId("confirm-result").textContent).toBe(
        "false:confirmation_required:awaiting_confirmation:true:committed"
      )
      expect(screen.getByTestId("confirm-deleted").textContent).toBe("true")
    })
  })

  it("rejects a frozen confirmation command after snapshot invalidation", async () => {
    render(
      <MultimodalProvider>
        <ConfirmationInvalidationHarness />
      </MultimodalProvider>
    )

    fireEvent.click(screen.getByRole("button", { name: "prepare invalidated delete" }))

    await waitFor(() => {
      expect(screen.getByTestId("invalidation-result").textContent).toBe(
        "prepared:confirmation_required"
      )
    })

    fireEvent.click(screen.getByRole("button", { name: "confirm invalidated delete" }))

    await waitFor(() => {
      expect(screen.getByTestId("invalidation-result").textContent).toBe(
        "confirmed:false:state_changed"
      )
      expect(screen.getByTestId("invalidation-deleted").textContent).toBe("false")
    })
  })

  it("registers virtual route objects and executes route commands", async () => {
    render(
      <MultimodalProvider>
        <RouteHarness />
      </MultimodalProvider>
    )

    fireEvent.click(screen.getByRole("button", { name: "voice route" }))

    await waitFor(() => {
      expect(screen.getByTestId("screen").textContent).toBe("settings")
    })
  })

  it("registers navigation history actions against the current page", async () => {
    render(
      <MultimodalProvider localRules={navigationHistoryRules}>
        <NavigationHistoryHarness />
      </MultimodalProvider>
    )

    fireEvent.click(screen.getByRole("button", { name: "voice back" }))

    await waitFor(() => {
      expect(screen.getByTestId("history-screen").textContent).toBe("home")
    })

    fireEvent.click(screen.getByRole("button", { name: "voice forward" }))

    await waitFor(() => {
      expect(screen.getByTestId("history-screen").textContent).toBe("details")
    })
  })

  it("lets assistant surfaces try local interaction before chat fallback", async () => {
    render(
      <MultimodalProvider>
        <AssistantHarness />
      </MultimodalProvider>
    )

    fireEvent.click(screen.getByRole("button", { name: "assistant route" }))

    await waitFor(() => {
      expect(screen.getByTestId("assistant-reply").textContent).toBe("true:已打开首页。")
    })
  })

  it("manages assistant conversation model fallback state", async () => {
    render(
      <MultimodalProvider>
        <AssistantConversationHarness />
      </MultimodalProvider>
    )

    fireEvent.click(screen.getByRole("button", { name: "conversation submit" }))

    await waitFor(() => {
      expect(screen.getByTestId("conversation-status").textContent).toBe("ready")
      expect(screen.getByTestId("conversation-messages").textContent).toContain(
        "你好|你好，我是模型回复。"
      )
    })
  })

  it("includes registered routes in the assistant manifest context", async () => {
    render(
      <MultimodalProvider>
        <AssistantPromptManifestHarness />
      </MultimodalProvider>
    )

    fireEvent.click(screen.getByRole("button", { name: "create prompt" }))

    await waitFor(() => {
      const prompt = screen.getByTestId("assistant-prompt").textContent ?? ""
      expect(prompt).toContain('"manifest"')
      expect(prompt).toContain('"app.route.profile"')
      expect(prompt).toContain('"navigation.goto"')
    })
  })

  it("lets assistant local execution be disabled by policy", async () => {
    render(
      <MultimodalProvider>
        <DisabledLocalAssistantHarness />
      </MultimodalProvider>
    )

    fireEvent.click(screen.getByRole("button", { name: "disabled assistant route" }))

    await waitFor(() => {
      expect(screen.getByTestId("disabled-assistant-reply").textContent).toBe("false")
    })
  })

  it("lets assistant local execution be allowlisted by action id", async () => {
    render(
      <MultimodalProvider>
        <AllowlistedLocalAssistantHarness />
      </MultimodalProvider>
    )

    fireEvent.click(screen.getByRole("button", { name: "allowlisted assistant route" }))

    await waitFor(() => {
      expect(screen.getByTestId("allowlisted-assistant-reply").textContent).toBe(
        "true:allowed route"
      )
    })
  })

  it("blocks LLM action replies outside the model action policy", async () => {
    render(
      <MultimodalProvider>
        <ModelActionPolicyHarness />
      </MultimodalProvider>
    )

    fireEvent.click(screen.getByRole("button", { name: "model disallowed delete" }))

    await waitFor(() => {
      expect(screen.getByTestId("model-policy-reply").textContent).toBe(
        "true:false:模型动作策略未放行该 action"
      )
      expect(screen.getByTestId("model-policy-executed").textContent).toBe("none")
    })
  })

  it("requires confirmation for risky LLM action replies by default", async () => {
    render(
      <MultimodalProvider>
        <ModelRiskPolicyHarness />
      </MultimodalProvider>
    )

    fireEvent.click(screen.getByRole("button", { name: "model risky delete" }))

    await waitFor(() => {
      expect(screen.getByTestId("model-risk-reply").textContent).toBe("true:false:该操作需要确认")
      expect(screen.getByTestId("model-risk-executed").textContent).toBe("none")
    })
  })

  it("infers a model action target from its action spec when targetId is omitted", async () => {
    render(
      <MultimodalProvider>
        <ModelMissingTargetHarness />
      </MultimodalProvider>
    )

    fireEvent.click(screen.getByRole("button", { name: "model add without target" }))

    await waitFor(() => {
      expect(screen.getByTestId("model-missing-target-reply").textContent).toBe(
        "true:true:已执行：task.create。"
      )
      expect(screen.getByTestId("model-missing-target-executed").textContent).toBe(
        "task.create:发布说明"
      )
    })
  })

  it("preflights model batch actions before executing any item", async () => {
    render(
      <MultimodalProvider>
        <ModelBatchPreflightHarness />
      </MultimodalProvider>
    )

    fireEvent.click(screen.getByRole("button", { name: "model batch invalid" }))

    await waitFor(() => {
      expect(screen.getByTestId("model-batch-reply").textContent).toBe(
        "true:false:没有找到对应的操作目标"
      )
      expect(screen.getByTestId("model-batch-executed").textContent).toBe("none")
    })
  })

  it("reports duplicate group registrations without replacing the active owner", async () => {
    const registryErrors: string[] = []

    render(
      <MultimodalProvider onRegistryError={(error) => registryErrors.push(error.message)}>
        <DuplicateGroupHarness />
      </MultimodalProvider>
    )

    await waitFor(() => {
      expect(registryErrors.some((message) =>
        message.includes("Duplicate multimodal registration for group:dup.group")
      )).toBe(true)
      expect(screen.getByTestId("duplicate-group").textContent).toBe("First:registered_group")
    })
  })

  it("does not execute the first same-label object when clarification is required", async () => {
    render(
      <MultimodalProvider>
        <SameLabelClarificationHarness />
      </MultimodalProvider>
    )

    fireEvent.click(screen.getByRole("button", { name: "voice same label" }))

    await waitFor(() => {
      expect(screen.getByTestId("same-label-result").textContent).toBe(
        "needs_clarification:false"
      )
      expect(screen.getByTestId("same-label-state").textContent).toBe("false:false")
    })
  })

  it("uses recent GUI semantic focus for deictic utterances", async () => {
    render(
      <MultimodalProvider>
        <DeicticFocusHarness />
      </MultimodalProvider>
    )

    fireEvent.click(screen.getByTestId("tomorrow-label"))

    await waitFor(() => {
      expect(screen.getByTestId("deictic-focus").textContent).toBe("task.item.tomorrow")
    })

    fireEvent.click(screen.getByRole("button", { name: "voice this item" }))

    await waitFor(() => {
      expect(screen.getByTestId("deictic-state").textContent).toBe("false:true")
    })
  })

  it("reports duplicate action ids without replacing the first executor", async () => {
    const registryErrors: string[] = []

    render(
      <MultimodalProvider onRegistryError={(error) => registryErrors.push(error.message)}>
        <DuplicateActionHarness />
      </MultimodalProvider>
    )

    await waitFor(() => {
      expect(registryErrors.some((message) =>
        message.includes("Duplicate multimodal action registration for task.complete")
      )).toBe(true)
    })

    fireEvent.click(screen.getByRole("button", { name: "voice duplicate action" }))

    await waitFor(() => {
      expect(screen.getByTestId("duplicate-action-executed").textContent).toBe("first")
    })
  })
})
