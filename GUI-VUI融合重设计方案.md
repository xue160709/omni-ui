# GUI 与 VUI 融合重设计方案

## 1. 核心修正

GUI 与 VUI 的融合不应该被设计成“开发者提前手写一大堆交互对象”。

更合理的方式是：

```text
运行时观察 GUI
  ↓
自动抽取交互语义
  ↓
形成 Interaction Snapshot
  ↓
LLM / NLU 基于快照理解用户意图
  ↓
确定性模块校验和执行
```

也就是说，Interaction Object 不是开发者手工维护的一份主数据，而是系统从当前 GUI、Accessibility Tree、组件树、页面状态和业务状态中实时生成的语义索引。

人工配置只应该是补充，不应该是主体。

修订后的落地约束是：

```text
自动抽取负责基础事实。
Semantic Aggregator 负责把基础事实聚合成业务对象。
MultimodalGroup 只声明聚合边界和少量业务身份，不手写完整对象。
interactionHint 只补充别名、缺失标签和失败原因；风险、权限、确认策略放在 action registry。
LLM 面向聚合后的业务 action，不直接面对所有底层控件 action。
GUI 操作和多模态操作必须共用同一套确定性执行入口。
```

## 2. 设计目标

这个方案的目标不是给 GUI 加一个语音助手，也不是给每个控件增加一堆语音参数。

目标是建立一套以 GUI 为参照对象的多模态交互系统：

- GUI 负责呈现对象、状态、层级和边界。
- VUI 负责表达意图、输入内容和跨界面调度。
- 手势、眼动、实体按键、触控笔等通道也可以表达目标、方向、幅度或确认。
- 系统把所有通道转换成统一的交互事件。
- 最终由同一套状态、权限、作用域和反馈机制执行。

一句话：

```text
不是让开发者预设所有对象，而是让系统实时看懂当前 GUI。
```

## 3. 总体架构

```text
GUI Runtime
  ├─ DOM / View Tree / ARIA
  ├─ Accessibility Tree（辅助来源）
  ├─ Component Registry / Metadata
  ├─ Route / Page State
  └─ App / System State
          ↓
Semantic Extractor
          ↓
Semantic Aggregator
          ↓
Interaction Snapshot
          ↓
Modality Adapters
  ├─ Voice
  ├─ Gesture
  ├─ Gaze
  ├─ Touch
  ├─ Keyboard
  └─ Remote / Hardware
          ↓
Intent Understanding
  ├─ LLM / NLU
  ├─ Target Resolver
  └─ Context Resolver
          ↓
Interaction Manager
  ├─ Scope Validator
  ├─ Permission Validator
  ├─ Conflict Arbiter
  └─ Action Dispatcher
          ↓
Feedback Manager
  ├─ GUI Feedback
  ├─ VUI Feedback
  ├─ Sound / Haptic
  └─ Floating Panel
```

在 Web / React 场景里，主路径不是直接读取完整 Accessibility Tree 或 React Component Tree。更现实的实现是：

```text
DOM / ARIA / data-* 属性
  + 组件注册 hook
  + 路由和页面状态
  + 业务 action registry
  + 少量 interactionHint
```

Accessibility Tree 可以作为抽取质量的参考或测试辅助，但不应该成为唯一依赖。

## 4. Interaction Snapshot

Interaction Snapshot 是当前界面的交互语义快照。

它不是长期手写配置，而是运行时动态生成。

它应该包含：

- snapshotId 和 stateVersion。
- 当前页面。
- 当前容器和弹窗。
- 当前可见对象。
- 当前焦点对象。
- 当前输入对象。
- 最近 GUI / VUI / 手势事件。
- 每个对象的 role、label、value、enabled、actions。
- 每个对象的可见性、层级、区域、上下文关系。
- 当前全局能力和任务状态。

示例：

```json
{
  "snapshotId": "snapshot_10007",
  "stateVersion": 42,
  "page": {
    "id": "climate_control",
    "title": "空调控制"
  },
  "contextStack": [
    {
      "type": "page",
      "id": "climate_control",
      "title": "空调控制"
    }
  ],
  "visibleObjects": [
    {
      "id": "auto.climate.power",
      "source": "accessibility_tree",
      "role": "switch",
      "label": "空调",
      "state": {
        "value": true,
        "enabled": true
      },
      "actions": ["turnOn", "turnOff", "toggle"],
      "executeScope": "page"
    },
    {
      "id": "auto.climate.temperature",
      "source": "view_tree",
      "role": "slider",
      "label": "温度",
      "state": {
        "value": 24,
        "min": 16,
        "max": 30,
        "step": 1,
        "enabled": true
      },
      "actions": ["setValue", "increase", "decrease"],
      "executeScope": "page"
    }
  ],
  "focus": {
    "objectId": "auto.climate.temperature",
    "source": "gaze",
    "confidence": 0.82
  },
  "recentEvents": [
    {
      "modality": "gui",
      "type": "tap",
      "target": "auto.climate.temperature",
      "baseStateVersion": 41,
      "timestamp": 10001
    }
  ]
}
```

这份快照给 LLM 或 NLU 阅读，而不是把原始 DOM、截图、控件实现细节直接丢给它。

## 5. 自动语义抽取

系统应该优先从现有 GUI 自动生成交互对象。

### 5.1 从 Accessibility Tree 抽取

Accessibility Tree 通常已经包含：

- role。
- label。
- value。
- enabled / disabled。
- focusable。
- selected / checked。
- available actions。

这些信息可以直接变成交互对象的基础语义。

例如：

```text
Switch(label="蓝牙", checked=false)
```

可以自动生成：

```json
{
  "role": "switch",
  "label": "蓝牙",
  "state": {
    "value": false,
    "enabled": true
  },
  "actions": ["turnOn", "turnOff", "toggle"]
}
```

### 5.2 从 View Tree / Component Tree 抽取

很多 GUI 组件没有完整 accessibility 信息，此时可以从组件树和布局关系推断。

例如：

```text
[温度] [Slider value=24 min=16 max=30]
```

系统可以通过相邻文本、布局分组和控件 role 推断出：

```json
{
  "role": "slider",
  "label": "温度",
  "state": {
    "value": 24,
    "min": 16,
    "max": 30
  },
  "actions": ["setValue", "increase", "decrease"]
}
```

### 5.3 从页面和路由抽取

页面标题、路由、导航栈和业务状态可以提供上下文。

例如：

```text
route = /settings/bluetooth
title = 蓝牙设置
```

系统可以知道“打开”“关闭”“连接第二个”更可能属于蓝牙设置上下文。

### 5.4 从列表和容器抽取

列表、菜单、选择器要被抽取成容器对象。

例如 Wi-Fi 列表：

```json
{
  "id": "auto.wifi.list",
  "role": "list",
  "label": "无线网络列表",
  "items": [
    {
      "index": 1,
      "id": "auto.wifi.item.1",
      "label": "Home_5G",
      "actions": ["connect"]
    },
    {
      "index": 2,
      "id": "auto.wifi.item.2",
      "label": "Office-WiFi",
      "actions": ["connect"]
    }
  ]
}
```

这样用户说“连接第二个”时，系统能知道“第二个”属于哪个容器。

## 6. 组合组件与页面的语义聚合

自动抽取会先得到一批底层节点，但用户的自然表达往往不是针对单个底层控件，而是针对一个组合组件、容器、页面或任务。

因此系统需要一个 Semantic Aggregator，把散落的控件节点聚合成更高层的交互对象。

```text
底层控件节点
  ↓
组合组件对象
  ↓
容器对象
  ↓
页面对象
  ↓
任务对象
```

### 6.1 多控件组合组件

例如一个温度调节组件：

```tsx
<div>
  <Label>温度</Label>
  <Slider value={[24]} min={16} max={30} />
  <span>24℃</span>
</div>
```

底层抽取结果可能是：

```json
[
  {
    "role": "text",
    "label": "温度"
  },
  {
    "role": "slider",
    "value": 24,
    "min": 16,
    "max": 30
  },
  {
    "role": "text",
    "label": "24℃"
  }
]
```

Semantic Aggregator 应该把它聚合成：

```json
{
  "id": "auto.composite.temperature_control",
  "type": "composite",
  "role": "value_control",
  "label": "温度",
  "children": [
    "text.temperature",
    "slider.temperature",
    "text.current_value"
  ],
  "primaryControl": "slider.temperature",
  "state": {
    "value": 24,
    "unit": "celsius",
    "min": 16,
    "max": 30,
    "step": 1
  },
  "actions": ["setValue", "increase", "decrease"]
}
```

用户说“温度调高一点”或“把温度调到 26 度”时，目标对象应该是这个 composite 对象，而不是裸 Slider。ActionExecutor 再把动作委托给内部 Slider。

### 6.2 聚合依据

聚合不应该主要依赖人工配置，而应该优先依赖现有 GUI 结构：

- DOM / View Tree 层级。
- 视觉邻近关系。
- Label htmlFor / aria-labelledby。
- FormField 结构。
- Card / ListItem / Dialog 区域。
- Radix / Base UI 组件结构。
- 相邻文本和值。
- 组件 role 和状态。
- 页面标题和路由上下文。

例如：

```tsx
<FormField name="temperature">
  <FormLabel>温度</FormLabel>
  <Slider />
  <FormDescription>当前 24℃</FormDescription>
</FormField>
```

这类结构天然应该聚合成一个“温度调节”对象。

### 6.3 组合组件 hint

如果自动聚合不稳定，可以给组合边界一个轻量 hint：

```tsx
<MultimodalGroup
  label="温度"
  role="value_control"
>
  <Label>温度</Label>
  <Slider />
  <span>24℃</span>
</MultimodalGroup>
```

这个 hint 的作用是声明组合边界和少量业务语义，不是要求开发者手写内部所有对象。上例中的 `setValue`、`increase`、`decrease` 应该优先从内部 Slider 的标准语义自动推导出来。

对于业务列表项，`MultimodalGroup` 也只应该补充系统无法从 DOM 中稳定推断的业务身份：

```tsx
<MultimodalGroup
  role="list_item"
  entity={{ type: "todo", id: todo.id }}
  label={todo.title}
>
  <Checkbox checked={todo.completed} />
  <span>{todo.title}</span>
  <Button>删除</Button>
</MultimodalGroup>
```

列表索引、`第 1 个` 这类别名、可执行业务动作，应该由父级 list、业务 action registry 和 Semantic Aggregator 共同推导。

这里的 `entity` 只表示业务实体引用，不表示普通 UI 区域。

```text
适合使用 entity：todo、order、file、contact、message 这类有业务 ID 的对象。
不适合使用 entity：composer、filter_tabs、toolbar、dialog 这类 UI 区域。
```

纯 UI 区域通常只需要 `id`、`role` 和 `label`。如果一个区域需要承载动作作用域，应由 action registry 的 `attachTo` 或页面 / 容器 id 来声明，而不是把它伪装成业务实体。

### 6.4 页面对象

页面也应该进入 Interaction Snapshot。

页面对象负责表达页面级上下文和页面级 action：

```json
{
  "id": "page.settings",
  "type": "page",
  "title": "设置",
  "route": "/settings",
  "regions": ["network", "display", "account"],
  "actions": ["searchSetting", "goBack", "openSection"],
  "visibleObjects": [
    "settings.bluetooth",
    "settings.wifi"
  ]
}
```

用户说“搜索蓝牙”“返回上一页”“打开网络设置”时，不一定对应某个按钮，而可能对应页面级 action。

页面也可以使用轻量声明：

```tsx
<MultimodalPage
  title="空调控制"
  route="/climate"
  actions={["turnOn", "turnOff", "setTemperature", "setFanSpeed"]}
>
  <ClimatePage />
</MultimodalPage>
```

### 6.5 目标解析优先级

当用户意图存在多个可能目标时，Target Resolver 应该按上下文优先级解析：

```text
当前弹窗 / 模态容器
当前焦点组件
用户看向 / 指向的区域
当前页面可见组合组件
当前页面级 action
全局 action
```

例如用户说“取消”：

- 如果有 Dialog，优先取消 Dialog。
- 如果在任务流中，可能取消当前任务。
- 如果在输入框中，可能取消输入候选。
- 如果没有强上下文，再尝试页面级返回或取消。

### 6.6 shadcn 中的聚合适配器

shadcn 里很多组件天然就是组合对象，应该提供专门的聚合适配器：

```text
FormFieldAdapter：Label + Control + Message
CardAdapter：Header + Content + Actions
DialogAdapter：Title + Description + Buttons
CommandAdapter：Search Input + Result List
SelectAdapter：Trigger + Content + Items
TableAdapter：Row + Cells + Row Actions
ListItemAdapter：Icon + Text + Actions
```

这些适配器负责把底层节点合成更接近用户语言的交互对象。

底层控件提供事实，高层组件提供语义，页面提供任务上下文。

### 6.7 聚合后的 action 暴露规则

系统内部可以同时存在三类 action：

```text
natural intent：用户自然表达，例如 complete_todo、increase_value
domain action：业务动作，例如 todo.complete、climate.setTemperature
primitive action：控件动作，例如 press、check、setValue
```

对 LLM 暴露时应该遵循一个原则：

```text
有聚合对象时，Snapshot 优先暴露 domain action。
primitive action 作为内部执行能力保留，不直接暴露给 LLM。
没有聚合对象时，才把 primitive action 暴露为可见即可说的降级能力。
```

例如 TodoItem 被聚合后，LLM 应该看到：

```json
{
  "id": "todo.item.todo_1",
  "role": "list_item",
  "label": "买牛奶",
  "actions": ["todo.complete", "todo.delete", "todo.rename"]
}
```

而不是同时看到 `checkbox.check`、`button.press` 和 `todo.complete`。底层 `check` / `press` 只用于 Action Dispatcher 把业务动作落到确定性 UI 或状态入口。

### 6.8 action 挂载和执行规则

Action registry 不只是“有哪些 action”的清单，还要同时说明两件事：

```text
attachTo：这个 action 应该挂在哪些交互对象上，让 Snapshot 暴露给 LLM。
executeScope：这个 action 执行时属于哪个作用域，由 Validator 校验当前上下文是否允许。
```

这两个概念不能混在一起。否则 Aggregator 会分不清 `todo.add` 是页面级能力，还是 Composer 对象上的能力；Validator 也会分不清某个 action 是局部对象操作，还是页面 / 系统级操作。

推荐 action spec：

```ts
type DomainActionSpec = {
  attachTo?: {
    id?: string
    role?: string
    entityType?: string
  }
  executeScope: "object" | "container" | "page" | "app" | "system" | "task"
  paramsFrom?: Record<string, string>
  availableWhen?: string
  risk?: "low" | "medium" | "high"
  requiresConfirmation?: boolean
}
```

`paramsFrom` 和 `availableWhen` 应该实现成受限的路径 / 谓词 DSL，或由 registry 注册确定性函数。文档里用字符串只是为了表达规则，不应该在运行时直接 `eval`。

分配规则按优先级执行：

```text
1. attachTo.id 命中具体对象 id 时，只挂到该对象。
2. attachTo.entityType 命中对象 entity.type 时，挂到对应业务实体对象。
3. attachTo.role 命中对象 role 时，挂到对应角色对象。
4. executeScope 为 page / app / system 且没有 attachTo 时，挂到对应层级对象。
5. 没有命中任何对象的 action 不进入 Snapshot，只保留在 registry 中等待显式调用或跨页面任务使用。
```

例如：

```ts
useInteractionActions({
  namespace: "todo",
  actions: {
    "todo.add": {
      attachTo: { id: "todo.composer" },
      executeScope: "page",
    },
    "todo.complete": {
      attachTo: { entityType: "todo" },
      executeScope: "object",
      paramsFrom: { todoId: "target.entity.id" },
      availableWhen: "target.state.completed === false",
    },
    "todo.uncomplete": {
      attachTo: { entityType: "todo" },
      executeScope: "object",
      paramsFrom: { todoId: "target.entity.id" },
      availableWhen: "target.state.completed === true",
    },
    "todo.delete": {
      attachTo: { entityType: "todo" },
      executeScope: "object",
      paramsFrom: { todoId: "target.entity.id" },
      risk: "medium",
    },
    "todo.rename": {
      attachTo: { entityType: "todo" },
      executeScope: "object",
      paramsFrom: { todoId: "target.entity.id" },
    },
    "todo.filter": {
      attachTo: { id: "todo.filters" },
      executeScope: "container",
    },
    "todo.clearCompleted": {
      executeScope: "page",
    },
  },
})
```

这样 Aggregator 可以确定：

```text
未完成的 todo.item.todo_1 暴露 todo.complete / todo.delete / todo.rename。
已完成的 todo.item.todo_2 暴露 todo.uncomplete / todo.delete / todo.rename。
todo.composer 暴露 todo.add。
todo.filters 暴露 todo.filter。
page.todo 暴露 todo.clearCompleted。
```

`MultimodalPage.actions` 可以作为页面作用域的轻量声明或兼容旧写法，但如果 action registry 已经提供 `attachTo` / `executeScope`，页面 action 应优先从 registry 推导，避免重复维护。

### 6.9 state 推导和可选映射

聚合对象的 state 也应该优先推导，但推导规则必须可解释。

常见来源包括：

```text
entity.id → todoId、orderId、fileId 等业务 ID。
父级 list 的可见顺序 → index 和“第 N 个”别名。
group label 或主文本节点 → title / name。
primary checkbox.checked → completed / selected。
primary switch.checked → enabled / on。
slider value / min / max / step → 数值状态。
selected tab / option → 当前筛选或选择值。
```

当业务状态复杂，或者自动推导会误判时，可以给 `MultimodalGroup` 增加可选的 `stateMap`，只补充自动推导不了的字段：

```tsx
<MultimodalGroup
  role="list_item"
  entity={{ type: "todo", id: todo.id }}
  label={todo.title}
  stateMap={{
    dueAt: todo.dueAt,
    priority: todo.priority,
  }}
>
  <TodoItemView todo={todo} />
</MultimodalGroup>
```

`stateMap` 不应该重新声明完整对象状态，而是补充业务字段；基础状态仍由控件和聚合规则推导。

## 7. 人工标注的边界

人工标注应该只用于自动抽取无法可靠解决的场景。

需要人工补充的典型情况：

- 图标按钮没有文字，也没有可访问名称。
- GUI 文案无法表达真实业务含义。
- 当前界面不可见但系统全局可执行的能力。
- 跨页面、多步骤任务。
- 高风险动作，例如支付、删除、恢复出厂设置。
- 需要特殊确认策略的动作。
- 自动推断容易歧义的业务动作。

人工标注不是给每个控件写完整配置，而是给自动快照补洞。

`interactionHint` 的职责要保持很窄：

```text
可以补充：aliases、fallbackLabel、failureReason、disambiguationHint。
风险、权限、确认策略：默认放在 action registry。
只有没有 domain action 的纯 primitive 操作，才允许 hint 临时声明 risk / requiresConfirmation。
谨慎补充：label，只有 GUI 文案和业务含义明显不一致时使用。
不应承担：完整 role、actions、state、children、执行逻辑。
```

推荐形式：

```ts
defineInteractionHint({
  target: "button.restoreDefault",
  aliases: ["恢复默认", "重置设置"],
  failureReason: "当前账号无权恢复默认设置"
})
```

对应的风险和确认策略应该放在 action registry：

```ts
useInteractionActions({
  namespace: "settings",
  actions: {
    "settings.restoreDefault": {
      attachTo: { id: "button.restoreDefault" },
      executeScope: "page",
      risk: "high",
      requiresConfirmation: true,
    },
  },
})
```

或者：

```tsx
<IconButton
  icon="save"
  interactionHint={{
    aliases: ["保存草稿", "暂存"],
  }}
/>
```

再比如高风险图标按钮：

```tsx
<IconButton
  icon="trash"
  aria-label="删除"
  interactionHint={{
    aliases: ["删除这一项", "移除这一项"]
  }}
/>
```

如果这个删除按钮已经映射到 `todo.delete`、`file.delete` 这类 domain action，风险级别仍然以 action registry 为准。

也就是说：

```text
能自动抽取的，不配置。
自动抽不准的，少量补充。
危险和全局任务，在 action registry 里明确声明。
```

## 8. 多模态输入统一事件

系统不应该只服务 VUI。

语音、手势、眼动、触摸、键盘、实体按键都应该转换成统一的 Interaction Event。

示例：

```json
{
  "id": "event_001",
  "modality": "voice",
  "type": "intent",
  "text": "调高一点",
  "snapshotId": "snapshot_10007",
  "baseStateVersion": 42,
  "timestamp": 10005,
  "confidence": 0.91
}
```

手势事件：

```json
{
  "id": "event_002",
  "modality": "gesture",
  "type": "intent",
  "intentHint": "increase_value",
  "targetHint": "current_focus",
  "value": {
    "delta": 1
  },
  "snapshotId": "snapshot_10007",
  "baseStateVersion": 42,
  "timestamp": 10006,
  "confidence": 0.86
}
```

眼动事件：

```json
{
  "id": "event_003",
  "modality": "gaze",
  "type": "target_hint",
  "targetCandidate": "auto.climate.temperature",
  "snapshotId": "snapshot_10007",
  "baseStateVersion": 42,
  "timestamp": 10004,
  "confidence": 0.82
}
```

这些事件都不直接改业务状态，而是进入 Interaction Manager。

### 8.1 融合窗口和事件关联

多模态融合不能只看“最近一次事件”，必须有明确的事件关联规则。

推荐做法：

```text
1. 每个 snapshotId 维护一个短时 event buffer。
2. gaze / gesture / keyboard focus 这类 target_hint 默认只在 800ms 到 1500ms 内有效。
3. voice intent 到达后，只能关联同一 snapshotId 或可验证兼容的 target_hint。
4. 如果 stateVersion 已变化，必须重新解析目标或要求确认，不能直接沿用旧目标。
5. 多个 target_hint 冲突时，按 confidence、时间距离和上下文优先级打分；低于阈值则澄清。
6. 高风险 action 即使命中目标，也要经过确认策略和最新状态校验。
```

例如“看着第二个说完成这个”：

```text
gaze target_hint(todo.item.todo_2, t=10004)
voice intent("完成这个", t=10005)
时间差 1000ms 内，snapshotId 一致，target_hint 可作为指代消解证据。
```

如果语音结果延迟到达，而用户已经点击了别的对象或页面弹出了 Dialog，Interaction Manager 必须丢弃旧绑定或重新校验。这样可以避免“用户刚改变界面，迟到的语音又操作旧对象”的问题。

## 9. LLM 的作用

LLM 可以阅读 Interaction Snapshot，帮助理解模糊、自然、跨模态的用户表达。

它适合处理：

- “打开这个”。
- “调高一点”。
- “选第二个”。
- “还是刚才那个”。
- “帮我回家”。
- “把这里放大一点”。

但 LLM 不应该直接执行动作。

推荐职责边界：

```text
LLM：理解语义，输出候选意图。
Resolver：匹配目标对象。
Validator：校验权限、状态、风险和作用域。
Dispatcher：执行确定性 action，并复用 GUI 的同一执行入口。
```

例如当前快照中温度为 24 度，焦点在温度控件，用户说“调高一点”。

LLM 可以输出：

```json
{
  "intent": "increase_value",
  "targetCandidates": [
    {
      "id": "auto.climate.temperature",
      "confidence": 0.91,
      "reason": "当前焦点和最近操作都指向温度控件"
    }
  ],
  "params": {
    "delta": 1
  }
}
```

然后确定性模块把它转换成：

```json
{
  "action": "climate.setTemperature",
  "targetId": "auto.climate.temperature",
  "params": {
    "value": 25
  },
  "baseStateVersion": 42
}
```

如果超出范围、对象不可用、被弹窗阻塞或需要确认，则不能直接执行。

## 10. 意图识别链路

完整链路如下：

```text
用户输入
  ↓
Modality Adapter 标准化输入
  ↓
读取 Interaction Snapshot
  ↓
LLM / NLU 生成候选意图
  ↓
Target Resolver 解析目标
  ↓
Action Normalizer 转成 domain action
  ↓
Scope Validator 判断作用域
  ↓
Permission / Risk Validator 校验权限和风险
  ↓
Conflict Arbiter 处理多通道时序冲突
  ↓
Action Dispatcher 执行
  ↓
Feedback Manager 输出反馈
```

这个链路的重点是：

- LLM 能理解意图，但不拥有最终执行权。
- 当前 GUI 快照是理解用户意图的主要上下文。
- 自动抽取对象是主体，人工标注是增强。
- 所有通道都转换成统一事件。
- GUI 操作和多模态操作不应该各写一套状态更新逻辑，而应该共用同一个 action executor 或 command handler。

## 11. 作用域设计

语音和其他模态指令必须有明确作用域。

建议分为：

```text
control：当前控件
container：当前列表 / 弹窗 / 区域
page：当前页面
app：当前应用
system：系统全局
task：跨页面任务流
```

作用域由 Context Stack 决定。

例如：

- 弹窗出现时，优先解释为弹窗内操作。
- 输入框聚焦时，优先解释为文本输入或编辑命令。
- 支付、安全、删除等关键流程中，限制全局跳转。
- 用户明确说出全局意图时，再进入系统级能力匹配。

弹窗示例：

```json
{
  "contextStack": [
    {
      "type": "page",
      "id": "settings"
    },
    {
      "type": "modal",
      "id": "delete_confirm",
      "scopePolicy": "modal_first",
      "blocksGlobalActions": true
    }
  ]
}
```

这时用户说“取消”，应该优先理解为取消弹窗，而不是取消系统里其他任务。

## 12. 冲突处理

多模态系统一定会遇到时序冲突。

例如：

```text
用户先说“打开空调”
语音识别还没返回
用户又手动点了一下空调开关
语音结果延迟返回
```

此时不能简单执行迟到的语音结果。

每个事件都应该带上：

- timestamp。
- source modality。
- target。
- action。
- base state version。
- confidence。

冲突仲裁规则可以包括：

- 同一对象上，较新的本地显式操作优先。
- 高风险动作迟到时必须重新确认。
- 低置信度目标需要询问用户。
- 弹窗上下文变化后，旧意图必须重新校验。
- 如果 action 已经被用户手动完成，可以只反馈当前状态，不重复执行。

## 13. 反馈设计

反馈应该由 Feedback Manager 统一管理，而不是散落在每个控件参数里。

### 13.1 局部操作

适用于用户正在看屏幕的情况。

例如：

- 下一页。
- 收藏。
- 打开详情。
- 选择第二个。

反馈方式：

- 控件高亮。
- 状态变化。
- 轻音效。
- 短文本提示。

通常不需要长语音播报。

### 13.2 远程操作

适用于用户可能离屏幕较远，或不方便触摸的情况。

例如：

- 打开空调。
- 关闭蓝牙。
- 调高音量。

反馈方式：

- 明显视觉动效。
- 简短语音反馈。
- 状态浮层。

### 13.3 全局任务

适用于跨页面、多步骤、结果较复杂的指令。

例如：

- 导航回家。
- 搜索附近停车场。
- 订明天去北京的机票。

反馈方式：

- 浮层展示识别内容、任务进度、候选项和确认项。
- 关键节点语音播报。
- 主界面按需跳转或同步展示。

### 13.4 语音激活控件的视觉反馈

语音操作可见控件时，应该有一套区别于鼠标点击的远程激活反馈。

语音没有真实的 pointer down / pointer up，用户也可能离屏幕更远，所以不应该只复用浏览器或组件库的 `:active` 状态。更合理的反馈分三段：

```text
target highlight：表示系统理解用户说的是哪个对象。
voice press：表示系统正在替用户执行点击、切换、选择或调节。
result feedback：表示操作已经成功、失败或需要确认。
```

例如用户说“点击添加”：

```text
1. 添加按钮出现短暂目标高亮。
2. 按钮执行一次 voice press 动效。
3. 待办新增成功后，新列表项或按钮区域给出结果反馈。
```

不同对象的反馈粒度应该不同：

- Button：可以有短暂按下和外扩波纹。
- Switch / Checkbox：优先表现目标高亮和状态变化，不要制造重复切换感。
- Tabs / Select Item：高亮目标选项，然后切换选中态。
- Slider：高亮整个值控件，并在数值变化处给出反馈。
- ListItem / Card：高亮聚合对象整体，而不是只闪内部某个底层按钮。
- Dialog / AlertDialog：高亮当前模态容器内被命中的确认或取消动作。

实现上，这套效果应该由 `FeedbackManager` 统一调度，而不是散落到每个控件的业务参数里。`FeedbackManager` 根据目标对象 id 找到对应 DOM ref 或聚合对象边界，临时写入反馈状态：

```ts
feedbackManager.activate(targetId, {
  source: "voice",
  phase: "press",
})
```

DOM 可以使用统一 attribute 承载反馈状态：

```html
<button data-mm-feedback="voice-press">添加</button>
```

基础样式可以作为 runtime 默认层提供，组件库可以按主题覆盖：

```css
[data-mm-feedback="voice-target"] {
  outline: 2px solid hsl(210 90% 55%);
  outline-offset: 3px;
}

[data-mm-feedback="voice-press"] {
  animation: mm-voice-press 220ms ease-out;
}

@keyframes mm-voice-press {
  0% {
    transform: scale(1);
    box-shadow: 0 0 0 0 hsl(210 90% 55% / 0.45);
  }
  45% {
    transform: scale(0.98);
    box-shadow: 0 0 0 6px hsl(210 90% 55% / 0.18);
  }
  100% {
    transform: scale(1);
    box-shadow: 0 0 0 0 hsl(210 90% 55% / 0);
  }
}
```

这套反馈只表达“语音命中了并触发了这个 GUI 对象”，不替代 action 校验、权限确认和业务结果反馈。高风险动作在 voice press 前仍然必须先走确认策略。

## 14. 文案与可说性

GUI 文案不应该被强迫等于语音命令。

更合理的是从多个来源生成可说名称：

- 可见文本。
- aria-label / accessibilityLabel。
- 相邻文本。
- 页面标题。
- 组件 role。
- 人工 aliases。
- 历史用户说法。

对象可以区分：

```text
label：界面显示名
a11yLabel：辅助访问名
spokenAliases：用户可能说法
canonicalAction：标准动作
```

例如界面显示：

```text
OK
```

语音别名可以是：

```text
确定、确认、好的
```

这不要求所有 GUI 文案都为了语音而牺牲视觉表达。

## 15. Snapshot 性能策略

Interaction Snapshot 不能在每次细微 DOM 变化时全量重建并完整发送给 LLM。推荐策略是：

```text
事件触发：路由变化、弹窗变化、焦点变化、表单状态变化、列表数据变化。
增量更新：Extractor 维护 raw node cache，Aggregator 只重算受影响子树。
防抖合并：连续输入、动画和批量列表更新应该合并为一次快照版本。
可见窗口：虚拟列表默认只暴露可见项、焦点项、选中项和少量上下文项。
按需展开：表格、长列表、复杂表单先给摘要，用户意图命中后再读取局部详情。
版本校验：每个 Snapshot 带 stateVersion，执行前重新校验当前版本。
```

给 LLM 的快照应该是压缩后的交互语义，而不是完整页面镜像。大页面可以拆成：

```text
page summary
active region
visible actionable objects
focused / selected objects
recent events
available domain actions
```

这样可以控制 token 成本，也避免长列表和复杂表格把当前任务上下文淹没。

## 16. 最小落地路线

### 16.1 第一阶段：运行时快照和最小聚合

接入 DOM / ARIA / 组件注册信息，生成最小 Interaction Snapshot，并同时引入最小 Semantic Aggregator。第一阶段只做稳定、低歧义的聚合，不追求覆盖所有复杂组件。

至少抽取：

- page。
- contextStack。
- visibleObjects。
- role。
- label。
- value。
- enabled。
- primitive actions。

至少聚合：

- Page / Route。
- FormField。
- Dialog / AlertDialog。
- 可见列表中的 ListItem。

暂不处理：

- 跨区域组合。
- 复杂 Table / DataTable。
- 虚拟列表的全量离屏项。
- Wizard / Task Flow。
- 跨页面任务对象。

这一阶段不要求人工标注大量对象。

### 16.2 第二阶段：可见即可说

基于聚合后的快照支持用户操作当前可见对象。优先暴露 domain action；没有聚合对象时，才降级暴露 primitive action。

例如：

- “打开蓝牙”。
- “点击确定”。
- “选择第二个”。
- “温度调高一点”。

### 16.3 第三阶段：LLM 意图理解

让 LLM 读取 Interaction Snapshot，输出候选意图和目标对象。

重点处理：

- 指示代词：这个、那个、这里。
- 省略表达：调高一点、再来一次。
- 多模态融合：看着某个控件说“打开这个”。
- 跨对象消歧：温度、风量、亮度都可以调高时如何判断。

### 16.4 第四阶段：人工增强

只为自动抽取不足的对象补充 interaction hint。

重点包括：

- 图标按钮。
- 高风险动作。
- 全局能力。
- 跨页面任务。
- 复杂业务规则。

### 16.5 第五阶段：多模态融合

接入手势、眼动、实体按键、触控笔、遥控器等通道。

所有通道统一转换为 Interaction Event，再进入同一个 Interaction Manager。

### 16.6 第六阶段：高级聚合和任务对象

扩展 Semantic Aggregator，把第一阶段没有覆盖的散控件聚合成更复杂的组合组件、容器和任务对象。

重点处理：

- Card。
- Command。
- Select。
- Table / DataTable。
- 虚拟列表和分组列表。
- 跨区域组合对象。
- Wizard / Task Flow。

基础聚合必须在第一阶段进入；这一阶段解决的是复杂表格、跨区域组合、离屏数据和多步骤任务。

## 17. shadcn 组件库升级方案

如果要把 shadcn 组件库升级成多模态组件，不应该把它改成一套重型语音组件库。

更合理的方式是在 shadcn 之上增加一层多模态语义层：

```text
shadcn / Radix / Base UI 负责基础 UI、role、focus、keyboard、aria。
多模态语义层负责抽取、理解、校验、执行和反馈。
```

### 17.1 增加多模态核心层

建议新增一个独立模块：

```text
@/multimodal
  ├─ MultimodalProvider
  ├─ InteractionSnapshotBuilder
  ├─ SemanticAggregator
  ├─ useInteractionNode
  ├─ useInteractionGroup
  ├─ useInteractionPage
  ├─ useInteractionHint
  ├─ IntentResolver
  ├─ ActionExecutor
  ├─ FeedbackManager
  └─ ConflictArbiter
```

应用入口：

```tsx
<MultimodalProvider>
  <App />
</MultimodalProvider>
```

这个 Provider 负责监听 DOM / ARIA、组件注册信息、页面上下文和多模态事件，并生成 Interaction Snapshot。

其中 SemanticAggregator 负责把 Button、Label、Slider、Message 等底层节点聚合成 FormField、Card、Dialog、Table Row、Page 等高层交互对象。

### 17.2 shadcn 组件只做轻量适配

不要把 Button 改成这样：

```tsx
<Button
  voiceCommand=""
  voiceFeedback=""
  voiceScope=""
/>
```

优先采用两种接入方式：

```text
默认路径：外部 Observer 从 DOM / ARIA / focus / disabled / text 中抽取基础语义。
增强路径：组件内部注册 useInteractionNode，提高状态、value、action 和 ref 的准确性。
```

也就是说，改造 shadcn 不应该是第一步的硬依赖。已有项目可以先通过 `MultimodalProvider` 观察现有 DOM 获得基础能力；需要更高准确率的组件，再逐步接入 registry 版本或内部 hook。

如果需要人工补充，也应该保留 shadcn 原有 API，只增加可选的 interaction hint：

```tsx
<Button interactionHint={{ aliases: ["提交订单", "下单"] }}>
  提交
</Button>
```

如果“提交”是中高风险业务动作，风险和确认策略应该挂在 `order.submit` 这类 domain action 上，而不是塞进 Button 参数里。

大部分情况下不需要写 interaction hint。系统可以从按钮文本、aria-label、role、disabled 状态和页面上下文自动抽取。

### 17.3 组件内部注册标准语义

组件内部注册是增强路径，不是唯一实现方式。以 Button 为例：

```tsx
const Button = React.forwardRef<
  HTMLButtonElement,
  ButtonProps & {
    interactionHint?: InteractionHint
  }
>(({ interactionHint, children, ...props }, ref) => {
  const mmRef = useInteractionNode({
    role: "button",
    labelFrom: "text",
    actions: ["press"],
    hint: interactionHint,
  })

  return (
    <button
      ref={mergeRefs(ref, mmRef)}
      data-mm-role="button"
      {...props}
    >
      {children}
    </button>
  )
})
```

这里的重点是：

- 组件提供可被抽取的语义。
- hint 是补充信息，不是主数据。
- primitive action 是底层能力，不代表最终要暴露给 LLM 的业务动作。
- 真实执行要复用 GUI 已有的确定性入口，通常是同一个 command handler 或 action executor，而不是另起一条状态更新路径。

### 17.4 定义标准 action contract

不同 shadcn 组件应该暴露稳定的 primitive action：

```text
Button       → press
Switch       → turnOn / turnOff / toggle
Checkbox     → check / uncheck / toggle
RadioGroup   → selectByLabel / selectByIndex
Slider       → setValue / increase / decrease
Input        → focus / setText / appendText / clear
Textarea     → focus / setText / appendText / clear
Select       → open / selectByLabel / selectByIndex
Combobox     → search / selectResult / clear
Command      → search / selectResult
Dialog       → open / close / confirm / cancel
AlertDialog  → confirm / cancel
DropdownMenu → open / close / selectItem
Tabs         → switchTo
Table        → selectRow / openRow / sort / filter
Toast        → announce / dismiss
```

但最终执行层还需要 domain action：

```text
primitive action：press、check、setValue、selectByLabel
domain action：todo.complete、order.submit、settings.restoreDefault
```

LLM 输出的是候选意图。Action Normalizer 根据目标对象、上下文和 action registry 把它转成 domain action。ActionExecutor 只允许执行已注册、已校验的 domain action。只有没有聚合对象和业务 action 时，系统才降级执行 primitive action。

### 17.5 优先改造的组件

第一批优先改造这些组件：

- Button
- Input
- Textarea
- Switch
- Checkbox
- RadioGroup
- Slider
- Select
- Combobox / Command
- Dialog / AlertDialog
- DropdownMenu
- Tabs
- Form
- Table / DataTable
- Toast / Sonner

这些组件覆盖了大多数 GUI 操作、输入、选择、确认和反馈场景。

### 17.6 使用 registry 分发

因为 shadcn 本身支持通过 registry 分发组件，可以把多模态版本做成独立 registry：

```text
@multimodal/core
@multimodal/button
@multimodal/switch
@multimodal/dialog
@multimodal/form
@multimodal/table
```

项目可以在 components.json 中配置私有或团队 registry，然后按需安装多模态组件。

这比在每个项目里手工复制改造更稳定，也方便团队统一升级。

### 17.7 shadcn 改造原则

升级 shadcn 的原则是：

```text
不破坏原有视觉系统。
不破坏原有组件 API。
不让每个控件承担复杂意图理解。
优先复用 aria、role、label、focus、value。
能自动抽取的，不要求开发者配置。
抽不准、高风险、跨页面任务才用 hint。
```

最终 shadcn 组件要变成：

```text
可被观察
可被抽取
可被理解
可被安全执行
可被多通道反馈
```

而不是变成一套只服务语音的组件库。

## 18. 结论

最终方案应该是：

```text
自动抽取为主
基础聚合前置
人工标注为辅
LLM 负责理解
系统负责校验和执行
GUI 是稳定参照对象
多模态都走统一事件链路
GUI / VUI 共用同一执行入口
```

这和“给控件增加一堆新参数”不是一回事。

更准确的表达是：

```text
控件、组件、容器和页面提供可被抽取的语义。
Semantic Aggregator 把底层事实聚合成业务对象。
系统运行时生成 Interaction Snapshot。
LLM 基于快照理解用户意图。
确定性模块负责 action 归一、作用域、权限、风险、冲突和执行。
聚合对象优先暴露 domain action，底层 primitive action 只作为内部能力或降级能力。
```

这样既保留了 GUI/VUI 融合的核心思想，又避免了提前维护海量交互对象的工程负担。
