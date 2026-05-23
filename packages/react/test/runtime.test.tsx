import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import * as React from "react"
import { describe, expect, it } from "vitest"
import {
  MultimodalGroup,
  MultimodalProvider,
  useInteractionActions,
  useSubmitUtterance,
  type ActionContext,
  type ActionPayload,
} from "../src"

function TodoHarness() {
  const [completed, setCompleted] = React.useState(false)
  const submitUtterance = useSubmitUtterance()

  const actions = React.useMemo(
    () => ({
      "todo.complete": {
        attachTo: { entityType: "todo" },
        executeScope: "object" as const,
        paramsFrom: ({ target }: ActionContext) => ({ todoId: target.entity?.id }),
        availableWhen: ({ target }: ActionContext) => target.state?.completed === false,
      },
    }),
    []
  )

  useInteractionActions({
    namespace: "todo",
    actions,
    execute: (action: ActionPayload) => {
      if (action.type === "todo.complete" && action.todoId === "todo_1") {
        setCompleted(true)
      }
    },
  })

  return (
    <>
      <button type="button" onClick={() => void submitUtterance("完成第一个")}>
        voice
      </button>
      <MultimodalGroup id="todo.list" role="list" label="待办列表" indexBy="visible_order">
        <MultimodalGroup
          id="todo.item.todo_1"
          role="list_item"
          label="买牛奶"
          entity={{ type: "todo", id: "todo_1" }}
        >
          <label>
            <input type="checkbox" checked={completed} onChange={() => setCompleted((value) => !value)} />
            买牛奶
          </label>
        </MultimodalGroup>
      </MultimodalGroup>
    </>
  )
}

describe("MultimodalProvider", () => {
  it("resolves a voice command and executes the registered domain action", async () => {
    render(
      <MultimodalProvider>
        <TodoHarness />
      </MultimodalProvider>
    )

    fireEvent.click(screen.getByRole("button", { name: "voice" }))

    await waitFor(() => {
      expect((screen.getByRole("checkbox", { name: "买牛奶" }) as HTMLInputElement).checked).toBe(true)
    })
  })
})
