import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { App } from "./App"

beforeEach(() => {
  window.localStorage.clear()
  window.history.pushState(null, "", "/")
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  window.localStorage.clear()
  window.history.pushState(null, "", "/")
})

describe("mobile todo app", () => {
  it("navigates with bottom tabs", () => {
    render(<App />)

    expect(screen.getByRole("heading", { level: 1, name: "首页" })).not.toBeNull()

    fireEvent.click(screen.getByRole("button", { name: "待办" }))

    expect(window.location.pathname).toBe("/todos")
    expect(screen.getByRole("heading", { level: 1, name: "待办" })).not.toBeNull()

    fireEvent.click(screen.getByRole("button", { name: "设置" }))

    expect(window.location.pathname).toBe("/settings")
    expect(screen.getByRole("heading", { level: 1, name: "设置" })).not.toBeNull()
  })

  it("opens a todo detail page from the list", () => {
    render(<App />)

    fireEvent.click(screen.getByRole("button", { name: "待办" }))
    fireEvent.click(screen.getByRole("button", { name: /买牛奶/ }))

    expect(window.location.pathname).toBe("/todos/todo_1")
    expect(screen.getByRole("heading", { level: 1, name: "买牛奶" })).not.toBeNull()
    expect(screen.getByLabelText("详情")).not.toBeNull()
  })

  it("updates todo details", async () => {
    render(<App />)

    fireEvent.click(screen.getByRole("button", { name: "待办" }))
    fireEvent.click(screen.getByRole("button", { name: /买牛奶/ }))
    fireEvent.change(screen.getByLabelText("详情"), {
      target: { value: "买两盒牛奶" },
    })
    fireEvent.click(screen.getByRole("button", { name: "保存" }))
    fireEvent.click(screen.getByRole("button", { name: "待办" }))

    await waitFor(() => {
      expect(screen.getByText("买两盒牛奶")).not.toBeNull()
    })
  })

  it("stores the SiliconFlow API key in settings", () => {
    render(<App />)

    fireEvent.click(screen.getByRole("button", { name: "设置" }))
    fireEvent.change(screen.getByLabelText("API Key"), {
      target: { value: "test-key" },
    })
    fireEvent.click(screen.getByRole("button", { name: "保存" }))

    expect(window.localStorage.getItem("siliconflow_api_key")).toBe("test-key")
    expect(screen.getByText("已保存到本机")).not.toBeNull()
  })

  it("opens the floating chatbot from the bottom tab", () => {
    render(<App />)

    fireEvent.click(screen.getByRole("button", { name: "Chatbot" }))

    expect(screen.getByRole("heading", { level: 2, name: "Chatbot" })).not.toBeNull()
    expect(screen.getByLabelText("消息")).not.toBeNull()
  })

  it("opens the floating chatbot from the legacy chat URL", () => {
    window.history.pushState(null, "", "/chat")

    render(<App />)

    expect(screen.getByRole("heading", { level: 1, name: "首页" })).not.toBeNull()
    expect(screen.getByRole("heading", { level: 2, name: "Chatbot" })).not.toBeNull()
  })

  it("sends chatbot messages with the configured API key", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "你好，我是你的任务助手。" } }],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      )
    )
    vi.stubGlobal("fetch", fetchMock)
    window.localStorage.setItem("siliconflow_api_key", "test-key")

    render(<App />)

    fireEvent.click(screen.getByRole("button", { name: "Chatbot" }))
    fireEvent.change(screen.getByLabelText("消息"), {
      target: { value: "你好" },
    })
    fireEvent.click(screen.getByRole("button", { name: "发送" }))

    await waitFor(() => {
      expect(screen.getByText("你好，我是你的任务助手。")).not.toBeNull()
    })

    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>
    expect(calls[0][0]).toBe("/api/chat")
    expect((calls[0][1].headers as Record<string, string>)["x-siliconflow-api-key"]).toBe(
      "test-key"
    )
  })

  it("uses Web Speech API transcripts as chatbot input", async () => {
    class MockRecognition {
      lang = ""
      continuous = false
      interimResults = false
      onresult: ((event: { results: Array<Array<{ transcript: string }>> }) => void) | null = null
      onerror: (() => void) | null = null
      onend: (() => void) | null = null

      start() {
        this.onresult?.({ results: [[{ transcript: "语音任务" }]] })
        this.onend?.()
      }

      stop() {}
    }

    vi.stubGlobal("webkitSpeechRecognition", MockRecognition)
    render(<App />)

    fireEvent.click(screen.getByRole("button", { name: "Chatbot" }))
    fireEvent.change(screen.getByLabelText("消息"), {
      target: { value: "" },
    })
    fireEvent.click(screen.getByRole("button", { name: "语音输入" }))

    await waitFor(() => {
      expect((screen.getByLabelText("消息") as HTMLTextAreaElement).value).toBe("语音任务")
    })
  })
})
