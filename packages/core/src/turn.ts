import type {
  CommandEnvelope,
  ConfirmationGrant,
  DispatchPhaseEvent,
  DispatchResult,
  RuntimeError,
  SnapshotAnchor,
} from "./command"
import type { PrimitiveAction, ValidationCode } from "./types"

export type VoiceTranscriptKind = "partial" | "final"

export type VoiceToken = {
  text: string
  confidence?: number
  startMs?: number
  endMs?: number
}

export type VoiceAlternative = {
  text: string
  confidence?: number
}

export type VoiceInput = {
  kind: VoiceTranscriptKind
  text: string
  nBest?: VoiceAlternative[]
  tokens?: VoiceToken[]
  confidence?: number
  locale?: string
  sessionId?: string
  startedAt?: number
  endedAt?: number
  receivedAt: number
}

export type TextInput = {
  kind: "text"
  text: string
  receivedAt: number
}

export type TargetReference =
  | { kind: "explicit_id"; objectId: string }
  | { kind: "label"; text: string }
  | { kind: "ordinal"; index: number; scopeHint?: string }
  | { kind: "deictic"; expression: string }
  | { kind: "focused"; focus: "semantic" | "selection" | "input" }
  | { kind: "recent"; offset?: number }
  | { kind: "unspecified" }

export type SemanticIntentHypothesis = {
  id: string
  resolverId: string
  source: "rule" | "llm"
  intent: string
  actionHint?: string
  targetReference: TargetReference
  slots: Record<string, unknown>
  missingSlots?: string[]
  confidence: number
  reason?: string
  modelTargetIdHint?: string
}

export type FusionEvidenceType =
  | "explicit_id"
  | "exact_label"
  | "exact_alias"
  | "ordinal"
  | "text_contains"
  | "gui_selection"
  | "semantic_focus"
  | "input_focus"
  | "recent_gui_target"
  | "recent_committed_target"
  | "active_modal"
  | "model_suggested_target"
  | "action_compatibility"
  | "scope_penalty"
  | "disabled_penalty"
  | "stale_penalty"

export type FusionEvidence = {
  type: FusionEvidenceType
  score: number
  objectId?: string
  eventId?: string
  detail?: string
  timestamp?: number
}

export type RankedInteractionCandidate = {
  id: string
  hypothesisId: string
  targetId: string
  actionId?: string
  primitiveAction?: PrimitiveAction
  params: Record<string, unknown>
  score: number
  evidence: FusionEvidence[]
  rejected?: {
    code: ValidationCode
    reason: string
  }
}

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

export type ClarificationRequest = {
  id: string
  turnId: string
  resolutionRevision: number
  contextEpoch: number
  prompt: string
  kind?: "target" | "action" | "slot" | "context"
  candidateIds: string[]
  candidates?: RankedInteractionCandidate[]
  missingSlots?: string[]
  createdAt: number
  expiresAt?: number
}

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
  pendingCommand?: CommandEnvelope
  confirmation?: ConfirmationGrant
  result?: DispatchResult
  clarification?: ClarificationRequest
  phaseHistory: TurnPhaseRecord[]
  createdAt: number
  updatedAt: number
  expiresAt?: number
  supersededBy?: string
  error?: RuntimeError
}

export type TurnPhaseRecord = {
  name:
    | "created"
    | "listening"
    | "resolution"
    | "clarification"
    | "confirmation"
    | "validation"
    | "execution"
    | "verification"
    | "result"
    | "cancelled"
    | "superseded"
    | "expired"
  state?: string
  startedAt: number
  endedAt?: number
  outcome?: string
}

export type CreateInteractionTurnInput = {
  id: string
  source: InteractionTurn["source"]
  input: InteractionTurn["input"]
  anchor: SnapshotAnchor
  now?: number
  expiresAt?: number
}

type TurnEventPayload = {
  at?: number
  input?: InteractionTurn["input"]
  inputRevision?: number
  resolutionRevision?: number
  transcriptRevision?: VoiceInput
  hypotheses?: SemanticIntentHypothesis[]
  candidates?: RankedInteractionCandidate[]
  decision?: InteractionDecision
  dispatchPhase?: DispatchPhaseEvent
  pendingCommand?: CommandEnvelope
  confirmation?: ConfirmationGrant
  result?: DispatchResult
  clarification?: ClarificationRequest
  supersededBy?: string
  error?: RuntimeError
}

export type TurnEvent =
  | (TurnEventPayload & { type: "voice.partial"; status: "listening" })
  | (TurnEventPayload & { type: "voice.final"; status: "resolving" })
  | (TurnEventPayload & { type: "resolution.started"; status: "resolving" })
  | (TurnEventPayload & { type: "resolution.completed"; status: "ready" })
  | (TurnEventPayload & { type: "resolution.failed"; status: "rejected" | "failed" })
  | (TurnEventPayload & { type: "clarification.requested"; status: "needs_clarification" })
  | (TurnEventPayload & { type: "clarification.answered"; status: "resolving" | "ready" })
  | (TurnEventPayload & { type: "confirmation.requested"; status: "awaiting_confirmation" })
  | (TurnEventPayload & { type: "confirmation.granted"; status: "ready" })
  | (TurnEventPayload & {
      type: "dispatch.phase"
      status: "validating" | "executing" | "verifying"
    })
  | (TurnEventPayload & {
      type: "dispatch.completed"
      status: "committed" | "unverified" | "pending" | "noop" | "rejected" | "failed" | "cancelled"
    })
  | (TurnEventPayload & { type: "turn.cancelled"; status: "cancelled" })
  | (TurnEventPayload & { type: "turn.superseded"; status: "superseded" })
  | (TurnEventPayload & { type: "turn.expired"; status: "expired" })

const allowedTransitions: Record<InteractionTurnStatus, readonly InteractionTurnStatus[]> = {
  created: ["listening", "resolving", "cancelled"],
  listening: ["listening", "resolving", "cancelled", "superseded", "expired"],
  resolving: [
    "needs_clarification",
    "awaiting_confirmation",
    "ready",
    "rejected",
    "failed",
    "cancelled",
    "superseded",
  ],
  needs_clarification: ["resolving", "cancelled", "superseded", "expired"],
  awaiting_confirmation: ["ready", "cancelled", "superseded", "expired"],
  ready: ["awaiting_confirmation", "validating", "superseded", "cancelled"],
  validating: ["awaiting_confirmation", "executing", "rejected", "failed", "cancelled"],
  executing: ["verifying", "committed", "pending", "noop", "failed", "cancelled"],
  verifying: ["committed", "unverified", "pending", "noop", "failed", "cancelled"],
  committed: [],
  unverified: [],
  pending: [],
  noop: [],
  rejected: [],
  failed: [],
  cancelled: [],
  superseded: [],
  expired: [],
}

export function createInteractionTurn(input: CreateInteractionTurnInput): InteractionTurn {
  const now = input.now ?? Date.now()
  return {
    id: input.id,
    revision: 0,
    inputRevision: 0,
    resolutionRevision: 0,
    status: "created",
    source: input.source,
    input: input.input,
    anchor: input.anchor,
    contextEpoch: input.anchor.contextEpoch ?? 0,
    hypotheses: [],
    candidates: [],
    phaseHistory: [
      {
        name: "created",
        startedAt: now,
        outcome: "created",
      },
    ],
    createdAt: now,
    updatedAt: now,
    expiresAt: input.expiresAt,
  }
}

export function canTransitionTurn(
  from: InteractionTurnStatus,
  to: InteractionTurnStatus
): boolean {
  return allowedTransitions[from].includes(to)
}

export function transitionTurn(turn: InteractionTurn, event: TurnEvent): InteractionTurn {
  if (!canTransitionTurn(turn.status, event.status) && !canAppendSameStatusPhase(turn, event)) {
    throw new Error(`Illegal turn transition: ${turn.status} -> ${event.status}`)
  }

  const next: InteractionTurn = {
    ...turn,
    revision: turn.revision + 1,
    status: event.status,
    updatedAt: event.at ?? Date.now(),
  }

  if (event.input) next.input = event.input
  if (typeof event.inputRevision === "number") next.inputRevision = event.inputRevision
  if (typeof event.resolutionRevision === "number") next.resolutionRevision = event.resolutionRevision
  if (event.transcriptRevision) {
    next.transcriptRevisions = [
      ...(turn.transcriptRevisions ?? []),
      event.transcriptRevision,
    ].slice(-10)
  }
  if (event.hypotheses) next.hypotheses = event.hypotheses
  if (event.candidates) next.candidates = event.candidates
  if (event.decision) next.decision = event.decision
  if (event.pendingCommand) next.pendingCommand = event.pendingCommand
  if (event.confirmation) next.confirmation = event.confirmation
  if (event.result) next.result = event.result
  if (event.clarification) next.clarification = event.clarification
  if (event.supersededBy) next.supersededBy = event.supersededBy
  if (event.error) next.error = event.error
  next.phaseHistory = appendTurnPhase(turn, event, next)

  return next
}

function canAppendSameStatusPhase(turn: InteractionTurn, event: TurnEvent): boolean {
  return Boolean(event.dispatchPhase && turn.status === event.status)
}

export function isTerminalTurnStatus(status: InteractionTurnStatus): boolean {
  return [
    "committed",
    "unverified",
    "pending",
    "noop",
    "rejected",
    "failed",
    "cancelled",
    "superseded",
    "expired",
  ].includes(status)
}

function appendTurnPhase(
  turn: InteractionTurn,
  event: TurnEvent,
  next: InteractionTurn
): TurnPhaseRecord[] {
  const at = event.at ?? next.updatedAt
  const phase = phaseForTurnEvent(event)
  const previous = turn.phaseHistory ?? []
  if (!phase) return previous
  return [
    ...previous,
    {
      ...phase,
      startedAt: at,
    },
  ]
}

function phaseForTurnEvent(event: TurnEvent): Omit<TurnPhaseRecord, "startedAt"> | undefined {
  if (event.dispatchPhase) {
    return {
      name: event.dispatchPhase.phase,
      state: event.dispatchPhase.state,
      outcome: event.dispatchPhase.state,
      endedAt: event.dispatchPhase.state === "started" ? undefined : event.dispatchPhase.at,
    }
  }

  if (event.status === "listening") return { name: "listening", outcome: event.status }
  if (event.status === "resolving") return { name: "resolution", outcome: event.status }
  if (event.status === "needs_clarification") return { name: "clarification", outcome: event.status }
  if (event.status === "awaiting_confirmation") return { name: "confirmation", outcome: event.status }
  if (event.status === "validating") return { name: "validation", outcome: event.status }
  if (event.status === "executing") return { name: "execution", outcome: event.status }
  if (event.status === "verifying") return { name: "verification", outcome: event.status }
  if (event.status === "cancelled") return { name: "cancelled", outcome: event.error?.message ?? event.status }
  if (event.status === "superseded") return { name: "superseded", outcome: event.supersededBy ?? event.status }
  if (event.status === "expired") return { name: "expired", outcome: event.status }
  if (isTerminalTurnStatus(event.status)) return { name: "result", outcome: event.status }
  return undefined
}
