import { describe, expect, it } from "vitest"
import {
  createInteractionTrace,
  createInteractionTurn,
  transitionTurn,
  type SnapshotAnchor,
  type TextInput,
} from "../src"

const anchor: SnapshotAnchor = {
  snapshotId: "snapshot_1",
  stateVersion: 1,
  contextHash: "context_a",
  focusRevision: 0,
  capturedAt: 100,
}

const input: TextInput = {
  kind: "text",
  text: "完成评审方案",
  receivedAt: 101,
}

describe("interaction trace", () => {
  it("summarizes turn candidates and validation outcomes without caller-side wiring", () => {
    const turn = createInteractionTurn({
      id: "turn_1",
      source: "text",
      input,
      anchor,
      now: 100,
    })
    const resolving = transitionTurn(turn, {
      type: "transition",
      status: "resolving",
      at: 101,
    })
    const rejected = transitionTurn(resolving, {
      type: "transition",
      status: "rejected",
      at: 102,
      hypotheses: [
        {
          id: "hypothesis_1",
          resolverId: "rule",
          source: "rule",
          intent: "task.complete",
          targetReference: { kind: "label", text: "评审方案" },
          slots: {},
          confidence: 0.9,
        },
      ],
      candidates: [
        {
          id: "candidate_1",
          hypothesisId: "hypothesis_1",
          targetId: "task.item.task_1",
          actionId: "task.complete",
          params: {},
          score: 0.88,
          evidence: [{ type: "exact_label", score: 0.78 }],
        },
      ],
      result: {
        ok: false,
        status: "rejected",
        commandId: "command_1",
        turnId: "turn_1",
        targetId: "task.item.task_1",
        actionId: "task.complete",
        validation: {
          ok: false,
          code: "scope_denied",
          reason: "Modal is blocking page actions.",
        },
      },
    })

    const trace = createInteractionTrace(rejected, 110)

    expect(trace).toMatchObject({
      turnId: "turn_1",
      hypothesisSummaries: [{ resolverId: "rule", intent: "task.complete" }],
      candidateSummaries: [
        {
          targetId: "task.item.task_1",
          actionId: "task.complete",
          evidenceTypes: ["exact_label"],
        },
      ],
      validationCodes: ["scope_denied"],
      resultStatus: "rejected",
    })
    expect(trace.phases.some((phase) => phase.name === "resolve")).toBe(true)
    expect(trace.phases).toContainEqual(
      expect.objectContaining({ name: "validation", outcome: "scope_denied" })
    )
  })
})
