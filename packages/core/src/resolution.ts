import { rankInteractionCandidates, type FusionRankerResult } from "./fusion"
import type {
  IntentResolver,
  IntentResolverContext,
  InteractionSnapshot,
  ResolvedInteraction,
  ResolverMode,
} from "./types"
import type {
  InteractionDecision,
  InteractionTurn,
  RankedInteractionCandidate,
  SemanticIntentHypothesis,
  TargetReference,
} from "./turn"
import { buildFusionContext, type FusionContext } from "./fusion-context"

export type FusionOutcome =
  | {
      status: "ready"
      decision: InteractionDecision
      candidates: RankedInteractionCandidate[]
    }
  | {
      status: "needs_clarification"
      reason:
        | "target_ambiguous"
        | "action_ambiguous"
        | "missing_slots"
        | "low_confidence"
        | "context_changed"
        | string
      candidates: RankedInteractionCandidate[]
      missingSlots?: string[]
      actionCandidates?: string[]
    }
  | {
      status: "not_found"
      reason: string
      candidates: RankedInteractionCandidate[]
    }

export type ResolutionBundle = {
  turnId: string
  resolutionRevision: number
  anchor: InteractionTurn["anchor"]
  resolverIds: string[]
  hypotheses: SemanticIntentHypothesis[]
  fusion: FusionOutcome
  startedAt: number
  completedAt: number
  fusionContext?: FusionContext
  legacyResolution?: ResolvedInteraction
}

export type IntentResolverOutput =
  | {
      kind: "hypotheses"
      resolverId: string
      hypotheses: SemanticIntentHypothesis[]
    }
  | {
      kind: "legacy_resolution"
      resolverId: string
      resolution: ResolvedInteraction
    }

export type IntentResolverV2 = {
  id: string
  resolve(
    context: IntentResolverContext
  ): IntentResolverOutput | Promise<IntentResolverOutput>
}

export function adaptLegacyIntentResolver(resolver: IntentResolver): IntentResolverV2 {
  return {
    id: resolver.id,
    async resolve(context) {
      const raw = await resolver.resolve(context)
      const resolution = Array.isArray(raw)
        ? [...raw].sort((a, b) => b.confidence - a.confidence)[0]
        : raw
      return {
        kind: "legacy_resolution",
        resolverId: resolver.id,
        resolution,
      }
    },
  }
}

export async function resolveInteractionTurn(input: {
  turn: InteractionTurn
  snapshot: InteractionSnapshot
  contextEpoch: number
  resolvers: IntentResolverV2[]
  mode?: ResolverMode
  signal?: AbortSignal
  now?: number
}): Promise<ResolutionBundle> {
  if (input.signal?.aborted) throw new Error("Resolution was aborted.")
  if (input.turn.contextEpoch !== input.contextEpoch) throw new Error("Turn context epoch changed.")

  const startedAt = input.now ?? Date.now()
  const resolverIds: string[] = []
  const hypotheses: SemanticIntentHypothesis[] = []
  let legacyResolution: ResolvedInteraction | undefined

  for (const resolver of input.resolvers) {
    if (input.signal?.aborted) throw new Error("Resolution was aborted.")
    const output = await resolver.resolve({
      utterance: input.turn.input.text,
      snapshot: input.snapshot,
      turnId: input.turn.id,
      voiceInput: input.turn.input.kind === "text" ? undefined : input.turn.input,
      recentEvents: input.snapshot.recentEvents,
      signal: input.signal,
    })
    resolverIds.push(output.resolverId)
    if (output.kind === "hypotheses") {
      hypotheses.push(...normalizeHypotheses(output.hypotheses, output.resolverId))
    } else {
      legacyResolution = output.resolution
      hypotheses.push(
        ...resolvedInteractionToHypotheses(output.resolution, output.resolverId)
      )
    }
  }

  const fusionContext = buildFusionContext({
    turnId: input.turn.id,
    resolutionRevision: input.turn.resolutionRevision,
    anchor: input.turn.anchor,
    snapshot: input.snapshot,
    input: input.turn.input,
    now: startedAt,
  })
  const ranked = rankInteractionCandidates(input.snapshot, mergeDuplicateHypotheses(hypotheses))
  const fusion = toFusionOutcome(ranked)
  const completedAt = Date.now()

  return {
    turnId: input.turn.id,
    resolutionRevision: input.turn.resolutionRevision,
    anchor: input.turn.anchor,
    resolverIds,
    hypotheses: mergeDuplicateHypotheses(hypotheses),
    fusion,
    startedAt,
    completedAt,
    fusionContext,
    legacyResolution: legacyResolution ?? legacyResolvedInteractionFromBundle(input.turn, fusion),
  }
}

export function legacyResolvedInteractionFromBundle(
  turn: InteractionTurn,
  fusion: FusionOutcome
): ResolvedInteraction {
  if (fusion.status !== "ready") {
    return {
      status: fusion.status === "needs_clarification" ? "needs_clarification" : "not_found",
      utterance: turn.input.text,
      confidence: 0,
      reason: fusion.reason,
      targetCandidates: fusion.candidates.slice(0, 5).map((candidate) => ({
        id: candidate.targetId,
        confidence: candidate.score,
        reason: candidate.rejected?.reason,
      })),
    }
  }

  return {
    status: "resolved",
    utterance: turn.input.text,
    intent: turn.hypotheses.find((item) => item.id === fusion.decision.hypothesisId)?.intent,
    targetId: fusion.decision.targetId,
    actionId: fusion.decision.actionId,
    primitiveAction: fusion.decision.primitiveAction,
    params: fusion.decision.params,
    confidence: fusion.decision.score,
    reason: "resolution_bundle",
  }
}

function toFusionOutcome(result: FusionRankerResult): FusionOutcome {
  if (result.status === "ready") {
    return {
      status: "ready",
      decision: result.decision,
      candidates: result.candidates,
    }
  }
  return {
    status: result.status,
    reason: result.reason,
    candidates: result.candidates,
  }
}

function normalizeHypotheses(
  hypotheses: SemanticIntentHypothesis[],
  resolverId: string
): SemanticIntentHypothesis[] {
  return hypotheses.map((hypothesis, index) => ({
    ...hypothesis,
    id: hypothesis.id || `${resolverId}:hypothesis:${index + 1}`,
    resolverId: hypothesis.resolverId || resolverId,
    confidence: clamp01(hypothesis.confidence),
  }))
}

function resolvedInteractionToHypotheses(
  resolution: ResolvedInteraction,
  resolverId: string
): SemanticIntentHypothesis[] {
  if (resolution.status !== "resolved" && resolution.status !== "needs_clarification") {
    return []
  }

  const references =
    resolution.targetCandidates?.map((candidate) => ({
      targetReference: { kind: "explicit_id", objectId: candidate.id } satisfies TargetReference,
      confidence: candidate.confidence,
    })) ??
    (resolution.targetId
      ? [
          {
            targetReference: {
              kind: "explicit_id",
              objectId: resolution.targetId,
            } satisfies TargetReference,
            confidence: resolution.confidence,
          },
        ]
      : [
          {
            targetReference: { kind: "unspecified" } satisfies TargetReference,
            confidence: resolution.confidence,
          },
        ])

  return references.map((reference, index) => ({
    id: `${resolverId}:legacy:${index + 1}`,
    resolverId,
    source: isModelResolverId(resolverId) ? "llm" : "rule",
    intent: resolution.intent ?? resolution.actionId ?? resolution.primitiveAction ?? "unknown",
    actionHint: resolution.actionId ?? resolution.primitiveAction,
    targetReference: reference.targetReference,
    slots: resolution.params ?? {},
    confidence: clamp01(reference.confidence),
    reason: resolution.reason,
  }))
}

function mergeDuplicateHypotheses(
  hypotheses: SemanticIntentHypothesis[]
): SemanticIntentHypothesis[] {
  const byKey = new Map<string, SemanticIntentHypothesis>()
  for (const hypothesis of hypotheses) {
    const key = JSON.stringify({
      intent: hypothesis.intent,
      actionHint: hypothesis.actionHint,
      targetReference: hypothesis.targetReference,
      slots: hypothesis.slots,
    })
    const existing = byKey.get(key)
    if (!existing || hypothesis.confidence > existing.confidence) byKey.set(key, hypothesis)
  }
  return [...byKey.values()]
}

function isModelResolverId(id: string): boolean {
  return /llm|model|openai|anthropic|assistant/i.test(id)
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}
