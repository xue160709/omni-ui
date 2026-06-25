import type { UnifiedFocus } from "./focus"
import type { InteractionEvent, InteractionSnapshot } from "./types"
import type { VoiceAlternative, VoiceInput, VoiceToken } from "./turn"
import type { SnapshotAnchor } from "./command"

export type FusionContext = {
  turnId: string
  resolutionRevision: number
  anchor: SnapshotAnchor
  contextEpoch: number
  now: number
  snapshot: InteractionSnapshot
  focus: UnifiedFocus
  utterance: {
    text: string
    startedAt?: number
    endedAt?: number
    finalAt: number
    confidence?: number
    nBest?: VoiceAlternative[]
    tokens?: VoiceToken[]
  }
  events: InteractionEvent[]
}

export type FusionTimingOptions = {
  beforeMs?: number
  afterMs?: number
}

export function temporalDecay(
  eventAt: number,
  referenceAt: number,
  halfLifeMs: number
): number {
  const delta = Math.abs(referenceAt - eventAt)
  return Math.pow(0.5, delta / halfLifeMs)
}

export function buildFusionContext(input: {
  turnId: string
  resolutionRevision: number
  anchor: SnapshotAnchor
  snapshot: InteractionSnapshot
  input: VoiceInput | { kind: "text"; text: string; receivedAt: number }
  now?: number
  timing?: FusionTimingOptions
}): FusionContext {
  const finalAt = input.input.receivedAt
  const events = selectFusionEvents(input.snapshot.recentEvents, {
    startedAt: "startedAt" in input.input ? input.input.startedAt : undefined,
    finalAt,
    ...input.timing,
  })

  return {
    turnId: input.turnId,
    resolutionRevision: input.resolutionRevision,
    anchor: input.anchor,
    contextEpoch: input.snapshot.contextEpoch,
    now: input.now ?? Date.now(),
    snapshot: input.snapshot,
    focus: input.snapshot.unifiedFocus,
    utterance: {
      text: input.input.text,
      startedAt: "startedAt" in input.input ? input.input.startedAt : undefined,
      endedAt: "endedAt" in input.input ? input.input.endedAt : undefined,
      finalAt,
      confidence: "confidence" in input.input ? input.input.confidence : undefined,
      nBest: "nBest" in input.input ? input.input.nBest : undefined,
      tokens: "tokens" in input.input ? input.input.tokens : undefined,
    },
    events,
  }
}

export function selectFusionEvents(
  events: InteractionEvent[],
  options: {
    startedAt?: number
    finalAt: number
    beforeMs?: number
    afterMs?: number
  }
): InteractionEvent[] {
  const windowStart = (options.startedAt ?? options.finalAt) - (options.beforeMs ?? 1500)
  const windowEnd = options.finalAt + (options.afterMs ?? 300)
  return events.filter((event) => event.timestamp >= windowStart && event.timestamp <= windowEnd)
}
