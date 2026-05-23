import type { FeedbackPhase, FeedbackRequest } from "./types"

export function createVoiceActivationSequence(targetId: string): FeedbackRequest[] {
  return [
    { targetId, source: "voice", phase: "voice-target" },
    { targetId, source: "voice", phase: "voice-press" },
  ]
}

export function isTerminalFeedbackPhase(phase: FeedbackPhase): boolean {
  return phase === "success" || phase === "error"
}
