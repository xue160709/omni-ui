import type {
  CommandEnvelope,
  ConfirmationGrant,
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
  targetId: string
  actionId?: string
  primitiveAction?: PrimitiveAction
  params: Record<string, unknown>
  score: number
  confidenceMargin: number
  evidence: FusionEvidence[]
}

export type ClarificationRequest = {
  id: string
  prompt: string
  candidates?: RankedInteractionCandidate[]
  createdAt: number
}

export type InteractionTurnStatus =
  | "created"
  | "resolving"
  | "needs_clarification"
  | "awaiting_confirmation"
  | "ready"
  | "validating"
  | "executing"
  | "verifying"
  | "committed"
  | "unverified"
  | "noop"
  | "rejected"
  | "failed"
  | "cancelled"
  | "superseded"
  | "expired"

export type InteractionTurn = {
  id: string
  revision: number
  status: InteractionTurnStatus
  source: "voice" | "assistant" | "text"
  input: VoiceInput | TextInput
  anchor: SnapshotAnchor
  hypotheses: SemanticIntentHypothesis[]
  candidates: RankedInteractionCandidate[]
  decision?: InteractionDecision
  pendingCommand?: CommandEnvelope
  confirmation?: ConfirmationGrant
  result?: DispatchResult
  clarification?: ClarificationRequest
  createdAt: number
  updatedAt: number
  expiresAt?: number
  supersededBy?: string
  error?: RuntimeError
}

export type CreateInteractionTurnInput = {
  id: string
  source: InteractionTurn["source"]
  input: InteractionTurn["input"]
  anchor: SnapshotAnchor
  now?: number
  expiresAt?: number
}

export type TurnEvent = {
  type: "transition"
  status: InteractionTurnStatus
  at?: number
  hypotheses?: SemanticIntentHypothesis[]
  candidates?: RankedInteractionCandidate[]
  decision?: InteractionDecision
  pendingCommand?: CommandEnvelope
  confirmation?: ConfirmationGrant
  result?: DispatchResult
  clarification?: ClarificationRequest
  supersededBy?: string
  error?: RuntimeError
}

const allowedTransitions: Record<InteractionTurnStatus, readonly InteractionTurnStatus[]> = {
  created: ["resolving", "cancelled"],
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
  ready: ["awaiting_confirmation", "validating", "superseded"],
  validating: ["executing", "rejected"],
  executing: ["verifying", "failed"],
  verifying: ["committed", "unverified", "noop", "failed"],
  committed: [],
  unverified: [],
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
    status: "created",
    source: input.source,
    input: input.input,
    anchor: input.anchor,
    hypotheses: [],
    candidates: [],
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
  if (!canTransitionTurn(turn.status, event.status)) {
    throw new Error(`Illegal turn transition: ${turn.status} -> ${event.status}`)
  }

  const next: InteractionTurn = {
    ...turn,
    revision: turn.revision + 1,
    status: event.status,
    updatedAt: event.at ?? Date.now(),
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

  return next
}
