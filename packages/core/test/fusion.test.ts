import { describe, expect, it } from "vitest"
import {
  createInteractionSnapshot,
  createUnifiedFocus,
  rankInteractionCandidates,
  setSemanticFocus,
  type SemanticIntentHypothesis,
} from "../src"

describe("fusion ranker", () => {
  it("asks for clarification instead of silently picking the first same-label target", () => {
    const snapshot = createInteractionSnapshot({
      stateVersion: 1,
      actionSpecs: {
        "todo.complete": {
          id: "todo.complete",
          attachTo: { entityType: "todo" },
          executeScope: "object",
        },
      },
      visibleObjects: [
        {
          id: "todo.1",
          type: "composite",
          role: "list_item",
          label: "复盘",
          entity: { type: "todo", id: "1" },
        },
        {
          id: "todo.2",
          type: "composite",
          role: "list_item",
          label: "复盘",
          entity: { type: "todo", id: "2" },
        },
      ],
    })

    expect(rankInteractionCandidates(snapshot, [hypothesis({ kind: "label", text: "复盘" })]))
      .toMatchObject({
        status: "needs_clarification",
      })
  })

  it("hard-rejects action/target mismatches even with high semantic confidence", () => {
    const snapshot = createInteractionSnapshot({
      stateVersion: 1,
      actionSpecs: {
        "todo.complete": {
          id: "todo.complete",
          attachTo: { entityType: "todo" },
          executeScope: "object",
        },
      },
      visibleObjects: [
        {
          id: "note.1",
          type: "composite",
          role: "list_item",
          label: "复盘",
          entity: { type: "note", id: "1" },
          actions: ["todo.complete"],
        },
      ],
    })
    const result = rankInteractionCandidates(snapshot, [
      hypothesis({ kind: "label", text: "复盘" }, { confidence: 0.99 }),
    ])

    expect(result.status).toBe("not_found")
    expect(result.candidates[0]?.rejected).toMatchObject({
      code: "action_target_mismatch",
    })
  })

  it("treats model target hints as weak evidence rather than authorization", () => {
    const snapshot = createInteractionSnapshot({
      stateVersion: 1,
      actionSpecs: {
        "todo.complete": {
          id: "todo.complete",
          attachTo: { entityType: "todo" },
          executeScope: "object",
        },
      },
      visibleObjects: [
        {
          id: "todo.1",
          type: "composite",
          role: "list_item",
          label: "复盘",
          entity: { type: "todo", id: "1" },
        },
      ],
    })

    expect(
      rankInteractionCandidates(snapshot, [
        hypothesis(
          { kind: "unspecified" },
          { confidence: 0.75, modelTargetIdHint: "todo.1" }
        ),
      ])
    ).toMatchObject({
      status: "needs_clarification",
    })
  })

  it("can resolve deictic references from semantic focus", () => {
    const focus = setSemanticFocus(createUnifiedFocus(), "todo.1", { timestamp: 100 })
    const snapshot = createInteractionSnapshot({
      stateVersion: 1,
      unifiedFocus: focus,
      actionSpecs: {
        "todo.complete": {
          id: "todo.complete",
          attachTo: { entityType: "todo" },
          executeScope: "object",
        },
      },
      visibleObjects: [
        {
          id: "todo.1",
          type: "composite",
          role: "list_item",
          label: "复盘",
          entity: { type: "todo", id: "1" },
        },
      ],
    })

    expect(
      rankInteractionCandidates(snapshot, [
        hypothesis({ kind: "deictic", expression: "这个" }, { confidence: 0.95 }),
      ])
    ).toMatchObject({
      status: "ready",
      decision: { targetId: "todo.1", actionId: "todo.complete" },
    })
  })

  it("uses primitive action hints when a target exposes multiple primitive actions", () => {
    const snapshot = createInteractionSnapshot({
      stateVersion: 1,
      visibleObjects: [
        {
          id: "button.archive",
          type: "raw",
          role: "button",
          label: "归档",
          primitiveActions: ["focus", "press"],
        },
      ],
    })

    expect(
      rankInteractionCandidates(snapshot, [
        hypothesis(
          { kind: "explicit_id", objectId: "button.archive" },
          { actionHint: "press", confidence: 0.95 }
        ),
      ])
    ).toMatchObject({
      status: "ready",
      decision: { targetId: "button.archive", primitiveAction: "press" },
    })
  })

  it("does not infer the first action when no action is explicitly eligible", () => {
    const snapshot = createInteractionSnapshot({
      stateVersion: 1,
      actionSpecs: {
        "todo.complete": {
          id: "todo.complete",
          attachTo: { entityType: "todo" },
          executeScope: "object",
          risk: "low",
        },
        "todo.delete": {
          id: "todo.delete",
          attachTo: { entityType: "todo" },
          executeScope: "object",
          risk: "high",
        },
      },
      visibleObjects: [
        {
          id: "todo.1",
          type: "composite",
          role: "list_item",
          label: "复盘",
          entity: { type: "todo", id: "1" },
          actions: ["todo.complete", "todo.delete"],
        },
      ],
    })

    expect(
      rankInteractionCandidates(snapshot, [
        hypothesis({ kind: "label", text: "复盘" }, { actionHint: undefined }),
      ])
    ).toMatchObject({
      status: "needs_clarification",
      reason: "action_ambiguous",
    })
  })
})

function hypothesis(
  targetReference: SemanticIntentHypothesis["targetReference"],
  overrides: Partial<SemanticIntentHypothesis> = {}
): SemanticIntentHypothesis {
  return {
    id: "hypothesis_1",
    resolverId: "rule",
    source: "rule",
    intent: "todo.complete",
    actionHint: "todo.complete",
    targetReference,
    slots: {},
    confidence: 0.9,
    ...overrides,
  }
}
