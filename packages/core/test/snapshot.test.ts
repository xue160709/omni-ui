import { describe, expect, it } from "vitest"
import {
  createInteractionSnapshot,
  createLlmResolverPrompt,
  createLlmSnapshotContext,
  LLM_RESOLVER_SCHEMA,
  type RegisteredActionSpec,
} from "../src"

describe("snapshot context", () => {
  it("creates an LLM-safe snapshot context without executable action fields", () => {
    const actionSpecs: Record<string, RegisteredActionSpec> = {
      "task.complete": {
        id: "task.complete",
        namespace: "task",
        attachTo: { entityType: "task" },
        executeScope: "object",
        paramsFrom: () => ({ taskId: "task_1" }),
        availableWhen: () => true,
        execute: () => undefined,
      },
    }
    const circularState: Record<string, unknown> = { title: "评审方案" }
    circularState.self = circularState

    const snapshot = createInteractionSnapshot({
      stateVersion: 3,
      actionSpecs,
      page: {
        id: "page.task",
        type: "page",
        role: "page",
        title: "任务",
        route: "/tasks",
      },
      visibleObjects: [
        {
          id: "task.item.task_1",
          type: "composite",
          role: "list_item",
          label: "评审方案",
          entity: { type: "task", id: "task_1" },
          state: {
            circularState,
            completed: false,
            ignored: () => "not serializable",
          },
        },
      ],
    })

    const context = createLlmSnapshotContext(snapshot)
    const encoded = JSON.stringify(context)

    expect(encoded).toContain("task.complete")
    expect(encoded).toContain("评审方案")
    expect(encoded).not.toContain("paramsFrom")
    expect(encoded).not.toContain("availableWhen")
    expect(encoded).not.toContain('"execute"')
    expect(context.actions[0]).toEqual({
      id: "task.complete",
      namespace: "task",
      attachTo: { entityType: "task" },
      executeScope: "object",
      risk: undefined,
      requiresConfirmation: undefined,
    })
  })

  it("uses the compact LLM context in resolver prompts", () => {
    const snapshot = createInteractionSnapshot({
      stateVersion: 1,
      visibleObjects: [],
      actionSpecs: {
        "task.clearCompleted": {
          id: "task.clearCompleted",
          executeScope: "page",
          execute: () => undefined,
        },
      },
    })

    const prompt = createLlmResolverPrompt({
      utterance: "清掉已完成",
      snapshot,
      schema: LLM_RESOLVER_SCHEMA,
    })

    expect(prompt).toContain("task.clearCompleted")
    expect(prompt).not.toContain('"execute"')
  })

  it("adds manifest routes to the LLM context without requiring page render", () => {
    const snapshot = createInteractionSnapshot({
      stateVersion: 1,
      manifest: {
        routes: [
          {
            id: "app.route.settings",
            label: "设置",
            path: "/settings",
            aliases: ["配置"],
          },
        ],
      },
      visibleObjects: [],
    })
    const context = createLlmSnapshotContext(snapshot)

    expect(context.visibleObjects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "app.route.settings",
          role: "route",
          label: "设置",
        }),
      ])
    )
    expect(context.manifest?.routes[0]).toMatchObject({
      id: "app.route.settings",
      label: "设置",
      path: "/settings",
      actionId: "navigation.goto",
    })
  })
})
