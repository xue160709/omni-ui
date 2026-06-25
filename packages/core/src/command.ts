import type {
  ActionExecutionResult,
  InteractionObject,
  InteractionSnapshot,
  PrimitiveAction,
  PrimitiveActionId,
  ValidationResult,
  VerificationResult,
} from "./types"
import { normalizePrimitiveAction } from "./primitive"
import type { InteractionDecision, InteractionTurn } from "./turn"

export type SnapshotAnchor = {
  snapshotId: string
  stateVersion: number
  contextHash: string
  contextEpoch: number
  focusRevision: number
  capturedAt: number
}

export type CommandSource = {
  modality: "voice" | "assistant" | "text"
  resolverIds: string[]
  modelGenerated: boolean
}

export type DecisionBinding = {
  canonical: string
  fingerprint: string
}

export type BaseCommandEnvelope = {
  commandId: string
  turnId: string
  candidateId?: string
  decisionFingerprint?: string
  source: CommandSource
  targetId: string
  params: Readonly<Record<string, unknown>>
  anchor: SnapshotAnchor
  decisionBinding: DecisionBinding
  createdAt: number
}

export type DomainCommandEnvelope = BaseCommandEnvelope & {
  kind: "domain"
  actionId: string
}

export type PrimitiveCommandEnvelope = BaseCommandEnvelope & {
  kind: "primitive"
  primitiveAction: PrimitiveActionId
}

export type CommandEnvelope = DomainCommandEnvelope | PrimitiveCommandEnvelope

export type BuildCommandEnvelopeInput = {
  commandId: string
  turnId: string
  candidateId?: string
  source: CommandSource
  targetId: string
  params?: Record<string, unknown>
  anchor: SnapshotAnchor
  createdAt?: number
} & (
  | {
      kind: "domain"
      actionId: string
    }
  | {
      kind: "primitive"
      primitiveAction: PrimitiveAction
    }
)

export type DispatchStatus =
  | "committed"
  | "unverified"
  | "pending"
  | "noop"
  | "rejected"
  | "failed"
  | "cancelled"
  | "confirmation_required"

export type DispatchPhaseEvent =
  | {
      phase: "validation"
      state: "started" | "passed" | "rejected"
      at: number
      validation?: ValidationResult
    }
  | {
      phase: "execution"
      state: "started" | "completed" | "failed" | "cancelled"
      at: number
      execution?: ActionExecutionResult
    }
  | {
      phase: "verification"
      state: "started" | "passed" | "failed"
      at: number
      verification?: VerificationResult
    }

export type RuntimeError = {
  code: string
  message: string
  cause?: unknown
}

export type DispatchResult = {
  ok: boolean
  status: DispatchStatus
  commandId: string
  turnId: string
  targetId?: string
  actionId?: string
  primitiveAction?: PrimitiveActionId
  validation?: ValidationResult
  execution?: ActionExecutionResult
  verification?: VerificationResult
  error?: RuntimeError
}

export type ConfirmationGrant = {
  grantId?: string
  turnId: string
  commandId: string
  decisionBinding: DecisionBinding
  bindingCanonical?: string
  bindingFingerprint?: string
  nonce?: string
  issuedAt?: number
  grantedAt: number
  expiresAt?: number
  confirmedBy?: "voice" | "assistant" | "text" | "gui"
}

export class CommandSerializationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "CommandSerializationError"
  }
}

export function createSnapshotAnchor(
  snapshot: InteractionSnapshot,
  options: {
    contextHash?: string
    focusRevision?: number
    capturedAt?: number
  } = {}
): SnapshotAnchor {
  return {
    snapshotId: snapshot.snapshotId,
    stateVersion: snapshot.stateVersion,
    contextHash: options.contextHash ?? snapshot.contextHash ?? createContextHash(snapshot),
    contextEpoch: snapshot.contextEpoch,
    focusRevision: options.focusRevision ?? snapshot.focusRevision ?? 0,
    capturedAt: options.capturedAt ?? Date.now(),
  }
}

export function buildCommandEnvelope(input: BuildCommandEnvelopeInput): CommandEnvelope {
  const params = cloneSerializableCommandParams(input.params ?? {})
  const createdAt = input.createdAt ?? Date.now()

  if (input.kind === "domain") {
    const decisionBinding = createDecisionBinding({
      turnId: input.turnId,
      kind: input.kind,
      targetId: input.targetId,
      actionIdOrPrimitive: input.actionId,
      params,
      anchor: input.anchor,
    })
    const command: DomainCommandEnvelope = {
      commandId: input.commandId,
      turnId: input.turnId,
      candidateId: input.candidateId,
      decisionFingerprint: decisionBinding.fingerprint,
      source: deepFreeze(cloneSerializableValue(input.source, "source") as CommandSource),
      targetId: input.targetId,
      params: deepFreeze(params),
      anchor: deepFreeze({ ...input.anchor }),
      decisionBinding,
      createdAt,
      kind: "domain",
      actionId: input.actionId,
    }
    return deepFreeze(command)
  }

  const primitiveAction = normalizePrimitiveAction(input.primitiveAction)
  const decisionBinding = createDecisionBinding({
    turnId: input.turnId,
    kind: input.kind,
    targetId: input.targetId,
    actionIdOrPrimitive: primitiveAction,
    params,
    anchor: input.anchor,
  })

  const command: PrimitiveCommandEnvelope = {
    commandId: input.commandId,
    turnId: input.turnId,
    candidateId: input.candidateId,
    decisionFingerprint: decisionBinding.fingerprint,
    source: deepFreeze(cloneSerializableValue(input.source, "source") as CommandSource),
    targetId: input.targetId,
    params: deepFreeze(params),
    anchor: deepFreeze({ ...input.anchor }),
    decisionBinding,
    createdAt,
    kind: "primitive",
    primitiveAction,
  }

  return deepFreeze(command)
}

export function createDecisionBinding(input: {
  turnId: string
  kind: CommandEnvelope["kind"]
  targetId: string
  actionIdOrPrimitive: string
  params: Record<string, unknown>
    anchor: Pick<SnapshotAnchor, "stateVersion" | "contextHash" | "focusRevision">
}): DecisionBinding {
  const canonical = stableStringify({
    turnId: input.turnId,
    kind: input.kind,
    targetId: input.targetId,
    actionIdOrPrimitive: input.actionIdOrPrimitive,
    params: input.params,
      anchor: {
        stateVersion: input.anchor.stateVersion,
        contextHash: input.anchor.contextHash,
        contextEpoch: "contextEpoch" in input.anchor ? input.anchor.contextEpoch : 0,
        focusRevision: input.anchor.focusRevision,
      },
  })

  return {
    canonical,
    fingerprint: fingerprint(canonical),
  }
}

export function buildCommandFromTurnDecision(input: {
  commandId: string
  turn: InteractionTurn
  snapshot: InteractionSnapshot
  source?: CommandSource
  createdAt?: number
}): CommandEnvelope {
  const { turn } = input
  const decision = turn.decision
  if (turn.status !== "ready") {
    throw new Error(`Cannot build a command from a ${turn.status} turn.`)
  }
  if (!decision) {
    throw new Error("Cannot build a command without a turn decision.")
  }
  if (decision.contextEpoch !== undefined && decision.contextEpoch !== turn.contextEpoch) {
    throw new Error("Cannot build a command from a stale decision context epoch.")
  }
  if (!decision.actionId && !decision.primitiveAction) {
    throw new Error("Cannot build a command without a domain or primitive action.")
  }
  if (input.snapshot.contextEpoch !== turn.contextEpoch) {
    throw new Error("Cannot build a command after the context epoch changed.")
  }

  const source =
    input.source ??
    ({
      modality: turn.source,
      resolverIds: uniqueResolverIds(turn, decision),
      modelGenerated: turn.hypotheses.some((hypothesis) => hypothesis.source === "llm"),
    } satisfies CommandSource)

  if (decision.actionId) {
    return buildCommandEnvelope({
      commandId: input.commandId,
      turnId: turn.id,
      candidateId: decision.candidateId,
      kind: "domain",
      actionId: decision.actionId,
      targetId: decision.targetId,
      params: decision.params,
      source,
      anchor: turn.anchor,
      createdAt: input.createdAt,
    })
  }

  return buildCommandEnvelope({
    commandId: input.commandId,
    turnId: turn.id,
    candidateId: decision.candidateId,
    kind: "primitive",
    primitiveAction: decision.primitiveAction!,
    targetId: decision.targetId,
    params: decision.params,
    source,
    anchor: turn.anchor,
    createdAt: input.createdAt,
  })
}

function uniqueResolverIds(turn: InteractionTurn, decision: InteractionDecision): string[] {
  const ids = new Set<string>()
  const hypothesis = turn.hypotheses.find((item) => item.id === decision.hypothesisId)
  if (hypothesis?.resolverId) ids.add(hypothesis.resolverId)
  turn.hypotheses.forEach((item) => ids.add(item.resolverId))
  return [...ids]
}

export function cloneSerializableCommandParams(
  params: Record<string, unknown>
): Record<string, unknown> {
  const cloned = cloneSerializableValue(params, "params")
  if (!isPlainRecord(cloned)) {
    throw new CommandSerializationError("Command params must be a plain object.")
  }
  return cloned
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(cloneSerializableValue(value, "$"))
}

export function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value

  Object.freeze(value)
  Object.values(value as Record<string, unknown>).forEach((item) => {
    deepFreeze(item)
  })

  return value
}

function createContextHash(snapshot: InteractionSnapshot): string {
  return fingerprint(
    stableStringify({
      contextStack: snapshot.contextStack,
      pageId: snapshot.page?.id,
      focusObjectId: snapshot.focus?.objectId,
    })
  )
}

function cloneSerializableValue(
  value: unknown,
  path: string,
  seen = new WeakSet<object>()
): unknown {
  if (value == null) return value

  if (typeof value === "string" || typeof value === "boolean") return value

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new CommandSerializationError(`${path} must be a finite number.`)
    }
    return value
  }

  if (
    typeof value === "function" ||
    typeof value === "symbol" ||
    typeof value === "bigint" ||
    typeof value === "undefined"
  ) {
    throw new CommandSerializationError(`${path} is not serializable.`)
  }

  if (value instanceof Date) return value.toISOString()

  if (Array.isArray(value)) {
    if (seen.has(value)) {
      throw new CommandSerializationError(`${path} contains a circular reference.`)
    }
    seen.add(value)
    const output = value.map((item, index) =>
      cloneSerializableValue(item, `${path}[${index}]`, seen)
    )
    seen.delete(value)
    return output
  }

  if (typeof value === "object") {
    if (!isPlainRecord(value)) {
      throw new CommandSerializationError(`${path} must contain only plain JSON objects.`)
    }
    if (seen.has(value)) {
      throw new CommandSerializationError(`${path} contains a circular reference.`)
    }
    seen.add(value)
    const output: Record<string, unknown> = {}
    Object.keys(value)
      .sort()
      .forEach((key) => {
        output[key] = cloneSerializableValue(
          (value as Record<string, unknown>)[key],
          `${path}.${key}`,
          seen
        )
      })
    seen.delete(value)
    return output
  }

  throw new CommandSerializationError(`${path} is not serializable.`)
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function fingerprint(value: string): string {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

export type CommandTargetSnapshot = {
  before: InteractionSnapshot
  after?: InteractionSnapshot
  targetBefore: InteractionObject
  targetAfter?: InteractionObject
}
