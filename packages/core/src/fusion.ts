import { actionMatchesObject } from "./action-registry"
import { normalizePrimitiveAction, normalizePrimitiveActions } from "./primitive"
import { validateCommandScope } from "./scope"
import type {
  FusionEvidence,
  InteractionDecision,
  RankedInteractionCandidate,
  SemanticIntentHypothesis,
} from "./turn"
import type { InteractionObject, InteractionSnapshot, PrimitiveAction } from "./types"

export type FusionRankerOptions = {
  minAutoExecuteScore?: number
  minClarificationCandidateScore?: number
  minConfidenceMargin?: number
  /** @deprecated Use minAutoExecuteScore. */
  minimumScore?: number
  /** @deprecated Use minConfidenceMargin. */
  margin?: number
}

export type FusionRankerResult =
  | {
      status: "ready"
      decision: InteractionDecision
      candidates: RankedInteractionCandidate[]
    }
  | {
      status: "needs_clarification"
      candidates: RankedInteractionCandidate[]
      reason: string
    }
  | {
      status: "not_found"
      candidates: RankedInteractionCandidate[]
      reason: string
    }

export function rankInteractionCandidates(
  snapshot: InteractionSnapshot,
  hypotheses: SemanticIntentHypothesis[],
  options: FusionRankerOptions = {}
): FusionRankerResult {
  const candidates = hypotheses.flatMap((hypothesis) =>
    createCandidatesForHypothesis(snapshot, hypothesis)
  )
  const accepted = candidates
    .filter((candidate) => !candidate.rejected)
    .sort((a, b) => b.score - a.score)

  if (accepted.length === 0) {
    return {
      status: "not_found",
      candidates,
      reason: "没有通过硬性校验的候选目标",
    }
  }

  const minAutoExecuteScore = options.minAutoExecuteScore ?? options.minimumScore ?? 0.82
  const minClarificationCandidateScore = options.minClarificationCandidateScore ?? 0.45
  const minConfidenceMargin = options.minConfidenceMargin ?? options.margin ?? 0.12
  const [top, second] = accepted

  if (top.score < minClarificationCandidateScore) {
    return {
      status: "not_found",
      candidates,
      reason: "候选置信度不足",
    }
  }

  if (top.score < minAutoExecuteScore) {
    return {
      status: "needs_clarification",
      candidates,
      reason: "候选置信度不足",
    }
  }

  if (second && top.score - second.score < minConfidenceMargin) {
    return {
      status: "needs_clarification",
      candidates: accepted.slice(0, 5),
      reason: "存在多个相近候选，需要澄清",
    }
  }

  return {
    status: "ready",
    candidates,
    decision: {
      targetId: top.targetId,
      actionId: top.actionId,
      primitiveAction: top.primitiveAction,
      params: top.params,
      score: top.score,
      confidenceMargin: second ? top.score - second.score : top.score,
      evidence: top.evidence,
    },
  }
}

function createCandidatesForHypothesis(
  snapshot: InteractionSnapshot,
  hypothesis: SemanticIntentHypothesis
): RankedInteractionCandidate[] {
  const targets = resolveHypothesisTargets(snapshot, hypothesis)
  const actionHint = hypothesis.actionHint

  return targets.map((target, index) => {
    const actionId = actionHint && target.actions?.includes(actionHint) ? actionHint : target.actions?.[0]
    const normalizedPrimitiveActions = normalizePrimitiveActions(target.primitiveActions)
    const normalizedPrimitiveHint = actionHint ? normalizePrimitiveAction(actionHint) : undefined
    const primitiveAction: PrimitiveAction | undefined =
      !actionId && normalizedPrimitiveActions?.length
        ? normalizedPrimitiveHint && normalizedPrimitiveActions.includes(normalizedPrimitiveHint)
          ? normalizedPrimitiveHint
          : normalizedPrimitiveActions[0]
        : undefined
    const evidence = scoreEvidence(snapshot, target, hypothesis, index)
    const score = clamp01(hypothesis.confidence * 0.55 + evidence.reduce((sum, item) => sum + item.score, 0))
    const rejected = hardReject(snapshot, target, actionId, primitiveAction)

    return {
      id: `${hypothesis.id}:${target.id}:${actionId ?? primitiveAction ?? "none"}`,
      hypothesisId: hypothesis.id,
      targetId: target.id,
      actionId,
      primitiveAction,
      params: hypothesis.slots,
      score,
      evidence,
      rejected,
    }
  })
}

function resolveHypothesisTargets(
  snapshot: InteractionSnapshot,
  hypothesis: SemanticIntentHypothesis
): InteractionObject[] {
  const reference = hypothesis.targetReference

  if (reference.kind === "explicit_id") {
    return snapshot.visibleObjects.filter((object) => object.id === reference.objectId)
  }

  if (reference.kind === "focused") {
    if (reference.focus === "selection") {
      const selected = new Set(snapshot.unifiedFocus.selectedObjectIds)
      return snapshot.visibleObjects.filter((object) => selected.has(object.id))
    }
    const target =
      reference.focus === "input"
        ? snapshot.unifiedFocus.inputFocus
        : snapshot.unifiedFocus.semanticFocus
    return snapshot.visibleObjects.filter((object) => object.id === target?.objectId)
  }

  if (reference.kind === "recent") {
    const offset = reference.offset ?? 0
    const target = snapshot.unifiedFocus.recentTargets[offset]
    return snapshot.visibleObjects.filter((object) => object.id === target?.objectId)
  }

  if (reference.kind === "ordinal") {
    return snapshot.visibleObjects.filter((object) => object.state?.index === reference.index)
  }

  if (reference.kind === "deictic") {
    const target = snapshot.unifiedFocus.semanticFocus ?? snapshot.unifiedFocus.recentTargets[0]
    return snapshot.visibleObjects.filter((object) => object.id === target?.objectId)
  }

  if (reference.kind === "label") {
    const query = normalize(reference.text)
    return snapshot.visibleObjects.filter((object) =>
      [object.label, ...(object.aliases ?? [])]
        .filter((value): value is string => typeof value === "string")
        .some((value) => {
          const name = normalize(value)
          return name === query || name.includes(query) || query.includes(name)
        })
    )
  }

  if (hypothesis.modelTargetIdHint) {
    return snapshot.visibleObjects.filter((object) => object.id === hypothesis.modelTargetIdHint)
  }

  return snapshot.visibleObjects.filter((object) => object.type !== "page")
}

function scoreEvidence(
  snapshot: InteractionSnapshot,
  target: InteractionObject,
  hypothesis: SemanticIntentHypothesis,
  index: number
): FusionEvidence[] {
  const evidence: FusionEvidence[] = []
  const reference = hypothesis.targetReference

  if (reference.kind === "explicit_id") evidence.push({ type: "explicit_id", score: 0.35, objectId: target.id })
  if (reference.kind === "label") evidence.push({ type: "exact_label", score: 0.25, objectId: target.id })
  if (reference.kind === "ordinal") evidence.push({ type: "ordinal", score: 0.24, objectId: target.id })
  if (snapshot.unifiedFocus.selectedObjectIds.includes(target.id)) evidence.push({ type: "gui_selection", score: 0.2, objectId: target.id })
  if (snapshot.unifiedFocus.semanticFocus?.objectId === target.id) evidence.push({ type: "semantic_focus", score: 0.24, objectId: target.id })
  if (snapshot.unifiedFocus.inputFocus?.objectId === target.id) evidence.push({ type: "input_focus", score: 0.08, objectId: target.id })
  if (snapshot.unifiedFocus.recentTargets.some((item) => item.objectId === target.id)) evidence.push({ type: "recent_gui_target", score: 0.18, objectId: target.id })
  if (hypothesis.modelTargetIdHint === target.id) evidence.push({ type: "model_suggested_target", score: 0.08, objectId: target.id })
  const normalizedPrimitiveHint = hypothesis.actionHint
    ? normalizePrimitiveAction(hypothesis.actionHint)
    : undefined
  if (
    target.actions?.includes(hypothesis.actionHint ?? "") ||
    (normalizedPrimitiveHint && normalizePrimitiveActions(target.primitiveActions)?.includes(normalizedPrimitiveHint))
  ) evidence.push({ type: "action_compatibility", score: 0.15, objectId: target.id })
  if (index > 0) evidence.push({ type: "scope_penalty", score: -0.02 * index, objectId: target.id })

  return evidence
}

function hardReject(
  snapshot: InteractionSnapshot,
  target: InteractionObject,
  actionId: string | undefined,
  primitiveAction: PrimitiveAction | undefined
): RankedInteractionCandidate["rejected"] {
  if (target.state?.enabled === false || target.state?.disabled === true) {
    return { code: "target_disabled", reason: "目标不可用" }
  }

  if (actionId) {
    const spec = snapshot.actionSpecs[actionId]
    if (!spec) return { code: "missing_action", reason: "动作未注册" }
    if (!actionMatchesObject(spec, target)) {
      return { code: "action_target_mismatch", reason: "动作与目标不匹配" }
    }
    if (!target.actions?.includes(actionId)) {
      return { code: "capability_missing", reason: "目标未暴露动作能力" }
    }
    const scope = validateCommandScope(snapshot, target, spec)
    if (!scope.ok) return { code: scope.code ?? "scope_denied", reason: scope.reason }
    return undefined
  }

  if (primitiveAction) {
    const normalizedPrimitiveAction = normalizePrimitiveActions([primitiveAction])?.[0]
    if (
      !normalizedPrimitiveAction ||
      !normalizePrimitiveActions(target.primitiveActions)?.includes(normalizedPrimitiveAction)
    ) {
      return { code: "capability_missing", reason: "目标未暴露 primitive 能力" }
    }
    const scope = validateCommandScope(snapshot, target)
    if (!scope.ok) return { code: scope.code ?? "scope_denied", reason: scope.reason }
    return undefined
  }

  return { code: "missing_action", reason: "候选没有可执行动作" }
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[，。！？、,.!?:：；;\s"'“”‘’]/g, "")
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}
