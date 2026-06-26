import { describe, expect, it } from "vitest"
import {
  createInteractionTurn,
  type SnapshotAnchor,
  type TextInput,
} from "../src"
import { createInteractionTurnStore } from "../src/advanced"

const anchor: SnapshotAnchor = {
  snapshotId: "snapshot_1",
  stateVersion: 1,
  contextHash: "context_a",
  contextEpoch: 0,
  focusRevision: 0,
  capturedAt: 100,
}

const input: TextInput = {
  kind: "text",
  text: "完成第一个",
  receivedAt: 101,
}

describe("interaction turn store", () => {
  it("uses CAS writes and clears terminal active turns", () => {
    const store = createInteractionTurnStore()
    const turn = createInteractionTurn({
      id: "turn_1",
      source: "text",
      input,
      anchor,
      now: 100,
    })

    store.create(turn)
    expect(store.getActive()?.id).toBe("turn_1")

    const resolving = store.apply("turn_1", 0, {
      type: "resolution.started",
      status: "resolving",
      at: 101,
      resolutionRevision: 1,
    })
    expect(resolving).toMatchObject({ ok: true, turn: { revision: 1 } })
    expect(
      store.apply("turn_1", 0, {
        type: "resolution.completed",
        status: "ready",
      })
    ).toEqual({ ok: false, reason: "revision_conflict" })

    const rejected = store.apply("turn_1", 1, {
      type: "dispatch.completed",
      status: "rejected",
      at: 102,
    })
    expect(rejected).toMatchObject({ ok: true, turn: { status: "rejected" } })
    expect(store.getActive()).toBeUndefined()
    expect(
      store.apply("turn_1", 2, {
        type: "resolution.started",
        status: "resolving",
      })
    ).toEqual({ ok: false, reason: "terminal_turn" })
  })
})
