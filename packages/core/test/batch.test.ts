import { describe, expect, it, vi } from "vitest"
import {
  buildBatchCommandEnvelope,
  buildCommandEnvelope,
  createInteractionSnapshot,
  createSnapshotAnchor,
  dispatchBatchCommands,
  type RegisteredActionSpec,
} from "../src"

const source = {
  modality: "assistant" as const,
  resolverIds: ["llm"],
  modelGenerated: false,
}

describe("batch dispatcher", () => {
  it("preflights every command before executing best-effort batches", async () => {
    const execute = vi.fn(() => ({ status: "changed" as const }))
    const snapshot = createBatchSnapshot(execute)
    const anchor = createSnapshotAnchor(snapshot, { capturedAt: 100 })
    const valid = buildCommandEnvelope({
      commandId: "command_1",
      turnId: "turn_1",
      kind: "domain",
      actionId: "todo.complete",
      source,
      targetId: "todo.1",
      anchor,
    })
    const invalid = buildCommandEnvelope({
      commandId: "command_2",
      turnId: "turn_1",
      kind: "domain",
      actionId: "todo.complete",
      source,
      targetId: "todo.missing",
      anchor,
    })
    const batch = buildBatchCommandEnvelope({
      batchId: "batch_1",
      turnId: "turn_1",
      mode: "best_effort",
      commands: [valid, invalid],
    })

    await expect(dispatchBatchCommands(snapshot, batch)).resolves.toMatchObject({
      ok: false,
      status: "rejected",
      items: [{ validation: { code: "target_missing" } }],
    })
    expect(execute).not.toHaveBeenCalled()
  })

  it("returns partial for best-effort execution failures", async () => {
    const execute = vi.fn((_, context) =>
      context.target.id === "todo.2"
        ? { status: "rejected" as const, reason: "already complete" }
        : { status: "changed" as const }
    )
    const snapshot = createBatchSnapshot(execute)
    const anchor = createSnapshotAnchor(snapshot, { capturedAt: 100 })
    const commands = ["todo.1", "todo.2"].map((targetId, index) =>
      buildCommandEnvelope({
        commandId: `command_${index + 1}`,
        turnId: "turn_1",
        kind: "domain",
        actionId: "todo.complete",
        source,
        targetId,
        anchor,
      })
    )
    const batch = buildBatchCommandEnvelope({
      batchId: "batch_1",
      turnId: "turn_1",
      mode: "best_effort",
      commands,
    })

    await expect(dispatchBatchCommands(snapshot, batch)).resolves.toMatchObject({
      ok: false,
      status: "partial",
      items: [{ status: "committed" }, { status: "rejected" }],
    })
  })

  it("rejects atomic batches without a transaction adapter", async () => {
    const snapshot = createBatchSnapshot(() => ({ status: "changed" as const }))
    const anchor = createSnapshotAnchor(snapshot, { capturedAt: 100 })
    const command = buildCommandEnvelope({
      commandId: "command_1",
      turnId: "turn_1",
      kind: "domain",
      actionId: "todo.complete",
      source,
      targetId: "todo.1",
      anchor,
    })
    const batch = buildBatchCommandEnvelope({
      batchId: "batch_1",
      turnId: "turn_1",
      mode: "atomic",
      commands: [command],
    })

    await expect(dispatchBatchCommands(snapshot, batch)).resolves.toMatchObject({
      ok: false,
      status: "rejected",
      items: [{ error: { code: "atomic_not_supported" } }],
    })
  })

  it("executes atomic batches through a transaction adapter", async () => {
    const execute = vi.fn(() => ({ status: "changed" as const }))
    const snapshot = createBatchSnapshot(execute)
    const anchor = createSnapshotAnchor(snapshot, { capturedAt: 100 })
    const commands = ["todo.1", "todo.2"].map((targetId, index) =>
      buildCommandEnvelope({
        commandId: `command_${index + 1}`,
        turnId: "turn_1",
        kind: "domain",
        actionId: "todo.complete",
        source,
        targetId,
        anchor,
      })
    )
    const batch = buildBatchCommandEnvelope({
      batchId: "batch_1",
      turnId: "turn_1",
      mode: "atomic",
      commands,
    })

    await expect(
      dispatchBatchCommands(snapshot, batch, {
        transaction: {
          canHandle: (items) => items.every((item) => item.kind === "domain"),
          executeAtomic: async (items) => ({
            ok: true,
            status: "committed",
            batchId: "batch_1",
            turnId: "turn_1",
            items: items.map((item) => ({
              ok: true,
              status: "committed",
              commandId: item.commandId,
              turnId: item.turnId,
              targetId: item.targetId,
              actionId: item.kind === "domain" ? item.actionId : undefined,
              execution: { status: "changed" as const },
            })),
          }),
        },
      })
    ).resolves.toMatchObject({
      ok: true,
      status: "committed",
      items: [{ status: "committed" }, { status: "committed" }],
    })
    expect(execute).not.toHaveBeenCalled()
  })
})

function createBatchSnapshot(execute: RegisteredActionSpec["execute"]) {
  return createInteractionSnapshot({
    stateVersion: 1,
    actionSpecs: {
      "todo.complete": {
        id: "todo.complete",
        attachTo: { entityType: "todo" },
        executeScope: "object",
        execute,
      },
    },
    visibleObjects: [
      {
        id: "todo.1",
        type: "composite",
        role: "list_item",
        entity: { type: "todo", id: "1" },
      },
      {
        id: "todo.2",
        type: "composite",
        role: "list_item",
        entity: { type: "todo", id: "2" },
      },
    ],
  })
}
