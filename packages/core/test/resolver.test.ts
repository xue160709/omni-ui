import { describe, expect, it } from "vitest"
import { createInteractionSnapshot, resolveUtterance } from "../src"

describe("resolver", () => {
  it("resolves visible click targets to primitive press", () => {
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

    expect(resolveUtterance("点击添加", snapshot)).toMatchObject({
      status: "resolved",
      targetId: "dom.button.add",
      primitiveAction: "press",
    })
  })

  it("resolves filter utterances to filter actions", () => {
    const snapshot = createInteractionSnapshot({
      stateVersion: 1,
      visibleObjects: [
        {
          id: "todo.filters",
          type: "composite",
          role: "filter_tabs",
          label: "待办过滤",
          actions: ["todo.filter"],
        },
      ],
    })

    expect(resolveUtterance("只看未完成", snapshot)).toMatchObject({
      status: "resolved",
      targetId: "todo.filters",
      actionId: "todo.filter",
      params: { filter: "active" },
    })
  })
})
