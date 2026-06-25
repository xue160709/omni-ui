// 中文：核心类型定义了应用如何把 UI 暴露成可被语音、聊天和规则解析器理解的交互对象。
// English: Core types describe how an app exposes UI as interaction objects that voice, chat, and rule resolvers can understand.
import type { RuntimeSchema } from "./schema"
import type { UnifiedFocus } from "./focus"

export type ExecuteScope =
  | "object"
  | "container"
  | "page"
  | "app"
  | "system"
  | "task"

export type RiskLevel = "low" | "medium" | "high"

export type InteractionObjectType = "raw" | "composite" | "container" | "page"

export type BuiltinPrimitiveAction =
  | "press"
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
  | "selectByLabel"
  | "selectByIndex"

export type LegacyPrimitiveAction =
  | "turnOn"
  | "turnOff"
  | "confirm"
  | "cancel"
  | "select"
  | "switchTo"
  | "search"
  | "selectResult"
  | "scrollUp"
  | "scrollDown"
  | "scrollToTop"
  | "scrollToBottom"
  | "selectDate"
  | "nextMonth"
  | "previousMonth"
  | "next"
  | "previous"
  | "selectSlide"
  | "resize"

export type PrimitiveActionId =
  | BuiltinPrimitiveAction
  | `ext:${string}`

/** @deprecated Prefer PrimitiveActionId; arbitrary primitives should use the ext:* namespace. */
export type PrimitiveAction = PrimitiveActionId | LegacyPrimitiveAction

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

// 中文：InteractionObject 是 snapshot 的基本单位，既可以代表真实 DOM 控件，也可以代表业务对象或页面容器。
// English: InteractionObject is the snapshot unit for real DOM controls, virtual business objects, and page containers.
export type InteractionObject = {
  id: string
  type: InteractionObjectType
  role: string
  label?: string
  aliases?: string[]
  source?: string
  parent?: string
  children?: string[]
  primaryControl?: string
  entity?: EntityRef
  state?: InteractionState
  actions?: string[]
  primitiveActions?: PrimitiveActionId[]
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
  source: "gui" | "voice" | "assistant" | "gaze" | "gesture" | "keyboard" | "programmatic"
  confidence?: number
}

export type InteractionEvent = {
  id: string
  sequence?: number
  modality: "gui" | "voice" | "gaze" | "gesture" | "touch" | "keyboard" | "remote"
  type: string
  turnId?: string
  commandId?: string
  contextEpoch?: number
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
      code?: ValidationCode
    }

export type ValidationCode =
  | "missing_provenance"
  | "missing_anchor"
  | "invalid_binding"
  | "turn_inactive"
  | "turn_expired"
  | "state_changed"
  | "context_changed"
  | "focus_changed"
  | "target_missing"
  | "missing_action"
  | "action_target_mismatch"
  | "capability_missing"
  | "target_disabled"
  | "disabled"
  | "scope_denied"
  | "scope_blocked"
  | "policy_denied"
  | "unavailable"
  | "authorization_denied"
  | "invalid_params"
  | "confirmation_required"
  | "confirmation_mismatch"
  | "confirmation_expired"
  | "conflict_locked"
  | "conflict"
  | "unsupported_primitive"
  | "execution_noop"
  | "verification_failed"
  | "execution_failed"
  | "ambiguous"
  | "atomic_not_supported"

export type ActionAttachTarget = {
  id?: string
  role?: string
  entityType?: string
}

export type ActionContext = {
  actionId: string
  target: InteractionObject
  snapshot: InteractionSnapshot
  command?: import("./command").CommandEnvelope
  turnId?: string
  signal?: AbortSignal
  candidate?: ResolvedInteraction
  utterance?: string
}

export type ActionParamResolver =
  | Record<string, string>
  | ((context: ActionContext) => Record<string, unknown>)

export type ActionAvailability = (context: ActionContext) => boolean

export type ActionExecutionResult =
  | { status: "changed"; effectId?: string; data?: unknown; message?: string }
  | { status: "unchanged"; reason?: string; data?: unknown }
  | { status: "unverified"; reason: string; effectId?: string; data?: unknown }
  | { status: "noop"; reason: string }
  | { status: "rejected"; reason: string; code?: string }
  | { status: "unsupported"; reason: string }
  | { status: "failed"; reason?: string; error: unknown }
  | { status: "pending"; operationId: string }

export type VerificationResult =
  | { ok: true; reason?: string }
  | { ok: false; reason: string; code?: string }

export type ActionPostconditionContext = {
  command: import("./command").CommandEnvelope
  before: InteractionSnapshot
  after: InteractionSnapshot
  targetBefore: InteractionObject
  targetAfter?: InteractionObject
  execution?: ActionExecutionResult
}

export type ActionPostcondition = (
  context: ActionPostconditionContext
) => boolean | VerificationResult | Promise<boolean | VerificationResult>

// 中文：业务 action executor 接收已校验过的 action payload，并在应用侧执行真正的状态变更。
// English: Domain action executors receive validated action payloads and perform the real app-side state change.
export type ActionExecutor<TAction extends ActionPayload = ActionPayload> = (
  action: TAction,
  context: ActionContext
) => void | ActionExecutionResult | Promise<void | ActionExecutionResult>

export type DomainActionSpec<TAction extends ActionPayload = ActionPayload> = {
  title?: string
  description?: string
  attachTo?: ActionAttachTarget
  executeScope: ExecuteScope
  paramsFrom?: ActionParamResolver
  paramsSchema?: RuntimeSchema<Record<string, unknown>>
  availableWhen?: ActionAvailability
  authorize?: (
    context: ActionContext
  ) => boolean | ValidationResult | Promise<boolean | ValidationResult>
  risk?: RiskLevel
  /** @deprecated Use confirmation.required. */
  requiresConfirmation?: boolean
  confirmation?: {
    required?: boolean
    expiresInMs?: number
  }
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
  allowWhenModalOpen?: boolean
  conflictKey?: string | ((context: ActionContext) => string | undefined)
  postcondition?: ActionPostcondition
  verificationTimeoutMs?: number
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
  contextHash: string
  contextEpoch: number
  focusRevision: number
  eventSequence: number
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
  unifiedFocus: UnifiedFocus
  recentEvents: InteractionEvent[]
  actionSpecs: Record<string, RegisteredActionSpec>
}

// 中文：ResolvedInteraction 是“用户表达 -> 目标对象 + 动作”的解析结果，后续仍需本地策略和状态校验。
// English: ResolvedInteraction maps an utterance to a target plus action; local policy and state validation still run afterward.
/** @deprecated Use InteractionTurn, SemanticIntentHypothesis, RankedInteractionCandidate, and CommandEnvelope for new runtime flows. */
export type ResolvedInteraction = {
  status: "resolved" | "needs_clarification" | "not_found" | "unsupported"
  utterance: string
  intent?: string
  targetId?: string
  targetCandidates?: Array<{ id: string; confidence: number; reason?: string }>
  actionId?: string
  primitiveAction?: PrimitiveAction
  params?: Record<string, unknown>
  provenance?: {
    turnId: string
    anchor: import("./command").SnapshotAnchor
    source: import("./command").CommandSource
    resolvedAt: number
  }
  confidence: number
  reason?: string
  candidates?: string[]
  resolverId?: string
}

export type IntentResolverContext = {
  utterance: string
  snapshot: InteractionSnapshot
  turnId?: string
  voiceInput?: import("./turn").VoiceInput
  recentEvents?: InteractionEvent[]
  signal?: AbortSignal
}

export type IntentResolver = {
  id: string
  resolve: (context: IntentResolverContext) => ResolvedInteraction | ResolvedInteraction[] | Promise<ResolvedInteraction | ResolvedInteraction[]>
}

export type ResolverMode = "rule-only" | "rule-first" | "llm-first"

/** @deprecated New execution paths should dispatch CommandEnvelope instances with a SnapshotAnchor. */
export type DispatchContext = {
  actionId: string
  targetId: string
  baseStateVersion: number
  /** @deprecated Confirmation must bind a full immutable CommandEnvelope, not just an action id. */
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
  /** @deprecated Confirmation must bind a full immutable CommandEnvelope, not just an action id. */
  confirmedActionId?: string
  baseStateVersion?: number
  batchMode?: "atomic" | "best_effort"
  batchTransaction?: import("./batch").ActionTransactionAdapter
  /** @internal Used by assistant policy to turn risk confirmation into a frozen pending command. */
  forceConfirmation?: boolean
}

export type InteractionSubmitResult = InteractionResolutionResult & {
  ok: boolean
  /** @deprecated Use structured DispatchResult.status. */
  executed?: boolean
  pendingCommand?: import("./command").CommandEnvelope
  dispatch?: import("./command").DispatchResult
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
