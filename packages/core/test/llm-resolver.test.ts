import { describe, expect, it } from "vitest"
import {
  createAnthropicResolver,
  createInteractionSnapshot,
  createLlmResolver,
  createOpenAIResolver,
  normalizeLlmOutput,
} from "../src"

describe("llm resolver", () => {
  it("normalizes target candidates and picks the highest-confidence target", () => {
    expect(
      normalizeLlmOutput(
        {
          status: "resolved",
          utterance: "把买牛奶那个完成",
          intent: "complete_todo",
          actionId: "todo.complete",
          targetCandidates: [
            { id: "todo.item.todo_2", confidence: 0.2 },
            { id: "todo.item.todo_1", confidence: 0.91 },
          ],
          confidence: 0.88,
        },
        "把买牛奶那个完成"
      )
    ).toMatchObject({
      status: "resolved",
      targetId: "todo.item.todo_1",
      resolverId: "llm",
    })
  })

  it("fails safely on invalid JSON", async () => {
    const resolver = createLlmResolver({
      complete: () => "not json",
    })
    const snapshot = createInteractionSnapshot({
      stateVersion: 1,
      visibleObjects: [],
    })

    await expect(resolver.resolve({ utterance: "do it", snapshot })).resolves.toMatchObject({
      status: "unsupported",
      confidence: 0,
    })
  })

  it("calls OpenAI-compatible chat completions with env credentials", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = []
    const resolver = createOpenAIResolver({
      baseUrl: "https://llm.example/v1",
      model: "test-model",
      env: { OPENAI_API_KEY: "sk-test" },
      fetch: async (url, init) => {
        calls.push({ url: String(url), init })
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    status: "resolved",
                    utterance: "完成第一个",
                    targetId: "todo.item.todo_1",
                    actionId: "todo.complete",
                    confidence: 0.91,
                  }),
                },
              },
            ],
          }),
          { status: 200 }
        )
      },
    })
    const snapshot = createInteractionSnapshot({
      stateVersion: 1,
      visibleObjects: [],
    })

    await expect(resolver.resolve({ utterance: "完成第一个", snapshot })).resolves.toMatchObject({
      status: "resolved",
      targetId: "todo.item.todo_1",
      actionId: "todo.complete",
      resolverId: "openai",
    })
    expect(calls[0].url).toBe("https://llm.example/v1/chat/completions")
    expect((calls[0].init?.headers as Record<string, string>).authorization).toBe("Bearer sk-test")
  })

  it("calls Anthropic messages with env credentials", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = []
    const resolver = createAnthropicResolver({
      baseUrl: "https://anthropic.example/v1",
      model: "test-model",
      env: { ANTHROPIC_API_KEY: "sk-ant-test" },
      fetch: async (url, init) => {
        calls.push({ url: String(url), init })
        return new Response(
          JSON.stringify({
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  status: "resolved",
                  utterance: "打开蓝牙",
                  targetId: "settings.bluetooth",
                  actionId: "settings.bluetooth.turnOn",
                  confidence: 0.9,
                }),
              },
            ],
          }),
          { status: 200 }
        )
      },
    })
    const snapshot = createInteractionSnapshot({
      stateVersion: 1,
      visibleObjects: [],
    })

    await expect(resolver.resolve({ utterance: "打开蓝牙", snapshot })).resolves.toMatchObject({
      status: "resolved",
      targetId: "settings.bluetooth",
      actionId: "settings.bluetooth.turnOn",
      resolverId: "anthropic",
    })
    expect(calls[0].url).toBe("https://anthropic.example/v1/messages")
    expect((calls[0].init?.headers as Record<string, string>)["x-api-key"]).toBe("sk-ant-test")
  })
})
