# Multimodal UI Developer Integration Guide

这份文档面向要把 Multimodal UI 接入自己 React 项目的开发者。目标是让你只关心三件事：

1. 写一份本地规则配置，让常见命令可以离线解析。
2. 在页面里添加 Multimodal 组件或 hook，让 runtime 知道当前 UI 有哪些对象。
3. 注册你自己的业务 action，让 GUI、语音、聊天助手都走同一套业务逻辑。

Multimodal UI 不内置 `todo.complete`、`issue.close`、`order.refund` 这类业务 action。库只提供运行时、语义快照、本地规则解析、全局导航能力、LLM action 校验和分发。业务 action 由你的应用定义。

这份指南讲的是主产品线：**已有 React 项目怎么改造**。你不需要替换 UI 库，也不需要使用 shadcn；保留现有 Button、Input、Dialog、Table 和业务组件，只在关键位置补充多模态语义。

## Packages

- `@multimodal-ui/core`：框架无关的类型、snapshot、manifest、本地规则 resolver、LLM resolver、action 校验。
- `@multimodal-ui/react`：React Provider、DOM/ARIA 抽取、hooks、route/action 注册、assistant helper。
- `@multimodal-ui/shadcn`：可选的 shadcn registry / recipes，安装可编辑源码到 `components/multimodal/*`，不覆盖 `components/ui/*`。

大多数 React 项目只需要直接使用 `@multimodal-ui/react`。

## Install

```bash
npm install @multimodal-ui/react
```

如果你使用 shadcn registry，按项目里的 registry 地址安装对应组件。registry 文件只是可编辑 starter code，底层 runtime 仍来自 `@multimodal-ui/react`。

## Two Paths

已有项目改造：

```text
@multimodal-ui/react
  -> MultimodalProvider
  -> MultimodalPage / MultimodalGroup / useInteractionNode
  -> useInteractionRoutes / useInteractionActions
  -> useInteractionApi / useInteractionAssistant
```

开箱 UI kit：

```text
@multimodal-ui/shadcn registry
  -> 安装 components/multimodal/* 源码
  -> 复用你的 components/ui/* 和主题变量
  -> 修改安装后的 className、结构和行为
```

## Mental Model

Multimodal UI 的 runtime 会维护两层上下文：

- `Interaction Snapshot`：当前页面运行时快照。包含当前页面、可见对象、对象状态、可执行 action、焦点、弹窗上下文。
- `App Manifest`：全局能力索引。包含已注册的路由、全局命令、跨页面能力。它不是整个项目源码，也不是全量业务数据。

用户说一句话时，链路是：

```text
utterance
  -> configured local rules / built-in rule resolver
  -> optional LLM fallback
  -> local validation
  -> registered action executor
```

LLM 只能提出候选 action，不能绕过本地校验直接改状态。

## 1. Create A Config

建议在应用里放一个 `multimodal.config.ts`。

```ts
import {
  NAVIGATION_GOTO_ACTION_ID,
  defineMultimodalConfig,
} from "@multimodal-ui/react"

export const multimodalConfig = defineMultimodalConfig({
  rules: [
    {
      id: "navigation.goto",
      patterns: ["打开{route}", "去{route}", "进入{route}", "回到{route}"],
      target: "route.byLabel",
      actionId: NAVIGATION_GOTO_ACTION_ID,
    },
    {
      id: "issue.close",
      patterns: ["关闭{issue}", "把{issue}关闭", "完成{issue}"],
      target: "entity.issue.byLabelOrIndex",
      actionId: "issue.close",
    },
  ],
  llm: {
    localFastPath: {
      mode: "allowlist",
      actionIds: ["navigation.*"],
      allowPrimitiveActions: false,
    },
    modelActionPolicy: {
      mode: "allowlist",
      actionIds: ["navigation.*", "issue.*"],
      allowPrimitiveActions: false,
      requireConfirmationForRisk: ["medium", "high"],
    },
  },
})
```

`navigation.goto` 是库提供的通用 action。`issue.close` 是你的应用自己的 action，后面需要用 `useInteractionActions()` 注册执行逻辑。

常用 target：

- `route.byLabel`：按路由 label/alias 找目标。
- `object.byLabel`：按可见对象 label/alias 找目标。
- `object.byIndex`：按“第一个/第二个”找可见对象。
- `object.byLabelOrIndex`：先按序号，找不到再按名称。
- `entity.issue.byLabelOrIndex`：只在 `entity.type === "issue"` 的对象里找。
- `page.current`：当前页面作为目标。

## 2. Wrap Your App

在应用根部加 `MultimodalProvider`。

```tsx
import { MultimodalProvider } from "@multimodal-ui/react"
import { multimodalConfig } from "./multimodal.config"

export function App() {
  return (
    <MultimodalProvider config={multimodalConfig}>
      <AppRuntime />
    </MultimodalProvider>
  )
}
```

如果你有自己的 LLM resolver，也可以传给 Provider：

```tsx
<MultimodalProvider
  config={multimodalConfig}
  resolvers={[myLlmResolver]}
  resolverMode="rule-first"
>
  <AppRuntime />
</MultimodalProvider>
```

默认推荐 `rule-first`：先本地解析，置信度不够再让 LLM 兜底。

## 3. Register Routes Once

跨页面能力不要让开发者手写全局地图。用 `useInteractionRoutes()` 在 app root 注册路由即可，它会自动：

- 创建可被本地规则/LLM 找到的 route object。
- 注册内置 `navigation.goto` action。
- 把路由写进 App Manifest，给 LLM 作为全局能力上下文。

```tsx
import { useInteractionRoutes } from "@multimodal-ui/react"

type AppRoute =
  | { screen: "home" }
  | { screen: "issues" }
  | { screen: "settings" }

function AppRuntime() {
  const [route, setRoute] = useAppRoute()

  useInteractionRoutes<AppRoute>({
    routes: [
      {
        id: "app.route.home",
        label: "首页",
        aliases: ["主页"],
        path: "/",
        route: { screen: "home" },
        active: route.screen === "home",
      },
      {
        id: "app.route.issues",
        label: "问题列表",
        aliases: ["问题", "工单"],
        path: "/issues",
        route: { screen: "issues" },
        active: route.screen === "issues",
      },
      {
        id: "app.route.settings",
        label: "设置",
        aliases: ["配置"],
        path: "/settings",
        route: { screen: "settings" },
        active: route.screen === "settings",
      },
    ],
    execute: (nextRoute) => setRoute(nextRoute),
  })

  return <CurrentScreen route={route} />
}
```

现在用户说“打开设置”，即使设置页面还没渲染，runtime 也能通过 App Manifest 找到路由并执行 `navigation.goto`。

## 4. Mark Pages And Business Objects

页面用 `MultimodalPage`。

```tsx
import { MultimodalPage } from "@multimodal-ui/react"

function IssuesPage({ issues }: { issues: Issue[] }) {
  return (
    <MultimodalPage
      id="page.issues"
      title="问题列表"
      route="/issues"
      state={{
        totalCount: issues.length,
        openCount: issues.filter((issue) => issue.status === "open").length,
      }}
    >
      <IssueList issues={issues} />
    </MultimodalPage>
  )
}
```

业务列表和列表项用 `MultimodalGroup`。重点是给业务对象挂 `entity`。

```tsx
import { MultimodalGroup } from "@multimodal-ui/react"

function IssueList({ issues }: { issues: Issue[] }) {
  return (
    <MultimodalGroup id="issue.list" role="list" label="问题列表" indexBy="visible_order">
      {issues.map((issue) => (
        <MultimodalGroup
          key={issue.id}
          id={`issue.item.${issue.id}`}
          role="list_item"
          label={issue.title}
          aliases={[`#${issue.number}`]}
          entity={{ type: "issue", id: issue.id }}
          state={{
            status: issue.status,
            priority: issue.priority,
          }}
        >
          <IssueRow issue={issue} />
        </MultimodalGroup>
      ))}
    </MultimodalGroup>
  )
}
```

这样用户说“关闭第一个”或“关闭登录失败那个”，本地规则可以解析到对应 `issue.item.*`。

## 5. Register Your Domain Actions

业务 action 由应用自己定义。GUI 点击和多模态执行应该共用同一个 executor。

```tsx
import {
  useInteractionActions,
  type ActionContext,
  type ActionPayload,
} from "@multimodal-ui/react"

type IssueAction =
  | { type: "issue.close"; issueId: string }
  | { type: "issue.reopen"; issueId: string }
  | { type: "issue.assign"; issueId: string; assigneeId: string }

function IssuesRuntime({ closeIssue, reopenIssue, assignIssue }: Props) {
  const executeIssueAction = React.useCallback((action: ActionPayload) => {
    const issueAction = action as IssueAction

    if (issueAction.type === "issue.close") {
      closeIssue(issueAction.issueId)
      return
    }

    if (issueAction.type === "issue.reopen") {
      reopenIssue(issueAction.issueId)
      return
    }

    if (issueAction.type === "issue.assign") {
      assignIssue(issueAction.issueId, issueAction.assigneeId)
    }
  }, [assignIssue, closeIssue, reopenIssue])

  useInteractionActions({
    namespace: "issue",
    actions: {
      "issue.close": {
        attachTo: { entityType: "issue" },
        executeScope: "object",
        paramsFrom: ({ target }: ActionContext) => ({
          issueId: target.entity?.id,
        }),
        availableWhen: ({ target }: ActionContext) => target.state?.status === "open",
        risk: "medium",
      },
      "issue.reopen": {
        attachTo: { entityType: "issue" },
        executeScope: "object",
        paramsFrom: ({ target }: ActionContext) => ({
          issueId: target.entity?.id,
        }),
        availableWhen: ({ target }: ActionContext) => target.state?.status === "closed",
      },
      "issue.assign": {
        attachTo: { entityType: "issue" },
        executeScope: "object",
        paramsFrom: ({ target, candidate }: ActionContext) => ({
          issueId: target.entity?.id,
          assigneeId: candidate?.params?.assigneeId,
        }),
      },
    },
    execute: executeIssueAction,
  })

  return null
}
```

`risk: "medium"` 或 `requiresConfirmation: true` 会被本地校验和 assistant policy 使用。LLM 返回的 action 也必须经过这些校验。

## 6. Add A Text Or Voice Entry

如果你只想要一个低层输入框，可以用 `useInteractionApi()`。

```tsx
import { useInteractionApi } from "@multimodal-ui/react"

function CommandInput() {
  const interaction = useInteractionApi()
  const [text, setText] = React.useState("")

  async function submit() {
    const result = await interaction.submitUtterance(text)

    if (!result.ok) {
      console.warn(result.error)
    }
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
    >
      <input value={text} onChange={(event) => setText(event.target.value)} />
      <button type="submit">执行</button>
    </form>
  )
}
```

常用 API：

- `getSnapshot()`：读取当前 Interaction Snapshot。
- `resolveText(text)`：只解析，不执行。
- `dispatchResolution(resolution)`：执行一个已解析的候选 action。
- `submitUtterance(text)`：解析、校验、执行一条用户输入。

## 7. Add An Assistant With LLM Fallback

聊天助手推荐用 `useInteractionAssistant()`。

```tsx
import { useInteractionAssistant } from "@multimodal-ui/react"

function AssistantInput() {
  const assistant = useInteractionAssistant({
    localFastPath: {
      mode: "allowlist",
      actionIds: ["navigation.*"],
      allowPrimitiveActions: false,
    },
    modelActionPolicy: {
      mode: "allowlist",
      actionIds: ["navigation.*", "issue.*"],
      allowPrimitiveActions: false,
      requireConfirmationForRisk: ["medium", "high"],
    },
    localReply: {
      actionReplies: {
        "navigation.goto": ({ result }) => `已打开${result.target?.label ?? "目标"}。`,
        "issue.close": ({ targetLabel }) => `已关闭${targetLabel}。`,
      },
    },
  })

  async function send(text: string) {
    const local = await assistant.trySubmitLocal(text)
    if (local.reply) return local.reply.content

    const messages = assistant.createChatMessages([
      { role: "user", content: text },
    ])

    const modelContent = await callYourServerLlm(messages)
    const model = await assistant.trySubmitModelReply(modelContent, text)

    return model.reply?.content ?? model.content ?? "没有返回内容。"
  }
}
```

`assistant.createChatMessages()` 生成的 system prompt 会包含：

- 当前 compact Interaction Snapshot。
- compact App Manifest。
- 操作输出格式说明。

它不会包含整个项目源码、未注册页面、未暴露的业务数据。

## 8. Optional Server-Side LLM Resolver

如果你想把“意图解析”也交给服务端 LLM，可以实现一个 resolver。

```ts
import { createOpenAIResolver } from "@multimodal-ui/react"

export const resolver = createOpenAIResolver({
  model: process.env.OPENAI_MODEL,
  apiKeyEnv: "OPENAI_API_KEY",
})
```

浏览器里不要直接放 API key。推荐做一个自己的 server endpoint，让前端只发送 `messages` 或 `utterance + snapshot`。

无论 LLM 在哪里运行，它返回的 action 都会回到本地 runtime 做校验和 dispatch。

## 9. Optional shadcn Registry

如果你装了 shadcn registry，可以用 `components/multimodal/*` 里的组件替换部分基础 UI 组件，也可以安装更高层的 starter recipes。

```tsx
import { MultimodalButton } from "@/components/multimodal/button"
import { MultimodalInput } from "@/components/multimodal/input"

<MultimodalInput
  interactionId="issue.search"
  interactionLabel="搜索问题"
  placeholder="搜索问题"
/>

<MultimodalButton
  interactionId="issue.create"
  interactionLabel="新建问题"
>
  新建
</MultimodalButton>
```

基础 wrapper 适合按钮、输入框、选项卡这类控件。业务对象仍建议用 `MultimodalGroup` 表达边界和 `entity`。

更高层 recipes 适合新项目起步，例如 assistant panel、form、data table。它们不是黑盒组件库；安装后就是你项目里的源码，样式和结构都可以按你的设计系统修改。

```tsx
import { MultimodalAssistantPanel } from "@/components/multimodal/assistant-panel"
import { MultimodalDataTable } from "@/components/multimodal/data-table"
```

## What Developers Own

你需要负责：

- 定义业务 action id，例如 `issue.close`、`order.cancel`。
- 注册 action 的 `attachTo`、`executeScope`、`paramsFrom`、`availableWhen`。
- 让 GUI 点击和多模态执行共用同一个业务 executor。
- 给关键业务对象提供稳定的 `id`、`label`、`entity` 和必要 `state`。
- 在 app root 注册 routes，让跨页面能力进入 manifest。

库负责：

- 抽取 DOM/ARIA 和 registered groups。
- 生成 Interaction Snapshot。
- 合并 App Manifest。
- 提供内置 `navigation.goto`。
- 执行本地规则和 resolver 链路。
- 校验 action 是否存在、目标是否还在、状态是否变化、是否需要确认。
- 把 action 分发到你注册的 executor。

## Recommended Integration Checklist

1. 在根节点加 `MultimodalProvider config={multimodalConfig}`。
2. 在 app root 用 `useInteractionRoutes()` 注册全局路由。
3. 每个页面加 `MultimodalPage`。
4. 业务列表和详情对象加 `MultimodalGroup`，并设置 `entity`。
5. 用 `useInteractionActions()` 注册业务 action。
6. 在 `multimodal.config.ts` 写本地规则。
7. 用 `useInteractionApi()` 或 `useInteractionAssistant()` 接入输入框、语音或聊天。
8. 为高风险 action 设置 `risk` 或 `requiresConfirmation`。
9. 确认 `npm run verify` 通过。

## Common Pitfalls

- 不要把业务 action 放进库里。库只提供通用能力；业务 action 属于 app。
- 不要让 LLM 直接改业务状态。LLM 只能返回候选 action。
- 不要依赖未加载页面的 runtime state。跨页面只通过 route/global manifest 导航过去，再读取新页面 snapshot。
- 不要给每个按钮手写语音命令。优先给业务对象声明 `label`、`entity`、`state`，再集中注册 action。
- 不要把 API key 放浏览器里。LLM fallback 应该通过你自己的服务端。
