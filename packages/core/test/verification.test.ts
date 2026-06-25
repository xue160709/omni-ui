import { describe, expect, it } from "vitest"
import {
  buildCommandEnvelope,
  createInteractionSnapshot,
  createSnapshotAnchor,
  waitForCommandPostcondition,
  verifyCommandPostcondition,
} from "../src"

const source = {
  modality: "text" as const,
  resolverIds: ["rule"],
  modelGenerated: false,
}

describe("command verification", () => {
  it("passes the before and after target snapshots into postconditions", async () => {
    const before = createInteractionSnapshot({
      stateVersion: 1,
      visibleObjects: [
        { id: "todo.1", type: "composite", role: "list_item", state: { completed: false } },
      ],
    })
    const after = createInteractionSnapshot({
      stateVersion: 2,
      visibleObjects: [
        { id: "todo.1", type: "composite", role: "list_item", state: { completed: true } },
      ],
      contextHash: before.contextHash,
    })
    const command = buildCommandEnvelope({
      commandId: "command_1",
      turnId: "turn_1",
      kind: "domain",
      actionId: "todo.complete",
      source,
      targetId: "todo.1",
      anchor: createSnapshotAnchor(before, { capturedAt: 100 }),
    })

    await expect(
      verifyCommandPostcondition({
        command,
        before,
        after,
        targetBefore: before.visibleObjects[0]!,
        postcondition: ({ targetAfter }) => targetAfter?.state?.completed === true,
      })
    ).resolves.toEqual({ ok: true })
  })

  it("normalizes false and thrown postconditions into verification failures", async () => {
    const snapshot = createInteractionSnapshot({
      stateVersion: 1,
      visibleObjects: [{ id: "todo.1", type: "composite", role: "list_item" }],
    })
    const command = buildCommandEnvelope({
      commandId: "command_1",
      turnId: "turn_1",
      kind: "domain",
      actionId: "todo.complete",
      source,
      targetId: "todo.1",
      anchor: createSnapshotAnchor(snapshot, { capturedAt: 100 }),
    })

    await expect(
      verifyCommandPostcondition({
        command,
        before: snapshot,
        after: snapshot,
        targetBefore: snapshot.visibleObjects[0]!,
        postcondition: () => false,
      })
    ).resolves.toMatchObject({ ok: false, code: "verification_failed" })

    await expect(
      verifyCommandPostcondition({
        command,
        before: snapshot,
        after: snapshot,
        targetBefore: snapshot.visibleObjects[0]!,
        postcondition: () => {
          throw new Error("no state change")
        },
      })
    ).resolves.toMatchObject({ ok: false, code: "verification_failed" })
  })

  it("waits for later snapshots until the postcondition passes", async () => {
    const before = createInteractionSnapshot({
      stateVersion: 1,
      visibleObjects: [
        { id: "todo.1", type: "composite", role: "list_item", state: { completed: false } },
      ],
    })
    const afterPending = createInteractionSnapshot({
      stateVersion: 2,
      contextHash: before.contextHash,
      visibleObjects: [
        { id: "todo.1", type: "composite", role: "list_item", state: { completed: false } },
      ],
    })
    const afterCommitted = createInteractionSnapshot({
      stateVersion: 3,
      contextHash: before.contextHash,
      visibleObjects: [
        { id: "todo.1", type: "composite", role: "list_item", state: { completed: true } },
      ],
    })
    const snapshots = [afterPending, afterCommitted]
    const command = buildCommandEnvelope({
      commandId: "command_1",
      turnId: "turn_1",
      kind: "domain",
      actionId: "todo.complete",
      source,
      targetId: "todo.1",
      anchor: createSnapshotAnchor(before, { capturedAt: 100 }),
    })

    await expect(
      waitForCommandPostcondition({
        command,
        before,
        getSnapshot: () => snapshots.shift() ?? afterCommitted,
        targetBefore: before.visibleObjects[0]!,
        postcondition: ({ targetAfter }) => targetAfter?.state?.completed === true,
        timeoutMs: 50,
        intervalMs: 0,
      })
    ).resolves.toEqual({ ok: true })
  })
})
