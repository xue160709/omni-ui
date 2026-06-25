import { describe, expect, it } from "vitest"
import {
  buildCommandEnvelope,
  cloneSerializableCommandParams,
  createDecisionBinding,
  type SnapshotAnchor,
} from "../src"

const anchor: SnapshotAnchor = {
  snapshotId: "snapshot_1",
  stateVersion: 3,
  contextHash: "context_a",
  focusRevision: 2,
  capturedAt: 100,
}

const source = {
  modality: "voice" as const,
  resolverIds: ["rule"],
  modelGenerated: false,
}

describe("command envelope", () => {
  it("creates a stable decision binding independent of params key order", () => {
    const first = createDecisionBinding({
      turnId: "turn_1",
      kind: "domain",
      targetId: "todo_1",
      actionIdOrPrimitive: "todo.update",
      params: {
        title: "Buy milk",
        metadata: { due: "today", priority: 1 },
      },
      anchor,
    })
    const second = createDecisionBinding({
      turnId: "turn_1",
      kind: "domain",
      targetId: "todo_1",
      actionIdOrPrimitive: "todo.update",
      params: {
        metadata: { priority: 1, due: "today" },
        title: "Buy milk",
      },
      anchor,
    })

    expect(second.canonical).toBe(first.canonical)
    expect(second.fingerprint).toBe(first.fingerprint)
  })

  it("deep-freezes built command envelopes", () => {
    const command = buildCommandEnvelope({
      commandId: "command_1",
      turnId: "turn_1",
      kind: "domain",
      actionId: "todo.complete",
      source,
      targetId: "todo_1",
      params: { todoId: "todo_1", nested: { done: true } },
      anchor,
      createdAt: 200,
    })

    expect(Object.isFrozen(command)).toBe(true)
    expect(Object.isFrozen(command.params)).toBe(true)
    expect(Object.isFrozen(command.params.nested)).toBe(true)
    expect(command.decisionBinding.canonical).toContain('"actionIdOrPrimitive":"todo.complete"')
  })

  it("rejects non-serializable command params", () => {
    expect(() =>
      cloneSerializableCommandParams({
        todoId: "todo_1",
        callback: () => undefined,
      })
    ).toThrow(/not serializable/)
  })

  it("rejects circular command params", () => {
    const params: Record<string, unknown> = { todoId: "todo_1" }
    params.self = params

    expect(() => cloneSerializableCommandParams(params)).toThrow(/circular reference/)
  })
})
