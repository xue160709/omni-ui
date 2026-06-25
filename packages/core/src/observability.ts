import type { DispatchStatus, RuntimeError } from "./command"
import type { FusionEvidenceType, InteractionTurn } from "./turn"
import type { ValidationCode } from "./types"

export type InteractionTracePhaseName =
  | "snapshot"
  | "resolve"
  | "fusion"
  | "clarification"
  | "confirmation"
  | "validation"
  | "execution"
  | "verification"

export type InteractionTrace = {
  traceId: string
  turnId: string
  source: InteractionTurn["source"]
  startedAt: number
  completedAt?: number
  phases: Array<{
    name: InteractionTracePhaseName
    startedAt: number
    endedAt?: number
    outcome?: string
  }>
  hypothesisSummaries: Array<{
    resolverId: string
    intent: string
    confidence: number
  }>
  candidateSummaries: Array<{
    targetId: string
    actionId?: string
    score: number
    evidenceTypes: FusionEvidenceType[]
  }>
  validationCodes: ValidationCode[]
  resultStatus?: DispatchStatus
}

export function createInteractionTrace(turn: InteractionTurn, now = Date.now()): InteractionTrace {
  return {
    traceId: `trace_${turn.id}_${now}`,
    turnId: turn.id,
    source: turn.source,
    startedAt: now,
    phases: [],
    hypothesisSummaries: [],
    candidateSummaries: [],
    validationCodes: [],
  }
}

export function appendTracePhase(
  trace: InteractionTrace,
  phase: InteractionTracePhaseName,
  options: { startedAt?: number; endedAt?: number; outcome?: string } = {}
): InteractionTrace {
  return {
    ...trace,
    phases: [
      ...trace.phases,
      {
        name: phase,
        startedAt: options.startedAt ?? Date.now(),
        endedAt: options.endedAt,
        outcome: options.outcome,
      },
    ],
  }
}

export function completeInteractionTrace(
  trace: InteractionTrace,
  options: { completedAt?: number; status?: DispatchStatus } = {}
): InteractionTrace {
  return {
    ...trace,
    completedAt: options.completedAt ?? Date.now(),
    resultStatus: options.status ?? trace.resultStatus,
  }
}

export function sanitizeRuntimeError(error: unknown): RuntimeError {
  if (error instanceof Error) {
    return {
      code: "execution_failed",
      message: redactSecretText(error.message),
    }
  }

  return {
    code: "execution_failed",
    message: redactSecretText(String(error)),
  }
}

function redactSecretText(value: string): string {
  return value.replace(/(authorization|api[_-]?key|token|secret|cookie)=?[^\s,;]+/gi, "$1=[redacted]")
}
