# OmniUI `main@a4dc4d2` Runtime 审阅与修复实施规范

> 文档状态：Review Findings / Codex Fix Spec  
> 审阅基线：`a4dc4d2b27f5aea1a865b753d2816186eb43bb4e`  
> 审阅日期：2026-06-25  
> 重点范围：VUI + GUI、LLM 意图理解、InteractionTurn、Fusion、Dispatcher、Voice Session  
> 建议仓库路径：`docs/OMNI_UI_A4DC4D2_RUNTIME_FIX_SPEC.md`

---

## 0. 文档目的

本文记录对 OmniUI 当前 `main@a4dc4d2` 的静态代码审阅结果，并给出可以直接交给 Codex 实施的修复规范。

本轮不是推翻当前架构。现有版本已经完成了大量正确工作，包括：

- `defineAction()` 与 `useActionExecutor()`；
- Domain Action 与 Primitive Action 的统一 Dispatcher；
- 模型动作默认关闭；
- 完整命令绑定的 Confirmation Grant；
- structured execution result；
- Snapshot Anchor、Scope、Capability、Schema 与 Authorization 校验；
- `InteractionTurn`、`ResolutionBundle`、`FusionContext` 和 TurnStore 的 Core 骨架；
- ASR partial/final、Voice Session、n-best；
- shared `CommandConflictLock`；
- DevTools、消费者示例和发布验证基础。

当前主要问题是：

> Core 中已经存在的新状态机能力，尚未完整接入 React Runtime 的默认主链路；部分旧 `ResolvedInteraction` 路径仍然决定实际解析、澄清和提交行为。

本规范的目标是完成主链路收口，而不是继续横向增加新模块。

---

# 1. 必须保留的产品与架构原则

## 1.1 VUI 与 GUI 的业务目标一致

VUI 与 GUI 应共享同一个业务能力和执行结果：

```text
GUI 点击 ───────────────────────┐
                               ↓
Voice → ASR → Intent → Fusion → Domain Action
                               ↓
                           Dispatcher
                               ↓
                    App-owned Executor
                               ↓
                  Store / Reducer / API
                               ↓
                       React 重新渲染
```

禁止的是：

```text
LLM → 任意 CSS Selector / JS → 直接修改 DOM 或业务数据
```

不是禁止：

```text
VUI → 受控 Action → Executor → 读写业务数据
```

业务交互分类：

| 类型 | 示例 | 正确执行方式 |
|---|---|---|
| `read` | 查询今天未完成任务 | Query/Domain Executor |
| `write` | 完成、删除、重命名 | Mutation/Domain Executor |
| `navigation` | 打开设置页 | Router Action/Adapter |
| `ui` | 聚焦、滚动、展开 | 白名单 Primitive Adapter |

## 1.2 LLM 只负责语义假设

LLM 可以提供：

- intent；
- action hint；
- target reference；
- slots；
- missing slots；
- semantic confidence；
- model target hint。

LLM 不能被视为：

- 最终 target 事实；
- action-target 绑定证明；
- 权限；
-确认；
-业务执行器；
-执行成功证明。

## 1.3 正式命令必须属于 Turn

正式执行链应为：

```text
InteractionTurn
→ hypotheses
→ Fusion candidates
→ turn.decision
→ CommandEnvelope
→ Dispatcher
→ DispatchResult
```

不得以全局 `lastResolution` 或模型原始 JSON 为正式事实源。

## 1.4 不得回退的安全能力

Codex 修复时不得删除或弱化：

- `modelCallable: false` 默认值；
- `voiceCallable` 校验；
- params schema；
- target/action binding；
- target capability；
- modal/scope 校验；
- Confirmation fingerprint；
- shared conflict lock；
- structured execution result；
- postcondition；
- Snapshot privacy/redaction；
- Primitive 与 Domain 的统一校验入口。

---

# 2. 问题总览

| 编号 | 优先级 | 问题 | 主要影响 |
|---|---:|---|---|
| P0-01 | P0 | Voice partial Turn 可通过公开 `submitTurn()` 手动提交 | 未完成语音可能产生业务副作用 |
| P0-02 | P0 | React Runtime 默认解析链仍以 `ResolvedInteraction` 为主 | Turn 不是唯一事实源，Trace/Fusion 信息丢失 |
| P0-03 | P0 | `cancelTurn()` 未按 Turn 中止 Resolver，缺少 Runtime CAS | late result 可覆盖 cancelled/superseded Turn |
| P0-04 | P0 | `FusionContext` 已创建但 Ranker 未使用 | GUI/Voice 时序融合未真正生效 |
| P0-05 | P0 | `submitTurn()` 从当前 Snapshot 重新计算 params | Command 不完全来自冻结决策，存在参数漂移 |
| P0-06 | P0 | `submitTurn()` 对不存在或不可提交 Turn 返回伪造/原 Turn | 错误被静默吞掉，调用方误判 |
| P1-01 | P1 | TurnEvent 仍是通用 `transition`，并存在 catch 后强写状态 | 状态机约束可被绕过 |
| P1-02 | P1 | Dispatcher phase 只部分实时写入，最终结果又补状态 | Trace 时间线不准确 |
| P1-03 | P1 | Action `stalePolicy` 未成为 Dispatcher 的真实策略来源 | 声明与实际校验不一致 |
| P1-04 | P1 | committed event 的 modality/source 根据 action 类型猜测 | Text/Assistant/Voice/GUI 来源被污染 |
| P1-05 | P1 | Resolver V2 的 `mode` 未生效，legacy 数组只留 top-1 | 费用、延迟和歧义信息问题 |
| P1-06 | P1 | Clarification 仍读取全局 `lastResolution` | 并发 Turn 可能串线 |
| P1-07 | P1 | `focusout` 被记录成 `gui.navigation.changed` | 错误上下文事件影响 Fusion |
| P1-08 | P1 | Fusion label 匹配证据语义不准确 | 包含匹配被当作 exact label，提高误执行概率 |
| P1-09 | P1 | Decision/Clarification 的关键 provenance 字段仍可选 | 正式主链路约束不足 |
| P1-10 | P1 | Action lifecycle event 不完整 | DevTools、Telemetry、Focus 闭环不完整 |
| P2-01 | P2 | `ResolutionBundle` 可携带完整 `FusionContext` | Snapshot 重复、内存与隐私风险 |
| P2-02 | P2 | `runtime.tsx` 仍约 3400 行 | 可维护性差，但不应先于行为修复拆分 |
| P2-03 | P2 | Completion Audit 与实际 React 集成状态不一致 | 后续开发依据失真 |
| P2-04 | P2 | README Low-level API 仍强化旧路径 | 新使用者继续依赖 legacy API |

---

# 3. P0-01：Voice partial Turn 可被公开 API 提交

## 3.1 当前行为

当前 `createPartialVoicePreviewTurn()` 在本地预解析成功后会将 partial Turn 变为：

```text
status = "ready"
decision = {...}
```

而公开的 `submitTurn(turnId)` 只检查：

```ts
turn.status === "ready" && turn.decision
```

没有检查：

```ts
turn.source === "voice"
turn.input.kind === "final"
```

`submitVoice(partial)` 自身不会自动提交，但调用方仍可以执行：

```ts
const turn = await interaction.resolveVoice({
  kind: "partial",
  sessionId: "voice-1",
  text: "删除这个",
  receivedAt: Date.now(),
})

await interaction.submitTurn(turn.id)
```

## 3.2 风险

- ASR 仍在变化时就可能执行；
- 否定词、对象名或数量尚未识别完整；
- “删除……”可能在后续变成“删除按钮在哪里”；
- 高风险 Action 可能被错误送入确认或执行；
- 违反“partial 永远不能提交”的核心不变量。

## 3.3 目标行为

Voice partial：

- 保持 `listening`；
-可以保存 preview hypotheses/candidates；
-可以预高亮；
-不得产生正式可提交 `decision`；
-不得进入 `ready`；
-`submitTurn()` 必须有第二层 final guard。

## 3.4 修改方案

### 方案 A：增加明确的 Preview 字段

```ts
export type InteractionTurn = {
  // existing...
  preview?: {
    hypotheses: SemanticIntentHypothesis[]
    candidates: RankedInteractionCandidate[]
    decision?: InteractionDecision
    updatedAt: number
  }
}
```

partial 更新：

```ts
status: "listening"
preview: {
  hypotheses,
  candidates,
  decision,
  updatedAt,
}
```

final 到达时：

- 清理或覆盖 preview；
-进入 `resolving`；
-正式结果写入 `hypotheses/candidates/decision`。

### `submitTurn()` 强制校验

保持公开签名不变，避免 TypeScript 层面的破坏性变更：

```ts
submitTurn(turnId: string): Promise<InteractionTurn>
```

非法提交必须抛出稳定 `OmniError`，不得静默返回原 Turn，也不得创建空 Turn。需要显式处理 union 的调用方使用新增高级入口：

```ts
trySubmitTurn(turnId: string): Promise<SubmitTurnResult>
```

```ts
function validateTurnSubmission(
  turnId: string,
  turn: InteractionTurn | undefined,
): OmniError | undefined {
  if (!turn) {
    return {
      code: "OMNI_TURN_NOT_FOUND",
      stage: "turn",
      recoverable: false,
      message: `Turn ${turnId} was not found.`,
    }
  }

  if (
    turn.source === "voice" &&
    turn.input.kind !== "final"
  ) {
    return {
      code: "OMNI_VOICE_PARTIAL_NOT_SUBMITTABLE",
      stage: "turn",
      recoverable: true,
      message: "Voice partial input cannot be submitted.",
    }
  }

  if (isTerminalTurnStatus(turn.status)) {
    return {
      code: "OMNI_TURN_TERMINAL",
      stage: "turn",
      recoverable: false,
      message: `Turn ${turn.id} is already terminal.`,
    }
  }

  if (turn.status !== "ready" || !turn.decision) {
    return {
      code: "OMNI_TURN_NOT_SUBMITTABLE",
      stage: "turn",
      recoverable: true,
      message: `Turn ${turn.id} is not ready for submission.`,
    }
  }

  return undefined
}
```

## 3.5 修改文件

- `packages/core/src/turn.ts`
- `packages/core/src/errors.ts`
- `packages/react/src/runtime.tsx`
- `packages/react/test/runtime.test.tsx`
- `packages/react/src/devtools.tsx`

## 3.6 必须新增测试

```text
partial result resolves to a target
→ Turn remains listening
→ formal decision is absent
→ submitTurn(partialTurnId) returns/throws typed error
→ executor call count = 0
```

```text
partial 1 → partial 2 → final
→ same turnId
→ only final may enter ready
→ executor executes once
```

## 3.7 验收标准

- 搜索不到 partial → ready 的正式状态转换；
-任何公开执行入口都不能提交 partial；
-DevTools 可展示 preview，但明确标记“不可提交”。

---

# 4. P0-02：React Runtime 尚未使用 `ResolutionBundle` 主链路

## 4.1 当前行为

Core 已实现：

- `IntentResolverV2`；
- `resolveInteractionTurn()`；
- `ResolutionBundle`；
- `FusionOutcome`；
- `buildCommandFromTurnDecision()`。

但 React Runtime 的 `resolveText()` / `resolveVoice()` 仍主要运行：

```text
resolveCandidate()
→ ResolvedInteraction
→ previewCandidatesFromResolution()
→ decisionFromResolution()
→ InteractionTurn
```

`submitUtterance()` 仍然运行：

```text
resolveText()
→ dispatchResolution()
```

而不是：

```text
resolveTurn()
→ submitTurn(turn.id)
```

## 4.2 影响

- Turn 中的 hypotheses 通常为空；
- candidates 是从旧 Resolution 临时构造；
- evidence 为空；
- rejected candidates 丢失；
- top-1/top-2 margin 不是实际 Fusion 结果；
- DevTools 无法解释“为什么选中该目标”；
- clarification 仍依赖全局状态；
- Core 新架构成为未被默认使用的旁路。

## 4.3 目标主链路

```text
resolveText / resolveVoice(final)
→ create/reuse Turn
→ resolution.started
→ resolveInteractionTurn()
→ resolution.completed(Bundle)
→ TurnStore CAS
→ turn.decision
→ submitTurn()
```

## 4.4 修改方案

### 新建统一 Runtime 解析函数

```ts
async function resolveRuntimeTurn(input: {
  turn: InteractionTurn
  snapshot: InteractionSnapshot
  signal: AbortSignal
}): Promise<InteractionTurn> {
  const expectedRevision = input.turn.revision

  const bundle = await resolveInteractionTurn({
    turn: input.turn,
    snapshot: input.snapshot,
    contextEpoch: input.snapshot.contextEpoch,
    resolvers: buildResolverV2Chain(),
    mode: resolverMode,
    signal: input.signal,
  })

  const mutation = turnStore.apply(
    input.turn.id,
    expectedRevision,
    {
      type: "resolution.completed",
      bundle,
      at: bundle.completedAt,
    }
  )

  if (!mutation.ok) {
    throw omniErrorForTurnMutation(mutation)
  }

  return mutation.turn
}
```

### `resolveText()` 变成兼容投影

内部先创建/解析 Turn，然后：

```ts
const turn = await resolveTurn({ source: "text", text })

return {
  snapshot,
  resolution: legacyResolvedInteractionFromTurn(turn),
}
```

### `submitUtterance()`

```ts
const turn = await resolveTurn({
  source: "text",
  text,
})

if (turn.status !== "ready") {
  return submitResultFromTurn(turn)
}

const submitted = await submitTurn(turn.id)
return submitResultFromTurn(submitted)
```

禁止再调用正式 `dispatchResolution()`。

### Legacy API

保留：

```ts
dispatchResolution()
lastResolution
onResolution
```

但必须标记：

```ts
/** @deprecated Compatibility projection only. */
```

并禁止新内部调用。

## 4.5 Clarification 改造

禁止：

```ts
resolveClarificationAnswer(
  text,
  activeTurn,
  lastResolutionRef.current,
  snapshot,
)
```

改为：

```ts
clarifyTurn(
  turnId,
  { kind: "utterance", text }
)
```

候选只能来自：

```ts
turn.candidates
turn.clarification
```

## 4.6 修改文件

- `packages/core/src/resolution.ts`
- `packages/core/src/turn.ts`
- `packages/react/src/runtime.tsx`
- `packages/react/src/advanced.ts`
- `packages/react/test/runtime.test.tsx`
- `packages/react/src/devtools.tsx`
- `README.md`
- `README_CN.md`

## 4.7 测试

必须断言正式 Turn 中包含：

```text
hypotheses.length > 0
candidates.length > 0
decision.candidateId 对应 candidates 中真实 ID
evidence 非空（有 GUI 证据时）
rejected candidates 被保留
```

必须断言：

```text
submitUtterance()
→ 不调用 dispatchResolution()
→ 从 turn.decision 构造 Command
```

## 4.8 验收标准

- 新主链路搜索不到 `lastResolutionRef.current`；
-新主链路搜索不到 `decisionFromResolution()`；
-`ResolvedInteraction` 只存在于兼容投影；
-DevTools 的 candidate/evidence 来自真实 Bundle。

---

# 5. P0-03：取消、并发与 late result 保护未接入 React Runtime

## 5.1 当前行为

Core 已有 TurnStore CAS，但 React Runtime 仍维护：

```ts
const turnsRef = useRef(new Map())
const resolverAbortRef = useRef<AbortController>()
```

当前 Resolver AbortController 是全局单例，而不是按 Turn 管理。

`cancelTurn(turnId)` 主要改变 Turn 状态，没有保证：

- 中止该 Turn Resolver；
-递增/冻结对应 revision；
-丢弃其晚到结果；
-清理所有 Runtime Handle。

## 5.2 竞态场景

```text
Turn A resolving
→ cancelTurn(A)
→ A = cancelled
→ Resolver A 返回
→ 旧闭包 publish resolved A
→ cancelled Turn 被复活
```

或：

```text
Turn A 开始
Turn B 开始
B 先返回
A 后返回
→ A 覆盖 active/compatibility state
```

## 5.3 目标设计

React Runtime 必须实际使用 Core TurnStore：

```ts
const turnStoreRef = useRef(
  createInteractionTurnStore()
)
```

并维护：

```ts
type TurnRuntimeHandle = {
  resolverAbort: AbortController
  previewAbort?: AbortController
  dispatchAbort?: AbortController
  expectedRevision: number
  resolutionRevision: number
}

const turnHandlesRef =
  useRef(new Map<string, TurnRuntimeHandle>())
```

## 5.4 异步写回规则

任何异步请求返回后必须同时验证：

```ts
const current = turnStore.get(turnId)

if (!current) return
if (isTerminalTurnStatus(current.status)) return
if (current.revision !== expectedRevision) return
if (current.resolutionRevision !== expectedResolutionRevision) return
if (signal.aborted) return
```

然后使用 Store CAS：

```ts
turnStore.apply(
  turnId,
  expectedRevision,
  event
)
```

不得直接：

```ts
turnsRef.current.set(turnId, next)
```

## 5.5 `cancelTurn()`

必须：

1. 查找 Handle；
2. abort resolver/preview/dispatch；
3.通过 Store 领域事件进入 cancelled；
4.清理 active pointer；
5.发布 `turn.cancelled` Event；
6.释放 Handle。

```ts
function cancelTurn(turnId: string, reason = "cancelled") {
  const handle = handles.get(turnId)
  handle?.previewAbort?.abort()
  handle?.resolverAbort.abort()
  handle?.dispatchAbort?.abort()

  const turn = turnStore.get(turnId)
  if (!turn || isTerminalTurnStatus(turn.status)) return

  turnStore.apply(turnId, turn.revision, {
    type: "turn.cancelled",
    reason,
    at: Date.now(),
  })
}
```

## 5.6 注意执行取消语义

- Resolver 可以安全取消；
-还未执行的 Dispatcher 可以取消；
-Executor 已开始后不能假设副作用可回滚；
-只有 Executor 明确支持 `AbortSignal` 且返回未提交状态，才可报告 `cancelled`；
-否则必须等待真实结果。

## 5.7 测试

### Late result

```text
Resolver Promise pending
→ cancelTurn
→ resolve Promise
```

预期：

- Turn 保持 cancelled；
-无 `onResolution` 成功回调；
-无 Command；
-无 Executor；
-无 committed event。

### Two turns

```text
A pending
B pending
B resolve
A resolve
```

预期：

- B 生效；
- A superseded；
- A 不覆盖 active Turn、Trace 和 compatibility view。

### Terminal immutable

对 committed/cancelled/superseded Turn 应用解析结果：

```text
Store returns terminal_turn
```

## 5.8 验收标准

- React Runtime 正式 Turn 保存使用 Core TurnStore；
-每 Turn 独立 AbortController；
-没有 late result resurrection；
-Completion Audit 有对应 React 集成测试证据。

---

# 6. P0-04：`FusionContext` 未实际驱动 Ranker

## 6.1 当前行为

`resolveInteractionTurn()` 已构建：

```ts
const fusionContext = buildFusionContext(...)
```

但随后仍调用：

```ts
rankInteractionCandidates(
  input.snapshot,
  hypotheses,
)
```

而不是使用 `fusionContext`。

Fusion 内部 pointer 证据还使用：

```ts
Date.now()
```

作为衰减参考时间。

## 6.2 影响

1. Resolver/LLM 越慢，GUI 点击证据越弱；
2. 同一输入回放可能得到不同结果；
3. reference time 不是 utterance 的 start/final；
4. Event Window 未真正参与；
5. context epoch 没有成为 Ranker 输入约束；
6. selection、semantic focus 和 committed target 缺少统一衰减；
7. text/rule 的实际输入模态无法传入 implicit action 选择。

## 6.3 修改签名

```ts
export function rankInteractionCandidates(
  context: FusionContext,
  hypotheses: SemanticIntentHypothesis[],
  options: FusionRankerOptions = {},
): FusionRankerResult
```

内部统一读取：

```ts
context.snapshot
context.events
context.focus
context.utterance.finalAt
context.contextEpoch
context.now
context.turnId
```

## 6.4 时间参考

优先：

```ts
const referenceAt =
  context.utterance.endedAt ??
  context.utterance.finalAt
```

禁止 Fusion 内直接调用 `Date.now()`。

`decidedAt` 使用：

```ts
context.now
```

便于 deterministic replay。

## 6.5 Event Window

建议：

```ts
const start =
  (context.utterance.startedAt ??
   context.utterance.finalAt) - 1500

const end =
  context.utterance.finalAt + 300
```

只保留：

- 同 context epoch；
-未过期；
-与当前 Snapshot target 相关；
-未被 navigation/modal epoch 失效的事件。

## 6.6 时序规则

```text
语音开始前 200ms 的明确 GUI 点击
→ 强证据

语音期间的 GUI 点击
→ 可作为同步指向证据

语音结束后发生 route/modal context change
→ 原 deictic binding 失效

十秒前选择且中间发生 context change
→ 不可自动绑定
```

## 6.7 实际输入模态

当前 implicit selection 不应根据：

```ts
hypothesis.source === "llm"
  ? "assistant"
  : "voice"
```

推断模态。

应使用：

```ts
context.inputSource
```

或：

```ts
context.turnSource
```

区分：

- text；
-voice；
-assistant。

## 6.8 Label Evidence

当前 label reference 的所有命中都可能记成 `exact_label`。

必须区分：

```text
label exact
alias exact
label contains
alias contains
```

建议返回 target match metadata：

```ts
type TargetMatch = {
  target: InteractionObject
  match:
    | "explicit_id"
    | "label_exact"
    | "alias_exact"
    | "label_contains"
    | "alias_contains"
    | "ordinal"
    | "focus"
    | "recent"
}
```

再生成正确 evidence。

## 6.9 测试

### Resolver latency invariance

相同 utterance 和 GUI event：

```text
LLM 延迟 50ms
LLM 延迟 5000ms
```

Ranker 结果必须相同。

### Replay determinism

同一 `FusionContext` 执行两次：

```text
candidate order、score、decision 完全一致
```

### Context change

```text
点击 todo.2
→ dialog epoch 改变
→ “删除这个”
```

旧目标不得自动执行。

### Modality

Action implicitSelection 只允许 text：

```text
text 可选
voice 不可选
rule hypothesis 不得被固定当作 voice
```

## 6.10 验收标准

- `rankInteractionCandidates` 不再接收裸 Snapshot；
-Fusion 代码不存在用于评分的 `Date.now()`；
-context epoch 与 event window 有测试；
-DevTools 可显示 temporal evidence。

---

# 7. P0-05：提交时从当前 Snapshot 重算参数

## 7.1 当前行为

`submitTurn()` 在构建 Command 前，会使用当前 Snapshot 调用：

```ts
buildActionPayload(currentSnapshot, ...)
```

并创建一个临时 `commandTurn`，覆盖：

```ts
decision.params
```

因此最终 Command 并不完全来自解析时冻结的 `turn.decision`。

## 7.2 风险

- GUI 在解析与提交之间变化；
- `paramsFrom(target)` 读取到新的 target state；
-用户确认/理解的是旧参数，但提交使用新参数；
-Command provenance 与 decision provenance 不完全一致；
-使“Command 只能从 Turn Decision 构造”成为名义约束。

## 7.3 目标行为

Action 参数应在解析/决策完成时，基于 Turn Anchor 对应的 Snapshot 归一化，并写入正式 decision：

```ts
turn.decision.params
```

`submitTurn()` 只能读取，不得重新计算。

## 7.4 推荐实现

在 `ResolutionBundle` ready 后：

```ts
const normalizedDecision =
  normalizeDecisionParams({
    snapshot: anchoredSnapshot,
    decision: bundle.fusion.decision,
    actionSpecs: snapshot.actionSpecs,
  })
```

然后写入 Turn。

或者在 ready 阶段立即创建冻结 Command：

```ts
turn.pendingCommand = buildCommandFromTurnDecision(...)
```

但如果 Action 不需要确认，也可以在 submit 时创建 Command，只要参数不重算。

## 7.5 Snapshot 保存策略

不建议把完整 Snapshot 永久放入 Turn。

可保存：

- normalized params；
-target fingerprint；
-relevant state fingerprint；
-anchor；
-candidate/evidence。

## 7.6 测试

```text
resolve action
→ 改变 target 中 paramsFrom 依赖的 state
→ submit
```

预期：

- Command params 仍等于决策时值；
- strict stale 校验拒绝；
-不得静默使用新值。

## 7.7 验收标准

`submitTurn()` 中不得调用会修改 decision params 的：

```text
buildActionPayload
paramsFrom
```

---

# 8. P0-06：`submitTurn()` 静默返回伪造或原 Turn

## 8.1 当前行为

如果：

- Turn 不存在；
-status 不是 ready；
-没有 decision；

`submitTurn()` 会返回原 Turn，或者创建一个空文本的临时 Turn。

## 8.2 影响

- 调用方不能区分提交成功、未执行和 ID 错误；
-错误不会进入 OmniError；
-DevTools 看不到真正失败；
-空 Turn 可能污染日志；
-API 返回类型具有误导性。

## 8.3 修改方案

`submitTurn()` 已公开为低层 Turn 控制 API，当前签名必须保持：

```ts
submitTurn(turnId: string): Promise<InteractionTurn>
```

非法状态改为抛稳定 `OmniError`，属于运行行为修正，不做 TypeScript 返回类型破坏：

- Turn 不存在时抛 `OMNI_TURN_NOT_FOUND`；
- Voice partial 时抛 `OMNI_VOICE_PARTIAL_NOT_SUBMITTABLE`；
- Terminal Turn 时抛 `OMNI_TURN_TERMINAL`；
-状态不可提交时抛 `OMNI_TURN_NOT_SUBMITTABLE`；
-不得创建空 Turn；
-不得静默返回未变化 Turn。

同时新增非抛异常高级入口：

```ts
export type SubmitTurnResult =
  | {
      ok: true
      turn: InteractionTurn
    }
  | {
      ok: false
      turn?: InteractionTurn
      error: OmniError
    }
```

```ts
trySubmitTurn(turnId: string): Promise<SubmitTurnResult>
```

这样现有正常调用不需要改，非法调用不再被静默吞掉，希望显式处理 union 的用户也有新 API。下一个 major 再考虑是否让 union 成为默认返回类型。

需要补 release note 和错误处理示例，因为抛错虽然不破坏 TypeScript 签名，仍是可见运行行为修正。

## 8.4 测试

- unknown turn id；
-listening；
-resolving；
-needs_clarification；
-awaiting_confirmation；
-terminal；
-partial voice。

每种必须返回稳定错误码。

---

# 9. P1-01：TurnEvent 过于通用，状态机可被绕过

## 9.1 当前行为

TurnEvent 是：

```ts
{
  type: "transition",
  status: InteractionTurnStatus,
  ...
}
```

调用方可以组合任意 status 和 payload。

同时 `publishPendingConfirmationTurn()` 在 transition 失败时会 catch，然后直接构造：

```ts
{
  ...turn,
  status: "awaiting_confirmation",
}
```

这绕过了 allowed transitions。

## 9.2 修改方案

改为领域事件判别联合：

```ts
type TurnEvent =
  | { type: "voice.partial"; ... }
  | { type: "voice.final"; ... }
  | { type: "resolution.started"; ... }
  | { type: "resolution.completed"; bundle: ResolutionBundle }
  | { type: "clarification.requested"; ... }
  | { type: "clarification.answered"; ... }
  | { type: "confirmation.requested"; command: CommandEnvelope }
  | { type: "confirmation.granted"; grant: ConfirmationGrant }
  | { type: "dispatch.phase"; phase: DispatchPhaseEvent }
  | { type: "dispatch.completed"; result: DispatchResult }
  | { type: "turn.cancelled"; reason: string }
  | { type: "turn.superseded"; supersededBy: string }
  | { type: "turn.expired" }
```

Reducer 自行决定 status。

## 9.3 禁止

```ts
catch {
  publishTurn({
    ...turn,
    status: "...",
  })
}
```

非法事件必须：

- 返回 `illegal_event`；
-记录开发期诊断；
-不改变 Turn。

---

# 10. P1-02：Phase Timeline 不完整

## 10.1 当前行为

`publishDispatchPhaseTurn()` 主要在 `started` 阶段改变 Turn 状态：

- validation.started；
-execution.started；
-verification.started。

对于：

- validation.passed；
-execution.completed；
-verification.passed；
-policy denied；
-conflict locked；

如果没有状态变化，phase 可能不会写入 Turn。

随后最终 `publishDispatchResultTurn()` 又补走：

```text
validating → executing → verifying → result
```

导致 Timeline 可能不是实际发生时间。

## 10.2 目标设计

`dispatch.phase` 事件即使不改变 status，也必须追加 `phaseHistory`。

Store 应支持：

```text
revision 增加
status 不变
phaseHistory 增加
```

或者 TraceStore 与 Turn 状态分离，但必须共享 turnId/revision。

## 10.3 Dispatcher 需要补齐的 Phase

- policy denied；
-missing executor；
-conflict locked；
-primitive executor missing；
-target missing；
-Abort；
-verification skipped（可选）。

所有终止路径都应发出可解释事件。

## 10.4 Phase 记录模型

推荐同一 phase 合并开始和结束：

```ts
{
  name: "execution",
  startedAt,
  endedAt,
  outcome: "completed",
}
```

而不是通过最终状态推断时间。

## 10.5 测试

慢 Executor：

```text
execution.started 到达时 Promise 尚未 resolve
Turn status = executing
```

完成后：

```text
execution.completed 有真实 endedAt
verification.started/passed 顺序正确
```

---

# 11. P1-03：`stalePolicy` 只声明，未驱动 Dispatcher

## 11.1 当前行为

`defineAction()` 默认：

```ts
stalePolicy: { mode: "strict" }
```

但 Dispatcher 实际主要读取：

```ts
allowIrrelevantAnchorStateDrift
```

没有读取 ActionSpec 的 `stalePolicy`。

## 11.2 风险

开发者声明：

```ts
stalePolicy: {
  mode: "revalidate",
  stateKeys: ["status"],
}
```

实际可能完全不生效。

## 11.3 修改方案

Dispatcher 在取得 Domain Action spec 后读取：

```ts
const stalePolicy =
  spec.stalePolicy ?? { mode: "strict" }
```

### Strict

必须满足：

- stateVersion；
-contextHash；
-contextEpoch；
-需要确认时 focusRevision。

### Revalidate

必须：

1. contextHash 相同；
2. contextEpoch 相同；
3. target 仍存在；
4. target enabled；
5. action-target binding；
6. capability；
7. scope；
8. params schema；
9. availableWhen；
10. authorization；
11. stateKeys fingerprint；
12. confirmation 仍匹配原 Command。

Primitive 永远 strict。

## 11.4 兼容参数

`allowIrrelevantAnchorStateDrift` 应：

- 标记 deprecated；
-只保留 legacy compatibility；
-不得覆盖 Action strict policy；
-最终移除。

## 11.5 测试

- strict state change → reject；
-revalidate 无关变化 → allow；
-revalidate stateKeys 改变 → reject；
-context epoch 改变 → 始终 reject；
-primitive drift → reject；
-confirmation 不匹配 → reject。

---

# 12. P1-04：Action Event 来源记录错误

## 12.1 当前行为

committed event 使用：

```ts
modality:
  result.actionId ? "voice" : "gui"
```

这会导致：

- 所有 Domain Action 被标为 voice；
-所有 Primitive 被标为 GUI；
-Text/Assistant Action 被标为 voice；
-Voice Primitive 被标为 GUI。

同时 semantic focus source 被写为：

```ts
"programmatic"
```

## 12.2 修改方案

`publishDispatchResultTurn()` 必须获得冻结 Command：

```ts
publishDispatchResultTurn(
  turnId,
  command,
  result,
)
```

事件来源：

```ts
modality: command.source.modality
modelGenerated: command.source.modelGenerated
```

Focus source：

```ts
command.source.modality === "voice"
  ? "voice"
  : command.source.modality === "assistant"
  ? "assistant"
  : command.source.modality === "gui"
  ? "gui"
  : "programmatic"
```

反馈动画也不得一律使用：

```text
voice-target
voice-press
```

应根据 Command source 选择。

## 12.3 测试

- text Domain；
-voice Domain；
-assistant Domain；
-voice Primitive；
-gui-dispatched Domain。

Event 和 Focus source 必须正确。

---

# 13. P1-05：Resolver Mode 与 Legacy 多候选

## 13.1 当前行为

`resolveInteractionTurn()` 接收：

```ts
mode?: ResolverMode
```

但会顺序执行全部 Resolver。

`adaptLegacyIntentResolver()` 遇到数组时只保留最高 confidence 的一个结果。

## 13.2 影响

- `rule-first` 仍可能调用 LLM；
-`rule-only` 语义不完整；
-增加延迟和费用；
-多个同分 target 被提前丢失；
-歧义无法交给 Fusion；
-LLM 和规则可能不必要冲突。

## 13.3 Mode 语义

### `rule-only`

只运行 rule/local Resolver。

### `rule-first`

1. 运行 local/rule；
2. 若获得高置信、无歧义、槽位完整的 ready 结果则停止；
3.否则运行 LLM；
4.合并 hypotheses 后 Fusion。

### `llm-first`

1. 运行 LLM；
2.若结果不足，可补 local/rule；
3.仍由 Fusion 决定。

Mode 需要 Resolver metadata：

```ts
type IntentResolverV2 = {
  id: string
  kind: "rule" | "llm" | "custom"
  resolve(...)
}
```

## 13.4 Legacy Array

不得只取 top-1。

应把每个 legacy resolution 转成 hypotheses：

```ts
raw.flatMap(
  (resolution, index) =>
    resolvedInteractionToHypotheses(...)
)
```

## 13.5 Legacy Projection Bug

`legacyResolvedInteractionFromBundle()` 不应从尚未写入新 hypotheses 的旧 `turn.hypotheses` 查找 intent。

改为：

```ts
legacyResolvedInteractionFromBundle({
  turn,
  hypotheses,
  fusion,
})
```

或直接从完整 Bundle 投影。

## 13.6 测试

- rule-first 高置信时 LLM call count = 0；
-rule-only 不调用 LLM；
-llm-first 顺序正确；
-legacy 两个同分候选均进入 Fusion；
-projection intent 不为空。

---

# 14. P1-06：Clarification 依赖全局 `lastResolution`

此问题与 P0-02 同源，但需要独立验收。

## 14.1 目标

Clarification 必须绑定：

```text
turnId
clarificationId
resolutionRevision
contextEpoch
candidateIds
expiresAt
```

## 14.2 API

```ts
clarifyTurn(
  turnId,
  answer,
)
```

不得读取其他 active Turn 或 `lastResolution`。

## 14.3 并发测试

```text
Turn A needs clarification
Turn B becomes active
answer A
```

预期：

-答案只作用于 A；
-不能使用 B 的 candidates；
-过期 A 返回 typed error。

---

# 15. P1-07：`focusout` 被误记为导航变化

## 15.1 当前行为

Runtime DOM event 分类逻辑中：

- `focusin` → `gui.focus.changed`
- `input/change` → `gui.input.changed`
- 其他 → `gui.navigation.changed`

由于监听了 `focusout`，它被归类为 navigation。

## 15.2 风险

- 错误 context event；
-可能触发 epoch 或 stale 逻辑；
-Fusion 误判页面导航；
-Trace 难以理解。

## 15.3 修改方案

建议事件：

```text
gui.focus.changed
gui.focus.cleared
gui.input.changed
gui.pointer.activated
gui.navigation.changed
gui.dialog.opened
gui.dialog.closed
```

`focusout`：

- 若 related target 属于另一个已注册对象，记录 focus.changed；
-否则记录 focus.cleared；
-绝不能记录 navigation。

## 15.4 测试

Tab 从 input A 到 input B：

```text
focus A → focus B
无 navigation event
```

点击页面空白：

```text
focus.cleared
无 navigation event
```

---

# 16. P1-08：Label Evidence 过度标记为 Exact

## 16.1 当前行为

Label target 解析允许：

```text
name === query
name.includes(query)
query.includes(name)
```

但证据可能统一记为：

```text
exact_label
```

## 16.2 修改方案

精确区分：

| 匹配 | Evidence | 建议分值 |
|---|---|---:|
| label exact | `exact_label` | 0.30 |
| alias exact | `exact_alias` | 0.27 |
| label contains | `text_contains` | 0.14 |
| alias contains | `text_contains` | 0.11 |

多个同名对象仍需结合 GUI 和 context margin。

## 16.3 测试

对象：

```text
“提交周报”
“提交”
```

查询：

```text
“提交”
```

不得把两个都当 exact label。

---

# 17. P1-09：关键 Provenance 字段不应可选

## 17.1 当前类型问题

正式 `InteractionDecision` 中：

```ts
candidateId?
hypothesisId?
contextEpoch?
decidedAt?
```

Clarification 中：

```ts
turnId?
resolutionRevision?
contextEpoch?
candidateIds?
```

这些字段在 V2 主链路中应是强制的。

## 17.2 修改方案

拆分类型：

```ts
type FormalInteractionDecision = {
  candidateId: string
  hypothesisId: string
  contextEpoch: number
  decidedAt: number
  ...
}

type LegacyInteractionDecision = {
  ...
}
```

正式 Turn 只允许 Formal 类型。

Legacy adapter 必须合成稳定 ID 和 provenance。

Clarification 的正式类型同理全部必填。

---

# 18. P1-10：Action Lifecycle Event 不完整

## 18.1 当前行为

React Runtime 主要自动发布：

```text
action.committed
```

缺少或未统一发布：

- validation started/passed/rejected；
-execution started/completed/failed；
-verification started/passed/failed；
-pending；
-noop；
-unverified；
-cancelled；
-conflict locked。

## 18.2 修改方案

增加统一桥接：

```ts
function recordDispatchLifecycle(
  command: CommandEnvelope,
  phaseOrResult: DispatchPhaseEvent | DispatchResult,
)
```

所有事件包含：

```text
turnId
commandId
targetId
action/primitive
modality
modelGenerated
contextEpoch
timestamp
```

## 18.3 Focus 规则

只有：

```text
committed
```

默认更新 semantic focus。

不更新：

- noop；
-pending；
-unverified；
-rejected；
-failed；
-cancelled。

---

# 19. P2-01：不要把完整 `FusionContext` 长期存储

## 19.1 当前设计风险

`ResolutionBundle` 可携带完整 `fusionContext`，其中包括：

- Snapshot；
-events；
-focus；
-utterance；
-anchor。

若完整写入 Turn、Trace 或 DevTools Store：

-重复持有大型 Snapshot；
-增加内存；
-扩大隐私暴露；
-序列化成本高；
-难以控制 retention。

## 19.2 修改方案

正式 Bundle 对外只保留：

```ts
fusionSummary: {
  contextEpoch: number
  eventWindow: {
    start: number
    end: number
    eventIds: string[]
  }
  referenceAt: number
}
```

完整 FusionContext 仅在解析函数调用栈内存在。

DevTools 需要的信息通过：

- candidates；
-evidence；
-event IDs；
-sanitized snapshot reference；

获得。

---

# 20. P2-02：Runtime 文件拆分

`runtime.tsx` 已承担：

- Registry；
-Snapshot；
-Event Buffer；
-Focus；
-Resolver；
-Voice；
-Turn；
-Confirmation；
-Dispatcher；
-Trace；
-Public API。

应在 P0/P1 行为稳定后拆分。

建议：

```text
runtime.tsx
runtime-store.ts
runtime-resolution.ts
runtime-voice.ts
runtime-dispatch.ts
runtime-events.ts
runtime-snapshot.ts
runtime-compat.ts
```

禁止先做大规模机械重写再修语义。

拆分验收：

-每个模块有清晰输入输出；
-Core 规则不在 React 重复实现；
-`runtime.tsx` 仅组合 Provider/Context/Hooks。

---

# 21. P2-03：Completion Audit 必须纠正

当前 Audit 把多项状态写为 Done，但实际 React Runtime 仍存在：

- formal Turn 未成为唯一事实源；
-partial 可通过 `submitTurn()` 提交；
-每 Turn cancellation/CAS 尚未接入；
-FusionContext 未驱动 Ranker；
-stalePolicy 未驱动 Dispatcher；
-phase history 不完整；
-clarification 读取 lastResolution。

## 21.1 建议状态

| 项目 | 当前应标记 |
|---|---|
| Core TurnStore/CAS | Core implemented |
| React per-turn CAS | Incomplete |
| ResolutionBundle | Core implemented |
| Runtime uses Bundle by default | Incomplete |
| Formal temporal Fusion | Incomplete |
| Partial/final same ID | Partially complete |
| Partial never submittable | Incomplete |
| Realtime Dispatcher callbacks | Core implemented |
| Complete Turn phase history | Incomplete |
| Action stalePolicy | Declared, not wired |
| Turn/Trace DevTools | Partially complete |

Audit 的 baseline 必须更新为实际修复提交，不应继续写旧 `e06a719`。

---

# 22. P2-04：README 与公共 API 迁移

当前 Low-level 示例仍强调：

```ts
resolveText()
submitUtterance()
```

在主链路收口后应优先展示：

```ts
const turn = await interaction.resolveTurn({
  source: "text",
  text,
})

const submitted =
  await interaction.submitTurn(turn.id)
```

兼容 API 放入：

```text
Legacy / Migration
```

不要让新用户继续绑定 `ResolvedInteraction`。

---

# 23. 推荐 PR 顺序

## PR 1：安全阻断与错误语义

范围：

- partial 不可提交；
-`submitTurn` typed error；
-不再创建空 Turn；
-修复 `focusout` 事件；
-增加回归测试。

验收：

```text
partial executor count = 0
unknown turn typed error
no navigation event on focusout
```

## PR 2：React 主链路接入 Bundle/TurnStore

范围：

- React 使用 Core TurnStore；
-每 Turn Handle；
-`resolveInteractionTurn()`；
-Bundle 写入 Turn；
-`submitUtterance` 使用 submitTurn；
-lastResolution 降级；
-clarifyTurn。

验收：

```text
Turn hypotheses/candidates/evidence 完整
late result 不复活
正式链路无 lastResolution
```

## PR 3：Temporal Fusion

范围：

- Ranker 接收 FusionContext；
-去除 Fusion `Date.now()`；
-event window；
-context epoch；
-actual modality；
-label evidence；
-resolver mode；
-legacy candidates。

验收：

```text
replay deterministic
resolver latency invariant
context change invalidates deictic binding
```

## PR 4：Command Freeze、Staleness 与 Lifecycle

范围：

- params 在 decision 阶段归一化；
-submit 不重算；
-Action stalePolicy；
-complete phase history；
-command source；
-all lifecycle events。

验收：

```text
parameter drift test
strict/revalidate tests
correct event modality
full trace phase order
```

## PR 5A：TurnEvent 领域事件化

范围：

- discriminated TurnEvent；
-删除 catch 强写；
-保持文件结构基本不动；
-完成 reducer 测试。

验收：

```text
illegal event 不改变 Turn
catch 后无强写状态
reducer 测试覆盖非法事件
```

## PR 5B：runtime.tsx 机械拆分

范围：

- 不改变任何行为和公开 API；
- 只移动已被测试覆盖的代码；
- 拆成 store / resolution / voice / dispatch / events / compat；
-README API；
-Completion Audit。

验收：

```text
runtime composition layer 明确
行为测试快照不变
Audit 与测试证据一致
```

---

# 24. 完整测试矩阵

## 24.1 Voice

- partial 不可提交；
-partial/final 同 Turn；
-partial preview 被 final 覆盖；
-新 session supersede 旧 listening；
-barge-in 停止 TTS；
-n-best；
-否定词 final 修正；
-voice clarification。

## 24.2 并发与取消

- cancel resolving；
-late resolver；
-A/B 乱序；
-terminal immutable；
-provider unmount abort；
-preview abort；
-dispatch abort；
-lock release。

## 24.3 Fusion

- explicit id；
-label exact；
-alias exact；
-contains；
-ordinal；
-selection；
-semantic focus；
-recent committed；
-pointer before utterance；
-pointer during utterance；
-pointer after final；
-context epoch；
-modal scope；
-disabled；
-action ambiguity；
-dedup；
-margin；
-deterministic replay；
-resolver latency invariance；
-text/voice/assistant modality。

## 24.4 Command

- command candidateId 存在；
-decision params 冻结；
-state drift；
-context drift；
-focus drift；
-confirmation fingerprint；
-no provenance；
-legacy compatibility；
-modelCallable；
-voiceCallable。

## 24.5 Dispatcher

- validation phase；
-policy deny phase；
-execution phase；
-verification phase；
-missing executor；
-conflict lock；
-Primitive；
-Domain；
-noop；
-pending；
-unverified；
-failed；
-cancelled；
-postcondition。

## 24.6 Event/Trace

- event source；
-commandId/turnId；
-all result statuses；
-only committed focus；
-phase started/ended；
-sanitized export；
-no sensitive params。

---

# 25. Definition of Done

## Turn

- [ ] Voice partial 永远不可提交。
- [ ] `submitTurn` 不创建伪造 Turn。
- [ ] React Runtime 使用 Core TurnStore。
- [ ] 每 Turn 独立 AbortController。
- [ ] 所有异步结果通过 CAS。
- [ ] terminal Turn 不可复活。
- [ ] Clarification 只读取所属 Turn。
- [ ] TurnEvent 为领域事件。

## Resolution/Fusion

- [ ] 正式解析返回并写入 ResolutionBundle。
- [ ] Turn 包含完整 hypotheses/candidates/evidence。
- [ ] Ranker 使用 FusionContext。
- [ ] Fusion 不使用非注入式 `Date.now()`。
- [ ] context epoch/event window 生效。
- [ ] Resolver mode 生效。
- [ ] legacy array 不丢候选。
- [ ] label evidence 分类准确。
- [ ] actual input modality 参与策略。

## Command/Dispatcher

- [ ] Command params 来自冻结 decision。
- [ ] submit 阶段不重算 params。
- [ ] Action stalePolicy 驱动校验。
- [ ] Primitive 默认 strict。
- [ ] shared lock 保留。
- [ ] Confirmation 重用 frozen Command。
- [ ] 每个 phase 实时写入。
- [ ] Policy/lock/missing executor 有事件。
- [ ] lifecycle source 来自 Command。

## Compatibility/Docs

- [ ] `ResolvedInteraction` 仅作为兼容投影。
- [ ] `lastResolution` 不参与正式执行。
- [ ] README 优先展示 Turn API。
- [ ] Completion Audit 基线和状态真实。
- [ ] DevTools 展示真实 Bundle/Trace。
- [ ] 现有消费者包验证继续通过。

---

# 26. Codex 实施约束

1. 开始前执行并记录：

```bash
git rev-parse HEAD
```

2. 若 HEAD 已不是 `a4dc4d2`，先输出本 Spec 与当前代码的差异；
3. 每个 PR 先写失败测试；
4. 不一次性重写 `runtime.tsx`；
5. 不用 `as any` 绕过核心类型；
6. 不通过关闭 validation 让测试通过；
7. 不从 `lastResolution` 构造正式 Command；
8. 不允许 partial 进入 ready；
9. 不允许 submit 时重新绑定 target 或 params；
10. 不允许伪造 Snapshot stateVersion；
11. 不允许 catch 后强制写非法状态；
12. 不允许 LLM 直接调用 DOM 或业务 Executor；
13. 不删除统一 Dispatcher；
14. 不把 Primitive 变成任意脚本通道；
15. 不降低 model/voice policy；
16. 每个 PR 输出：
    - 修改文件；
    -新增测试；
    -实际运行命令；
    -测试结果；
    -兼容影响；
    -未完成事项。

---

# 27. 给 Codex 的启动指令

```text
请按照 docs/OMNI_UI_A4DC4D2_RUNTIME_FIX_SPEC.md 实施。

先只完成 PR 1：
1. 修复 Voice partial 可通过 submitTurn 手动提交的问题；
2. partial Turn 保持 listening，不写正式 decision；
3. submitTurn 保持 `Promise<InteractionTurn>` 签名，对 unknown/not-ready/partial/terminal 抛稳定 OmniError；
4. 禁止创建空的伪造 Turn；
5. 修复 focusout 被记录为 gui.navigation.changed；
6. 新增 `trySubmitTurn(turnId): Promise<SubmitTurnResult>` 非抛异常高级入口；
7. 添加对应 React Runtime 回归测试；
8. 运行 @omni-ui/core 和 @omni-ui/react 测试。

不要继续 PR 2。
不要进行 TurnEvent 领域事件化。
不要拆分 runtime.tsx。
不要修改 Resolver 主链路。
不要降低 Dispatcher 校验。
不要用 catch 后直接改 status。
```

---

# 28. 最终判断标准

本轮修复完成后，以下描述必须为真：

> 用户的 GUI 操作与 VUI 意图最终汇合到同一个 app-owned Action/Executor；LLM 只提供语义假设。一个 Voice Session 的 partial 只能形成预览，final 才能形成正式决策。完整 hypotheses、GUI 时序证据、候选与决定都属于同一个 InteractionTurn。所有异步写回通过 revision CAS，所有命令来自冻结 decision，所有执行阶段和结果都可在 Trace 中准确还原。

以下任一链路仍存在，都表示未完成：

```text
Voice partial
→ ready
→ submitTurn
→ Executor
```

```text
ResolvedInteraction
→ 自动补当前上下文
→ 正式 dispatch
```

```text
cancelled Turn
→ late Resolver
→ ready
```

```text
FusionContext 已构建
→ Ranker 仍只读取 Snapshot
```

```text
turn.decision.params
→ submit 时从当前 Snapshot 重算
```

```text
非法 transition
→ catch
→ 手工覆盖 status
```

```text
Domain Action
→ 自动被记录成 voice
```

```text
Action 声明 stalePolicy
→ Dispatcher 完全不读取
```
