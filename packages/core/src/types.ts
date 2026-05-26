// 中文：核心类型定义了应用如何把 UI 暴露成可被语音、聊天和规则解析器理解的交互对象。
// English: Core types describe how an app exposes UI as interaction objects that voice, chat, and rule resolvers can understand.
export type ExecuteScope =
  | "object"
  | "container"
  | "page"
  | "app"
  | "system"
  | "task"

export type RiskLevel = "low" | "medium" | "high"

export type InteractionObjectType = "raw" | "composite" | "container" | "page"

export type PrimitiveAction =
  | "press"
  | "turnOn"
  | "turnOff"
  | "toggle"
  | "check"
  | "uncheck"
  | "focus"
  | "setText"
  | "appendText"
  | "clear"
  | "setValue"
  | "increase"
  | "decrease"
  | "open"
  | "close"
  | "confirm"
  | "cancel"
  | "select"
  | "selectByLabel"
  | "selectByIndex"
  | "switchTo"
  | "search"
  | "selectResult"
  | string

export type EntityRef = {
  type: string
  id: string
}

export type InteractionHint = {
  aliases?: string[]
  fallbackLabel?: string
  failureReason?: string
  disambiguationHint?: string
}

export type InteractionState = Record<string, unknown>

export type InteractionBounds = {
  x: number
  y: number
  width: number
  height: number
  coordinateSpace: "viewport"
}

export type InteractionHitTarget = {
  targetId?: string
  promoteTo?: "self" | "parent" | "primaryControl" | "entity"
  priority?: number
}

// 中文：InteractionObject 是 snapshot 的基本单位，既可以代表真实 DOM 控件，也可以代表业务对象或页面容器。
// English: InteractionObject is the snapshot unit for real DOM controls, virtual business objects, and page containers.
export type InteractionObject = {
  id: string
  type: InteractionObjectType
  role: string
  semanticKind?: "field" | "item" | "collection" | "metric" | "action" | "section"
  label?: string
  aliases?: string[]
  source?: string
  parent?: string
  children?: string[]
  primaryControl?: string
  bounds?: InteractionBounds
  hitTarget?: InteractionHitTarget
  entity?: EntityRef
  state?: InteractionState
  actions?: string[]
  primitiveActions?: PrimitiveAction[]
  executeScope?: ExecuteScope
  indexBy?: "visible_order"
  options?: Array<{ label: string; value: string }>
}

export type PageObject = InteractionObject & {
  type: "page"
  title?: string
  route?: string
}

export type ContextObject = {
  type: "page" | "modal" | "container" | "task"
  id: string
  title?: string
  scopePolicy?: "modal_first" | "page_first"
  blocksGlobalActions?: boolean
}

export type FocusInfo = {
  objectId: string
  source: "gui" | "voice" | "gaze" | "gesture" | "keyboard" | "programmatic"
  confidence?: number
}

export type PointerReference = {
  objectId: string
  source: "pointer" | "hover" | "focus" | "selection"
  timestamp: number
  confidence: number
  textAlias?: string
  x?: number
  y?: number
}

export type InteractionEvent = {
  id: string
  modality: "gui" | "voice" | "gaze" | "gesture" | "touch" | "keyboard" | "remote"
  type: string
  text?: string
  target?: string
  targetHint?: string
  action?: string
  snapshotId: string
  baseStateVersion: number
  timestamp: number
  confidence?: number
  value?: unknown
}

export type ActionPayload = {
  type: string
  [key: string]: unknown
}

export type ValidationResult =
  | { ok: true }
  | {
      ok: false
      reason: string
      code?:
        | "state_changed"
        | "missing_action"
        | "confirmation_required"
        | "unavailable"
        | "target_missing"
        | "ambiguous"
        | "execution_failed"
        | "policy_denied"
    }

export type ActionAttachTarget = {
  id?: string
  role?: string
  entityType?: string
}

export type ActionContext = {
  actionId: string
  target: InteractionObject
  snapshot: InteractionSnapshot
  candidate?: ResolvedInteraction
  utterance?: string
}

export type ActionParamResolver =
  | Record<string, string>
  | ((context: ActionContext) => Record<string, unknown>)

export type ActionAvailability = (context: ActionContext) => boolean

// 中文：业务 action executor 接收已校验过的 action payload，并在应用侧执行真正的状态变更。
// English: Domain action executors receive validated action payloads and perform the real app-side state change.
export type ActionExecutor<TAction extends ActionPayload = ActionPayload> = (
  action: TAction,
  context: ActionContext
) => void | Promise<void>

export type DomainActionSpec<TAction extends ActionPayload = ActionPayload> = {
  attachTo?: ActionAttachTarget
  executeScope: ExecuteScope
  paramsFrom?: ActionParamResolver
  availableWhen?: ActionAvailability
  risk?: RiskLevel
  requiresConfirmation?: boolean
  execute?: ActionExecutor<TAction>
}

export type RegisteredActionSpec<TAction extends ActionPayload = ActionPayload> =
  DomainActionSpec<TAction> & {
    id: string
    namespace?: string
    execute?: ActionExecutor<TAction>
  }

export type InteractionSnapshot = {
  snapshotId: string
  stateVersion: number
  manifest?: import("./manifest").AppInteractionManifest
  session?: {
    id?: string
    language?: string
    device?: string
  }
  contextStack: ContextObject[]
  page?: PageObject
  visibleObjects: InteractionObject[]
  focus?: FocusInfo
  recentReferences?: PointerReference[]
  recentEvents: InteractionEvent[]
  actionSpecs: Record<string, RegisteredActionSpec>
}

// 中文：ResolvedInteraction 是“用户表达 -> 目标对象 + 动作”的解析结果，后续仍需本地策略和状态校验。
// English: ResolvedInteraction maps an utterance to a target plus action; local policy and state validation still run afterward.
export type ResolvedInteraction = {
  status: "resolved" | "needs_clarification" | "not_found" | "unsupported"
  utterance: string
  intent?: string
  targetId?: string
  targetCandidates?: Array<{ id: string; confidence: number; reason?: string }>
  actionId?: string
  primitiveAction?: PrimitiveAction
  params?: Record<string, unknown>
  confidence: number
  reason?: string
  candidates?: string[]
  resolverId?: string
}

export type IntentResolverContext = {
  utterance: string
  snapshot: InteractionSnapshot
}

export type IntentResolver = {
  id: string
  resolve: (context: IntentResolverContext) => ResolvedInteraction | ResolvedInteraction[] | Promise<ResolvedInteraction | ResolvedInteraction[]>
}

export type ResolverMode = "rule-only" | "rule-first" | "llm-first"

export type DispatchContext = {
  actionId: string
  targetId: string
  baseStateVersion: number
  confirmedActionId?: string
  candidate?: ResolvedInteraction
  utterance?: string
}

export type InteractionResolutionResult = {
  snapshot: InteractionSnapshot
  resolution: ResolvedInteraction
}

export type InteractionExecutionKind = "domain-action" | "primitive-action"

export type InteractionSubmitOptions = {
  confirmedActionId?: string
  baseStateVersion?: number
}

export type InteractionSubmitResult = InteractionResolutionResult & {
  ok: boolean
  executed?: boolean
  execution?: InteractionExecutionKind
  target?: InteractionObject
  action?: ActionPayload
  validation?: ValidationResult
  error?: string
}

export type FeedbackPhase = "voice-target" | "voice-press" | "success" | "error"

export type FeedbackRequest = {
  targetId: string
  source: "voice" | "gui" | "gaze" | "gesture" | "keyboard"
  phase: FeedbackPhase
  message?: string
}
