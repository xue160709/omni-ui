import type {
  ActionExecutionResult,
  ActionPostcondition,
  ActionPostconditionContext,
  InteractionObject,
  InteractionSnapshot,
  VerificationResult,
} from "./types"
import type { CommandEnvelope, DispatchResult } from "./command"

export type VerifyCommandOptions = {
  command: CommandEnvelope
  before: InteractionSnapshot
  after: InteractionSnapshot
  targetBefore: InteractionObject
  execution?: ActionExecutionResult
  postcondition?: ActionPostcondition
}

export async function verifyCommandPostcondition(
  options: VerifyCommandOptions
): Promise<VerificationResult> {
  if (!options.postcondition) return { ok: true }

  const targetAfter = options.after.visibleObjects.find(
    (object) => object.id === options.command.targetId
  )
  const context: ActionPostconditionContext = {
    command: options.command,
    before: options.before,
    after: options.after,
    targetBefore: options.targetBefore,
    targetAfter,
    execution: options.execution,
  }

  try {
    return normalizeVerificationResult(await options.postcondition(context))
  } catch (error) {
    return {
      ok: false,
      code: "verification_failed",
      reason: error instanceof Error ? error.message : "Postcondition threw an error.",
    }
  }
}

export function normalizeVerificationResult(
  result: boolean | VerificationResult
): VerificationResult {
  if (typeof result === "boolean") {
    return result
      ? { ok: true }
      : { ok: false, code: "verification_failed", reason: "Postcondition returned false." }
  }
  return result
}

export function applyVerificationToDispatchResult(
  result: DispatchResult,
  verification: VerificationResult
): DispatchResult {
  if (verification.ok) {
    return {
      ...result,
      verification,
      status: result.status === "unverified" ? "committed" : result.status,
    }
  }

  return {
    ...result,
    ok: false,
    status: "failed",
    verification,
    error: {
      code: verification.code ?? "verification_failed",
      message: verification.reason,
    },
  }
}
