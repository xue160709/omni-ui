import { describe, expect, it, vi } from "vitest"
import {
  buildCommandEnvelope,
  createInteractionSnapshot,
  createSnapshotAnchor,
  dispatchCommand,
  validateCommand,
  type RegisteredActionSpec,
  type InteractionSnapshot,
} from "../src"

const source = {
  modality: "text" as const,
  resolverIds: ["rule"],
  modelGenerated: false,
}

function anchorFor(snapshot: InteractionSnapshot, stateVersion = snapshot.stateVersion) {
  return {
    ...createSnapshotAnchor(snapshot, { capturedAt: 100 }),
    stateVersion,
  }
}

describe("dispatcher", () => {
  it("rejects domain commands when the action does not attach to the target", async () => {
    const execute = vi.fn()
    const snapshot = createInteractionSnapshot({
      stateVersion: 1,
      actionSpecs: {
        "task.complete": {
          id: "task.complete",
          attachTo: { entityType: "task" },
          executeScope: "object",
          execute,
        },
      },
      visibleObjects: [
        {
          id: "note.item.note_1",
          type: "composite",
          role: "list_item",
          label: "笔记",
          entity: { type: "note", id: "note_1" },
          actions: ["task.complete"],
        },
      ],
    })
    const command = buildCommandEnvelope({
      commandId: "command_1",
      turnId: "turn_1",
      kind: "domain",
      actionId: "task.complete",
      source,
      targetId: "note.item.note_1",
      anchor: anchorFor(snapshot),
    })

    await expect(dispatchCommand(snapshot, command)).resolves.toMatchObject({
      ok: false,
      status: "rejected",
      validation: { code: "action_target_mismatch" },
    })
    expect(execute).not.toHaveBeenCalled()
  })

  it("can accept explicitly allowed irrelevant anchor state drift", async () => {
    const snapshot = createInteractionSnapshot({
      stateVersion: 1,
      actionSpecs: {
        "task.complete": {
          id: "task.complete",
          attachTo: { entityType: "task" },
          executeScope: "object",
          execute: vi.fn(),
        },
      },
      visibleObjects: [
        {
          id: "task.item.task_1",
          type: "composite",
          role: "list_item",
          label: "评审方案",
          entity: { type: "task", id: "task_1" },
          actions: ["task.complete"],
        },
      ],
    })
    const nextSnapshot = {
      ...snapshot,
      stateVersion: 2,
    }
    const command = buildCommandEnvelope({
      commandId: "command_1",
      turnId: "turn_1",
      kind: "domain",
      actionId: "task.complete",
      source,
      targetId: "task.item.task_1",
      anchor: anchorFor(snapshot),
    })

    await expect(validateCommand(nextSnapshot, command)).resolves.toMatchObject({
      ok: false,
      code: "state_changed",
    })
    await expect(
      validateCommand(nextSnapshot, command, {
        allowIrrelevantAnchorStateDrift: true,
      })
    ).resolves.toEqual({ ok: true })
  })

  it("does not let legacy state drift allowance override explicit strict stalePolicy", async () => {
    const snapshot = createInteractionSnapshot({
      stateVersion: 1,
      actionSpecs: {
        "task.complete": {
          id: "task.complete",
          attachTo: { entityType: "task" },
          executeScope: "object",
          stalePolicy: { mode: "strict" },
          execute: vi.fn(),
        },
      },
      visibleObjects: [
        {
          id: "task.item.task_1",
          type: "composite",
          role: "list_item",
          label: "评审方案",
          entity: { type: "task", id: "task_1" },
        },
      ],
    })
    const command = buildCommandEnvelope({
      commandId: "command_1",
      turnId: "turn_1",
      kind: "domain",
      actionId: "task.complete",
      source,
      targetId: "task.item.task_1",
      anchor: anchorFor(snapshot),
    })

    await expect(
      validateCommand(
        {
          ...snapshot,
          stateVersion: 2,
        },
        command,
        {
          allowIrrelevantAnchorStateDrift: true,
        }
      )
    ).resolves.toMatchObject({
      ok: false,
      code: "state_changed",
    })
  })

  it("revalidates state drift when declared stateKeys are unchanged", async () => {
    const snapshot = createInteractionSnapshot({
      stateVersion: 1,
      actionSpecs: {
        "task.complete": {
          id: "task.complete",
          attachTo: { entityType: "task" },
          executeScope: "object",
          stalePolicy: { mode: "revalidate", stateKeys: ["status"] },
          execute: vi.fn(),
        },
      },
      visibleObjects: [
        {
          id: "task.item.task_1",
          type: "composite",
          role: "list_item",
          label: "评审方案",
          entity: { type: "task", id: "task_1" },
          state: { status: "open", updatedLabel: "旧标题" },
        },
      ],
    })
    const command = buildCommandEnvelope({
      commandId: "command_1",
      turnId: "turn_1",
      kind: "domain",
      actionId: "task.complete",
      source,
      targetId: "task.item.task_1",
      anchor: anchorFor(snapshot),
    })
    const nextSnapshot = {
      ...snapshot,
      stateVersion: 2,
      visibleObjects: snapshot.visibleObjects.map((object) =>
        object.id === "task.item.task_1"
          ? { ...object, state: { ...object.state, updatedLabel: "新标题" } }
          : object
      ),
    }

    await expect(validateCommand(nextSnapshot, command)).resolves.toEqual({ ok: true })
  })

  it("rejects revalidated state drift when declared stateKeys changed", async () => {
    const snapshot = createInteractionSnapshot({
      stateVersion: 1,
      actionSpecs: {
        "task.complete": {
          id: "task.complete",
          attachTo: { entityType: "task" },
          executeScope: "object",
          stalePolicy: { mode: "revalidate", stateKeys: ["status"] },
          execute: vi.fn(),
        },
      },
      visibleObjects: [
        {
          id: "task.item.task_1",
          type: "composite",
          role: "list_item",
          label: "评审方案",
          entity: { type: "task", id: "task_1" },
          state: { status: "open" },
        },
      ],
    })
    const command = buildCommandEnvelope({
      commandId: "command_1",
      turnId: "turn_1",
      kind: "domain",
      actionId: "task.complete",
      source,
      targetId: "task.item.task_1",
      anchor: anchorFor(snapshot),
    })
    const nextSnapshot = {
      ...snapshot,
      stateVersion: 2,
      visibleObjects: snapshot.visibleObjects.map((object) =>
        object.id === "task.item.task_1"
          ? { ...object, state: { ...object.state, status: "done" } }
          : object
      ),
    }

    await expect(validateCommand(nextSnapshot, command)).resolves.toMatchObject({
      ok: false,
      code: "state_changed",
    })
  })

  it("rejects revalidated state drift when the context epoch changed", async () => {
    const snapshot = createInteractionSnapshot({
      stateVersion: 1,
      contextEpoch: 1,
      actionSpecs: {
        "task.complete": {
          id: "task.complete",
          attachTo: { entityType: "task" },
          executeScope: "object",
          stalePolicy: { mode: "revalidate", stateKeys: ["status"] },
          execute: vi.fn(),
        },
      },
      visibleObjects: [
        {
          id: "task.item.task_1",
          type: "composite",
          role: "list_item",
          label: "评审方案",
          entity: { type: "task", id: "task_1" },
          state: { status: "open" },
        },
      ],
    })
    const command = buildCommandEnvelope({
      commandId: "command_1",
      turnId: "turn_1",
      kind: "domain",
      actionId: "task.complete",
      source,
      targetId: "task.item.task_1",
      anchor: anchorFor(snapshot),
    })

    await expect(
      validateCommand(
        {
          ...snapshot,
          stateVersion: 2,
          contextEpoch: 2,
        },
        command
      )
    ).resolves.toMatchObject({
      ok: false,
      code: "context_changed",
    })
  })

  it("rejects domain commands when the target did not expose the action capability", async () => {
    const actionSpecs: Record<string, RegisteredActionSpec> = {
      "task.complete": {
        id: "task.complete",
        attachTo: { entityType: "task" },
        executeScope: "object",
        availableWhen: () => false,
        execute: vi.fn(),
      },
    }
    const snapshot = createInteractionSnapshot({
      stateVersion: 1,
      actionSpecs,
      visibleObjects: [
        {
          id: "task.item.task_1",
          type: "composite",
          role: "list_item",
          label: "评审方案",
          entity: { type: "task", id: "task_1" },
        },
      ],
    })
    const command = buildCommandEnvelope({
      commandId: "command_1",
      turnId: "turn_1",
      kind: "domain",
      actionId: "task.complete",
      source,
      targetId: "task.item.task_1",
      anchor: anchorFor(snapshot),
    })

    await expect(validateCommand(snapshot, command)).resolves.toMatchObject({
      ok: false,
      code: "capability_missing",
    })
  })

  it("validates command params with RuntimeSchema before execution", async () => {
    const execute = vi.fn()
    const snapshot = createInteractionSnapshot({
      stateVersion: 1,
      actionSpecs: {
        "task.complete": {
          id: "task.complete",
          attachTo: { entityType: "task" },
          executeScope: "object",
          paramsSchema: {
            safeParse(input) {
              const value = input as Record<string, unknown>
              return typeof value.taskId === "string"
                ? { success: true, data: { taskId: value.taskId } }
                : { success: false, error: "taskId must be a string" }
            },
          },
          execute,
        },
      },
      visibleObjects: [
        {
          id: "task.item.task_1",
          type: "composite",
          role: "list_item",
          label: "评审方案",
          entity: { type: "task", id: "task_1" },
        },
      ],
    })
    const command = buildCommandEnvelope({
      commandId: "command_1",
      turnId: "turn_1",
      kind: "domain",
      actionId: "task.complete",
      source,
      targetId: "task.item.task_1",
      params: { taskId: 123 },
      anchor: anchorFor(snapshot),
    })

    await expect(dispatchCommand(snapshot, command)).resolves.toMatchObject({
      ok: false,
      validation: { code: "invalid_params" },
    })
    expect(execute).not.toHaveBeenCalled()
  })

  it("routes primitive commands through the same anchor and capability validation", async () => {
    const executePrimitive = vi.fn(() => ({ status: "changed" as const }))
    const snapshot = createInteractionSnapshot({
      stateVersion: 2,
      visibleObjects: [
        {
          id: "dom.button.add",
          type: "raw",
          role: "button",
          label: "添加",
          primitiveActions: ["press"],
        },
      ],
    })
    const command = buildCommandEnvelope({
      commandId: "command_1",
      turnId: "turn_1",
      kind: "primitive",
      primitiveAction: "press",
      source,
      targetId: "dom.button.add",
      anchor: anchorFor(snapshot),
    })

    await expect(dispatchCommand(snapshot, command, { executePrimitive })).resolves.toMatchObject({
      ok: true,
      status: "committed",
      primitiveAction: "press",
    })
    expect(executePrimitive).toHaveBeenCalledTimes(1)
  })

  it("keeps primitive commands strict even when legacy state drift is allowed", async () => {
    const snapshot = createInteractionSnapshot({
      stateVersion: 1,
      visibleObjects: [
        {
          id: "dom.button.add",
          type: "raw",
          role: "button",
          label: "添加",
          primitiveActions: ["press"],
        },
      ],
    })
    const command = buildCommandEnvelope({
      commandId: "command_1",
      turnId: "turn_1",
      kind: "primitive",
      primitiveAction: "press",
      source,
      targetId: "dom.button.add",
      anchor: anchorFor(snapshot),
    })

    await expect(
      validateCommand(
        {
          ...snapshot,
          stateVersion: 2,
        },
        command,
        {
          allowIrrelevantAnchorStateDrift: true,
        }
      )
    ).resolves.toMatchObject({
      ok: false,
      code: "state_changed",
    })
  })

  it("rejects stale command anchors before execution", async () => {
    const execute = vi.fn()
    const snapshot = createInteractionSnapshot({
      stateVersion: 2,
      actionSpecs: {
        "task.complete": {
          id: "task.complete",
          attachTo: { entityType: "task" },
          executeScope: "object",
          execute,
        },
      },
      visibleObjects: [
        {
          id: "task.item.task_1",
          type: "composite",
          role: "list_item",
          label: "评审方案",
          entity: { type: "task", id: "task_1" },
        },
      ],
    })
    const command = buildCommandEnvelope({
      commandId: "command_1",
      turnId: "turn_1",
      kind: "domain",
      actionId: "task.complete",
      source,
      targetId: "task.item.task_1",
      anchor: anchorFor(snapshot, 1),
    })

    await expect(dispatchCommand(snapshot, command)).resolves.toMatchObject({
      ok: false,
      validation: { code: "state_changed" },
    })
    expect(execute).not.toHaveBeenCalled()
  })

  it("publishes realtime validation, execution, and verification phases", async () => {
    const phases: string[] = []
    const snapshot = createInteractionSnapshot({
      stateVersion: 1,
      actionSpecs: {
        "task.complete": {
          id: "task.complete",
          attachTo: { entityType: "task" },
          executeScope: "object",
          execute: () => ({ status: "changed" }),
          postcondition: () => true,
        },
      },
      visibleObjects: [
        {
          id: "task.item.task_1",
          type: "composite",
          role: "list_item",
          label: "评审方案",
          entity: { type: "task", id: "task_1" },
        },
      ],
    })
    const command = buildCommandEnvelope({
      commandId: "command_1",
      turnId: "turn_1",
      kind: "domain",
      actionId: "task.complete",
      source,
      targetId: "task.item.task_1",
      anchor: anchorFor(snapshot),
    })

    await expect(
      dispatchCommand(snapshot, command, {
        onPhase: (event) => phases.push(`${event.phase}.${event.state}`),
      })
    ).resolves.toMatchObject({ status: "committed" })

    expect(phases).toEqual([
      "validation.started",
      "validation.passed",
      "execution.started",
      "execution.completed",
      "verification.started",
      "verification.passed",
    ])
  })
})
