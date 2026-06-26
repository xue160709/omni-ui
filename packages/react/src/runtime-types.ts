import type {
  ActionExecutor,
  AppInteractionManifest,
  BatchDispatchResult,
  DispatchResult,
  DomainActionSpec,
  EntityRef,
  InteractionHint,
  InteractionObject,
  InteractionResolutionResult,
  InteractionSnapshot,
  InteractionSubmitOptions,
  InteractionSubmitResult,
  InteractionTurn,
  OmniError,
  ResolvedInteraction,
  VoiceInput,
} from "@omni-ui/core"

export type RegisteredNode = {
  id: string
  ownerId?: string
  role: string
  label?: string
  labelFrom?: "text" | "aria" | "none"
  actions?: string[]
  hint?: InteractionHint
  state?: Record<string, unknown>
  element: HTMLElement
}

// 中文：Group 表示业务边界，如列表、列表项、弹窗或表单字段，可把多个原始控件组织成一个语义对象。
// English: A group represents a business boundary, such as a list, item, dialog, or form field, grouping raw controls semantically.
export type RegisteredGroup = {
  id: string
  ownerId?: string
  role: string
  label?: string
  aliases?: string[]
  entity?: EntityRef
  state?: Record<string, unknown>
  indexBy?: "visible_order"
  element: HTMLElement
}

export type RegisteredPage = {
  id: string
  ownerId?: string
  title: string
  route?: string
  state?: Record<string, unknown>
}

export type RegisteredVirtualObject = InteractionObject & {
  ownerId?: string
}

export type ActionRegistration = {
  namespace: string
  ownerId?: string
  actions: Record<string, DomainActionSpec>
  execute?: ActionExecutor
}

export type TurnRuntimeHandle = {
  resolverAbort?: AbortController
  previewAbort?: AbortController
  dispatchAbort?: AbortController
  resolverGeneration: number
  previewGeneration: number
  dispatchGeneration: number
}

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

export type SubmitTurnDispatchOptions = Pick<
  InteractionSubmitOptions,
  "forceConfirmation" | "confirmedActionId"
>

export type RuntimeContextValue = {
  snapshot: InteractionSnapshot
  lastResolution?: ResolvedInteraction
  getSnapshot: () => InteractionSnapshot
  getActiveTurn: () => InteractionTurn | undefined
  getTurn: (turnId: string) => InteractionTurn | undefined
  resolveVoice: (input: VoiceInput) => Promise<InteractionTurn>
  submitVoice: (input: VoiceInput) => Promise<InteractionTurn>
  submitTurn: (turnId: string) => Promise<InteractionTurn>
  trySubmitTurn: (turnId: string) => Promise<SubmitTurnResult>
  confirmTurn: (turnId: string) => Promise<DispatchResult>
  cancelTurn: (turnId: string, reason?: string) => void
  resolveText: (text: string) => Promise<InteractionResolutionResult>
  dispatchResolution: (
    resolution: ResolvedInteraction,
    options?: InteractionSubmitOptions
  ) => Promise<InteractionSubmitResult>
  dispatchBatchResolutions: (
    resolutions: ResolvedInteraction[],
    options?: InteractionSubmitOptions
  ) => Promise<{ batch: BatchDispatchResult; results: InteractionSubmitResult[] }>
  submitUtterance: (
    text: string,
    options?: InteractionSubmitOptions
  ) => Promise<InteractionSubmitResult>
  recordEvent: (event: import("@omni-ui/core").InteractionEventInput) => void
  setSemanticFocus: (objectId: string, options?: { ttlMs?: number; confidence?: number }) => void
  invalidateSnapshot: (reason?: string) => void
  registerNode: (node: RegisteredNode) => () => void
  registerGroup: (group: RegisteredGroup) => () => void
  registerObject: (object: RegisteredVirtualObject) => () => void
  registerManifest: (id: string, manifest: AppInteractionManifest) => () => void
  registerPage: (page: RegisteredPage) => () => void
  registerActions: (registration: ActionRegistration) => () => void
}

export type InteractionApi = Pick<
  RuntimeContextValue,
  | "snapshot"
  | "lastResolution"
  | "getSnapshot"
  | "getActiveTurn"
  | "getTurn"
  | "resolveVoice"
  | "submitVoice"
  | "submitTurn"
  | "trySubmitTurn"
  | "confirmTurn"
  | "cancelTurn"
  | "resolveText"
  | "dispatchResolution"
  | "dispatchBatchResolutions"
  | "submitUtterance"
  | "recordEvent"
  | "setSemanticFocus"
  | "invalidateSnapshot"
>
