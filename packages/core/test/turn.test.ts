import { describe, expect, it } from "vitest"
import {
  canTransitionTurn,
  createInteractionTurn,
  transitionTurn,
  type SnapshotAnchor,
  type TextInput,
} from "../src"

const anchor: SnapshotAnchor = {
  snapshotId: "snapshot_1",
  stateVersion: 1,
  contextHash: "context_a",
  focusRevision: 0,
  capturedAt: 100,
}

const input: TextInput = {
  kind: "text",
  text: "完成第一个",
  receivedAt: 101,
}

describe("interaction turn", () => {
  it("creates a stable turn shell for later resolver and dispatcher stages", () => {
    const turn = createInteractionTurn({
      id: "turn_1",
      source: "text",
      input,
      anchor,
      now: 102,
    })

    expect(turn).toMatchObject({
      id: "turn_1",
      revision: 0,
      status: "created",
      source: "text",
      hypotheses: [],
      candidates: [],
      createdAt: 102,
      updatedAt: 102,
    })
  })

  it("advances allowed state transitions with revision updates", () => {
    const turn = createInteractionTurn({
      id: "turn_1",
      source: "text",
      input,
      anchor,
      now: 102,
    })
    const resolving = transitionTurn(turn, {
      type: "transition",
      status: "resolving",
      at: 103,
    })
    const ready = transitionTurn(resolving, {
      type: "transition",
      status: "ready",
      at: 104,
      decision: {
        targetId: "todo_1",
        actionId: "todo.complete",
        params: {},
        score: 0.92,
        confidenceMargin: 0.2,
        evidence: [],
      },
    })

    expect(canTransitionTurn("created", "resolving")).toBe(true)
    expect(ready.status).toBe("ready")
    expect(ready.revision).toBe(2)
    expect(ready.updatedAt).toBe(104)
    expect(ready.decision?.targetId).toBe("todo_1")
  })

  it("rejects illegal state transitions", () => {
    const turn = createInteractionTurn({
      id: "turn_1",
      source: "text",
      input,
      anchor,
      now: 102,
    })

    expect(canTransitionTurn("created", "committed")).toBe(false)
    expect(() =>
      transitionTurn(turn, {
        type: "transition",
        status: "committed",
      })
    ).toThrow(/Illegal turn transition/)
  })
})
