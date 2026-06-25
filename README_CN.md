# OmniUI

[English](README.md) | [中文](README_CN.md)

面向 React 的 runtime-first 多模态交互基础库。

OmniUI 会把当前 GUI 转成精简的 Interaction Snapshot，解析“点击新增”“完成第一项”这类可见界面语音命令，校验目标 action，然后通过和 GUI 点击相同的业务处理器执行。

核心产品是 `@omni-ui/react`：你可以在不替换现有 UI 库的前提下，把多模态能力接入已有 React 应用。shadcn registry 是可选能力，为希望快速获得默认 UI kit 的团队提供可编辑 starter components 和 recipes。

## 包结构

- `@omni-ui/core`：框架无关的类型、snapshot 创建、action registry、resolver contract、validation 和 feedback primitives。
- `@omni-ui/react`：React runtime、DOM/ARIA 抽取、provider、hooks 和默认反馈样式。
- `@omni-ui/shadcn`：可选 shadcn registry source，会把可编辑 wrappers 和 starter recipes 安装到 `components/multimodal/*`。
- `apps/docs`：本地移动端 TodoList 示例项目，包含底部 tabs、todo 详情页、浮动 Chatbot 和 settings。

这里是项目总览。逐步接入指南见 [packages/README.md](packages/README.md)。包级 README 分别在 [packages/react/README.md](packages/react/README.md)、[packages/core/README.md](packages/core/README.md) 和 [packages/shadcn/README.md](packages/shadcn/README.md)。

## 两条产品线

**Runtime integration** 是已有应用的默认路径：

```text
Use @omni-ui/react with your current Button, Input, Dialog, Table, routes, and state.
Mark business objects with MultimodalGroup.
Register domain actions with useInteractionActions.
```

**UI kit / registry** 是新项目或 shadcn 用户的可选路径：

```text
Install editable source files from the registry into components/multimodal/*.
Keep using your local components/ui/* and theme tokens.
Customize the installed code like any other app code.
```

## 快速开始

安装依赖并启动本地 TodoList 应用：

```bash
npm install
npm run dev
```

打开：

```text
http://127.0.0.1:5173/
```

本地应用暴露 `/`、`/todos`、`/todos/:id`、`/projects`、`/projects/:id`、`/calendar`、`/kanban`、`/analytics` 和 `/settings`。Chatbot 是从底部 tab 打开的全局浮动 sheet，所以切换页面时依然可用。访问 `/chat` 会为了兼容性在 Home 上打开同一个浮动 sheet。发送消息前，请先在 Settings tab 填入 SiliconFlow API key。

也可以在启动 Vite 前设置 `SILICONFLOW_API_KEY` 作为服务端 fallback，但本地 UI 使用建议走 Settings。

不要直接用 `file://` 打开 `apps/docs/index.html`；TodoList 应用需要通过 Vite 服务访问。

可以在 demo 中试这些指令：

```text
完成第一个
打开 Chatbot
只看今天
清空已完成
把买牛奶那个完成
只显示还没做完的
```

## 最小 React 用法

```tsx
import {
  defineMultimodalConfig,
  MultimodalProvider,
  MultimodalPage,
  MultimodalGroup,
  useInteractionActions,
} from "@omni-ui/react"

const multimodalConfig = defineMultimodalConfig({
  rules: [
    {
      id: "navigation.goto",
      patterns: ["打开{route}", "去{route}", "进入{route}", "回到{route}"],
      target: "route.byLabel",
      actionId: "navigation.goto",
    },
  ],
})

function App() {
  return (
    <MultimodalProvider config={multimodalConfig}>
      <MultimodalPage id="page.todo" title="Todo" route="/todo">
        <TodoPage />
      </MultimodalPage>
    </MultimodalProvider>
  )
}

function TodoItem({ todo, executeTodoAction }) {
  return (
    <MultimodalGroup
      id={`todo.item.${todo.id}`}
      role="list_item"
      label={todo.title}
      entity={{ type: "todo", id: todo.id }}
    >
      <button onClick={() => executeTodoAction({ type: "todo.complete", todoId: todo.id })}>
        完成
      </button>
      <span>{todo.title}</span>
    </MultimodalGroup>
  )
}
```

在页面中注册一次业务 action：

```tsx
useInteractionActions({
  namespace: "todo",
  actions: {
    "todo.complete": {
      attachTo: { entityType: "todo" },
      executeScope: "object",
      paramsFrom: ({ target }) => ({ todoId: target.entity?.id }),
      availableWhen: ({ target }) => target.state?.completed === false,
    },
  },
  execute: executeTodoAction,
})
```

`todo.complete` 由应用拥有。OmniUI 不内置 Todo、CRM、inbox 或其他业务 action。应用需要注册自己的 domain actions，并通过 GUI 点击也使用的 reducer/service 执行。

新的执行链路会把解析结果冻结为 `CommandEnvelope`，再统一经过 Dispatcher 校验。模型触发的写操作需要同时满足 runtime policy、`modelCallable: true`、参数 schema、scope、target/action attach、确认策略和当前 snapshot anchor。旧 executor 返回 `void` 会被视为 `unverified`；推荐 executor 显式返回 `{ status: "changed" }`、`noop`、`rejected` 或 `pending`，这样聊天和语音反馈不会把“已提交”误说成“已完成”。

低层 API 也提供 turn 级能力：`useInteractionApi()` 现在包含 `resolveVoice()`、`submitVoice()`、`getActiveTurn()`、`getTurn()`、`confirmTurn()` 和 `cancelTurn()`。确认保存的是同一条不可变 command，而不是重新解析上一条模型回复。

ASR 厂商可以通过 `VoiceAdapter` seam 和 `useVoiceAdapter()` 接入：adapter 发布 `partial` 与 `final` `VoiceInput` 事件，runtime 会把 partial 保持为预览，把 final 送入正常 Turn/Dispatcher 流程。

## App Manifest 和本地规则

Runtime 维护两层上下文：

- 当前 Interaction Snapshot：实时页面、可见对象、状态、焦点和当前可执行 actions。
- App Manifest：全局能力，例如已注册路由和不要求目标页面已挂载的 app-level commands。

开发者不需要为 LLM 手写整张 app map。请在 app root 使用 route/action registration API，它们会自动合并进 manifest。

```tsx
useInteractionRoutes({
  routes: [
    { id: "app.route.home", label: "Home", route: { screen: "home" }, path: "/" },
    { id: "app.route.settings", label: "Settings", route: { screen: "settings" }, path: "/settings" },
  ],
  execute: (route) => navigate(route),
})
```

`useInteractionRoutes()` 会注册内置 `navigation.goto` action，把 route objects 暴露给本地解析，并把 route metadata 写入 LLM manifest context。

应用可以在 JSON/TS 配置中添加确定性的本地规则：

```ts
import { defineMultimodalConfig } from "@omni-ui/react"

export default defineMultimodalConfig({
  rules: [
    {
      id: "navigation.goto",
      patterns: ["打开{route}", "去{route}", "进入{route}"],
      target: "route.byLabel",
      actionId: "navigation.goto",
    },
    {
      id: "issue.close",
      patterns: ["关闭{issue}", "把{issue}关闭"],
      target: "entity.issue.byLabelOrIndex",
      actionId: "issue.close",
    },
  ],
})
```

route 规则使用库提供的 `navigation.goto`。`issue.close` 仍然由应用通过 `useInteractionActions()` 实现。

## 可选 shadcn Registry

Runtime 接入不需要 registry。registry 是 source-code starter kit，适合想使用 shadcn 风格多模态组件和 recipes 的团队。生成后的 registry 文件会写入 `apps/docs/public/r`。

```bash
npm run registry:build
```

本地开发时，registry items 可通过这些地址访问：

```text
http://127.0.0.1:5173/r/index.json
http://127.0.0.1:5173/r/multimodal-provider.json
```

registry 会把 wrappers 安装到 `components/multimodal/*`，不会覆盖 `components/ui/*`。安装后的文件属于项目源码，开发者可以直接修改 class names、layout、behavior 和 theme usage。

docs app 运行时，可以用 shadcn CLI 安装本地 registry item：

```bash
npx shadcn@latest add http://127.0.0.1:5173/r/multimodal-provider.json
```

## Resolver 模型

默认情况下，runtime 使用内置 rule resolver。它离线运行，并基于当前 Interaction Snapshot 处理 visible-speak commands。

`defineMultimodalConfig({ rules })` 中的配置化本地规则会先于外部 LLM resolvers 执行，因此应用特定的确定性命令可以留在本地。

LLM 支持通过 `IntentResolver` 接口 opt-in。LLM 可以提出候选 action，但不能直接执行 action；本地 validation 仍然会强制检查 scope、state version、availability 和 confirmation policies。

LLM prompt 会收到用户 utterance、精简 Interaction Snapshot、精简 App Manifest 和预期 JSON schema。它不会收到整个项目、源码或未注册页面。

Provider helpers 从环境变量读取 API keys。设置 `OPENAI_API_KEY` + `OPENAI_MODEL` 或 `ANTHROPIC_API_KEY` + `ANTHROPIC_MODEL`；可选 base URL 可以来自 `OPENAI_BASE_URL` 或 `ANTHROPIC_BASE_URL`。

```ts
// Server-only code. Do not bundle this file into the browser.
import { createOpenAIResolver } from "@omni-ui/core"

const resolver = createOpenAIResolver()
```

请只在服务端或可信 runtime 中使用这些 helpers。浏览器应用应把 API keys 留在服务端，并暴露一个小型 resolver endpoint。

```ts
const resolution = await resolver.resolve({ utterance, snapshot })
```

## 低层 Interaction API

Runtime 不绑定任何特定对话 UI。任意输入入口都可以直接调用 API：

```tsx
import { useInteractionApi } from "@omni-ui/react"

function MyInput() {
  const interaction = useInteractionApi()

  async function send(text: string) {
    const snapshot = interaction.getSnapshot()
    const resolved = await interaction.resolveText(text)
    const submitted = await interaction.submitUtterance(text)

    return { snapshot, resolved, submitted }
  }
}
```

- `getSnapshot()` 返回当前页面、可见对象、状态、焦点和已注册 actions。
- `resolveText(text)` 调用 rule/LLM resolver，返回拟执行的 target/action，但不执行。
- `submitUtterance(text)` 解析、校验并执行匹配到的 domain 或 primitive action，然后返回结构化结果。

## Assistant 和 Route Helpers

应用可以先注册一次非 DOM route targets，然后让聊天或语音入口通过同一个已校验 dispatcher 执行导航：

```tsx
useInteractionRoutes({
  routes: [
    { id: "app.route.home", label: "Home", route: { screen: "home" }, aliases: ["main"] },
    { id: "app.route.settings", label: "Settings", route: { screen: "settings" } },
  ],
  execute: (route) => navigate(route),
})
```

`useAssistantConversation()` 封装常见 chatbot 路径：message state、确定性本地快路径、LLM fallback、高风险 action 确认和本地回复。这个 hook 不绑定 provider；传入任意 `callModel(messages)` 即可接 OpenAI-compatible APIs、Anthropic 或你自己的 gateway。

```tsx
const conversation = useAssistantConversation({
  assistantOptions: {
    localFastPath: {
      mode: "allowlist",
      actionIds: ["navigation.*"],
      allowPrimitiveActions: false,
    },
    modelActionPolicy: {
      mode: "allowlist",
      actionIds: ["navigation.*", "todo.complete", "todo.update"],
      allowPrimitiveActions: false,
      requireConfirmationForRisk: ["medium", "high"],
    },
    localReply: {
      actionReplies: {
        "navigation.goto": ({ result }) => `Opened ${result.target?.label}.`,
      },
    },
  },
  callModel: async (messages) => {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages }),
    })
    const data = await response.json()
    return data.content
  },
})

await conversation.submitMessage()
```

`localFastPath` 是应用拥有的 JSON policy，用于可以跳过 LLM 的命令，例如路由跳转或关闭 dialog。`modelActionPolicy` 是模型 proposal 的独立安全门。推荐让模型返回 `interaction_hypotheses`，只提供 intent、target reference、slots 和 confidence；runtime 会再基于当前 snapshot/fusion 做本地裁决后才 dispatch。旧式 `interaction_action` JSON 仍作为 command proposal 兼容。两者都支持精确值和 `navigation.*` 这类前缀通配；`localExecution` 仍作为 `localFastPath` 的向后兼容别名存在。

你的 `/api/chat` endpoint 可以调用 OpenAI-compatible `/chat/completions` API、Anthropic Messages 或任何会返回 assistant text 的 provider。浏览器代码应该请求你的服务端，不要直接携带 provider API keys。

## 验证

```bash
npm run verify
```

验证命令会运行 typecheck、tests、runtime package builds 和 docs production build。

Registry 验证是单独命令：

```bash
npm run verify:registry
```

## 版本路线图

- `v0.1`：runtime-first visible-speak MVP。
- `v0.2`：可选 shadcn registry recipes，包括 assistant panels、forms、data views 和 starter layouts。
- `v0.3`：resolver plugins 和 opt-in LLM intent understanding。
- `v0.4`：gaze、gesture、keyboard target hints 和 multimodal event fusion。

`v0.2` 之后的路线图是方向性计划，可能会随着 API 稳定过程调整。
