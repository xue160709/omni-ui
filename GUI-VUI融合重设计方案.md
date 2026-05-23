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
  ├─ View Tree
  ├─ Accessibility Tree
  ├─ Component Metadata
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

## 4. Interaction Snapshot

Interaction Snapshot 是当前界面的交互语义快照。

它不是长期手写配置，而是运行时动态生成。

它应该包含：

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
      "scope": "page"
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
      "scope": "page"
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
  actions={["setValue", "increase", "decrease"]}
>
  <Label>温度</Label>
  <Slider />
  <span>24℃</span>
</MultimodalGroup>
```

这个 hint 的作用是声明组合边界和业务语义，不是要求开发者手写内部所有对象。

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

推荐形式：

```ts
defineInteractionHint({
  target: "button.restoreDefault",
  label: "恢复默认设置",
  aliases: ["恢复默认", "重置设置"],
  risk: "high",
  requiresConfirmation: true,
  failureReason: "当前账号无权恢复默认设置"
})
```

或者：

```tsx
<IconButton
  icon="trash"
  aria-label="删除"
  interactionHint={{
    risk: "high",
    requiresConfirmation: true
  }}
/>
```

也就是说：

```text
能自动抽取的，不配置。
自动抽不准的，少量补充。
危险和全局任务，明确声明。
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
  "timestamp": 10004,
  "confidence": 0.82
}
```

这些事件都不直接改业务状态，而是进入 Interaction Manager。

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
Dispatcher：执行确定性 action。
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
  "action": "setValue",
  "targetId": "auto.climate.temperature",
  "params": {
    "value": 25
  }
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

## 15. 最小落地路线

### 15.1 第一阶段：运行时快照

接入 View Tree / Accessibility Tree，生成最小 Interaction Snapshot。

至少抽取：

- page。
- contextStack。
- visibleObjects。
- role。
- label。
- value。
- enabled。
- actions。

这一阶段不要求人工标注大量对象。

### 15.2 第二阶段：可见即可说

基于快照支持用户操作当前可见对象。

例如：

- “打开蓝牙”。
- “点击确定”。
- “选择第二个”。
- “温度调高一点”。

### 15.3 第三阶段：LLM 意图理解

让 LLM 读取 Interaction Snapshot，输出候选意图和目标对象。

重点处理：

- 指示代词：这个、那个、这里。
- 省略表达：调高一点、再来一次。
- 多模态融合：看着某个控件说“打开这个”。
- 跨对象消歧：温度、风量、亮度都可以调高时如何判断。

### 15.4 第四阶段：人工增强

只为自动抽取不足的对象补充 interaction hint。

重点包括：

- 图标按钮。
- 高风险动作。
- 全局能力。
- 跨页面任务。
- 复杂业务规则。

### 15.5 第五阶段：多模态融合

接入手势、眼动、实体按键、触控笔、遥控器等通道。

所有通道统一转换为 Interaction Event，再进入同一个 Interaction Manager。

### 15.6 第六阶段：组合组件和页面聚合

引入 Semantic Aggregator，把散控件聚合成组合组件、容器和页面对象。

重点处理：

- FormField。
- Card。
- Dialog。
- Command。
- Select。
- Table / DataTable。
- ListItem。
- Page / Route。

这一阶段决定系统能否从“能点控件”升级到“能理解页面任务”。

## 16. shadcn 组件库升级方案

如果要把 shadcn 组件库升级成多模态组件，不应该把它改成一套重型语音组件库。

更合理的方式是在 shadcn 之上增加一层多模态语义层：

```text
shadcn / Radix / Base UI 负责基础 UI、role、focus、keyboard、aria。
多模态语义层负责抽取、理解、校验、执行和反馈。
```

### 16.1 增加多模态核心层

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

这个 Provider 负责监听 DOM、Accessibility 信息、组件状态、页面上下文和多模态事件，并生成 Interaction Snapshot。

其中 SemanticAggregator 负责把 Button、Label、Slider、Message 等底层节点聚合成 FormField、Card、Dialog、Table Row、Page 等高层交互对象。

### 16.2 shadcn 组件只做轻量适配

不要把 Button 改成这样：

```tsx
<Button
  voiceCommand=""
  voiceFeedback=""
  voiceScope=""
/>
```

而是保留 shadcn 原有 API，只增加可选的 interaction hint：

```tsx
<Button interactionHint={{ aliases: ["提交订单", "下单"], risk: "medium" }}>
  提交
</Button>
```

大部分情况下不需要写 interaction hint。系统可以从按钮文本、aria-label、role、disabled 状态和页面上下文自动抽取。

### 16.3 组件内部注册标准语义

以 Button 为例：

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
- 真实执行仍然走组件原本的 onClick、onValueChange、onOpenChange 等确定性接口。

### 16.4 定义标准 action contract

不同 shadcn 组件应该暴露稳定的动作语义：

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

LLM 输出的是候选意图，ActionExecutor 只允许执行这些标准 action。

### 16.5 优先改造的组件

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

### 16.6 使用 registry 分发

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

### 16.7 shadcn 改造原则

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

## 17. 结论

最终方案应该是：

```text
自动抽取为主
人工标注为辅
LLM 负责理解
系统负责校验和执行
GUI 是稳定参照对象
多模态都走统一事件链路
```

这和“给控件增加一堆新参数”不是一回事。

更准确的表达是：

```text
控件、组件、容器和页面提供可被抽取的语义。
系统运行时生成 Interaction Snapshot。
LLM 基于快照理解用户意图。
确定性模块负责作用域、权限、风险、冲突和执行。
```

这样既保留了 GUI/VUI 融合的核心思想，又避免了提前维护海量交互对象的工程负担。
