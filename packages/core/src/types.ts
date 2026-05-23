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

export type InteractionObject = {
  id: string
  type: InteractionObjectType
  role: string
  label?: string
  aliases?: string[]
  source?: string
  parent?: string
  children?: string[]
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
  session?: {
    id?: string
    language?: string
    device?: string
  }
  contextStack: ContextObject[]
  page?: PageObject
  visibleObjects: InteractionObject[]
  focus?: FocusInfo
  recentEvents: InteractionEvent[]
  actionSpecs: Record<string, RegisteredActionSpec>
}

export type ResolvedInteraction = {
  status: "resolved" | "needs_clarification" | "not_found"
  utterance: string
  intent?: string
  targetId?: string
  actionId?: string
  primitiveAction?: PrimitiveAction
  params?: Record<string, unknown>
  confidence: number
  reason?: string
  candidates?: string[]
}

export type DispatchContext = {
  actionId: string
  targetId: string
  baseStateVersion: number
  confirmedActionId?: string
  candidate?: ResolvedInteraction
  utterance?: string
}

export type FeedbackPhase = "voice-target" | "voice-press" | "success" | "error"

export type FeedbackRequest = {
  targetId: string
  source: "voice" | "gui" | "gaze" | "gesture" | "keyboard"
  phase: FeedbackPhase
  message?: string
}
