import { createDecisionBinding, stableStringify, type CommandEnvelope, type DecisionBinding, type DispatchResult } from "./command"
import { dispatchCommand, validateCommand, type DispatchCommandOptions } from "./dispatcher"

export type BatchMode = "atomic" | "best_effort"

export type BatchCommandEnvelope = {
  batchId: string
  turnId: string
  mode: BatchMode
  commands: CommandEnvelope[]
  binding: DecisionBinding
}

export type BatchDispatchStatus = "committed" | "partial" | "rejected" | "failed"

export type BatchDispatchResult = {
  ok: boolean
  status: BatchDispatchStatus
  batchId: string
  turnId: string
  items: DispatchResult[]
}

export interface ActionTransactionAdapter {
  canHandle(commands: CommandEnvelope[]): boolean
  executeAtomic(commands: CommandEnvelope[]): Promise<BatchDispatchResult>
}

export function buildBatchCommandEnvelope(input: {
  batchId: string
  turnId: string
  mode: BatchMode
  commands: CommandEnvelope[]
}): BatchCommandEnvelope {
  const canonical = stableStringify({
    turnId: input.turnId,
    mode: input.mode,
    commands: input.commands.map((command) => command.decisionBinding.canonical),
  })

  return {
    ...input,
    binding: {
      canonical,
      fingerprint: createDecisionBinding({
        turnId: input.turnId,
        kind: "domain",
        targetId: input.batchId,
        actionIdOrPrimitive: "batch",
        params: { canonical },
        anchor: input.commands[0]?.anchor ?? {
          stateVersion: 0,
          contextHash: "empty",
          focusRevision: 0,
        },
      }).fingerprint,
    },
  }
}

export async function dispatchBatchCommands(
  snapshot: Parameters<typeof validateCommand>[0],
  batch: BatchCommandEnvelope,
  options: DispatchCommandOptions & { transaction?: ActionTransactionAdapter } = {}
): Promise<BatchDispatchResult> {
  const preflight: DispatchResult[] = []

  for (const command of batch.commands) {
    const validation = await validateCommand(snapshot, command, options)
    if (!validation.ok) {
      preflight.push({
        ok: false,
        status: "rejected",
        commandId: command.commandId,
        turnId: command.turnId,
        targetId: command.targetId,
        actionId: command.kind === "domain" ? command.actionId : undefined,
        primitiveAction: command.kind === "primitive" ? command.primitiveAction : undefined,
        validation,
        error: {
          code: validation.code ?? "rejected",
          message: validation.reason,
        },
      })
    }
  }

  if (preflight.length > 0) {
    return {
      ok: false,
      status: "rejected",
      batchId: batch.batchId,
      turnId: batch.turnId,
      items: preflight,
    }
  }

  if (batch.mode === "atomic") {
    if (!options.transaction?.canHandle(batch.commands)) {
      return {
        ok: false,
        status: "rejected",
        batchId: batch.batchId,
        turnId: batch.turnId,
        items: batch.commands.map((command) => ({
          ok: false,
          status: "rejected",
          commandId: command.commandId,
          turnId: command.turnId,
          targetId: command.targetId,
          actionId: command.kind === "domain" ? command.actionId : undefined,
          primitiveAction: command.kind === "primitive" ? command.primitiveAction : undefined,
          error: {
            code: "atomic_not_supported",
            message: "Atomic batch execution requires a transaction adapter.",
          },
        })),
      }
    }

    return options.transaction.executeAtomic(batch.commands)
  }

  const items: DispatchResult[] = []
  for (const command of batch.commands) {
    items.push(await dispatchCommand(snapshot, command, options))
  }

  const ok = items.every((item) => item.ok)
  return {
    ok,
    status: ok ? "committed" : "partial",
    batchId: batch.batchId,
    turnId: batch.turnId,
    items,
  }
}
