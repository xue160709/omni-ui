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
  fusionSummary: FusionSummary
  legacyResolution?: ResolvedInteraction
}

export type FusionSummary = {
  contextEpoch: number
  eventWindow: {
    start: number
    end: number
    eventIds: string[]
  }
  referenceAt: number
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
      if (Array.isArray(raw)) {
        return {
          kind: "hypotheses",
          resolverId: resolver.id,
          hypotheses: raw.flatMap((resolution, index) =>
            resolvedInteractionToHypotheses(
              resolution,
              resolution.resolverId ?? `${resolver.id}:${index + 1}`,
              context.snapshot
            )
          ),
        }
      }

      const resolution = raw
      return {
        kind: "legacy_resolution",
        resolverId: resolution.resolverId ?? resolver.id,
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
  const fusionContext = buildFusionContext({
    turnId: input.turn.id,
    resolutionRevision: input.turn.resolutionRevision,
    anchor: input.turn.anchor,
    snapshot: input.snapshot,
    input: input.turn.input,
    now: startedAt,
  })

  for (const resolver of orderResolvers(input.resolvers, input.mode)) {
    if (input.signal?.aborted) throw new Error("Resolution was aborted.")
    if (shouldSkipResolver(resolver, input.mode)) continue
    if (shouldShortCircuitResolverGroup(resolver, input.mode, fusionContext, hypotheses)) {
      break
    }

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
        ...resolvedInteractionToHypotheses(output.resolution, output.resolverId, input.snapshot)
      )
    }
  }

  const mergedHypotheses = mergeDuplicateHypotheses(hypotheses)
  const ranked = rankInteractionCandidates(fusionContext, mergedHypotheses)
  const fusion = toFusionOutcome(ranked)
  const completedAt = Date.now()

  return {
    turnId: input.turn.id,
    resolutionRevision: input.turn.resolutionRevision,
    anchor: input.turn.anchor,
    resolverIds,
    hypotheses: mergedHypotheses,
    fusion,
    startedAt,
    completedAt,
    fusionSummary: summarizeFusionContext(fusionContext),
    legacyResolution:
      legacyResolution ?? legacyResolvedInteractionFromBundle(input.turn, fusion, mergedHypotheses),
  }
}

function summarizeFusionContext(context: FusionContext): FusionSummary {
  const eventTimestamps = context.events.map((event) => event.timestamp)
  const referenceAt = context.utterance.endedAt ?? context.utterance.finalAt
  return {
    contextEpoch: context.contextEpoch,
    eventWindow: {
      start: eventTimestamps.length > 0 ? Math.min(...eventTimestamps) : referenceAt,
      end: eventTimestamps.length > 0 ? Math.max(...eventTimestamps) : referenceAt,
      eventIds: context.events.map((event) => event.id),
    },
    referenceAt,
  }
}

export function legacyResolvedInteractionFromBundle(
  turn: InteractionTurn,
  fusion: FusionOutcome,
  hypotheses: SemanticIntentHypothesis[] = turn.hypotheses
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
    intent: hypotheses.find((item) => item.id === fusion.decision.hypothesisId)?.intent,
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
  resolverId: string,
  snapshot?: InteractionSnapshot
): SemanticIntentHypothesis[] {
  if (resolution.status !== "resolved" && resolution.status !== "needs_clarification") {
    return []
  }

  const references =
    resolution.targetCandidates?.map((candidate) => ({
      targetReference: { kind: "explicit_id", objectId: candidate.id } satisfies TargetReference,
      confidence: candidate.confidence,
      actionHint: inferLegacyActionHint(resolution, candidate.id, snapshot),
    })) ??
    (resolution.targetId
      ? [
          {
            targetReference: {
              kind: "explicit_id",
              objectId: resolution.targetId,
            } satisfies TargetReference,
            confidence: resolution.confidence,
            actionHint: inferLegacyActionHint(resolution, resolution.targetId, snapshot),
          },
        ]
      : [
          {
            targetReference: { kind: "unspecified" } satisfies TargetReference,
            confidence: resolution.confidence,
            actionHint: resolution.actionId ?? resolution.primitiveAction,
          },
        ])

  return references.map((reference, index) => ({
    id: `${resolverId}:legacy:${index + 1}`,
    resolverId,
    source: isModelResolverId(resolverId) ? "llm" : "rule",
    intent: resolution.intent ?? resolution.actionId ?? resolution.primitiveAction ?? "unknown",
    actionHint: reference.actionHint,
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

function inferLegacyActionHint(
  resolution: ResolvedInteraction,
  targetId: string | undefined,
  snapshot: InteractionSnapshot | undefined
): string | undefined {
  if (resolution.actionId || resolution.primitiveAction) {
    return resolution.actionId ?? resolution.primitiveAction
  }
  if (!targetId || !snapshot || !resolution.intent) return undefined

  const target = snapshot.visibleObjects.find((object) => object.id === targetId)
  if (!target) return undefined
  const actions = target.actions ?? []
  const primitives = target.primitiveActions ?? []
  const domain = (suffixes: string[]) =>
    actions.find((action) =>
      suffixes.some((suffix) =>
        suffix.startsWith(".")
          ? action.endsWith(suffix)
          : action === suffix || action.endsWith(`.${suffix}`)
      )
    )
  const primitive = (candidates: string[]) =>
    primitives.find((action) => candidates.includes(action))

  if (resolution.intent === "complete") {
    return domain([".complete", "complete"]) ?? primitive(["check", "toggle"])
  }
  if (resolution.intent === "delete") {
    return domain([".delete", "delete"])
  }
  if (resolution.intent === "open" || resolution.intent === "navigate") {
    return domain([".open", ".goto", ".navigate", "open", "goto", "navigate"]) ??
      primitive(["press", "open"])
  }
  if (resolution.intent === "select") {
    return domain([".filter", ".select", ".goto", ".navigate", "goto", "navigate"]) ??
      primitive(["press", "selectByLabel", "selectByIndex"])
  }

  return undefined
}

function orderResolvers(
  resolvers: IntentResolverV2[],
  mode: ResolverMode = "rule-first"
): IntentResolverV2[] {
  if (mode === "llm-first") {
    return [...resolvers].sort((left, right) => modelSort(right) - modelSort(left))
  }
  if (mode === "rule-first" || mode === "rule-only") {
    return [...resolvers].sort((left, right) => modelSort(left) - modelSort(right))
  }
  return resolvers
}

function shouldSkipResolver(
  resolver: IntentResolverV2,
  mode: ResolverMode = "rule-first"
): boolean {
  return mode === "rule-only" && isModelResolverId(resolver.id)
}

function shouldShortCircuitResolverGroup(
  resolver: IntentResolverV2,
  mode: ResolverMode = "rule-first",
  fusionContext: FusionContext,
  hypotheses: SemanticIntentHypothesis[]
): boolean {
  if (!hypotheses.length) return false
  const modelResolver = isModelResolverId(resolver.id)
  if (mode === "rule-first" && modelResolver) {
    return hasReadyFusion(fusionContext, hypotheses)
  }
  if (mode === "llm-first" && !modelResolver) {
    return hasReadyFusion(fusionContext, hypotheses)
  }
  return false
}

function hasReadyFusion(
  fusionContext: FusionContext,
  hypotheses: SemanticIntentHypothesis[]
): boolean {
  return rankInteractionCandidates(
    fusionContext,
    mergeDuplicateHypotheses(hypotheses)
  ).status === "ready"
}

function modelSort(resolver: IntentResolverV2): number {
  return isModelResolverId(resolver.id) ? 1 : 0
}

function isModelResolverId(id: string): boolean {
  return /llm|model|openai|anthropic|assistant/i.test(id)
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}
