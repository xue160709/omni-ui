import { describe, expect, it } from "vitest"
import {
  createInteractionSnapshot,
  projectSnapshotForModel,
  redactInteractionEvent,
  redactInteractionState,
} from "../src"

describe("model snapshot privacy projection", () => {
  it("filters actions through modelCallable and allowlist", () => {
    const snapshot = createInteractionSnapshot({
      stateVersion: 1,
      actionSpecs: {
        "todo.complete": {
          id: "todo.complete",
          attachTo: { entityType: "todo" },
          executeScope: "object",
          modelCallable: true,
        },
        "todo.delete": {
          id: "todo.delete",
          attachTo: { entityType: "todo" },
          executeScope: "object",
        },
      },
      visibleObjects: [
        {
          id: "todo.1",
          type: "composite",
          role: "list_item",
          entity: { type: "todo", id: "1" },
        },
      ],
    })

    const projected = projectSnapshotForModel(snapshot, {
      allowedActionIds: ["todo.complete"],
      enforceModelCallable: true,
    })

    expect(Object.keys(projected.actionSpecs)).toEqual(["todo.complete"])
    expect(projected.visibleObjects[0]?.actions).toEqual(["todo.complete"])
  })

  it("hides primitive actions unless explicitly requested", () => {
    const snapshot = createInteractionSnapshot({
      stateVersion: 1,
      visibleObjects: [
        {
          id: "input.title",
          type: "raw",
          role: "textbox",
          primitiveActions: ["setText", "clear"],
        },
      ],
    })

    expect(projectSnapshotForModel(snapshot).visibleObjects[0]?.primitiveActions).toBeUndefined()
    expect(
      projectSnapshotForModel(snapshot, { includePrimitiveActions: true }).visibleObjects[0]
        ?.primitiveActions
    ).toEqual(["setText", "clear"])
  })

  it("redacts input values and sensitive fields from states and events", () => {
    expect(
      redactInteractionState({
        value: "open secret",
        inputType: "text",
        required: true,
        apiKey: "sk-abcdefghijklmnop",
      })
    ).toEqual({
      hasValue: true,
      length: 11,
      inputType: "text",
      required: true,
      invalid: undefined,
    })

    expect(
      redactInteractionEvent({
        id: "event_1",
        modality: "voice",
        type: "voice.asr.final",
        text: "验证码 1234",
        snapshotId: "snapshot_1",
        baseStateVersion: 1,
        timestamp: 100,
        value: { token: "secret-token-abcdefghijkl" },
      })
    ).toMatchObject({
      text: "[redacted]",
      value: { token: "[redacted]" },
    })
  })
})
