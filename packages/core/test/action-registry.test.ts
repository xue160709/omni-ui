import { describe, expect, it } from "vitest"
import {
  actionMatchesObject,
  buildActionPayload,
  createInteractionSnapshot,
  resolveUtterance,
  validateActionRequest,
  type RegisteredActionSpec,
} from "../src"

describe("action registry", () => {
  it("attaches available domain actions and maps params without eval", () => {
    const actionSpecs: Record<string, RegisteredActionSpec> = {
      "task.complete": {
        id: "task.complete",
        attachTo: { entityType: "task" },
        executeScope: "object",
        paramsFrom: { taskId: "target.entity.id" },
        availableWhen: ({ target }) => target.state?.completed === false,
      },
    }

    const snapshot = createInteractionSnapshot({
      stateVersion: 1,
      actionSpecs,
      visibleObjects: [
        {
          id: "task.item.task_1",
          type: "composite",
          role: "list_item",
          label: "评审方案",
          entity: { type: "task", id: "task_1" },
          state: { completed: false, index: 1 },
        },
      ],
    })

    expect(snapshot.visibleObjects[0].actions).toEqual(["task.complete"])

    const candidate = resolveUtterance("完成第一个", snapshot)
    expect(candidate).toMatchObject({
      status: "resolved",
      actionId: "task.complete",
      targetId: "task.item.task_1",
    })

    const payload = buildActionPayload(snapshot, {
      actionId: "task.complete",
      targetId: "task.item.task_1",
      baseStateVersion: 1,
      candidate,
      utterance: "完成第一个",
    })

    expect(payload).toEqual({
      type: "task.complete",
      taskId: "task_1",
    })
  })

  it("rejects stale state versions", () => {
    const snapshot = createInteractionSnapshot({
      stateVersion: 2,
      visibleObjects: [],
      actionSpecs: {
        "task.clearCompleted": {
          id: "task.clearCompleted",
          executeScope: "page",
        },
      },
    })

    expect(
      validateActionRequest(snapshot, {
        actionId: "task.clearCompleted",
        targetId: "page.task",
        baseStateVersion: 1,
      })
    ).toMatchObject({
      ok: false,
      code: "state_changed",
    })
  })

  it("rejects legacy validation when action and target do not match", () => {
    const snapshot = createInteractionSnapshot({
      stateVersion: 1,
      visibleObjects: [
        {
          id: "note.item.note_1",
          type: "composite",
          role: "list_item",
          label: "复盘",
          entity: { type: "note", id: "note_1" },
          actions: ["task.complete"],
        },
      ],
      actionSpecs: {
        "task.complete": {
          id: "task.complete",
          attachTo: { entityType: "task" },
          executeScope: "object",
        },
      },
    })

    expect(
      validateActionRequest(snapshot, {
        actionId: "task.complete",
        targetId: "note.item.note_1",
        baseStateVersion: 1,
      })
    ).toMatchObject({
      ok: false,
      code: "action_target_mismatch",
    })
  })

  it("rejects legacy validation when the target does not expose the action capability", () => {
    const snapshot = createInteractionSnapshot({
      stateVersion: 1,
      visibleObjects: [
        {
          id: "task.item.task_1",
          type: "composite",
          role: "list_item",
          label: "复盘",
          entity: { type: "task", id: "task_1" },
        },
      ],
      actionSpecs: {
        "task.complete": {
          id: "task.complete",
          attachTo: { entityType: "task" },
          executeScope: "object",
          availableWhen: () => false,
        },
      },
    })

    expect(
      validateActionRequest(snapshot, {
        actionId: "task.complete",
        targetId: "task.item.task_1",
        baseStateVersion: 1,
      })
    ).toMatchObject({
      ok: false,
      code: "capability_missing",
    })
  })

  it("allows executeScope fallback when attachTo does not match", () => {
    const spec: RegisteredActionSpec = {
      id: "todo.add",
      attachTo: { role: "composer" },
      executeScope: "page",
    }

    expect(
      actionMatchesObject(spec, {
        id: "todo.composer",
        type: "composite",
        role: "composer",
      })
    ).toBe(true)
    expect(
      actionMatchesObject(spec, {
        id: "page.todos",
        type: "page",
        role: "page",
      })
    ).toBe(true)
    expect(
      actionMatchesObject(spec, {
        id: "todo.item.todo_1",
        type: "composite",
        role: "list_item",
        entity: { type: "todo", id: "todo_1" },
      })
    ).toBe(false)
  })
})
