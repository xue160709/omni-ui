import { describe, expect, it } from "vitest"
import {
  buildActionPayload,
  createInteractionSnapshot,
  resolveUtterance,
  validateActionRequest,
  type RegisteredActionSpec,
} from "../src"

describe("action registry", () => {
  it("attaches available domain actions and maps params without eval", () => {
    const actionSpecs: Record<string, RegisteredActionSpec> = {
      "todo.complete": {
        id: "todo.complete",
        attachTo: { entityType: "todo" },
        executeScope: "object",
        paramsFrom: { todoId: "target.entity.id" },
        availableWhen: ({ target }) => target.state?.completed === false,
      },
    }

    const snapshot = createInteractionSnapshot({
      stateVersion: 1,
      actionSpecs,
      visibleObjects: [
        {
          id: "todo.item.todo_1",
          type: "composite",
          role: "list_item",
          label: "买牛奶",
          entity: { type: "todo", id: "todo_1" },
          state: { completed: false, index: 1 },
        },
      ],
    })

    expect(snapshot.visibleObjects[0].actions).toEqual(["todo.complete"])

    const candidate = resolveUtterance("完成第一个", snapshot)
    expect(candidate).toMatchObject({
      status: "resolved",
      actionId: "todo.complete",
      targetId: "todo.item.todo_1",
    })

    const payload = buildActionPayload(snapshot, {
      actionId: "todo.complete",
      targetId: "todo.item.todo_1",
      baseStateVersion: 1,
      candidate,
      utterance: "完成第一个",
    })

    expect(payload).toEqual({
      type: "todo.complete",
      todoId: "todo_1",
    })
  })

  it("rejects stale state versions", () => {
    const snapshot = createInteractionSnapshot({
      stateVersion: 2,
      visibleObjects: [],
      actionSpecs: {
        "todo.clearCompleted": {
          id: "todo.clearCompleted",
          executeScope: "page",
        },
      },
    })

    expect(
      validateActionRequest(snapshot, {
        actionId: "todo.clearCompleted",
        targetId: "page.todo",
        baseStateVersion: 1,
      })
    ).toMatchObject({
      ok: false,
      code: "state_changed",
    })
  })
})
