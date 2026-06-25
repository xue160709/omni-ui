# OmniUI 统一改造实施规范

> **主题**：VUI + GUI 多模态 Runtime、LLM 意图理解、开发者体验与开源发布治理  
> **文档状态**：Proposed / Codex Execution Spec  
> **适用仓库**：`xue160709/omni-ui`  
> **审阅基线**：`main@e06a719`（Codex 开始实施时必须先以实际 `main` HEAD 复核差异）  
> **基线日期**：2026-06-25  
> **主要执行者**：Codex、仓库维护者、Reviewer  
> **范围**：VUI + GUI；VUI 可接入本地规则和 LLM 意图理解  
> **本文地位**：本文件是 Runtime 重构、公开 API、DevTools、文档、示例、包发布和版本治理的唯一实施依据

---

# 0. 使用说明与规范级别

本文统一了以下两类原始建议：

1. VUI + GUI 多模态状态机第二阶段重构；
2. OmniUI 开源化与开发者接入体验改进。

两类建议不再作为平级规范单独执行。发生解释差异时，以本文明确的职责边界、实施顺序和验收标准为准。

本文中的关键词：

- **MUST / 必须**：该阶段合并前必须满足；
- **SHOULD / 应当**：除非 PR 中记录明确技术理由，否则应满足；
- **MAY / 可以**：可选增强；
- **禁止**：不得采用，即使能让测试暂时通过；
- **兼容层**：仅用于旧 API 迁移，不得成为新主链路的数据源；
- **正式主链路**：新代码、文档和示例默认使用的 Runtime 路径。

Codex 必须按本文的阶段和 Gate 实施，不得一次性重写整个 Runtime，也不得同时冻结尚未稳定的协议。

---

# 1. 执行摘要

OmniUI 的目标不是让 LLM 直接操作 DOM，也不是替代业务状态管理，而是为现有 GUI 增加一个安全、可解释、可取消、可验证的多模态交互层。

最终系统应准确符合以下描述：

> VUI 输入先被本地规则或 LLM 转换为语义假设；GUI Event、Unified Focus、Interaction Snapshot、ASR 时间信息和 Context Epoch 由 Runtime 做确定性融合。融合决策属于同一个 InteractionTurn，并被冻结为不可变 CommandEnvelope。所有命令经过统一 Dispatcher 的实时校验、确认、执行和验证。任何迟到、过期、被取消、被覆盖或上下文不一致的结果都不能执行，也不能复活旧 Turn。业务状态仍由宿主应用自己的 Executor 修改。

统一目标链路：

```text
Voice partial / Voice final / Text
                    +
GUI Event Buffer / Snapshot / Unified Focus
                    ↓
              InteractionTurn
                    ↓
      Local Rule / Optional LLM Resolver
                    ↓
        Semantic Intent Hypotheses
                    ↓
              FusionContext
  ├─ ASR n-best / token timing
  ├─ GUI event timeline
  ├─ Unified Focus
  ├─ Interaction Snapshot
  ├─ Context Epoch
  └─ Turn Snapshot Anchor
                    ↓
       Ranked Candidates + Evidence
                    ↓
              turn.decision
          ┌─────────┴─────────┐
          ↓                   ↓
   Clarification        Ready / Confirmation
                              ↓
                  Immutable CommandEnvelope
                              ↓
                    Unified Dispatcher
      validation → execution → verification
                              ↓
           DispatchResult + Lifecycle Event
                              ↓
              Unified Focus + Trace + UI
```

在开发者体验上，普通 React 用户第一次接入只需理解：

```text
Provider → Page → Entity/Group → Action → Executor → CommandInput
```

Turn、Fusion、Command、Confirmation、Trace 等高级概念应由 Runtime 默认管理，并通过 advanced API 和 DevTools 暴露。

---

# 2. 当前基线与主要问题

当前仓库已经具备较多正确基础：

- 框架无关的 Core；
- React Runtime；
- Interaction Snapshot；
- Action Registry；
- 本地规则和 LLM Resolver；
- `InteractionTurn` 基础状态；
- Semantic Hypothesis、Candidate 和 Evidence 类型；
- GUI Event Buffer 和 Unified Focus；
- Domain/Primitive 统一 Dispatcher；
- CommandEnvelope；
- Confirmation Grant；
- 参数、Scope、Capability、Authorization 和 Postcondition 校验；
- 模型 Action 默认关闭与数据脱敏；
- ASR partial/final 接口；
- structured execution result；
- Trace、Batch 和事务辅助能力；
- 可选 shadcn 组件或 Registry 方向。

目前的核心问题不是缺少模块，而是**内部主链路没有完全收口，外部开发者路径也没有围绕真实主链路组织**。

## 2.1 Runtime 问题

1. `InteractionTurn` 还不是 hypotheses、candidates、decision、command 和 result 的唯一事实源；
2. LLM/Fusion 结果仍可能过早压缩成旧 `ResolvedInteraction`；
3. GUI 与 Voice 的时序关系没有成为正式 Fusion 输入；
4. 存在第一个 target/action 的隐式兜底风险；
5. Resolver 取消、Turn revision 和 late result 之间没有统一的一一绑定；
6. ASR partial 和 final 可能被拆成不同 Turn；
7. Dispatcher 阶段可能在执行完成后补写，而非实时发布；
8. 确认重试不得通过伪造 Snapshot 版本绕过过期校验；
9. Action lifecycle event、Trace 和 Unified Focus 尚未形成完整闭环；
10. 全局 `lastResolution` 仍可能被误用为提交依据。

## 2.2 开源与接入问题

1. README 首要路径仍容易偏向仓库贡献者，而非 npm 消费者；
2. 第一次接入暴露过多内部概念；
3. 系统架构图若省略 Turn 与 Fusion，会让开发者误以为 Resolver 或 LLM 可直接生成可执行命令；
4. 接入失败时缺少基于真实 Turn/Trace 的 DevTools；
5. README、教程、示例和发布包可能发生漂移；
6. monorepo 内可运行，不代表 npm tarball 可被真实消费者使用；
7. 协议、错误、执行结果和 Adapter 边界尚未完全统一；
8. 示例不应要求模型 API Key、语音权限或特定 UI 库；
9. Protocol V1 不能建立在即将降级的旧 `ResolvedInteraction` 上；
10. CLI、DevTools 和第三方 Adapter 不应早于核心 API 稳定。

---

# 3. 目标与非目标

## 3.1 Runtime 目标

1. `InteractionTurn` 成为一次交互的唯一事实源；
2. LLM 只生成语义假设，不直接决定最终 GUI 对象或执行权限；
3. GUI 时序、焦点、页面上下文、ASR n-best 和语义假设共同参与 Fusion；
4. Command 只能由 `turn.decision` 构造；
5. 每个 Turn 独立取消、过期、覆盖和 CAS 写入；
6. Dispatcher 实时发布 validation、execution、verification；
7. Confirmation 绑定完整冻结命令；
8. Domain、Primitive、Batch 和 Confirmation Retry 走同一安全链；
9. action committed 自动反哺 Event Buffer 和 Unified Focus；
10. Trace 可以还原 input → hypothesis → candidate → decision → command → result。

## 3.2 开发者体验目标

1. 开发者在 30 秒内理解 OmniUI 的用途；
2. React 开发者在 5 分钟内完成第一条本地文本命令；
3. 首次接入不要求 LLM Key、语音权限或 shadcn；
4. 不替换现有 UI 组件和业务状态；
5. 最小示例只修改一个页面并复用已有业务函数；
6. DevTools 能解释命令未执行的具体阶段；
7. README、文档和 npm 发布包使用同一套可编译示例；
8. Vite 消费者通过真实 `npm pack` tarball 验证；
9. Next.js、React Router、SSR 和样式入口边界有明确说明；
10. API、协议和错误具有可迁移、可版本化的演进路径。

## 3.3 开源治理目标

1. 明确 Core、React、DevTools、Adapter、CLI 和 shadcn 的职责；
2. 控制根公开 API 面积；
3. 使用 subpath exports 隔离 advanced、devtools、testing 和 server；
4. 建立 Changesets、Release、Changelog、Migration 和消费者验证；
5. 协议版本与 npm 包版本可以独立演进；
6. 为服务端 Resolver、第三方语音和 Telemetry 留出稳定 Adapter 契约。

## 3.4 非目标

本轮不优先实现：

- 眼动、手势、空间计算等其他模态的产品适配；
- 多 Agent 自动规划；
- LLM 直接调用业务函数或 DOM；
- 通用工作流语言；
- 新业务状态管理框架；
- 一次性支持全部前端框架；
- 大规模插件市场；
- 在 Runtime 主链路稳定前冻结 Protocol V1；
- 在 advanced API 稳定前完成 CLI 自动代码生成；
- 为追求“简单”而降低 Core mandatory validation。

---

# 4. 统一决策：消除原建议中的交叉歧义

本节是 Codex 实施时最重要的优先级规则。

## 4.1 Resolver 的职责

正式架构：

```text
Resolver → Semantic Hypotheses
Fusion   → Ranked Candidates / Decision
Runtime  → CommandEnvelope
Dispatcher → Validation / Execution / Verification
```

禁止将架构描述为：

```text
Resolver / LLM → 最终 Command → Executor
```

本地规则可以非常确定，但也必须通过统一的 hypothesis/fusion/decision 主链路，或通过受控 adapter 转换到该主链路。

## 4.2 `ResolutionResultV1` 的定义时机与来源

不得把旧 `ResolvedInteraction` 冻结为公开 `ResolutionResultV1`。

正确关系：

```text
ResolutionBundle
  ├─ hypotheses
  ├─ candidates
  ├─ rejected candidates
  ├─ fusion outcome
  ├─ evidence
  └─ decision

ResolutionResultV1 = ResolutionBundle 的可序列化协议视图
ResolvedInteraction = ResolutionResultV1 的 deprecated 兼容投影
```

禁止从 `ResolvedInteraction` 反推或重建正式 `ResolutionBundle`。

Protocol V1 只能在 Runtime Track 的 ResolutionBundle、Fusion、Command 和 DispatchResult 稳定后冻结。

## 4.3 执行结果分两层

### Executor 层：`ActionExecutionResult`

表示宿主业务函数本身的结果：

```ts
export type ActionExecutionResult<T = unknown> =
  | {
      status: "changed"
      data?: T
      message?: string
    }
  | {
      status: "unchanged"
      reason?: string
    }
  | {
      status: "pending"
      operationId: string
      data?: T
    }
  | {
      status: "rejected"
      code: string
      reason: string
      data?: T
    }
```

Executor 抛出的异常由 Runtime 转换为标准 failed 结果。不得让 `void` 默认等于 changed。

### Dispatcher 层：`DispatchResult`

表示完整校验、确认、执行、验证后的最终结果：

```ts
export type DispatchStatus =
  | "committed"
  | "unverified"
  | "pending"
  | "noop"
  | "rejected"
  | "failed"
  | "cancelled"
  | "confirmation_required"
```

映射原则：

```text
Executor changed + verification passed  → committed
Executor changed + verification failed  → unverified
Executor unchanged                       → noop
Executor pending                         → pending
Executor rejected                        → rejected
异常                                     → failed
确认缺失                                 → confirmation_required
可证明未产生副作用的取消                 → cancelled
```

## 4.4 Action 定义与执行绑定解耦

公开 API 应提供：

```ts
defineAction(...)
useActionExecutor(action, executor, options?)
```

静态 Action Definition 负责：

- id、title、description；
- params schema；
- attach/target 语义；
- risk；
- model/voice callable；
- intent/voice aliases；
- implicit action policy；
- stale policy；
-文档和 Manifest 元数据。

Executor Binding 负责：

-具体业务函数；
-AbortSignal 支持；
-conflict key；
-postcondition；
-运行环境能力。

当前 `useInteractionActions` 保留为兼容 API，并可内部转换为新定义与绑定。

## 4.5 快速入门默认不开放模型权限

最小本地示例必须：

```ts
modelCallable: false
voiceCallable: true
```

或省略 `modelCallable`，默认 false。

规则：

- 本地 rule resolver 不要求 `modelCallable`；
- LLM 提议该动作必须同时满足 Action opt-in 和 Provider policy；
- Voice 是输入模态权限，Model 是提议来源权限，两者不得混为一个字段；
- 中高风险动作必须有确认或更严格策略。

## 4.6 DevTools 数据源

DevTools 必须基于：

- `InteractionTurn`
- `InteractionTrace`
- `InteractionEvent`
- `ResolutionBundle`
- `CommandEnvelope`
- `DispatchPhaseEvent`
- `DispatchResult`

不得基于：

- 全局 `lastResolution`
- 最后一条 Assistant 文本
- 临时 React UI 状态
- LLM 原始自然语言输出

因此 DevTools 完整实现必须等待 Turn/Trace/Phase Event 收口。

## 4.7 PolicyAdapter 的权限边界

执行顺序：

```text
Core mandatory validation
        ↓
Application PolicyAdapter
        ↓
Action-specific authorization
        ↓
Confirmation
        ↓
Execution
```

以下 Core 约束不可被外部 Adapter 覆盖：

- Snapshot Anchor；
- Context Epoch；
- Command provenance；
- Turn revision；
- target 存在；
- target enabled；
- action-target binding；
- primitive capability；
- params schema；
- Confirmation fingerprint；
- terminal Turn；
- scope hard reject。

策略采用：

```text
deny overrides allow
```

外部 PolicyAdapter 可以进一步拒绝、要求确认或降低权限，不能让 Core 已拒绝的命令重新放行。

## 4.8 公开 API 采用双层结构

默认 API 面向普通 React 开发者，保持简单：

```text
Provider / Page / Group(Entity) / Action / Executor / CommandInput
```

Advanced API 面向：

- 自定义 Resolver；
- Voice Adapter；
- DevTools；
- 调试；
-复杂交互；
-服务端协议。

建议入口：

```text
@omni-ui/core
@omni-ui/core/advanced
@omni-ui/core/server
@omni-ui/core/testing

@omni-ui/react
@omni-ui/react/advanced
@omni-ui/react/devtools
@omni-ui/react/styles
@omni-ui/react/testing
```

`TurnStore`、内部 reducer、Fusion 权重 helper 等实现细节不应默认从根入口导出。

## 4.9 实施优先级采用两条 Track，而不是两个互相争抢的 P0

### Track A：Runtime Correctness

负责状态机、Fusion、Command、Dispatcher、安全和可观测性。

### Track B：Open-source DX

负责 README、示例、消费者打包、文档、DevTools UI、发布和 CLI。

两条 Track 可以部分并行，但有明确 Gate：

- README 定位、npm pack 验证、仓库命名、CI 可先做；
- DevTools 完整链路必须等待真实 Trace；
- Protocol V1 必须等待 Resolution/Dispatch 结构稳定；
- 最终 Quick Start API 必须等待根公开 API 收口；
- CLI 自动生成必须等待 API 冻结。

---

# 5. 核心不变量

## INV-01：Turn 是唯一事实源

正式执行链不得从以下对象直接构造命令：

- 全局 `lastResolution`；
- 任意模型原始 JSON；
- 任意未绑定 Turn 的旧 Resolution；
- Assistant 自然语言消息；
- UI 临时状态。

## INV-02：LLM 只产生语义假设

LLM 可以输出：

- intent；
- action hint；
- target reference；
- slots；
- missing slots；
- semantic confidence；
- model target hint。

LLM 输出不能被视为：

- target 存在证明；
- action-target 绑定证明；
-权限；
-确认；
-执行结果；
-业务状态事实。

## INV-03：所有写操作进入 Dispatcher

Domain、Primitive、Batch、Assistant 和 Confirmation Retry 都必须经过统一 Dispatcher。

## INV-04：Command 不可变

Command 创建后不得修改：

- target；
- action；
- params；
- anchor；
- source；
- decision binding；
- context epoch。

修改任何字段必须创建新命令，并使旧确认失效。

## INV-05：确认绑定完整命令

确认绑定至少包含：

```text
turnId + commandId + target + action + params + anchor + contextEpoch + fingerprint
```

## INV-06：晚到结果不得复活 Turn

以下任一条件成立，异步结果必须丢弃：

- Turn 不存在；
- Turn 已终态；
- expected revision 不匹配；
- resolution revision 不匹配；
- signal 已 abort；
- context epoch 失效；
- Turn 被 supersede；
- voice session 不再属于该 Turn。

## INV-07：没有默认首项

禁止：

```ts
objects[0]
target.actions?.[0]
primitiveActions[0]
```

作为歧义消除机制。

## INV-08：不伪造 Snapshot

禁止：

```ts
{ ...currentSnapshot, stateVersion: oldVersion }
```

或任何修改真实 Snapshot 字段以绕过 stale 校验的做法。

## INV-09：只有真实提交更新 semantic focus

默认只有 `committed` 更新 semantic focus。

以下结果不得更新：

- rejected；
- failed；
- noop；
- cancelled；
- clarification；
- preview；
- validation-only；
- pending。

`unverified` 默认不更新，可由明确配置调整。

## INV-10：partial 不执行

Voice partial：

- 可以更新同一个 Turn；
- 可以执行纯本地 preview；
- 可以预高亮；
- 不得构造可提交 Command；
- 不得请求确认；
- 不得调用业务 Executor。

## INV-11：默认安全关闭

- LLM Action 默认关闭；
- Action 未声明 risk 时，写操作不得默认为 low；
- Primitive 默认 strict staleness；
- 外部 Resolver 不得绕过 Action allowlist；
- 敏感 GUI 数据默认不发送给模型。

## INV-12：业务状态归宿主应用

OmniUI：

- 不成为业务 store；
- 不直接篡改业务实体；
- 不绕过现有权限；
- 不把 DOM 变化等同于业务成功；
- 只通过注册 Executor 调用宿主业务函数。

---

# 6. 目标架构与包职责

## 6.1 逻辑架构

```text
@omni-ui/core
  协议类型
  Turn reducer/store
  Resolver contracts
  Fusion
  Action registry metadata
  Command
  Validation
  Policy
  Confirmation
  Dispatcher
  Events / Focus
  Trace / Error / Privacy helpers

@omni-ui/react
  DOM/ARIA 提取
  React 生命周期
  Page / Group 注册
  Provider / Hooks
  Voice session bridge
  Runtime controller
  Action executor binding
  Default feedback primitives

@omni-ui/react/devtools 或 @omni-ui/devtools
  Turn timeline
  Snapshot inspector
  Candidate/evidence inspector
  Command/phase/result inspector
  主动诊断
  匿名诊断导出

@omni-ui/adapters-*
  LLM Resolver
  Speech Recognition
  Telemetry
  Storage
  Feedback
  服务端代理

@omni-ui/shadcn-registry
  可选的可编辑 UI 源码与 recipes

@omni-ui/cli
  init / doctor
```

## 6.2 强制边界

- Core 不依赖 React；
- Core 不依赖 DOM；
- React Runtime 不直接依赖具体模型 SDK；
- DevTools 不成为生产 Runtime 强制依赖；
- UI 组件不决定核心协议；
- Server entry 不引入浏览器代码；
- 业务状态由宿主应用维护；
- Adapter 不得绕过 Core mandatory validation。

## 6.3 源码模块建议

```text
packages/core/src/
  turn.ts
  turn-store.ts
  resolution.ts
  fusion.ts
  fusion-context.ts
  command.ts
  action-registry.ts
  dispatcher.ts
  confirmation.ts
  events.ts
  focus.ts
  observability.ts
  errors.ts
  protocol.ts
  resolver.ts
  rule-resolver.ts
  llm-resolver.ts
  privacy.ts

packages/react/src/
  runtime.tsx
  runtime-turn-store.ts
  runtime-resolution.ts
  runtime-dispatch.ts
  runtime-events.ts
  runtime-snapshot.ts
  action-executor.ts
  voice.ts
  assistant-conversation.tsx
  devtools/
```

拆分原则：

1. 先通过测试完成行为改造；
2. 后做机械文件拆分；
3. 不在同一个 PR 中同时改状态语义、公开 API 和目录结构；
4. 不用拆包掩盖主链路未收口的问题。

---

# 7. 核心数据模型

# 7.1 `InteractionTurn`

建议目标结构：

```ts
export type InteractionTurnStatus =
  | "created"
  | "listening"
  | "resolving"
  | "needs_clarification"
  | "awaiting_confirmation"
  | "ready"
  | "validating"
  | "executing"
  | "verifying"
  | "committed"
  | "unverified"
  | "pending"
  | "noop"
  | "rejected"
  | "failed"
  | "cancelled"
  | "superseded"
  | "expired"

export type InteractionTurn = {
  id: string
  revision: number
  inputRevision: number
  resolutionRevision: number
  status: InteractionTurnStatus
  source: "voice" | "assistant" | "text"

  input: VoiceInput | TextInput
  transcriptRevisions?: VoiceInput[]

  anchor: SnapshotAnchor
  contextEpoch: number

  hypotheses: SemanticIntentHypothesis[]
  candidates: RankedInteractionCandidate[]
  decision?: InteractionDecision

  clarification?: ClarificationRequest
  pendingCommand?: CommandEnvelope
  confirmation?: ConfirmationGrant
  result?: DispatchResult

  phaseHistory: TurnPhaseRecord[]

  createdAt: number
  updatedAt: number
  expiresAt?: number
  supersededBy?: string
  error?: OmniError
}
```

要求：

- `inputRevision` 在 partial/final 更新时递增；
- `resolutionRevision` 每次开始新解析时递增；
- `contextEpoch` 在 Turn 创建时冻结；
- transcript revisions 默认最多保留 10 条；
- terminal Turn 不可再变更；
- Trace 不从状态推测阶段时间，而使用真实 phase records。

## 7.2 Turn 领域事件

禁止公开调用方任意指定下一状态。

```ts
export type TurnEvent =
  | { type: "voice.partial"; input: VoiceInput; at: number }
  | { type: "voice.final"; input: VoiceInput; at: number }
  | {
      type: "resolution.started"
      resolutionRevision: number
      at: number
    }
  | {
      type: "resolution.completed"
      bundle: ResolutionBundle
      at: number
    }
  | {
      type: "clarification.requested"
      clarification: ClarificationRequest
      at: number
    }
  | {
      type: "clarification.answered"
      answer: ClarificationAnswer
      at: number
    }
  | {
      type: "confirmation.requested"
      command: CommandEnvelope
      at: number
    }
  | {
      type: "confirmation.granted"
      confirmation: ConfirmationGrant
      at: number
    }
  | {
      type: "dispatch.phase"
      phase: DispatchPhaseEvent
      at: number
    }
  | {
      type: "dispatch.completed"
      result: DispatchResult
      at: number
    }
  | {
      type: "turn.cancelled"
      reason: string
      at: number
    }
  | {
      type: "turn.superseded"
      supersededBy: string
      at: number
    }
  | {
      type: "turn.expired"
      at: number
    }
```

## 7.3 `InteractionDecision`

```ts
export type InteractionDecision = {
  candidateId: string
  hypothesisId: string
  targetId: string
  actionId?: string
  primitiveAction?: PrimitiveAction
  params: Record<string, unknown>
  score: number
  confidenceMargin: number
  evidence: FusionEvidence[]
  contextEpoch: number
  decidedAt: number
}
```

Command 必须能追溯到该 `candidateId`。

## 7.4 `ResolutionBundle`

```ts
export type FusionOutcome =
  | {
      status: "ready"
      decision: InteractionDecision
      candidates: RankedInteractionCandidate[]
    }
  | {
      status: "needs_clarification"
      reason:
        | "target_ambiguous"
        | "action_ambiguous"
        | "missing_slots"
        | "low_confidence"
        | "context_changed"
      candidates: RankedInteractionCandidate[]
      missingSlots?: string[]
      actionCandidates?: string[]
    }
  | {
      status: "not_found"
      reason: string
      candidates: RankedInteractionCandidate[]
    }

export type ResolutionBundle = {
  turnId: string
  resolutionRevision: number
  anchor: SnapshotAnchor
  resolverIds: string[]
  hypotheses: SemanticIntentHypothesis[]
  fusion: FusionOutcome
  startedAt: number
  completedAt: number

  /** @deprecated，仅用于旧 API */
  legacyResolution?: ResolvedInteraction
}
```

要求：

- 保存完整 hypotheses；
- 保存 rejected candidates；
- 保存 evidence；
- ready 才能有 decision；
- legacy projection 只能从 Bundle 生成。

## 7.5 `FusionContext`

```ts
export type FusionContext = {
  turnId: string
  resolutionRevision: number
  anchor: SnapshotAnchor
  contextEpoch: number
  now: number

  snapshot: InteractionSnapshot
  focus: UnifiedFocus

  utterance: {
    text: string
    startedAt?: number
    endedAt?: number
    finalAt: number
    confidence?: number
    nBest?: VoiceAlternative[]
    tokens?: VoiceToken[]
  }

  events: InteractionEvent[]
}
```

## 7.6 Action Definition

```ts
export type ActionRisk = "low" | "medium" | "high"

export type ActionDefinition<TParams> = {
  id: string
  title: string
  description?: string

  paramsSchema: Schema<TParams>

  attachTo?: ActionAttachment
  executeScope: "object" | "group" | "page" | "global"

  risk: ActionRisk
  voiceCallable?: boolean
  modelCallable?: boolean

  voiceAliases?: string[]
  intentAliases?: string[]

  implicitSelection?: {
    enabled: boolean
    modalities?: Array<"voice" | "text" | "assistant">
  }

  stalePolicy?:
    | { mode: "strict" }
    | {
        mode: "revalidate"
        stateKeys?: string[]
      }
}
```

默认：

```ts
voiceCallable: true
modelCallable: false
stalePolicy: { mode: "strict" }
```

未提供 risk 的写动作不得默认为 low；开发环境应报错。

## 7.7 Executor Binding

```ts
export type ActionExecutorOptions<
  TParams,
  TResult extends ActionExecutionResult
> = {
  signalSupport?: boolean

  conflictKey?: (input: {
    params: TParams
    target: InteractionObject
    command: CommandEnvelope
  }) => string

  postcondition?: (input: {
    before: InteractionSnapshot
    after: InteractionSnapshot
    result: TResult
    command: CommandEnvelope
  }) => boolean | Promise<boolean>
}
```

## 7.8 `CommandEnvelope`

Command 至少绑定：

```ts
export type CommandEnvelope = {
  id: string
  turnId: string
  candidateId: string
  decisionFingerprint: string

  kind: "domain" | "primitive"
  targetId: string
  actionId?: string
  primitiveAction?: PrimitiveAction
  params: Record<string, unknown>

  source: "voice" | "text" | "assistant" | "legacy"

  anchor: SnapshotAnchor & {
    contextEpoch: number
  }

  createdAt: number
}
```

## 7.9 统一错误模型

```ts
export type OmniErrorStage =
  | "voice"
  | "snapshot"
  | "manifest"
  | "turn"
  | "resolution"
  | "fusion"
  | "validation"
  | "policy"
  | "confirmation"
  | "dispatch"
  | "execution"
  | "verification"
  | "adapter"

export interface OmniError {
  code: string
  message: string
  stage: OmniErrorStage
  recoverable: boolean
  retryable?: boolean
  details?: Record<string, unknown>
  cause?: unknown
}
```

至少定义：

```text
OMNI_PROVIDER_MISSING
OMNI_PAGE_NOT_FOUND
OMNI_ENTITY_ID_INVALID
OMNI_ACTION_DUPLICATED
OMNI_ACTION_NOT_FOUND
OMNI_EXECUTOR_MISSING
OMNI_TURN_NOT_FOUND
OMNI_TURN_TERMINAL
OMNI_TURN_REVISION_CONFLICT
OMNI_TURN_SUPERSEDED
OMNI_CONTEXT_EPOCH_CHANGED
OMNI_RESOLUTION_NO_MATCH
OMNI_RESOLUTION_STALE
OMNI_FUSION_AMBIGUOUS_TARGET
OMNI_FUSION_AMBIGUOUS_ACTION
OMNI_ARGUMENT_VALIDATION_FAILED
OMNI_COMMAND_PROVENANCE_INVALID
OMNI_COMMAND_CONFLICT_LOCKED
OMNI_POLICY_REJECTED
OMNI_CONFIRMATION_REQUIRED
OMNI_CONFIRMATION_INVALID
OMNI_EXECUTION_FAILED
OMNI_DISPATCH_CANCELLED
OMNI_VERIFICATION_FAILED
OMNI_SNAPSHOT_TOO_LARGE
OMNI_ADAPTER_TIMEOUT
```

生产环境不得把敏感 `cause` 直接序列化。

## 7.10 协议版本

协议最终至少包括：

```text
InteractionSnapshotV1
AppManifestV1
ResolutionResultV1
CommandEnvelopeV1
ActionExecutionResultV1
DispatchResultV1
InteractionTraceV1
```

序列化结构携带：

```json
{
  "protocolVersion": "1.0",
  "runtimeVersion": "0.x.y"
}
```

协议冻结 Gate：

- `ResolutionResultV1` 等待 ResolutionBundle/Fusion 稳定；
- `CommandEnvelopeV1` 等待 provenance、epoch、confirmation 稳定；
- `DispatchResultV1` 等待实时 phase 与 cancel 语义稳定；
- `InteractionTraceV1` 等待 Action lifecycle event 稳定。

---

# 8. TurnStore 与并发控制

## 8.1 Core Store

新增纯 Core Store：

```ts
export type TurnMutationResult =
  | { ok: true; turn: InteractionTurn }
  | {
      ok: false
      reason:
        | "turn_missing"
        | "revision_conflict"
        | "terminal_turn"
        | "illegal_event"
    }

export interface InteractionTurnStore {
  create(turn: InteractionTurn, options?: { active?: boolean }): void
  get(turnId: string): InteractionTurn | undefined
  getActive(): InteractionTurn | undefined
  list(): InteractionTurn[]

  apply(
    turnId: string,
    expectedRevision: number,
    event: TurnEvent
  ): TurnMutationResult

  clearActive(turnId?: string): void
}
```

必须：

- CAS；
- revision mismatch 拒绝；
- terminal mutation 拒绝；
- terminal 后清理 active pointer；
- `getActive()` 过滤 terminal；
- Store 不依赖 React；
- 默认保留最近 50 个 Turn，支持配置。

## 8.2 React Runtime Handle

```ts
type TurnRuntimeHandle = {
  resolverAbort: AbortController
  previewAbort?: AbortController
  dispatchAbort?: AbortController
  expectedRevision: number
  resolutionRevision: number
}

const turnRuntimeHandles =
  new Map<string, TurnRuntimeHandle>()
```

必须：

- 每 Turn 独立；
- `cancelTurn(turnId)` abort 对应 Resolver；
- supersede 时 abort 旧 Resolver；
-异步返回后做 CAS；
-terminal 后释放；
-Provider unmount 时全部 abort。

## 8.3 Supersede 默认策略

| 旧状态 | 新 final input | 默认行为 |
|---|---|---|
| `created` | 到达 | supersede |
| `listening` | 同 session | 更新同 Turn |
| `listening` | 不同 session | supersede |
| `resolving` | 到达 | abort + supersede |
| `needs_clarification` | 到达 | supersede |
| `awaiting_confirmation` | 到达 | supersede，旧确认失效 |
| `ready` | 到达 | supersede |
| `validating` | 到达 | 创建新 Turn，不假设旧提交可取消 |
| `executing` | 到达 | 创建新 Turn |
| `verifying` | 到达 | 创建新 Turn |
| terminal | 到达 | 创建新 Turn |

配置：

```ts
export type TurnPolicy = {
  supersedePendingConfirmation?: boolean
  maxRetainedTurns?: number
  turnTtlMs?: number
}
```

默认：

```ts
supersedePendingConfirmation: true
maxRetainedTurns: 50
turnTtlMs: 60_000
```

---

# 9. Resolver 与主链路收口

## 9.1 Resolver V2

```ts
export type IntentResolverOutput =
  | {
      kind: "hypotheses"
      resolverId: string
      hypotheses: SemanticIntentHypothesis[]
    }
  | {
      kind: "legacy_resolution"
      resolverId: string
      resolution: ResolvedInteraction
    }

export type IntentResolverV2 = {
  id: string
  resolve(
    context: IntentResolverContext
  ):
    | IntentResolverOutput
    | Promise<IntentResolverOutput>
}
```

旧 Resolver 使用：

```ts
adaptLegacyIntentResolver(resolver)
```

适配器只生成 hypotheses 或 compatibility data，不能直接创建 Command。

## 9.2 解析入口

```ts
export async function resolveInteractionTurn(input: {
  turn: InteractionTurn
  snapshot: InteractionSnapshot
  contextEpoch: number
  resolvers: IntentResolverV2[]
  mode: ResolverMode
  signal: AbortSignal
  now?: number
}): Promise<ResolutionBundle>
```

步骤：

```text
1. 校验 Turn 非终态
2. 收集 Rule / LLM hypotheses
3. 归一化 confidence
4. 合并重复 hypotheses
5. 构建 FusionContext
6. 生成 target candidates
7. 解析 action
8. hard reject
9. candidate 去重
10. 排序
11. 计算 top margin
12. 产生 FusionOutcome
13. 生成 legacy projection
```

## 9.3 Turn 写入

```ts
turnStore.apply(turnId, expectedRevision, {
  type: "resolution.completed",
  bundle,
  at: Date.now(),
})
```

Reducer 写入：

- hypotheses；
- candidates；
- rejected candidates；
- evidence；
- decision；
- clarification；
- resolutionRevision；
-真实 phase；
-状态。

## 9.4 正式命令来源

唯一入口：

```ts
buildCommandFromTurnDecision({
  commandId,
  turn,
  snapshot,
  source,
})
```

禁止新主链路调用：

```ts
ensureTurnForResolution(...)
dispatchResolution(...) // 仅兼容层
lastResolutionRef.current
```

---

# 10. VUI + GUI 时序融合

## 10.1 Event Window

默认相关窗口：

```ts
const windowStart =
  (utterance.startedAt ?? utterance.finalAt) - 1500

const windowEnd =
  utterance.finalAt + 300
```

最近 committed target 可扩展至默认 15 秒，但必须：

- 同 context epoch；
- target 仍存在；
-未经过失效导航；
-满足 Focus TTL。

## 10.2 Context Epoch

Snapshot 增加：

```ts
contextEpoch: number
```

递增条件：

- route/page 主上下文变化；
- active modal id 变化；
-任务容器变化；
-宿主调用 `invalidateContext()`；
-注册的导航事件。

不递增：

-普通输入值变化；
-完成状态变化；
-纯 focus 变化；
-非上下文 DOM mutation。

Turn 创建时冻结 epoch。

解析完成时 epoch 不一致：

- deictic/focused/recent reference 不得自动执行；
-不得绑定新页面同名对象；
-默认 clarification `context_changed` 或 rejected；
-显式 object id 仍需重新校验 scope 和 target。

## 10.3 时间衰减

```ts
export function temporalDecay(
  eventAt: number,
  referenceAt: number,
  halfLifeMs: number
): number {
  const delta = Math.abs(referenceAt - eventAt)
  return Math.pow(0.5, delta / halfLifeMs)
}
```

建议默认：

```ts
pointerHalfLifeMs: 2500
selectionHalfLifeMs: 3500
semanticFocusHalfLifeMs: 5000
committedTargetHalfLifeMs: 7000
maxDeicticAgeMs: 8000
```

## 10.4 Evidence 权重

| Evidence | 建议分值 |
|---|---:|
| explicit object id | +0.45 |
| exact label | +0.30 |
| exact alias | +0.27 |
| ordinal | +0.28 |
| GUI selection × decay | +0.27 |
| pointer activated × decay | +0.24 |
| semantic focus × decay | +0.22 |
| recent committed target × decay | +0.20 |
| active modal match | +0.12 |
| action compatibility | +0.14 |
| model target hint | +0.05 |
| context stale | hard reject |
| disabled | hard reject |
| scope mismatch | hard reject |

约束：

- 数组顺序不得影响分值；
- 删除 index penalty；
- GUI 显式证据权重大于 model hint；
- score clamp `[0,1]`；
- LLM confidence 不是权限。

## 10.5 ASR n-best

Voice 输入支持：

```ts
type VoiceInput = {
  kind: "partial" | "final"
  sessionId: string
  text: string
  confidence?: number
  nBest?: VoiceAlternative[]
  tokens?: VoiceToken[]
  startedAt?: number
  endedAt?: number
  receivedAt: number
  locale?: string
}
```

建议合成置信度：

```ts
combined =
  semanticConfidence * 0.75 +
  asrAlternativeConfidence * 0.25
```

本地规则最多默认尝试前三条 n-best。

## 10.6 候选去重

按以下 fingerprint：

```ts
fingerprint({
  targetId,
  actionId,
  primitiveAction,
  params,
})
```

重复候选：

- 保留最高基础 confidence；
-合并不同 evidence；
-记录所有 hypothesis ids；
-去重后计算 top-1/top-2 margin。

---

# 11. Action 解析与歧义

## 11.1 删除首项兜底

必须删除：

```ts
target.actions?.[0]
normalizedPrimitiveActions[0]
```

## 11.2 显式 action hint

若 hypothesis 提供 action hint：

1. 必须在 Registry/Capability 中存在；
2. 必须匹配 target；
3. 必须通过 scope；
4. 不匹配时保留 rejected candidate；
5. 不得自动换成另一个 action。

## 11.3 未指定动作

只有同时满足以下条件才可隐式推导：

- target 只有一个 eligible domain action；
- `implicitSelection.enabled === true`；
- risk 为 low；
-不需要 confirmation；
-modality 在 allowlist；
-intent/alias 有明确动作证据。

Primitive 默认不允许隐式动作。

中高风险动作禁止隐式选择。

否则：

```ts
{
  status: "needs_clarification",
  reason: "action_ambiguous",
  actionCandidates: [...],
}
```

## 11.4 同名 target

多个同名或同 role 对象：

- 不得 `.find()` 取第一个；
-生成候选集合；
-使用 GUI 显式选择、ordinal、上下文和时间证据；
-margin 不足则澄清；
-DevTools 显示所有候选及差值。

---

# 12. Clarification

## 12.1 结构

```ts
export type ClarificationRequest = {
  id: string
  turnId: string
  resolutionRevision: number
  contextEpoch: number
  prompt: string
  kind: "target" | "action" | "slot" | "context"
  candidateIds: string[]
  missingSlots?: string[]
  createdAt: number
  expiresAt: number
}
```

```ts
export type ClarificationAnswer =
  | { kind: "candidate"; candidateId: string }
  | { kind: "action"; actionId: string }
  | { kind: "slots"; slots: Record<string, unknown> }
  | { kind: "utterance"; text: string }
```

## 12.2 API

```ts
clarifyTurn(
  turnId: string,
  answer: ClarificationAnswer
): Promise<InteractionTurn>
```

必须：

- 不读取 `lastResolution`；
-校验 request id/revision/epoch；
-candidate 必须属于该 Turn；
-GUI 点击候选可转换为 answer；
-过期后进入 expired；
-重新解析递增 resolutionRevision。

---

# 13. Voice Session

## 13.1 partial/final 使用同一 Turn

维护：

```ts
Map<voiceSessionId, turnId>
```

规则：

- 首个 partial 创建 `listening` Turn；
-后续 partial 更新同一 Turn；
-final 更新同一 Turn并进入 resolving；
-session 完成后清理映射；
-无 session id 时 Runtime 生成 id。

## 13.2 Partial

允许：

-更新 transcript；
-本地 rule preview；
-预高亮；
-abort 上一 preview。

禁止：

-正式模型写动作；
-可提交 Command；
-Confirmation；
-Executor。

## 13.3 Final

1. 更新同 Turn；
2. abort preview；
3. resolutionRevision + 1；
4. 进入 resolving；
5.运行正式 resolver；
6. CAS 写 Bundle；
7. ready 后才可 submit。

## 13.4 Barge-in

新 session 开始：

-立即停止 TTS；
-旧 listening/resolving/clarification/confirmation 按策略 supersede；
-执行中的 Action 不假设可取消；
-只有 Executor 声明支持 Signal 且能证明无副作用时才返回 cancelled。

---

# 14. Command、Confirmation 与 Staleness

## 14.1 Command 构造前置条件

- Turn status 为 ready；
-存在 decision；
-decision epoch 与 Turn 相同；
-candidate 存在；
-candidate 未 rejected；
-target/action 仍存在；
-anchor 完整；
-command fingerprint 可重复计算。

## 14.2 Pending Command

需要确认时：

1. 冻结 Command；
2. 写入 `turn.pendingCommand`；
3.进入 awaiting_confirmation；
4.用户确认时重用同一 Command；
5.禁止重新调用 LLM；
6.禁止重新从 utterance 解析 action。

## 14.3 Confirmation Grant

绑定：

```ts
type ConfirmationGrant = {
  id: string
  turnId: string
  commandId: string
  decisionFingerprint: string
  commandFingerprint: string
  issuedAt: number
  expiresAt: number
  actor: "user" | "policy"
}
```

任何 target、action、params、anchor、epoch 或 fingerprint 变化均失效。

## 14.4 Stale Policy

```ts
export type StaleCommandPolicy =
  | { mode: "strict" }
  | {
      mode: "revalidate"
      stateKeys?: string[]
    }
```

默认 strict。

### Strict

要求：

- stateVersion 相等；
- contextHash 相等；
- contextEpoch 相等；
-确认动作需要的 focusRevision 相等。

### Revalidate

仅 Action 显式 opt-in：

1. contextHash 相等；
2. contextEpoch 相等；
3. target 仍存在；
4.重新检查 enabled；
5.重新检查 binding；
6. capability；
7. scope；
8. params schema；
9. availability；
10. authorization；
11. state fingerprint；
12. Confirmation 仍匹配原 Command。

禁止修改 Snapshot 字段来通过校验。

---

# 15. Dispatcher 实时阶段

## 15.1 Phase Event

```ts
export type DispatchPhaseEvent =
  | {
      phase: "validation"
      state: "started" | "passed" | "rejected"
      at: number
      validation?: ValidationResult
    }
  | {
      phase: "execution"
      state: "started" | "completed" | "failed" | "cancelled"
      at: number
      execution?: ActionExecutionResult
    }
  | {
      phase: "verification"
      state: "started" | "passed" | "failed"
      at: number
      verification?: VerificationResult
    }
```

## 15.2 Options

```ts
export type DispatchCommandOptions = {
  signal?: AbortSignal
  onPhase?: (event: DispatchPhaseEvent) => void
  conflictLock?: CommandConflictLock
  policyAdapter?: PolicyAdapter
}
```

## 15.3 Executor Context

```ts
export type ActionContext = {
  actionId: string
  target: InteractionObject
  snapshot: InteractionSnapshot
  command: CommandEnvelope
  turnId: string
  signal?: AbortSignal
  utterance?: string
}
```

## 15.4 阶段顺序

正常：

```text
validation.started
validation.passed
execution.started
execution.completed
verification.started（若配置）
verification.passed
```

拒绝：

```text
validation.started
validation.rejected
```

执行失败：

```text
validation.passed
execution.started
execution.failed
```

React Runtime 必须在 `onPhase` 到达时立即更新 Turn，不得等待最终 Promise。

## 15.5 共享冲突锁

Provider 内：

```ts
const conflictLockRef =
  React.useRef(new CommandConflictLock())
```

所有路径使用同一实例：

- Domain；
-Primitive；
-Batch；
-Confirmation Retry；
-Assistant；
-legacy compatibility。

测试：

-同 target/action 并发，只执行一次；
-不同 target 可并发；
-失败后释放；
-Abort 后释放；
-确认重试不绕过。

---

# 16. Interaction Event、Unified Focus 与 Trace

## 16.1 Event 类型

InteractionEvent 增加：

```ts
turnId?: string
commandId?: string
contextEpoch?: number
```

事件至少包括：

```text
turn.created
turn.superseded
turn.cancelled

voice.asr.partial
voice.asr.final
voice.intent.hypothesized
fusion.completed
voice.clarification.requested
voice.confirmation.received

action.validation.started
action.validated
action.rejected
action.execution.started
action.committed
action.unverified
action.pending
action.noop
action.failed
action.verification.started
action.verification.passed
action.verification.failed
```

## 16.2 Focus 更新

| 事件 | semantic focus |
|---|---|
| GUI pointer activated | 更新 |
| GUI selection changed | 更新 |
| action committed | 更新 |
| action unverified | 默认不更新 |
| action pending | 不更新 |
| action noop | 不更新 |
| action rejected | 不更新 |
| action failed | 不更新 |

Focus source：

```ts
"gui" | "voice" | "assistant" | "keyboard" | "programmatic"
```

## 16.3 Trace

Trace 必须由真实事件构建，不从 `updatedAt` 推断所有阶段。

最低结构：

```ts
export type InteractionTrace = {
  traceId: string
  turnId: string
  source: InteractionTurn["source"]
  contextEpoch: number

  startedAt: number
  completedAt?: number

  inputRevisions: Array<{
    kind: "partial" | "final" | "text"
    at: number
    confidence?: number
  }>

  phases: TurnPhaseRecord[]

  hypotheses: Array<{
    id: string
    resolverId: string
    intent: string
    confidence: number
    targetReferenceKind: string
  }>

  candidates: Array<{
    id: string
    hypothesisId: string
    targetId: string
    actionId?: string
    score: number
    rejectedCode?: string
    evidence: Array<{
      type: string
      score: number
      timestamp?: number
    }>
  }>

  decision?: {
    candidateId: string
    targetId: string
    actionId?: string
    score: number
    confidenceMargin: number
  }

  commandId?: string
  resultStatus?: DispatchStatus
}
```

## 16.4 隐私

Trace/Event/Snapshot/LLM Projection 必须：

- 排除 password、OTP、token、payment secret；
-普通 input 默认只暴露 hasValue、长度、类型；
-params 默认只记录 key 与类型；
-敏感 Action 可禁止记录 params；
-错误做 secret redaction；
-LLM 原始响应默认不进入 Trace；
-提供 sanitized export；
-限制 Snapshot、Event Buffer 和 Trace 大小。

---

# 17. 公开 React API

## 17.1 目标最小 API

最小接入示例应使用真实、可编译、无需 API Key 的 API。

建议目标形态：

```tsx
import {
  CommandInput,
  MultimodalGroup,
  MultimodalPage,
  MultimodalProvider,
  defineAction,
  defineMultimodalConfig,
  useActionExecutor,
} from "@omni-ui/react"

const completeTodo = defineAction({
  id: "todo.complete",
  title: "完成任务",
  description: "将指定任务标记为已完成",
  attachTo: { entityType: "todo" },
  executeScope: "object",
  paramsSchema: schema.object({
    todoId: schema.string(),
  }),
  paramsFrom: ({ target }) => ({
    todoId: target.entity?.id,
  }),
  risk: "low",
  voiceCallable: true,
  modelCallable: false,
  voiceAliases: ["完成", "标记完成"],
})

const config = defineMultimodalConfig({
  rules: [
    {
      id: "todo.complete",
      patterns: [
        "完成第{ordinal}个任务",
        "完成{target}",
        "把这个完成",
      ],
      intent: "todo.complete",
    },
  ],
})

function TodoPage() {
  const todos = useTodos()

  useActionExecutor(
    completeTodo,
    async ({ todoId }, { signal }) => {
      await todoService.complete(todoId, { signal })
      return { status: "changed" }
    },
    {
      signalSupport: true,
      conflictKey: ({ params }) =>
        `todo:${params.todoId}`,
    }
  )

  return (
    <MultimodalPage
      id="page.todo"
      title="任务列表"
      route="/todos"
    >
      {todos.map((todo) => (
        <MultimodalGroup
          key={todo.id}
          id={`todo.item.${todo.id}`}
          role="list_item"
          label={todo.title}
          entity={{ type: "todo", id: todo.id }}
        >
          <TodoItem todo={todo} />
        </MultimodalGroup>
      ))}

      <CommandInput
        placeholder="例如：完成第一个任务"
      />
    </MultimodalPage>
  )
}

export default function App() {
  return (
    <MultimodalProvider config={config}>
      <TodoPage />
    </MultimodalProvider>
  )
}
```

说明：

- `todoService.complete` 是宿主已有业务函数；
- OmniUI 不直接改业务状态；
- 本地规则不要求模型；
- `modelCallable` 默认 false；
- Action Definition 可静态分析；
- Executor 由应用绑定。

若当前 Schema API 名称不同，Codex 可使用项目现有 Schema 工具，但不得把示例留成不可编译伪代码。

## 17.2 Advanced API

```ts
type InteractionApiV2 = {
  getSnapshot(): InteractionSnapshot

  getActiveTurn(): InteractionTurn | undefined
  getTurn(turnId: string): InteractionTurn | undefined

  resolveTurn(input: {
    source: "text" | "voice" | "assistant"
    text?: string
    voice?: VoiceInput
  }): Promise<InteractionTurn>

  submitTurn(turnId: string): Promise<InteractionTurn>

  submitVoice(input: VoiceInput): Promise<InteractionTurn>

  clarifyTurn(
    turnId: string,
    answer: ClarificationAnswer
  ): Promise<InteractionTurn>

  confirmTurn(turnId: string): Promise<InteractionTurn>

  cancelTurn(
    turnId: string,
    reason?: string
  ): InteractionTurn | undefined
}
```

Hooks：

```ts
useActiveInteractionTurn()
useInteractionTurn(turnId)
useInteractionTrace(turnId)
```

## 17.3 兼容 API

一个 minor 周期内保留并 deprecated：

```ts
resolveText()
dispatchResolution()
dispatchBatchResolutions()
submitUtterance()
lastResolution
useLastResolution()
useInteractionActions()
```

要求：

- `resolveText()` 内部调用 V2；
-旧返回由 Turn/Bundle 投影；
- `dispatchResolution()` 不得为无 provenance Resolution 自动补当前 Anchor；
- `lastResolution` 仅用于显示；
-正式提交不读取 `lastResolution`。

---

# 18. Adapter 契约

## 18.1 通用 Context

```ts
export interface AdapterContext {
  signal: AbortSignal
  requestId: string
  turnId?: string
  locale?: string
  metadata?: Record<string, unknown>
}

export interface AdapterCapabilities {
  streaming?: boolean
  browser?: boolean
  server?: boolean
  privacyLevel?:
    | "local"
    | "trusted-server"
    | "external"
}
```

## 18.2 Adapter 类型

```text
ResolverAdapter
SpeechRecognitionAdapter
PolicyAdapter
TelemetryAdapter
FeedbackAdapter
StorageAdapter
SnapshotAdapter（advanced）
```

## 18.3 ResolverAdapter

必须返回 Semantic Hypotheses，不返回可执行 Command。

## 18.4 SpeechRecognitionAdapter

支持：

- partial/final；
-session id；
-n-best；
-token timing；
-AbortSignal；
-locale；
-error classification。

## 18.5 PolicyAdapter

只能：

- allow；
-deny；
-require confirmation；
-附加可审计 reason。

不能跳过 Core validation。

## 18.6 TelemetryAdapter

默认只接收脱敏 Trace summary。

## 18.7 服务端 Resolver

文档必须明确：

-生产模型 Key 不放浏览器；
-通过服务端代理；
-服务端验证协议版本；
-服务端只返回 hypotheses；
-浏览器 Runtime 仍做最终 Fusion 和 Dispatcher validation。

---

# 19. DevTools

## 19.1 数据视图

DevTools Inspector 至少展示：

```text
Current Turn
- turnId / revision / status
- voice session
- context epoch
- snapshot anchor

Input Timeline
- partial revisions
- final
- GUI events
- modal/navigation changes

Resolver
- resolver ids
- hypotheses
- confidence
- missing slots

Fusion
- candidates
- rejected reasons
- evidence
- temporal score
- top margin
- selected decision

Command
- command id
- target/action
- params summary
- risk
- confirmation fingerprint

Dispatch
- validation phases
- execution phases
- verification phases
- result
- duration

Focus
- input focus
- selection
- semantic focus
- recent targets
```

## 19.2 主动诊断

检测：

- Provider 未挂载；
- Page 未注册；
- Entity ID 不稳定；
- Action ID 重复；
- Action 无 Executor；
- risk 缺失；
- Executor 返回 void；
-模型返回未开放 Action；
-params schema 失败；
-Snapshot 过大；
-疑似敏感字段；
-浏览器环境暴露模型 Key；
-SSR 调用浏览器 API；
-样式未导入；
-协议版本不兼容；
-terminal Turn 被写入；
-候选首项兜底；
-无 provenance legacy dispatch。

## 19.3 构建顺序

先完成：

```text
Turn → Trace → Phase Event → Sanitized Export
```

再开发完整 DevTools UI。

可先提供临时开发面板，但不得把临时数据模型冻结为公开接口。

---

# 20. README、文档与首次接入

## 20.1 README 第一屏

建议：

```md
# OmniUI

让现有 React 页面在不更换 UI 组件库的前提下，
安全支持文本、语音和 AI 操作。

[在线体验] [5 分钟接入] [完整文档] [示例项目]

## 选择你的接入方式

已有 React 项目：

npm install @omni-ui/react

React + shadcn/ui：

安装 @omni-ui/react，并按需添加 Registry 组件

非 React、服务端或自定义适配器：

npm install @omni-ui/core

## 5 分钟完成第一条命令

首次体验不需要模型 API Key。
```

仓库贡献命令移至：

- README 后半；
- `CONTRIBUTING.md`。

## 20.2 文档渐进顺序

```text
第一层：完成一次本地文本命令
第二层：理解 Action 与 Executor
第三层：理解 Snapshot、Turn 与 Resolver
第四层：接入语音与 LLM
第五层：策略、Confirmation、Adapter 与 DevTools
第六层：协议、服务端和高级 Runtime
```

## 20.3 文档站结构

```text
开始使用
  - OmniUI 是什么
  - 是否适合我的项目
  - 5 分钟接入
  - 接入检查清单

核心概念
  - Page
  - Group / Entity
  - Action
  - Executor
  - InteractionTurn
  - Snapshot
  - Resolver
  - Fusion
  - Command
  - Dispatcher

接入指南
  - Vite
  - Next.js App Router
  - React Router
  - shadcn
  - 本地 Resolver
  - 服务端 LLM Resolver
  - 语音输入
  - 权限与确认
  - 隐私与脱敏

调试
  - DevTools
  - Trace
  - 常见错误
  - 错误码
  - 性能

API
  - React
  - Core
  - Advanced
  - Adapter
  - DevTools

架构
  - 多模态状态机
  - 安全模型
  - 协议版本
  - ADR
```

## 20.4 示例单一来源

真实代码来源：

```text
examples/react-vite-minimal
        ↓
README snippets
        ↓
website snippets
        ↓
package README snippets
        ↓
CI compile
```

禁止在多个 Markdown 手工维护同一份示例。

---

# 21. 仓库与包结构

建议目标：

```text
apps/
  website/
  demo-todo/

examples/
  react-vite-minimal/
  next-app-router/
  react-router/
  shadcn/
  server-resolver/
  custom-resolver/

packages/
  core/
  react/
  devtools/          # 可先作为 react/devtools subpath
  cli/               # API 稳定后
  adapters/
  shadcn-registry/

docs/
  getting-started/
  concepts/
  guides/
  api/
  architecture/
  adr/
```

## 21.1 `apps/docs` 重命名

若其实际为 Todo 演示：

```text
apps/docs → apps/demo-todo
```

正式文档站使用：

```text
apps/website
```

## 21.2 不过早拆包

初期可以：

- `@omni-ui/react/devtools` 先作为 subpath；
- Adapter interface 先在 Core；
-稳定后再抽独立包。

不得因追求目录美观制造大量空包。

## 21.3 Subpath Exports

示例：

```json
{
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    },
    "./advanced": {
      "types": "./dist/advanced.d.ts",
      "import": "./dist/advanced.js"
    },
    "./styles": "./dist/styles.css",
    "./devtools": {
      "types": "./dist/devtools.d.ts",
      "import": "./dist/devtools.js"
    },
    "./testing": {
      "types": "./dist/testing.d.ts",
      "import": "./dist/testing.js"
    }
  }
}
```

---

# 22. 包发布与消费者验证

## 22.1 样式

推荐显式导入：

```ts
import "@omni-ui/react/styles"
```

并保证：

```json
{
  "sideEffects": ["**/*.css"]
}
```

## 22.2 Peer Dependencies

React 包：

```json
{
  "peerDependencies": {
    "react": "^18.0.0 || ^19.0.0",
    "react-dom": "^18.0.0 || ^19.0.0"
  }
}
```

文档明确：

- Node 最低版本；
-TypeScript 最低版本；
-React 范围；
-浏览器范围；
-SSR 支持；
-ESM/CJS 策略。

## 22.3 npm pack 消费者 CI

```text
build public packages
        ↓
npm pack
        ↓
temporary consumer
        ↓
install tarballs
        ↓
typecheck
        ↓
build
        ↓
minimal e2e
```

消费者不得：

-引用 workspace source；
-使用 monorepo alias；
-直接 import `packages/*/src`；
-依赖未发布私有包。

## 22.4 shadcn 定位

优先明确为可选 Registry：

```text
@omni-ui/shadcn-registry
```

文档说明：

-Registry URL；
-可安装组件；
-源码复制模式；
-Runtime dependency；
-版本兼容。

---

# 23. 发布与版本治理

推荐：

```text
Changesets
    ↓
lint / typecheck / unit
    ↓
build
    ↓
npm pack consumer validation
    ↓
publish npm
    ↓
GitHub Release
    ↓
versioned docs
```

每次 Release：

- npm version；
-GitHub Release；
-Changelog；
-Breaking Changes；
-Migration Guide；
-compatibility matrix；
-known issues；
-example version。

SemVer：

- Patch：无公开行为变化修复；
- Minor：向后兼容能力；
- Major：协议、公开 API 或默认行为破坏性变化。

包版本和协议版本分离：

```text
npm: 0.8.0
protocol: 1.0
```

---

# 24. 实施 Track、Gate 与 PR 顺序

# 24.1 Gate

## Gate G0：基线可重复

必须：

-记录实际 HEAD；
-运行现有测试；
-记录 package/API 差异；
-不先重写文件。

## Gate G1：Turn 主链路稳定

满足：

- TurnStore/CAS；
-ResolutionBundle；
-Command from decision；
-late result protection。

通过后才能开始冻结 advanced API。

## Gate G2：Fusion/Dispatch 安全稳定

满足：

- temporal Fusion；
-action ambiguity；
-realtime phases；
-staleness；
-conflict lock。

通过后才能设计最终 Protocol V1。

## Gate G3：Trace 稳定

满足：

- Voice session；
-clarification；
-action event；
-focus feedback；
-real phase trace。

通过后才能完成 DevTools 正式数据接口。

## Gate G4：公开 API 稳定

满足：

- defineAction/useActionExecutor；
-compatibility layer；
-subpath exports；
-minimal example compiles。

通过后才能完成 CLI code generation 和正式文档冻结。

---

# 24.2 Track A：Runtime Correctness

## A0：回归保护

新增失败测试：

1. terminal active pointer；
2. cancel 后 late resolver；
3. Bundle 完整写 Turn；
4. no action 不取首项；
5. partial/final session；
6. realtime phase；
7. committed focus；
8. shared lock；
9.无 Snapshot version 伪造；
10.去重后 margin。

## A1：TurnStore、领域事件、CAS

交付：

- `turn-store.ts`；
-每 Turn Handle；
-terminal guard；
-active cleanup；
-supersede/cancel/expire。

## A2：ResolutionBundle 与 Turn 单一事实源

交付：

- Resolver V2；
-legacy adapter；
-Bundle；
-Command from decision；
-新主链路移除 lastResolution 依赖。

## A3：Temporal Fusion 与 Action ambiguity

交付：

- FusionContext；
-context epoch；
-event window；
-temporal decay；
-n-best；
-dedup；
-删除首项兜底；
-action clarification。

## A4：Realtime Dispatcher 与 Staleness

交付：

- onPhase；
-signal；
-共享 lock；
-strict/revalidate；
-删除伪造 Snapshot；
-cancelled semantics。

## A5：Voice Session、Clarification、Lifecycle Event

交付：

- partial/final 同 Turn；
-clarifyTurn；
-barge-in；
-action event；
-committed focus；
-完整 Trace。

## A6：Runtime 拆分与兼容层

交付：

-模块拆分；
-deprecated API；
-advanced hooks；
-Completion Audit。

---

# 24.3 Track B：Open-source DX

## B0：消费者基线，可与 A0-A2 并行

交付：

- README 首屏定位；
-`apps/docs` 重命名计划；
-独立 npm pack consumer test；
-CSS export/sideEffects 检查；
-peer dependencies 检查。

注意：此阶段 README 最小代码可暂时引用当前稳定 API，但必须标记后续由 B2 更新。

## B1：Action 公共 API，在 A2 后

交付：

- `defineAction`；
-`useActionExecutor`；
-旧 `useInteractionActions` adapter；
-Action metadata docs；
-重复 ID 诊断。

## B2：最小示例与文档，在 A6/B1 后

交付：

- `examples/react-vite-minimal`；
-五分钟教程；
-README 真实代码抽取；
-本地 Resolver；
-无 API Key E2E。

## B3：DevTools，在 G3 后

交付：

- Turn timeline；
-candidate evidence；
-command/phase/result；
-主动诊断；
-sanitized export。

## B4：文档站与集成指南

交付：

- `apps/website`；
-Next.js；
-React Router；
-server resolver；
-privacy guide；
-error codes；
-architecture docs。

## B5：Protocol V1 与 Adapter API，在 G2/G3 后

交付：

- protocolVersion；
-serialized schemas；
-version negotiation；
-Resolver/Speech/Telemetry Adapter；
-server entry。

## B6：发布闭环

交付：

- Changesets；
-GitHub Release；
-versioned docs；
-consumer matrix；
-migration guide。

## B7：CLI，在 G4 后

交付：

```bash
npx @omni-ui/cli init
npx @omni-ui/cli doctor
```

Doctor 检查：

- Provider；
-Page；
-stable entity id；
-Action duplicate；
-Executor；
-styles；
-SSR；
-browser key；
-package compatibility；
-protocol compatibility。

---

# 25. 文件级修改清单

## Core

### `turn.ts`

- listening/pending；
- input/resolution revision；
-context epoch；
-phase history；
-domain events；
-reducer；
-terminal guard。

### `turn-store.ts`（新增）

- CAS；
-active pointer；
-retention；
-TTL；
-tests。

### `resolution.ts`（新增）

- ResolutionBundle；
-FusionOutcome；
-legacy projection；
-resolver adapter。

### `fusion.ts`

- FusionContext；
-temporal evidence；
-context hard reject；
-dedup；
-action ambiguity；
-移除 index/first fallback。

### `fusion-context.ts`（新增）

- event window；
-decay；
-event relevance；
-epoch helpers。

### `resolver.ts`

- Resolver V2 chain；
-AbortSignal；
-Bundle output。

### `rule-resolver.ts`

- hypotheses；
-n-best；
-evidence；
-不选首个同名对象。

### `llm-resolver.ts`

- hypotheses only；
-untrusted UI projection；
-no final command authority；
-preserve Bundle data。

### `command.ts`

- decision provenance；
-epoch anchor；
-build from Turn；
-fingerprint。

### `dispatcher.ts`

- realtime phase；
-signal；
-stale policy；
-shared lock；
-cancelled；
-ActionContext。

### `action-registry.ts`

- defineAction；
-implicit policy；
-model/voice policy；
-stale policy；
-duplicate diagnostics。

### `events.ts`

- turn/command/epoch；
-action lifecycle；
-redaction。

### `focus.ts`

- committed update；
-context invalidation；
-source expansion。

### `observability.ts`

- real phase timing；
-full candidate/evidence；
-sanitized trace。

### `errors.ts`（新增或统一）

- OmniError；
-stable codes；
-mapping。

### `protocol.ts`（后期）

- V1 serialized types；
-version negotiation。

## React

### `runtime.tsx`

-组合层；
-Store；
-Handle map；
-voice session；
-no formal lastResolution；
-shared lock；
-phase bridge；
-no fake Snapshot。

### `runtime-turn-store.ts`

-React subscription；
-retention；
-cancel/supersede。

### `runtime-resolution.ts`

-Turn creation；
-resolver；
-Bundle CAS；
-clarification；
-compatibility projection。

### `runtime-dispatch.ts`

-build command；
-confirmation；
-phase/result/event bridge。

### `runtime-events.ts`

-DOM events；
-context epoch；
-focus；
-action event。

### `runtime-snapshot.ts`

-registry；
-DOM extraction；
-context hash；
-epoch。

### `action-executor.ts`

- `useActionExecutor`；
-binding lifecycle；
-StrictMode safe cleanup；
-signal capability。

### `voice.ts`

-session mapping；
-partial/final；
-barge-in；
-errors。

### `assistant-conversation.tsx`

-Assistant hypothesis；
-Turn-bound clarification；
-frozen confirmation command；
-no natural-language confirmation parsing。

### `devtools/*`

-G3 后实施。

---

# 26. 测试矩阵

## 26.1 Core Turn

覆盖：

- created → listening；
-partial revision；
-final → resolving；
-resolving → ready/clarification；
-ready → confirmation/validation；
-validation → execution；
-execution → verification；
-terminal guard；
-CAS conflict；
-active cleanup；
-expire；
-supersededBy。

## 26.2 Resolution

-多 Resolver 合并；
-Abort；
-legacy adapter；
-missing slots；
-Bundle projection；
-revision mismatch；
-no reverse reconstruction。

## 26.3 Fusion

至少：

1. explicit id；
2. exact label；
3. alias；
4. ordinal；
5. GUI selection；
6. pointer before voice；
7. pointer after final；
8. committed target；
9. expired focus；
10. epoch mismatch；
11. modal scope；
12. disabled；
13. action mismatch；
14. same-label margin；
15. dedup；
16. no action；
17. low-risk implicit；
18. high-risk implicit denied；
19. n-best merge；
20. model hint lower than GUI；
21. object order independence。

## 26.4 Dispatcher

- phase order；
-slow executor；
-Abort before execution；
-Abort during execution；
-unsupported cancel；
-shared lock；
-lock release；
-strict stale；
-revalidate stale；
-context mismatch；
-focus mismatch；
-confirmation mismatch；
-postcondition；
-cancelled；
-PolicyAdapter deny cannot be overridden。

## 26.5 React Runtime

### 并发

```text
A 开始
B 开始
B 先返回
A 后返回
```

预期 A superseded，不能覆盖 B。

### 取消

```text
A resolving
cancel A
A resolver 返回
```

预期保持 cancelled，无 Command/Executor。

### Voice

```text
partial 1
partial 2
final
```

同 turnId，partial 不执行。

### GUI + VUI

```text
点击 todo.2
200ms 后“完成这个”
```

选择 todo.2，包含 temporal evidence，提交后 focus 更新。

### Context change

```text
点击 todo.2
打开 dialog
“删除这个”
```

不得自动执行旧页面目标。

### Action ambiguity

有 complete/delete，用户说“处理这个”。

进入 clarification，不选 actions[0]。

### Confirmation

-重用 frozen command；
-不重新调用 LLM；
-旧 Grant 不迁移；
-过期拒绝；
-GUI context 变化按 stale policy。

### Phase

慢 Executor 未完成时，Turn 已是 executing。

### Lock

同 target 双提交只执行一次。

## 26.6 隐私

- password；
-OTP；
-API key；
-token；
-payment；
-event value；
-Trace params；
-LLM prompt；
-error；
-sanitized export。

## 26.7 消费者测试

- Vite；
-Next App Router；
-React Router；
-npm；
-pnpm；
-React 18/19；
-ESM；
-SSR import；
-explicit CSS；
-tree shaking；
-npm tarball。

## 26.8 E2E 最小场景

```text
打开 Todo
输入“完成第一个任务”
local rule → hypothesis
fusion → decision
validation → passed
executor → changed
verification → committed
GUI 更新
DevTools 展示完整链路
```

---

# 27. 验收指标

## 27.1 Runtime 正确性

- 100% Command 可追溯到 `turn.decision.candidateId`；
-100% DispatchResult 可追溯到 turnId/commandId；
-0 个新主链路读取 `lastResolution`；
-0 个 actions[0]/objects[0] 歧义兜底；
-0 个伪造 Snapshot version；
-0 个 terminal Turn 被复活；
-0 个 partial 执行；
-100% Confirmation 使用 frozen Command；
-100% action lifecycle 自动写事件。

## 27.2 可观测性

每个成功 Turn 至少有：

- final input time；
-resolver phase；
-hypothesis count；
-candidate count；
-selected candidate；
-evidence；
-validation duration；
-execution duration；
-verification duration（若有）；
-result。

## 27.3 性能

建议：

- Event Window P95 < 1ms；
-100 objects / 10 hypotheses Fusion P95 < 10ms；
-TurnStore CAS P95 < 0.2ms；
-Event Buffer 默认 ≤ 100；
-Turn 默认 ≤ 50；
-Trace 完整候选默认 ≤ 20，其余摘要；
-ASR partial 不强制完整 DOM 重建。

## 27.4 开发者体验

目标：

- 30 秒识别安装包；
-5 分钟完成本地命令；
-无 API Key；
-不启动 OmniUI 源仓库；
-不要求 shadcn；
-README 示例可编译；
-npm tarball consumer build 成功；
-常见失败可在 DevTools 定位阶段。

---

# 28. Definition of Done

## Runtime

- [x] Turn 是 hypotheses/candidates/decision/command/result 的唯一事实源。
- [x] partial/final 同 session 同 Turn。
- [x] 每 Turn 独立 AbortController。
- [x] 所有异步写回使用 CAS。
- [x] terminal Turn 不可变。
- [x] active pointer 不返回 terminal。
- [x] Resolver V2 输出 hypotheses。
- [x] Fusion 使用正式时序上下文。
- [x] 删除首项兜底。
- [x] Command 只能从 Turn Decision 构造。
- [x] Confirmation 绑定 frozen Command。
- [x] Clarification 绑定 Turn/revision/epoch。
- [x] Dispatcher 实时发布阶段。
- [x] Provider 使用共享 lock。
- [x] Stale 默认 strict。
- [x] 无 Snapshot 伪造。
- [x] Action events 与 Focus 闭环。
- [x] Trace 使用真实阶段时间。

## Public API

- [x] `defineAction` 和 `useActionExecutor` 可用。
- [x] 默认 `modelCallable` 为 false。
- [x] 旧 API 有 deprecated adapter。
- [x] 根入口不暴露内部 Store/helper。
- [x] advanced/devtools/testing/server exports 清晰。
- [x] 错误统一为 OmniError。
- [x] Executor Result 与 DispatchResult 分层。

## DevTools 与隐私

- [x] DevTools 基于 Turn/Trace。
- [x] 可看 hypotheses/candidates/evidence。
- [x] 可看 phase/result。
- [x] 有主动诊断。
- [x] 可导出脱敏诊断。
- [x] Snapshot/Trace/Event 保持隐私边界。

## 开源 DX

- [x] README 消费者优先。
- [x] 五分钟教程无 API Key。
- [x] Vite minimal 独立。
- [x] 示例单一来源。
- [x] `apps/docs` 不再与 website 混淆。
- [x] npm pack consumer CI。
- [x] CSS export 正确。
- [x] Peer dependencies 正确。
- [x] Next/React Router/Server guides。
- [x] Changesets/Release/Changelog。
- [x] Protocol V1 在 Gate 后冻结。

## 验证命令

根据仓库实际脚本运行，至少包括：

```bash
npm test
npm run build
npm run verify
npm run verify:registry
npm run verify:package-consumer
```

若脚本名称不同，Codex 必须列出实际替代命令，不得声称运行不存在的脚本。

---

# 29. Codex 工作规则

1. 开始前运行 `git rev-parse HEAD` 并在 PR 描述记录；
2. 阅读本文和当前 Completion Audit；
3. 按 A0 → A6 与 Gate 实施；
4. B0 可并行，但 B1/B2/B3 遵守依赖；
5. 每个 PR 先补测试；
6. 不一次性重写 `runtime.tsx`；
7. 不通过 `as any` 掩盖核心类型；
8. 不吞掉非法 transition 后强写状态；
9. 不降低 validation 让测试通过；
10. 不让 LLM 直接执行；
11. 不用首项兜底；
12. 不伪造 Snapshot；
13. 不让 partial 执行；
14. 不从 lastResolution 构造正式 Command；
15. 不提前冻结 Protocol V1；
16. 每个 PR 输出：
    - 修改文件；
    -新增测试；
    -兼容影响；
    -未完成事项；
    -实际执行的命令和结果；
17. 每个阶段更新 Completion Audit；
18. 若实际代码已实现某项，先增加证据测试，不重复重写；
19. 若 Spec 与实际 API 名称不同，保持语义并记录映射；
20. Reviewer 未确认当前阶段前，不自动继续下一个大阶段。

---

# 30. 给 Codex 的启动指令

将本文件放入：

```text
docs/OMNI_UI_UNIFIED_REFACTOR_SPEC.md
```

首次指令：

```text
请严格按照 docs/OMNI_UI_UNIFIED_REFACTOR_SPEC.md 实施。

当前只执行：
- Gate G0
- Track A 的 A0：回归保护
- Track B 的 B0 中“消费者打包基线审计”，但不要改最终 Quick Start API

要求：
1. 先输出当前 HEAD、包结构、测试脚本和与 Spec 的差异；
2. 为以下问题添加回归测试：
   - terminal active pointer
   - cancel 后 late resolver
   - ResolutionBundle 完整写 Turn
   - 未指定 action 不取首项
   - partial/final 同 session
   - Dispatcher realtime phase
   - committed action 更新 semantic focus
   - Provider 共享 conflict lock
   - 不伪造 Snapshot version
   - 候选去重后计算 margin
3. 运行 @omni-ui/core 与 @omni-ui/react 的相关测试；
4. 审计 npm pack 后的 exports、types、CSS 和 peerDependencies；
5. 不进行 Runtime 大规模文件拆分；
6. 不继续 A1，直到 A0 可以独立审阅。

特别禁止：
- target.actions[0] / primitiveActions[0] / objects[0] 作为歧义兜底；
- 从 lastResolution 构造正式 Command；
- 自动为旧 Resolution 补当前 Snapshot anchor；
- 伪造 Snapshot stateVersion；
- catch 后强写非法 Turn 状态；
- partial voice 触发业务执行；
- 为通过测试而关闭校验。
```

后续每个阶段使用本文对应章节作为验收条件。

---

# 31. 最终完成判断

满足以下描述才算统一改造完成：

> 一个从未使用过 OmniUI 的 React 开发者，可以在五分钟内、不配置模型密钥、不替换 UI 组件，将现有业务函数注册为 Action，通过本地文本命令触发，并在 DevTools 中看到同一个 InteractionTurn 内从输入、GUI 时序、语义假设、候选证据、最终决策、确认、实时校验、执行、验证到业务结果的完整链路。

以下任一情况存在，均表示尚未完成：

```text
任意旧 Resolution
→ 自动补当前 Anchor
→ 直接 dispatch
```

```text
没有明确 Action
→ 选择 actions[0]
```

```text
旧 Snapshot
→ 修改 stateVersion
→ 重新执行
```

```text
Voice partial
→ 创建可提交 Command
```

```text
LLM target/action
→ 不经过 Fusion 和 Core validation
→ 调用 Executor
```

```text
DevTools
→ 依赖 lastResolution
→ 无法解释真实候选和阶段
```

```text
README 示例可读
→ npm tarball 消费者无法编译
```

本文完成后，应归档旧的分散建议，并在仓库文档入口只链接本统一规范和对应 Completion Audit。
