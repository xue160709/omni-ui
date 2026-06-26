import { actionMatchesObject } from "./action-registry"
import { normalizePrimitiveAction, normalizePrimitiveActions } from "./primitive"
import { validateCommandScope } from "./scope"
import { temporalDecay, type FusionContext } from "./fusion-context"
import type {
  FusionEvidence,
  InteractionDecision,
  RankedInteractionCandidate,
  SemanticIntentHypothesis,
} from "./turn"
import type { InteractionObject, InteractionSnapshot, PrimitiveAction } from "./types"

export type FusionRankerInput = InteractionSnapshot | FusionContext

export type FusionRankerOptions = {
  minAutoExecuteScore?: number
  minClarificationCandidateScore?: number
  minConfidenceMargin?: number
  now?: number
  referenceAt?: number
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
  input: FusionRankerInput,
  hypotheses: SemanticIntentHypothesis[],
  options: FusionRankerOptions = {}
): FusionRankerResult {
  const snapshot = getFusionSnapshot(input)
  const now = getFusionNow(input, options)
  const candidates = hypotheses.flatMap((hypothesis) =>
    createCandidatesForHypothesis(input, hypothesis, options)
  )
  const deduped = dedupeCandidates(candidates)
  const accepted = deduped
    .filter((candidate) => !candidate.rejected)
    .sort((a, b) => b.score - a.score)

  if (accepted.length === 0) {
    const actionAmbiguous = deduped.some(
      (candidate) => candidate.rejected?.code === "missing_action"
    )
    return {
      status: actionAmbiguous ? "needs_clarification" : "not_found",
      candidates: deduped,
      reason: actionAmbiguous ? "action_ambiguous" : "没有通过硬性校验的候选目标",
    }
  }

  const minAutoExecuteScore = options.minAutoExecuteScore ?? options.minimumScore ?? 0.82
  const minClarificationCandidateScore = options.minClarificationCandidateScore ?? 0.45
  const minConfidenceMargin = options.minConfidenceMargin ?? options.margin ?? 0.12
  const [top, second] = accepted

  if (top.score < minClarificationCandidateScore) {
    return {
      status: "not_found",
      candidates: deduped,
      reason: "候选置信度不足",
    }
  }

  if (top.score < minAutoExecuteScore) {
    return {
      status: "needs_clarification",
      candidates: deduped,
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
    candidates: deduped,
    decision: {
      candidateId: top.id,
      hypothesisId: top.hypothesisId,
      targetId: top.targetId,
      actionId: top.actionId,
      primitiveAction: top.primitiveAction,
      params: top.params,
      score: top.score,
      confidenceMargin: second ? top.score - second.score : top.score,
      evidence: top.evidence,
      contextEpoch: snapshot.contextEpoch,
      decidedAt: now,
    },
  }
}

function createCandidatesForHypothesis(
  input: FusionRankerInput,
  hypothesis: SemanticIntentHypothesis,
  options: FusionRankerOptions = {}
): RankedInteractionCandidate[] {
  const snapshot = getFusionSnapshot(input)
  const targets = resolveHypothesisTargets(input, hypothesis)
  const actionHint = hypothesis.actionHint

  return targets.map((target, index) => {
    const action = resolveCandidateAction(snapshot, target, hypothesis)
    const actionId = action.actionId
    const primitiveAction = action.primitiveAction
    const normalizedPrimitiveActions = normalizePrimitiveActions(target.primitiveActions)
    const evidence = scoreEvidence(input, target, hypothesis, index, options)
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

function resolveCandidateAction(
  snapshot: InteractionSnapshot,
  target: InteractionObject,
  hypothesis: SemanticIntentHypothesis
): { actionId?: string; primitiveAction?: PrimitiveAction } {
  const actionHint = hypothesis.actionHint
  if (actionHint) {
    const normalizedPrimitiveHint = normalizePrimitiveAction(actionHint)
    if (snapshot.actionSpecs[actionHint]) return { actionId: actionHint }
    if (normalizePrimitiveActions(target.primitiveActions)?.includes(normalizedPrimitiveHint)) {
      return { primitiveAction: normalizedPrimitiveHint }
    }
    return snapshot.actionSpecs[actionHint]
      ? { actionId: actionHint }
      : { primitiveAction: normalizedPrimitiveHint }
  }

  const eligibleDomainActions = (target.actions ?? [])
    .map((actionId) => snapshot.actionSpecs[actionId])
    .filter((spec): spec is NonNullable<typeof spec> => Boolean(spec))
    .filter((spec) => actionMatchesObject(spec, target))
    .filter((spec) => spec.implicitSelection?.enabled === true)
    .filter((spec) => (spec.risk ?? "medium") === "low")
    .filter((spec) => {
      const modality = hypothesis.source === "llm" ? "assistant" : "voice"
      return !spec.implicitSelection?.modalities || spec.implicitSelection.modalities.includes(modality)
    })

  if (eligibleDomainActions.length === 1) {
    return { actionId: eligibleDomainActions[0].id }
  }

  return {}
}

function resolveHypothesisTargets(
  input: FusionRankerInput,
  hypothesis: SemanticIntentHypothesis
): InteractionObject[] {
  const snapshot = getFusionSnapshot(input)
  const focus = getFusionFocus(input)
  const reference = hypothesis.targetReference

  if (reference.kind === "explicit_id") {
    return snapshot.visibleObjects.filter((object) => object.id === reference.objectId)
  }

  if (reference.kind === "focused") {
    if (reference.focus === "selection") {
      const selected = new Set(focus.selectedObjectIds)
      return snapshot.visibleObjects.filter((object) => selected.has(object.id))
    }
    const target =
      reference.focus === "input"
        ? focus.inputFocus
        : focus.semanticFocus
    return snapshot.visibleObjects.filter((object) => object.id === target?.objectId)
  }

  if (reference.kind === "recent") {
    const offset = reference.offset ?? 0
    const target = focus.recentTargets[offset]
    return snapshot.visibleObjects.filter((object) => object.id === target?.objectId)
  }

  if (reference.kind === "ordinal") {
    return snapshot.visibleObjects.filter((object) => object.state?.index === reference.index)
  }

  if (reference.kind === "deictic") {
    const target = focus.semanticFocus ?? focus.recentTargets[0]
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
  input: FusionRankerInput,
  target: InteractionObject,
  hypothesis: SemanticIntentHypothesis,
  index: number,
  options: FusionRankerOptions = {}
): FusionEvidence[] {
  const snapshot = getFusionSnapshot(input)
  const focus = getFusionFocus(input)
  const events = getFusionEvents(input)
  const referenceAt = getFusionReferenceAt(input, options)
  const evidence: FusionEvidence[] = []
  const reference = hypothesis.targetReference

  if (reference.kind === "explicit_id") evidence.push({ type: "explicit_id", score: 0.35, objectId: target.id })
  if (reference.kind === "label") evidence.push(...scoreLabelEvidence(target, reference.text))
  if (reference.kind === "ordinal") evidence.push({ type: "ordinal", score: 0.24, objectId: target.id })
  if (focus.selectedObjectIds.includes(target.id)) evidence.push({ type: "gui_selection", score: 0.2, objectId: target.id })
  if (focus.semanticFocus?.objectId === target.id) evidence.push({ type: "semantic_focus", score: 0.24, objectId: target.id })
  if (focus.inputFocus?.objectId === target.id) evidence.push({ type: "input_focus", score: 0.08, objectId: target.id })
  const recentFocus = focus.recentTargets.find((item) => item.objectId === target.id)
  if (recentFocus) {
    evidence.push({
      type: "recent_gui_target",
      score: 0.18,
      objectId: target.id,
      timestamp: recentFocus.timestamp,
    })
  }
  const pointerEvent = [...events]
    .reverse()
    .find((event) => event.target === target.id && event.type === "gui.pointer.activated")
  if (pointerEvent) {
    evidence.push({
      type: "recent_gui_target",
      score: 0.24 * temporalDecay(pointerEvent.timestamp, referenceAt, 2500),
      objectId: target.id,
      eventId: pointerEvent.id,
      timestamp: pointerEvent.timestamp,
    })
  }
  if (hypothesis.modelTargetIdHint === target.id) evidence.push({ type: "model_suggested_target", score: 0.08, objectId: target.id })
  const normalizedPrimitiveHint = hypothesis.actionHint
    ? normalizePrimitiveAction(hypothesis.actionHint)
    : undefined
  if (
    target.actions?.includes(hypothesis.actionHint ?? "") ||
    (normalizedPrimitiveHint && normalizePrimitiveActions(target.primitiveActions)?.includes(normalizedPrimitiveHint))
  ) evidence.push({ type: "action_compatibility", score: 0.15, objectId: target.id })

  return evidence
}

function scoreLabelEvidence(
  target: InteractionObject,
  text: string
): FusionEvidence[] {
  const query = normalize(text)
  const evidence: FusionEvidence[] = []
  const label = typeof target.label === "string" ? normalize(target.label) : ""

  if (label) {
    if (label === query) {
      evidence.push({ type: "exact_label", score: 0.25, objectId: target.id })
    } else if (label.includes(query) || query.includes(label)) {
      evidence.push({
        type: "text_contains",
        score: 0.14,
        objectId: target.id,
        detail: "label_contains",
      })
    }
  }

  for (const alias of target.aliases ?? []) {
    const normalizedAlias = normalize(alias)
    if (!normalizedAlias) continue
    if (normalizedAlias === query) {
      evidence.push({ type: "exact_alias", score: 0.22, objectId: target.id })
    } else if (normalizedAlias.includes(query) || query.includes(normalizedAlias)) {
      evidence.push({
        type: "text_contains",
        score: 0.12,
        objectId: target.id,
        detail: "alias_contains",
      })
    }
  }

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

function dedupeCandidates(
  candidates: RankedInteractionCandidate[]
): RankedInteractionCandidate[] {
  const byKey = new Map<string, RankedInteractionCandidate>()
  for (const candidate of candidates) {
    const key = stableCandidateKey(candidate)
    const existing = byKey.get(key)
    if (!existing) {
      byKey.set(key, candidate)
      continue
    }
    byKey.set(key, {
      ...existing,
      score: Math.max(existing.score, candidate.score),
      evidence: mergeEvidence(existing.evidence, candidate.evidence),
      rejected: existing.rejected && !candidate.rejected ? undefined : existing.rejected,
    })
  }
  return [...byKey.values()]
}

function stableCandidateKey(candidate: RankedInteractionCandidate): string {
  return JSON.stringify({
    targetId: candidate.targetId,
    actionId: candidate.actionId,
    primitiveAction: candidate.primitiveAction,
    params: candidate.params,
  })
}

function mergeEvidence(
  left: RankedInteractionCandidate["evidence"],
  right: RankedInteractionCandidate["evidence"]
): RankedInteractionCandidate["evidence"] {
  const byKey = new Map<string, RankedInteractionCandidate["evidence"][number]>()
  for (const item of [...left, ...right]) {
    byKey.set(`${item.type}:${item.objectId ?? ""}:${item.eventId ?? ""}:${item.detail ?? ""}`, item)
  }
  return [...byKey.values()]
}

function getFusionSnapshot(input: FusionRankerInput): InteractionSnapshot {
  return isFusionContext(input) ? input.snapshot : input
}

function getFusionFocus(input: FusionRankerInput): InteractionSnapshot["unifiedFocus"] {
  return isFusionContext(input) ? input.focus : input.unifiedFocus
}

function getFusionEvents(input: FusionRankerInput): InteractionSnapshot["recentEvents"] {
  return isFusionContext(input) ? input.events : input.recentEvents
}

function getFusionNow(input: FusionRankerInput, options: FusionRankerOptions = {}): number {
  if (isFusionContext(input)) return input.now
  return options.now ?? latestSnapshotEventAt(input)
}

function getFusionReferenceAt(input: FusionRankerInput, options: FusionRankerOptions = {}): number {
  if (isFusionContext(input)) return input.utterance.endedAt ?? input.utterance.finalAt
  return options.referenceAt ?? options.now ?? latestSnapshotEventAt(input)
}

function latestSnapshotEventAt(snapshot: InteractionSnapshot): number {
  return snapshot.recentEvents.reduce(
    (latest, event) => Math.max(latest, event.timestamp),
    0
  )
}

function isFusionContext(input: FusionRankerInput): input is FusionContext {
  return "snapshot" in input && "utterance" in input && "focus" in input
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[，。！？、,.!?:：；;\s"'“”‘’]/g, "")
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}
