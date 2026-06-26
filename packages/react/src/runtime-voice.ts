import {
  transitionTurn,
  type IntentResolver,
  type InteractionSnapshot,
  type InteractionTurn,
  type ResolvedInteraction,
  type VoiceInput,
} from "@omni-ui/core"
import { resolveCandidate } from "./runtime-resolution"

export async function resolveVoiceCandidate(
  input: VoiceInput,
  snapshot: InteractionSnapshot,
  options: {
    localResolvers?: IntentResolver[]
    resolvers?: IntentResolver[]
    resolverMode: import("@omni-ui/core").ResolverMode
    signal?: AbortSignal
    turnId?: string
  }
): Promise<ResolvedInteraction> {
  const alternatives = getVoiceAlternatives(input)
  let primaryResult: ResolvedInteraction | undefined
  let bestResolved:
    | {
        resolution: ResolvedInteraction
        score: number
        transcript: string
      }
    | undefined
  let bestClarification: ResolvedInteraction | undefined

  for (const alternative of alternatives) {
    if (options.signal?.aborted) {
      return {
        status: "unsupported",
        utterance: input.text,
        confidence: 0,
        reason: "Resolver request was aborted.",
      }
    }

    const resolution = await resolveCandidate(alternative.text, snapshot, {
      ...options,
      voiceInput: {
        ...input,
        text: alternative.text,
        confidence: alternative.confidence ?? input.confidence,
      },
      recentEvents: snapshot.recentEvents,
    })
    if (!primaryResult) primaryResult = resolution

    const asrConfidence = alternative.confidence ?? input.confidence ?? 1
    const score = resolution.confidence * asrConfidence
    if (resolution.status === "resolved" && (!bestResolved || score > bestResolved.score)) {
      bestResolved = {
        resolution,
        score,
        transcript: alternative.text,
      }
    }

    if (resolution.status === "needs_clarification" && !bestClarification) {
      bestClarification = resolution
    }
  }

  if (bestResolved) {
    return {
      ...bestResolved.resolution,
      utterance: input.text,
      confidence: Math.min(1, bestResolved.score),
      reason:
        bestResolved.transcript === input.text
          ? bestResolved.resolution.reason
          : [
              bestResolved.resolution.reason,
              `asr_alternative:${bestResolved.transcript}`,
            ]
              .filter(Boolean)
              .join(";"),
    }
  }

  return bestClarification ?? primaryResult ?? {
    status: "not_found",
    utterance: input.text,
    confidence: 0,
    reason: "没有 resolver 能识别该语音表达",
  }
}

export async function resolvePartialVoicePreview(
  input: VoiceInput,
  snapshot: InteractionSnapshot,
  options: {
    localResolvers?: IntentResolver[]
    signal?: AbortSignal
    turnId?: string
  }
): Promise<ResolvedInteraction> {
  return resolveCandidate(input.text, snapshot, {
    localResolvers: options.localResolvers,
    resolverMode: "rule-only",
    signal: options.signal,
    turnId: options.turnId,
    voiceInput: input,
    recentEvents: snapshot.recentEvents,
  })
}

export function createPartialVoicePreviewTurn(
  createdTurn: InteractionTurn,
  resolution: ResolvedInteraction,
  previousTurn?: InteractionTurn
): InteractionTurn {
  const listening = transitionTurn(createdTurn, {
    type: "voice.partial",
    status: "listening",
    at: createdTurn.updatedAt,
  })

  return {
    ...listening,
    candidates: previewCandidatesFromResolution(resolution),
    decision: undefined,
    clarification: undefined,
    error:
      resolution.status === "resolved" || resolution.status === "needs_clarification"
        ? undefined
        : {
            code: resolution.status,
            message: resolution.reason ?? "Partial voice preview did not resolve.",
          },
    revision: (previousTurn?.revision ?? 0) + 1,
    inputRevision: (previousTurn?.inputRevision ?? 0) + 1,
    transcriptRevisions: [
      ...(previousTurn?.transcriptRevisions ?? []),
      createdTurn.input,
    ].slice(-10) as VoiceInput[],
  }
}

export function createPartialVoiceListeningTurn(
  createdTurn: InteractionTurn,
  previousTurn?: InteractionTurn
): InteractionTurn {
  const listening = transitionTurn(createdTurn, {
    type: "voice.partial",
    status: "listening",
    at: createdTurn.updatedAt,
  })

  return {
    ...listening,
    decision: undefined,
    clarification: undefined,
    error: undefined,
    revision: (previousTurn?.revision ?? 0) + 1,
    inputRevision: (previousTurn?.inputRevision ?? 0) + 1,
    transcriptRevisions: [
      ...(previousTurn?.transcriptRevisions ?? []),
      createdTurn.input,
    ].slice(-10) as VoiceInput[],
  }
}

export function previewCandidatesFromResolution(
  resolution: ResolvedInteraction
): InteractionTurn["candidates"] {
  const candidates = resolution.targetCandidates?.length
    ? resolution.targetCandidates.map((candidate) => ({
        targetId: candidate.id,
        score: candidate.confidence,
      }))
    : resolution.targetId
      ? [{ targetId: resolution.targetId, score: resolution.confidence }]
      : []

  return candidates.map((candidate, index) => ({
    id: `preview_${resolution.provenance?.turnId ?? "turn"}_${index + 1}`,
    hypothesisId: resolution.resolverId ?? "preview",
    targetId: candidate.targetId,
    actionId: resolution.actionId,
    primitiveAction: resolution.primitiveAction,
    params: resolution.params ?? {},
    score: candidate.score,
    evidence: [],
  }))
}

export function decisionFromResolution(resolution: ResolvedInteraction): InteractionTurn["decision"] {
  if (resolution.status !== "resolved" || !resolution.targetId) return undefined
  if (!resolution.actionId && !resolution.primitiveAction) return undefined

  return {
    candidateId: `candidate_${resolution.provenance?.turnId ?? "legacy"}_${resolution.targetId}`,
    hypothesisId: resolution.resolverId ?? "legacy",
    targetId: resolution.targetId,
    actionId: resolution.actionId,
    primitiveAction: resolution.primitiveAction,
    params: resolution.params ?? {},
    score: resolution.confidence,
    confidenceMargin: resolution.confidence,
    evidence: [],
    contextEpoch: resolution.provenance?.anchor.contextEpoch ?? 0,
    decidedAt: resolution.provenance?.resolvedAt ?? Date.now(),
  }
}

export function getPartialVoiceTurnId(
  sessionKey: string,
  sessions: Map<string, string>,
  createId: () => string
): string {
  const existing = sessions.get(sessionKey)
  if (existing) return existing
  const next = createId()
  sessions.set(sessionKey, next)
  return next
}

export function voiceSessionKey(input: VoiceInput): string {
  return input.sessionId ? `session:${input.sessionId}` : `partial:${input.startedAt ?? input.receivedAt}`
}

function getVoiceAlternatives(input: VoiceInput): Array<{ text: string; confidence?: number }> {
  const seen = new Set<string>()
  return [
    { text: input.text, confidence: input.confidence },
    ...(input.nBest ?? []),
  ]
    .map((alternative) => ({
      text: alternative.text.trim(),
      confidence: alternative.confidence,
    }))
    .filter((alternative) => {
      if (!alternative.text || seen.has(alternative.text)) return false
      seen.add(alternative.text)
      return true
    })
}
