import { describe, expect, it } from "vitest"
import { createInteractionSnapshot, validateCommandScope } from "../src"

describe("scope arbiter", () => {
  it("blocks page targets while a blocking modal is active", () => {
    const snapshot = createInteractionSnapshot({
      stateVersion: 1,
      contextStack: [
        { type: "page", id: "page.todos" },
        {
          type: "modal",
          id: "dialog.confirm",
          blocksGlobalActions: true,
          scopePolicy: "modal_first",
        },
      ],
      visibleObjects: [
        {
          id: "page.todos",
          type: "page",
          role: "page",
          label: "待办",
        },
        {
          id: "dialog.confirm",
          type: "composite",
          role: "dialog",
          label: "确认删除",
          children: ["button.confirm"],
        },
        {
          id: "button.confirm",
          type: "raw",
          role: "button",
          label: "确认",
          parent: "dialog.confirm",
        },
      ],
    })
    const page = snapshot.visibleObjects.find((object) => object.id === "page.todos")
    const button = snapshot.visibleObjects.find((object) => object.id === "button.confirm")

    expect(page && validateCommandScope(snapshot, page)).toMatchObject({
      ok: false,
      code: "scope_blocked",
    })
    expect(button && validateCommandScope(snapshot, button)).toEqual({ ok: true })
  })
})
