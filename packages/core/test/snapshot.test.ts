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
      "todo.complete": {
        id: "todo.complete",
        namespace: "todo",
        attachTo: { entityType: "todo" },
        executeScope: "object",
        paramsFrom: () => ({ todoId: "todo_1" }),
        availableWhen: () => true,
        execute: () => undefined,
      },
    }
    const circularState: Record<string, unknown> = { title: "买牛奶" }
    circularState.self = circularState

    const snapshot = createInteractionSnapshot({
      stateVersion: 3,
      actionSpecs,
      page: {
        id: "page.todo",
        type: "page",
        role: "page",
        title: "待办",
        route: "/todos",
      },
      visibleObjects: [
        {
          id: "todo.item.todo_1",
          type: "composite",
          role: "list_item",
          label: "买牛奶",
          entity: { type: "todo", id: "todo_1" },
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

    expect(encoded).toContain("todo.complete")
    expect(encoded).toContain("买牛奶")
    expect(encoded).not.toContain("paramsFrom")
    expect(encoded).not.toContain("availableWhen")
    expect(encoded).not.toContain('"execute"')
    expect(context.actions[0]).toEqual({
      id: "todo.complete",
      namespace: "todo",
      attachTo: { entityType: "todo" },
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
        "todo.clearCompleted": {
          id: "todo.clearCompleted",
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

    expect(prompt).toContain("todo.clearCompleted")
    expect(prompt).not.toContain('"execute"')
  })
})
