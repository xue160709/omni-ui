import {
  createConfirmationGrant,
  createOmniError,
  createSnapshotAnchor,
  omniErrorCodes,
  type ActionPayload,
  type CommandEnvelope,
  type CommandSource,
  type ConfirmationGrant,
  type DispatchPhaseEvent,
  type DispatchResult,
  type InteractionDecision,
  type InteractionEventType,
  type InteractionResolutionResult,
  type InteractionSnapshot,
  type InteractionSubmitOptions,
  type InteractionSubmitResult,
  type InteractionTurn,
  type OmniError,
  type ResolvedInteraction,
  type UnifiedFocus,
} from "@omni-ui/core"

export type ResolutionProvenance = NonNullable<ResolvedInteraction["provenance"]>

export function stampResolutionProvenance(
  resolution: ResolvedInteraction,
  snapshot: InteractionSnapshot,
  options: {
    turnId: string
    modality: CommandSource["modality"]
    anchor?: ResolutionProvenance["anchor"]
  }
): ResolvedInteraction {
  const resolverIds = [resolution.resolverId].filter((id): id is string => Boolean(id))
  return {
    ...resolution,
    provenance: {
      turnId: options.turnId,
      anchor: options.anchor ?? createSnapshotAnchor(snapshot),
      source: {
        modality: options.modality,
        resolverIds,
        modelGenerated: resolverIds.some(isModelResolverId),
      },
      resolvedAt: Date.now(),
    },
  }
}

export function resolutionFromTurnDecision(
  turn: InteractionTurn
): ResolvedInteraction | undefined {
  if (turn.status !== "ready" || !turn.decision) return undefined
  const resolverIds = turn.hypotheses.map((hypothesis) => hypothesis.resolverId)
  return {
    status: "resolved",
    utterance: turn.input.text,
    intent: turn.hypotheses.find((hypothesis) => hypothesis.id === turn.decision?.hypothesisId)?.intent,
    targetId: turn.decision.targetId,
    actionId: turn.decision.actionId,
    primitiveAction: turn.decision.primitiveAction,
    params: turn.decision.params,
    confidence: turn.decision.score,
    reason: "turn_decision",
    resolverId: resolverIds[0] ?? "turn",
    provenance: {
      turnId: turn.id,
      anchor: turn.anchor,
      source: {
        modality: turn.source,
        resolverIds,
        modelGenerated: turn.hypotheses.some((hypothesis) => hypothesis.source === "llm"),
      },
      resolvedAt: turn.decision.decidedAt,
    },
  }
}

export function resolveDispatchProvenance(
  resolution: ResolvedInteraction,
  snapshot: InteractionSnapshot,
  options: InteractionSubmitOptions,
  compatibility: { allowLegacyBaseStateVersion?: boolean } = {}
): ResolutionProvenance | undefined {
  if (resolution.provenance) return resolution.provenance
  if (!compatibility.allowLegacyBaseStateVersion) return undefined
  if (typeof options.baseStateVersion !== "number") return undefined

  const resolverIds = [resolution.resolverId ?? "legacy"].filter(Boolean)
  const modelGenerated = resolverIds.some(isModelResolverId)
  return {
    turnId: `legacy_${options.baseStateVersion}_${resolution.targetId ?? "unknown"}`,
    anchor: {
      ...createSnapshotAnchor(snapshot),
      stateVersion: options.baseStateVersion,
    },
    source: {
      modality: modelGenerated ? "assistant" : "text",
      resolverIds,
      modelGenerated,
    },
    resolvedAt: Date.now(),
  }
}

export function createMissingProvenanceValidation() {
  return {
    ok: false as const,
    code: "missing_provenance" as const,
    reason: omniErrorCodes.commandProvenanceInvalid,
  }
}

export function createLegacyConfirmationGrant(
  command: CommandEnvelope,
  confirmedActionId: string | undefined
): ConfirmationGrant | undefined {
  if (command.kind !== "domain" || confirmedActionId !== command.actionId) return undefined

  return createConfirmationGrant(command, {
    confirmedBy: "text",
  })
}

export function stripActionType(action: ActionPayload): Record<string, unknown> {
  const { type: _type, ...params } = action
  return params
}

export function focusSourceFromCommandSource(
  modality: CommandSource["modality"]
): NonNullable<UnifiedFocus["semanticFocus"]>["source"] {
  if (modality === "text") return "keyboard"
  return modality
}

export function toInteractionSubmitResult(input: {
  baseResult: InteractionResolutionResult
  dispatchResult: DispatchResult
  pendingCommand?: CommandEnvelope
  execution: NonNullable<InteractionSubmitResult["execution"]>
  target?: import("@omni-ui/core").InteractionObject
  action?: ActionPayload
}): InteractionSubmitResult {
  const { baseResult, dispatchResult, pendingCommand, execution, target, action } = input
  const executed = dispatchResult.ok && dispatchResult.status !== "rejected" && dispatchResult.status !== "failed"
  const validation = dispatchResult.validation
  const error =
    dispatchResult.error?.message ??
    (validation && !validation.ok ? validation.reason : undefined)

  return {
    ...baseResult,
    ok: dispatchResult.ok,
    executed,
    pendingCommand,
    dispatch: dispatchResult,
    execution: executed ? execution : undefined,
    target,
    action,
    validation,
    error,
  }
}

export function isTerminalTurnStatus(status: InteractionTurn["status"]): boolean {
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

type DispatchCompletedTurnStatus =
  | "committed"
  | "unverified"
  | "pending"
  | "noop"
  | "rejected"
  | "failed"
  | "cancelled"

export function turnStatusForDispatchResult(result: DispatchResult): DispatchCompletedTurnStatus {
  if (result.status === "committed") return "committed"
  if (result.status === "noop") return "noop"
  if (result.status === "unverified") return "unverified"
  if (result.status === "pending") return "pending"
  if (result.status === "cancelled") return "cancelled"
  if (result.status === "failed") return "failed"
  return "rejected"
}

export function dispatchLifecycleEventType(
  phaseOrResult: DispatchPhaseEvent | DispatchResult
): InteractionEventType | undefined {
  if (isDispatchResult(phaseOrResult)) {
    if (phaseOrResult.status === "committed") return "action.committed"
    if (phaseOrResult.status === "unverified") return "action.unverified"
    if (phaseOrResult.status === "pending") return "action.pending"
    if (phaseOrResult.status === "noop") return "action.noop"
    if (phaseOrResult.status === "cancelled") return "action.cancelled"
    if (phaseOrResult.status === "failed") return "action.failed"
    if (phaseOrResult.status === "confirmation_required") return "action.confirmation.required"
    if (phaseOrResult.status === "rejected") {
      const code =
        phaseOrResult.validation && !phaseOrResult.validation.ok
          ? phaseOrResult.validation.code
          : phaseOrResult.error?.code
      if (code === "confirmation_required") return "action.confirmation.required"
      if (code === "conflict_locked") return "action.conflict_locked"
      return "action.rejected"
    }
    return undefined
  }

  if (phaseOrResult.phase === "validation") {
    if (phaseOrResult.state === "started") return "action.validation.started"
    if (phaseOrResult.state === "passed") return "action.validated"
    if (phaseOrResult.state === "rejected") {
      const code =
        phaseOrResult.validation && !phaseOrResult.validation.ok
          ? phaseOrResult.validation.code
          : undefined
      if (code === "confirmation_required") return "action.confirmation.required"
      if (code === "conflict_locked") return "action.conflict_locked"
      return "action.rejected"
    }
  }

  if (phaseOrResult.phase === "execution") {
    if (phaseOrResult.state === "started") return "action.execution.started"
    if (phaseOrResult.state === "completed") return "action.execution.completed"
    if (phaseOrResult.state === "failed") return "action.execution.failed"
    if (phaseOrResult.state === "cancelled") return "action.cancelled"
  }

  if (phaseOrResult.phase === "verification") {
    if (phaseOrResult.state === "started") return "action.verification.started"
    if (phaseOrResult.state === "passed") return "action.verification.passed"
    if (phaseOrResult.state === "failed") return "action.verification.failed"
  }

  return undefined
}

export function dispatchLifecycleTargetId(
  command: CommandEnvelope,
  phaseOrResult: DispatchPhaseEvent | DispatchResult
): string {
  return isDispatchResult(phaseOrResult) ? phaseOrResult.targetId ?? command.targetId : command.targetId
}

export function dispatchLifecycleEventValue(
  phaseOrResult: DispatchPhaseEvent | DispatchResult
): Record<string, unknown> {
  if (isDispatchResult(phaseOrResult)) {
    const validationCode =
      phaseOrResult.validation && !phaseOrResult.validation.ok
        ? phaseOrResult.validation.code
        : undefined
    return {
      kind: "result",
      status: phaseOrResult.status,
      ok: phaseOrResult.ok,
      validationCode,
      executionStatus: phaseOrResult.execution?.status,
      verificationOk: phaseOrResult.verification?.ok,
    }
  }

  return {
    kind: "phase",
    phase: phaseOrResult.phase,
    state: phaseOrResult.state,
    validationCode:
      phaseOrResult.phase === "validation" &&
      phaseOrResult.validation &&
      !phaseOrResult.validation.ok
        ? phaseOrResult.validation.code
        : undefined,
    executionStatus:
      phaseOrResult.phase === "execution" ? phaseOrResult.execution?.status : undefined,
    verificationOk:
      phaseOrResult.phase === "verification" ? phaseOrResult.verification?.ok : undefined,
  }
}

function isDispatchResult(
  phaseOrResult: DispatchPhaseEvent | DispatchResult
): phaseOrResult is DispatchResult {
  return "status" in phaseOrResult && "commandId" in phaseOrResult
}

export function dispatchRuntimeError(result: DispatchResult) {
  return {
    code:
      result.error?.code ??
      (result.validation && !result.validation.ok ? result.validation.code : undefined) ??
      result.status,
    message:
      result.error?.message ??
      (result.validation && !result.validation.ok ? result.validation.reason : undefined) ??
      result.status,
  }
}

export function validateTurnSubmission(
  turnId: string,
  turn: InteractionTurn | undefined
): OmniError | undefined {
  if (!turn) {
    return createTurnSubmissionError({
      code: omniErrorCodes.turnNotFound,
      message: `Interaction turn "${turnId}" was not found.`,
      recoverable: false,
      details: { turnId },
    })
  }

  if (turn.source === "voice" && turn.input.kind !== "final") {
    return createTurnSubmissionError({
      code: omniErrorCodes.voicePartialNotSubmittable,
      message: "Voice partial turns are previews and cannot be submitted.",
      recoverable: true,
      details: {
        turnId,
        status: turn.status,
        inputKind: turn.input.kind,
      },
    })
  }

  if (isTerminalTurnStatus(turn.status)) {
    return createTurnSubmissionError({
      code: omniErrorCodes.turnTerminal,
      message: `Interaction turn "${turnId}" is already terminal.`,
      recoverable: false,
      details: {
        turnId,
        status: turn.status,
      },
    })
  }

  if (turn.status !== "ready" || !turn.decision) {
    return createTurnSubmissionError({
      code: omniErrorCodes.turnNotSubmittable,
      message: `Interaction turn "${turnId}" is not ready to submit.`,
      recoverable: true,
      details: {
        turnId,
        status: turn.status,
        hasDecision: Boolean(turn.decision),
      },
    })
  }

  return undefined
}

function createTurnSubmissionError(input: {
  code: string
  message: string
  recoverable: boolean
  details?: Record<string, unknown>
}): OmniError {
  return createOmniError({
    code: input.code,
    message: input.message,
    stage: "turn",
    recoverable: input.recoverable,
    details: input.details,
  })
}

export function normalizeSubmitTurnError(error: unknown, turnId: string): OmniError {
  if (isOmniError(error)) return error

  return createTurnSubmissionError({
    code: omniErrorCodes.executionFailed,
    message: error instanceof Error ? error.message : "Submit turn failed.",
    recoverable: false,
    details: { turnId },
  })
}

export function isOmniError(error: unknown): error is OmniError {
  if (!error || typeof error !== "object") return false
  const input = error as Partial<OmniError>
  return (
    typeof input.code === "string" &&
    typeof input.message === "string" &&
    typeof input.stage === "string" &&
    typeof input.recoverable === "boolean"
  )
}

export function withForcedDomainConfirmation(
  snapshot: InteractionSnapshot,
  actionId: string
): InteractionSnapshot {
  const spec = snapshot.actionSpecs[actionId]
  if (!spec) return snapshot

  return {
    ...snapshot,
    actionSpecs: {
      ...snapshot.actionSpecs,
      [actionId]: {
        ...spec,
        confirmation: {
          ...spec.confirmation,
          required: true,
        },
      },
    },
  }
}

export function shouldRetryConfirmedCommandAfterIrrelevantStateDrift(
  result: DispatchResult,
  snapshot: InteractionSnapshot,
  command: CommandEnvelope,
  explicitInvalidationVersions: number[]
): boolean {
  if (!result.validation || result.validation.ok || result.validation.code !== "state_changed") {
    return false
  }
  return canAcceptConfirmedCommandAfterIrrelevantStateDrift(
    snapshot,
    command,
    explicitInvalidationVersions
  )
}

export function canAcceptConfirmedCommandAfterIrrelevantStateDrift(
  snapshot: InteractionSnapshot,
  command: CommandEnvelope,
  explicitInvalidationVersions: number[]
): boolean {
  if (command.anchor.stateVersion >= snapshot.stateVersion) return false
  if (command.anchor.contextHash !== snapshot.contextHash) return false
  if (command.anchor.contextEpoch !== snapshot.contextEpoch) return false
  if (command.anchor.focusRevision !== snapshot.focusRevision) return false
  if (!snapshot.visibleObjects.some((object) => object.id === command.targetId)) return false

  return !explicitInvalidationVersions.some(
    (version) => version > command.anchor.stateVersion && version <= snapshot.stateVersion
  )
}

export function isModelResolverId(id: string): boolean {
  return /llm|model|openai|anthropic|assistant/i.test(id)
}
