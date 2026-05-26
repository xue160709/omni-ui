import { describe, expect, it } from "vitest"
import {
  createConfiguredRuleResolver,
  createInteractionSnapshot,
  NAVIGATION_GOTO_ACTION_ID,
  resolveUtterance,
  type ResolvedInteraction,
} from "../src"

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

  it("resolves route-style utterances to navigation actions", () => {
    const snapshot = createInteractionSnapshot({
      stateVersion: 1,
      visibleObjects: [
        {
          id: "app.route.home",
          type: "composite",
          role: "route",
          label: "首页",
          aliases: ["主页"],
          actions: ["navigation.goto"],
        },
      ],
    })

    expect(resolveUtterance("回到首页", snapshot)).toMatchObject({
      status: "resolved",
      intent: "navigate",
      targetId: "app.route.home",
      actionId: "navigation.goto",
    })
  })

  it("resolves configured local rules against manifest routes", () => {
    const resolver = createConfiguredRuleResolver({
      rules: [
        {
          id: "open-route",
          patterns: ["打开{route}", "去{route}"],
          target: "route.byLabel",
          actionId: NAVIGATION_GOTO_ACTION_ID,
        },
      ],
    })
    const snapshot = createInteractionSnapshot({
      stateVersion: 1,
      manifest: {
        routes: [
          {
            id: "app.route.profile",
            label: "个人资料",
            aliases: ["资料"],
            path: "/profile",
          },
        ],
      },
      visibleObjects: [],
    })
    const result = resolver.resolve({
      utterance: "打开个人资料",
      snapshot,
    }) as ResolvedInteraction

    expect(snapshot.visibleObjects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "app.route.profile",
          role: "route",
          actions: [NAVIGATION_GOTO_ACTION_ID],
        }),
      ])
    )
    expect(result).toMatchObject({
      status: "resolved",
      targetId: "app.route.profile",
      actionId: NAVIGATION_GOTO_ACTION_ID,
      reason: "configured_rule:open-route",
    })
  })

  it("resolves conversational task completion phrasing", () => {
    const snapshot = createInteractionSnapshot({
      stateVersion: 1,
      visibleObjects: [
        {
          id: "task.item.task_1",
          type: "composite",
          role: "list_item",
          label: "评审方案",
          entity: { type: "task", id: "task_1" },
          actions: ["task.complete", "task.uncomplete"],
          state: { completed: false, index: 1 },
        },
      ],
    })

    expect(resolveUtterance("帮我将评审方案改成完成", snapshot)).toMatchObject({
      status: "resolved",
      intent: "complete",
      targetId: "task.item.task_1",
      actionId: "task.complete",
    })

    expect(resolveUtterance("取消完成评审方案", snapshot)).toMatchObject({
      status: "resolved",
      intent: "uncomplete",
      targetId: "task.item.task_1",
      actionId: "task.uncomplete",
    })

  })

  it("uses the most recent pointer reference before an older focused object", () => {
    const now = Date.now()
    const snapshot = createInteractionSnapshot({
      stateVersion: 1,
      visibleObjects: [
        {
          id: "task.item.task_1",
          type: "composite",
          role: "list_item",
          label: "评审方案",
          entity: { type: "task", id: "task_1" },
          actions: ["task.delete"],
          state: { completed: false, index: 1 },
        },
        {
          id: "task.item.task_2",
          type: "composite",
          role: "list_item",
          label: "回学校拿东西",
          entity: { type: "task", id: "task_2" },
          actions: ["task.delete"],
          state: { completed: false, index: 2 },
        },
      ],
      focus: { objectId: "task.item.task_1" },
      recentReferences: [
        {
          objectId: "task.item.task_1",
          source: "focus",
          timestamp: now - 1200,
          confidence: 0.9,
        },
        {
          objectId: "task.item.task_2",
          source: "hover",
          timestamp: now,
          confidence: 0.82,
        },
      ],
    })

    expect(resolveUtterance("删掉这个", snapshot)).toMatchObject({
      status: "resolved",
      intent: "delete",
      targetId: "task.item.task_2",
      actionId: "task.delete",
    })
  })

  it("does not treat uncomplete as a complete action", () => {
    const snapshot = createInteractionSnapshot({
      stateVersion: 1,
      visibleObjects: [
        {
          id: "task.item.task_1",
          type: "composite",
          role: "list_item",
          label: "评审方案",
          entity: { type: "task", id: "task_1" },
          actions: ["task.uncomplete"],
          state: { completed: true, index: 1 },
        },
      ],
    })

    expect(resolveUtterance("完成评审方案", snapshot)).toMatchObject({
      status: "not_found",
      targetId: "task.item.task_1",
    })
  })
})
