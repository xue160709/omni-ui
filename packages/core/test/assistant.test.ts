import { describe, expect, it } from "vitest"
import {
  createInteractionSnapshot,
  parseInteractionAssistantModelReply,
  shouldSubmitResolvedInteraction,
  validateResolvedInteractionPolicy,
  type RegisteredActionSpec,
  type ResolvedInteraction,
} from "../src"

const resolvedComplete: ResolvedInteraction = {
  status: "resolved",
  utterance: "完成评审方案",
  targetId: "task.item.task_1",
  actionId: "task.complete",
  confidence: 0.91,
}

describe("assistant action policy", () => {
  it("keeps the boolean local execution helper for existing callers", () => {
    expect(
      shouldSubmitResolvedInteraction(resolvedComplete, {
        mode: "allowlist",
        actionIds: ["task.*"],
      })
    ).toBe(true)

    expect(
      shouldSubmitResolvedInteraction(resolvedComplete, {
        mode: "allowlist",
        actionIds: ["navigation.*"],
      })
    ).toBe(false)
  })

  it("returns a structured denial for model actions outside the policy", () => {
    expect(
      validateResolvedInteractionPolicy(
        resolvedComplete,
        {
          mode: "allowlist",
          actionIds: ["navigation.*"],
        },
        { source: "model" }
      )
    ).toMatchObject({
      ok: false,
      code: "policy_denied",
      reason: "模型动作策略未放行该 action",
    })
  })

  it("can require confirmation by action risk level", () => {
    const actionSpecs: Record<string, RegisteredActionSpec> = {
      "task.delete": {
        id: "task.delete",
        attachTo: { entityType: "task" },
        executeScope: "object",
        risk: "medium",
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
        },
      ],
    })
    const resolution: ResolvedInteraction = {
      status: "resolved",
      utterance: "删除评审方案",
      targetId: "task.item.task_1",
      actionId: "task.delete",
      confidence: 0.92,
    }

    expect(
      validateResolvedInteractionPolicy(
        resolution,
        {
          mode: "allowlist",
          actionIds: ["task.*"],
          requireConfirmationForRisk: ["medium", "high"],
        },
        { snapshot, source: "model" }
      )
    ).toMatchObject({
      ok: false,
      code: "confirmation_required",
    })

    expect(
      validateResolvedInteractionPolicy(
        resolution,
        {
          mode: "allowlist",
          actionIds: ["task.*"],
          requireConfirmationForRisk: ["medium", "high"],
        },
        { snapshot, confirmedActionId: "task.delete", source: "model" }
      )
    ).toEqual({ ok: true })
  })
})

describe("assistant model reply parser", () => {
  it("parses batched interaction action JSON", () => {
    const parsed = parseInteractionAssistantModelReply(
      JSON.stringify({
        type: "interaction_actions",
        resolutions: [
          {
            status: "resolved",
            targetId: "task.item.task_1",
            actionId: "task.complete",
            confidence: 0.91,
          },
          {
            status: "resolved",
            targetId: "task.item.task_2",
            actionId: "task.complete",
            confidence: 0.9,
          },
        ],
        reply: "已完成全部任务。",
      }),
      "把全部任务都设置成完成"
    )

    expect(parsed).toMatchObject({
      type: "interaction_actions",
      resolutions: [
        {
          utterance: "把全部任务都设置成完成",
          targetId: "task.item.task_1",
          actionId: "task.complete",
        },
        {
          utterance: "把全部任务都设置成完成",
          targetId: "task.item.task_2",
          actionId: "task.complete",
        },
      ],
      reply: "已完成全部任务。",
    })
  })

  it("parses MiniMax tool-call XML without requiring targetId", () => {
    const parsed = parseInteractionAssistantModelReply(
      [
        "<minimax:tool_call>",
        '<invoke name="task.create">',
        "<parameter name=\"title\">发布说明</parameter>",
        "</invoke>",
        "</minimax:tool_call>",
      ].join("\n"),
      "创建任务：发布说明"
    )

    expect(parsed).toMatchObject({
      type: "interaction_action",
      resolution: {
        actionId: "task.create",
        targetId: undefined,
        params: {
          title: "发布说明",
        },
      },
    })
  })

  it("parses multiple MiniMax tool-call XML invokes as a batch", () => {
    const parsed = parseInteractionAssistantModelReply(
      [
        "<minimax:tool_call>",
        '<invoke name="task.complete">',
        '<parameter name="targetId">task.item.task_1</parameter>',
        "</invoke>",
        '<invoke name="task.complete">',
        '<parameter name="targetId">task.item.task_2</parameter>',
        "</invoke>",
        "</minimax:tool_call>",
      ].join("\n"),
      "全部完成"
    )

    expect(parsed).toMatchObject({
      type: "interaction_actions",
      resolutions: [
        {
          actionId: "task.complete",
          targetId: "task.item.task_1",
        },
        {
          actionId: "task.complete",
          targetId: "task.item.task_2",
        },
      ],
    })
  })

  it("parses MiniMax tool-call XML when invoke is missing its opening bracket", () => {
    const parsed = parseInteractionAssistantModelReply(
      [
        "<minimax:tool_call>",
        'invoke name="task.create"><parameter name="targetId">task.composer</parameter><parameter name="title">发布说明</parameter>',
        "</invoke>",
        "</minimax:tool_call>",
      ].join("\n"),
      "创建任务：发布说明"
    )

    expect(parsed).toMatchObject({
      type: "interaction_action",
      resolution: {
        actionId: "task.create",
        targetId: "task.composer",
        params: {
          targetId: "task.composer",
          title: "发布说明",
        },
      },
    })
  })
})
