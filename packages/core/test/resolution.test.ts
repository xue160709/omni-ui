import { describe, expect, it } from "vitest"
import {
  adaptLegacyIntentResolver,
  createInteractionSnapshot,
  createInteractionTurn,
  createSnapshotAnchor,
  resolveInteractionTurn,
  type IntentResolver,
  type IntentResolverV2,
} from "../src"

describe("turn resolution", () => {
  it("does not call model resolvers in rule-first mode once rule fusion is ready", async () => {
    const snapshot = taskSnapshot()
    const turn = createInteractionTurn({
      id: "turn_rule_first",
      source: "text",
      input: { kind: "text", text: "完成评审方案", receivedAt: 1000 },
      anchor: createSnapshotAnchor(snapshot, { capturedAt: 1000 }),
      now: 1000,
    })
    let modelCalls = 0
    const ruleResolver: IntentResolverV2 = {
      id: "rule",
      resolve: () => ({
        kind: "hypotheses",
        resolverId: "rule",
        hypotheses: [
          {
            id: "rule.hypothesis.1",
            resolverId: "rule",
            source: "rule",
            intent: "task.complete",
            actionHint: "task.complete",
            targetReference: { kind: "explicit_id", objectId: "task.item.task_1" },
            slots: {},
            confidence: 0.98,
          },
        ],
      }),
    }
    const modelResolver: IntentResolverV2 = {
      id: "test-llm",
      resolve: () => {
        modelCalls += 1
        return {
          kind: "hypotheses",
          resolverId: "test-llm",
          hypotheses: [],
        }
      },
    }

    const bundle = await resolveInteractionTurn({
      turn,
      snapshot,
      contextEpoch: snapshot.contextEpoch,
      resolvers: [modelResolver, ruleResolver],
      mode: "rule-first",
      now: 1000,
    })

    expect(modelCalls).toBe(0)
    expect(bundle.resolverIds).toEqual(["rule"])
    expect(bundle.fusion).toMatchObject({
      status: "ready",
      decision: { targetId: "task.item.task_1", actionId: "task.complete" },
    })
    expect("fusionContext" in bundle).toBe(false)
    expect(bundle.fusionSummary).toEqual({
      contextEpoch: snapshot.contextEpoch,
      eventWindow: {
        start: 1000,
        end: 1000,
        eventIds: [],
      },
      referenceAt: 1000,
    })
  })

  it("preserves multiple legacy resolver results as fusion hypotheses", async () => {
    const snapshot = taskSnapshot()
    const turn = createInteractionTurn({
      id: "turn_legacy_many",
      source: "text",
      input: { kind: "text", text: "完成任务", receivedAt: 1000 },
      anchor: createSnapshotAnchor(snapshot, { capturedAt: 1000 }),
      now: 1000,
    })
    const legacyResolver: IntentResolver = {
      id: "legacy",
      resolve: () => [
        {
          status: "resolved",
          utterance: "完成任务",
          intent: "task.complete",
          targetId: "task.item.task_1",
          actionId: "task.complete",
          confidence: 0.92,
          resolverId: "legacy-a",
        },
        {
          status: "resolved",
          utterance: "完成任务",
          intent: "task.complete",
          targetId: "task.item.task_2",
          actionId: "task.complete",
          confidence: 0.88,
          resolverId: "legacy-b",
        },
      ],
    }

    const bundle = await resolveInteractionTurn({
      turn,
      snapshot,
      contextEpoch: snapshot.contextEpoch,
      resolvers: [adaptLegacyIntentResolver(legacyResolver)],
      mode: "rule-first",
      now: 1000,
    })

    expect(bundle.hypotheses.map((item) => item.targetReference)).toEqual([
      { kind: "explicit_id", objectId: "task.item.task_1" },
      { kind: "explicit_id", objectId: "task.item.task_2" },
    ])
    expect(bundle.fusion.candidates.map((candidate) => candidate.targetId)).toEqual([
      "task.item.task_1",
      "task.item.task_2",
    ])
  })
})

function taskSnapshot() {
  return createInteractionSnapshot({
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
        actions: ["task.complete"],
      },
      {
        id: "task.item.task_2",
        type: "composite",
        role: "list_item",
        label: "复盘",
        entity: { type: "task", id: "task_2" },
        actions: ["task.complete"],
      },
    ],
  })
}
