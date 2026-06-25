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

  it("opens the expanded workspace pages from home", () => {
    render(<App />)

    fireEvent.click(screen.getByRole("button", { name: "项目" }))

    expect(window.location.pathname).toBe("/projects")
    expect(screen.getByRole("heading", { level: 1, name: "项目" })).not.toBeNull()

    fireEvent.click(screen.getByRole("button", { name: /生活整理/ }))

    expect(window.location.pathname).toBe("/projects/project_personal")
    expect(screen.getByRole("heading", { level: 1, name: "生活整理" })).not.toBeNull()
    expect(screen.getByText("买牛奶")).not.toBeNull()

    fireEvent.click(screen.getByRole("button", { name: "首页" }))
    fireEvent.click(screen.getByRole("button", { name: "日历" }))
    expect(window.location.pathname).toBe("/calendar")
    expect(screen.getByRole("heading", { level: 1, name: "日历" })).not.toBeNull()

    fireEvent.click(screen.getByRole("button", { name: "首页" }))
    fireEvent.click(screen.getByRole("button", { name: "看板" }))
    expect(window.location.pathname).toBe("/kanban")
    expect(screen.getByRole("heading", { level: 1, name: "看板" })).not.toBeNull()

    fireEvent.click(screen.getByRole("button", { name: "首页" }))
    fireEvent.click(screen.getByRole("button", { name: "统计" }))
    expect(window.location.pathname).toBe("/analytics")
    expect(screen.getByRole("heading", { level: 1, name: "统计" })).not.toBeNull()
  })

  it("adds a todo from a project detail page", async () => {
    render(<App />)

    fireEvent.click(screen.getByRole("button", { name: "项目" }))
    fireEvent.click(screen.getByRole("button", { name: /发布准备/ }))
    fireEvent.change(screen.getByLabelText("新增事项"), {
      target: { value: "补充验收记录" },
    })
    fireEvent.click(screen.getByRole("button", { name: "添加项目事项" }))

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /补充验收记录/ })).not.toBeNull()
    })

    const stored = JSON.parse(window.localStorage.getItem("todo_items") ?? "[]") as Array<{
      title: string
      projectId: string
    }>
    expect(stored.find((todo) => todo.title === "补充验收记录")?.projectId).toBe(
      "project_launch"
    )
  })

  it("infers the project composer target for model todo.add actions", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  type: "interaction_action",
                  resolution: {
                    status: "resolved",
                    utterance: "帮我在生活整理项目里增加买鸡蛋",
                    actionId: "todo.add",
                    confidence: 0.92,
                    params: { title: "买鸡蛋" },
                  },
                }),
              },
            },
          ],
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

    fireEvent.click(screen.getByRole("button", { name: "项目" }))
    fireEvent.click(screen.getByRole("button", { name: /生活整理/ }))
    fireEvent.click(screen.getByRole("button", { name: "Chatbot" }))
    fireEvent.change(screen.getByLabelText("消息"), {
      target: { value: "帮我在生活整理项目里增加买鸡蛋" },
    })
    fireEvent.click(screen.getByRole("button", { name: "发送" }))

    await waitFor(() => {
      expect(screen.getByText("已添加待办：买鸡蛋。")).not.toBeNull()
      expect(screen.getByRole("button", { name: /买鸡蛋/ })).not.toBeNull()
    })

    const stored = JSON.parse(window.localStorage.getItem("todo_items") ?? "[]") as Array<{
      title: string
      projectId: string
    }>
    expect(stored.find((todo) => todo.title === "买鸡蛋")?.projectId).toBe("project_personal")
  })

  it("keeps tomorrow dates when adding todos from the calendar assistant", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  type: "interaction_actions",
                  resolutions: [
                    {
                      status: "resolved",
                      utterance: "明天帮我增加两个事情，第一是去拜访客户，第二是回学校拿东西",
                      actionId: "todo.add",
                      confidence: 0.92,
                      params: { title: "去拜访客户" },
                    },
                    {
                      status: "resolved",
                      utterance: "明天帮我增加两个事情，第一是去拜访客户，第二是回学校拿东西",
                      actionId: "todo.add",
                      confidence: 0.92,
                      params: { title: "回学校拿东西" },
                    },
                  ],
                }),
              },
            },
          ],
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

    fireEvent.click(screen.getByRole("button", { name: "日历" }))
    fireEvent.click(screen.getByRole("button", { name: "Chatbot" }))
    fireEvent.change(screen.getByLabelText("消息"), {
      target: { value: "明天帮我增加两个事情，第一是去拜访客户，第二是回学校拿东西" },
    })
    fireEvent.click(screen.getByRole("button", { name: "发送" }))

    await waitFor(() => {
      expect(screen.getByText("已执行 2 个操作。")).not.toBeNull()
      expect(screen.getByRole("button", { name: /去拜访客户/ })).not.toBeNull()
      expect(screen.getByRole("button", { name: /回学校拿东西/ })).not.toBeNull()
    })

    const stored = JSON.parse(window.localStorage.getItem("todo_items") ?? "[]") as Array<{
      title: string
      due: string
    }>
    expect(stored.find((todo) => todo.title === "去拜访客户")?.due).toBe("明天")
    expect(stored.find((todo) => todo.title === "回学校拿东西")?.due).toBe("明天")
  })

  it("updates existing todo due dates from model actions", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  type: "interaction_actions",
                  resolutions: [
                    {
                      status: "resolved",
                      utterance: "把去拜访客户和回学校拿东西改到明天",
                      targetId: "todo_1",
                      actionId: "todo.update",
                      confidence: 0.92,
                      params: { due: "明天" },
                    },
                    {
                      status: "resolved",
                      utterance: "把去拜访客户和回学校拿东西改到明天",
                      targetId: "todo_2",
                      actionId: "todo.update",
                      confidence: 0.92,
                      params: { due: "明天" },
                    },
                  ],
                }),
              },
            },
          ],
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

    fireEvent.click(screen.getByRole("button", { name: "日历" }))
    fireEvent.click(screen.getByRole("button", { name: "Chatbot" }))
    fireEvent.change(screen.getByLabelText("消息"), {
      target: { value: "把买牛奶和写周报改到明天" },
    })
    fireEvent.click(screen.getByRole("button", { name: "发送" }))

    await waitFor(() => {
      expect(screen.getByText("已执行 2 个操作。")).not.toBeNull()
    })

    const stored = JSON.parse(window.localStorage.getItem("todo_items") ?? "[]") as Array<{
      id: string
      due: string
    }>
    expect(stored.find((todo) => todo.id === "todo_1")?.due).toBe("明天")
    expect(stored.find((todo) => todo.id === "todo_2")?.due).toBe("明天")
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

  it("persists todo changes in localStorage across remounts", async () => {
    render(<App />)

    fireEvent.click(screen.getByRole("button", { name: "待办" }))
    fireEvent.click(screen.getByLabelText("完成 买牛奶"))

    await waitFor(() => {
      const stored = JSON.parse(window.localStorage.getItem("todo_items") ?? "[]") as Array<{
        id: string
        completed: boolean
      }>
      expect(stored.find((todo) => todo.id === "todo_1")?.completed).toBe(true)
    })

    cleanup()
    render(<App />)

    fireEvent.click(screen.getByRole("button", { name: "待办" }))

    await waitFor(() => {
      expect((screen.getByLabelText("取消完成 买牛奶") as HTMLInputElement).checked).toBe(true)
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
    expect(screen.getByText("MiniMaxAI/MiniMax-M2.5")).not.toBeNull()
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

  it("keeps the floating chatbot open while switching pages", () => {
    render(<App />)

    fireEvent.click(screen.getByRole("button", { name: "Chatbot" }))
    fireEvent.click(screen.getByRole("button", { name: "设置" }))

    expect(window.location.pathname).toBe("/settings")
    expect(screen.getByRole("heading", { level: 1, name: "设置" })).not.toBeNull()
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

    const body = JSON.parse(String(calls[0][1].body)) as {
      messages: Array<{ role: string; content: string }>
    }
    expect(body.messages[0].role).toBe("system")
    expect(body.messages[0].content).toContain("Interaction Snapshot")
    expect(body.messages[0].content).toContain("买牛奶")
    expect(body.messages[0].content).toContain("写周报")
    expect(body.messages[0].content).toContain("visibleObjects")
    expect(body.messages[0].content).toContain('"manifest"')
    expect(body.messages[0].content).toContain('"navigation.goto"')
    expect(body.messages[0].content).toContain('"app.route.settings"')
    expect(body.messages[0].content).toContain('"app.route.projects"')
    expect(body.messages[0].content).toContain('"app.route.kanban"')
    expect(body.messages[0].content).toContain('"project.entity.project_launch"')
  })

  it("falls back to the LLM for todo commands outside the local JSON allowlist", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  type: "interaction_action",
                  resolution: {
                    status: "resolved",
                    utterance: "帮我将买牛奶改成完成",
                    targetId: "todo_1",
                    actionId: "todo.complete",
                    confidence: 0.92,
                  },
                }),
              },
            },
          ],
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

    fireEvent.click(screen.getByRole("button", { name: "待办" }))
    fireEvent.click(screen.getByRole("button", { name: "Chatbot" }))
    fireEvent.change(screen.getByLabelText("消息"), {
      target: { value: "帮我将买牛奶改成完成" },
    })
    fireEvent.click(screen.getByRole("button", { name: "发送" }))

    await waitFor(() => {
      expect(screen.getByText("已将「买牛奶」标记为完成。")).not.toBeNull()
    })
    expect((screen.getByLabelText("取消完成 买牛奶") as HTMLInputElement).checked).toBe(true)
    expect(fetchMock).toHaveBeenCalled()
  })

  it("updates todo detail from an LLM action without navigating first", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: [
                  "<minimax:tool_call>",
                  '<invoke name="todo.update">',
                  '<parameter name="targetId">todo_1</parameter>',
                  '<parameter name="description">看《铁达尼号》</parameter>',
                  "</invoke>",
                  "</minimax:tool_call>",
                ].join("\n"),
              },
            },
          ],
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
      target: { value: "买牛奶的详情页里是看《铁达尼号》" },
    })
    fireEvent.click(screen.getByRole("button", { name: "发送" }))

    await waitFor(() => {
      expect(screen.getByText("已执行：todo.update。")).not.toBeNull()
    })

    fireEvent.click(screen.getByRole("button", { name: "待办" }))
    fireEvent.click(screen.getByRole("button", { name: /买牛奶/ }))

    await waitFor(() => {
      expect((screen.getByLabelText("详情") as HTMLTextAreaElement).value).toBe(
        "看《铁达尼号》"
      )
    })
  })

  it("executes natural completion phrasing from an LLM action reply", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  type: "interaction_action",
                  resolution: {
                    status: "resolved",
                    utterance: "牛奶买了",
                    targetId: "todo.item.todo_1",
                    actionId: "todo.complete",
                    confidence: 0.92,
                  },
                  reply: "已将「买牛奶」标记为完成。",
                }),
              },
            },
          ],
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

    fireEvent.click(screen.getByRole("button", { name: "待办" }))
    fireEvent.click(screen.getByRole("button", { name: "Chatbot" }))
    fireEvent.change(screen.getByLabelText("消息"), {
      target: { value: "牛奶买了" },
    })
    fireEvent.click(screen.getByRole("button", { name: "发送" }))

    await waitFor(() => {
      expect(screen.getByText("已将「买牛奶」标记为完成。")).not.toBeNull()
    })
    expect((screen.getByLabelText("取消完成 买牛奶") as HTMLInputElement).checked).toBe(true)
    expect(fetchMock).toHaveBeenCalled()
  })

  it("executes loose LLM action JSON with entity ids", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: [
                  "```json",
                  "{",
                  '  "intent": "标记为已完成",',
                  '  "action": "todo.complete",',
                  '  "targetId": "todo_1"',
                  "}",
                  "```",
                ].join("\n"),
              },
            },
          ],
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

    fireEvent.click(screen.getByRole("button", { name: "待办" }))
    fireEvent.click(screen.getByRole("button", { name: "Chatbot" }))
    fireEvent.change(screen.getByLabelText("消息"), {
      target: { value: "牛奶买好了" },
    })
    fireEvent.click(screen.getByRole("button", { name: "发送" }))

    await waitFor(() => {
      expect(screen.getByText("已将「买牛奶」标记为完成。")).not.toBeNull()
    })
    expect((screen.getByLabelText("取消完成 买牛奶") as HTMLInputElement).checked).toBe(true)
  })

  it("executes MiniMax tool-call XML with entity ids", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: [
                  "<minimax:tool_call>",
                  '<invoke name="todo.complete">',
                  '<parameter name="targetId">todo_1</parameter>',
                  "</invoke>",
                  "</minimax:tool_call>",
                ].join("\n"),
              },
            },
          ],
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

    fireEvent.click(screen.getByRole("button", { name: "待办" }))
    fireEvent.click(screen.getByRole("button", { name: "Chatbot" }))
    fireEvent.change(screen.getByLabelText("消息"), {
      target: { value: "牛奶买好了" },
    })
    fireEvent.click(screen.getByRole("button", { name: "发送" }))

    await waitFor(() => {
      expect(screen.getByText("已将「买牛奶」标记为完成。")).not.toBeNull()
    })
    expect((screen.getByLabelText("取消完成 买牛奶") as HTMLInputElement).checked).toBe(true)
  })

  it("executes batched LLM actions for all incomplete todos", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  type: "interaction_actions",
                  resolutions: [
                    {
                      status: "resolved",
                      utterance: "把全部任务都设置成完成",
                      targetId: "todo_1",
                      actionId: "todo.complete",
                      confidence: 0.92,
                    },
                    {
                      status: "resolved",
                      utterance: "把全部任务都设置成完成",
                      targetId: "todo_2",
                      actionId: "todo.complete",
                      confidence: 0.92,
                    },
                  ],
                  reply: "已将全部未完成任务标记为完成。",
                }),
              },
            },
          ],
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

    fireEvent.click(screen.getByRole("button", { name: "待办" }))
    fireEvent.click(screen.getByRole("button", { name: "Chatbot" }))
    fireEvent.change(screen.getByLabelText("消息"), {
      target: { value: "把全部任务都设置成完成" },
    })
    fireEvent.click(screen.getByRole("button", { name: "发送" }))

    await waitFor(() => {
      expect(screen.getByText("已将全部未完成任务标记为完成。")).not.toBeNull()
      expect((screen.getByLabelText("取消完成 买牛奶") as HTMLInputElement).checked).toBe(true)
      expect((screen.getByLabelText("取消完成 写周报") as HTMLInputElement).checked).toBe(true)
      expect((screen.getByLabelText("取消完成 整理发布清单") as HTMLInputElement).checked).toBe(
        true
      )
    })
  })

  it("infers completion when MiniMax returns empty todo.update tool calls", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: [
                  "<minimax:tool_call>",
                  '<invoke name="todo.update"><parameter name="targetId">todo_1</parameter></invoke>',
                  '<invoke name="todo.update"><parameter name="targetId">todo_2</parameter></invoke>',
                  "</minimax:tool_call>",
                ].join("\n"),
              },
            },
          ],
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

    fireEvent.click(screen.getByRole("button", { name: "待办" }))
    fireEvent.click(screen.getByRole("button", { name: "Chatbot" }))
    fireEvent.change(screen.getByLabelText("消息"), {
      target: { value: "全部任务完成了" },
    })
    fireEvent.click(screen.getByRole("button", { name: "发送" }))

    await waitFor(() => {
      expect(screen.getByText("已执行 2 个操作。")).not.toBeNull()
      expect((screen.getByLabelText("取消完成 买牛奶") as HTMLInputElement).checked).toBe(true)
      expect((screen.getByLabelText("取消完成 写周报") as HTMLInputElement).checked).toBe(true)
    })
  })

  it("executes MiniMax add tool-call XML without targetId", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: [
                  "<minimax:tool_call>",
                  'invoke name="todo.add"><parameter name="targetId">todo.composer</parameter><parameter name="title">写作业</parameter>',
                  "</invoke>",
                  "</minimax:tool_call>",
                ].join("\n"),
              },
            },
          ],
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

    fireEvent.click(screen.getByRole("button", { name: "待办" }))
    fireEvent.click(screen.getByRole("button", { name: "Chatbot" }))
    fireEvent.change(screen.getByLabelText("消息"), {
      target: { value: "新增一个事项：写作业" },
    })
    fireEvent.click(screen.getByRole("button", { name: "发送" }))

    await waitFor(() => {
      expect(screen.getByText("已添加待办：写作业。")).not.toBeNull()
      expect(screen.getByRole("button", { name: /写作业/ })).not.toBeNull()
    })

    const stored = JSON.parse(window.localStorage.getItem("todo_items") ?? "[]") as Array<{
      title: string
    }>
    expect(stored.some((todo) => todo.title === "写作业")).toBe(true)
  })

  it("requires confirmation before executing risky LLM actions", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  type: "interaction_action",
                  resolution: {
                    status: "resolved",
                    utterance: "删除买牛奶",
                    targetId: "todo_1",
                    actionId: "todo.delete",
                    confidence: 0.92,
                  },
                }),
              },
            },
          ],
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

    fireEvent.click(screen.getByRole("button", { name: "待办" }))
    fireEvent.click(screen.getByRole("button", { name: "Chatbot" }))
    fireEvent.change(screen.getByLabelText("消息"), {
      target: { value: "删掉买牛奶" },
    })
    fireEvent.click(screen.getByRole("button", { name: "发送" }))

    await waitFor(() => {
      expect(screen.getAllByText(/这个操作需要确认：todo.delete/).length).toBeGreaterThan(0)
      expect(screen.getByRole("button", { name: "确认执行" })).not.toBeNull()
    })
    expect(screen.getByRole("button", { name: /买牛奶/ })).not.toBeNull()

    fireEvent.click(screen.getByRole("button", { name: "确认执行" }))

    await waitFor(() => {
      expect(screen.getByText("已删除「买牛奶」。")).not.toBeNull()
      expect(screen.queryByRole("button", { name: /买牛奶/ })).toBeNull()
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("lets the LLM clarify bare completion instead of selecting the completed filter", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "你想完成哪一项？" } }],
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

    fireEvent.click(screen.getByRole("button", { name: "待办" }))
    fireEvent.click(screen.getByRole("button", { name: "Chatbot" }))
    fireEvent.change(screen.getByLabelText("消息"), {
      target: { value: "完成" },
    })
    fireEvent.click(screen.getByRole("button", { name: "发送" }))

    await waitFor(() => {
      expect(screen.getByText("你想完成哪一项？")).not.toBeNull()
    })
    expect(screen.queryByText("已执行：select。")).toBeNull()
    expect(fetchMock).toHaveBeenCalled()
  })

  it("navigates locally from chatbot messages", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)

    render(<App />)

    fireEvent.click(screen.getByRole("button", { name: "待办" }))
    fireEvent.click(screen.getByRole("button", { name: "Chatbot" }))
    fireEvent.change(screen.getByLabelText("消息"), {
      target: { value: "回到首页" },
    })
    fireEvent.click(screen.getByRole("button", { name: "发送" }))

    await waitFor(() => {
      expect(window.location.pathname).toBe("/")
      expect(screen.getByRole("heading", { level: 1, name: "首页" })).not.toBeNull()
      expect(screen.getByText("已打开首页。")).not.toBeNull()
    })

    fireEvent.change(screen.getByLabelText("消息"), {
      target: { value: "打开待办页面" },
    })
    fireEvent.click(screen.getByRole("button", { name: "发送" }))

    await waitFor(() => {
      expect(window.location.pathname).toBe("/todos")
      expect(screen.getByRole("heading", { level: 1, name: "待办" })).not.toBeNull()
      expect(screen.getByText("已打开待办。")).not.toBeNull()
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("moves backward and forward locally from chatbot messages", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)

    render(<App />)

    fireEvent.click(screen.getByRole("button", { name: "Chatbot" }))
    fireEvent.change(screen.getByLabelText("消息"), {
      target: { value: "打开日历" },
    })
    fireEvent.click(screen.getByRole("button", { name: "发送" }))

    await waitFor(() => {
      expect(window.location.pathname).toBe("/calendar")
      expect(screen.getByRole("heading", { level: 1, name: "日历" })).not.toBeNull()
      expect(screen.getByText("已打开日历。")).not.toBeNull()
    })

    fireEvent.change(screen.getByLabelText("消息"), {
      target: { value: "返回上一页" },
    })
    fireEvent.click(screen.getByRole("button", { name: "发送" }))

    await waitFor(() => {
      expect(window.location.pathname).toBe("/")
      expect(screen.getByRole("heading", { level: 1, name: "首页" })).not.toBeNull()
      expect(screen.getByText("已返回上一页。")).not.toBeNull()
    })

    fireEvent.change(screen.getByLabelText("消息"), {
      target: { value: "前进下一页" },
    })
    fireEvent.click(screen.getByRole("button", { name: "发送" }))

    await waitFor(() => {
      expect(window.location.pathname).toBe("/calendar")
      expect(screen.getByRole("heading", { level: 1, name: "日历" })).not.toBeNull()
      expect(screen.getByText("已前进到下一页。")).not.toBeNull()
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("asks for an API key before sending chatbot messages", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    render(<App />)

    fireEvent.click(screen.getByRole("button", { name: "Chatbot" }))
    fireEvent.change(screen.getByLabelText("消息"), {
      target: { value: "帮我拆任务" },
    })
    fireEvent.click(screen.getByRole("button", { name: "发送" }))

    await waitFor(() => {
      expect(screen.getByText("请先在设置页填写 API Key。")).not.toBeNull()
    })
    expect(fetchMock).not.toHaveBeenCalled()
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
