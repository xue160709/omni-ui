import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { App } from "./App"

afterEach(() => {
  cleanup()
})

describe("docs demo", () => {
  it("keeps the voice console out of the interaction snapshot", async () => {
    render(<App />)

    await waitFor(() => {
      const text = document.querySelector(".devtools pre")?.textContent
      expect(text).toBeTruthy()

      const snapshot = JSON.parse(text!)
      const labels = snapshot.visibleObjects.map((object: { label?: string }) => object.label)

      expect(labels).toContain("买牛奶")
      expect(labels).not.toContain("提交语音")
      expect(labels).not.toContain("点击添加")
      expect(labels).not.toContain("LLM resolver demo")
    })
  })

  it("executes the opt-in LLM demo utterances through runtime actions", async () => {
    render(<App />)

    fireEvent.click(screen.getByRole("checkbox", { name: "LLM resolver demo" }))
    fireEvent.click(screen.getByRole("button", { name: "把买牛奶那个完成" }))

    await waitFor(() => {
      expect((screen.getByRole("checkbox", { name: "取消完成 买牛奶" }) as HTMLInputElement).checked).toBe(true)
    })

    fireEvent.click(screen.getByRole("button", { name: "只显示还没做完的" }))

    await waitFor(() => {
      expect(screen.queryByRole("checkbox", { name: "取消完成 买牛奶" })).toBeNull()
      expect(screen.getByRole("checkbox", { name: "完成 写周报" })).not.toBeNull()
    })

    fireEvent.click(screen.getByRole("button", { name: "把温度稍微调高一点" }))

    await waitFor(() => {
      expect(screen.getByText("温度 25℃")).not.toBeNull()
    })
  })
})
