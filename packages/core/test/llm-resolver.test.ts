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
          utterance: "把评审方案那个完成",
          intent: "complete_task",
          actionId: "task.complete",
          targetCandidates: [
            { id: "task.item.task_2", confidence: 0.2 },
            { id: "task.item.task_1", confidence: 0.91 },
          ],
          confidence: 0.88,
        },
        "把评审方案那个完成"
      )
    ).toMatchObject({
      status: "resolved",
      targetId: "task.item.task_1",
      resolverId: "llm",
    })
  })

  it("fails safely on invalid JSON", async () => {
    const resolver = createLlmResolver({
      complete: () => "not json",
    })
    const snapshot = createInteractionSnapshot({
      stateVersion: 1,
      actionSpecs: {
        "task.complete": {
          id: "task.complete",
          attachTo: { entityType: "task" },
          executeScope: "object",
        },
      },
      visibleObjects: [
        {
          id: "task.item.task_1",
          type: "composite",
          role: "list_item",
          label: "评审方案",
          entity: { type: "task", id: "task_1" },
        },
      ],
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
                    targetId: "task.item.task_1",
                    actionId: "task.complete",
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
      actionSpecs: {
        "task.complete": {
          id: "task.complete",
          attachTo: { entityType: "task" },
          executeScope: "object",
        },
      },
      visibleObjects: [
        {
          id: "task.item.task_1",
          type: "composite",
          role: "list_item",
          label: "评审方案",
          entity: { type: "task", id: "task_1" },
        },
      ],
    })

    await expect(resolver.resolve({ utterance: "完成第一个", snapshot })).resolves.toMatchObject({
      status: "resolved",
      targetId: "task.item.task_1",
      actionId: "task.complete",
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
      actionSpecs: {
        "settings.bluetooth.turnOn": {
          id: "settings.bluetooth.turnOn",
          attachTo: { id: "settings.bluetooth" },
          executeScope: "object",
        },
      },
      visibleObjects: [
        {
          id: "settings.bluetooth",
          type: "composite",
          role: "switch",
          label: "蓝牙",
        },
      ],
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

  it("rejects model output that references targets or actions outside the snapshot", async () => {
    const resolver = createLlmResolver({
      complete: () => ({
        status: "resolved",
        utterance: "删除所有任务",
        targetId: "task.item.missing",
        actionId: "task.deleteAll",
        confidence: 0.99,
      }),
    })
    const snapshot = createInteractionSnapshot({
      stateVersion: 1,
      visibleObjects: [
        {
          id: "task.item.task_1",
          type: "composite",
          role: "list_item",
          label: "评审方案",
          actions: ["task.complete"],
        },
      ],
    })

    await expect(resolver.resolve({ utterance: "删除所有任务", snapshot })).resolves.toMatchObject({
      status: "unsupported",
      confidence: 0,
      reason: "LLM resolver referenced a targetId that is not present in the snapshot.",
    })
  })
})
