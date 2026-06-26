import { describe, expect, it } from "vitest"
import {
  createSnapshotAnchor,
  createInteractionSnapshot,
  createUnifiedFocus,
  rankInteractionCandidates,
  setSemanticFocus,
  type FusionContext,
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

  it("distinguishes exact labels, aliases, and contains matches in evidence", () => {
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
          aliases: ["review"],
          entity: { type: "todo", id: "1" },
          actions: ["todo.complete"],
        },
      ],
    })

    const contains = rankInteractionCandidates(snapshot, [
      hypothesis({ kind: "label", text: "盘" }),
    ])
    const exactAlias = rankInteractionCandidates(snapshot, [
      hypothesis({ kind: "label", text: "review" }),
    ])

    expect(contains.candidates[0]?.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "text_contains", detail: "label_contains" }),
      ])
    )
    expect(contains.candidates[0]?.evidence).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "exact_label" })])
    )
    expect(exactAlias.candidates[0]?.evidence).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "exact_alias" })])
    )
  })

  it("scores temporal GUI evidence against utterance time instead of resolver latency", () => {
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
          actions: ["todo.complete"],
        },
        {
          id: "todo.2",
          type: "composite",
          role: "list_item",
          label: "整理",
          entity: { type: "todo", id: "2" },
          actions: ["todo.complete"],
        },
      ],
    })
    const event = {
      id: "event.pointer.todo.1",
      modality: "gui" as const,
      type: "gui.pointer.activated",
      target: "todo.1",
      snapshotId: snapshot.snapshotId,
      baseStateVersion: snapshot.stateVersion,
      timestamp: 1000,
    }
    const context: FusionContext = {
      turnId: "turn_1",
      resolutionRevision: 0,
      anchor: createSnapshotAnchor(snapshot, { capturedAt: 1100 }),
      contextEpoch: snapshot.contextEpoch,
      now: 1100,
      snapshot,
      focus: snapshot.unifiedFocus,
      utterance: {
        text: "完成这个",
        startedAt: 900,
        finalAt: 1100,
      },
      events: [event],
    }

    const fast = rankInteractionCandidates(context, [
      hypothesis({ kind: "unspecified" }, { confidence: 0.95 }),
    ])
    const slow = rankInteractionCandidates({ ...context, now: 6100 }, [
      hypothesis({ kind: "unspecified" }, { confidence: 0.95 }),
    ])
    const fastPointerEvidence = fast.candidates
      .find((candidate) => candidate.targetId === "todo.1")
      ?.evidence.find((item) => item.eventId === event.id)
    const slowPointerEvidence = slow.candidates
      .find((candidate) => candidate.targetId === "todo.1")
      ?.evidence.find((item) => item.eventId === event.id)

    expect(fastPointerEvidence?.score).toBe(slowPointerEvidence?.score)
    if (fast.status === "ready") expect(fast.decision.decidedAt).toBe(1100)
    if (slow.status === "ready") expect(slow.decision.decidedAt).toBe(6100)
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
