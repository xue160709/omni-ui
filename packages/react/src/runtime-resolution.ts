import {
  buildActionPayload,
  compactSnapshotForIntent,
  resolveUtterance,
  resolveWithResolvers,
  ruleResolver,
  transitionTurn,
  type IntentResolver,
  type InteractionDecision,
  type InteractionEvent,
  type InteractionSnapshot,
  type RankedInteractionCandidate,
  type ResolvedInteraction,
  type ResolutionBundle,
  type ResolverMode,
  type VoiceInput,
  type InteractionTurn,
} from "@omni-ui/core"
import { resolutionFromTurnDecision, stripActionType } from "./runtime-dispatch"

export function resolveClarificationAnswer(
  answer: string,
  activeTurn: InteractionTurn | undefined,
  snapshot: InteractionSnapshot
): ResolvedInteraction | undefined {
  if (activeTurn?.status !== "needs_clarification") return undefined
  const candidates = clarificationCandidatesFromTurn(activeTurn)
  if (!candidates.length) return undefined

  const selected =
    candidates[parseClarificationOrdinal(answer) - 1] ??
    findClarificationCandidateByLabel(answer, candidates, snapshot)
  if (!selected) return undefined

  const target = snapshot.visibleObjects.find((object) => object.id === selected.targetId)
  if (!target) return undefined
  if (!selected.actionId && !selected.primitiveAction) return undefined
  const hypothesis = activeTurn.hypotheses.find(
    (item) => item.id === selected.hypothesisId
  )

  return {
    status: "resolved",
    utterance: activeTurn.input.text,
    intent: hypothesis?.intent,
    targetId: selected.targetId,
    actionId: selected.actionId,
    primitiveAction: selected.primitiveAction,
    params: selected.params,
    confidence: Math.max(hypothesis?.confidence ?? 0, selected.score),
    reason: `clarification:${answer.trim()}`,
    resolverId: hypothesis?.resolverId ?? "clarification",
  }
}

function clarificationCandidatesFromTurn(
  turn: InteractionTurn
): RankedInteractionCandidate[] {
  const candidates =
    turn.clarification?.candidates && turn.clarification.candidates.length > 0
      ? turn.clarification.candidates
      : turn.candidates
  const candidateIds = turn.clarification?.candidateIds
  if (!candidateIds?.length) return candidates

  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]))
  return candidateIds
    .map((candidateId) => byId.get(candidateId))
    .filter((candidate): candidate is RankedInteractionCandidate => Boolean(candidate))
}

export function turnFromResolutionBundle(
  resolvingTurn: InteractionTurn,
  bundle: ResolutionBundle,
  snapshot: InteractionSnapshot
): InteractionTurn {
  const resolutionRevision = resolvingTurn.resolutionRevision + 1

  if (bundle.fusion.status === "ready") {
    const decision = freezeDecisionParams(resolvingTurn, bundle.fusion.decision, snapshot)
    return transitionTurn(resolvingTurn, {
      type: "resolution.completed",
      status: "ready",
      resolutionRevision,
      hypotheses: bundle.hypotheses,
      candidates: bundle.fusion.candidates,
      decision,
    })
  }

  if (bundle.fusion.status === "needs_clarification") {
    return transitionTurn(resolvingTurn, {
      type: "clarification.requested",
      status: "needs_clarification",
      resolutionRevision,
      hypotheses: bundle.hypotheses,
      candidates: bundle.fusion.candidates,
      clarification: {
        id: `clarification_${resolvingTurn.id}_${resolutionRevision}`,
        turnId: resolvingTurn.id,
        resolutionRevision,
        contextEpoch: resolvingTurn.contextEpoch,
        prompt: bundle.fusion.reason ?? "需要进一步澄清",
        candidateIds: bundle.fusion.candidates.map((candidate) => candidate.id),
        candidates: bundle.fusion.candidates.slice(0, 5),
        missingSlots: bundle.fusion.missingSlots,
        createdAt: bundle.completedAt,
      },
    })
  }

  return transitionTurn(resolvingTurn, {
    type: "resolution.failed",
    status: "rejected",
    resolutionRevision,
    hypotheses: bundle.hypotheses,
    candidates: bundle.fusion.candidates,
    error: {
      code: bundle.fusion.status,
      message: bundle.fusion.reason ?? "No interaction target was resolved.",
    },
  })
}

export function freezeDecisionParams(
  turn: InteractionTurn,
  decision: InteractionDecision,
  snapshot: InteractionSnapshot
): InteractionDecision {
  if (!decision.actionId) return decision

  const candidate: ResolvedInteraction = {
    status: "resolved",
    utterance: turn.input.text,
    targetId: decision.targetId,
    actionId: decision.actionId,
    primitiveAction: decision.primitiveAction,
    params: decision.params,
    confidence: decision.score,
    reason: "turn_decision",
    provenance: {
      turnId: turn.id,
      anchor: turn.anchor,
      source: {
        modality: turn.source,
        resolverIds: [],
        modelGenerated: false,
      },
      resolvedAt: decision.decidedAt,
    },
  }

  return {
    ...decision,
    params: stripActionType(
      buildActionPayload(snapshot, {
        actionId: decision.actionId,
        targetId: decision.targetId,
        baseStateVersion: turn.anchor.stateVersion,
        candidate,
        utterance: turn.input.text,
      })
    ),
  }
}

export function legacyResolutionFromTurnBundle(
  turn: InteractionTurn,
  bundle: ResolutionBundle
): ResolvedInteraction {
  const resolved = resolutionFromTurnDecision(turn)
  if (resolved) return resolved

  if (turn.status === "needs_clarification") {
    return {
      status: "needs_clarification",
      utterance: turn.input.text,
      intent: turn.hypotheses[0]?.intent,
      confidence: turn.candidates[0]?.score ?? 0,
      reason: turn.clarification?.prompt ?? "需要进一步澄清",
      targetCandidates: turn.candidates.slice(0, 5).map((candidate) => ({
        id: candidate.targetId,
        confidence: candidate.score,
        reason: candidate.rejected?.reason,
      })),
      resolverId: bundle.resolverIds[0] ?? "resolution_bundle",
      provenance: {
        turnId: turn.id,
        anchor: turn.anchor,
        source: {
          modality: turn.source,
          resolverIds: bundle.resolverIds,
          modelGenerated: turn.hypotheses.some((hypothesis) => hypothesis.source === "llm"),
        },
        resolvedAt: bundle.completedAt,
      },
    }
  }

  return {
    status: "not_found",
    utterance: turn.input.text,
    intent: turn.hypotheses[0]?.intent,
    confidence: 0,
    reason: turn.error?.message ?? "No interaction target was resolved.",
    targetCandidates: turn.candidates.slice(0, 5).map((candidate) => ({
      id: candidate.targetId,
      confidence: candidate.score,
      reason: candidate.rejected?.reason,
    })),
    resolverId: bundle.resolverIds[0] ?? "resolution_bundle",
  }
}

function parseClarificationOrdinal(answer: string): number {
  const text = answer.trim()
  const digit = text.match(/第?\s*(\d+)\s*(个|项|条|行)?/)
  if (digit) return Number(digit[1])
  const words: Record<string, number> = {
    一: 1,
    二: 2,
    两: 2,
    三: 3,
    四: 4,
    五: 5,
  }
  const word = text.match(/第?\s*([一二两三四五])\s*(个|项|条|行)?/)
  return word ? words[word[1]] ?? 0 : 0
}

function findClarificationCandidateByLabel(
  answer: string,
  candidates: RankedInteractionCandidate[],
  snapshot: InteractionSnapshot
): RankedInteractionCandidate | undefined {
  const query = normalizeClarificationText(answer)
  if (!query) return undefined
  return candidates.find((candidate) => {
    const object = snapshot.visibleObjects.find((item) => item.id === candidate.targetId)
    if (!object) return false
    return [object.label, ...(object.aliases ?? [])]
      .filter((value): value is string => typeof value === "string")
      .some((value) => {
        const label = normalizeClarificationText(value)
        return label === query || label.includes(query) || query.includes(label)
      })
  })
}

function normalizeClarificationText(value: string): string {
  return value.toLowerCase().replace(/[，。！？、,.!?:：；;\s"'“”‘’]/g, "")
}

export async function resolveCandidate(
  utterance: string,
  snapshot: InteractionSnapshot,
  options: {
    localResolvers?: IntentResolver[]
    resolvers?: IntentResolver[]
    resolverMode: ResolverMode
    signal?: AbortSignal
    turnId?: string
    voiceInput?: VoiceInput
    recentEvents?: InteractionEvent[]
  }
): Promise<ResolvedInteraction> {
  // 中文：解析策略支持 rule-only、rule-first 和 llm-first；默认先用本地规则，置信度不足再走外部 resolver。
  // English: Resolution supports rule-only, rule-first and llm-first; the default tries local rules before external resolvers.
  if (options.resolverMode !== "llm-first" && options.localResolvers?.length) {
    const localResult = await resolveWithResolvers(
      {
        utterance,
        snapshot,
        signal: options.signal,
        turnId: options.turnId,
        voiceInput: options.voiceInput,
        recentEvents: options.recentEvents,
      },
      options.localResolvers,
      0.8
    )

    if (localResult.status === "resolved" || localResult.status === "needs_clarification") {
      return localResult
    }
  }

  const ruleResult = resolveUtterance(utterance, snapshot)
  if (options.resolverMode === "rule-only" || !options.resolvers?.length) {
    return ruleResult
  }

  const compactSnapshot = compactSnapshotForIntent(snapshot)
  const externalResolvers = options.resolvers

  if (options.resolverMode === "llm-first") {
    return resolveWithResolvers(
      {
        utterance,
        snapshot: compactSnapshot,
        signal: options.signal,
        turnId: options.turnId,
        voiceInput: options.voiceInput,
        recentEvents: options.recentEvents,
      },
      [...externalResolvers, ...(options.localResolvers ?? []), ruleResolver],
      0.7
    )
  }

  if (ruleResult.status === "resolved" && ruleResult.confidence >= 0.8) {
    return ruleResult
  }

  const resolverResult = await resolveWithResolvers(
    {
      utterance,
      snapshot: compactSnapshot,
      signal: options.signal,
      turnId: options.turnId,
      voiceInput: options.voiceInput,
      recentEvents: options.recentEvents,
    },
    externalResolvers,
    0.7
  )

  if (resolverResult.status === "resolved" || resolverResult.status === "needs_clarification") {
    return resolverResult
  }

  return ruleResult
}
