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
    phases: inferTracePhases(turn, now),
    hypothesisSummaries: turn.hypotheses.map((hypothesis) => ({
      resolverId: hypothesis.resolverId,
      intent: hypothesis.intent,
      confidence: hypothesis.confidence,
    })),
    candidateSummaries: turn.candidates.map((candidate) => ({
      targetId: candidate.targetId,
      actionId: candidate.actionId ?? candidate.primitiveAction,
      score: candidate.score,
      evidenceTypes: candidate.evidence.map((item) => item.type),
    })),
    validationCodes:
      turn.result?.validation && !turn.result.validation.ok && turn.result.validation.code
        ? [turn.result.validation.code]
        : [],
    resultStatus: turn.result?.status,
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

function inferTracePhases(
  turn: InteractionTurn,
  now: number
): InteractionTrace["phases"] {
  const phases: InteractionTrace["phases"] = []

  if (turn.updatedAt >= turn.createdAt) {
    phases.push({
      name: "resolve",
      startedAt: turn.createdAt,
      endedAt: ["created", "resolving"].includes(turn.status) ? undefined : turn.updatedAt,
      outcome: turn.status,
    })
  }

  if (turn.status === "needs_clarification" || turn.clarification) {
    phases.push({
      name: "clarification",
      startedAt: turn.updatedAt,
      outcome: turn.clarification?.prompt,
    })
  }

  if (turn.status === "awaiting_confirmation" || turn.pendingCommand || turn.confirmation) {
    phases.push({
      name: "confirmation",
      startedAt: turn.updatedAt,
      outcome: turn.status,
    })
  }

  if (turn.result) {
    phases.push({
      name: "validation",
      startedAt: turn.updatedAt,
      endedAt: now,
      outcome:
        turn.result.validation && !turn.result.validation.ok
          ? turn.result.validation.code
          : "ok",
    })
    if (turn.result.execution) {
      phases.push({
        name: "execution",
        startedAt: turn.updatedAt,
        endedAt: now,
        outcome: turn.result.execution.status,
      })
    }
    if (turn.result.verification) {
      phases.push({
        name: "verification",
        startedAt: turn.updatedAt,
        endedAt: now,
        outcome: turn.result.verification.ok ? "ok" : turn.result.verification.code,
      })
    }
  }

  return phases
}
