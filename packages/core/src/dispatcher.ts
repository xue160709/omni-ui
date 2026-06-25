import { actionMatchesObject } from "./action-registry"
import { confirmationGrantMatchesCommand } from "./confirmation"
import { safeParseRuntimeSchema } from "./schema"
import { validateCommandScope } from "./scope"
import {
  applyVerificationToDispatchResult,
  verifyCommandPostcondition,
} from "./verification"
import type {
  CommandEnvelope,
  ConfirmationGrant,
  DispatchResult,
} from "./command"
import type {
  ActionContext,
  ActionExecutionResult,
  ActionPayload,
  InteractionObject,
  InteractionSnapshot,
  RegisteredActionSpec,
  ResolvedInteraction,
  ValidationResult,
} from "./types"

export type PrimitiveExecutor = (
  command: Extract<CommandEnvelope, { kind: "primitive" }>,
  context: {
    target: InteractionObject
    snapshot: InteractionSnapshot
  }
) => ActionExecutionResult | Promise<ActionExecutionResult>

export type DispatchCommandOptions = {
  candidate?: ResolvedInteraction
  utterance?: string
  confirmation?: ConfirmationGrant
  executePrimitive?: PrimitiveExecutor
  getSnapshot?: () => InteractionSnapshot
  conflictLock?: CommandConflictLock
}

export async function dispatchCommand(
  snapshot: InteractionSnapshot,
  command: CommandEnvelope,
  options: DispatchCommandOptions = {}
): Promise<DispatchResult> {
  const validation = await validateCommand(snapshot, command, options)
  if (!validation.ok) {
    return createRejectedResult(command, validation)
  }

  if (command.kind === "primitive") {
    if (!options.executePrimitive) {
      return createRejectedResult(command, {
        ok: false,
        code: "unsupported_primitive",
        reason: "当前运行时没有注册 primitive executor",
      })
    }

    const target = snapshot.visibleObjects.find((object) => object.id === command.targetId)
    if (!target) {
      return createRejectedResult(command, {
        ok: false,
        code: "target_missing",
        reason: "没有找到对应的操作目标",
      })
    }

    try {
      const execution = await options.executePrimitive(command, { target, snapshot })
      return normalizeExecutionResult(command, execution)
    } catch (error) {
      return {
        ok: false,
        status: "failed",
        commandId: command.commandId,
        turnId: command.turnId,
        targetId: command.targetId,
        primitiveAction: command.primitiveAction,
        error: {
          code: "execution_failed",
          message: error instanceof Error ? error.message : "Primitive execution failed.",
          cause: error,
        },
      }
    }
  }

  const spec = snapshot.actionSpecs[command.actionId]
  const target = snapshot.visibleObjects.find((object) => object.id === command.targetId)
  if (!spec?.execute || !target) {
    return createRejectedResult(command, {
      ok: false,
      code: spec ? "execution_failed" : "missing_action",
      reason: spec ? "No executor is registered for the resolved action." : "当前页面没有注册该操作",
    })
  }
  const execute = spec.execute

  const action = buildCommandActionPayload(command, parseCommandParams(spec, command.params))
  const context: ActionContext = {
    actionId: command.actionId,
    target,
    snapshot,
    candidate: options.candidate,
    utterance: options.utterance,
  }

  try {
    const runExecution = async () => {
      const execution = await execute(action, context)
      const normalizedExecution = normalizeLegacyExecution(execution)
      const result = normalizeExecutionResult(command, normalizedExecution)

      if (
        spec.postcondition &&
        (normalizedExecution.status === "changed" || normalizedExecution.status === "unverified")
      ) {
        const after = options.getSnapshot?.() ?? snapshot
        const verification = await verifyCommandPostcondition({
          command,
          before: snapshot,
          after,
          targetBefore: target,
          execution: normalizedExecution,
          postcondition: spec.postcondition,
        })
        return applyVerificationToDispatchResult(result, verification)
      }

      return result
    }
    const conflictKey = resolveConflictKey(spec, context)
    if (conflictKey && options.conflictLock?.isLocked(conflictKey)) {
      return createRejectedResult(command, {
        ok: false,
        code: "conflict_locked",
        reason: "同一目标已有操作正在执行",
      })
    }
    return options.conflictLock
      ? await options.conflictLock.run(conflictKey, runExecution)
      : await runExecution()
  } catch (error) {
    return {
      ok: false,
      status: "failed",
      commandId: command.commandId,
      turnId: command.turnId,
      targetId: command.targetId,
      actionId: command.actionId,
      error: {
        code: "execution_failed",
        message: error instanceof Error ? error.message : "Action execution failed.",
        cause: error,
      },
    }
  }
}

export async function validateCommand(
  snapshot: InteractionSnapshot,
  command: CommandEnvelope,
  options: Pick<DispatchCommandOptions, "candidate" | "utterance" | "confirmation"> = {}
): Promise<ValidationResult> {
  const anchorValidation = validateCommandAnchor(snapshot, command)
  if (!anchorValidation.ok) return anchorValidation

  const target = snapshot.visibleObjects.find((object) => object.id === command.targetId)
  if (!target) {
    return {
      ok: false,
      code: "target_missing",
      reason: "没有找到对应的操作目标",
    }
  }

  const enabledValidation = validateTargetEnabled(target)
  if (!enabledValidation.ok) return enabledValidation

  if (command.kind === "primitive") {
    if (command.source.modelGenerated) {
      return {
        ok: false,
        code: "policy_denied",
        reason: "模型默认不能触发 primitive 操作",
      }
    }

    if (!target.primitiveActions?.includes(command.primitiveAction)) {
      return {
        ok: false,
        code: "capability_missing",
        reason: "当前目标不支持该 primitive 操作",
      }
    }
    return validateCommandScope(snapshot, target)
  }

  const spec = snapshot.actionSpecs[command.actionId]
  if (!spec) {
    return {
      ok: false,
      code: "missing_action",
      reason: "当前页面没有注册该操作",
    }
  }

  if (command.source.modelGenerated && spec.modelCallable !== true) {
    return {
      ok: false,
      code: "policy_denied",
      reason: "该操作未显式允许模型调用",
    }
  }

  if (command.source.modality === "voice" && spec.voiceCallable === false) {
    return {
      ok: false,
      code: "policy_denied",
      reason: "该操作未显式允许语音调用",
    }
  }

  if (!actionMatchesObject(spec, target)) {
    return {
      ok: false,
      code: "action_target_mismatch",
      reason: "该操作不能附着到当前目标",
    }
  }

  if (!target.actions?.includes(command.actionId)) {
    return {
      ok: false,
      code: "capability_missing",
      reason: "当前目标没有暴露该操作能力",
    }
  }

  const scopeValidation = validateCommandScope(snapshot, target, spec)
  if (!scopeValidation.ok) return scopeValidation

  if (spec.availableWhen) {
    const available = spec.availableWhen({
      actionId: spec.id,
      target,
      snapshot,
      candidate: options.candidate,
      utterance: options.utterance,
    })

    if (!available) {
      return {
        ok: false,
        code: "unavailable",
        reason: "当前目标不支持该操作",
      }
    }
  }

  if (spec.paramsSchema) {
    const parsed = safeParseRuntimeSchema(spec.paramsSchema, command.params)
    if (!parsed.success) {
      return {
        ok: false,
        code: "invalid_params",
        reason: "操作参数不符合 schema",
      }
    }
  }

  const requiresConfirmation = spec.confirmation?.required ?? spec.requiresConfirmation
  if (requiresConfirmation) {
    if (command.anchor.focusRevision !== snapshot.focusRevision) {
      return {
        ok: false,
        code: "focus_changed",
        reason: "焦点或选择已变化，请重新确认操作目标",
      }
    }
    const confirmationValidation = validateConfirmationGrant(options.confirmation, command)
    if (!confirmationValidation.ok) return confirmationValidation
  }

  if (spec.authorize) {
    const authorization = await spec.authorize({
      actionId: spec.id,
      target,
      snapshot,
      candidate: options.candidate,
      utterance: options.utterance,
    })

    if (authorization === false) {
      return {
        ok: false,
        code: "authorization_denied",
        reason: "当前策略不允许执行该操作",
      }
    }

    if (authorization && typeof authorization === "object" && "ok" in authorization) {
      return authorization
    }
  }

  return { ok: true }
}

export function validateCommandAnchor(
  snapshot: InteractionSnapshot,
  command: CommandEnvelope
): ValidationResult {
  if (!command.anchor) {
    return {
      ok: false,
      code: "missing_anchor",
      reason: "缺少原始 Snapshot anchor",
    }
  }

  if (command.anchor.stateVersion !== snapshot.stateVersion) {
    return {
      ok: false,
      code: "state_changed",
      reason: "界面状态已变化，请重新确认操作目标",
    }
  }

  if (command.anchor.contextHash !== snapshot.contextHash) {
    return {
      ok: false,
      code: "context_changed",
      reason: "界面上下文已变化，请重新确认操作目标",
    }
  }

  return { ok: true }
}

export function buildCommandActionPayload(
  command: Extract<CommandEnvelope, { kind: "domain" }>,
  params: Record<string, unknown> = command.params as Record<string, unknown>
): ActionPayload {
  return {
    type: command.actionId,
    ...params,
  }
}

export function normalizeLegacyExecution(
  execution: void | ActionExecutionResult
): ActionExecutionResult {
  return execution ?? { status: "unverified", reason: "Legacy executor returned void." }
}

export class CommandConflictLock {
  private readonly activeKeys = new Set<string>()

  isLocked(key: string): boolean {
    return this.activeKeys.has(key)
  }

  async run<T>(key: string | undefined, task: () => Promise<T> | T): Promise<T> {
    if (!key) return task()
    if (this.activeKeys.has(key)) {
      throw new Error(`Command conflict lock is already active for ${key}`)
    }

    this.activeKeys.add(key)
    try {
      return await task()
    } finally {
      this.activeKeys.delete(key)
    }
  }
}

function validateTargetEnabled(target: InteractionObject): ValidationResult {
  if (target.state?.enabled === false || target.state?.disabled === true) {
    return {
      ok: false,
      code: "target_disabled",
      reason: "当前目标不可用",
    }
  }

  return { ok: true }
}

function confirmationMatchesCommand(
  confirmation: ConfirmationGrant | undefined,
  command: CommandEnvelope
): boolean {
  return confirmationGrantMatchesCommand(confirmation, command)
}

function validateConfirmationGrant(
  confirmation: ConfirmationGrant | undefined,
  command: CommandEnvelope
): ValidationResult {
  if (!confirmation) {
    return {
      ok: false,
      code: "confirmation_required",
      reason: "该操作需要确认",
    }
  }

  if (confirmation.expiresAt && confirmation.expiresAt <= Date.now()) {
    return {
      ok: false,
      code: "confirmation_expired",
      reason: "确认已过期，请重新确认",
    }
  }

  if (!confirmationMatchesCommand(confirmation, command)) {
    return {
      ok: false,
      code: "confirmation_mismatch",
      reason: "确认内容与当前命令不匹配",
    }
  }

  return { ok: true }
}

function parseCommandParams(
  spec: RegisteredActionSpec,
  params: Readonly<Record<string, unknown>>
): Record<string, unknown> {
  if (!spec.paramsSchema) return params as Record<string, unknown>
  const parsed = safeParseRuntimeSchema(spec.paramsSchema, params)
  return parsed.success ? parsed.data : (params as Record<string, unknown>)
}

function resolveConflictKey(
  spec: RegisteredActionSpec,
  context: ActionContext
): string | undefined {
  if (typeof spec.conflictKey === "function") return spec.conflictKey(context)
  if (typeof spec.conflictKey === "string") return spec.conflictKey
  return `${spec.id}:${context.target.id}`
}

function normalizeExecutionResult(
  command: CommandEnvelope,
  execution: ActionExecutionResult
): DispatchResult {
  const base = {
    ok: execution.status !== "rejected",
    commandId: command.commandId,
    turnId: command.turnId,
    targetId: command.targetId,
    actionId: command.kind === "domain" ? command.actionId : undefined,
    primitiveAction: command.kind === "primitive" ? command.primitiveAction : undefined,
    execution,
  }

  if (execution.status === "changed") {
    return {
      ...base,
      ok: true,
      status: "committed",
    }
  }

  if (execution.status === "unverified") {
    return {
      ...base,
      ok: true,
      status: "unverified",
    }
  }

  if (execution.status === "pending") {
    return {
      ...base,
      ok: true,
      status: "pending",
    }
  }

  if (execution.status === "noop") {
    return {
      ...base,
      ok: true,
      status: "noop",
    }
  }

  if (execution.status === "failed") {
    return {
      ...base,
      ok: false,
      status: "failed",
      error: {
        code: "execution_failed",
        message: execution.reason ?? "Execution failed.",
        cause: execution.error,
      },
    }
  }

  return {
    ...base,
    ok: false,
    status: "rejected",
    error: {
      code: execution.status === "unsupported" ? "unsupported_primitive" : execution.code ?? "rejected",
      message: execution.reason,
    },
  }
}

function createRejectedResult(command: CommandEnvelope, validation: ValidationResult): DispatchResult {
  return {
    ok: false,
    status: "rejected",
    commandId: command.commandId,
    turnId: command.turnId,
    targetId: command.targetId,
    actionId: command.kind === "domain" ? command.actionId : undefined,
    primitiveAction: command.kind === "primitive" ? command.primitiveAction : undefined,
    validation,
    error: validation.ok
      ? undefined
      : {
          code: validation.code ?? "rejected",
          message: validation.reason,
        },
  }
}
