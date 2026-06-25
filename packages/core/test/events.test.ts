import { describe, expect, it } from "vitest"
import { createInteractionEventBuffer, sanitizeEventValue } from "../src"

describe("interaction event buffer", () => {
  it("keeps events ordered by timestamp and monotonic sequence", () => {
    const buffer = createInteractionEventBuffer({ capacity: 5, ttlMs: 10_000 })

    buffer.append({
      modality: "gui",
      type: "gui.focus.changed",
      target: "input.title",
      timestamp: 100,
    })
    buffer.append({
      modality: "gui",
      type: "gui.pointer.activated",
      target: "todo.1",
      timestamp: 100,
    })

    expect(buffer.list(100).map((event) => event.sequence)).toEqual([1, 2])
    expect(buffer.recent(1, 100)[0]?.target).toBe("todo.1")
  })

  it("prunes by ttl and capacity", () => {
    const buffer = createInteractionEventBuffer({ capacity: 2, ttlMs: 100 })

    buffer.append({ modality: "voice", type: "voice.asr.partial", text: "a", timestamp: 1_000 })
    buffer.append({ modality: "voice", type: "voice.asr.partial", text: "b", timestamp: 1_050 })
    buffer.append({ modality: "voice", type: "voice.asr.final", text: "c", timestamp: 1_090 })

    expect(buffer.list(1_090).map((event) => event.text)).toEqual(["b", "c"])
    expect(buffer.list(1_250)).toEqual([])
  })

  it("redacts input values to metadata before snapshot/log use", () => {
    expect(sanitizeEventValue("secret text")).toEqual({
      hasValue: true,
      length: 11,
    })
    expect(sanitizeEventValue({ value: "123456", inputType: "text", required: true })).toEqual({
      hasValue: true,
      length: 6,
      inputType: "text",
      required: true,
      invalid: undefined,
    })
  })
})
