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

  it("prioritizes dialog confirmation and cancellation in modal context", () => {
    const snapshot = createInteractionSnapshot({
      stateVersion: 1,
      contextStack: [
        { type: "page", id: "page.settings" },
        { type: "modal", id: "dialog.restore", scopePolicy: "modal_first" },
      ],
      visibleObjects: [
        {
          id: "dialog.restore",
          type: "composite",
          role: "dialog",
          label: "恢复默认确认",
          children: ["button.cancel", "button.confirm"],
        },
        {
          id: "button.cancel",
          type: "raw",
          role: "button",
          label: "取消",
          primitiveActions: ["press"],
        },
        {
          id: "button.confirm",
          type: "raw",
          role: "button",
          label: "确认",
          primitiveActions: ["press"],
        },
      ],
    })

    expect(resolveUtterance("取消", snapshot)).toMatchObject({
      status: "resolved",
      targetId: "button.cancel",
      primitiveAction: "press",
      reason: "modal_first:dialog.restore",
    })
  })

  it("resolves native select options by label and visible ordinal", () => {
    const snapshot = createInteractionSnapshot({
      stateVersion: 1,
      visibleObjects: [
        {
          id: "settings.theme",
          type: "raw",
          role: "select",
          label: "主题",
          primitiveActions: ["open", "selectByLabel", "selectByIndex"],
          state: {
            options: [
              { label: "系统", value: "system", selected: true },
              { label: "深色", value: "dark", selected: false },
            ],
          },
        },
      ],
    })

    expect(resolveUtterance("选择深色", snapshot)).toMatchObject({
      status: "resolved",
      targetId: "settings.theme",
      primitiveAction: "selectByLabel",
      params: { label: "深色" },
    })

    expect(resolveUtterance("选择第 2 个", snapshot)).toMatchObject({
      status: "resolved",
      targetId: "settings.theme",
      primitiveAction: "selectByIndex",
      params: { index: 2 },
    })
  })

  it("resolves increase and decrease utterances to registered domain actions", () => {
    const snapshot = createInteractionSnapshot({
      stateVersion: 1,
      visibleObjects: [
        {
          id: "settings.temperature",
          type: "composite",
          role: "value_control",
          label: "温度",
          actions: ["settings.temperature.increase", "settings.temperature.decrease"],
          state: { value: 24, min: 16, max: 30 },
        },
      ],
    })

    expect(resolveUtterance("把温度稍微调高一点", snapshot)).toMatchObject({
      status: "resolved",
      targetId: "settings.temperature",
      actionId: "settings.temperature.increase",
    })

    expect(resolveUtterance("把温度调低一点", snapshot)).toMatchObject({
      status: "resolved",
      targetId: "settings.temperature",
      actionId: "settings.temperature.decrease",
    })
  })

  it("resolves conversational todo completion phrasing", () => {
    const snapshot = createInteractionSnapshot({
      stateVersion: 1,
      visibleObjects: [
        {
          id: "todo.item.todo_1",
          type: "composite",
          role: "list_item",
          label: "买牛奶",
          entity: { type: "todo", id: "todo_1" },
          actions: ["todo.complete", "todo.uncomplete"],
          state: { completed: false, index: 1 },
        },
      ],
    })

    expect(resolveUtterance("帮我将买牛奶改成完成", snapshot)).toMatchObject({
      status: "resolved",
      intent: "complete",
      targetId: "todo.item.todo_1",
      actionId: "todo.complete",
    })

    expect(resolveUtterance("取消完成买牛奶", snapshot)).toMatchObject({
      status: "resolved",
      intent: "uncomplete",
      targetId: "todo.item.todo_1",
      actionId: "todo.uncomplete",
    })
  })

  it("does not treat uncomplete as a complete action", () => {
    const snapshot = createInteractionSnapshot({
      stateVersion: 1,
      visibleObjects: [
        {
          id: "todo.item.todo_1",
          type: "composite",
          role: "list_item",
          label: "买牛奶",
          entity: { type: "todo", id: "todo_1" },
          actions: ["todo.uncomplete"],
          state: { completed: true, index: 1 },
        },
      ],
    })

    expect(resolveUtterance("完成买牛奶", snapshot)).toMatchObject({
      status: "not_found",
      targetId: "todo.item.todo_1",
    })
  })
})
